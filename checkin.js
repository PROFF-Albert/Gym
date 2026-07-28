import { auth, db } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  where
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const todayKey = new Date().toISOString().slice(0, 10);

function el(id) {
  return document.getElementById(id);
}

function fmtTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GH", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }).format(date);
}

function fmtDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GH", {
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(date);
}

function showStatus(nodeId, message, type = "success") {
  const node = el(nodeId);
  if (!node) return;
  node.textContent = message;
  node.className = `form-alert ${type === "error" ? "form-alert-error" : "form-alert-success"}`;
  node.style.display = "block";
}

function clearTable(body, emptyHtml) {
  if (!body) return;
  body.innerHTML = `<tr><td colspan="${emptyHtml.colspan}" style="text-align:center;color:var(--muted);padding:32px">${emptyHtml.text}</td></tr>`;
}

async function loadMemberDashboard(user) {
  const statusNode = el("member-checkin-status");
  const button = el("member-checkin-btn");
  const lastNode = el("member-last-checkin");
  const recentBody = el("member-checkin-table-body");
  const gymLogo = el("member-gym-logo");

  if (!statusNode || !button) return;

  button.disabled = true;
  button.textContent = "Checking membership...";
  statusNode.className = "form-alert form-alert-error";
  statusNode.style.display = "block";
  statusNode.textContent = "Loading your active membership...";

  try {
    const membershipsSnap = await getDocs(query(collection(db, "memberships"), where("memberId", "==", user.uid), limit(20)));
    const memberships = membershipsSnap.docs
      .map((snap) => ({ id: snap.id, ...snap.data() }))
      .filter((membership) => {
        if (membership.membershipStatus !== "active") return false;
        if (!membership.expiryDate) return true;
        const expiry = new Date(membership.expiryDate);
        return !Number.isNaN(expiry.getTime()) && expiry >= new Date();
      });

    memberships.sort((a, b) => {
      const aDate = new Date(a.createdAt?.seconds ? a.createdAt.seconds * 1000 : a.createdAt || a.startDate || 0);
      const bDate = new Date(b.createdAt?.seconds ? b.createdAt.seconds * 1000 : b.createdAt || b.startDate || 0);
      return bDate.getTime() - aDate.getTime();
    });

    const membership = memberships[0];
    if (!membership) {
      statusNode.className = "form-alert form-alert-error";
      statusNode.textContent = "You do not currently have an active membership with a gym.";
      button.disabled = true;
      button.textContent = "Check In Now";
      if (lastNode) lastNode.textContent = "—";
      if (gymLogo) gymLogo.innerHTML = "<span>GYM</span>";
      clearTable(recentBody, { colspan: 3, text: "No check-ins yet." });
      return;
    }

    const gymId = membership.gymId;
    const gymSnap = await getDoc(doc(db, "gyms", gymId));
    const gym = gymSnap.exists() ? gymSnap.data() : null;

    const gymName = gym?.name || membership.gymName || "Your gym";
    const gymLocation = gym?.location || membership.gymLocation || "—";
    const gymPhone = gym?.phone || "—";
    const gymEmail = gym?.email || "—";

    const gymNameNode = el("member-gym-name");
    const gymLocationNode = el("member-gym-location");
    const gymPhoneNode = el("member-gym-phone");
    const gymEmailNode = el("member-gym-email");

    if (gymNameNode) gymNameNode.textContent = gymName;
    if (gymLocationNode) gymLocationNode.textContent = gymLocation;
    if (gymPhoneNode) gymPhoneNode.textContent = gymPhone;
    if (gymEmailNode) gymEmailNode.textContent = gymEmail;

    if (gymLogo) {
      if (gym?.logoUrl) {
        gymLogo.innerHTML = `<img src="${gym.logoUrl}" alt="${gymName} logo">`;
      } else {
        gymLogo.innerHTML = "<span>GYM</span>";
      }
    }

    const checkinRef = doc(db, "gyms", gymId, "checkins", `${user.uid}_${todayKey}`);
    const checkinSnap = await getDoc(checkinRef);
    const alreadyCheckedIn = checkinSnap.exists();

    const recentSnap = await getDocs(query(collection(db, "gyms", gymId, "checkins"), orderBy("checkedInAtISO", "desc"), limit(10)));
    const recentCheckins = recentSnap.docs.map((snap) => ({ id: snap.id, ...snap.data() }));

    const todayCount = recentCheckins.filter((entry) => entry.dateKey === todayKey).length;
    const latest = recentCheckins[0];

    const countNode = el("member-checkin-count");
    if (countNode) countNode.textContent = String(alreadyCheckedIn ? 1 : 0);

    if (lastNode) {
      lastNode.textContent = alreadyCheckedIn
        ? `${fmtDate(checkinSnap.data()?.checkedInAtISO)} at ${fmtTime(checkinSnap.data()?.checkedInAtISO)}`
        : "—";
    }

    if (alreadyCheckedIn) {
      statusNode.className = "form-alert form-alert-success";
      statusNode.textContent = `You checked in today at ${fmtTime(checkinSnap.data()?.checkedInAtISO)}.`;
      button.disabled = true;
      button.textContent = "Checked In";
    } else {
      statusNode.className = "form-alert form-alert-success";
      statusNode.textContent = `Ready to check in at ${gymName}.`;
      button.disabled = false;
      button.textContent = "Check In Now";
    }

    button.onclick = async () => {
      button.disabled = true;
      button.textContent = "Checking in...";
      try {
        await setDoc(checkinRef, {
          checkinId: checkinRef.id,
          dateKey: todayKey,
          memberId: user.uid,
          memberName: user.displayName || user.email || "Member",
          memberEmail: user.email || "",
          gymId,
          gymName,
          ownerId: gym?.ownerId || gymId,
          membershipId: membership.id,
          membershipStatus: membership.membershipStatus || "active",
          checkedInAtISO: new Date().toISOString(),
          source: "member-dashboard"
        });

        await loadMemberDashboard(user);
      } catch (err) {
        console.error("Check-in failed:", err);
        statusNode.className = "form-alert form-alert-error";
        statusNode.textContent = "Could not record your check-in. You may already be checked in today.";
        button.disabled = false;
        button.textContent = "Check In Now";
      }
    };

    if (recentBody) {
      if (!recentCheckins.length) {
        clearTable(recentBody, { colspan: 3, text: "No check-ins yet." });
      } else {
        recentBody.innerHTML = recentCheckins
          .map((entry) => `
            <tr>
              <td>${fmtDate(entry.checkedInAtISO)} ${fmtTime(entry.checkedInAtISO)}</td>
              <td>${entry.gymName || gymName}</td>
              <td><span class="badge badge-green">Checked in</span></td>
            </tr>
          `)
          .join("");
      }
    }

    const bannerPill = document.querySelector(".banner-pills .banner-pill:nth-child(2)");
    if (bannerPill) {
      bannerPill.textContent = `Gym: ${gymName}`;
    }
    const bannerPillRecent = document.querySelector(".banner-pills .banner-pill:nth-child(3)");
    if (bannerPillRecent) {
      bannerPillRecent.textContent = `Recent Check-ins: ${todayCount}`;
    }
  } catch (err) {
    console.error("loadMemberDashboard failed:", err);
    statusNode.className = "form-alert form-alert-error";
    statusNode.textContent = "Could not load your membership or check-in state.";
    button.disabled = true;
    button.textContent = "Check In Now";
  }
}

