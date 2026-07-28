



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
const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

const page = window.location.pathname.split("/").pop();
let currentUser = null;
let currentGym = null;


let gymProfileInitialized = false;



let publishInFlight = false;
const buttonOriginalText = new WeakMap();

function el(id) {
  return document.getElementById(id);
}

function text(id, value) {
  const node = el(id);
  if (node) node.textContent = value;
}

function formValue(id) {
  const node = el(id);
  return node ? node.value.trim() : "";
}

function setAttr(node, attr, value) {
  if (node) node.setAttribute(attr, value);
}




function showStatus(message, type = "success") {
  const node = el("gym-status-message");
  if (!node) return;
  node.textContent = message;
  node.className = `form-alert ${type === "error" ? "form-alert-error" : "form-alert-success"}`;
  node.style.display = "block";
}

function clearStatus() {
  const node = el("gym-status-message");
  if (!node) return;
  node.textContent = "";
  node.className = "form-alert";
  node.style.display = "none";
}




function setLoading(button, loading, loadingText) {
  if (!button) return;

  if (loading) {
    if (!buttonOriginalText.has(button)) {
      buttonOriginalText.set(button, button.textContent);
    }
    if (loadingText) button.textContent = loadingText;
    button.disabled = true;
  } else {
    const original = buttonOriginalText.get(button);
    if (original !== undefined) {
      button.textContent = original;
      buttonOriginalText.delete(button);
    }
    button.disabled = false;
  }
}





async function uploadImage(file) {
  if (!file) {
    throw new Error("No file selected for upload.");
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", UPLOAD_PRESET);

  let response;
  try {
    response = await fetch(CLOUDINARY_UPLOAD_URL, {
      method: "POST",
      body: formData
    });
  } catch (networkErr) {
    throw new Error("Network error while uploading image. Check your connection.");
  }

  if (!response.ok) {
    let detail = "";
    try {
      const errBody = await response.json();
      detail = errBody?.error?.message ? ` (${errBody.error.message})` : "";
    } catch {
      
    }
    throw new Error(`Image upload failed${detail}.`);
  }

  const data = await response.json();

  if (!data?.secure_url || !data?.public_id) {
    throw new Error("Image upload returned an incomplete response.");
  }

  return {
    url: data.secure_url,
    publicId: data.public_id
  };
}




function gymRef(uid = currentUser?.uid) {
  if (!uid) throw new Error("Not signed in.");
  return doc(db, "gyms", uid);
}

async function loadGym(uid) {
  const targetUid = uid || currentUser?.uid;
  if (!targetUid) {
    currentGym = null;
    return null;
  }
  const snap = await getDoc(gymRef(targetUid));
  currentGym = snap.exists() ? { id: snap.id, ...snap.data() } : null;
  return currentGym;
}




function fillGymForm(gym) {
  const fields = {
    "gym-name": gym?.name || "",
    "gym-location": gym?.location || "",
    "gym-address": gym?.address || "",
    "gym-phone": gym?.phone || "",
    "gym-email": gym?.email || currentUser?.email || "",
    "gym-price": gym?.priceFrom ?? "",
    "gym-description": gym?.description || ""
  };

  Object.entries(fields).forEach(([id, value]) => {
    const node = el(id);
    if (node) node.value = value;
  });

  
  
  const logoInput = el("gym-logo");
  if (logoInput) logoInput.value = "";
  const galleryInput = el("gym-gallery");
  if (galleryInput) galleryInput.value = "";

  renderGymProfile(gym);
}

function renderGymProfile(gym) {
  const exists = Boolean(gym);

  text("gym-profile-title", exists ? gym.name : "Create Your Gym Profile");
  text("gym-profile-subtitle", exists ? (gym.published ? "Published listing" : "Draft listing") : "No gym profile yet");
  text("gym-status-label", exists ? (gym.published ? "Published" : "Unpublished") : "Not created");
  text("gym-location-label", exists ? gym.location || "-" : "-");

  const logo = el("gym-logo-preview");
  if (logo) {
    if (gym?.logoUrl) {
      logo.innerHTML = `<img src="${gym.logoUrl}" alt="${escapeHtml(gym.name || "Gym")} logo">`;
    } else {
      logo.innerHTML = `<span>No logo</span>`;
    }
  }

  const gallery = el("gym-gallery-preview");
  if (gallery) {
    const images = gym?.gallery || [];
    if (images.length) {
      gallery.innerHTML = images
        .map(
          (image) =>
            `<img src="${image.url}" alt="${escapeHtml(gym.name || "Gym")} gallery image">`
        )
        .join("");
    } else {
      gallery.innerHTML = `<p>No gallery images yet.</p>`;
    }
  }

  const publishBtn = el("publish-gym-btn");
  if (publishBtn) {
    publishBtn.textContent = gym?.published ? "Unpublish Gym" : "Publish Gym";
    publishBtn.disabled = !exists;
  }

  const deleteBtn = el("delete-gym-btn");
  if (deleteBtn) deleteBtn.disabled = !exists;
}


function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}




function handleLogoChange(event) {
  const file = event.target.files?.[0];
  const preview = el("gym-logo-preview");
  if (!preview) return;
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    showStatus("Logo must be an image file.", "error");
    event.target.value = "";
    return;
  }
  const objectUrl = URL.createObjectURL(file);
  preview.innerHTML = `<img src="${objectUrl}" alt="Logo preview">`;
}

