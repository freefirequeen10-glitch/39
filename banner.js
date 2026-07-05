import { 
  db, 
  onSnapshot, 
  doc, 
  collection 
} from './firebase.js';

import { 
  setSafeSrc, 
  hideSkeleton 
} from './utils.js';

// Local slider state variables
let bannerSlides = [];
let currentSlideIndex = 0;
let slideInterval = null;
let touchStartX = 0;
let touchEndX = 0;

/**
 * Renders the sliding banner cards inside the wrapper and dots indicator panel.
 */
function renderSlider() {
  const wrapper = document.getElementById('slider-wrapper');
  const dotsContainer = document.getElementById('slider-dots');
  const emptyState = document.getElementById('slider-empty');
  const skeleton = document.getElementById('slider-skeleton');

  if (!wrapper || !dotsContainer || !emptyState) return;

  wrapper.innerHTML = '';
  dotsContainer.innerHTML = '';
  if (skeleton) skeleton.classList.add('hidden');
  emptyState.classList.add('hidden');
  clearInterval(slideInterval);

  if (bannerSlides.length === 0) {
    emptyState.classList.remove('hidden');
    return;
  }

  bannerSlides.forEach((slide, idx) => {
    const slideEl = document.createElement('div');
    slideEl.className = "w-full h-full flex-shrink-0 relative overflow-hidden";
    slideEl.innerHTML = `
      <img src="${slide.imageUrl}" alt="Arena Slide" class="w-full h-full object-cover transition-transform duration-1000 hover:scale-105 opacity-80 hover:opacity-100">
    `;
    wrapper.appendChild(slideEl);

    const dot = document.createElement('button');
    dot.className = `w-2 h-2 rounded-full transition-all duration-300 ${idx === 0 ? 'bg-[#d4af37] w-4' : 'bg-slate-600'}`;
    dot.addEventListener('click', () => {
      goToSlide(idx);
    });
    dotsContainer.appendChild(dot);
  });

  currentSlideIndex = 0;
  updateSliderPosition();
  startAutoSlide();
}

/**
 * Updates CSS translation values and sets CSS class configurations for pagination dots.
 */
function updateSliderPosition() {
  const wrapper = document.getElementById('slider-wrapper');
  if (!wrapper) return;
  wrapper.style.transform = `translateX(-${currentSlideIndex * 100}%)`;

  const dots = document.querySelectorAll('#slider-dots button');
  dots.forEach((dot, idx) => {
    if (idx === currentSlideIndex) {
      dot.className = "w-2 h-2 rounded-full transition-all duration-300 bg-[#d4af37] w-4";
    } else {
      dot.className = "w-2 h-2 rounded-full transition-all duration-300 bg-slate-600";
    }
  });
}

/**
 * Slides navigation engine controller.
 * @param {number} idx - Sliding index index target
 */
function goToSlide(idx) {
  if (idx < 0) {
    currentSlideIndex = bannerSlides.length - 1;
  } else if (idx >= bannerSlides.length) {
    currentSlideIndex = 0;
  } else {
    currentSlideIndex = idx;
  }
  updateSliderPosition();
  startAutoSlide();
}

/**
 * Triggers automated timing translation loops.
 */
function startAutoSlide() {
  clearInterval(slideInterval);
  if (bannerSlides.length > 1) {
    slideInterval = setInterval(() => {
      currentSlideIndex = (currentSlideIndex + 1) % bannerSlides.length;
      updateSliderPosition();
    }, 4000);
  }
}

/**
 * Initializes physical swipe gesture touch trackers on sliding containers.
 */
export const initSwipeListeners = () => {
  const container = document.getElementById('banner-slider-container');
  if (container && !container.dataset.swipeBound) {
    container.dataset.swipeBound = "true";
    container.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    container.addEventListener('touchend', (e) => {
      touchEndX = e.changedTouches[0].screenX;
      const threshold = 50;
      if (touchStartX - touchEndX > threshold) {
        goToSlide(currentSlideIndex + 1);
      } else if (touchEndX - touchStartX > threshold) {
        goToSlide(currentSlideIndex - 1);
      }
    }, { passive: true });
  }
};

/**
 * Sets up background streams for promotional category banners and sliders.
 */
export function initBannersSync() {
  // 1. Solo, Duo, and Squad category headers snapshot listeners
  //    Each lives as its own document inside the "sliderImages" collection.
  //    Falls back to the "url" field if "imageUrl" is missing.
  onSnapshot(doc(db, "sliderImages", "soloBanner"), (snap) => {
    if (snap.exists()) {
      const d = snap.data();
      const src = d.imageUrl || d.url;
      setSafeSrc('banner-solo', src);
      hideSkeleton('banner-solo-skeleton');
    }
  });

  onSnapshot(doc(db, "sliderImages", "duoBanner"), (snap) => {
    if (snap.exists()) {
      const d = snap.data();
      const src = d.imageUrl || d.url;
      setSafeSrc('banner-duo', src);
      hideSkeleton('banner-duo-skeleton');
    }
  });

  onSnapshot(doc(db, "sliderImages", "squadBanner"), (snap) => {
    if (snap.exists()) {
      const d = snap.data();
      const src = d.imageUrl || d.url;
      setSafeSrc('banner-squad', src);
      hideSkeleton('banner-squad-skeleton');
    }
  });

  // 2. Carousel promotions snapshot listener.
  //    The slider images (slider1..slider5) live in the same "sliderImages"
  //    collection alongside the category banner docs, so we filter by doc ID.
  //    Falls back to the "url" field if "imageUrl" is missing.
  onSnapshot(collection(db, "sliderImages"), (snap) => {
    const slides = [];
    snap.forEach(d => {
      if (d.id.startsWith('slider')) {
        const val = d.data();
        const src = val.imageUrl || val.url;
        if (src) {
          slides.push({ id: d.id, imageUrl: src });
        }
      }
    });

    // Chronological order verification mapping (slider1, slider2, ... slider5)
    slides.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

    bannerSlides = slides.slice(0, 5);
    renderSlider();
  });
}