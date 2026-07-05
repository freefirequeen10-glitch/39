// --- START OF FILE matches.js ---

import { 
  db, 
  doc,
  collection, 
  onSnapshot,
  runTransaction,
  serverTimestamp,
  increment
} from './firebase.js';

import { 
  myParticipations, 
  renderMyMatches 
} from './history.js';

import { 
  setSafeText 
} from './utils.js';

export let allTournaments = [];
let currentMatchMode = 'All'; 
let currentMatchStatus = 'All'; 
let currentViewId = 'home';
let activeJoinTournament = null;
let activeDetailsTournamentId = null;

// Split popup states
let popupOpen = false;
let activePopupTournamentId = null;
let lastPopupOpenTime = 0;

// --- DYNAMIC CLIPBOARD UTILITY ---

window.copyValue = function(text, label) {
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    window.showToast(`✓ ${label} Copied`, "success");
  }).catch((err) => {
    console.error("Clipboard copy operation failed:", err);
  });
};

// --- WINNER SPLIT CALCULATOR & FLOATING POPUP ENGINE ---

function getWinnerSplitArray(t) {
  const prize = Number(t.winnerPrize || 0);
  const mode = (t.matchType || t.mode || 'Solo').toLowerCase();

  // Primary check on 'prizeSplit' and fallback 'winnerSplit' as populated by Firestore
  const splitData = t.prizeSplit || t.winnerSplit;
  if (splitData) {
    if (Array.isArray(splitData)) {
      return splitData.map(Number);
    }
    if (typeof splitData === 'string') {
      return splitData.split(',').map(s => Number(s.trim()));
    }
    if (typeof splitData === 'object') {
      return Object.values(splitData).map(Number);
    }
  }

  // Fallback: divide evenly based on active matching configuration rules
  let numPlayers = 1;
  if (mode === 'duo') numPlayers = 2;
  if (mode === 'squad') numPlayers = 4;

  const share = prize / numPlayers;
  return Array(numPlayers).fill(share);
}

window.showWinnerSplitPopup = function(event, tournamentId) {
  const evt = event || window.event;
  if (evt) {
    evt.stopPropagation();
    evt.stopImmediatePropagation();
    if (evt.preventDefault) evt.preventDefault();
  }

  // Toggle behavior: if the clicked tournament's popup is already open, close it.
  if (popupOpen && activePopupTournamentId === tournamentId) {
    window.closeWinnerSplitPopup();
    return;
  }

  // Close any currently open popup before opening a new one
  window.closeWinnerSplitPopup();

  const t = allTournaments.find(tourn => tourn.id === tournamentId);
  if (!t) return;

  // Create the transparent backdrop overlay to absorb clicks
  let overlay = document.getElementById('winner-split-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'winner-split-overlay';
    // Sits above everything except the popup itself (z-[100])
    overlay.className = "fixed inset-0 z-[99] bg-transparent cursor-default";
    
    // Clicking/touching the overlay closes the popup only and absorbs the input
    const dismissHandler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      window.closeWinnerSplitPopup();
    };
    overlay.addEventListener('click', dismissHandler);
    overlay.addEventListener('mousedown', dismissHandler);
    overlay.addEventListener('touchstart', (e) => {
      e.stopPropagation();
      e.stopImmediatePropagation();
    }, { passive: true });
    
    document.body.appendChild(overlay);
  }

  // Dynamically create popup container if it does not already exist
  let popup = document.getElementById('winner-split-popup');
  if (!popup) {
    popup = document.createElement('div');
    popup.id = 'winner-split-popup';
    popup.className = "fixed z-[100] hidden glass-luxury p-3.5 rounded-2xl border border-gold/30 shadow-[0_4px_25px_rgba(212,175,55,0.3)] text-xs font-grotesk w-52 transition-all duration-200 opacity-0 scale-95 pointer-events-none";
    
    const content = document.createElement('div');
    content.id = 'winner-split-content';
    content.className = 'space-y-1.5';
    popup.appendChild(content);
    
    document.body.appendChild(popup);
  }

  // Prevent event pass-through and bubbling from clicks on/inside the popup itself
  if (!popup.dataset.hasStopPropagation) {
    const stopPropagationHandler = (e) => {
      e.stopPropagation();
      e.stopImmediatePropagation();
    };
    popup.addEventListener('click', stopPropagationHandler);
    popup.addEventListener('mousedown', stopPropagationHandler);
    popup.addEventListener('touchstart', stopPropagationHandler, { passive: true });
    popup.dataset.hasStopPropagation = "true";
  }

  const content = document.getElementById('winner-split-content');
  if (!content) return;

  const totalPrize = Number(t.winnerPrize || 0);
  const mode = (t.matchType || t.mode || 'Solo').toLowerCase();
  const split = getWinnerSplitArray(t);

  let html = `
    <div class="text-center font-bold text-slate-300 border-b border-gold/10 pb-1.5 mb-1.5 uppercase tracking-wider text-[10px] font-grotesk">
      Winner Prize
    </div>
    <div class="flex justify-between font-bold text-slate-300 mb-2 font-grotesk">
      <span>Total Prize</span>
      <span class="text-yellow-400 font-mono">₹${totalPrize}</span>
    </div>
    <div class="space-y-1.5 font-grotesk">
  `;

  split.forEach((val, index) => {
    let label = `Player ${index + 1}`;
    if (mode === 'solo' || split.length === 1) {
      label = 'Player';
    }
    html += `
      <div class="flex items-center justify-between text-xs text-slate-400">
        <span>${label}</span>
        <span class="text-white font-mono font-bold">₹${val.toFixed(0)}</span>
      </div>
    `;
  });

  html += `</div>`;
  content.innerHTML = html;

  // Render popup container visible before measuring offsets
  popup.classList.remove('hidden');

  requestAnimationFrame(() => {
    const currentTarget = evt ? (evt.currentTarget || evt.target) : null;
    if (!currentTarget) return;

    const rect = currentTarget.getBoundingClientRect();
    const popupWidth = popup.offsetWidth || 208;
    const popupHeight = popup.offsetHeight || 120;

    // Viewport-relative calculation suited for fixed elements
    let left = rect.left + (rect.width - popupWidth) / 2;
    let top = rect.top - popupHeight - 8;

    if (left < 10) left = 10;
    if (left + popupWidth > window.innerWidth - 10) {
      left = window.innerWidth - popupWidth - 10;
    }
    if (top < 10) {
      top = rect.bottom + 8;
    }

    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;

    // Toggle interactive visibility and translation animations smoothly
    popup.classList.remove('opacity-0', 'scale-95', 'pointer-events-none');
    popup.classList.add('opacity-100', 'scale-100', 'pointer-events-auto');
  });

  popupOpen = true;
  activePopupTournamentId = tournamentId;
  lastPopupOpenTime = Date.now();
};

