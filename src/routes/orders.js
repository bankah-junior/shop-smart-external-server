'use strict';

const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const orderController = require('../controllers/orderController');

// ── Validation rules for a single order payload ───────────────────────────────
const orderValidation = [
  body('order_id').isString().trim().notEmpty().withMessage('order_id is required'),
  body('customer_id').isString().trim().notEmpty().withMessage('customer_id is required'),
  body('order_status')
    .isIn(['PENDING', 'FULFILLED', 'CANCELLED', 'RETURNED'])
    .withMessage('order_status must be PENDING, FULFILLED, CANCELLED, or RETURNED'),
  body('delivery_region')
    .isIn(['Greater Accra', 'Ashanti', 'Western', 'Central'])
    .withMessage('delivery_region must be a valid Ghana region'),
  body('delivery_city').isString().trim().notEmpty().withMessage('delivery_city is required'),
  body('payment_method')
    .isIn(['MOMO', 'CARD', 'COD'])
    .withMessage('payment_method must be MOMO, CARD, or COD'),
  body('total_order_value_ghs')
    .isFloat({ min: 0.01 })
    .withMessage('total_order_value_ghs must be a positive number'),
  body('order_timestamp_utc').isISO8601().withMessage('order_timestamp_utc must be a valid ISO 8601 timestamp'),
  body('items').isArray({ min: 1 }).withMessage('items must be a non-empty array'),
  body('items.*.sku').isString().trim().notEmpty().withMessage('Each item must have a sku'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Each item quantity must be an integer > 0'),
  body('items.*.price_ghs').isFloat({ min: 0.01 }).withMessage('Each item price_ghs must be > 0'),
];

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/orders:
 *   post:
 *     summary: Ingest a single order
 *     tags: [Orders]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Order'
 *     responses:
 *       201:
 *         description: Order ingested successfully
 *       422:
 *         description: Validation error
 */
router.post('/', orderValidation, orderController.createOrder);

/**
 * @swagger
 * /api/orders/batch:
 *   post:
 *     summary: Ingest a batch of orders
 *     tags: [Orders]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               orders:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/Order'
 *     responses:
 *       207:
 *         description: Batch processed
 */
router.post('/batch', orderController.createOrderBatch);

/**
 * @swagger
 * /api/orders/all:
 *   get:
 *     summary: Retrieve all orders without pagination
 *     tags: [Orders]
 *     responses:
 *       200:
 *         description: List of all orders
 */
router.get('/all', orderController.getAllOrders);

/**
 * @swagger
 * /api/orders:
 *   get:
 *     summary: List orders with filtering
 *     tags: [Orders]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *       - in: query
 *         name: region
 *         schema: { type: string }
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *     responses:
 *       200:
 *         description: List of orders
 */
router.get('/', orderController.listOrders);

/**
 * @swagger
 * /api/orders/date/{date}:
 *   get:
 *     summary: Get orders by a specific date
 *     tags: [Orders]
 *     parameters:
 *       - in: path
 *         name: date
 *         required: true
 *         schema: { type: string, format: date }
 *         description: YYYY-MM-DD
 *     responses:
 *       200:
 *         description: List of orders for the date
 */
router.get('/date/:date', orderController.getOrdersByDate);

/**
 * @swagger
 * /api/orders/day/{day}:
 *   get:
 *     summary: Get orders by day of week
 *     tags: [Orders]
 *     parameters:
 *       - in: path
 *         name: day
 *         required: true
 *         schema: { type: string }
 *         description: 0-6 or day name (monday)
 *     responses:
 *       200:
 *         description: List of orders for the day
 */
router.get('/day/:day', orderController.getOrdersByDay);

/**
 * @swagger
 * /api/orders/find/search:
 *   get:
 *     summary: Search orders by any field
 *     tags: [Orders]
 *     parameters:
 *       - in: query
 *         name: order_status
 *         schema: { type: string }
 *       - in: query
 *         name: delivery_region
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Matching orders
 */
router.get('/find/search', orderController.findOrders);

/**
 * @swagger
 * /api/orders/{orderId}:
 *   get:
 *     summary: Get order by ID
 *     tags: [Orders]
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Order details
 *       404:
 *         description: Order not found
 */
router.get('/:orderId', orderController.getOrder);

/**
 * @swagger
 * /api/orders/{orderId}:
 *   patch:
 *     summary: Update an order
 *     tags: [Orders]
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Order'
 *     responses:
 *       200:
 *         description: Updated order
 *       404:
 *         description: Order not found
 */
router.patch('/:orderId', orderController.updateOrder);

/**
 * @swagger
 * /api/orders/{orderId}:
 *   delete:
 *     summary: Delete an order
 *     tags: [Orders]
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Order deleted
 *       404:
 *         description: Order not found
 */
router.delete('/:orderId', orderController.deleteOrder);

module.exports = router;
