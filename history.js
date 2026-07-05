import { 
  db, 
  collection, 
  query, 
  where, 
  onSnapshot 
} from './firebase.js';

import { 
  allTournaments, 
  renderMatches 
} from './matches.js';

// Shared live-binding operational variables
export let myParticipations = [];

// Local module operational state
let currentMyMatchTab = 'upcoming';

/**
 * Filter handler that toggles selected tab on Joined Battles view.
 * @param {string} status - Dynamic tab selector ('upcoming', 'live', 'completed', 'cancelled')
 */
window.filterMyMatchesTab = function(status) {
  currentMyMatchTab = status;
  
  const buttons = document.querySelectorAll('.mytourn-btn');
  buttons.forEach(btn => {
    if (btn.innerText.toLowerCase().includes(status.toLowerCase())) {
      btn.className = "mytourn-btn px-6 py-2.5 rounded-xl bg-gold/10 border border-gold text-white whitespace-nowrap";
    } else {
      btn.className = "mytourn-btn px-6 py-2.5 rounded-xl border border-gold/15 text-slate-400 hover:bg-gold/5 whitespace-nowrap";
    }
  });

  renderMyMatches();
};

/**
 * Renders list of registered tournaments matched by active category constraints.
 */
export function renderMyMatches() {
  const feed = document.getElementById('mytournaments-feed');
  if (!feed) return;
  
  feed.innerHTML = '';

  // Filter based on active selection matching tournaments status
  const filtered = myParticipations.filter(p => {
    const t = allTournaments.find(tourn => tourn.id === p.tournamentId);
    const stat = t ? (t.status || 'upcoming').toLowerCase() : 'upcoming';
    return stat === currentMyMatchTab;
  });

  if (filtered.length === 0) {
    feed.innerHTML = `
      <div class="p-6 text-center text-xs text-slate-500 col-span-1 md:col-span-2 bg-black/40 rounded-2xl border border-gold/10">
        No registered matches in this category.
      </div>
    `;
    return;
  }

  filtered.forEach(p => {
    const t = allTournaments.find(tourn => tourn.id === p.tournamentId) || {};
    const card = document.createElement('div');
    
    card.className = "glass-luxury p-5 rounded-3xl border border-gold/15 space-y-4 relative flex flex-col justify-between";
    card.innerHTML = `
      <div class="flex justify-between items-start border-b border-gold/10 pb-3">
        <div>
          <h4 class="text-md font-rajdhani font-bold text-white leading-tight">${p.tournamentName}</h4>
          <p class="text-[9px] text-slate-400 uppercase mt-1 tracking-wider">${p.mode} • ${p.date} ${p.time}</p>
        </div>
        <span class="text-[9px] uppercase font-bold bg-gold/10 border border-gold text-gold px-2 py-0.5 rounded">${t.status || 'upcoming'}</span>
      </div>
      <div class="bg-black/40 p-3 rounded-xl border border-gold/5 text-xs font-grotesk text-slate-300 flex justify-between items-center">
        <div>
          <span class="text-[9px] uppercase text-slate-500 block">Registered Game Name</span>
          <strong class="text-white">${p.gameName}</strong>
        </div>
        <div class="text-right">
          <span class="text-[9px] uppercase text-slate-500 block">BGMI UID</span>
          <strong class="font-mono text-gold-light">${p.bgmiUid}</strong>
        </div>
      </div>
      <button onclick="window.openRoomModal('${p.tournamentId}')" class="w-full py-2.5 bg-black/50 border border-gold/20 hover:border-gold/50 rounded-xl text-[10px] text-gold font-bold uppercase transition-all">
        View Room Credentials
      </button>
    `;
    feed.appendChild(card);
  });
}

/**
 * Initializes listeners for active participant registrations for the logged-in user.
 * @param {string} uid - User Identifier
 */
export function initMyMatchesSync(uid) {
  const participantsQuery = query(collection(db, "matchParticipants"), where("userId", "==", uid));
  
  onSnapshot(participantsQuery, (snap) => {
    myParticipations = [];
    snap.forEach(d => myParticipations.push({ docId: d.id, ...d.data() }));
    
    // Core redraw triggers on state mutation
    renderMatches();
    renderMyMatches();
  });
}