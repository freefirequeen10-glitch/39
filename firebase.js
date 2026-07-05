import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged, 
  sendPasswordResetEmail 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  runTransaction, 
  increment, 
  serverTimestamp, 
  getFirestore, 
  initializeFirestore 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { 
  getStorage, 
  ref, 
  uploadBytes, 
  getDownloadURL 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { 
  getDatabase, 
  ref as rtdbRef, 
  set as rtdbSet, 
  onValue, 
  onDisconnect, 
  serverTimestamp as rtdbTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyBrL71mdvZ6uM611o2KPUvdTfSpGpn_DJc",
  authDomain: "tournament-11559.firebaseapp.com",
  databaseURL: "https://tournament-11559-default-rtdb.firebaseio.com",
  projectId: "tournament-11559",
  storageBucket: "tournament-11559.firebasestorage.app",
  messagingSenderId: "618975909041",
  appId: "1:618975909041:web:a0723749118cfb0a273e90",
  measurementId: "G-YJPGLXBG2Q"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const storage = getStorage(app);
const rtdb = getDatabase(app);

let db;
try {
  db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
} catch (e) {
  db = getFirestore(app);
}

export {
  app,
  auth,
  db,
  storage,
  rtdb,
  rtdbRef,
  rtdbSet,
  onValue,
  onDisconnect,
  rtdbTimestamp,
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
  orderBy,
  onSnapshot,
  runTransaction,
  increment,
  serverTimestamp,
  ref,
  uploadBytes,
  getDownloadURL
};