window.closeWinnerSplitPopup = function() {
  popupOpen = false;
  activePopupTournamentId = null;
  const popup = document.getElementById('winner-split-popup');
  if (popup) {
    popup.classList.add('opacity-0', 'scale-95', 'pointer-events-none');
    popup.classList.remove('opacity-100', 'scale-100', 'pointer-events-auto');
    setTimeout(() => {
      popup.classList.add('hidden');
    }, 200);
  }
  
  // Clean up the transparent overlay backdrop from the DOM
  const overlay = document.getElementById('winner-split-overlay');
  if (overlay) {
    overlay.remove();
  }
};

// --- MODAL CONTROLLERS & TRIGGER BINDINGS ---

window.openJoinModal = function(tournamentId) {
  if (!window.currentUserDoc) {
    window.showToast("Please login to join matches!", "error");
    const appContainer = document.getElementById('app-container');
    const authContainer = document.getElementById('auth-container');
    if (appContainer) appContainer.classList.add('hidden');
    if (authContainer) authContainer.classList.remove('hidden');
    window.toggleAuthForms('login');
    return;
  }

  activeJoinTournament = allTournaments.find(t => t.id === tournamentId);
  if (!activeJoinTournament) return;

  setSafeText('join-modal-tourn-name', activeJoinTournament.title);
  setSafeText('join-modal-fee', `₹${activeJoinTournament.entryFee}`);

  const gameNameInput = document.getElementById('join-gamename');
  const uidInput = document.getElementById('join-uid');

  if (gameNameInput) gameNameInput.value = "";
  if (uidInput) uidInput.value = "";

  const modal = document.getElementById('join-modal');
  if (modal) {
    modal.classList.remove('opacity-0', 'pointer-events-none');
  }
};

window.closeJoinModal = function() {
  activeJoinTournament = null;
  const modal = document.getElementById('join-modal');
  if (modal) {
    modal.classList.add('opacity-0', 'pointer-events-none');
  }
};

