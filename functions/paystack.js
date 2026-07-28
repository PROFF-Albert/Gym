const axios = require("axios");
const { defineSecret } = require("firebase-functions/params");

const PAYSTACK_SECRET_KEY = defineSecret("PAYSTACK_SECRET_KEY");






async function verifyPaystackTransaction(reference) {
    const response = await axios.get(
        `https://api.paystack.co/transaction/verify/${reference}`,
        {
            headers: {
                Authorization: `Bearer ${PAYSTACK_SECRET_KEY.value()}`,
                "Content-Type": "application/json"
            }
        }
    );

    return response.data;
}

module.exports = {
    verifyPaystackTransaction,
    PAYSTACK_SECRET_KEY
};
