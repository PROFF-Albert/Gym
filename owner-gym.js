import { auth, db, storage } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js";

const page = window.location.pathname.split("/").pop();
let currentUser = null;
let currentGym = null;

const money = new Intl.NumberFormat("en-GH", {
  style: "currency",
  currency: "GHS",
  maximumFractionDigits: 0
});

function el(id) {
  return document.getElementById(id);
}

function text(id, value) {
  const node = el(id);
  if (node) node.textContent = value;
}

function showStatus(message, type = "success") {
  const node = el("gym-status-message");
  if (!node) return;
  node.textContent = message;
  node.className = `form-alert ${type === "error" ? "form-alert-error" : "form-alert-success"}`;
  node.style.display = "block";
}

function setLoading(button, loading, loadingText = "Saving...") {
  if (!button) return;
  if (loading) {
    button.dataset.originalText = button.textContent;
    button.textContent = loadingText;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
  }
}

function gymRef(uid = currentUser.uid) {
  return doc(db, "gyms", uid);
}

function formatDate(value) {
  if (!value || !value.toDate) return "-";
  return value.toDate().toLocaleDateString();
}

function storagePath(uid, folder, file) {
  const safeName = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, "-");
  return `gyms/${uid}/${folder}/${Date.now()}-${safeName}`;
}

async function uploadImage(file, folder) {
  if (!file) return null;
  if (!file.type.startsWith("image/")) {
    throw new Error("Only image files can be uploaded.");
  }

  const path = storagePath(currentUser.uid, folder, file);
  const imageRef = ref(storage, path);
  await uploadBytes(imageRef, file);
  const url = await getDownloadURL(imageRef);
  return { url, path, name: file.name };
}

async function deleteStoredImage(path) {
  if (!path) return;
  try {
    await deleteObject(ref(storage, path));
  } catch (err) {
    console.warn("Image delete skipped:", err);
  }
}

async function loadGym(uid = currentUser.uid) {
  const snap = await getDoc(gymRef(uid));
  currentGym = snap.exists() ? { id: snap.id, ...snap.data() } : null;
  return currentGym;
}

function formValue(id) {
  const node = el(id);
  return node ? node.value.trim() : "";
}

function fillGymForm(gym) {
  const fields = {
    "gym-name": gym?.name || "",
    "gym-location": gym?.location || "",
    "gym-address": gym?.address || "",
    "gym-phone": gym?.phone || "",
    "gym-email": gym?.email || currentUser.email || "",
    "gym-price": gym?.priceFrom ?? "",
    "gym-description": gym?.description || ""
  };

  Object.entries(fields).forEach(([id, value]) => {
    const node = el(id);
    if (node) node.value = value;
  });

  renderGymProfile(gym);
}

function renderGymProfile(gym) {
  const exists = Boolean(gym);
  text("gym-profile-title", exists ? gym.name : "Create Your Gym Profile");
  text("gym-profile-subtitle", exists ? (gym.published ? "Published listing" : "Draft listing") : "No gym profile yet");
  text("gym-status-label", exists ? (gym.published ? "Published" : "Unpublished") : "Not created");
  text("gym-created-label", exists ? formatDate(gym.createdAt) : "-");
  text("gym-updated-label", exists ? formatDate(gym.updatedAt) : "-");
  text("gym-location-label", exists ? gym.location || "-" : "-");

  const logo = el("gym-logo-preview");
  if (logo) {
    logo.innerHTML = gym?.logoUrl
      ? `<img src="${gym.logoUrl}" alt="${gym.name || "Gym"} logo">`
      : `<span>No logo</span>`;
  }

  const gallery = el("gym-gallery-preview");
  if (gallery) {
    const images = gym?.gallery || [];
    gallery.innerHTML = images.length
      ? images.map((image) => `<img src="${image.url}" alt="${gym.name || "Gym"} gallery image">`).join("")
      : `<p>No gallery images yet.</p>`;
  }

  const publishBtn = el("publish-gym-btn");
  if (publishBtn) {
    publishBtn.textContent = gym?.published ? "Unpublish Gym" : "Publish Gym";
    publishBtn.disabled = !exists;
  }

  const deleteBtn = el("delete-gym-btn");
  if (deleteBtn) deleteBtn.disabled = !exists;
}

