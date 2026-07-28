




import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";




const firebaseConfig = {
    apiKey: "AIzaSyCGLHgqhl0W3gqDTgJrtpYEyxCc7lb_aag",
    authDomain: "elev8-2b996.firebaseapp.com",
    projectId: "elev8-2b996",
    messagingSenderId: "125136917087",
    appId: "1:125136917087:web:4e7b819dc574b3068881ea",
    measurementId: "G-GDDQ55RMPC"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);