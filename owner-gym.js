import { auth, db } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
const CLOUD_NAME = "ddvgdqtb0";
const UPLOAD_PRESET = "elevate8"; 

async function uploadImage(file) {
  const formData = new FormData();

  formData.append("file", file);
  formData.append("upload_preset", UPLOAD_PRESET);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
    {
      method: "POST",
      body: formData
    }
  );

  if (!response.ok) {
    throw new Error("Image upload failed.");
  }

  const data = await response.json();

  return {
    url: data.secure_url,
    publicId: data.public_id
  };
}

const page = window.location.pathname.split("/").pop();
let currentUser = null;
let currentGym = null;
let gymProfileInitialized = false;
let ownerDashboardInitialized = false;

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

let publishInFlight = false;

async function togglePublish() {
  if (!currentGym || publishInFlight) return;
  publishInFlight = true;
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
    console.error("togglePublish failed:", err);
    showStatus(err.message || "Could not update publish status.", "error");
  } finally {
    setLoading(button, false);
    publishInFlight = false;
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
    console.error("deleteGym failed:", err);
    showStatus(err.message || "Could not delete gym profile.", "error");
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

  // Guard: onAuthStateChanged can fire more than once per page load
  // (cached state, then a refreshed token). Without this guard these
  // listeners stack up and every click fires the handler multiple times,
  // racing itself and making Publish/Save look like they do nothing.
  if (gymProfileInitialized) return;
  gymProfileInitialized = true;

  el("gym-profile-form")?.addEventListener("submit", saveGym);
  el("publish-gym-btn")?.addEventListener("click", togglePublish);
  el("delete-gym-btn")?.addEventListener("click", deleteGym);
}

async function initOwnerDashboard() {
  await loadGym();
  renderOwnerDashboard(currentGym);
  ownerDashboardInitialized = true;
}

onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  currentUser = user;

  try {
    if (page === "gym-profile.html") {
      await initGymProfile();
    }

    if (page === "ownersdashboard.html") {
      // Dashboard has no persistent listeners to duplicate, but re-fetching
      // on every fire is wasted work once we already have the data.
      if (!ownerDashboardInitialized) {
        await initOwnerDashboard();
      } else {
        await loadGym();
        renderOwnerDashboard(currentGym);
      }
    }
  } catch (err) {
    console.error("owner-gym.js init failed:", err);
    showStatus("Could not load your gym data. Please refresh the page.", "error");
  }
});