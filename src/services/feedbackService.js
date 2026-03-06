'use strict';

/**
 * Feedback Service
 * Handles ingestion and validation of customer feedback webhook payloads.
 *
 * Business rules:
 *  - rating must be 1–5. Reject and log out-of-range.
 *  - Scan comment for PII; redact before storing.
 *  - Truncate comment at 1000 chars.
 *  - submitted_at (UTC from API) → ingested_at set by pipeline.
 *  - Orphan detection: reference_id must exist in orders. Flag if not found.
 *  - Deduplicate on feedback_id.
 */

const FeedbackSubmission = require('../models/FeedbackSubmission');
const Order = require('../models/Order');
const { scanForPii, redactPii } = require('../utils/piiScanner');
const { utcToGhanaTime } = require('../utils/timezone');
const logger = require('../utils/logger');

const MAX_COMMENT_LENGTH = 1000;

/**
 * Ingest a single feedback webhook payload.
 *
 * @param {Object} payload - Raw webhook payload.
 * @returns {{ saved: boolean, feedback_id: string, reason?: string, warnings?: string[] }}
 */
const ingestFeedback = async (payload) => {
  const {
    feedback_id,
    reference_id,
    delivery_region = null,
    sku = null,
    rating,
    category,
    comment = null,
    submitted_at,
  } = payload;

  const warnings = [];

  // ── 1. Deduplication ───────────────────────────────────────────────────────
  const existing = await FeedbackSubmission.findOne({
    feedback_id: feedback_id.toUpperCase(),
  });
  if (existing) {
    logger.info('Feedback already ingested — skipping', { feedback_id });
    return { saved: false, feedback_id, reason: 'duplicate' };
  }

  // ── 2. Rating validation ───────────────────────────────────────────────────
  const ratingInt = parseInt(rating, 10);
  if (isNaN(ratingInt) || ratingInt < 1 || ratingInt > 5) {
    logger.warn('Feedback rejected: rating out of range', { feedback_id, rating });
    return { saved: false, feedback_id, reason: `invalid_rating: ${rating}` };
  }

  // ── 3. PII scan & redact comment ──────────────────────────────────────────
  let cleanComment = comment;
  let hadPii = false;
  if (comment) {
    // Truncate first
    const truncated = comment.slice(0, MAX_COMMENT_LENGTH);
    if (truncated.length < comment.length) {
      warnings.push(`comment truncated from ${comment.length} to ${MAX_COMMENT_LENGTH} chars`);
    }
    const piiResult = scanForPii(truncated);
    hadPii = piiResult.hasPii;
    if (hadPii) {
      logger.warn('PII detected in comment — redacting', {
        feedback_id,
        pii_types: piiResult.types,
      });
      warnings.push(`PII redacted from comment: ${piiResult.types.join(', ')}`);
    }
    cleanComment = redactPii(truncated);
  }

  // ── 4. Orphan detection ───────────────────────────────────────────────────
  const parentOrder = await Order.findOne({
    order_id: reference_id.toUpperCase(),
  }).lean();
  const isOrphan = !parentOrder;
  if (isOrphan) {
    logger.warn('Orphan feedback detected — will flag for ETL exclusion', {
      feedback_id,
      reference_id,
    });
    warnings.push(`reference_id ${reference_id} not found in orders — flagged as orphan`);
  }

  // ── 5. Timezone annotation ────────────────────────────────────────────────
  // submitted_at stays UTC; Ghana conversion same value for GMT+0
  const submittedAtDate = utcToGhanaTime(submitted_at);

  // ── 6. Persist ────────────────────────────────────────────────────────────
  const feedback = new FeedbackSubmission({
    feedback_id: feedback_id.toUpperCase(),
    reference_id: reference_id.toUpperCase(),
    delivery_region: delivery_region || null,
    sku: sku ? sku.toUpperCase() : null,
    rating: ratingInt,
    category,
    comment: cleanComment,
    comment_had_pii: hadPii,
    submitted_at: submittedAtDate,
    ingested_at: new Date(),
    is_orphan: isOrphan,
    orphan_checked_at: new Date(),
  });

  await feedback.save();
  logger.info('Feedback ingested', { feedback_id, reference_id, is_orphan: isOrphan });

  return { saved: true, feedback_id, warnings: warnings.length ? warnings : undefined };
};

