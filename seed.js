'use strict';

/**
 * seed.js — Demo seed data for ShopSmartExternalServer
 *
 * Usage:
 *   node seed.js            → inserts all seed data (skips duplicates)
 *   node seed.js --clear    → drops collections first, then inserts
 *
 * Covers a realistic 30-day window of activity across all four Ghana regions,
 * all order statuses, all payment methods, and all feedback categories.
 * Includes intentional edge cases: mismatch flag, orphan feedback, PII in comment.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Order = require('./src/models/Order');
const FeedbackSubmission = require('./src/models/FeedbackSubmission');
const { maskCustomerId, maskAddress, redactPii, scanForPii } = require('./src/utils/piiScanner');
const { utcToGhanaTime } = require('./src/utils/timezone');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const randomBetween = (min, max) => +(Math.random() * (max - min) + min).toFixed(2);
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** Build a timestamp a given number of days ago from now */
const daysAgo = (days, hourOffset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hourOffset, randomInt(0, 59), randomInt(0, 59), 0);
  return d;
};

// ─── Reference data ───────────────────────────────────────────────────────────

const SKUS = [
  'PRD-A12', 'PRD-B04', 'PRD-C18', 'PRD-D07', 'PRD-E33',
  'PRD-F21', 'PRD-G09', 'PRD-H15', 'PRD-I02', 'PRD-J44',
];

const REGION_CITY_MAP = {
  'Greater Accra': 'Accra',
  'Ashanti':       'Kumasi',
  'Western':       'Takoradi',
  'Central':       'Cape Coast',
};

const REGIONS = Object.keys(REGION_CITY_MAP);

const ADDRESSES = {
  Accra:      '14 Independence Ave, Accra, Ghana',
  Kumasi:     '7 Adum Road, Kumasi, Ghana',
  Takoradi:   '3 Market Circle, Takoradi, Ghana',
  'Cape Coast': '22 Victoria Road, Cape Coast, Ghana',
};

const CUSTOMER_IDS = Array.from({ length: 20 }, (_, i) =>
  `CUST-${String(400 + i).padStart(3, '0')}`
);

const PAYMENT_METHODS = ['MOMO', 'CARD', 'COD'];
const ORDER_STATUSES   = ['PENDING', 'FULFILLED', 'CANCELLED', 'RETURNED'];

// Status distribution: heavily FULFILLED for realistic revenue data
const STATUS_WEIGHTS = [
  ...Array(12).fill('FULFILLED'),
  ...Array(3).fill('PENDING'),
  ...Array(3).fill('CANCELLED'),
  ...Array(2).fill('RETURNED'),
];

const FEEDBACK_CATEGORIES = [
  'Delivery Speed', 'Product Quality', 'Staff Service',
  'App Experience', 'Packaging',
];

// ─── Order factory ────────────────────────────────────────────────────────────

let orderSeq = 99000;

const buildOrder = (overrides = {}) => {
  orderSeq++;
  const order_id = `WEB-${orderSeq}`;
  const region = pick(REGIONS);
  const city = REGION_CITY_MAP[region];
  const customer_id = pick(CUSTOMER_IDS);
  const order_status = pick(STATUS_WEIGHTS);
  const payment_method = pick(PAYMENT_METHODS);
  const daysBack = randomInt(1, 30);

  // Build 1–4 items
  const itemCount = randomInt(1, 4);
  const usedSkus = new Set();
  const rawItems = [];

  for (let i = 0; i < itemCount; i++) {
    let sku = pick(SKUS);
    while (usedSkus.has(sku)) sku = pick(SKUS); // no duplicate SKU in same order
    usedSkus.add(sku);
    const quantity = randomInt(1, 5);
    const unit_price_ghs = randomBetween(20, 500);
    const line_total_ghs = parseFloat((quantity * unit_price_ghs).toFixed(2));
    rawItems.push({ sku, quantity, unit_price_ghs, line_total_ghs });
  }

  const total_order_value_ghs = parseFloat(
    rawItems.reduce((s, i) => s + i.line_total_ghs, 0).toFixed(2)
  );

  const order_items = rawItems.map((item, idx) => ({
    order_item_id: `${order_id}-${String(idx + 1).padStart(3, '0')}`,
    order_id,
    sku: item.sku,
    quantity: item.quantity,
    unit_price_ghs: item.unit_price_ghs,
    line_total_ghs: item.line_total_ghs,
  }));

  const order_timestamp_utc = daysAgo(daysBack, randomInt(6, 22));
  const ingested_at = new Date(order_timestamp_utc.getTime() + randomInt(30, 300) * 1000);

  return {
    order_id,
    customer_id,
    customer_id_masked: maskCustomerId(customer_id),
    order_status,
    delivery_region: region,
    delivery_city: city,
    delivery_address: ADDRESSES[city],
    delivery_address_masked: maskAddress(ADDRESSES[city]),
    payment_method,
    total_order_value_ghs,
    order_items,
    order_timestamp_utc,
    order_timestamp_ghana: utcToGhanaTime(order_timestamp_utc),
    ingested_at,
    line_total_mismatch: false,
    line_total_mismatch_delta: 0,
    ...overrides,
  };
};

