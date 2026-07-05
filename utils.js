export function setSafeText(id, val) {
  const el = document.getElementById(id);
  if (el) el.innerText = val;
}

export function setSafeSrc(id, src) {
  const el = document.getElementById(id);
  if (el) {
    if (src) {
      el.setAttribute("src", src);
      el.src = src;
      el.removeAttribute("hidden");
      el.classList.remove("hidden");
      el.style.display = "block";
    } else {
      el.classList.add('hidden');
    }
  }
}

export function hideSkeleton(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('hidden');
}

export function handleFirebaseError(err) {
  console.error("Firebase system error details:", err);
  let msg = err.message || "An error occurred.";
  if (err.code === "auth/email-already-in-use") msg = "Email is already registered.";
  if (err.code === "auth/user-not-found" || err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") msg = "Incorrect credentials.";
  return msg;
}

export function showToast(message, type = "info") {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');

  const stylesMap = {
    success: "bg-emerald-950/95 border-emerald-500 text-emerald-200 shadow-[0_0_20px_rgba(16,185,129,0.25)]",
    error: "bg-rose-950/95 border-rose-500 text-rose-200 shadow-[0_0_20px_rgba(244,63,94,0.25)]",
    info: "bg-purple-950/95 border-gold text-slate-200 shadow-[0_0_20px_rgba(212,175,55,0.2)]"
  };
  const iconsMap = { success: "fa-circle-check", error: "fa-triangle-exclamation", info: "fa-circle-info" };

  toast.className = `px-6 py-4 rounded-2xl flex items-center gap-3.5 border-l-4 transition-all duration-300 transform translate-x-12 opacity-0 pointer-events-auto text-xs font-grotesk font-semibold ${stylesMap[type] || stylesMap.info}`;
  toast.innerHTML = `<i class="fa-solid ${iconsMap[type] || iconsMap.info} text-base animate-pulse"></i><div class="leading-relaxed">${message}</div>`;

  container.appendChild(toast);
  setTimeout(() => toast.classList.remove('translate-x-12', 'opacity-0'), 20);
  setTimeout(() => {
    toast.classList.add('translate-x-12', 'opacity-0');
    setTimeout(() => toast.remove(), 400);
  }, 4000);
}
window.showToast = showToast;

export function toggleDrawer(open) {
  const drawer = document.getElementById('drawer');
  const overlay = document.getElementById('drawer-overlay');
  if (!drawer || !overlay) return;

  requestAnimationFrame(() => {
    if (open) {
      drawer.classList.remove('-translate-x-full');
      overlay.classList.remove('pointer-events-none', 'opacity-0');
    } else {
      drawer.classList.add('-translate-x-full');
      overlay.classList.add('pointer-events-none', 'opacity-0');
    }
  });
}
window.toggleDrawer = toggleDrawer;

export function copyToClipboard(elementId) {
  const target = document.getElementById(elementId);
  if (!target) return;
  const text = target.innerText;
  navigator.clipboard.writeText(text);
  showToast("Copied to clipboard!", "success");
}
window.copyToClipboard = copyToClipboard;