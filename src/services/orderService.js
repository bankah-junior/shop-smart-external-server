'use strict';

/**
 * Order Service
 * Handles ingestion, deduplication, transformation, and validation
 * of raw E-Commerce API order payloads before MongoDB persistence.
 */

const Order = require('../models/Order');
const { maskCustomerId, maskAddress } = require('../utils/piiScanner');
const { utcToGhanaTime } = require('../utils/timezone');
const logger = require('../utils/logger');

/**
 * Transform a raw API order payload into a persisted Order document.
 *
 * Steps:
 *  1. Deduplicate: skip if order_id already exists (use ingested_at to detect).
 *  2. Unpack items array → order_items with generated order_item_id.
 *  3. Derive line_total_ghs = quantity × unit_price_ghs per item.
 *  4. Validate SUM(line_total_ghs) === total_order_value_ghs. Log mismatches.
 *  5. Convert order_timestamp_utc → Ghana time (GMT+0).
 *  6. Mask PII fields (customer_id, delivery_address).
 *  7. Persist to MongoDB.
 *
 * @param {Object} payload - Raw order payload from E-Commerce API.
 * @returns {{ saved: boolean, order_id: string, reason?: string }}
 */
const ingestOrder = async (payload) => {
  const {
    order_id,
    customer_id,
    order_status,
    fulfillment_warehouse_id,
    delivery_region,
    delivery_city,
    delivery_address = null,
    payment_method,
    total_order_value_ghs,
    order_timestamp_utc,
    items = [],
  } = payload;

  // ── 1. Deduplication ────────────────────────────────────────────────────────
  const existing = await Order.findOne({ order_id: order_id.toUpperCase() });
  if (existing) {
    logger.info('Order already synced — skipping', { order_id });
    return { saved: false, order_id, reason: 'duplicate' };
  }

  // ── 2. SKU catalogue validation ────────────────────────────────────────────
  const incomingSkus = items.map((i) => i.sku);
  const skuCheck = await validateSkus(incomingSkus);
  if (!skuCheck.valid) {
    const details = [
      ...skuCheck.unknown.map((s) => `${s}: not in catalogue`),
      ...skuCheck.inactive.map((s) => `${s}: inactive product`),
    ].join('; ');
    logger.warn('Order rejected: SKU catalogue validation failed', { order_id, details });
    return { saved: false, order_id, reason: `invalid_skus: ${details}` };
  }

  // ── 3 & 4. Unpack items, generate IDs, derive line totals ──────────────────
  const order_items = items.map((item, idx) => {
    const seqSuffix = String(idx + 1).padStart(3, '0');
    const order_item_id = `${order_id.toUpperCase()}-${seqSuffix}`;
    const line_total_ghs = parseFloat((item.quantity * item.price_ghs).toFixed(2));
    return {
      order_item_id,
      order_id: order_id.toUpperCase(),
      sku: (item.sku || '').toUpperCase(),
      quantity: item.quantity,
      unit_price_ghs: item.price_ghs,
      line_total_ghs,
    };
  });

  // ── 5. Validate: SUM(line totals) === total_order_value_ghs ────────────────
  const sumLineTotals = parseFloat(
    order_items.reduce((acc, i) => acc + i.line_total_ghs, 0).toFixed(2)
  );
  const mismatch = Math.abs(sumLineTotals - total_order_value_ghs) > 0.01;
  if (mismatch) {
    logger.warn('Line total mismatch detected', {
      order_id,
      total_order_value_ghs,
      sum_line_totals: sumLineTotals,
      delta: parseFloat((sumLineTotals - total_order_value_ghs).toFixed(2)),
    });
  }

  // ── 6. Timezone conversion (UTC → Ghana GMT+0) ─────────────────────────────
  const order_timestamp_ghana = utcToGhanaTime(order_timestamp_utc);

  // ── 7. PII masking ─────────────────────────────────────────────────────────
  const customer_id_masked = maskCustomerId(customer_id);
  const delivery_address_masked = maskAddress(delivery_address);

  // ── 8. Persist ─────────────────────────────────────────────────────────────
  const order = new Order({
    order_id: order_id.toUpperCase(),
    customer_id,            // raw PII — staging only
    customer_id_masked,
    order_status: order_status.toUpperCase(),
    fulfillment_warehouse_id: fulfillment_warehouse_id.toUpperCase(),
    delivery_region,
    delivery_city,
    delivery_address,       // raw PII — staging only
    delivery_address_masked,
    payment_method: payment_method.toUpperCase(),
    total_order_value_ghs,
    order_items,
    order_timestamp_utc: new Date(order_timestamp_utc),
    order_timestamp_ghana,
    ingested_at: new Date(),
    line_total_mismatch: mismatch,
    line_total_mismatch_delta: mismatch
      ? parseFloat((sumLineTotals - total_order_value_ghs).toFixed(2))
      : 0,
  });

  await order.save();
  logger.info('Order ingested', {
    order_id,
    order_status,
    items_count: order_items.length,
    line_total_mismatch: mismatch,
  });

  return { saved: true, order_id };
};