window.openRoomModal = function(tournamentId) {
  const tourn = allTournaments.find(t => t.id === tournamentId);
  if (!tourn) return;

  const vPanel = document.getElementById('room-content-visible');
  const hPanel = document.getElementById('room-content-hidden');

  if (!vPanel || !hPanel) return;

  const isJoined = myParticipations.some(p => p.tournamentId === tourn.id);
  const showId = isJoined && (tourn.roomIdPublished === true || String(tourn.roomIdPublished) === 'true') && tourn.roomId;
  const showPw = isJoined && (tourn.roomPasswordPublished === true || String(tourn.roomPasswordPublished) === 'true') && (tourn.roomPass || tourn.roomPassword);

  if (showId || showPw) {
    vPanel.innerHTML = `
      <p class="text-[10px] text-emerald-400 font-bold uppercase tracking-widest mb-1">Credentials Active</p>
      <div class="bg-black/60 p-4 rounded-xl border border-gold/15 space-y-3 text-left font-grotesk">
        <div class="flex justify-between items-center border-b border-gold/10 pb-2">
          <div>
            <strong class="text-white font-mono text-sm tracking-wider">ID : ${showId ? tourn.roomId : "HIDDEN 🔒"}</strong>
          </div>
          ${showId ? `<button onclick="window.copyValue('${tourn.roomId}', 'Room ID')" class="px-2.5 py-1 bg-[#d4af37]/10 hover:bg-[#d4af37] text-[#d4af37] hover:text-black rounded-lg border border-[#d4af37]/30 text-[10px] font-bold uppercase transition-all flex items-center gap-1">📋 Copy</button>` : ''}
        </div>
        <div class="flex justify-between items-center pt-1">
          <div>
            <strong class="text-white font-mono text-sm tracking-wider">PW : ${showPw ? (tourn.roomPass || tourn.roomPassword || "No Password") : "HIDDEN 🔒"}</strong>
          </div>
          ${showPw ? `<button onclick="window.copyValue('${tourn.roomPass || tourn.roomPassword || ''}', 'Password')" class="px-2.5 py-1 bg-[#d4af37]/10 hover:bg-[#d4af37] text-[#d4af37] hover:text-black rounded-lg border border-[#d4af37]/30 text-[10px] font-bold uppercase transition-all flex items-center gap-1">📋 Copy</button>` : ''}
        </div>
      </div>
    `;
    vPanel.classList.remove('hidden');
    hPanel.classList.add('hidden');
  } else {
    hPanel.innerHTML = `
      <i class="fa-solid fa-lock text-slate-500 text-3xl my-2"></i>
      <div class="flex flex-col gap-2 items-center text-xs text-slate-500 font-semibold uppercase tracking-wider py-1 font-mono">
        <span class="bg-black/40 px-2.5 py-1 rounded border border-purple-500/5">ID : HIDDEN 🔒</span>
        <span class="bg-black/40 px-2.5 py-1 rounded border border-purple-500/5">PW : HIDDEN 🔒</span>
      </div>
      <p class="text-xs text-slate-400 font-medium mt-2">Room ID and Password will be displayed here once enabled by the Admin before the match starts.</p>
    `;
    vPanel.classList.add('hidden');
    hPanel.classList.remove('hidden');
  }

  const modal = document.getElementById('room-details-modal');
  if (modal) {
    modal.classList.remove('opacity-0', 'pointer-events-none');
  }
};

window.closeRoomModal = function() {
  const modal = document.getElementById('room-details-modal');
  if (modal) {
    modal.classList.add('opacity-0', 'pointer-events-none');
  }
};

const joinFormEl = document.getElementById('join-form');
if (joinFormEl) {
  joinFormEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!activeJoinTournament || !window.currentUserDoc) return;

    const btn = document.getElementById('join-confirm-btn');
    if (!btn) return;

    btn.disabled = true;
    btn.innerText = "Processing...";

    const gameNameInput = document.getElementById('join-gamename');
    const uidInput = document.getElementById('join-uid');

    const gameName = gameNameInput ? gameNameInput.value.trim() : "";
    const bgmiUid = uidInput ? uidInput.value.trim() : "";

    if (!/^\d+$/.test(bgmiUid)) {
      window.showToast("UID must contain only numbers.", "error");
      btn.disabled = false;
      btn.innerText = "Confirm Join";
      return;
    }

    const fee = Number(activeJoinTournament.entryFee);

    try {
      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, "users", window.currentUserDoc.uid);
        const tournRef = doc(db, "tournaments", activeJoinTournament.id);

        const userSnap = await transaction.get(userRef);
        const tournSnap = await transaction.get(tournRef);

        if (!userSnap.exists() || !tournSnap.exists()) {
          throw new Error("Data sync error. Refetching references.");
        }

        const u = userSnap.data();
        const t = tournSnap.data();

        const currentBalance = parseFloat(u.walletBalance || u.wallet || 0);

        if (currentBalance < fee) {
          throw new Error("Insufficient wallet balance.");
        }

        const max = Number(t.maxPlayers) || 100;
        const joinedCount = Number(t.joinedCount) || 0;
        if (joinedCount >= max) {
          throw new Error("Match slots are full.");
        }

        const participantId = `${activeJoinTournament.id}_${u.uid}`;
        const partRef = doc(db, "matchParticipants", participantId);
        const partSnap = await transaction.get(partRef);

        if (partSnap.exists()) {
          throw new Error("You are already registered.");
        }

        const nextBalance = currentBalance - fee;

        transaction.update(userRef, {
          wallet: nextBalance,
          walletBalance: nextBalance
        });

        transaction.update(tournRef, { joinedCount: increment(1) });

        const txnRef = doc(collection(db, "walletTransactions"));
        transaction.set(txnRef, {
          userId: u.uid,
          type: "match_entry",
          amount: -fee,
          reason: `Joined: ${t.title}`,
          timestamp: serverTimestamp()
        });

        transaction.set(partRef, {
          userId: u.uid,
          userName: u.username,
          email: u.email,
          profilePhoto: u.profileImage || "",
          gameName: gameName,
          bgmiUid: bgmiUid,
          tournamentId: activeJoinTournament.id,
          tournamentName: t.title,
          mode: t.mode || "Solo",
          entryFee: fee,
          date: t.date || "",
          time: t.time || "",
          joinedAt: serverTimestamp(),
          status: "upcoming"
        });
      });

      window.showToast("Successfully joined the battle!", "success");
      window.closeJoinModal();
      window.switchView('my-matches');
    } catch (err) {
      window.showToast(err.message, "error");
      console.error("Match join failure:", err);
    } finally {
      btn.disabled = false;
      btn.innerText = "Confirm Join";
    }
  });
}

// --- POPUP DETAILS ENGINE RENDERING ---

