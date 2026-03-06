'use strict';

/**
 * seedFromJson.js — Load seed data from JSON files into MongoDB
 *
 * Reads  ./data/orders.json  and  ./data/feedback.json  then inserts
 * them into the local MongoDB database defined in your .env file.
 *
 * Usage:
 *   node seedFromJson.js               → insert only (skips existing records)
 *   node seedFromJson.js --clear       → drop both collections first, then insert
 *   node seedFromJson.js --orders      → import only orders
 *   node seedFromJson.js --feedback    → import only feedback
 *   node seedFromJson.js --clear --orders   → clear + import orders only
 *
 * Place your JSON files at:
 *   ShopSmartExternalServer/data/orders.json
 *   ShopSmartExternalServer/data/feedback.json
 */

require('dotenv').config();

const fs        = require('fs');
const path      = require('path');
const mongoose  = require('mongoose');

const Order              = require('./src/models/Order');
const FeedbackSubmission = require('./src/models/FeedbackSubmission');

// ─── CLI flags ────────────────────────────────────────────────────────────────
const args          = process.argv.slice(2);
const CLEAR         = args.includes('--clear');
const ONLY_ORDERS   = args.includes('--orders');
const ONLY_FEEDBACK = args.includes('--feedback');
const RUN_ORDERS    = !ONLY_FEEDBACK;   // true unless --feedback is the sole flag
const RUN_FEEDBACK  = !ONLY_ORDERS;

// ─── File paths ───────────────────────────────────────────────────────────────
const DATA_DIR      = path.join(__dirname, 'seedData');
const ORDERS_FILE   = path.join(DATA_DIR, 'orders.json');
const FEEDBACK_FILE = path.join(DATA_DIR, 'feedback.json');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Read and parse a JSON file. Returns an array or throws with a clear message. */
const readJsonFile = (filePath) => {
  const label = path.basename(filePath);

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}\n  → Make sure you placed ${label} inside the /data folder.`);
  }

  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    throw new Error(`Could not read ${label}: ${err.message}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`${label} contains invalid JSON: ${err.message}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON array at the top level.`);
  }

  return parsed;
};

/** Print a coloured section header to stdout */
const header = (text) => console.log(`\n${'─'.repeat(52)}\n  ${text}\n${'─'.repeat(52)}`);

// ─── Import: Orders ───────────────────────────────────────────────────────────

const importOrders = async () => {
  header('Importing orders.json → orders collection');

  const records = readJsonFile(ORDERS_FILE);
  console.log(`  📂  Records loaded from file : ${records.length}`);

  if (CLEAR) {
    await Order.deleteMany({});
    console.log('  🗑️   Collection cleared        : orders');
  }

  let inserted  = 0;
  let skipped   = 0;
  let failed    = 0;
  const errors  = [];

  for (const record of records) {
    if (!record.order_id) {
      errors.push({ record: JSON.stringify(record).slice(0, 80), reason: 'Missing order_id' });
      failed++;
      continue;
    }

    try {
      // Skip if already exists (idempotent re-runs)
      const exists = await Order.exists({ order_id: record.order_id.toUpperCase() });
      if (exists) {
        skipped++;
        continue;
      }

      // Coerce date strings → Date objects
      if (record.order_timestamp_utc) record.order_timestamp_utc = new Date(record.order_timestamp_utc);
      if (record.order_timestamp_ghana) record.order_timestamp_ghana = new Date(record.order_timestamp_ghana);
      if (record.ingested_at) record.ingested_at = new Date(record.ingested_at);

      await Order.create(record);
      inserted++;
    } catch (err) {
      errors.push({ order_id: record.order_id, reason: err.message });
      failed++;
    }
  }

  // ── Result summary ─────────────────────────────────────────────────────────
  console.log(`\n  ✅  Inserted  : ${inserted}`);
  console.log(`  ⏭️   Skipped   : ${skipped}  (already in DB)`);
  console.log(`  ❌  Failed    : ${failed}`);

  if (errors.length) {
    console.log('\n  Failed records:');
    errors.forEach((e) => console.log(`    • ${e.order_id || e.record} → ${e.reason}`));
  }

  // DB totals
  const dbTotal     = await Order.countDocuments();
  const fulfilled   = await Order.countDocuments({ order_status: 'FULFILLED' });
  const pending     = await Order.countDocuments({ order_status: 'PENDING' });
  const cancelled   = await Order.countDocuments({ order_status: 'CANCELLED' });
  const returned    = await Order.countDocuments({ order_status: 'RETURNED' });
  const mismatched  = await Order.countDocuments({ line_total_mismatch: true });

  console.log('\n  ── DB snapshot ───────────────────────────────');
  console.log(`     Total orders in DB    : ${dbTotal}`);
  console.log(`     FULFILLED             : ${fulfilled}`);
  console.log(`     PENDING               : ${pending}`);
  console.log(`     CANCELLED             : ${cancelled}`);
  console.log(`     RETURNED              : ${returned}`);
  console.log(`     Line-total mismatches : ${mismatched}`);
};

