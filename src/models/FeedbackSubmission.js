'use strict';

/**
 * FeedbackSubmission model — one entry per customer feedback webhook POST.
 *
 * Feedback can be submitted for both online orders. The reference_id
 * links back to an orders.order_id. Orphan feedback (reference_id not in
 * orders) must be dropped before warehouse load.
 *
 * PII: comment field is scanned and redacted on ingest.
 */

const mongoose = require('mongoose');

const FEEDBACK_CATEGORIES = [
  'Delivery Speed',
  'Product Quality',
  'Staff Service',
  'App Experience',
  'Packaging',
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

    // Points to orders.order_id (online)
    reference_id: {
      type: String,
      required: [true, 'reference_id is required'],
      trim: true,
      uppercase: true,
      index: true,
    },

    // Populated for ONLINE feedback; null for in-store
    delivery_region: {
      type: String,
      default: null,
      enum: {
        values: [...DELIVERY_REGIONS, null],
        message: 'Invalid delivery_region: {VALUE}',
      },
    },

    // Null when feedback is about experience (e.g., delivery speed) not a product
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
        message: 'Invalid category: {VALUE}',
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
      // True if PII was detected and redacted from comment
    },

    // UTC from API; ETL converts to GMT+0 (Ghana time) before warehouse load
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
      // True if reference_id could not be resolved to a known order
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
feedbackSchema.index({ reference_id: 1 });
feedbackSchema.index({ ingested_at: 1 });
feedbackSchema.index({ is_orphan: 1 });
feedbackSchema.index({ submitted_at: 1 });

module.exports = mongoose.model('FeedbackSubmission', feedbackSchema);
