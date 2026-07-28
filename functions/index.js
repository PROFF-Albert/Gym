

































const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();



const PAYSTACK_SECRET_KEY = defineSecret("PAYSTACK_SECRET_KEY");

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







async function fetchWithRetry(url, options, { timeoutMs = 10000, retries = 2 } = {}) {
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(timer);
            
            if (!response.ok && response.status >= 500 && attempt < retries) {
                lastErr = new Error(`HTTP ${response.status}`);
                continue;
            }
            return response;
        } catch (err) {
            clearTimeout(timer);
            lastErr = err;
            if (attempt === retries) break;
        }
    }
    throw lastErr;
}

exports.confirmMembership = onCall(
    { secrets: [PAYSTACK_SECRET_KEY], region: "us-central1" },
    async (request) => {
        const uid = request.auth?.uid;
        if (!uid) {
            throw new HttpsError("unauthenticated", "You must be signed in to confirm a membership.");
        }

        const { reference, gymId, plan, name, email } = request.data || {};

        if (!reference || !gymId || !plan) {
            throw new HttpsError("invalid-argument", "Missing reference, gymId, or plan.");
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

        
        
        
        
        
        let verifyResponse;
        try {
            verifyResponse = await fetchWithRetry(
                `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
                {
                    method: "GET",
                    headers: {
                        Authorization: `Bearer ${PAYSTACK_SECRET_KEY.value()}`
                    }
                }
            );
        } catch (err) {
            logger.error("Paystack verify request failed", { reference, error: err.message });
            throw new HttpsError("internal", "Could not reach Paystack to verify payment.");
        }

        if (!verifyResponse.ok) {
            logger.error("Paystack verify HTTP error", { status: verifyResponse.status, reference });
            throw new HttpsError("internal", "Could not verify payment with Paystack.");
        }

        const verifyBody = await verifyResponse.json();
        const txData = verifyBody?.data;

        if (verifyBody?.status !== true || !txData) {
            logger.warn("Paystack verify returned non-success", { reference, body: verifyBody });
            throw new HttpsError("failed-precondition", "Payment could not be verified.");
        }

        if (txData.status !== "success") {
            throw new HttpsError("failed-precondition", `Payment status is "${txData.status}", not successful.`);
        }

        if ((txData.currency || "").toUpperCase() !== "GHS") {
            throw new HttpsError("failed-precondition", "Unexpected payment currency.");
        }

        
        
        
        
        
        
        const paidAmountMajorUnits = Number(txData.amount) / 100;
        if (!Number.isFinite(paidAmountMajorUnits) || Math.abs(paidAmountMajorUnits - expectedAmount) > 0.5) {
            logger.warn("Amount mismatch on payment verification", {
                reference, expectedAmount, paidAmountMajorUnits, gymId, plan
            });
            throw new HttpsError(
                "failed-precondition",
                `Paid amount does not match the ${plan} plan price for this gym.`
            );
        }

        
        
        
        
        
        
        const existingPayment = await db
            .collection("payments")
            .where("reference", "==", String(reference))
            .limit(1)
            .get();
        if (!existingPayment.empty) {
            logger.info("Duplicate confirmMembership call for already-processed transaction", { reference });
            return { status: "already_processed" };
        }

        
        
        
        
        
        
        const membershipRef = db.collection("memberships").doc(membershipDocId(uid, gymId));
        const paymentRef = db.collection("payments").doc();
        const startDate = new Date();
        const expiryDate = planExpiryDate(plan, startDate);

        const resolvedName = name || `${txData.customer?.first_name || ""} ${txData.customer?.last_name || ""}`.trim() || "";
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
                    gateway: "Paystack",
                    reference: String(reference),
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
                    paymentReference: String(reference),
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
            logger.error("confirmMembership transaction failed", { reference, gymId, uid, error: err.message });
            throw new HttpsError("internal", "Could not finalize membership. Please contact support with this reference: " + reference);
        }

        return { status: "confirmed", membershipId: membershipRef.id, expiryDate: expiryDate.toISOString() };
    }
);