export function updateMatchDetailsModalContent(tournamentId) {
  const t = allTournaments.find(tourn => tourn.id === tournamentId);
  if (!t) return;

  const DEFAULT_BANNER = "https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1200&auto=format&fit=crop";
  const bannerSrc = (t.banner && t.banner.trim() !== '') ? t.banner : DEFAULT_BANNER;

  setSafeText('md-popup-title', t.title);
  setSafeText('md-popup-mode', t.matchType || t.mode || "Solo");
  setSafeText('md-popup-map', t.map || "ERANGEL");
  setSafeText('md-popup-date', t.date || "—");
  setSafeText('md-popup-time', t.time || "—");
  setSafeText('md-popup-prize', `₹${t.prizePool || 0}`);
  setSafeText('md-popup-perkill', `₹${t.perKill || 0}`);
  setSafeText('md-popup-fee', `₹${t.entryFee || 0}`);

  const winnersEl = document.getElementById('md-popup-winners');
  if (winnersEl) {
    winnersEl.innerHTML = `₹${t.winnerPrize || 0} <i class="fa-solid fa-circle-info text-[10px] opacity-75"></i>`;
  }

  const winnersBtn = document.getElementById('md-popup-winners-btn');
  if (winnersBtn) {
    // Reattach new event listener programmatically by replacing with fresh clone
    const newBtn = winnersBtn.cloneNode(true);
    if (winnersBtn.parentNode) {
      winnersBtn.parentNode.replaceChild(newBtn, winnersBtn);
    }
    newBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      console.log("Winner popup clicked from details modal", t.id);
      window.showWinnerSplitPopup(e, t.id);
    });
  }

  const imgEl = document.getElementById('md-popup-banner');
  if (imgEl) imgEl.src = bannerSrc;

  const descSec = document.getElementById('md-popup-desc-sec');
  const descEl = document.getElementById('md-popup-description');
  const descriptionText = t.description || t.mapDescription || '';
  if (descSec && descEl) {
    if (descriptionText.trim() !== '') {
      descSec.classList.remove('hidden');
      descEl.innerText = descriptionText;
    } else {
      descSec.classList.add('hidden');
    }
  }

  const rulesSec = document.getElementById('md-popup-rules-sec');
  const rulesEl = document.getElementById('md-popup-rules');
  const rulesText = t.rules || t.matchRules || '';
  if (rulesSec && rulesEl) {
    if (rulesText.trim() !== '') {
      rulesSec.classList.remove('hidden');
      rulesEl.innerText = rulesText;
    } else {
      rulesSec.classList.add('hidden');
    }
  }

  const isJoined = myParticipations.some(p => p.tournamentId === t.id);

  // Dynamic Room Access UI Block - Live Sync compatible & secured
  const roomSec = document.getElementById('md-popup-room-sec');
  if (roomSec) {
    let statusLabel = '';
    let statusCls = '';
    let bodyHtml = '';
    const showId = isJoined && (t.roomIdPublished === true || String(t.roomIdPublished) === 'true') && t.roomId;
    const showPw = isJoined && (t.roomPasswordPublished === true || String(t.roomPasswordPublished) === 'true') && (t.roomPass || t.roomPassword);

    if (showId || showPw) {
      statusLabel = "Released";
      statusCls = "bg-emerald-500/10 border border-emerald-500 text-emerald-400";
      bodyHtml = `
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
          <div class="bg-purple-950/40 p-3 rounded-xl border border-purple-500/15 flex justify-between items-center font-grotesk">
            <span class="text-white font-mono text-sm tracking-wider">ID : ${showId ? t.roomId : "HIDDEN 🔒"}</span>
            ${showId ? `<button onclick="window.copyValue('${t.roomId}', 'Room ID')" class="px-2.5 py-1 bg-[#d4af37]/10 hover:bg-[#d4af37] text-[#d4af37] hover:text-black rounded-lg border border-[#d4af37]/30 text-[10px] font-bold uppercase transition-all flex items-center gap-1">📋 Copy</button>` : ''}
          </div>
          <div class="bg-purple-950/40 p-3 rounded-xl border border-purple-500/15 flex justify-between items-center font-grotesk">
            <span class="text-white font-mono text-sm tracking-wider">PW : ${showPw ? (t.roomPass || t.roomPassword || "No Password") : "HIDDEN 🔒"}</span>
            ${showPw ? `<button onclick="window.copyValue('${t.roomPass || t.roomPassword || ''}', 'Password')" class="px-2.5 py-1 bg-[#d4af37]/10 hover:bg-[#d4af37] text-[#d4af37] hover:text-black rounded-lg border border-[#d4af37]/30 text-[10px] font-bold uppercase transition-all flex items-center gap-1">📋 Copy</button>` : ''}
          </div>
        </div>
      `;
    } else if (isJoined) {
      statusLabel = "Awaiting";
      statusCls = "bg-yellow-500/10 border border-yellow-500 text-yellow-400 animate-pulse";
      bodyHtml = `
        <div class="space-y-3 pt-1 text-center font-grotesk">
          <div class="flex justify-center gap-4 text-xs text-slate-500 font-semibold uppercase tracking-wider py-1 font-mono">
            <span class="bg-black/40 px-2.5 py-1 rounded border border-purple-500/5">ID : HIDDEN 🔒</span>
            <span class="bg-black/40 px-2.5 py-1 rounded border border-purple-500/5">PW : HIDDEN 🔒</span>
          </div>
          <p class="text-xs text-slate-400 italic">Room ID & Password will be displayed here once enabled by the Admin before the match starts.</p>
        </div>
      `;
    } else {
      statusLabel = "Locked";
      statusCls = "bg-red-500/10 border border-red-500 text-red-400";
      bodyHtml = `
        <div class="space-y-3 pt-1 text-center font-grotesk">
          <div class="flex justify-center gap-4 text-xs text-slate-500 font-semibold uppercase tracking-wider py-1 font-mono">
            <span class="bg-black/40 px-2.5 py-1 rounded border border-purple-500/5">ID : HIDDEN 🔒</span>
            <span class="bg-black/40 px-2.5 py-1 rounded border border-purple-500/5">PW : HIDDEN 🔒</span>
          </div>
          <p class="text-xs text-slate-400 italic">Unlock Room credentials after joining this match roster.</p>
        </div>
      `;
    }

    roomSec.innerHTML = `
      <h5 class="text-xs font-bold uppercase text-purple-300 tracking-widest flex items-center justify-between border-b border-purple-500/10 pb-2">
        <span><i class="fa-solid fa-key mr-1.5 text-gold"></i> Room Credentials</span>
        <span class="text-[9px] px-2 py-0.5 rounded font-black ${statusCls}">${statusLabel}</span>
      </h5>
      ${bodyHtml}
    `;
  }

  // Join Action Button config injection inside popup
  const btnContainer = document.getElementById('md-popup-join-btn-container');
  if (btnContainer) {
    const max = Number(t.maxPlayers) || 100;
    const joined = Number(t.joinedCount) || 0;
    const remaining = Math.max(0, max - joined);
    const status = (t.status || 'upcoming').toLowerCase();

    let btnHtml = '';
    if (isJoined) {
      btnHtml = `
        <button disabled class="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-rajdhani font-black rounded-xl text-sm uppercase tracking-wider cursor-not-allowed shadow-[0_0_15px_rgba(16,185,129,0.3)]">
          JOINED ✓
        </button>
      `;
    } else if (status === 'completed') {
      btnHtml = `
        <button disabled class="w-full py-3 bg-neutral-800 text-neutral-500 border border-neutral-700/30 font-rajdhani font-black rounded-xl text-sm uppercase tracking-wider cursor-not-allowed">
          MATCH COMPLETED
        </button>
      `;
    } else if (status === 'cancelled') {
      btnHtml = `
        <button disabled class="w-full py-3 bg-red-950/40 text-red-400 border border-red-900/30 font-rajdhani font-black rounded-xl text-sm uppercase tracking-wider cursor-not-allowed">
          MATCH CANCELLED
        </button>
      `;
    } else if (remaining <= 0) {
      btnHtml = `
        <button disabled class="w-full py-3 bg-neutral-900 text-neutral-600 border border-neutral-800 font-rajdhani font-black rounded-xl text-sm uppercase tracking-wider cursor-not-allowed">
          SLOTS FULL
        </button>
      `;
    } else {
      btnHtml = `
        <button onclick="window.closeMatchDetailsModal(); window.openJoinModal('${t.id}')" class="w-full py-3 bg-gradient-to-r from-gold via-gold-light to-gold-dark text-black font-rajdhani font-black rounded-xl text-sm uppercase tracking-wider hover:shadow-[0_0_20px_rgba(212,175,55,0.45)] transition-all">
          <i class="fa-solid fa-bolt mr-1"></i> JOIN — ₹${t.entryFee}
        </button>
      `;
    }
    btnContainer.innerHTML = btnHtml;
  }
}