async function saveGym(event) {
  event.preventDefault();
  const button = el("save-gym-btn");
  setLoading(button, true);

  try {
    if (!formValue("gym-name") || !formValue("gym-location")) {
      throw new Error("Gym name and location are required.");
    }

    const logoFile = el("gym-logo")?.files?.[0];
    const galleryFiles = Array.from(el("gym-gallery")?.files || []);
    const logoUpload = logoFile ? await uploadImage(logoFile, "logo") : null;
    const galleryUploads = [];

    for (const file of galleryFiles) {
      galleryUploads.push(await uploadImage(file, "gallery"));
    }

    if (logoUpload && currentGym?.logoPath) {
      await deleteStoredImage(currentGym.logoPath);
    }

    const data = {
      ownerId: currentUser.uid,
      name: formValue("gym-name"),
      location: formValue("gym-location"),
      address: formValue("gym-address"),
      phone: formValue("gym-phone"),
      email: formValue("gym-email"),
      priceFrom: Number(formValue("gym-price") || 0),
      description: formValue("gym-description"),
      published: currentGym?.published || false,
      updatedAt: serverTimestamp()
    };

    if (!currentGym) data.createdAt = serverTimestamp();
    if (logoUpload) {
      data.logoUrl = logoUpload.url;
      data.logoPath = logoUpload.path;
    }
    if (galleryUploads.length) {
      data.gallery = [...(currentGym?.gallery || []), ...galleryUploads];
    }

    await setDoc(gymRef(), data, { merge: true });
    await loadGym();
    fillGymForm(currentGym);
    showStatus(currentGym.published ? "Gym profile saved and still published." : "Gym profile saved as a draft.");
  } catch (err) {
    showStatus(err.message || "Could not save gym profile.", "error");
  } finally {
    setLoading(button, false);
  }
}

async function togglePublish() {
  if (!currentGym) return;
  const button = el("publish-gym-btn");
  setLoading(button, true, currentGym.published ? "Unpublishing..." : "Publishing...");

  try {
    await setDoc(gymRef(), {
      published: !currentGym.published,
      updatedAt: serverTimestamp()
    }, { merge: true });
    await loadGym();
    fillGymForm(currentGym);
    showStatus(currentGym.published ? "Gym is now published." : "Gym is now unpublished.");
  } catch (err) {
    showStatus("Could not update publish status.", "error");
  } finally {
    setLoading(button, false);
  }
}

async function deleteGym() {
  if (!currentGym) return;
  const confirmed = window.confirm("Delete this gym profile and its uploaded images?");
  if (!confirmed) return;

  const button = el("delete-gym-btn");
  setLoading(button, true, "Deleting...");

  try {
    await deleteStoredImage(currentGym.logoPath);
    for (const image of currentGym.gallery || []) {
      await deleteStoredImage(image.path);
    }
    await deleteDoc(gymRef());
    currentGym = null;
    fillGymForm(null);
    showStatus("Gym profile deleted.");
  } catch (err) {
    showStatus("Could not delete gym profile.", "error");
  } finally {
    setLoading(button, false);
  }
}

function renderOwnerDashboard(gym) {
  const hasGym = Boolean(gym);
  text("dashboard-gym-name", hasGym ? gym.name : "No gym profile yet");
  text("dashboard-gym-status", hasGym ? (gym.published ? "Published" : "Draft") : "Not created");
  text("dashboard-gym-location", hasGym ? gym.location || "-" : "-");
  text("dashboard-gym-price", hasGym && gym.priceFrom ? money.format(gym.priceFrom) : "-");
  text("dashboard-gym-description", hasGym ? gym.description || "Add a description to help members decide." : "Create your gym profile to start publishing your listing.");

  const logo = el("dashboard-gym-logo");
  if (logo) {
    logo.innerHTML = gym?.logoUrl
      ? `<img src="${gym.logoUrl}" alt="${gym.name || "Gym"} logo">`
      : `<span>No logo</span>`;
  }

  const cta = el("dashboard-gym-cta");
  if (cta) cta.textContent = hasGym ? "Edit Gym Profile" : "Create Gym Profile";
}

async function initGymProfile() {
  await loadGym();
  fillGymForm(currentGym);
  el("gym-profile-form")?.addEventListener("submit", saveGym);
  el("publish-gym-btn")?.addEventListener("click", togglePublish);
  el("delete-gym-btn")?.addEventListener("click", deleteGym);
}

async function initOwnerDashboard() {
  await loadGym();
  renderOwnerDashboard(currentGym);
}

onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  currentUser = user;

  if (page === "gym-profile.html") {
    await initGymProfile();
  }

  if (page === "ownersdashboard.html") {
    await initOwnerDashboard();
  }
});
