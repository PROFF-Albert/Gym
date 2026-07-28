import { auth, db } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  startAfter,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

























const PAGE_SIZE = 25;

const money = new Intl.NumberFormat("en-GH", {
  style: "currency",
  currency: "GHS",
  maximumFractionDigits: 0
});


let allUsers = [];
let allGyms = [];
let allSubs = [];
let allPayments = [];



const pageState = {
  users: { cursor: null, done: false, loading: false },
  gyms: { cursor: null, done: false, loading: false },
  subscriptions: { cursor: null, done: false, loading: false },
  payments: { cursor: null, done: false, loading: false }
};

let pendingAction = null;

function el(id) {
  return document.getElementById(id);
}

let adminStatusTimer = null;

function showStatus(message, type = "success") {
  const node = el("admin-status-message");
  if (!node) return;
  node.textContent = message;
  node.className = `form-alert form-toast ${type === "error" ? "form-alert-error" : "form-alert-success"}`;
  node.style.display = "block";
  if (adminStatusTimer) clearTimeout(adminStatusTimer);
  adminStatusTimer = setTimeout(() => {
    node.style.display = "none";
  }, 5000);
}

function formatDate(value) {
  if (!value) return "-";
  if (value.toDate) return value.toDate().toLocaleDateString();
  if (typeof value === "string") return value;
  return "-";
}

function statusBadge(status) {
  const normalized = (status || "active").toLowerCase();
  const map = {
    active: "badge-green",
    published: "badge-green",
    success: "badge-green",
    suspended: "badge-red",
    failed: "badge-red",
    draft: "badge-yellow",
    pending: "badge-yellow",
    expired: "badge-yellow",
    cancelled: "badge-red"
  };
  const cls = map[normalized] || "badge-blue";
  return `<span class="badge ${cls}">${normalized}</span>`;
}

function openConfirm(title, message, onConfirm) {
  el("admin-modal-title").textContent = title;
  el("admin-modal-text").textContent = message;
  pendingAction = onConfirm;
  el("admin-modal-overlay").classList.add("open");
}

function closeConfirm() {
  pendingAction = null;
  el("admin-modal-overlay").classList.remove("open");
}

el("admin-modal-cancel")?.addEventListener("click", closeConfirm);
el("admin-modal-overlay")?.addEventListener("click", (e) => {
  if (e.target.id === "admin-modal-overlay") closeConfirm();
});
el("admin-modal-confirm")?.addEventListener("click", async () => {
  if (!pendingAction) return closeConfirm();
  const action = pendingAction;
  closeConfirm();
  await action();
});








async function fetchNextPage(collectionName, targetArrayGetter, targetArraySetter) {
  const state = pageState[collectionName];
  if (state.loading || state.done) return false;

  state.loading = true;
  try {
    const clauses = [limit(PAGE_SIZE)];
    if (state.cursor) clauses.push(startAfter(state.cursor));

    const snap = await getDocs(query(collection(db, collectionName), ...clauses));

    if (snap.docs.length < PAGE_SIZE) state.done = true;
    if (snap.docs.length) state.cursor = snap.docs[snap.docs.length - 1];

    const newRows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    targetArraySetter([...targetArrayGetter(), ...newRows]);
    return snap.docs.length > 0;
  } finally {
    state.loading = false;
  }
}

async function loadMoreUsers() {
  return fetchNextPage("users", () => allUsers, (v) => { allUsers = v; });
}
async function loadMoreGyms() {
  return fetchNextPage("gyms", () => allGyms, (v) => { allGyms = v; });
}
async function loadMoreSubs() {
  return fetchNextPage("subscriptions", () => allSubs, (v) => { allSubs = v; });
}
async function loadMorePayments() {
  return fetchNextPage("payments", () => allPayments, (v) => { allPayments = v; });
}









