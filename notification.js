import { 
  db, 
  collection, 
  query, 
  where, 
  onSnapshot, 
  updateDoc 
} from './firebase.js';

import { 
  showToast 
} from './utils.js';

/**
 * Initializes listeners to stream real-time alert notifications for the logged-in user.
 * Displays unread alerts as elegant popups and marks them read in Firestore atomically.
 * @param {string} uid - User Identifier
 */
export function initNotificationsSync(uid) {
  const notificationsQuery = query(
    collection(db, "notifications"), 
    where("userId", "==", uid), 
    where("read", "==", false)
  );

  onSnapshot(notificationsQuery, (snap) => {
    snap.docChanges().forEach((change) => {
      if (change.type === "added") {
        const data = change.doc.data();
        
        // Trigger popup toast alert in UI
        showToast(
          data.message || data.title || "New Notification", 
          data.type || "info"
        );

        // Atomically acknowledge read status on Firestore document
        updateDoc(change.doc.ref, { read: true }).catch(err => {
          console.error("Failed to mark notification read:", err);
        });
      }
    });
  });
}