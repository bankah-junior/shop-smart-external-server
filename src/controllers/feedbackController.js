'use strict';

const { validationResult } = require('express-validator');
const feedbackService = require('../services/feedbackService');
const logger = require('../utils/logger');

/**
 * POST /api/feedback
 * Receive a single feedback submission webhook payload.
 */
const receiveFeedback = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ success: false, errors: errors.array() });
    }

    const result = await feedbackService.ingestFeedback(req.body);

    if (!result.saved) {
      return res.status(200).json({
        success: true,
        message: `Feedback skipped: ${result.reason}`,
        feedback_id: result.feedback_id,
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Feedback ingested successfully',
      feedback_id: result.feedback_id,
      ...(result.warnings && { warnings: result.warnings }),
    });
  } catch (err) {
    logger.error('receiveFeedback error', { error: err.message });
    next(err);
  }
};

/**
 * GET /api/feedback
 * Retrieve feedback submissions with optional filtering and pagination.
 */
const listFeedback = async (req, res, next) => {
  try {
    const {
      order_id,
      category,
      min_rating,
      max_rating,
      region,
      is_orphan,
      from,
      to,
      page,
      limit,
    } = req.query;

    const result = await feedbackService.getFeedback({
      order_id,
      category,
      min_rating,
      max_rating,
      region,
      is_orphan: is_orphan !== undefined ? is_orphan === 'true' : undefined,
      from,
      to,
      page: parseInt(page, 10) || 1,
      limit: Math.min(parseInt(limit, 10) || 50, 200),
    });

    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/feedback/:feedbackId
 * Retrieve a single feedback submission by feedback_id.
 */
const getFeedback = async (req, res, next) => {
  try {
    const feedback = await feedbackService.getFeedbackById(req.params.feedbackId);
    if (!feedback) {
      return res.status(404).json({
        success: false,
        message: `Feedback not found: ${req.params.feedbackId}`,
      });
    }
    return res.status(200).json({ success: true, feedback });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/feedback/:feedbackId
 * Update feedback.
 */
const updateFeedback = async (req, res, next) => {
  try {
    const feedback = await feedbackService.updateFeedback(req.params.feedbackId, req.body);
    if (!feedback) {
      return res.status(404).json({
        success: false,
        message: `Feedback not found: ${req.params.feedbackId}`,
      });
    }
    return res.status(200).json({ success: true, feedback });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/feedback/:feedbackId
 * Delete feedback.
 */
const deleteFeedback = async (req, res, next) => {
  try {
    const result = await feedbackService.deleteFeedback(req.params.feedbackId);
    if (!result) {
      return res.status(404).json({
        success: false,
        message: `Feedback not found: ${req.params.feedbackId}`,
      });
    }
    return res.status(200).json({ success: true, message: 'Feedback deleted successfully' });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/feedback/date/:date
 * Get feedback by a specific date (YYYY-MM-DD).
 */
const getFeedbackByDate = async (req, res, next) => {
  try {
    const feedbacks = await feedbackService.getFeedbackByDate(req.params.date);
    return res.status(200).json({ success: true, count: feedbacks.length, feedbacks });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/feedback/day/:day
 * Get feedback by day of week (0-6 or name).
 */
const getFeedbackByDay = async (req, res, next) => {
  try {
    const feedbacks = await feedbackService.getFeedbackByDayOfWeek(req.params.day);
    return res.status(200).json({ success: true, count: feedbacks.length, feedbacks });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/feedback/find/search
 * Find feedback by generic search parameters.
 */
const findFeedback = async (req, res, next) => {
  try {
    const feedbacks = await feedbackService.findFeedback(req.query);
    return res.status(200).json({ success: true, count: feedbacks.length, feedbacks });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  receiveFeedback,
  listFeedback,
  getFeedback,
  updateFeedback,
  deleteFeedback,
  getFeedbackByDate,
  getFeedbackByDay,
  findFeedback,
};
