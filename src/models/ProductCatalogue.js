'use strict';

/**
 * ProductCatalogue model
 *
 * Mirrors the PostgreSQL product_catalogue table exactly.
 * The sku field is the universal product key shared across:
 *   - orders.order_items[].sku
 *   - feedbacksubmissions.sku
 *   - pos_transactions.sku
 *   - inventory_stock.sku
 *
 * SKU format: SKU-001 … SKU-100
 *
 * product_id is a sequential integer (BIGSERIAL equivalent) auto-assigned
 * via a pre-save hook so IDs are human-readable (1, 2, 3 …) and stable
 * across environments — matching what the warehouse dim_product expects.
 *
 * fulfillment_warehouse_id links each product to the warehouse that
 * fulfils online orders for it (→ warehouses.warehouse_id).
 */

const mongoose = require('mongoose');

const CATEGORIES = [
  'Electronics',
  'Clothing & Apparel',
  'Food & Beverages',
  'Health & Beauty',
  'Home & Kitchen',
  'Sports & Outdoors',
  'Books & Stationery',
  'Toys & Games',
  'Personal Care',
  'Office Supplies',
];

const UNITS_OF_MEASURE = ['each', 'kg', 'g', 'litre', 'ml', 'pack', 'pair', 'box', 'set', 'roll', 'bottle'];

const WAREHOUSE_IDS = ['WH-ACC-01', 'WH-KUM-01', 'WH-TAK-01', 'WH-CAP-01'];

const productCatalogueSchema = new mongoose.Schema(
  {
    // BIGSERIAL equivalent — auto-assigned sequential integer
    product_id: {
      type: Number,
      unique: true,
      index: true,
      // Assigned by pre-save hook; do not set manually
    },

    // Universal product key — format: SKU-001 … SKU-100
    sku: {
      type: String,
      required: [true, 'sku is required'],
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
      match: [/^SKU-\d{3}$/, 'sku must match format SKU-NNN (e.g. SKU-001)'],
    },

    product_name: {
      type: String,
      required: [true, 'product_name is required'],
      trim: true,
      maxlength: [200, 'product_name must be <= 200 characters'],
    },

    category: {
      type: String,
      required: [true, 'category is required'],
      trim: true,
      maxlength: [100, 'category must be <= 100 characters'],
    },

    brand: {
      type: String,
      default: null,
      trim: true,
      maxlength: [100, 'brand must be <= 100 characters'],
    },

    unit_of_measure: {
      type: String,
      default: null,
      trim: true,
      maxlength: [20, 'unit_of_measure must be <= 20 characters'],
    },

    is_active: {
      type: Boolean,
      required: true,
      default: true,
    },

    // FK → warehouses.warehouse_id
    // The warehouse that fulfils online orders for this product.
    fulfillment_warehouse_id: {
      type: String,
      required: [true, 'fulfillment_warehouse_id is required'],
      trim: true,
      uppercase: true,
      enum: {
        values: WAREHOUSE_IDS,
        message: 'fulfillment_warehouse_id must be a valid warehouse (WH-ACC-01, WH-KUM-01, WH-TAK-01, WH-CAP-01)',
      },
    },
  },
  {
    timestamps: false,
    versionKey: false,
    collection: 'productcatalogue',
  }
);

// ── Auto-increment product_id (BIGSERIAL equivalent) ─────────────────────────
productCatalogueSchema.pre('save', async function (next) {
  if (this.product_id != null) return next(); // already assigned

  try {
    const last = await this.constructor
      .findOne({}, { product_id: 1 })
      .sort({ product_id: -1 })
      .lean();
    this.product_id = last ? last.product_id + 1 : 1;
    next();
  } catch (err) {
    next(err);
  }
});

// ── Indexes ───────────────────────────────────────────────────────────────────
productCatalogueSchema.index({ category: 1 });
productCatalogueSchema.index({ is_active: 1 });
productCatalogueSchema.index({ brand: 1 });
productCatalogueSchema.index({ fulfillment_warehouse_id: 1 });

// ── Export constants for reuse in services & seed ─────────────────────────────
module.exports = mongoose.model('ProductCatalogue', productCatalogueSchema);
module.exports.CATEGORIES = CATEGORIES;
module.exports.UNITS_OF_MEASURE = UNITS_OF_MEASURE;
module.exports.WAREHOUSE_IDS = WAREHOUSE_IDS;