// ─── Feedback factory ─────────────────────────────────────────────────────────

let feedbackSeq = 800;

const buildFeedback = (order_id, region, overrides = {}) => {
  feedbackSeq++;
  const feedback_id = `FB-${feedbackSeq}`;
  const sku = Math.random() > 0.3 ? pick(SKUS) : null; // 30% experience-only feedback
  const rating = randomInt(2, 5);
  const category = pick(FEEDBACK_CATEGORIES);
  const submitted_at = daysAgo(randomInt(0, 3), randomInt(8, 21));
  const ingested_at = new Date(submitted_at.getTime() + randomInt(1, 10) * 1000);

  const COMMENTS = [
    'Fast delivery, very satisfied with the product.',
    'Packaging was excellent. No damage at all.',
    'App was easy to use but checkout was slow.',
    'Product quality exceeded my expectations.',
    'Delivery took longer than expected.',
    'Great service, will order again.',
    'Item arrived in perfect condition.',
    'Staff was very helpful when I had a question.',
    null,
    null, // ~20% null comments
  ];

  let comment = pick(COMMENTS);
  let comment_had_pii = false;
  if (comment) {
    const { hasPii } = scanForPii(comment);
    comment_had_pii = hasPii;
    if (hasPii) comment = redactPii(comment);
  }

  return {
    feedback_id,
    reference_id: order_id,
    delivery_region: region,
    sku,
    rating,
    category,
    comment,
    comment_had_pii,
    submitted_at,
    ingested_at,
    is_orphan: false,
    orphan_checked_at: ingested_at,
    ...overrides,
  };
};

// ─── Special / edge-case records ──────────────────────────────────────────────

const buildEdgeCases = () => {
  // 1. Order with line total mismatch (flagged, not rejected — pipeline logs it)
  const mismatchOrder = buildOrder({
    order_id: 'WEB-MISMATCH1',
    order_status: 'FULFILLED',
    delivery_region: 'Greater Accra',
    delivery_city: 'Accra',
  });
  mismatchOrder.total_order_value_ghs = parseFloat(
    (mismatchOrder.total_order_value_ghs + 5.00).toFixed(2)
  );
  mismatchOrder.line_total_mismatch = true;
  mismatchOrder.line_total_mismatch_delta = -5.00;

  // 2. Returned order (should NOT appear in FULFILLED revenue queries)
  const returnedOrder = buildOrder({
    order_id: 'WEB-RETURN01',
    order_status: 'RETURNED',
    delivery_region: 'Ashanti',
    delivery_city: 'Kumasi',
    payment_method: 'CARD',
  });

  // 3. CANCELLED order
  const cancelledOrder = buildOrder({
    order_id: 'WEB-CANCEL01',
    order_status: 'CANCELLED',
    delivery_region: 'Western',
    delivery_city: 'Takoradi',
    payment_method: 'COD',
  });

  // 4. High-value FULFILLED order (for standout in revenue reports)
  const highValueOrder = buildOrder({
    order_id: 'WEB-HIGHVAL1',
    order_status: 'FULFILLED',
    delivery_region: 'Greater Accra',
    delivery_city: 'Accra',
    payment_method: 'CARD',
  });
  // Force large items
  highValueOrder.order_items = [
    {
      order_item_id: 'WEB-HIGHVAL1-001',
      order_id: 'WEB-HIGHVAL1',
      sku: 'PRD-H15',
      quantity: 10,
      unit_price_ghs: 450.00,
      line_total_ghs: 4500.00,
    },
    {
      order_item_id: 'WEB-HIGHVAL1-002',
      order_id: 'WEB-HIGHVAL1',
      sku: 'PRD-J44',
      quantity: 5,
      unit_price_ghs: 300.00,
      line_total_ghs: 1500.00,
    },
  ];
  highValueOrder.total_order_value_ghs = 6000.00;

  return { mismatchOrder, returnedOrder, cancelledOrder, highValueOrder };
};

// ─── Seed function ────────────────────────────────────────────────────────────

