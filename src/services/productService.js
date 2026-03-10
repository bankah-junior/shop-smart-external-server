'use strict';

/**
 * ProductCatalogue Service
 *
 * CRUD operations for the product catalogue.
 * The sku field is the join key to orders.order_items[].sku
 * and feedbacksubmissions.sku — all lookups are sku-based.
 */

const ProductCatalogue = require('../models/ProductCatalogue');
const logger = require('../utils/logger');

// ── Create ────────────────────────────────────────────────────────────────────

/**
 * Create a new product. Rejects duplicates on sku.
 */
const createProduct = async (payload) => {
  const sku = payload.sku.toUpperCase().trim();

  const existing = await ProductCatalogue.findOne({ sku });
  if (existing) {
    return { saved: false, sku, reason: 'duplicate_sku' };
  }

  const product = new ProductCatalogue({
    sku,
    product_name:             payload.product_name.trim(),
    category:                 payload.category.trim(),
    brand:                    payload.brand            ? payload.brand.trim()            : null,
    unit_of_measure:          payload.unit_of_measure  ? payload.unit_of_measure.trim()  : null,
    is_active:                payload.is_active !== undefined ? payload.is_active : true,
    fulfillment_warehouse_id: payload.fulfillment_warehouse_id.trim().toUpperCase(),
  });

  await product.save();
  logger.info('Product created', { sku, product_id: product.product_id });
  return { saved: true, sku, product_id: product.product_id };
};

// ── Read ──────────────────────────────────────────────────────────────────────

/**
 * List products with optional filters and pagination.
 */
const getProducts = async ({
  category,
  brand,
  is_active,
  search,
  page  = 1,
  limit = 50,
} = {}) => {
  const filter = {};

  if (category)                    filter.category  = category;
  if (brand)                       filter.brand     = brand;
  if (typeof is_active === 'boolean') filter.is_active = is_active;

  // Full-text style search on product_name and sku
  if (search) {
    const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ product_name: re }, { sku: re }, { brand: re }];
  }

  const skip = (page - 1) * limit;

  const [products, total] = await Promise.all([
    ProductCatalogue.find(filter)
      .sort({ product_id: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    ProductCatalogue.countDocuments(filter),
  ]);

  return { products, total, page, limit, pages: Math.ceil(total / limit) };
};

/**
 * Get a single product by sku (primary lookup key).
 */
const getProductBySku = async (sku) => {
  return ProductCatalogue.findOne({ sku: sku.toUpperCase() }).lean();
};

/**
 * Get a single product by product_id.
 */
const getProductById = async (productId) => {
  return ProductCatalogue.findOne({ product_id: parseInt(productId, 10) }).lean();
};

/**
 * Batch create multiple products.
 *
 * @param {Object[]} payloads
 * @returns {{ ingested: number, skipped: number, errors: Object[] }}
 */
const createProductBatch = async (payloads) => {
  let ingested = 0;
  let skipped = 0;
  const errors = [];

  for (const payload of payloads) {
    try {
      const result = await createProduct(payload);
      if (result.saved) ingested++;
      else skipped++;
    } catch (err) {
      logger.error('Failed to create product', { sku: payload.sku, error: err.message });
      errors.push({ sku: payload.sku, error: err.message });
    }
  }

  return { ingested, skipped, errors };
};

/**
 * Validate that every sku in a list exists and is active in the catalogue.
 * Returns { valid: bool, unknown: string[], inactive: string[] }
 * Used by order ingest to guard referential integrity.
 */
const validateSkus = async (skus) => {
  const upperSkus = [...new Set(skus.map((s) => s.toUpperCase()))];
  const found = await ProductCatalogue.find(
    { sku: { $in: upperSkus } },
    { sku: 1, is_active: 1, _id: 0 }
  ).lean();

  const foundMap = Object.fromEntries(found.map((p) => [p.sku, p.is_active]));
  const unknown  = upperSkus.filter((s) => !(s in foundMap));
  const inactive = upperSkus.filter((s) => s in foundMap && !foundMap[s]);

  return { valid: unknown.length === 0 && inactive.length === 0, unknown, inactive };
};

// ── Update ────────────────────────────────────────────────────────────────────

/**
 * Update a product by sku. Only supplied fields are updated.
 */
const updateProduct = async (sku, updates) => {
  const allowed = ['product_name', 'category', 'brand', 'unit_of_measure', 'is_active', 'fulfillment_warehouse_id'];
  const patch = {};
  for (const key of allowed) {
    if (updates[key] !== undefined) {
      patch[key] = typeof updates[key] === 'string' ? updates[key].trim() : updates[key];
    }
  }

  if (Object.keys(patch).length === 0) {
    return { updated: false, reason: 'no_valid_fields' };
  }

  const result = await ProductCatalogue.findOneAndUpdate(
    { sku: sku.toUpperCase() },
    { $set: patch },
    { new: true, lean: true }
  );

  if (!result) return { updated: false, reason: 'not_found' };

  logger.info('Product updated', { sku, fields: Object.keys(patch) });
  return { updated: true, product: result };
};

/**
 * Soft-delete: set is_active = false.
 */
const deactivateProduct = async (sku) => {
  return updateProduct(sku, { is_active: false });
};

/**
 * Reactivate: set is_active = true.
 */
const reactivateProduct = async (sku) => {
  return updateProduct(sku, { is_active: true });
};

/**
 * Delete product by sku.
 */
const deleteProduct = async (sku) => {
  const result = await ProductCatalogue.findOneAndDelete({ sku: sku.toUpperCase() });
  if (result) {
    logger.info('Product deleted', { sku });
  }
  return result;
};

/**
 * Get products for a specific date (YYYY-MM-DD).
 */
const getProductsByDate = async (dateString) => {
  const start = new Date(dateString);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(dateString);
  end.setUTCHours(23, 59, 59, 999);

  return ProductCatalogue.find({
    ingested_at: { $gte: start, $lte: end },
  }).sort({ product_id: 1 }).lean();
};

/**
 * Get products by day of week (0-6 or name).
 */
const getProductsByDayOfWeek = async (day) => {
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

  return ProductCatalogue.find({
    $expr: { $eq: [{ $dayOfWeek: '$ingested_at' }, dayIndex + 1] },
  }).sort({ product_id: 1 }).lean();
};

/**
 * Generic find products by any field.
 */
const findProducts = async (query) => {
  const filter = {};
  Object.keys(query).forEach((key) => {
    if (['sku', 'product_name', 'category', 'brand', 'unit_of_measure', 'is_active'].includes(key)) {
      filter[key] = typeof query[key] === 'string' ? query[key] : query[key];
    }
  });
  return ProductCatalogue.find(filter).sort({ product_id: 1 }).limit(100).lean();
};

module.exports = {
  createProduct,
  createProductBatch,
  getProducts,
  getProductBySku,
  getProductById,
  validateSkus,
  updateProduct,
  deactivateProduct,
  reactivateProduct,
  deleteProduct,
  getProductsByDate,
  getProductsByDayOfWeek,
  findProducts,
};
