'use strict';

/**
 * Order model — represents one online customer order.
 *
 * Schema mirrors the E-Commerce API contract exactly so this server can act
 * as a faithful read-only replica for downstream ETL consumers.
 *
 * PII fields (customer_id, delivery_address) are stored raw here (staging
 * layer). Masking happens in the ETL pipeline before warehouse load.
 */

const mongoose = require('mongoose');

const ORDER_STATUSES = ['PENDING', 'FULFILLED', 'CANCELLED', 'RETURNED'];
const PAYMENT_METHODS = ['MOMO', 'CARD', 'COD'];
const DELIVERY_REGIONS = ['Greater Accra', 'Ashanti', 'Western', 'Central'];
const DELIVERY_CITIES  = ['Accra', 'Kumasi', 'Takoradi', 'Cape Coast'];

// ── Embedded line-item sub-schema ────────────────────────────────────────────
const orderItemSchema = new mongoose.Schema(
  {
    order_item_id: {
      type: String,
      required: true,
      trim: true,
      // Format: <order_id>-<zero-padded 3-digit sequence>, e.g. WEB-99021-001
    },
    order_id: {
      type: String,
      required: true,
      trim: true,
    },
    sku: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: [1, 'quantity must be > 0'],
      validate: { validator: Number.isInteger, message: 'quantity must be an integer' },
    },
    unit_price_ghs: {
      type: Number,
      required: true,
      min: [0.01, 'unit_price_ghs must be > 0'],
    },
    line_total_ghs: {
      type: Number,
      required: true,
      min: [0.01, 'line_total_ghs must be > 0'],
      // Persisted as quantity × unit_price_ghs; validated on write.
    },
  },
  { _id: false }
);

// ── Order root schema ─────────────────────────────────────────────────────────
const orderSchema = new mongoose.Schema(
  {
    order_id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    customer_id: {
      type: String,
      required: true,
      trim: true,
      // PII — keep raw in this staging store; ETL must hash before warehouse load.
    },
    order_status: {
      type: String,
      required: true,
      enum: { values: ORDER_STATUSES, message: 'Invalid order_status: {VALUE}' },
      uppercase: true,
    },
    delivery_region: {
      type: String,
      required: true,
      enum: { values: DELIVERY_REGIONS, message: 'Invalid delivery_region: {VALUE}' },
    },
    delivery_city: {
      type: String,
      required: true,
      enum: { values: DELIVERY_CITIES, message: 'Invalid delivery_city: {VALUE}' },
    },
    delivery_address: {
      type: String,
      default: null,
      // PII — nullable; keep raw here, mask in ETL.
    },
    payment_method: {
      type: String,
      required: true,
      enum: { values: PAYMENT_METHODS, message: 'Invalid payment_method: {VALUE}' },
      uppercase: true,
    },
    total_order_value_ghs: {
      type: Number,
      required: true,
      min: [0.01, 'total_order_value_ghs must be > 0'],
    },
    order_timestamp_utc: {
      type: Date,
      required: true,
      // Stored as UTC; ETL converts to GMT+0 (Ghana time) before warehouse load.
    },
    ingested_at: {
      type: Date,
      required: true,
      default: () => new Date(),
      // Set by this server on record creation. Used for delta detection.
    },
    order_items: {
      type: [orderItemSchema],
      validate: {
        validator: (items) => Array.isArray(items) && items.length > 0,
        message: 'An order must contain at least one order_item',
      },
    },
  },
  {
    timestamps: false, // We manage ingested_at manually for pipeline clarity
    versionKey: false,
  }
);

// ── Indexes for ETL query patterns ────────────────────────────────────────────
orderSchema.index({ order_status: 1 });
orderSchema.index({ ingested_at: 1 });
orderSchema.index({ order_timestamp_utc: 1 });

// ── Pre-save: validate line_total integrity ───────────────────────────────────
orderSchema.pre('save', function (next) {
  const items = this.order_items || [];
  const computedTotal = items.reduce((sum, item) => {
    const expectedLineTotal = parseFloat((item.quantity * item.unit_price_ghs).toFixed(2));
    if (Math.abs(item.line_total_ghs - expectedLineTotal) > 0.01) {
      return next(
        new Error(
          `line_total_ghs mismatch on item ${item.order_item_id}: ` +
          `stored=${item.line_total_ghs}, computed=${expectedLineTotal}`
        )
      );
    }
    return sum + item.line_total_ghs;
  }, 0);

  const roundedComputed = parseFloat(computedTotal.toFixed(2));
  if (Math.abs(roundedComputed - this.total_order_value_ghs) > 0.01) {
    return next(
      new Error(
        `total_order_value_ghs mismatch: ` +
        `order total=${this.total_order_value_ghs}, ` +
        `sum of line items=${roundedComputed}`
      )
    );
  }

  next();
});

module.exports = mongoose.model('Order', orderSchema);