/**
 * Retrieve feedback submissions with optional filters.
 */
const getFeedback = async ({
  reference_id,
  category,
  min_rating,
  max_rating,
  region,
  is_orphan,
  from,
  to,
  page = 1,
  limit = 50,
} = {}) => {
  const filter = {};
  if (reference_id) filter.reference_id = reference_id.toUpperCase();
  if (category) filter.category = category;
  if (region) filter.delivery_region = region;
  if (typeof is_orphan === 'boolean') filter.is_orphan = is_orphan;
  if (min_rating || max_rating) {
    filter.rating = {};
    if (min_rating) filter.rating.$gte = parseInt(min_rating, 10);
    if (max_rating) filter.rating.$lte = parseInt(max_rating, 10);
  }
  if (from || to) {
    filter.submitted_at = {};
    if (from) filter.submitted_at.$gte = new Date(from);
    if (to) filter.submitted_at.$lte = new Date(to);
  }

  const skip = (page - 1) * limit;
  const [feedbacks, total] = await Promise.all([
    FeedbackSubmission.find(filter)
      .sort({ ingested_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    FeedbackSubmission.countDocuments(filter),
  ]);

  return { feedbacks, total, page, limit, pages: Math.ceil(total / limit) };
};

/**
 * Get a single feedback submission by feedback_id.
 */
const getFeedbackById = async (feedbackId) => {
  return FeedbackSubmission.findOne({ feedback_id: feedbackId.toUpperCase() }).lean();
};

/**
 * Update feedback submission.
 */
const updateFeedback = async (feedbackId, updateData) => {
  const result = await FeedbackSubmission.findOneAndUpdate(
    { feedback_id: feedbackId.toUpperCase() },
    { $set: updateData },
    { new: true, runValidators: true }
  ).lean();
  if (result) {
    logger.info('Feedback updated', { feedback_id: feedbackId });
  }
  return result;
};

/**
 * Delete feedback submission.
 */
const deleteFeedback = async (feedbackId) => {
  const result = await FeedbackSubmission.findOneAndDelete({ feedback_id: feedbackId.toUpperCase() });
  if (result) {
    logger.info('Feedback deleted', { feedback_id: feedbackId });
  }
  return result;
};

/**
 * Get feedback for a specific date (YYYY-MM-DD).
 */
const getFeedbackByDate = async (dateString) => {
  const start = new Date(dateString);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(dateString);
  end.setUTCHours(23, 59, 59, 999);

  return FeedbackSubmission.find({
    submitted_at: { $gte: start, $lte: end },
  }).sort({ submitted_at: 1 }).lean();
};

/**
 * Get feedback by day of week (0-6 or name).
 */
const getFeedbackByDayOfWeek = async (day) => {
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

  return FeedbackSubmission.find({
    $expr: { $eq: [{ $dayOfWeek: '$submitted_at' }, dayIndex + 1] },
  }).sort({ submitted_at: -1 }).lean();
};

/**
 * Generic find feedback by any field.
 */
const findFeedback = async (query) => {
  const filter = {};
  Object.keys(query).forEach((key) => {
    if (['feedback_id', 'reference_id', 'delivery_region', 'sku', 'rating', 'category'].includes(key)) {
      filter[key] = typeof query[key] === 'string' ? query[key].toUpperCase() : query[key];
    }
  });
  return FeedbackSubmission.find(filter).sort({ ingested_at: -1 }).limit(100).lean();
};

module.exports = {
  ingestFeedback,
  getFeedback,
  getFeedbackById,
  updateFeedback,
  deleteFeedback,
  getFeedbackByDate,
  getFeedbackByDayOfWeek,
  findFeedback,
};