window.openMatchDetailsModal = function(tournamentId) {
  activeDetailsTournamentId = tournamentId;
  window.activeDetailsTournamentId = tournamentId;
  const modal = document.getElementById('match-details-modal');
  if (!modal) return;

  updateMatchDetailsModalContent(tournamentId);

  modal.classList.add('modal-active');
  modal.classList.remove('opacity-0', 'pointer-events-none');
};

window.closeMatchDetailsModal = function() {
  activeDetailsTournamentId = null;
  window.activeDetailsTournamentId = null;
  const modal = document.getElementById('match-details-modal');
  if (modal) {
    modal.classList.remove('modal-active');
    modal.classList.add('opacity-0', 'pointer-events-none');
  }
};

// --- CORE BATTLES FEED RENDERING ---

export function renderMatches() {
  const feed = document.getElementById('matches-feed');
  if (!feed) return;
  
  feed.innerHTML = '';

  const heroCount = document.getElementById('hero-total-count');

  let filtered = allTournaments;
  if (currentMatchMode !== 'All') {
    filtered = filtered.filter(t => (t.matchType || t.mode || 'Solo') === currentMatchMode);
  }
  if (currentMatchStatus !== 'All') {
    filtered = filtered.filter(t => (t.status || 'upcoming').toLowerCase() === currentMatchStatus.toLowerCase());
  }

  if (heroCount) {
    heroCount.innerText = `${filtered.length} Match${filtered.length !== 1 ? 'es' : ''}`;
  }

  if (filtered.length === 0) {
    feed.innerHTML = `
      <div class="col-span-1 md:col-span-2 flex flex-col items-center justify-center gap-3 p-12 bg-black/40 border border-purple-500/15 rounded-[24px]">
        <i class="fa-solid fa-shield-slash text-purple-400 text-3xl opacity-60"></i>
        <span class="text-sm font-semibold text-slate-400 uppercase font-grotesk tracking-widest">No Matches Live</span>
      </div>
    `;
    return;
  }

  const DEFAULT_BANNER = "https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1200&auto=format&fit=crop";

  filtered.forEach(t => {
    const max = Number(t.maxPlayers) || 100;
    const joined = Number(t.joinedCount) || 0;
    const remaining = Math.max(0, max - joined);
    const progress = Math.min(100, Math.round((joined / max) * 100));
    const status = (t.status || 'upcoming').toLowerCase();
    const mode = (t.matchType || t.mode || 'Solo');
    const mapName = (t.map || 'ERANGEL');
    const winnerPrize = t.winnerPrize || 0;

    const isJoined = myParticipations.some(p => p.tournamentId === t.id);
    const bannerSrc = (t.banner && t.banner.trim() !== '') ? t.banner : DEFAULT_BANNER;

    const statusCfg = {
      live: { 
        cls: 'badge-live', 
        icon: 'fa-circle', 
        label: 'LIVE', 
        dotHtml: '<span class="live-dot" style="width:6px;height:6px;margin-right:2px;"></span>' 
      },
      upcoming: { 
        cls: 'badge-upcoming', 
        icon: 'fa-clock', 
        label: 'UPCOMING', 
        dotHtml: '' 
      },
      completed: { 
        cls: 'badge-completed', 
        icon: 'fa-circle-check', 
        label: 'COMPLETED', 
        dotHtml: '' 
      },
      cancelled: { 
        cls: 'badge-cancelled', 
        icon: 'fa-ban', 
        label: 'CANCELLED', 
        dotHtml: '' 
      },
    };
    
    const sc = statusCfg[status] || statusCfg.upcoming;

    const modeBg = { Solo: '#b8921e', Duo: '#ea580c', Squad: '#e11d48' };
    const modeColor = { Solo: '#120524', Duo: '#ffffff', Squad: '#ffffff' };

    let roomCredsHTML = '';
    const showId = isJoined && (t.roomIdPublished === true || String(t.roomIdPublished) === 'true') && t.roomId;
    const showPw = isJoined && (t.roomPasswordPublished === true || String(t.roomPasswordPublished) === 'true') && (t.roomPass || t.roomPassword);
    const displayId = showId ? t.roomId : "HIDDEN 🔒";
    const displayPw = showPw ? (t.roomPass || t.roomPassword || "No Password") : "HIDDEN 🔒";

    if (isJoined) {
      roomCredsHTML = `
        <div class="flex items-center gap-2 text-white">
          <span class="bg-purple-950/60 px-1.5 py-0.5 rounded text-[10px] font-mono border border-purple-500/20 flex items-center gap-1">
            ID : ${displayId} 
            ${showId ? `<i class="fa-regular fa-copy cursor-pointer text-gold hover:text-white transition-colors ml-0.5" onclick="event.stopPropagation(); window.copyValue('${t.roomId}', 'Room ID')"></i>` : ''}
          </span>
          <span class="bg-purple-950/60 px-1.5 py-0.5 rounded text-[10px] font-mono border border-purple-500/20 flex items-center gap-1">
            PW : ${displayPw} 
            ${showPw ? `<i class="fa-regular fa-copy cursor-pointer text-gold hover:text-white transition-colors ml-0.5" onclick="event.stopPropagation(); window.copyValue('${t.roomPass || t.roomPassword || ''}', 'Password')"></i>` : ''}
          </span>
        </div>
      `;
    } else {
      roomCredsHTML = `
        <div class="flex items-center gap-2 text-slate-500 text-[10px] font-mono font-bold">
          <span class="bg-black/40 px-1.5 py-0.5 rounded border border-purple-500/5">ID : HIDDEN 🔒</span>
          <span class="bg-black/40 px-1.5 py-0.5 rounded border border-purple-500/5">PW : HIDDEN 🔒</span>
        </div>
      `;
    }

    let actionButtonHTML = '';
    if (isJoined) {
      actionButtonHTML = `
        <button disabled class="btn-join bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-[0_0_15px_rgba(16,185,129,0.3)]">
          JOINED ✓
        </button>
      `;
    } else if (status === 'completed') {
      actionButtonHTML = `
        <button disabled class="btn-join bg-neutral-800 text-neutral-500 border border-neutral-700/30 cursor-not-allowed text-xs">
          MATCH COMPLETED
        </button>
      `;
    } else if (status === 'cancelled') {
      actionButtonHTML = `
        <button disabled class="btn-join bg-red-950/40 text-red-400 border border-red-900/30 cursor-not-allowed text-xs">
          MATCH CANCELLED
        </button>
      `;
    } else if (remaining <= 0) {
      actionButtonHTML = `
        <button disabled class="btn-join bg-neutral-900 text-neutral-600 border border-neutral-800 cursor-not-allowed">
          SLOTS FULL
        </button>
      `;
    } else if (status === 'live') {
      actionButtonHTML = `
        <button class="btn-join join-btn-click bg-gradient-to-r from-green-600 to-emerald-500 hover:shadow-[0_0_20px_rgba(16,185,129,0.4)] text-white font-rajdhani font-black">
          <span class="live-dot" style="width:7px;height:7px;"></span> JOIN MATCH — ₹${t.entryFee}
        </button>
      `;
    } else {
      actionButtonHTML = `
        <button class="btn-join join-btn-click bg-gradient-to-r from-gold via-gold-light to-gold-dark text-[#0f041e] hover:shadow-[0_0_20px_rgba(212,175,55,0.4)] font-rajdhani font-black">
          <i class="fa-solid fa-bolt text-xs"></i> JOIN MATCH — ₹${t.entryFee}
        </button>
      `;
    }

    const card = document.createElement('div');
    card.className = 'match-card-premium cursor-pointer transform hover:-translate-y-1.5 transition-all duration-300';
    card.innerHTML = `
      <div class="match-card-banner relative h-[115px] overflow-hidden flex-shrink-0 bg-cyber-velvet">
        <div class="banner-skeleton" id="bsk-${t.id}"></div>
        <img
          src="${bannerSrc}"
          alt="${t.title}"
          loading="lazy"
          class="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
          style="opacity: 1 !important; filter: none !important;"
          onload="const sk=document.getElementById('bsk-${t.id}'); if(sk) sk.style.display='none';"
          onerror="this.src='${DEFAULT_BANNER}'; const sk=document.getElementById('bsk-${t.id}'); if(sk) sk.style.display='none';"
        >
        
        <div class="absolute inset-x-0 top-0 p-3 flex justify-between items-start z-20">
          <span class="mode-badge inline-block px-2.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider font-rajdhani" style="background:${modeBg[mode] || modeBg.Solo}; color:${modeColor[mode] || modeColor.Solo}; position: static; box-shadow: none;">
            ${mode}
          </span>
          <span class="status-badge ${sc.cls}" style="position: static; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); padding: 3px 8px; font-size: 8px;">
            ${sc.dotHtml}
            <i class="fa-solid ${sc.icon}"></i>
            ${sc.label}
          </span>
        </div>
      </div>

      <div class="match-card-body p-3.5 flex-1 flex flex-col justify-between gap-2.5">
        <!-- Match Name -->
        <div>
          <h4 class="font-rajdhani font-black text-lg sm:text-xl tracking-wider text-white uppercase truncate drop-shadow-md leading-tight">${t.title}</h4>
        </div>

        <!-- Date | Map | Time Row -->
        <div class="text-[10px] text-slate-300 font-grotesk tracking-wider uppercase bg-black/40 py-1.5 px-2.5 border border-purple-500/10 rounded-xl flex items-center justify-between gap-1">
          <span class="flex items-center gap-1"><i class="fa-solid fa-calendar-days text-gold text-[9px]"></i>${t.date || '—'}</span>
          <span class="text-purple-500/20">|</span>
          <span class="flex items-center gap-1"><i class="fa-solid fa-map text-gold text-[9px]"></i>${mapName}</span>
          <span class="text-purple-500/20">|</span>
          <span class="flex items-center gap-1"><i class="fa-solid fa-clock text-gold text-[9px]"></i>${t.time || '—'}</span>
        </div>

        <!-- Stats Grid (Prize Pool, Per Kill, Entry Fee, Winner Prize) -->
        <div class="grid grid-cols-4 gap-1 p-2 bg-black/40 border border-purple-500/10 rounded-xl text-center">
          <div>
            <span class="block text-[8px] uppercase tracking-wider text-slate-500 font-bold leading-none">Prize Pool</span>
            <span class="block font-rajdhani font-extrabold text-[11px] sm:text-xs text-yellow-400 mt-1">₹${t.prizePool || 0}</span>
          </div>
          <div class="border-l border-purple-500/10">
            <span class="block text-[8px] uppercase tracking-wider text-slate-500 font-bold leading-none">Per Kill</span>
            <span class="block font-rajdhani font-extrabold text-[11px] sm:text-xs text-purple-400 mt-1">₹${t.perKill || 0}</span>
          </div>
          <div class="border-l border-purple-500/10">
            <span class="block text-[8px] uppercase tracking-wider text-slate-500 font-bold leading-none">Entry Fee</span>
            <span class="block font-rajdhani font-extrabold text-[11px] sm:text-xs text-emerald-400 mt-1">₹${t.entryFee || 0}</span>
          </div>
          <div class="border-l border-purple-500/10 cursor-pointer hover:bg-white/5 rounded transition-all p-0.5 winner-prize-trigger">
            <span class="block text-[8px] uppercase tracking-wider text-slate-500 font-bold leading-none">Winner Prize</span>
            <span class="block font-rajdhani font-extrabold text-[11px] sm:text-xs text-blue-400 mt-1 truncate" title="Tap to view Prize Split">₹${winnerPrize} <i class="fa-solid fa-circle-info text-[8px]"></i></span>
          </div>
        </div>

        <!-- Slots and Allocation Progress -->
        <div class="space-y-1">
          <div class="flex justify-between items-center text-[9px] font-grotesk tracking-wider text-slate-400">
            <span class="text-yellow-500 font-semibold flex items-center gap-1"><i class="fa-solid fa-users text-[8px]"></i> ${joined}/${max} Joined</span>
            <span class="${remaining <= 5 ? 'text-red-400 animate-pulse' : 'text-purple-300'} font-semibold">${remaining} Slots Left</span>
          </div>
          <div class="progress-bar-wrap h-1">
            <div class="h-full rounded-full bg-gradient-to-r from-purple-600 via-gold to-yellow-400 transition-all duration-500" style="width: ${progress}%"></div>
          </div>
        </div>

        <!-- Dynamic Locked Room Credentials status bar -->
        <div class="bg-[#120924]/60 border border-purple-500/20 rounded-xl px-2.5 py-1 flex items-center justify-between min-h-[26px]">
          <span class="text-slate-400 font-semibold tracking-wider text-[8px] uppercase font-grotesk">Room details:</span>
          ${roomCredsHTML}
        </div>

        <div class="pt-0.5">
          ${actionButtonHTML}
        </div>
      </div>
    `;

    // Programmatically attach click listener to the card
    card.addEventListener('click', (e) => {
      if (e.target.closest('.winner-prize-trigger') || e.target.closest('.join-btn-click')) {
        return; // Click action targeted on specific interactive child elements
      }

      // Rule 3: After opening the popup, ignore Match Card clicks for 250ms
      if (Date.now() - lastPopupOpenTime < 250) {
        return;
      }
      
      if (popupOpen) {
        // If popup is open, close popup only and prevent Match Card navigation
        window.closeWinnerSplitPopup();
        return;
      }
      
      window.openMatchDetailsModal(t.id);
    });

    // Programmatically attach click listener to the Winner Prize split button inside card
    const trigger = card.querySelector('.winner-prize-trigger');
    if (trigger) {
      trigger.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        console.log("Winner popup clicked", t.id);
        window.showWinnerSplitPopup(e, t.id);
      });
    }

    // Programmatically attach click listener to the Join button inside card
    const joinBtn = card.querySelector('.join-btn-click');
    if (joinBtn) {
      joinBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.openJoinModal(t.id);
      });
    }

    feed.appendChild(card);
  });
}

