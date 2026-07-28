










































import { db } from "./firebase-init.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const money = new Intl.NumberFormat("en-GH", {
  style: "currency",
  currency: "GHS",
  maximumFractionDigits: 0
});

const PAGE_SIZE = 12;


let lastDocSnapshot = null;
let isLoadingPage = false;
let reachedEnd = false;
let currentQueryToken = 0; 

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









async function populateLocationFilter() {
  const select = el("gym-location-filter");
  if (!select) return;

  let locations = [];

  try {
    const metaSnap = await getDoc(doc(db, "meta", "locations"));
    if (metaSnap.exists() && Array.isArray(metaSnap.data().list)) {
      locations = metaSnap.data().list;
    }
  } catch (err) {
    console.warn("Could not load meta/locations, falling back to scan:", err);
  }

  if (!locations.length) {
    try {
      const fallbackQuery = query(
        collection(db, "gyms"),
        where("published", "==", true),
        limit(200)
      );
      const snap = await getDocs(fallbackQuery);
      locations = [...new Set(snap.docs.map((d) => (d.data().location || "").trim()).filter(Boolean))];
    } catch (err) {
      console.error("Location filter fallback scan failed:", err);
    }
  }

  locations.sort();
  const current = select.value;
  select.innerHTML = `<option value="">All Locations</option>` +
    locations.map((loc) => `<option value="${escapeHtml(loc)}">${escapeHtml(loc)}</option>`).join("");
  if (locations.includes(current)) select.value = current;
}











function buildQuery(cursor) {
  const search = (el("gym-search-input")?.value || "").trim().toLowerCase();
  const location = el("gym-location-filter")?.value || "";
  const priceRange = el("gym-price-filter")?.value || "";

  const clauses = [where("published", "==", true)];

  if (location) {
    clauses.push(where("location", "==", location));
  }

  if (search) {
    
    
    
    const end = search.slice(0, -1) + String.fromCharCode(search.charCodeAt(search.length - 1) + 1);
    clauses.push(orderBy("nameLower"));
    clauses.push(where("nameLower", ">=", search));
    clauses.push(where("nameLower", "<", end));
  } else if (priceRange) {
    const [min, max] = priceRange.split("-").map(Number);
    clauses.push(orderBy("priceFrom"));
    clauses.push(where("priceFrom", ">=", min));
    clauses.push(where("priceFrom", "<=", max));
  } else {
    clauses.push(orderBy("nameLower"));
  }

  clauses.push(limit(PAGE_SIZE));
  if (cursor) clauses.push(startAfter(cursor));

  return query(collection(db, "gyms"), ...clauses);
}






function matchesPriceRange(price, rangeValue) {
  if (!rangeValue) return true;
  const [min, max] = rangeValue.split("-").map(Number);
  const value = Number(price) || 0;
  return value >= min && value <= max;
}


async function fetchPage({ reset }) {
  if (isLoadingPage) return;
  if (!reset && reachedEnd) return;

  const grid = el("gym-results-grid");
  const loadMoreBtn = el("gym-load-more-btn");
  const myToken = reset ? ++currentQueryToken : currentQueryToken;

  isLoadingPage = true;
  if (loadMoreBtn) loadMoreBtn.disabled = true;

  if (reset) {
    lastDocSnapshot = null;
    reachedEnd = false;
    if (grid) grid.innerHTML = `<p class="table-loading">Loading gyms…</p>`;
  }

  try {
    const search = (el("gym-search-input")?.value || "").trim();
    const priceRange = el("gym-price-filter")?.value || "";
    const q = buildQuery(lastDocSnapshot);
    const snap = await getDocs(q);

    
    if (myToken !== currentQueryToken) return;

    let docs = snap.docs;
    lastDocSnapshot = docs[docs.length - 1] || lastDocSnapshot;
    if (docs.length < PAGE_SIZE) reachedEnd = true;

    let gyms = docs.map((d) => ({ id: d.id, ...d.data() }));

   
    if (search && priceRange) {
      gyms = gyms.filter((g) => matchesPriceRange(g.priceFrom, priceRange));
    }

    if (!grid) return;

    if (reset) grid.innerHTML = "";

    if (reset && !gyms.length) {
      grid.innerHTML = `<p class="table-empty">No gyms match your search. Try different filters.</p>`;
    } else {
      grid.insertAdjacentHTML("beforeend", gyms.map(renderCard).join(""));
    }

    if (loadMoreBtn) {
      loadMoreBtn.style.display = reachedEnd ? "none" : "";
      loadMoreBtn.disabled = false;
    }
  } catch (err) {
    console.error("Failed to load gyms:", err);
    if (grid && reset) {
      grid.innerHTML = `<p class="table-empty">Could not load gyms right now. Please try again shortly.</p>`;
    }
  } finally {
    isLoadingPage = false;
  }
}




function debounce(fn, delayMs) {
  let timer = null;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), delayMs);
  };
}

const debouncedSearch = debounce(() => fetchPage({ reset: true }), 350);

el("gym-search-input")?.addEventListener("input", debouncedSearch);
el("gym-location-filter")?.addEventListener("change", () => fetchPage({ reset: true }));
el("gym-price-filter")?.addEventListener("change", () => fetchPage({ reset: true }));
el("gym-search-btn")?.addEventListener("click", (e) => {
  e.preventDefault();
  fetchPage({ reset: true });
});
el("gym-load-more-btn")?.addEventListener("click", () => fetchPage({ reset: false }));

populateLocationFilter();
fetchPage({ reset: true });