function renderStats() {
  const members = allUsers.filter((u) => u.role === "member");
  const owners = allUsers.filter((u) => u.role === "owner");
  const published = allGyms.filter((g) => g.published);
  const activeSubs = allSubs.filter((s) => (s.status || "active").toLowerCase() === "active");
  const revenue = allPayments
    .filter((p) => (p.status || "").toLowerCase() === "success")
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  const suffix = (state) => (state.done ? "" : "+");

  el("stat-members").textContent = members.length + suffix(pageState.users);
  el("stat-owners").textContent = owners.length + suffix(pageState.users);
  el("stat-gyms").textContent = allGyms.length + suffix(pageState.gyms);
  el("stat-published").textContent = published.length + suffix(pageState.gyms);
  el("stat-subs").textContent = activeSubs.length + suffix(pageState.subscriptions);
  el("stat-revenue").textContent = money.format(revenue) + suffix(pageState.payments);
}






function ensureLoadMoreButton(panelId, tbodyId, onLoadMore) {
  const panel = el(panelId);
  if (!panel) return null;

  const btnId = `${tbodyId}-load-more`;
  let btn = el(btnId);
  if (!btn) {
    btn = document.createElement("button");
    btn.id = btnId;
    btn.type = "button";
    btn.className = "btn btn-sm";
    btn.style.marginTop = "16px";
    btn.textContent = "Load More";
    panel.appendChild(btn);
  }

  btn.onclick = async () => {
    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = "Loading...";
    try {
      await onLoadMore();
    } catch (err) {
      console.error(`Load more failed for ${tbodyId}:`, err);
      showStatus("Could not load more rows. Please try again.", "error");
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  };

  return btn;
}

function updateLoadMoreVisibility(btn, state) {
  if (!btn) return;
  btn.style.display = state.done ? "none" : "";
}




function ensureLoadedOnlyNote(inputId) {
  const input = el(inputId);
  if (!input || input.dataset.loadedNoteAdded) return;
  input.dataset.loadedNoteAdded = "1";

  const note = document.createElement("div");
  note.className = "form-hint";
  note.style.cssText = "font-size:12px;color:var(--muted);margin-top:4px";
  note.textContent = "Searches rows loaded so far. Use Load More to bring in additional rows.";
  input.insertAdjacentElement("afterend", note);
}



function renderMembers() {
  const search = (el("members-search")?.value || "").toLowerCase();
  const statusFilter = el("members-status-filter")?.value || "";

  const rows = allUsers
    .filter((u) => u.role === "member")
    .filter((u) => {
      const name = `${u.firstName || ""} ${u.lastName || ""}`.toLowerCase();
      const email = (u.email || "").toLowerCase();
      const matchesSearch = !search || name.includes(search) || email.includes(search);
      const status = (u.status || "active").toLowerCase();
      const matchesStatus = !statusFilter || status === statusFilter;
      return matchesSearch && matchesStatus;
    });

  const tbody = el("members-tbody");
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="table-empty">${allUsers.length ? "No members match the loaded rows." : "No members found."}</td></tr>`;
  } else {
    tbody.innerHTML = rows.map((u) => {
      const status = (u.status || "active").toLowerCase();
      const isSuspended = status === "suspended";
      return `
        <tr>
          <td>${u.firstName || ""} ${u.lastName || ""}</td>
          <td>${u.email || "-"}</td>
          <td>${formatDate(u.createdAt)}</td>
          <td>${statusBadge(status)}</td>
          <td>
            <div class="row-actions">
              <button class="btn btn-sm" data-action="toggle-user-status" data-id="${u.id}" data-next="${isSuspended ? "active" : "suspended"}">
                ${isSuspended ? "Activate" : "Suspend"}
              </button>
              <button class="btn btn-sm btn-danger" data-action="delete-user" data-id="${u.id}" data-name="${(u.firstName || "") + " " + (u.lastName || "")}">Delete</button>
            </div>
          </td>
        </tr>`;
    }).join("");
  }

  ensureLoadedOnlyNote("members-search");
  const btn = ensureLoadMoreButton("panel-members", "members-tbody", async () => {
    await loadMoreUsers();
    renderMembers();
    renderOwners();
    renderStats();
  });
  updateLoadMoreVisibility(btn, pageState.users);
}



function renderOwners() {
  const search = (el("owners-search")?.value || "").toLowerCase();
  const statusFilter = el("owners-status-filter")?.value || "";

  const rows = allUsers
    .filter((u) => u.role === "owner")
    .filter((u) => {
      const name = `${u.firstName || ""} ${u.lastName || ""}`.toLowerCase();
      const email = (u.email || "").toLowerCase();
      const matchesSearch = !search || name.includes(search) || email.includes(search);
      const status = (u.status || "active").toLowerCase();
      const matchesStatus = !statusFilter || status === statusFilter;
      return matchesSearch && matchesStatus;
    });

  const tbody = el("owners-tbody");
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="table-empty">${allUsers.length ? "No gym owners match the loaded rows." : "No gym owners found."}</td></tr>`;
  } else {
    tbody.innerHTML = rows.map((u) => {
      
      
      const gym = allGyms.find((g) => g.ownerId === u.id || g.id === u.id);
      const status = (u.status || "active").toLowerCase();
      const isSuspended = status === "suspended";
      return `
        <tr>
          <td>${u.firstName || ""} ${u.lastName || ""}</td>
          <td>${u.email || "-"}</td>
          <td>${gym ? gym.name : "-"}</td>
          <td>${formatDate(u.createdAt)}</td>
          <td>${statusBadge(status)}</td>
          <td>
            <div class="row-actions">
              <button class="btn btn-sm" data-action="toggle-user-status" data-id="${u.id}" data-next="${isSuspended ? "active" : "suspended"}">
                ${isSuspended ? "Activate" : "Suspend"}
              </button>
              <button class="btn btn-sm btn-danger" data-action="delete-user" data-id="${u.id}" data-name="${(u.firstName || "") + " " + (u.lastName || "")}">Delete</button>
            </div>
          </td>
        </tr>`;
    }).join("");
  }

  ensureLoadedOnlyNote("owners-search");
  const btn = ensureLoadMoreButton("panel-owners", "owners-tbody", async () => {
    await loadMoreUsers();
    renderMembers();
    renderOwners();
    renderStats();
  });
  updateLoadMoreVisibility(btn, pageState.users);
}



