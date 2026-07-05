import { 
  db, 
  storage, 
  onSnapshot, 
  doc, 
  setDoc, 
  collection, 
  query, 
  where, 
  runTransaction, 
  serverTimestamp, 
  ref, 
  uploadBytes, 
  getDownloadURL 
} from './firebase.js';

import { 
  currentUserDoc 
} from './auth.js';

import { 
  showToast, 
  setSafeText 
} from './utils.js';

/**
 * Toggles the visibility of the Add Funds (Deposit) and Request Payout (Withdrawal) tabs.
 * @param {string} view - The active financial state ('deposit' or 'withdraw')
 */
window.toggleWalletTabs = function(view) {
  const depBtn = document.getElementById('wallet-tab-dep-btn');
  const withBtn = document.getElementById('wallet-tab-with-btn');
  const depPanel = document.getElementById('wallet-deposit-panel');
  const withPanel = document.getElementById('wallet-withdraw-panel');

  if (!depBtn || !withBtn || !depPanel || !withPanel) return;

  if (view === 'deposit') {
    depBtn.className = "py-3 bg-gradient-to-r from-gold to-gold-dark text-black rounded-xl text-xs font-bold uppercase tracking-wider glow-gold-btn";
    withBtn.className = "py-3 bg-black/40 border border-gold/15 text-gold rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-gold/5";
    depPanel.classList.remove('hidden');
    withPanel.classList.add('hidden');
  } else {
    withBtn.className = "py-3 bg-gradient-to-r from-gold to-gold-dark text-black rounded-xl text-xs font-bold uppercase tracking-wider glow-gold-btn";
    depBtn.className = "py-3 bg-black/40 border border-gold/15 text-gold rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-gold/5";
    withPanel.classList.remove('hidden');
    depPanel.classList.add('hidden');
  }
};

/**
 * Initializes listeners for Transaction History, dynamic Admin UPI ID configurations, and balance records.
 * @param {string} uid - User Identifier
 */
export function initWalletSync(uid) {
  // 1. Transaction History Stream Listener
  const transactionsQuery = query(collection(db, "walletTransactions"), where("userId", "==", uid));
  onSnapshot(transactionsQuery, (snap) => {
    console.log("[Realtime Sync] Transaction History Updated. Count:", snap.size);
    const feed = document.getElementById('transaction-feed');
    if (!feed) return;
    
    feed.innerHTML = '';

    if (snap.empty) {
      feed.innerHTML = `<div class="p-4 text-center text-xs text-slate-500">No transactions yet.</div>`;
      return;
    }

    const txns = [];
    snap.forEach(d => txns.push({ id: d.id, ...d.data() }));

    // Sort transactions in descending chronological order
    txns.sort((a, b) => {
      const tA = a.timestamp ? a.timestamp.toMillis() : Date.now();
      const tB = b.timestamp ? b.timestamp.toMillis() : Date.now();
      return tB - tA;
    });

    txns.forEach(t => {
      const rawAmt = Number(t.amount || 0);
      const isDebit = rawAmt < 0 || 
                      (t.type && (t.type.toUpperCase().includes('DEBIT') || 
                                  t.type.toUpperCase().includes('WITHDRAW') || 
                                  t.type.toUpperCase() === 'MATCH_ENTRY'));
      
      const amtCls = isDebit ? 'text-rose-400' : 'text-emerald-400';
      const sign = isDebit ? '-' : '+';
      const displayAmt = Math.abs(rawAmt).toFixed(2);
      
      const dateStr = t.timestamp 
        ? t.timestamp.toDate().toLocaleString('en-IN', { hour12: true, dateStyle: 'short', timeStyle: 'short' }) 
        : 'Just now';
      
      let typeLabel = "TRANSACTION";
      if (t.type) {
        typeLabel = t.type.replace('_', ' ').toUpperCase();
      }

      feed.innerHTML += `
        <div class="flex justify-between items-center p-3 bg-black/30 border border-gold/10 rounded-xl text-xs">
          <div>
            <p class="font-bold text-white">${t.reason || t.title || 'Wallet Update'}</p>
            <div class="flex gap-2 items-center mt-1">
               <span class="text-[8px] bg-gold/10 text-gold border border-gold/20 px-1.5 py-0.5 rounded uppercase font-bold">${typeLabel}</span>
               <span class="text-[9px] text-slate-500">${dateStr}</span>
            </div>
          </div>
          <span class="font-extrabold text-sm ${amtCls}">${sign}₹${displayAmt}</span>
        </div>
      `;
    });
  });

  // 2. Dynamic Settings & UPI Configurations Sync
  onSnapshot(doc(db, "settings", "payment"), (snap) => {
    if (snap.exists()) {
      setSafeText('dep-upi-id', snap.data().upiId || "admin@upi");
    }
  });
}

