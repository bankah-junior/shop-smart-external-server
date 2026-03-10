'use strict';

/**
 * FeedbackSubmission model — one entry per customer feedback webhook POST.
 *
 * feedback_id   → PK
 * order_id      → FK → orders.order_id  (replaces reference_id)
 * customer_id   → denormalised from the parent order (nullable)
 * sku           → nullable FK → product_catalogue.sku
 *
 * Orphan feedback (order_id not in orders) is flagged for ETL exclusion.
 * PII: comment field is scanned and redacted on ingest.
 */

const mongoose = require('mongoose');

const FEEDBACK_CATEGORIES = [
  'Delivery Speed',
  'Product Quality',
  'App Experience',
  'Packaging',
  'Overall',
];

const DELIVERY_REGIONS = ['Greater Accra', 'Ashanti', 'Western', 'Central'];

const feedbackSchema = new mongoose.Schema(
  {
    feedback_id: {
      type: String,
      required: [true, 'feedback_id is required'],
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },

    // FK → orders.order_id
    order_id: {
      type: String,
      required: [true, 'order_id is required'],
      trim: true,
      uppercase: true,
      index: true,
    },

    // Denormalised from parent order — useful for warehouse joins
    customer_id: {
      type: String,
      default: null,
      trim: true,
    },

    // Populated for ONLINE feedback
    delivery_region: {
      type: String,
      default: null,
      enum: {
        values: [...DELIVERY_REGIONS, null],
        message: 'Invalid delivery_region: {VALUE}',
      },
    },

    // Null when feedback is about experience rather than a specific product
    sku: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
    },

    // 1–5 satisfaction score
    rating: {
      type: Number,
      required: [true, 'rating is required'],
      min: [1, 'rating must be >= 1'],
      max: [5, 'rating must be <= 5'],
      validate: { validator: Number.isInteger, message: 'rating must be an integer' },
    },

    category: {
      type: String,
      required: [true, 'category is required'],
      enum: {
        values: FEEDBACK_CATEGORIES,
        message: 'Invalid category: {VALUE}. Must be one of: ' + FEEDBACK_CATEGORIES.join(', '),
      },
    },

    // Free-text; PII-scanned and truncated to 1000 chars on ingest
    comment: {
      type: String,
      default: null,
      maxlength: [1000, 'comment must be <= 1000 characters'],
    },

    comment_had_pii: {
      type: Boolean,
      default: false,
    },

    // UTC from API; ETL converts to GMT+0 before warehouse load
    submitted_at: {
      type: Date,
      required: [true, 'submitted_at is required'],
    },

    // Set by this server on webhook receipt
    ingested_at: {
      type: Date,
      required: true,
      default: () => new Date(),
    },

    // ETL status flags
    is_orphan: {
      type: Boolean,
      default: false,
    },
    orphan_checked_at: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: false,
    versionKey: false,
  }
);

// Indexes for ETL query patterns
feedbackSchema.index({ order_id: 1 });
feedbackSchema.index({ ingested_at: 1 });
feedbackSchema.index({ is_orphan: 1 });
feedbackSchema.index({ submitted_at: 1 });
feedbackSchema.index({ customer_id: 1 });

module.exports = mongoose.model('FeedbackSubmission', feedbackSchema);
module.exports.FEEDBACK_CATEGORIES = FEEDBACK_CATEGORIES;
