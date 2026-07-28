













const admin = require("firebase-admin");
admin.initializeApp();
const db = admin.firestore();

async function backfillNameLower() {
  const snap = await db.collection("gyms").get();

  let updated = 0;
  let skipped = 0;

  
  let batch = db.batch();
  let opsInBatch = 0;

  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const name = data.name || "";
    const expectedNameLower = name.toLowerCase();

    if (data.nameLower === expectedNameLower) {
      skipped++;
      continue;
    }

    batch.update(docSnap.ref, { nameLower: expectedNameLower });
    updated++;
    opsInBatch++;

    if (opsInBatch === 500) {
      
      await batch.commit();
      batch = db.batch();
      opsInBatch = 0;
    }
  }

  if (opsInBatch > 0) {
    await batch.commit();
  }

  console.log(`Backfill complete. Updated: ${updated}, already correct: ${skipped}, total: ${snap.size}`);
}

backfillNameLower()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
  });
