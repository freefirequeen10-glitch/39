import { 
  auth, 
  db, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged, 
  sendPasswordResetEmail,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  serverTimestamp
} from './firebase.js';

import { 
  showToast, 
  handleFirebaseError 
} from './utils.js';

export let currentUserDoc = null;
let listenersInitialized = false;
let presenceEventsBound = false;
let currentPresenceUid = null;
let heartbeatInterval = null;

export function setCurrentUserDoc(docData) {
  currentUserDoc = docData;
  window.currentUserDoc = docData;
}

window.toggleAuthForms = function(view) {
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  const forgotForm = document.getElementById('forgot-form');

  if (loginForm) loginForm.classList.add('hidden');
  if (signupForm) signupForm.classList.add('hidden');
  if (forgotForm) forgotForm.classList.add('hidden');

  if (view === 'login' && loginForm) loginForm.classList.remove('hidden');
  if (view === 'signup' && signupForm) signupForm.classList.remove('hidden');
  if (view === 'forgot' && forgotForm) forgotForm.classList.remove('hidden');
};

if (!window.switchView) {
  window.switchView = function(viewId, param = null) {
    const panels = document.querySelectorAll('.view-panel');
    panels.forEach(v => v.classList.add('hidden'));
    const active = document.getElementById('view-' + viewId);
    if (active) active.classList.remove('hidden');
    
    const navButtons = document.querySelectorAll('.nav-mobile-btn');
    navButtons.forEach(btn => btn.classList.remove('text-gold'));
    const indexMap = { 'home': 0, 'matches': 1, 'my-matches': 2, 'wallet': 3, 'profile': 4 };
    if (indexMap[viewId] !== undefined && navButtons[indexMap[viewId]]) {
      navButtons[indexMap[viewId]].classList.add('text-gold');
    }
    
    const drawer = document.getElementById('drawer');
    const overlay = document.getElementById('drawer-overlay');
    if (drawer && overlay) {
      drawer.classList.add('-translate-x-full');
      overlay.classList.add('pointer-events-none', 'opacity-0');
    }
  };
}

function fallbackUpdateProfileUI(userData) {
  const bal = parseFloat(userData.walletBalance || userData.wallet || 0).toFixed(2);
  const headerWallet = document.getElementById('header-wallet');
  if (headerWallet) headerWallet.innerText = `₹${bal}`;
  
  const homeCardBalance = document.getElementById('home-card-balance');
  if (homeCardBalance) homeCardBalance.innerText = `₹${bal}`;
  
  const walletMainBalance = document.getElementById('wallet-main-balance');
  if (walletMainBalance) walletMainBalance.innerText = `₹${bal}`;

  const homeCardUsername = document.getElementById('home-card-username');
  if (homeCardUsername) homeCardUsername.innerText = userData.username || 'Player';

  const homeCardUid = document.getElementById('home-card-uid');
  if (homeCardUid) homeCardUid.innerText = (userData.uid || '').substring(0, 8).toUpperCase();

  const profileName = document.getElementById('profile-name');
  if (profileName) profileName.innerText = userData.username || 'Player';

  const profileUid = document.getElementById('profile-uid');
  if (profileUid) profileUid.innerText = userData.uid || '';

  const profEmail = document.getElementById('prof-email');
  if (profEmail) profEmail.value = userData.email || "";

  const profPhone = document.getElementById('prof-phone');
  if (profPhone) profPhone.value = userData.phone || "";

  const avatarUrl = userData.photoURL || userData.profileImage || `https://api.dicebear.com/7.x/adventurer/svg?seed=${userData.uid}`;
  const elements = ['home-card-avatar', 'header-avatar', 'profile-edit-avatar'];
  elements.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.src = avatarUrl;
      el.classList.remove('hidden');
    }
  });
}

async function safeInitDataListeners(uid) {
  if (listenersInitialized) return;
  listenersInitialized = true;

  try {
    const mod = await import('./profile.js');
    mod.initProfileSync(uid);
  } catch (e) {
    console.warn("profile.js fallback:", e);
  }

  try {
    const mod = await import('./wallet.js');
    mod.initWalletSync(uid);
  } catch (e) {
    console.warn("wallet.js fallback:", e);
  }

  try {
    const mod = await import('./banner.js');
    mod.initBannersSync();
    mod.initSwipeListeners();
  } catch (e) {
    console.warn("banner.js fallback:", e);
  }

  try {
    const mod = await import('./matches.js');
    mod.initMatchesSync();
  } catch (e) {
    console.warn("matches.js fallback:", e);
  }

  try {
    const mod = await import('./history.js');
    mod.initMyMatchesSync(uid);
  } catch (e) {
    console.warn("history.js fallback:", e);
  }

  try {
    const mod = await import('./notifications.js');
    mod.initNotificationsSync(uid);
  } catch (e) {
    console.warn("notifications.js fallback:", e);
  }
}

async function updatePresence(uid, status) {
  try {
    const userRef = doc(db, "users", uid);
    await updateDoc(userRef, {
      status: status,
      lastSeen: serverTimestamp()
    });
  } catch (e) {
    console.warn("Presence sync background state update failed:", e);
  }
}

function startHeartbeat(uid) {
  clearInterval(heartbeatInterval);
  heartbeatInterval = setInterval(() => {
    if (navigator.onLine && document.visibilityState === 'visible') {
      updatePresence(uid, "online");
    }
  }, 60000);
}

function stopHeartbeat() {
  clearInterval(heartbeatInterval);
}

