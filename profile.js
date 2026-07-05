import { 
  db, 
  storage, 
  onSnapshot, 
  doc, 
  updateDoc, 
  ref, 
  uploadBytes, 
  getDownloadURL, 
  serverTimestamp 
} from './firebase.js';

import { 
  currentUserDoc, 
  setCurrentUserDoc 
} from './auth.js';

import { 
  showToast, 
  setSafeText, 
  setSafeSrc 
} from './utils.js';

/**
 * Updates UI elements with real-time profile data, rank badge, and verified badge.
 */
export function updateProfileUI() {
  if (!currentUserDoc) return;

  // Real-time Balance sync across panels (Profile context)
  const balanceVal = parseFloat(currentUserDoc.wallet || 0).toFixed(2);
  setSafeText('header-wallet', `₹${balanceVal}`);
  setSafeText('home-card-balance', `₹${balanceVal}`);
  setSafeText('wallet-main-balance', `₹${balanceVal}`);

  // Profile Specific Fields
  setSafeText('home-card-username', currentUserDoc.username || 'Player');
  setSafeText('home-card-uid', (currentUserDoc.uid || '').substring(0, 8).toUpperCase());
  setSafeText('profile-name', currentUserDoc.username || 'Player');
  setSafeText('profile-uid', currentUserDoc.uid || '');

  // Avatar Image Sync (Defaulting dynamically to Dicebear Adventurer API on fallback)
  const defaultAvatar = `https://api.dicebear.com/7.x/adventurer/svg?seed=${currentUserDoc.uid}`;
  const avatarUrl = currentUserDoc.photoURL || currentUserDoc.profileImage || defaultAvatar;
  
  setSafeSrc('home-card-avatar', avatarUrl);
  setSafeSrc('header-avatar', avatarUrl);
  setSafeSrc('profile-edit-avatar', avatarUrl);

  const emailField = document.getElementById('prof-email');
  const phoneField = document.getElementById('prof-phone');
  
  if (emailField) emailField.value = currentUserDoc.email || "";
  if (phoneField) phoneField.value = currentUserDoc.phone || "";

  // Premium Verification Shield Rendering
  const verifiedBadge = document.getElementById('verified-badge-icon');
  if (verifiedBadge) {
    if (currentUserDoc.verified === true || String(currentUserDoc.verified) === 'true') {
      verifiedBadge.classList.remove('hidden');
    } else {
      verifiedBadge.classList.add('hidden');
    }
  }

  // Rank Badge Styling & Border Glowing Sync
  const badgeContainer = document.getElementById('home-card-badge-container');
  if (badgeContainer) {
    const rank = currentUserDoc.rank || 'Bronze';
    badgeContainer.classList.remove('hidden');

    const nameEl = document.getElementById('home-card-badge-name');
    if (nameEl) nameEl.innerText = rank.toUpperCase();

    // Map tier classes to exact color codes
    let rankColor = '#d4af37'; // Bronze/Gold default
    if (rank.toLowerCase() === 'silver') rankColor = '#C0C0C0';
    if (rank.toLowerCase() === 'diamond') rankColor = '#b9f2ff';
    if (rank.toLowerCase() === 'conqueror') rankColor = '#ff4d4d';

    const iconEl = document.getElementById('home-card-badge-icon');
    if (iconEl) iconEl.style.color = rankColor;

    badgeContainer.style.borderColor = rankColor + '60';
    badgeContainer.style.boxShadow = `0 0 15px ${rankColor}30`;
  }
}

/**
 * Registers real-time listener to sync the current user's document in Firestore.
 * @param {string} uid - User identifier
 */
export function initProfileSync(uid) {
  onSnapshot(doc(db, "users", uid), (snap) => {
    if (snap.exists()) {
      const data = snap.data();
      // Unify balance values internally
      data.wallet = parseFloat(data.walletBalance || data.wallet || 0);

      console.log("==================================================");
      console.log("[Realtime Sync] Current UID:", uid);
      console.log("[Realtime Sync] Firestore Document Path: users/" + uid);
      console.log("[Realtime Sync] Wallet Balance:", data.wallet);
      console.log("[Realtime Sync] Verified Status:", data.verified);
      console.log("[Realtime Sync] Rank:", data.rank);
      console.log("[Realtime Sync] Snapshot Updated:", new Date().toISOString());
      console.log("==================================================");

      // Re-initialize core local cache state
      setCurrentUserDoc(data);
      updateProfileUI();
    } else {
      console.warn("[Realtime Sync] Document missing for UID:", uid);
    }
  });
}

// --- DOM FORM ACTIONS EVENT REGISTRATIONS ---

// Profile Update Event
const profileFormEl = document.getElementById('profile-form');
if (profileFormEl) {
  profileFormEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUserDoc) return;

    try {
      const phoneInput = document.getElementById('prof-phone');
      const updatedPhone = phoneInput ? phoneInput.value.trim() : "";

      await updateDoc(doc(db, "users", currentUserDoc.uid), {
        phone: updatedPhone,
        updatedAt: serverTimestamp()
      });
      showToast("Profile Updated!", "success");
    } catch (err) {
      showToast(err.message, "error");
    }
  });
}

// Profile Avatar File Selection Event
const avatarInputEl = document.getElementById('profile-file');
if (avatarInputEl) {
  avatarInputEl.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file || !currentUserDoc) return;

    try {
      showToast("Uploading Image...", "info");
      
      const storageRef = ref(storage, `avatars/${currentUserDoc.uid}`);
      const uploadSnap = await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(uploadSnap.ref);

      await updateDoc(doc(db, "users", currentUserDoc.uid), {
        photoURL: downloadUrl,
        profileImage: downloadUrl,
        updatedAt: serverTimestamp()
      });
      
      showToast("Photo Updated!", "success");
    } catch (err) {
      showToast(err.message, "error");
    }
  });
}