const seed = async () => {
  const shouldClear = process.argv.includes('--clear');

  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅  MongoDB connected');

  if (shouldClear) {
    await Order.deleteMany({});
    await FeedbackSubmission.deleteMany({});
    console.log('🗑️   Collections cleared');
  }

  // ── Build orders ────────────────────────────────────────────────────────────
  const regularOrders = Array.from({ length: 40 }, () => buildOrder());
  const { mismatchOrder, returnedOrder, cancelledOrder, highValueOrder } = buildEdgeCases();
  const allOrders = [...regularOrders, mismatchOrder, returnedOrder, cancelledOrder, highValueOrder];

  // Insert orders (skip existing order_ids)
  let ordersInserted = 0;
  let ordersSkipped = 0;
  for (const orderData of allOrders) {
    const exists = await Order.findOne({ order_id: orderData.order_id });
    if (exists) { ordersSkipped++; continue; }
    await new Order(orderData).save();
    ordersInserted++;
  }
  console.log(`📦  Orders: ${ordersInserted} inserted, ${ordersSkipped} skipped`);

  // ── Build feedback ──────────────────────────────────────────────────────────
  // Pair feedback with FULFILLED orders (realistic linkage)
  const fulfilledOrders = allOrders.filter((o) => o.order_status === 'FULFILLED');
  const feedbackData = [];

  // ~70% of fulfilled orders get feedback
  for (const order of fulfilledOrders) {
    if (Math.random() > 0.3) {
      feedbackData.push(buildFeedback(order.order_id, order.delivery_region));
      // ~20% get a second feedback entry (different category)
      if (Math.random() < 0.2) {
        feedbackData.push(buildFeedback(order.order_id, order.delivery_region));
      }
    }
  }

  // Edge case: orphan feedback (reference_id does not exist in orders)
  feedbackSeq++;
  feedbackData.push({
    feedback_id: `FB-${feedbackSeq}`,
    reference_id: 'WEB-ORPHAN99',   // no matching order
    delivery_region: 'Central',
    sku: 'PRD-B04',
    rating: 3,
    category: 'Product Quality',
    comment: 'Good but delivery was delayed.',
    comment_had_pii: false,
    submitted_at: daysAgo(2, 14),
    ingested_at: new Date(),
    is_orphan: true,
    orphan_checked_at: new Date(),
  });

  // Edge case: feedback with PII comment (already redacted as per pipeline)
  feedbackSeq++;
  feedbackData.push({
    feedback_id: `FB-${feedbackSeq}`,
    reference_id: fulfilledOrders[0]?.order_id || 'WEB-99001',
    delivery_region: 'Greater Accra',
    sku: null,
    rating: 5,
    category: 'App Experience',
    comment: 'Super smooth experience! Contact me at [REDACTED_EMAIL] for feedback.',
    comment_had_pii: true,
    submitted_at: daysAgo(1, 10),
    ingested_at: new Date(),
    is_orphan: false,
    orphan_checked_at: new Date(),
  });

  // Edge case: 1-star feedback (low satisfaction outlier)
  feedbackSeq++;
  feedbackData.push({
    feedback_id: `FB-${feedbackSeq}`,
    reference_id: fulfilledOrders[1]?.order_id || 'WEB-99002',
    delivery_region: 'Ashanti',
    sku: 'PRD-C18',
    rating: 1,
    category: 'Delivery Speed',
    comment: 'Took 2 weeks. Completely unacceptable.',
    comment_had_pii: false,
    submitted_at: daysAgo(0, 9),
    ingested_at: new Date(),
    is_orphan: false,
    orphan_checked_at: new Date(),
  });

  let feedbackInserted = 0;
  let feedbackSkipped = 0;
  for (const fb of feedbackData) {
    const exists = await FeedbackSubmission.findOne({ feedback_id: fb.feedback_id });
    if (exists) { feedbackSkipped++; continue; }
    await new FeedbackSubmission(fb).save();
    feedbackInserted++;
  }
  console.log(`💬  Feedback: ${feedbackInserted} inserted, ${feedbackSkipped} skipped`);

  // ── Summary ────────────────────────────────────────────────────────────────
  const totalOrders = await Order.countDocuments();
  const fulfilledCount = await Order.countDocuments({ order_status: 'FULFILLED' });
  const mismatchCount = await Order.countDocuments({ line_total_mismatch: true });
  const totalFeedback = await FeedbackSubmission.countDocuments();
  const orphanCount = await FeedbackSubmission.countDocuments({ is_orphan: true });
  const piiCount = await FeedbackSubmission.countDocuments({ comment_had_pii: true });

  console.log('\n─── Seed Summary ─────────────────────────────────');
  console.log(`  Orders total:          ${totalOrders}`);
  console.log(`  FULFILLED orders:      ${fulfilledCount}`);
  console.log(`  Line-total mismatches: ${mismatchCount}`);
  console.log(`  Feedback total:        ${totalFeedback}`);
  console.log(`  Orphan feedback:       ${orphanCount}`);
  console.log(`  PII-flagged comments:  ${piiCount}`);
  console.log('──────────────────────────────────────────────────\n');

  await mongoose.disconnect();
  console.log('✅  Done. MongoDB disconnected.');
};

seed().catch((err) => {
  console.error('❌  Seed failed:', err.message);
  process.exit(1);
});