function renderGyms() {
  const search = (el("gyms-search")?.value || "").toLowerCase();
  const statusFilter = el("gyms-status-filter")?.value || "";

  const rows = allGyms.filter((g) => {
    const name = (g.name || "").toLowerCase();
    const location = (g.location || "").toLowerCase();
    const matchesSearch = !search || name.includes(search) || location.includes(search);
    const status = g.published ? "published" : "draft";
    const matchesStatus = !statusFilter || status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const tbody = el("gyms-tbody");
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="table-empty">${allGyms.length ? "No gyms match the loaded rows." : "No gyms found."}</td></tr>`;
  } else {
    tbody.innerHTML = rows.map((g) => {
      
      
      
      const owner = allUsers.find((u) => u.id === g.ownerId);
      const status = g.published ? "published" : "draft";
      return `
        <tr>
          <td>${g.name || "-"}</td>
          <td>${owner ? `${owner.firstName || ""} ${owner.lastName || ""}` : "-"}</td>
          <td>${g.location || "-"}</td>
          <td>${g.priceFrom ? money.format(g.priceFrom) : "-"}</td>
          <td>${statusBadge(status)}</td>
          <td>
            <div class="row-actions">
              <button class="btn btn-sm" data-action="toggle-gym-publish" data-id="${g.id}" data-next="${!g.published}">
                ${g.published ? "Unpublish" : "Publish"}
              </button>
              <button class="btn btn-sm btn-danger" data-action="delete-gym" data-id="${g.id}" data-name="${g.name || "this gym"}">Delete</button>
            </div>
          </td>
        </tr>`;
    }).join("");
  }

  ensureLoadedOnlyNote("gyms-search");
  const btn = ensureLoadMoreButton("panel-gyms", "gyms-tbody", async () => {
    await loadMoreGyms();
    renderGyms();
    renderOwners();
    renderStats();
  });
  updateLoadMoreVisibility(btn, pageState.gyms);
}



function renderSubs() {
  const search = (el("subs-search")?.value || "").toLowerCase();
  const statusFilter = el("subs-status-filter")?.value || "";

  const rows = allSubs.filter((s) => {
    const member = (s.memberName || "").toLowerCase();
    const gym = (s.gymName || "").toLowerCase();
    const matchesSearch = !search || member.includes(search) || gym.includes(search);
    const status = (s.status || "active").toLowerCase();
    const matchesStatus = !statusFilter || status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const tbody = el("subs-tbody");
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="table-empty">${allSubs.length ? "No subscriptions match the loaded rows." : "No subscriptions yet."}</td></tr>`;
  } else {
    tbody.innerHTML = rows.map((s) => {
      const status = (s.status || "active").toLowerCase();
      return `
        <tr>
          <td>${s.memberName || "-"}</td>
          <td>${s.gymName || "-"}</td>
          <td>${s.plan || "-"}</td>
          <td>${formatDate(s.startDate)}</td>
          <td>${formatDate(s.endDate)}</td>
          <td>${statusBadge(status)}</td>
          <td>
            <div class="row-actions">
              <button class="btn btn-sm btn-danger" data-action="cancel-sub" data-id="${s.id}" ${status === "cancelled" ? "disabled" : ""}>
                Cancel
              </button>
            </div>
          </td>
        </tr>`;
    }).join("");
  }

  ensureLoadedOnlyNote("subs-search");
  const btn = ensureLoadMoreButton("panel-subscriptions", "subs-tbody", async () => {
    await loadMoreSubs();
    renderSubs();
    renderStats();
  });
  updateLoadMoreVisibility(btn, pageState.subscriptions);
}



function renderPayments() {
  const search = (el("payments-search")?.value || "").toLowerCase();
  const statusFilter = el("payments-status-filter")?.value || "";

  const rows = allPayments.filter((p) => {
    const member = (p.memberName || "").toLowerCase();
    const gym = (p.gymName || "").toLowerCase();
    const matchesSearch = !search || member.includes(search) || gym.includes(search);
    const status = (p.status || "").toLowerCase();
    const matchesStatus = !statusFilter || status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const tbody = el("payments-tbody");
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="table-empty">${allPayments.length ? "No payments match the loaded rows." : "No payment records yet."}</td></tr>`;
  } else {
    tbody.innerHTML = rows.map((p) => `
        <tr>
          <td>${formatDate(p.createdAt)}</td>
          <td>${p.memberName || "-"}</td>
          <td>${p.gymName || "-"}</td>
          <td>${p.amount ? money.format(p.amount) : "-"}</td>
          <td>${p.method || "-"}</td>
          <td>${statusBadge(p.status)}</td>
        </tr>`).join("");
  }

  ensureLoadedOnlyNote("payments-search");
  const btn = ensureLoadMoreButton("panel-payments", "payments-tbody", async () => {
    await loadMorePayments();
    renderPayments();
    renderStats();
  });
  updateLoadMoreVisibility(btn, pageState.payments);
}

function renderAll() {
  renderStats();
  renderMembers();
  renderOwners();
  renderGyms();
  renderSubs();
  renderPayments();
}



async function toggleUserStatus(uid, nextStatus) {
  await updateDoc(doc(db, "users", uid), { status: nextStatus });
  const user = allUsers.find((u) => u.id === uid);
  if (user) user.status = nextStatus;
  renderMembers();
  renderOwners();
  showStatus(`Account ${nextStatus === "suspended" ? "suspended" : "reactivated"}.`);
}

async function deleteUser(uid) {
  await deleteDoc(doc(db, "users", uid));
  allUsers = allUsers.filter((u) => u.id !== uid);
  renderStats();
  renderMembers();
  renderOwners();
  showStatus("Account record deleted from the platform.");
}

async function toggleGymPublish(gymId, nextPublished) {
  await updateDoc(doc(db, "gyms", gymId), { published: nextPublished });
  const gym = allGyms.find((g) => g.id === gymId);
  if (gym) gym.published = nextPublished;
  renderStats();
  renderGyms();
  showStatus(`Gym ${nextPublished ? "published" : "unpublished"}.`);
}

async function deleteGym(gymId) {
  await deleteDoc(doc(db, "gyms", gymId));
  allGyms = allGyms.filter((g) => g.id !== gymId);
  renderStats();
  renderGyms();
  renderOwners();
  showStatus("Gym listing deleted.");
}

async function cancelSubscription(subId) {
  await updateDoc(doc(db, "subscriptions", subId), { status: "cancelled" });
  const sub = allSubs.find((s) => s.id === subId);
  if (sub) sub.status = "cancelled";
  renderStats();
  renderSubs();
  showStatus("Subscription cancelled.");
}



document.addEventListener("click", (e) => {
  const button = e.target.closest("button[data-action]");
  if (!button) return;
  const { action, id, next, name } = button.dataset;

  try {
    switch (action) {
      case "toggle-user-status":
        openConfirm(
          next === "suspended" ? "Suspend Account" : "Activate Account",
          next === "suspended"
            ? `This will block ${name || "this user"} from signing in until reactivated. Continue?`
            : `This will restore access for ${name || "this user"}. Continue?`,
          () => toggleUserStatus(id, next)
        );
        break;
      case "delete-user":
        openConfirm(
          "Delete Account",
          `This permanently removes ${name || "this account"}'s platform record. This cannot be undone. Continue?`,
          () => deleteUser(id)
        );
        break;
      case "toggle-gym-publish":
        toggleGymPublish(id, next === "true");
        break;
      case "delete-gym":
        openConfirm(
          "Delete Gym Listing",
          `This permanently deletes ${name}'s listing. This cannot be undone. Continue?`,
          () => deleteGym(id)
        );
        break;
      case "cancel-sub":
        openConfirm(
          "Cancel Subscription",
          "This marks the subscription as cancelled. Continue?",
          () => cancelSubscription(id)
        );
        break;
    }
  } catch (err) {
    showStatus(err.message || "Action failed.", "error");
  }
});






