






import { db } from "./firebase-init.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";



const money = new Intl.NumberFormat("en-GH", {
  style: "currency",
  currency: "GHS",
  maximumFractionDigits: 0
});



let currentGym = null;
let currentGymId = null;
let activeGalleryIndex = 0;



function el(id) {
  return document.getElementById(id);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function getGymIdFromUrl() {
  return new URLSearchParams(window.location.search).get("id");
}



function showLoading() {
  const banner = el("gym-page-title");
  if (banner) banner.textContent = "Loading…";

  const main = el("gym-main-content");
  if (main) main.style.display = "none";

  const stateNode = el("gym-page-state");
  if (stateNode) {
    stateNode.textContent = "Loading gym details…";
    stateNode.style.display = "block";
  }
}

function showError(message) {
  const main = el("gym-main-content");
  if (main) main.style.display = "none";

  const stateNode = el("gym-page-state");
  if (stateNode) {
    stateNode.textContent = message;
    stateNode.style.display = "block";
  }

  const banner = el("gym-page-title");
  if (banner) banner.textContent = "Gym Unavailable";
}

function showContent() {
  const main = el("gym-main-content");
  if (main) main.style.display = "";

  const stateNode = el("gym-page-state");
  if (stateNode) stateNode.style.display = "none";
}



async function loadGym(gymId) {
  const snap = await getDoc(doc(db, "gyms", gymId));
  if (!snap.exists()) return null;

  const data = { id: snap.id, ...snap.data() };
  if (!data.published) return null;

  return data;
}










const RELATED_FETCH_LIMIT = 4; 
const RELATED_DISPLAY_COUNT = 3;

async function loadRelatedGyms(gym, gymId) {
  if (!gym.location) return [];

  const gymsQuery = query(
    collection(db, "gyms"),
    where("published", "==", true),
    where("location", "==", gym.location),
    limit(RELATED_FETCH_LIMIT)
  );

  const snap = await getDocs(gymsQuery);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((g) => g.id !== gymId)
    .slice(0, RELATED_DISPLAY_COUNT);
}



function renderHero(gym) {
  const nameNode = el("gym-page-title");
  if (nameNode) nameNode.textContent = gym.name || "Unnamed Gym";

  const locationNode = el("gym-location-value");
  if (locationNode) locationNode.textContent = gym.location || "Location not set";

  const priceNode = el("gym-price-value");
  if (priceNode) priceNode.textContent = gym.priceFrom ? `From ${money.format(gym.priceFrom)}/mo` : "Price not set";

  const bannerMeta = el("gym-banner-meta");
  if (bannerMeta) {
    const parts = [];
    parts.push(escapeHtml(gym.location) || "Location not set");
    if (gym.priceFrom) parts.push(`From ${money.format(gym.priceFrom)}/mo`);
    bannerMeta.innerHTML = parts.join(" &nbsp;&middot;&nbsp; ");
  }

  const descNode = el("gym-description-value");
  if (descNode) descNode.textContent = gym.description || "No description available.";
}



function getGalleryImages(gym) {
  const images = [];
  if (gym.logoUrl) images.push({ url: gym.logoUrl, alt: `${gym.name || "Gym"} logo` });
  if (Array.isArray(gym.gallery)) {
    gym.gallery.forEach((image, index) => {
      if (image?.url) images.push({ url: image.url, alt: `${gym.name || "Gym"} photo ${index + 1}` });
    });
  }
  return images;
}

function renderGallery(gym) {
  const images = getGalleryImages(gym);
  const heroImageNode = el("gym-hero-image");
  const thumbStrip = el("gym-gallery-thumbs");

  if (!images.length) {
    if (heroImageNode) {
      heroImageNode.removeAttribute("src");
      heroImageNode.alt = "No image available";
    }
    if (thumbStrip) thumbStrip.innerHTML = "";
    return;
  }

  activeGalleryIndex = 0;
  setHeroImage(images, 0);

  if (thumbStrip) {
    thumbStrip.innerHTML = images.map((image, index) => `
      <button type="button" class="gym-gallery-thumb${index === 0 ? " active" : ""}" data-index="${index}">
        <img src="${image.url}" alt="${escapeHtml(image.alt)}">
      </button>
    `).join("");

    thumbStrip.querySelectorAll(".gym-gallery-thumb").forEach((btn) => {
      btn.addEventListener("click", () => setHeroImage(images, Number(btn.dataset.index)));
    });
  }
}

function setHeroImage(images, index) {
  const heroImageNode = el("gym-hero-image");
  if (!heroImageNode || !images[index]) return;

  activeGalleryIndex = index;

  heroImageNode.classList.add("fading");
  window.setTimeout(() => {
    heroImageNode.src = images[index].url;
    heroImageNode.alt = images[index].alt;
    heroImageNode.classList.remove("fading");
  }, 150);

  document.querySelectorAll(".gym-gallery-thumb").forEach((btn, btnIndex) => {
    btn.classList.toggle("active", btnIndex === index);
  });
}



function renderMembershipPlans(gym, gymId) {
  const container = el("gym-plans-container");
  if (!container) return;

  const priceFrom = Number(gym.priceFrom) || 0;
  const joinUrl = `user-subscription.html?id=${encodeURIComponent(gymId)}`;

  const plans = [
    {
      label: "Daily Plan",
      unit: "day",
      price: priceFrom ? Math.max(1, Math.round(priceFrom / 20)) : 0,
      blurb: "Access to all gym facilities for a single day."
    },
    {
      label: "Weekly Plan",
      unit: "week",
      price: priceFrom ? Math.max(1, Math.round(priceFrom / 3.5)) : 0,
      blurb: "Seven days of unlimited access. Best short-term value."
    },
    {
      label: "Monthly Plan",
      unit: "month",
      price: priceFrom,
      blurb: "Full monthly access at the lowest daily rate.",
      featured: true
    }
  ];

  container.innerHTML = plans.map((plan) => `
    <div class="plan-card${plan.featured ? " featured" : ""}">
      <h3>${escapeHtml(plan.label)}</h3>
      <div class="plan-price">${plan.price ? money.format(plan.price) : "₵—"}<span> / ${plan.unit}</span></div>
      <p>${escapeHtml(plan.blurb)}</p>
      <button class="btn" data-join-url="${joinUrl}">Join Now</button>
    </div>
  `).join("");

  container.querySelectorAll("[data-join-url]").forEach((btn) => {
    btn.addEventListener("click", () => {
      window.location.href = btn.dataset.joinUrl;
    });
  });
}



const WEEK_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function renderSchedule(gym) {
  const tbody = el("gym-schedule-tbody");
  if (!tbody) return;

  const schedule = gym.schedule;

  if (!schedule || typeof schedule !== "object") {
    tbody.innerHTML = `
      <tr>
        <td colspan="3" style="text-align:center;color:var(--muted)">Hours not available.</td>
      </tr>`;
    return;
  }

  tbody.innerHTML = WEEK_DAYS.map((day) => {
    const dayKey = day.toLowerCase();
    const hours = schedule[dayKey];
    const opens = hours?.opens || "—";
    const closes = hours?.closes || "—";
    return `
      <tr>
        <td>${day}</td>
        <td>${escapeHtml(opens)}</td>
        <td>${escapeHtml(closes)}</td>
      </tr>`;
  }).join("");
}



function renderContact(gym) {
  const phoneNode = el("gym-contact-phone");
  if (phoneNode) {
    if (gym.phone) {
      phoneNode.innerHTML = `<a href="tel:${escapeHtml(gym.phone)}">${escapeHtml(gym.phone)}</a>`;
    } else {
      phoneNode.textContent = "Not provided";
    }
  }

  const emailNode = el("gym-contact-email");
  if (emailNode) {
    if (gym.email) {
      emailNode.innerHTML = `<a href="mailto:${escapeHtml(gym.email)}">${escapeHtml(gym.email)}</a>`;
    } else {
      emailNode.textContent = "Not provided";
    }
  }

  const addressNode = el("gym-contact-address");
  if (addressNode) {
    addressNode.textContent = gym.address || "Not provided";
  }
}



function renderRelatedGyms(gyms) {
  const container = el("gym-related-container");
  if (!container) return;

  if (!gyms.length) {
    container.innerHTML = "";
    const section = el("gym-related-section");
    if (section) section.style.display = "none";
    return;
  }

  container.innerHTML = gyms.map((gym) => {
    const image = gym.logoUrl
      ? `<img class="gym-card-img" src="${gym.logoUrl}" alt="${escapeHtml(gym.name)}">`
      : `<div class="gym-card-img-placeholder"></div>`;
    const priceLabel = gym.priceFrom ? money.format(gym.priceFrom) : "₵—";

    return `
      <div class="gym-card">
        ${image}
        <div class="gym-card-body">
          <h3>${escapeHtml(gym.name) || "Unnamed Gym"}</h3>
          <div class="gym-card-meta">${escapeHtml(gym.location) || "Location not set"}</div>
          <div class="gym-card-price">From ${priceLabel} /mo</div>
          <a href="gym.html?id=${encodeURIComponent(gym.id)}" class="btn btn-block" style="margin-top:14px">View Gym</a>
        </div>
      </div>`;
  }).join("");
}



async function initGymDetailsPage() {
  showLoading();

  const gymId = getGymIdFromUrl();
  if (!gymId) {
    showError("Gym not found.");
    return;
  }

  currentGymId = gymId;

  try {
    const gym = await loadGym(gymId);

    if (!gym) {
      showError("Gym not found.");
      return;
    }

    currentGym = gym;
    showContent();

    renderHero(gym);
    renderGallery(gym);
    renderMembershipPlans(gym, gymId);
    renderSchedule(gym);
    renderContact(gym);

    try {
      const relatedGyms = await loadRelatedGyms(gym, gymId);
      renderRelatedGyms(relatedGyms);
    } catch (err) {
      console.error("Failed to load related gyms:", err);
      renderRelatedGyms([]);
    }
  } catch (err) {
    console.error("Failed to load gym:", err);
    showError("Could not load gym.");
  }
}

initGymDetailsPage();