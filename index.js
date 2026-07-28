

































const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();



const FLUTTERWAVE_SECRET_KEY = defineSecret("FLUTTERWAVE_SECRET_KEY");

const PLAN_DIVISORS = {
  Daily: 20,
  Weekly: 3.5,
  Monthly: 1
};

function computePlanAmount(priceFrom, plan) {
  const base = Number(priceFrom) || 0;
  if (plan === "Monthly") return base;
  const divisor = PLAN_DIVISORS[plan];
  if (!divisor) return null;
  return base ? Math.max(1, Math.round(base / divisor)) : 0;
}

function membershipDocId(uid, gymId) {
  return `${gymId}_${uid}`;
}

function planExpiryDate(plan, startDate) {
  const expiry = new Date(startDate);
  if (plan === "Daily") expiry.setDate(expiry.getDate() + 1);
  else if (plan === "Weekly") expiry.setDate(expiry.getDate() + 7);
  else if (plan === "Monthly") expiry.setDate(expiry.getDate() + 30);
  return expiry;
}

exports.confirmMembership = onCall(
  { secrets: [FLUTTERWAVE_SECRET_KEY], region: "us-central1" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "You must be signed in to confirm a membership.");
    }

    const { transactionId, gymId, plan, name, email } = request.data || {};

    if (!transactionId || !gymId || !plan) {
      throw new HttpsError("invalid-argument", "Missing transactionId, gymId, or plan.");
    }
    if (!["Daily", "Weekly", "Monthly"].includes(plan)) {
      throw new HttpsError("invalid-argument", "Unrecognized plan.");
    }

    
    
    
    
    const gymSnap = await db.collection("gyms").doc(gymId).get();
    if (!gymSnap.exists) {
      throw new HttpsError("not-found", "Gym not found.");
    }
    const gym = gymSnap.data();

    const expectedAmount = computePlanAmount(gym.priceFrom, plan);
    if (!expectedAmount || expectedAmount <= 0) {
      throw new HttpsError("failed-precondition", "This gym has no valid price set for that plan.");
    }

    
    
    
    
    
    const verifyResponse = await fetch(
      `https://api.flutterwave.com/v3/transactions/${encodeURIComponent(transactionId)}/verify`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${FLUTTERWAVE_SECRET_KEY.value()}`
        }
      }
    );

    if (!verifyResponse.ok) {
      logger.error("Flutterwave verify HTTP error", { status: verifyResponse.status, transactionId });
      throw new HttpsError("internal", "Could not verify payment with Flutterwave.");
    }

    const verifyBody = await verifyResponse.json();
    const txData = verifyBody?.data;

    if (verifyBody?.status !== "success" || !txData) {
      logger.warn("Flutterwave verify returned non-success", { transactionId, body: verifyBody });
      throw new HttpsError("failed-precondition", "Payment could not be verified.");
    }

    if (txData.status !== "successful") {
      throw new HttpsError("failed-precondition", `Payment status is "${txData.status}", not successful.`);
    }

    if ((txData.currency || "").toUpperCase() !== "GHS") {
      throw new HttpsError("failed-precondition", "Unexpected payment currency.");
    }

    
    
    
    
    
    const paidAmount = Number(txData.amount);
    if (!Number.isFinite(paidAmount) || Math.abs(paidAmount - expectedAmount) > 0.5) {
      logger.warn("Amount mismatch on payment verification", {
        transactionId, expectedAmount, paidAmount, gymId, plan
      });
      throw new HttpsError(
        "failed-precondition",
        `Paid amount does not match the ${plan} plan price for this gym.`
      );
    }

    
    
    
    
    
    
    const existingPayment = await db
      .collection("payments")
      .where("reference", "==", String(transactionId))
      .limit(1)
      .get();
    if (!existingPayment.empty) {
      logger.info("Duplicate confirmMembership call for already-processed transaction", { transactionId });
      return { status: "already_processed" };
    }

    
    
    
    
    
    
    const membershipRef = db.collection("memberships").doc(membershipDocId(uid, gymId));
    const paymentRef = db.collection("payments").doc();
    const startDate = new Date();
    const expiryDate = planExpiryDate(plan, startDate);

    const resolvedName = name || txData.customer?.name || "";
    const resolvedEmail = email || txData.customer?.email || "";

    try {
      await db.runTransaction(async (tx) => {
        const existingMembership = await tx.get(membershipRef);
        if (existingMembership.exists && existingMembership.data().membershipStatus === "active") {
          throw new HttpsError("already-exists", "You already have an active membership at this gym.");
        }

        tx.set(paymentRef, {
          paymentId: paymentRef.id,
          memberId: uid,
          memberName: resolvedName,
          memberEmail: resolvedEmail,
          gymId,
          gymName: gym.name,
          ownerId: gym.ownerId,
          amount: expectedAmount,
          plan,
          gateway: "Flutterwave",
          reference: String(transactionId),
          status: "success",
          paidAt: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        tx.set(membershipRef, {
          membershipId: membershipRef.id,
          memberId: uid,
          ownerId: gym.ownerId,
          gymId,
          memberName: resolvedName,
          memberEmail: resolvedEmail,
          gymName: gym.name,
          plan,
          amount: expectedAmount,
          paymentReference: String(transactionId),
          paymentStatus: "success",
          membershipStatus: "active",
          startDate: startDate.toISOString(),
          expiryDate: expiryDate.toISOString(),
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        tx.set(db.collection("notifications").doc(), {
          userId: uid,
          type: "membership",
          title: "Membership activated",
          message: `Your membership for ${gym.name} (${plan} Plan) has been activated successfully!`,
          read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        tx.set(db.collection("notifications").doc(), {
          userId: gym.ownerId,
          type: "membership",
          title: "New member joined",
          message: `${resolvedName || "A member"} has joined your gym under the ${plan} Plan. Payment of GHS ${expectedAmount} received.`,
          read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        tx.set(db.collection("notifications").doc(), {
          userId: "admin",
          type: "subscription",
          title: "New gym subscription",
          message: `A new subscription of GHS ${expectedAmount} was paid by ${resolvedName || "a member"} for ${gym.name}.`,
          read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      });
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      logger.error("confirmMembership transaction failed", { transactionId, gymId, uid, error: err.message });
      throw new HttpsError("internal", "Could not finalize membership. Please contact support with this reference: " + transactionId);
    }

    return { status: "confirmed", membershipId: membershipRef.id, expiryDate: expiryDate.toISOString() };
  }
);
