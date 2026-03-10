'use strict';

/**
 * seedFromJson.js — Load seed data from JSON files into MongoDB
 *
 * Reads three files from ./seedData/ and inserts them in dependency order:
 *   1. products.json  → productcatalogue  (must be first — orders & feedback reference SKUs)
 *   2. orders.json    → orders
 *   3. feedback.json  → feedbacksubmissions
 *
 * Usage:
 *   node seedFromJson.js                    → insert all (skips existing records)
 *   node seedFromJson.js --clear            → drop all three collections, then insert
 *   node seedFromJson.js --products         → products only
 *   node seedFromJson.js --orders           → orders only
 *   node seedFromJson.js --feedback         → feedback only
 *   node seedFromJson.js --clear --products → clear + insert products only
 *   node seedFromJson.js --clear --orders   → clear + insert orders only
 *
 * ⚠️  Always seed products before orders/feedback — orders are validated
 *     against the product catalogue on ingest.
 */

require('dotenv').config();

const fs       = require('fs');
const path     = require('path');
const mongoose = require('mongoose');

const ProductCatalogue   = require('./src/models/ProductCatalogue');
const Order              = require('./src/models/Order');
const FeedbackSubmission = require('./src/models/FeedbackSubmission');

// ─── CLI flags ────────────────────────────────────────────────────────────────
const args          = process.argv.slice(2);
const CLEAR         = args.includes('--clear');
const ONLY_PRODUCTS = args.includes('--products');
const ONLY_ORDERS   = args.includes('--orders');
const ONLY_FEEDBACK = args.includes('--feedback');

const anySpecific  = ONLY_PRODUCTS || ONLY_ORDERS || ONLY_FEEDBACK;
const RUN_PRODUCTS = !anySpecific || ONLY_PRODUCTS;
const RUN_ORDERS   = !anySpecific || ONLY_ORDERS;
const RUN_FEEDBACK = !anySpecific || ONLY_FEEDBACK;

