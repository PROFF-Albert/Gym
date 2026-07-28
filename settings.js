















import { auth, db } from "./firebase-init.js";
import {
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  updatePassword,
  verifyBeforeUpdateEmail
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

let currentUser = null;

function el(id) {
  return document.getElementById(id);
}




function showStatus(message, type = "success") {
  const node = el("settings-status-message");
  if (!node) return;
  node.textContent = message;
  node.className = `form-alert ${type === "error" ? "form-alert-error" : "form-alert-success"}`;
  node.style.display = "block";
}

function clearStatus() {
  const node = el("settings-status-message");
  if (!node) return;
  node.textContent = "";
  node.className = "form-alert";
  node.style.display = "none";
}




function setLoading(button, loading, loadingText) {
  if (!button) return;
  if (loading) {
    if (!button.dataset.originalText) button.dataset.originalText = button.textContent;
    button.textContent = loadingText;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
  }
}




async function loadCurrentSettings(user) {
  const emailInput = el("email");
  if (emailInput) emailInput.value = user.email || "";

  const gymNameInput = el("gym-name");
  if (!gymNameInput) return;

  try {
    const snap = await getDoc(doc(db, "gyms", user.uid));
    gymNameInput.value = snap.exists() ? snap.data().name || "" : "";
  } catch (err) {
    console.error("Could not load gym name:", err);
  }
}




async function handleSaveSettings() {
  const button = el("save-settings-btn");
  clearStatus();

  if (!currentUser) {
    showStatus("You must be signed in to update settings.", "error");
    return;
  }

  const gymName = el("gym-name")?.value.trim() || "";
  const email = el("email")?.value.trim() || "";
  const currentPassword = el("current-pass")?.value || "";
  const newPassword = el("new-pass")?.value || "";

  if (!currentPassword) {
    showStatus("Enter your current password to save changes.", "error");
    return;
  }
  if (!email) {
    showStatus("Email address is required.", "error");
    return;
  }
  if (newPassword && newPassword.length < 8) {
    showStatus("New password must be at least 8 characters.", "error");
    return;
  }

  setLoading(button, true, "Saving...");

  try {
    
    
    
    const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
    await reauthenticateWithCredential(currentUser, credential);

    
    
    if (gymName) {
      await setDoc(
        doc(db, "gyms", currentUser.uid),
        { name: gymName, nameLower: gymName.toLowerCase(), updatedAt: serverTimestamp() },
        { merge: true }
      );
    }

    
    
    
    
    
    let emailChangePending = false;
    if (email !== currentUser.email) {
      await verifyBeforeUpdateEmail(currentUser, email);
      emailChangePending = true;
    }

    
    let passwordChanged = false;
    if (newPassword) {
      await updatePassword(currentUser, newPassword);
      passwordChanged = true;
    }

    
    if (el("current-pass")) el("current-pass").value = "";
    if (el("new-pass")) el("new-pass").value = "";

    const parts = ["Settings saved."];
    if (emailChangePending) parts.push("Check your new email address for a link to confirm the change.");
    if (passwordChanged) parts.push("Password updated.");
    showStatus(parts.join(" "), "success");
  } catch (err) {
    console.error("handleSaveSettings failed:", err);
    showStatus(friendlySettingsError(err), "error");
  } finally {
    setLoading(button, false);
  }
}

function friendlySettingsError(err) {
  const code = err && err.code;
  switch (code) {
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Current password is incorrect.";
    case "auth/requires-recent-login":
      return "For security, please log out and back in, then try again.";
    case "auth/email-already-in-use":
      return "That email is already in use by another account.";
    case "auth/invalid-email":
      return "That doesn't look like a valid email address.";
    case "auth/weak-password":
      return "New password is too weak. Use at least 8 characters.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a moment and try again.";
    default:
      return "Could not save changes. Please try again.";
  }
}





let initialized = false;

async function initSettingsPage(user) {
  if (initialized) return;
  initialized = true;

  try {
    await loadCurrentSettings(user);
  } catch (err) {
    console.error("initSettingsPage load failed:", err);
    showStatus("Could not load your current settings. Please refresh the page.", "error");
  }

  el("save-settings-btn")?.addEventListener("click", handleSaveSettings);
}




onAuthStateChanged(auth, (user) => {
  if (!user) return;
  currentUser = user;
  initSettingsPage(user);
});