window.switchView = function(viewId, param = null) {
  if (viewId === 'home' && currentViewId === 'home') {
    window.toggleDrawer(false);
    return;
  }

  currentViewId = viewId;

  requestAnimationFrame(() => {
    const panels = document.querySelectorAll('.view-panel');
    panels.forEach(v => {
      if (!v.classList.contains('hidden')) {
        v.classList.add('hidden');
      }
    });

    const active = document.getElementById('view-' + viewId);
    if (active) {
      active.classList.remove('hidden');
    }

    const navButtons = document.querySelectorAll('.nav-mobile-btn');
    navButtons.forEach(btn => btn.classList.remove('text-gold'));

    const indexMap = { 'home': 0, 'matches': 1, 'my-matches': 2, 'wallet': 3, 'profile': 4 };
    if (indexMap[viewId] !== undefined && navButtons[indexMap[viewId]]) {
      navButtons[indexMap[viewId]].classList.add('text-gold');
    }

    if (viewId === 'matches') {
      currentMatchMode = param || 'All';
      
      const titleMap = { 
        'All': 'ALL BATTLES', 
        'Solo': 'SOLO BATTLES', 
        'Duo': 'DUO BATTLES', 
        'Squad': 'SQUAD BATTLES' 
      };
      
      setSafeText('matches-section-title', titleMap[currentMatchMode] || 'ALL BATTLES');

      currentMatchStatus = 'All';
      document.querySelectorAll('.filter-pill').forEach(btn => btn.classList.remove('pill-active'));
      const allPill = document.querySelector('.filter-pill.pill-all');
      if (allPill) allPill.classList.add('pill-active');

      renderMatches();
    }

    window.scrollTo({ top: 0, behavior: 'instant' });
  });

  window.toggleDrawer(false);
};

window.filterMatchStatus = function(status) {
  currentMatchStatus = status;

  const pillClassMap = {
    'All': 'pill-all',
    'upcoming': 'pill-upcoming',
    'live': 'pill-live',
    'completed': 'pill-completed',
    'cancelled': 'pill-cancelled'
  };

  document.querySelectorAll('.filter-pill').forEach(btn => {
    btn.classList.remove('pill-active');
  });

  const activePillClass = pillClassMap[status];
  if (activePillClass) {
    const activePill = document.querySelector(`.filter-pill.${activePillClass}`);
    if (activePill) activePill.classList.add('pill-active');
  }

  renderMatches();
};

export function initMatchesSync() {
  onSnapshot(collection(db, "tournaments"), (snap) => {
    allTournaments = [];
    snap.forEach(d => allTournaments.push({ id: d.id, ...d.data() }));
    
    renderMatches();
    renderMyMatches();

    // Re-evaluates open details modal context in real-time when snapshot values change
    if (activeDetailsTournamentId) {
      updateMatchDetailsModalContent(activeDetailsTournamentId);
    }
  });
}

// --- END OF FILE matches.js ---