// ─── File paths ───────────────────────────────────────────────────────────────
const DATA_DIR        = path.join(__dirname, 'seedData');
const PRODUCTS_FILE   = path.join(DATA_DIR, 'products.json');
const ORDERS_FILE     = path.join(DATA_DIR, 'orders.json');
const FEEDBACK_FILE   = path.join(DATA_DIR, 'feedback.json');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Read and parse a JSON file. Returns an array or throws with a clear message. */
const readJsonFile = (filePath) => {
  const label = path.basename(filePath);

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}\n  → Make sure you placed ${label} inside the /seedData folder.`);
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

/** Print a section header to stdout */
const header = (text) => console.log(`\n${'─'.repeat(54)}\n  ${text}\n${'─'.repeat(54)}`);

// ─── Import: Product Catalogue ────────────────────────────────────────────────

const importProducts = async () => {
  header('1/3  products.json  →  productcatalogue');

  const records = readJsonFile(PRODUCTS_FILE);
  console.log(`  📂  Records in file     : ${records.length}`);

  if (CLEAR) {
    await ProductCatalogue.deleteMany({});
    console.log('  🗑️   Collection cleared  : productcatalogue');
  }

  let inserted = 0, skipped = 0, failed = 0;
  const errors = [];

  for (const record of records) {
    if (!record.sku) {
      errors.push({ record: JSON.stringify(record).slice(0, 80), reason: 'Missing sku' });
      failed++;
      continue;
    }
    try {
      const exists = await ProductCatalogue.exists({ sku: record.sku.toUpperCase() });
      if (exists) { skipped++; continue; }
      // product_id supplied in JSON is preserved; pre-save hook only auto-assigns when absent
      await ProductCatalogue.create(record);
      inserted++;
    } catch (err) {
      errors.push({ sku: record.sku, reason: err.message });
      failed++;
    }
  }

  console.log(`\n  ✅  Inserted  : ${inserted}`);
  console.log(`  ⏭️   Skipped   : ${skipped}  (already in DB)`);
  console.log(`  ❌  Failed    : ${failed}`);
  if (errors.length) {
    console.log('\n  Failed records:');
    errors.forEach((e) => console.log(`    • ${e.sku || e.record}  →  ${e.reason}`));
  }

  const total    = await ProductCatalogue.countDocuments();
  const active   = await ProductCatalogue.countDocuments({ is_active: true });
  const inactive = await ProductCatalogue.countDocuments({ is_active: false });
  const cats     = await ProductCatalogue.distinct('category');

  console.log('\n  ── DB snapshot ─────────────────────────────────');
  console.log(`     Total products    : ${total}`);
  console.log(`     Active            : ${active}`);
  console.log(`     Inactive          : ${inactive}`);
  console.log(`     Categories        : ${cats.length}  (${cats.join(', ')})`);
};

// ─── Import: Orders ───────────────────────────────────────────────────────────

const importOrders = async () => {
  header('2/3  orders.json  →  orders');

  const records = readJsonFile(ORDERS_FILE);
  console.log(`  📂  Records in file     : ${records.length}`);

  if (CLEAR) {
    await Order.deleteMany({});
    console.log('  🗑️   Collection cleared  : orders');
  }

  // Build sku lookup from catalogue for referential integrity check
  const catalogueProducts = await ProductCatalogue.find({}, { sku: 1, _id: 0 }).lean();
  const knownSkus = new Set(catalogueProducts.map((p) => p.sku));

  let inserted = 0, skipped = 0, failed = 0;
  const errors = [];

  for (const record of records) {
    if (!record.order_id) {
      errors.push({ record: JSON.stringify(record).slice(0, 80), reason: 'Missing order_id' });
      failed++;
      continue;
    }

    try {
      const exists = await Order.exists({ order_id: record.order_id.toUpperCase() });
      if (exists) { skipped++; continue; }

      // Referential integrity: every SKU in this order must exist in the catalogue
      const unknownSkus = (record.order_items || [])
        .map((i) => i.sku)
        .filter((s) => !knownSkus.has(s));
      if (unknownSkus.length > 0) {
        errors.push({ order_id: record.order_id, reason: `SKUs not in catalogue: ${unknownSkus.join(', ')}` });
        failed++;
        continue;
      }

      // Coerce date strings → Date objects
      if (record.order_timestamp_utc)   record.order_timestamp_utc   = new Date(record.order_timestamp_utc);
      if (record.order_timestamp_ghana) record.order_timestamp_ghana = new Date(record.order_timestamp_ghana);
      if (record.ingested_at)           record.ingested_at           = new Date(record.ingested_at);

      await Order.create(record);
      inserted++;
    } catch (err) {
      errors.push({ order_id: record.order_id, reason: err.message });
      failed++;
    }
  }

  console.log(`\n  ✅  Inserted  : ${inserted}`);
  console.log(`  ⏭️   Skipped   : ${skipped}  (already in DB)`);
  console.log(`  ❌  Failed    : ${failed}`);
  if (errors.length) {
    console.log('\n  Failed records:');
    errors.forEach((e) => console.log(`    • ${e.order_id || e.record}  →  ${e.reason}`));
  }

  const dbTotal    = await Order.countDocuments();
  const fulfilled  = await Order.countDocuments({ order_status: 'FULFILLED' });
  const pending    = await Order.countDocuments({ order_status: 'PENDING' });
  const cancelled  = await Order.countDocuments({ order_status: 'CANCELLED' });
  const returned   = await Order.countDocuments({ order_status: 'RETURNED' });
  const mismatched = await Order.countDocuments({ line_total_mismatch: true });

  console.log('\n  ── DB snapshot ─────────────────────────────────');
  console.log(`     Total orders      : ${dbTotal}`);
  console.log(`     FULFILLED         : ${fulfilled}`);
  console.log(`     PENDING           : ${pending}`);
  console.log(`     CANCELLED         : ${cancelled}`);
  console.log(`     RETURNED          : ${returned}`);
  console.log(`     Line-total issues : ${mismatched}`);
};

// ─── Import: Feedback ─────────────────────────────────────────────────────────

const importFeedback = async () => {
  header('3/3  feedback.json  →  feedbacksubmissions');

  const records = readJsonFile(FEEDBACK_FILE);
  console.log(`  📂  Records in file     : ${records.length}`);

  if (CLEAR) {
    await FeedbackSubmission.deleteMany({});
    console.log('  🗑️   Collection cleared  : feedbacksubmissions');
  }

  // Build known order_ids and catalogue SKUs for cross-collection checks
  const knownOrderIds = new Set(
    (await Order.find({}, { order_id: 1, _id: 0 }).lean()).map((o) => o.order_id)
  );
  const knownSkus = new Set(
    (await ProductCatalogue.find({}, { sku: 1, _id: 0 }).lean()).map((p) => p.sku)
  );

  let inserted = 0, skipped = 0, failed = 0;
  const errors = [];

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
      if (exists) { skipped++; continue; }

      // Flag orphan when order_id has no matching order
      if (record.order_id && !knownOrderIds.has(record.order_id.toUpperCase())) {
        record.is_orphan = true;
        record.orphan_checked_at = record.orphan_checked_at
          ? new Date(record.orphan_checked_at)
          : new Date();
      }

      // Nullify sku when it doesn't exist in the catalogue
      if (record.sku && !knownSkus.has(record.sku.toUpperCase())) {
        record.sku = null;
      }

      // Coerce date strings → Date objects
      if (record.submitted_at)      record.submitted_at      = new Date(record.submitted_at);
      if (record.ingested_at)       record.ingested_at       = new Date(record.ingested_at);
      if (record.orphan_checked_at) record.orphan_checked_at = new Date(record.orphan_checked_at);

      await FeedbackSubmission.create(record);
      inserted++;
    } catch (err) {
      errors.push({ feedback_id: record.feedback_id, reason: err.message });
      failed++;
    }
  }

  console.log(`\n  ✅  Inserted  : ${inserted}`);
  console.log(`  ⏭️   Skipped   : ${skipped}  (already in DB)`);
  console.log(`  ❌  Failed    : ${failed}`);
  if (errors.length) {
    console.log('\n  Failed records:');
    errors.forEach((e) => console.log(`    • ${e.feedback_id || e.record}  →  ${e.reason}`));
  }

  const dbTotal   = await FeedbackSubmission.countDocuments();
  const orphans   = await FeedbackSubmission.countDocuments({ is_orphan: true });
  const pii       = await FeedbackSubmission.countDocuments({ comment_had_pii: true });
  const avgRating = await FeedbackSubmission.aggregate([
    { $group: { _id: null, avg: { $avg: '$rating' } } },
  ]);

  console.log('\n  ── DB snapshot ─────────────────────────────────');
  console.log(`     Total feedback    : ${dbTotal}`);
  console.log(`     Orphan records    : ${orphans}`);
  console.log(`     PII-flagged       : ${pii}`);
  console.log(`     Avg rating        : ${avgRating[0] ? avgRating[0].avg.toFixed(2) : 'n/a'}`);
};

// ─── Main ─────────────────────────────────────────────────────────────────────

const run = async () => {
  const startTime = Date.now();

  const targetLabel = anySpecific
    ? [ONLY_PRODUCTS && 'products', ONLY_ORDERS && 'orders', ONLY_FEEDBACK && 'feedback']
        .filter(Boolean).join(' + ')
    : 'products + orders + feedback';

  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║      ShopSmartExternalServer — JSON Seeder         ║');
  console.log('╚════════════════════════════════════════════════════╝');
  console.log(`\n  Mode    : ${CLEAR ? '⚠️  CLEAR + INSERT' : 'INSERT  (skips duplicates)'}`);
  console.log(`  Target  : ${targetLabel}`);
  console.log(`  DB      : ${process.env.MONGO_URI}`);
  console.log('\n  ⚠️  Load order is always: products → orders → feedback');

  await mongoose.connect(process.env.MONGO_URI);
  console.log('\n  ✅  MongoDB connected');

  try {
    if (RUN_PRODUCTS) await importProducts();
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
