import { auth, db } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-functions.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const money = new Intl.NumberFormat("en-GH", {
  style: "currency",
  currency: "GHS",
  maximumFractionDigits: 0
});

const functions = getFunctions();
const confirmMembership = httpsCallable(functions, "confirmMembership");






const PAYSTACK_PUBLIC_KEY = "pk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";

let currentUser = null;
let currentGym = null;
let gymId = null;

let selectedPlan = "Monthly"; 
let selectedAmount = 0;

const planAmounts = {
  Daily: 0,
  Weekly: 0,
  Monthly: 0
};

function el(id) {
  return document.getElementById(id);
}

function getQueryParam(param) {
  return new URLSearchParams(window.location.search).get(param);
}

function showStatus(message, type = "success") {
  const node = el("sub-status-message");
  if (!node) return;
  node.textContent = message;
  node.className = `form-alert ${type === "error" ? "form-alert-error" : "form-alert-success"}`;
  node.style.display = "block";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function loadGymAndOwner(id) {
  gymId = id;
  const docRef = doc(db, "gyms", gymId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) {
    showStatus("Gym not found.", "error");
    return;
  }
  currentGym = { id: snap.id, ...snap.data() };

  const titleNode = el("sub-page-title");
  if (titleNode) titleNode.textContent = `Join ${currentGym.name}`;
  const subtitleNode = el("sub-page-subtitle");
  if (subtitleNode) subtitleNode.textContent = `Location: ${currentGym.location || "Not set"}`;

  const priceFrom = Number(currentGym.priceFrom) || 0;

  planAmounts.Daily = priceFrom ? Math.max(1, Math.round(priceFrom / 20)) : 0;
  planAmounts.Weekly = priceFrom ? Math.max(1, Math.round(priceFrom / 3.5)) : 0;
  planAmounts.Monthly = priceFrom;

  const dailyNode = el("price-daily");
  if (dailyNode) dailyNode.innerHTML = `${money.format(planAmounts.Daily)}<span> / day</span>`;
  const weeklyNode = el("price-weekly");
  if (weeklyNode) weeklyNode.innerHTML = `${money.format(planAmounts.Weekly)}<span> / week</span>`;
  const monthlyNode = el("price-monthly");
  if (monthlyNode) monthlyNode.innerHTML = `${money.format(planAmounts.Monthly)}<span> / month</span>`;

  selectedAmount = planAmounts[selectedPlan];
  highlightSelectedPlanCard();
}

function highlightSelectedPlanCard() {
  ["Daily", "Weekly", "Monthly"].forEach((p) => {
    const card = el(`plan-${p.toLowerCase()}`);
    if (card) {
      if (p === selectedPlan) {
        card.classList.add("featured");
      } else {
        card.classList.remove("featured");
      }
    }
  });
}


async function hasExistingActiveMembership() {
  if (!currentUser || !gymId) return false;
  try {
    const snap = await getDoc(doc(db, "memberships", `${gymId}_${currentUser.uid}`));
    return snap.exists() && snap.data().membershipStatus === "active";
  } catch (err) {
    console.warn("Could not pre-check membership (non-fatal):", err);
    return false;
  }
}

async function handlePaystackPayment() {
  const confirmBtn = el("confirm-sub-btn");
  if (confirmBtn) confirmBtn.disabled = true;

  try {
    if (!currentGym) {
      showStatus("Gym details are still loading. Please wait a moment and try again.", "error");
      if (confirmBtn) confirmBtn.disabled = false;
      return;
    }

    const name = el("name").value.trim();
    const email = el("email").value.trim();
    const phone = el("phone").value.trim();

    if (!name || !email) {
      showStatus("Please enter your name and email address.", "error");
      if (confirmBtn) confirmBtn.disabled = false;
      return;
    }

    if (selectedAmount <= 0) {
      showStatus("Invalid plan price. Please contact the gym owner.", "error");
      if (confirmBtn) confirmBtn.disabled = false;
      return;
    }

    const hasActive = await hasExistingActiveMembership();
    if (hasActive) {
      showStatus("You already have an active membership at this gym.", "error");
      if (confirmBtn) confirmBtn.disabled = false;
      return;
    }

    const reference = "ELEV8-" + Date.now() + "-" + Math.floor(Math.random() * 1000000);

    
    const amountInKobo = Math.round(selectedAmount * 100);

    const paymentData = {
      key: PAYSTACK_PUBLIC_KEY,
      email: email,
      amount: amountInKobo,
      currency: "GHS",
      reference: reference,
      phone: phone || "0000000000",
      metadata: {
        custom_fields: [
          {
            display_name: "Gym Name",
            variable_name: "gym_name",
            value: currentGym.name
          },
          {
            display_name: "Plan",
            variable_name: "plan",
            value: selectedPlan
          },
          {
            display_name: "Customer Name",
            variable_name: "customer_name",
            value: name
          }
        ],
        gymId: currentGym.id,
        plan: selectedPlan,
        userId: currentUser?.uid || ""
      },
      callback: async function (response) {
        
        
        
        if (response.status !== true) {
          showStatus("Payment was not completed: " + response.message, "error");
          if (confirmBtn) confirmBtn.disabled = false;
          return;
        }

        showStatus("Payment received! Verifying and activating membership...", "success");

        const paystackReference = response.reference;

        try {
          const result = await confirmMembership({
            reference: paystackReference,
            gymId: currentGym.id,
            plan: selectedPlan,
            name,
            email
          });

          const status = result?.data?.status;

          if (status === "already_processed") {
            showStatus("This payment was already processed. Redirecting...", "success");
          } else {
            showStatus("Membership activated successfully! Redirecting...", "success");
          }

          setTimeout(() => {
            window.location.href = "userdashboard.html";
          }, 2000);
        } catch (err) {
          console.error("confirmMembership failed:", err);
          const message = err?.message || "Payment succeeded, but membership activation failed.";
          showStatus(`${message} Reference: ${paystackReference}`, "error");
          if (confirmBtn) confirmBtn.disabled = false;
        }
      },
      onClose: function () {
        showStatus("Payment window closed.", "error");
        if (confirmBtn) confirmBtn.disabled = false;
      }
    };

    
    if (typeof PaystackPop !== 'undefined') {
      const paymentEngine = PaystackPop.setup(paymentData);
      paymentEngine.openIframe();
    } else {
      throw new Error("Paystack payment gateway not loaded. Please check your internet connection.");
    }

  } catch (err) {
    console.error("Paystack initialization failed:", err);
    showStatus(err.message || "Could not initialize payment. Please try again.", "error");
    if (confirmBtn) confirmBtn.disabled = false;
  }
}

document.addEventListener("click", (e) => {
  const btn = e.target.closest(".select-plan-btn");
  if (!btn) return;
  selectedPlan = btn.dataset.plan;
  selectedAmount = planAmounts[selectedPlan];
  highlightSelectedPlanCard();
  showStatus(`Selected ${selectedPlan} Plan (${money.format(selectedAmount)})`, "success");
});

el("confirm-sub-btn")?.addEventListener("click", handlePaystackPayment);

onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  currentUser = user;

  const nameInput = el("name");
  const emailInput = el("email");
  if (nameInput) nameInput.value = user.displayName || "";
  if (emailInput) emailInput.value = user.email || "";

  const id = getQueryParam("id");
  if (id) {
    await loadGymAndOwner(id);
  } else {
    showStatus("No gym specified in URL parameters.", "error");
  }
});