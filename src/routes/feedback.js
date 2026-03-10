'use strict';

const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const feedbackController = require('../controllers/feedbackController');

const VALID_CATEGORIES = [
  'Delivery Speed',
  'Product Quality',
  'Staff Service',
  'App Experience',
  'Packaging',
];

// ── Validation rules for a feedback webhook payload ───────────────────────────
const feedbackValidation = [
  body('feedback_id').isString().trim().notEmpty().withMessage('feedback_id is required'),
  body('reference_id').isString().trim().notEmpty().withMessage('reference_id is required'),
  body('delivery_region')
    .optional({ nullable: true })
    .isIn(['Greater Accra', 'Ashanti', 'Western', 'Central', null])
    .withMessage('delivery_region must be a valid Ghana region or null'),
  body('sku')
    .optional({ nullable: true })
    .isString()
    .trim(),
  body('rating')
    .isInt({ min: 1, max: 5 })
    .withMessage('rating must be an integer between 1 and 5'),
  body('category')
    .isIn(VALID_CATEGORIES)
    .withMessage(`category must be one of: ${VALID_CATEGORIES.join(', ')}`),
  body('comment')
    .optional({ nullable: true })
    .isString(),
  body('submitted_at')
    .isISO8601()
    .withMessage('submitted_at must be a valid ISO 8601 timestamp'),
];

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/feedback:
 *   post:
 *     summary: Ingest customer feedback
 *     tags: [Feedback]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Feedback'
 *     responses:
 *       201:
 *         description: Feedback ingested
 *       422:
 *         description: Validation error
 */
router.post('/', feedbackValidation, feedbackController.receiveFeedback);

/**
 * @swagger
 * /api/feedback/all:
 *   get:
 *     summary: Retrieve all feedback submissions without pagination
 *     tags: [Feedback]
 *     responses:
 *       200:
 *         description: List of all feedback
 */
router.get('/all', feedbackController.getAllFeedback);

/**
 * @swagger
 * /api/feedback:
 *   get:
 *     summary: List feedback with filtering
 *     tags: [Feedback]
 *     parameters:
 *       - in: query
 *         name: category
 *         schema: { type: string }
 *       - in: query
 *         name: region
 *         schema: { type: string }
 *       - in: query
 *         name: min_rating
 *         schema: { type: integer }
 *       - in: query
 *         name: max_rating
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: List of feedback
 */
router.get('/', feedbackController.listFeedback);

/**
 * @swagger
 * /api/feedback/date/{date}:
 *   get:
 *     summary: Get feedback by a specific date
 *     tags: [Feedback]
 *     parameters:
 *       - in: path
 *         name: date
 *         required: true
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Feedback for the date
 */
router.get('/date/:date', feedbackController.getFeedbackByDate);

/**
 * @swagger
 * /api/feedback/day/{day}:
 *   get:
 *     summary: Get feedback by day of week
 *     tags: [Feedback]
 *     parameters:
 *       - in: path
 *         name: day
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Feedback for the day
 */
router.get('/day/:day', feedbackController.getFeedbackByDay);

/**
 * @swagger
 * /api/feedback/find/search:
 *   get:
 *     summary: Search feedback by any field
 *     tags: [Feedback]
 *     parameters:
 *       - in: query
 *         name: category
 *         schema: { type: string }
 *       - in: query
 *         name: rating
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Matching feedback
 */
router.get('/find/search', feedbackController.findFeedback);

/**
 * @swagger
 * /api/feedback/{feedbackId}:
 *   get:
 *     summary: Get feedback by ID
 *     tags: [Feedback]
 *     parameters:
 *       - in: path
 *         name: feedbackId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Feedback details
 *       404:
 *         description: Not found
 */
router.get('/:feedbackId', feedbackController.getFeedback);

/**
 * @swagger
 * /api/feedback/{feedbackId}:
 *   patch:
 *     summary: Update feedback
 *     tags: [Feedback]
 *     parameters:
 *       - in: path
 *         name: feedbackId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Feedback'
 *     responses:
 *       200:
 *         description: Updated feedback
 *       404:
 *         description: Not found
 */
router.patch('/:feedbackId', feedbackController.updateFeedback);

/**
 * @swagger
 * /api/feedback/{feedbackId}:
 *   delete:
 *     summary: Delete feedback
 *     tags: [Feedback]
 *     parameters:
 *       - in: path
 *         name: feedbackId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Feedback deleted
 *       404:
 *         description: Not found
 */
router.delete('/:feedbackId', feedbackController.deleteFeedback);

module.exports = router;