async function loadOwnerDashboard(user) {
  const countNode = el("dashboard-attendance-count");
  const refreshBtn = el("attendance-refresh-btn");
  const summaryNode = el("attendance-summary");
  const tableBody = el("attendance-table-body");

  if (!countNode || !tableBody) return;

  const render = async () => {
    try {
      if (refreshBtn) {
        refreshBtn.disabled = true;
        refreshBtn.textContent = "Refreshing...";
      }

      const gymId = user.uid;
      const snap = await getDocs(query(collection(db, "gyms", gymId, "checkins"), orderBy("checkedInAtISO", "desc"), limit(50)));
      const checkins = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      const today = checkins.filter((entry) => entry.dateKey === todayKey);

      countNode.textContent = String(today.length);

      if (summaryNode) {
        const latest = checkins[0];
        summaryNode.innerHTML = `
          <span class="banner-pill">Today: ${today.length}</span>
          <span class="banner-pill">Unique members: ${new Set(today.map((item) => item.memberId)).size}</span>
          <span class="banner-pill">Latest: ${latest ? `${latest.memberName || "Member"} at ${fmtTime(latest.checkedInAtISO)}` : "—"}</span>
        `;
      }

      if (!today.length) {
        clearTable(tableBody, { colspan: 4, text: "No check-ins recorded today." });
      } else {
        tableBody.innerHTML = today
          .map((entry) => `
            <tr>
              <td>${fmtTime(entry.checkedInAtISO)}</td>
              <td>${entry.memberName || "Member"}</td>
              <td>${entry.gymName || "Your gym"}</td>
              <td><span class="badge badge-green">Checked in</span></td>
            </tr>
          `)
          .join("");
      }
    } catch (err) {
      console.error("loadOwnerDashboard failed:", err);
      countNode.textContent = "0";
      if (summaryNode) {
        summaryNode.innerHTML = `
          <span class="banner-pill">Today: 0</span>
          <span class="banner-pill">Unique members: 0</span>
          <span class="banner-pill">Latest: —</span>
        `;
      }
      clearTable(tableBody, { colspan: 4, text: "Could not load attendance." });
    } finally {
      if (refreshBtn) {
        refreshBtn.disabled = false;
        refreshBtn.textContent = "Refresh";
      }
    }
  };

  if (refreshBtn) {
    refreshBtn.onclick = render;
  }

  await render();
}

onAuthStateChanged(auth, async (user) => {
  if (!user) return;

  if (el("member-checkin-btn")) {
    await loadMemberDashboard(user);
  }

  if (el("dashboard-attendance-count")) {
    await loadOwnerDashboard(user);
  }
});
