





import { auth, db } from "./firebase-init.js";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";



const AUTO_DISMISS_MS = 5000;
let dismissTimer = null;




let authActionInProgress = false;

function autoDismiss(el) {
  if (!el) return;
  if (dismissTimer) clearTimeout(dismissTimer);
  dismissTimer = setTimeout(() => {
    el.style.display = "none";
  }, AUTO_DISMISS_MS);
}

function showError(message) {

  const el = document.getElementById("form-error");
  if (el) {
    el.textContent = message;
    el.style.display = "block";
    autoDismiss(el);
  } else {
    alert(message);
  }
}

function showMessage(message) {
  const el = document.getElementById("form-success") || document.getElementById("form-error");
  if (el) {
    el.textContent = message;
    el.style.display = "block";
    autoDismiss(el);
  } else {
    alert(message);
  }
}

function setButtonLoading(button, isLoading, loadingText = "Please wait…") {
  if (!button) return;
  if (isLoading) {
    button.dataset.originalText = button.textContent;
    button.textContent = loadingText;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
  }
}


function dashboardForRole(role) {
  if (role === "admin") return "admindashboard.html";
  if (role === "owner") return "ownersdashboard.html";
  return "userdashboard.html";
}

const protectedRoutes = {
  "userdashboard.html": ["member"],
  "gyms.html": ["member"],
  "gym.html": ["member"],
  "user-subscription.html": ["member"],

  "ownersdashboard.html": ["owner"],
  "owners-members.html": ["owner"],
  "member-profile.html": ["owner"],
  "subscription.html": ["owner"],
  "owners-subscription.html": ["owner"],
  "payment.html": ["owner"],
  "gym-profile.html": ["owner"],
  "settings.html": ["owner"],

  "admindashboard.html": ["admin"]
};

const publicAuthRoutes = new Set(["login.html", "signup.html"]);

function currentPage() {
  const page = window.location.pathname.split("/").pop();
  return page || "index.html";
}

function redirectTo(path) {
  if (currentPage() !== path) {
    window.location.href = path;
  }
}

async function getUserRole(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() && snap.data().role ? snap.data().role : "member";
}

async function getSignedInRole(user) {
  await reload(user);
  if (!user.emailVerified) {
    await signOut(auth);
    window.location.href = "login.html?verifyRequired=1";
    return null;
  }

  return getUserRole(user.uid);
}

function showLoginNoticeFromQuery() {
  const params = new URLSearchParams(window.location.search);
  if (params.has("verifyEmail")) {
    showMessage("Account created. Check your email and verify your account before signing in.");
  }
  if (params.has("verifyRequired")) {
    showError("Please verify your email before accessing your account.");
  }
  if (params.has("resetSent")) {
    showMessage("Password reset link sent. Check your email for the next step.");
  }
}

function allowedRedirectForRole(role) {
  const params = new URLSearchParams(window.location.search);
  const redirect = params.get("redirect");
  const redirectPage = redirect ? redirect.split("/").pop() : "";
  const allowedRoles = protectedRoutes[redirectPage];

  return allowedRoles && allowedRoles.includes(role) ? redirectPage : dashboardForRole(role);
}

function runPageGuard() {
  const page = currentPage();
  const requiredRoles = protectedRoutes[page];
  const isAuthPage = publicAuthRoutes.has(page);

  if (!requiredRoles && !isAuthPage) return;

  if (isAuthPage) {
    showLoginNoticeFromQuery();
  }

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      if (requiredRoles) {
        window.location.href = `login.html?redirect=${encodeURIComponent(page)}`;
      }
      return;
    }

    
    
    
    if (authActionInProgress) return;

    try {
      if (isAuthPage) {
        await reload(user);
        if (!user.emailVerified) return;
        const role = window.__authRole || (await getUserRole(user.uid));
        redirectTo(dashboardForRole(role));
        return;
      }

      const role = window.__authRole || (await getSignedInRole(user));
      if (!role) return;

      if (requiredRoles && !requiredRoles.includes(role)) {
        redirectTo(dashboardForRole(role));
      }
    } catch (err) {
      console.error("Auth guard failed:", err);
      await signOut(auth);
      redirectTo("login.html");
    }
  });
}







export async function handleSignup() {
  const button = document.getElementById("signup-btn");
  const accountType = document.getElementById("account-type").value; 
  const fname = document.getElementById("fname").value.trim();
  const lname = document.getElementById("lname").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const confirm = document.getElementById("confirm").value;

  if (!fname || !lname || !email || !password) {
    showError("Please fill in all fields.");
    return;
  }
  if (password.length < 8) {
    showError("Password must be at least 8 characters.");
    return;
  }
  if (password !== confirm) {
    showError("Passwords do not match.");
    return;
  }

  const role = (accountType === "owner" || accountType === "Gym Owner") ? "owner" : "member";

  authActionInProgress = true;
  setButtonLoading(button, true, "Creating account…");
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);

    await updateProfile(cred.user, {
      displayName: `${fname} ${lname}`
    });

    
    await setDoc(doc(db, "users", cred.user.uid), {
      firstName: fname,
      lastName: lname,
      email,
      role, 
      createdAt: serverTimestamp()
    });

    await sendEmailVerification(cred.user);
    await signOut(auth);
    authActionInProgress = false;
    window.location.href = "login.html?verifyEmail=1";
  } catch (err) {
    authActionInProgress = false;
    setButtonLoading(button, false);
    showError(friendlyAuthError(err));
  }
}






export async function handleLogin() {
  const button = document.getElementById("login-btn");
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  if (!email || !password) {
    showError("Please enter your email and password.");
    return;
  }

  authActionInProgress = true;
  setButtonLoading(button, true, "Signing in…");
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);

    await reload(cred.user);
    if (!cred.user.emailVerified) {
      try {
        await sendEmailVerification(cred.user);
      } catch (_) {
        
      }
      await signOut(auth);
      authActionInProgress = false;
      setButtonLoading(button, false);
      showError("Please verify your email first. We sent a new verification link if Firebase allowed it.");
      return;
    }

    
    
    
    const role = await getUserRole(cred.user.uid);
    window.__authRole = role;

    window.location.href = allowedRedirectForRole(role);
  } catch (err) {
    authActionInProgress = false;
    setButtonLoading(button, false);
    showError(friendlyAuthError(err));
  }
}






export async function handlePasswordReset() {
  const email = document.getElementById("email").value.trim();

  if (!email) {
    showError("Enter your email address first, then request a password reset.");
    return;
  }

  try {
    await sendPasswordResetEmail(auth, email);
    showMessage("Password reset link sent. Check your email for the next step.");
  } catch (err) {
    showError(friendlyAuthError(err));
  }
}





export async function handleLogout() {
  try {
    await signOut(auth);
  } finally {
    window.location.href = "login.html";
  }
}



window.handleLogout = handleLogout;
runPageGuard();



function friendlyAuthError(err) {
  const code = err && err.code;
  switch (code) {
    case "auth/email-already-in-use":
      return "That email is already registered. Try logging in instead.";
    case "auth/invalid-email":
      return "That doesn't look like a valid email address.";
    case "auth/weak-password":
      return "Password is too weak. Use at least 8 characters.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Incorrect email or password.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a moment and try again.";
    default:
      return "Something went wrong. Please try again.";
  }
}
