// auth.js
// Handles: signup (with role), login (routes by role), logout,
// password reset, email verification, and protected page guards.
// Import this as a module in signup.html, login.html, and add the
// logout handler to every page that has a Logout button.

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

// Guard flag: set true while handleLogin / handleSignup are actively
// completing, so the onAuthStateChanged page guard doesn't race them
// and redirect to the wrong dashboard (default "member" fallback).
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

// Maps a Firestore role value to the right dashboard page.
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
  "member.html": ["owner"],
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

    // If handleLogin / handleSignup is actively finishing (sign-in just
    // happened), defer to that function's role lookup + redirect so we
    // don't race it and bounce the user to the default (member) dashboard.
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

// ---------- SIGNUP ----------
// Expects on signup.html:
//   #account-type  (select, values "Member" | "Gym Owner")
//   #fname, #lname, #email, #password, #confirm (inputs)
//   a button with id="signup-btn"

export async function handleSignup() {
  const button = document.getElementById("signup-btn");
  const accountType = document.getElementById("account-type").value; // "member" | "owner" or "Member" | "Gym Owner" (legacy)
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

    // Store role + profile info in Firestore, keyed by uid
    await setDoc(doc(db, "users", cred.user.uid), {
      firstName: fname,
      lastName: lname,
      email,
      role, // "member" | "owner"
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

// ---------- LOGIN ----------
// Expects on login.html:
//   #email, #password (inputs)
//   a button with id="login-btn"

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
        // Firebase may rate-limit repeated verification emails; login still stays blocked.
      }
      await signOut(auth);
      authActionInProgress = false;
      setButtonLoading(button, false);
      showError("Please verify your email first. We sent a new verification link if Firebase allowed it.");
      return;
    }

    // Look up role from Firestore to route correctly.
    // Cache the role on the window so the page guard (if it also fires)
    // can use it instead of defaulting to "member" on a missed/empty doc.
    const role = await getUserRole(cred.user.uid);
    window.__authRole = role;

    window.location.href = allowedRedirectForRole(role);
  } catch (err) {
    authActionInProgress = false;
    setButtonLoading(button, false);
    showError(friendlyAuthError(err));
  }
}

// ---------- PASSWORD RESET ----------
// Expects on login.html:
//   #email input
//   a button/link with id="reset-password-btn"

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

// ---------- LOGOUT ----------
// Attach to any Logout button: onclick="handleLogout()"
// (exposed on window below for inline onclick compatibility)

export async function handleLogout() {
  try {
    await signOut(auth);
  } finally {
    window.location.href = "login.html";
  }
}

// Expose logout globally so existing inline onclick="window.location.href='login.html'"
// buttons can be swapped to onclick="handleLogout()" without changing to type=module everywhere.
window.handleLogout = handleLogout;
runPageGuard();

// ---------- error messages ----------

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