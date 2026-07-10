// gyms-listing.js
// Powers gyms.html: loads published gyms from Firestore, renders real
// cards (logo, gallery photo, location, price), and supports search,
// location filter, and price-range filter — all client-side once loaded.
//
// Expected Firestore shape (matches owner-gym.js):
//   gyms/{ownerUid} -> { name, location, priceFrom, description,
//                         logoUrl, gallery: [{url,...}], published }
//
// Note: there is no "rating" field in the data model yet, so ratings
// are intentionally omitted from the card until that feature exists.

import { db } from "./firebase-init.js";
import {
  collection,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const money = new Intl.NumberFormat("en-GH", {
  style: "currency",
  currency: "GHS",
  maximumFractionDigits: 0
});

let allGyms = [];

function el(id) {
  return document.getElementById(id);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function cardImage(gym) {
  const src = gym.logoUrl || gym.gallery?.[0]?.url;
  if (src) {
    return `<img class="gym-card-img" src="${src}" alt="${escapeHtml(gym.name)}">`;
  }
  return `<div class="gym-card-img-placeholder"></div>`;
}

function renderCard(gym) {
  const priceLabel = gym.priceFrom ? money.format(gym.priceFrom) : "₵—";
  return `
    <div class="gym-card">
      ${cardImage(gym)}
      <div class="gym-card-body">
        <h3>${escapeHtml(gym.name) || "Unnamed Gym"}</h3>
        <div class="gym-card-meta">${escapeHtml(gym.location) || "Location not set"}</div>
        <div class="gym-card-price">From ${priceLabel} /mo</div>
        <a href="gym.html?id=${encodeURIComponent(gym.id)}" class="btn btn-block" style="margin-top:14px">View Gym</a>
      </div>
    </div>`;
}

function populateLocationFilter(gyms) {
  const select = el("gym-location-filter");
  if (!select) return;

  const locations = [...new Set(gyms.map((g) => (g.location || "").trim()).filter(Boolean))].sort();
  const current = select.value;

  select.innerHTML = `<option value="">All Locations</option>` +
    locations.map((loc) => `<option value="${escapeHtml(loc)}">${escapeHtml(loc)}</option>`).join("");

  if (locations.includes(current)) select.value = current;
}

function matchesPriceRange(price, rangeValue) {
  if (!rangeValue) return true;
  const [min, max] = rangeValue.split("-").map(Number);
  const value = Number(price) || 0;
  return value >= min && value <= max;
}

function renderResults() {
  const grid = el("gym-results-grid");
  if (!grid) return;

  const search = (el("gym-search-input")?.value || "").trim().toLowerCase();
  const location = el("gym-location-filter")?.value || "";
  const priceRange = el("gym-price-filter")?.value || "";

  const filtered = allGyms.filter((gym) => {
    const name = (gym.name || "").toLowerCase();
    const desc = (gym.description || "").toLowerCase();
    const matchesSearch = !search || name.includes(search) || desc.includes(search);
    const matchesLocation = !location || (gym.location || "") === location;
    const matchesPrice = matchesPriceRange(gym.priceFrom, priceRange);
    return matchesSearch && matchesLocation && matchesPrice;
  });

  if (!filtered.length) {
    grid.innerHTML = `<p class="table-empty">No gyms available yet. Check back soon!</p>`;
    return;
  }

  grid.innerHTML = filtered.map(renderCard).join("");
}

async function loadPublishedGyms() {
  const grid = el("gym-results-grid");
  try {
    const gymsQuery = query(collection(db, "gyms"), where("published", "==", true));
    const snap = await getDocs(gymsQuery);
    allGyms = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    populateLocationFilter(allGyms);

    if (!allGyms.length) {
      grid.innerHTML = `<p class="table-empty">No gyms have been published yet. Check back soon.</p>`;
      return;
    }

    renderResults();
  } catch (err) {
    console.error("Failed to load gyms:", err);
    if (grid) {
      grid.innerHTML = `<p class="table-empty">Could not load gyms right now. Please try again shortly.</p>`;
    }
  }
}

el("gym-search-input")?.addEventListener("input", renderResults);
el("gym-location-filter")?.addEventListener("change", renderResults);
el("gym-price-filter")?.addEventListener("change", renderResults);
el("gym-search-btn")?.addEventListener("click", (e) => {
  e.preventDefault();
  renderResults();
});

loadPublishedGyms();
