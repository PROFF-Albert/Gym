const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { db, admin } = require("./firebase-admin");
const {
    verifyPaystackTransaction,
    PAYSTACK_SECRET_KEY,
} = require("./paystack");

const confirmMembership = onCall(
    {
        secrets: [PAYSTACK_SECRET_KEY],
    },
    async (request) => {
        const uid = request.auth?.uid;

        if (!uid) {
            throw new HttpsError(
                "unauthenticated",
                "You must be signed in."
            );
        }

        const {
            reference,
            gymId,
            plan,
            name,
            email,
        } = request.data;

        if (!reference || !gymId || !plan) {
            throw new HttpsError(
                "invalid-argument",
                "Missing required payment information."
            );
        }

        
        const verification = await verifyPaystackTransaction(reference);

        if (
            verification.status !== true ||
            verification.data.status !== "success"
        ) {
            throw new HttpsError(
                "failed-precondition",
                "Payment verification failed."
            );
        }

        const payment = verification.data;

        const amountPaid = Number(payment.amount) / 100; 
        const txRef = payment.reference;

        const result = await db.runTransaction(async (transaction) => {

            
            const gymRef = db.collection("gyms").doc(gymId);
            const gymSnap = await transaction.get(gymRef);

            if (!gymSnap.exists) {
                throw new HttpsError(
                    "not-found",
                    "Gym not found."
                );
            }

            const gym = gymSnap.data();

            let expectedAmount;

            switch (plan) {
                case "Daily":
                    expectedAmount = Math.max(1, Math.round(Number(gym.priceFrom) / 20));
                    break;

                case "Weekly":
                    expectedAmount = Math.max(1, Math.round(Number(gym.priceFrom) / 3.5));
                    break;

                default:
                    expectedAmount = Number(gym.priceFrom);
            }

            if (amountPaid !== expectedAmount) {
                throw new HttpsError(
                    "failed-precondition",
                    "Payment amount does not match the selected plan."
                );
            }

            
            const paymentRef =
                db.collection("payments").doc(String(reference));

            const paymentSnap =
                await transaction.get(paymentRef);

            if (paymentSnap.exists) {
                throw new HttpsError(
                    "already-exists",
                    "This payment has already been processed."
                );
            }

            
            const membershipRef =
                db.collection("memberships")
                    .doc(`${gymId}_${uid}`);

            const membershipSnap =
                await transaction.get(membershipRef);

            if (
                membershipSnap.exists &&
                membershipSnap.data().membershipStatus === "active"
            ) {
                throw new HttpsError(
                    "already-exists",
                    "You already have an active membership."
                );
            }

            
            
            
            
            const startDate = new Date();
            const expiryDate = new Date(startDate);

            switch (plan) {
                case "Daily":
                    expiryDate.setDate(expiryDate.getDate() + 1);
                    break;

                case "Weekly":
                    expiryDate.setDate(expiryDate.getDate() + 7);
                    break;

                default:
                    expiryDate.setMonth(expiryDate.getMonth() + 1);
            }

            const notificationRef = db.collection("notifications").doc();

            transaction.set(paymentRef, {
                paymentId: paymentRef.id,
                transactionId: String(reference),
                txRef,
                memberId: uid,
                memberName: name || "",
                memberEmail: email || "",
                ownerId: gym.ownerId,
                gymId,
                gymName: gym.name,
                amount: amountPaid,
                plan,
                status: "success",
                gateway: "Paystack",
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                paidAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            transaction.set(membershipRef, {
                membershipId: membershipRef.id,
                memberId: uid,
                ownerId: gym.ownerId,
                gymId,
                gymName: gym.name,
                memberName: name || "",
                memberEmail: email || "",
                plan,
                amount: amountPaid,
                paymentReference: txRef,
                membershipStatus: "active",
                paymentStatus: "success",
                startDate: startDate.toISOString(),
                expiryDate: expiryDate.toISOString(),
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            transaction.set(notificationRef, {
                ownerId: gym.ownerId,
                gymId,
                type: "new_membership",
                title: "New Membership",
                message: `${name || "A member"} joined ${gym.name} (${plan} plan).`,
                memberId: uid,
                read: false,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            return {
                status: "confirmed",
                membershipId: membershipRef.id,
                expiryDate: expiryDate.toISOString(),
            };
        });

        return result;
    }
);

module.exports = {
    confirmMembership,
};