// ─── Import: Feedback ─────────────────────────────────────────────────────────

const importFeedback = async () => {
  header('Importing feedback.json → feedbacksubmissions collection');

  const records = readJsonFile(FEEDBACK_FILE);
  console.log(`  📂  Records loaded from file : ${records.length}`);

  if (CLEAR) {
    await FeedbackSubmission.deleteMany({});
    console.log('  🗑️   Collection cleared        : feedbacksubmissions');
  }

  let inserted  = 0;
  let skipped   = 0;
  let failed    = 0;
  const errors  = [];

  for (const record of records) {
    if (!record.feedback_id) {
      errors.push({ record: JSON.stringify(record).slice(0, 80), reason: 'Missing feedback_id' });
      failed++;
      continue;
    }

    try {
      const exists = await FeedbackSubmission.exists({
        feedback_id: record.feedback_id.toUpperCase(),
      });
      if (exists) {
        skipped++;
        continue;
      }

      // Coerce date strings → Date objects
      if (record.submitted_at)       record.submitted_at       = new Date(record.submitted_at);
      if (record.ingested_at)        record.ingested_at        = new Date(record.ingested_at);
      if (record.orphan_checked_at)  record.orphan_checked_at  = new Date(record.orphan_checked_at);

      await FeedbackSubmission.create(record);
      inserted++;
    } catch (err) {
      errors.push({ feedback_id: record.feedback_id, reason: err.message });
      failed++;
    }
  }

  // ── Result summary ─────────────────────────────────────────────────────────
  console.log(`\n  ✅  Inserted  : ${inserted}`);
  console.log(`  ⏭️   Skipped   : ${skipped}  (already in DB)`);
  console.log(`  ❌  Failed    : ${failed}`);

  if (errors.length) {
    console.log('\n  Failed records:');
    errors.forEach((e) => console.log(`    • ${e.feedback_id || e.record} → ${e.reason}`));
  }

  // DB totals
  const dbTotal   = await FeedbackSubmission.countDocuments();
  const orphans   = await FeedbackSubmission.countDocuments({ is_orphan: true });
  const pii       = await FeedbackSubmission.countDocuments({ comment_had_pii: true });
  const avgRating = await FeedbackSubmission.aggregate([
    { $group: { _id: null, avg: { $avg: '$rating' } } },
  ]);

  console.log('\n  ── DB snapshot ───────────────────────────────');
  console.log(`     Total feedback in DB  : ${dbTotal}`);
  console.log(`     Orphan records        : ${orphans}`);
  console.log(`     PII-flagged comments  : ${pii}`);
  console.log(`     Avg rating            : ${avgRating[0] ? avgRating[0].avg.toFixed(2) : 'n/a'}`);
};

// ─── Main ─────────────────────────────────────────────────────────────────────

const run = async () => {
  const startTime = Date.now();

  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║       ShopSmartExternalServer — JSON Seeder      ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`\n  Mode   : ${CLEAR ? '⚠️  CLEAR + INSERT' : 'INSERT (skip duplicates)'}`);
  console.log(`  Target : ${ONLY_ORDERS ? 'orders only' : ONLY_FEEDBACK ? 'feedback only' : 'orders + feedback'}`);
  console.log(`  DB     : ${process.env.MONGO_URI}`);

  // Connect
  await mongoose.connect(process.env.MONGO_URI);
  console.log('\n  ✅  MongoDB connected');

  try {
    if (RUN_ORDERS)   await importOrders();
    if (RUN_FEEDBACK) await importFeedback();
  } finally {
    await mongoose.disconnect();
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n  ✅  Done — MongoDB disconnected  (${elapsed}s)\n`);
  }
};

run().catch((err) => {
  console.error('\n  ❌  Seeder failed:', err.message);
  process.exit(1);
});