/**
 * Batch ingest multiple orders. Processes sequentially to avoid race conditions
 * on deduplication checks.
 *
 * @param {Object[]} payloads
 * @returns {{ ingested: number, skipped: number, errors: Object[] }}
 */
const ingestOrderBatch = async (payloads) => {
  let ingested = 0;
  let skipped = 0;
  const errors = [];

  for (const payload of payloads) {
    try {
      const result = await ingestOrder(payload);
      if (result.saved) ingested++;
      else skipped++;
    } catch (err) {
      logger.error('Failed to ingest order', { order_id: payload.order_id, error: err.message });
      errors.push({ order_id: payload.order_id, error: err.message });
    }
  }

  return { ingested, skipped, errors };
};

/**
 * Retrieve orders with optional filters.
 * Supports: status, region, from/to dates, pagination.
 */
const getOrders = async ({ status, region, from, to, page = 1, limit = 50 } = {}) => {
  const filter = {};
  if (status) filter.order_status = status.toUpperCase();
  if (region) filter.delivery_region = region;
  if (from || to) {
    filter.order_timestamp_utc = {};
    if (from) filter.order_timestamp_utc.$gte = new Date(from);
    if (to) filter.order_timestamp_utc.$lte = new Date(to);
  }

  const skip = (page - 1) * limit;
  const [orders, total] = await Promise.all([
    Order.find(filter)
      .sort({ ingested_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Order.countDocuments(filter),
  ]);

  return { orders, total, page, limit, pages: Math.ceil(total / limit) };
};

/**
 * Get a single order by order_id.
 */
const getOrderById = async (orderId) => {
  return Order.findOne({ order_id: orderId.toUpperCase() }).lean();
};

/**
 * Update an order by order_id.
 */
const updateOrder = async (orderId, updateData) => {
  const order = await Order.findOneAndUpdate(
    { order_id: orderId.toUpperCase() },
    { $set: updateData },
    { new: true, runValidators: true }
  ).lean();
  if (order) {
    logger.info('Order updated', { order_id: orderId });
  }
  return order;
};

/**
 * Delete an order by order_id.
 */
const deleteOrder = async (orderId) => {
  const result = await Order.findOneAndDelete({ order_id: orderId.toUpperCase() });
  if (result) {
    logger.info('Order deleted', { order_id: orderId });
  }
  return result;
};

/**
 * Get orders for a specific date (YYYY-MM-DD).
 */
const getOrdersByDate = async (dateString) => {
  const start = new Date(dateString);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(dateString);
  end.setUTCHours(23, 59, 59, 999);

  return Order.find({
    order_timestamp_utc: { $gte: start, $lte: end },
  }).sort({ order_timestamp_utc: 1 }).lean();
};

/**
 * Get orders by day of week (0-6 or name).
 */
const getOrdersByDayOfWeek = async (day) => {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  let dayIndex;

  if (typeof day === 'string') {
    dayIndex = days.indexOf(day.toLowerCase());
  } else {
    dayIndex = parseInt(day, 10);
  }

  if (dayIndex < 0 || dayIndex > 6 || isNaN(dayIndex)) {
    throw new Error('Invalid day of week. Use 0-6 or day name.');
  }

  // MongoDB $expr to match day of week (1=Sunday, ..., 7=Saturday)
  // Our index is 0-6 (0=Sunday), so we add 1
  return Order.find({
    $expr: { $eq: [{ $dayOfWeek: '$order_timestamp_utc' }, dayIndex + 1] },
  }).sort({ order_timestamp_utc: -1 }).lean();
};

/**
 * Generic find orders by any field.
 */
const findOrders = async (query) => {
  const filter = {};
  Object.keys(query).forEach((key) => {
    if (['order_id', 'customer_id', 'order_status', 'delivery_region', 'delivery_city', 'payment_method'].includes(key)) {
      filter[key] = typeof query[key] === 'string' ? query[key].toUpperCase() : query[key];
    }
  });
  return Order.find(filter).sort({ ingested_at: -1 }).limit(100).lean();
};

/**
 * Get all orders without pagination.
 */
const getAllOrders = async () => {
  return Order.find().sort({ ingested_at: -1 }).lean();
};

module.exports = {
  ingestOrder,
  ingestOrderBatch,
  getOrders,
  getAllOrders,
  getOrderById,
  updateOrder,
  deleteOrder,
  getOrdersByDate,
  getOrdersByDayOfWeek,
  findOrders,
};