// --- CORE ACTION FORM REGISTRATIONS ---

// Deposit Form handler
const depositFormEl = document.getElementById('deposit-form');
if (depositFormEl) {
  depositFormEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUserDoc) return;

    const btn = document.getElementById('dep-submit-btn');
    if (!btn) return;

    btn.disabled = true; 
    btn.innerText = "Submitting...";

    try {
      let screenshotUrl = "";
      const fileInput = document.getElementById('dep-ss');
      const file = fileInput ? fileInput.files[0] : null;

      // Upload transaction screenshot to Firebase Storage if selected
      if (file) {
        const storageRef = ref(storage, `deposits/${currentUserDoc.uid}_${Date.now()}`);
        const uploadSnap = await uploadBytes(storageRef, file);
        screenshotUrl = await getDownloadURL(uploadSnap.ref);
      }

      const depAmtInput = document.getElementById('dep-amt');
      const depUtrInput = document.getElementById('dep-utr');

      await setDoc(doc(collection(db, "depositRequests")), {
        userId: currentUserDoc.uid,
        amount: Number(depAmtInput ? depAmtInput.value : 0),
        utr: depUtrInput ? depUtrInput.value.trim() : "",
        screenshot: screenshotUrl,
        status: 'pending',
        timestamp: serverTimestamp()
      });

      showToast("Deposit request sent!", "success");
      e.target.reset();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      btn.disabled = false; 
      btn.innerText = "Submit Request";
    }
  });
}

// Withdrawal Form handler
const withdrawFormEl = document.getElementById('withdraw-form');
if (withdrawFormEl) {
  withdrawFormEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUserDoc) return;

    const btn = document.getElementById('with-submit-btn');
    if (!btn) return;

    btn.disabled = true; 
    btn.innerText = "Requesting...";

    const amtInput = document.getElementById('with-amt');
    const upiInput = document.getElementById('with-upi');
    const amt = Number(amtInput ? amtInput.value : 0);

    try {
      await runTransaction(db, async (t) => {
        const userRef = doc(db, "users", currentUserDoc.uid);
        const userSnap = await t.get(userRef);

        if (!userSnap.exists()) throw new Error("User record mismatch.");

        const userData = userSnap.data();
        const currentBalance = parseFloat(userData.walletBalance || userData.wallet || 0);

        if (currentBalance < amt) throw new Error("Insufficient Balance");

        const nextBalance = currentBalance - amt;

        // Atomically update user balance
        t.update(userRef, { 
          wallet: nextBalance,
          walletBalance: nextBalance
        });

        // Log pending withdrawal payout sheet
        const withdrawRef = doc(collection(db, "withdrawRequests"));
        t.set(withdrawRef, {
          userId: currentUserDoc.uid,
          amount: amt,
          upi: upiInput ? upiInput.value.trim() : "",
          status: "pending",
          timestamp: serverTimestamp()
        });

        // Register Debit hold context to user's wallet feed
        const txRef = doc(collection(db, "walletTransactions"));
        t.set(txRef, {
          userId: currentUserDoc.uid, 
          type: "withdraw_hold", 
          amount: -amt,
          reason: "Withdrawal processing", 
          timestamp: serverTimestamp()
        });
      });

      showToast("Withdrawal requested!", "success");
      e.target.reset();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      btn.disabled = false; 
      btn.innerText = "Request Payout";
    }
  });
}