function setupPresenceSystem(uid) {
  if (presenceEventsBound && currentPresenceUid === uid) return;
  currentPresenceUid = uid;
  presenceEventsBound = true;

  updatePresence(uid, "online");
  startHeartbeat(uid);

  const handleOnline = () => {
    updatePresence(uid, "online");
  };

  const handleOffline = () => {
    updatePresence(uid, "offline");
  };

  const handleUnload = () => {
    updatePresence(uid, "offline");
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      updatePresence(uid, "online");
    }
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  window.addEventListener('pagehide', handleUnload);
  window.addEventListener('beforeunload', handleUnload);
  window.document.addEventListener('visibilitychange', handleVisibilityChange);

  window._presenceCleanup = () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
    window.removeEventListener('pagehide', handleUnload);
    window.removeEventListener('beforeunload', handleUnload);
    window.document.removeEventListener('visibilitychange', handleVisibilityChange);
    stopHeartbeat();
    presenceEventsBound = false;
    currentPresenceUid = null;
  };
}

const signupFormEl = document.getElementById('signup-form');
if (signupFormEl) {
  signupFormEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('signup-submit-btn');
    if (!btn) return;
    
    const span = btn.querySelector('span');
    const originalText = span ? span.innerText : "CREATE ACCOUNT";
    btn.disabled = true; 
    if (span) span.innerText = "REGISTERING...";

    const username = document.getElementById('signup-username').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const phone = document.getElementById('signup-phone').value.trim();
    const pass = document.getElementById('signup-password').value;
    const confirm = document.getElementById('signup-confirm').value;

    if (pass !== confirm) {
      showToast("Passwords mismatch!", "error");
      btn.disabled = false; 
      if (span) span.innerText = originalText;
      return;
    }

    try {
      const check = await getDocs(query(collection(db, "users"), where("username", "==", username)));
      if (!check.empty) throw new Error("Username already taken.");

      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      const payload = {
        uid: cred.user.uid, 
        username, 
        email, 
        phone,
        wallet: 0, 
        walletBalance: 0, 
        createdAt: serverTimestamp(), 
        status: "active",
        profileImage: `https://api.dicebear.com/7.x/adventurer/svg?seed=${username}`
      };
      await setDoc(doc(db, "users", cred.user.uid), payload);

      showToast("Registration Successful!", "success");
    } catch (err) {
      showToast(handleFirebaseError(err), "error");
    } finally {
      btn.disabled = false; 
      if (span) span.innerText = originalText;
    }
  });
}

const loginFormEl = document.getElementById('login-form');
if (loginFormEl) {
  loginFormEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('login-submit-btn');
    if (!btn) return;

    const span = btn.querySelector('span');
    const originalText = span ? span.innerText : "LOGIN";
    btn.disabled = true; 
    if (span) span.innerText = "UNLOCKING...";

    const ident = document.getElementById('login-identifier').value.trim();
    const pass = document.getElementById('login-password').value;

    try {
      let email = ident;
      if (/^\d+$/.test(ident)) {
        const checkPhone = await getDocs(query(collection(db, "users"), where("phone", "==", ident)));
        if (checkPhone.empty) throw new Error("Phone number not registered.");
        email = checkPhone.docs[0].data().email;
      }
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (err) {
      showToast(handleFirebaseError(err), "error");
    } finally {
      btn.disabled = false; 
      if (span) span.innerText = originalText;
    }
  });
}

const forgotFormEl = document.getElementById('forgot-form');
if (forgotFormEl) {
  forgotFormEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('forgot-submit-btn');
    if (!btn) return;

    const span = btn.querySelector('span');
    const originalText = span ? span.innerText : "SEND LINK";
    btn.disabled = true; 
    if (span) span.innerText = "SENDING...";

    const email = document.getElementById('forgot-email').value.trim();

    try {
      await sendPasswordResetEmail(auth, email);
      showToast("Recovery link sent to your email!", "success");
      window.toggleAuthForms('login');
    } catch (err) {
      showToast(handleFirebaseError(err), "error");
    } finally {
      btn.disabled = false; 
      if (span) span.innerText = originalText;
    }
  });
}

const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    if (currentUserDoc && currentUserDoc.uid) {
      const uid = currentUserDoc.uid;
      if (window._presenceCleanup) {
        window._presenceCleanup();
      }
      await updatePresence(uid, "offline");
    }
    signOut(auth).catch(err => showToast(handleFirebaseError(err), "error"));
  });
}

onAuthStateChanged(auth, async (user) => {
  const authContainer = document.getElementById('auth-container');
  const appContainer = document.getElementById('app-container');

  if (user) {
    try {
      const snap = await getDoc(doc(db, "users", user.uid));
      if (!snap.exists()) { 
        await signOut(auth); 
        return; 
      }

      const userData = snap.data();
      if (userData.status === "blocked" || userData.banned === true) {
        showToast("Account suspended.", "error");
        await signOut(auth); 
        return;
      }

      setCurrentUserDoc(userData);
      fallbackUpdateProfileUI(userData);
      setupPresenceSystem(user.uid);
      await safeInitDataListeners(user.uid);

      if (authContainer) authContainer.classList.add('hidden');
      if (appContainer) appContainer.classList.remove('hidden');
      
      window.switchView('home');
    } catch (err) {
      console.error("Session verification failure:", err);
      await signOut(auth);
    }
  } else {
    if (currentUserDoc && currentUserDoc.uid) {
      await updatePresence(currentUserDoc.uid, "offline");
    }
    if (window._presenceCleanup) {
      window._presenceCleanup();
    }
    setCurrentUserDoc(null);
    listenersInitialized = false;
    
    if (appContainer) appContainer.classList.add('hidden');
    if (authContainer) authContainer.classList.remove('hidden');
    
    window.toggleAuthForms('login');
  }
});