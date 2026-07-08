// firebase-init.js
// Shared Firebase initialization. Loaded before auth.js on every page.
// Uses the Firebase v10 modular SDK via CDN (ES modules).

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js";

// TODO: Replace with YOUR real config from the Firebase console
// (Project settings > General > Your apps > SDK setup and configuration)
const firebaseConfig = {
  apiKey: "AIzaSyCGLHgqhl0W3gqDTgJrtpYEyxCc7lb_aag",
  authDomain: "elev8-2b996.firebaseapp.com",
  projectId: "elev8-2b996",
  storageBucket: "elev8-2b996.firebasestorage.app",
  messagingSenderId: "125136917087",
  appId: "1:125136917087:web:4e7b819dc574b3068881ea",
  measurementId: "G-GDDQ55RMPC"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