function handleGalleryChange(event) {
  const files = Array.from(event.target.files || []);
  const preview = el("gym-gallery-preview");
  if (!preview) return;
  if (!files.length) return;

  const validFiles = files.filter((file) => file.type.startsWith("image/"));
  if (validFiles.length !== files.length) {
    showStatus("Only image files are allowed in the gallery.", "error");
  }
  if (!validFiles.length) {
    event.target.value = "";
    return;
  }

  preview.innerHTML = validFiles
    .map(
      (file) =>
        `<img src="${URL.createObjectURL(file)}" alt="Gallery preview">`
    )
    .join("");
}




async function saveGym(event) {
  event.preventDefault();
  const button = el("save-gym-btn");
  setLoading(button, true, "Saving...");
  clearStatus();

  try {
    if (!currentUser) throw new Error("You must be signed in to save a gym.");

    const name = formValue("gym-name");
    const location = formValue("gym-location");

    if (!name) throw new Error("Gym name is required.");
    if (!location) throw new Error("Location is required.");

    const logoFile = el("gym-logo")?.files?.[0] || null;
    const galleryFiles = Array.from(el("gym-gallery")?.files || []);

    let logoUpload = null;
    if (logoFile) {
      logoUpload = await uploadImage(logoFile);
    }

    const galleryUploads = [];
    for (const file of galleryFiles) {
      
      
      
      galleryUploads.push(await uploadImage(file));
    }

    const priceRaw = formValue("gym-price");
    const priceFrom = priceRaw === "" ? 0 : Number(priceRaw);
    if (Number.isNaN(priceFrom)) {
      throw new Error("Price must be a valid number.");
    }

    const data = {
      ownerId: currentUser.uid,
      name,
      nameLower: name.toLowerCase(),
      location,
      address: formValue("gym-address"),
      phone: formValue("gym-phone"),
      email: formValue("gym-email"),
      priceFrom,
      description: formValue("gym-description"),
      published: currentGym?.published === true,
      updatedAt: serverTimestamp()
    };

    if (!currentGym) {
      data.createdAt = serverTimestamp();
    }

    if (logoUpload) {
      data.logoUrl = logoUpload.url;
      data.logoPublicId = logoUpload.publicId;
    }

    if (galleryUploads.length) {
      const existingGallery = Array.isArray(currentGym?.gallery) ? currentGym.gallery : [];
      data.gallery = [
        ...existingGallery,
        ...galleryUploads.map((img) => ({ url: img.url, publicId: img.publicId }))
      ];
    }

    await setDoc(gymRef(), data, { merge: true });
    await loadGym();
    fillGymForm(currentGym);
    showStatus(
      currentGym?.published
        ? "Gym profile saved and still published."
        : "Gym profile saved as a draft."
    );
  } catch (err) {
    console.error("saveGym failed:", err);
    showStatus(err?.message || "Could not save gym profile.", "error");
  } finally {
    setLoading(button, false);
  }
}




async function togglePublish() {
  if (!currentUser) {
    showStatus("You must be signed in to publish a gym.", "error");
    return;
  }
  if (!currentGym) {
    showStatus("Save your gym profile before publishing.", "error");
    return;
  }
  if (publishInFlight) return;

  publishInFlight = true;
  const button = el("publish-gym-btn");
  const willPublish = !currentGym.published;
  setLoading(button, true, willPublish ? "Publishing..." : "Unpublishing...");
  clearStatus();

  try {
    await setDoc(
      gymRef(),
      {
        published: willPublish,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );
    await loadGym();
    fillGymForm(currentGym);
    showStatus(
      willPublish ? "Gym is now published." : "Gym is now unpublished.",
      "success"
    );
  } catch (err) {
    console.error("togglePublish failed:", err);
    showStatus(err?.message || "Could not update publish status.", "error");
  } finally {
    setLoading(button, false);
    publishInFlight = false;
  }
}





async function deleteGym() {
  if (!currentUser) {
    showStatus("You must be signed in to delete a gym.", "error");
    return;
  }
  if (!currentGym) {
    showStatus("There is no gym profile to delete.", "error");
    return;
  }

  const confirmed = window.confirm(
    "Delete this gym profile? This removes the listing from ELEV8. (Uploaded images on Cloudinary cannot be deleted from the browser.)"
  );
  if (!confirmed) return;

  const button = el("delete-gym-btn");
  setLoading(button, true, "Deleting...");
  clearStatus();

  try {
    await deleteDoc(gymRef());
    currentGym = null;
    fillGymForm(null);
    showStatus("Gym profile deleted.");
  } catch (err) {
    console.error("deleteGym failed:", err);
    showStatus(err?.message || "Could not delete gym profile.", "error");
  } finally {
    setLoading(button, false);
  }
}




async function initGymProfile() {
  if (gymProfileInitialized) return;
  gymProfileInitialized = true;

  
  try {
    await loadGym();
    fillGymForm(currentGym);
  } catch (err) {
    console.error("initGymProfile load failed:", err);
    showStatus("Could not load your gym data. Please refresh the page.", "error");
  }

  
  const form = el("gym-profile-form");
  if (form) form.addEventListener("submit", saveGym);

  const publishBtn = el("publish-gym-btn");
  if (publishBtn) publishBtn.addEventListener("click", togglePublish);

  const deleteBtn = el("delete-gym-btn");
  if (deleteBtn) deleteBtn.addEventListener("click", deleteGym);

  const logoInput = el("gym-logo");
  if (logoInput) logoInput.addEventListener("change", handleLogoChange);

  const galleryInput = el("gym-gallery");
  if (galleryInput) galleryInput.addEventListener("change", handleGalleryChange);
}

onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  currentUser = user;

  if (page === "gym-profile.html") {
    try {
      await initGymProfile();
    } catch (err) {
      console.error("owner-gym.js init failed:", err);
      showStatus("Could not initialize the gym profile page. Please refresh.", "error");
    }
  }
});