["members-search", "members-status-filter"].forEach((id) => el(id)?.addEventListener("input", renderMembers));
["owners-search", "owners-status-filter"].forEach((id) => el(id)?.addEventListener("input", renderOwners));
["gyms-search", "gyms-status-filter"].forEach((id) => el(id)?.addEventListener("input", renderGyms));
["subs-search", "subs-status-filter"].forEach((id) => el(id)?.addEventListener("input", renderSubs));
["payments-search", "payments-status-filter"].forEach((id) => el(id)?.addEventListener("input", renderPayments));



onAuthStateChanged(auth, async (user) => {
  if (!user) return; 

  
  
  
  
  
  
  
  try {
    const userSnap = await getDoc(doc(db, "users", user.uid));
    const role = userSnap.exists() ? userSnap.data().role : null;
    if (role !== "admin") {
      showStatus("You are not authorized to view the admin dashboard.", "error");
      window.location.href = "login.html";
      return;
    }
  } catch (err) {
    console.error("Admin role check failed:", err);
    showStatus("Could not verify admin access.", "error");
    return;
  }

  try {
    
    await Promise.all([loadMoreUsers(), loadMoreGyms(), loadMoreSubs(), loadMorePayments()]);
    renderAll();
  } catch (err) {
    console.error("Admin dashboard load failed:", err);
    showStatus("Could not load platform data. Check your connection and Firestore rules.", "error");
  }
});