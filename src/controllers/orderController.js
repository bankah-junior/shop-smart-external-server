'use strict';

const { validationResult } = require('express-validator');
const orderService = require('../services/orderService');
const logger = require('../utils/logger');

/**
 * POST /api/orders
 * Ingest a single order from the E-Commerce REST API sync job.
 */
const createOrder = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ success: false, errors: errors.array() });
    }

    const result = await orderService.ingestOrder(req.body);
    if (!result.saved) {
      return res.status(200).json({
        success: true,
        message: `Order skipped: ${result.reason}`,
        order_id: result.order_id,
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Order ingested successfully',
      order_id: result.order_id,
    });
  } catch (err) {
    logger.error('createOrder error', { error: err.message });
    next(err);
  }
};

/**
 * POST /api/orders/batch
 * Ingest a batch of orders.
 */
const createOrderBatch = async (req, res, next) => {
  try {
    const { orders } = req.body;
    if (!Array.isArray(orders) || orders.length === 0) {
      return res.status(422).json({ success: false, message: '`orders` must be a non-empty array' });
    }

    const result = await orderService.ingestOrderBatch(orders);
    return res.status(207).json({
      success: true,
      message: 'Batch processed',
      ...result,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/orders
 * Retrieve orders with optional filtering and pagination.
 */
const listOrders = async (req, res, next) => {
  try {
    const { status, region, from, to, page, limit } = req.query;
    const result = await orderService.getOrders({
      status,
      region,
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
 * GET /api/orders/:orderId
 * Retrieve a single order by order_id.
 */
const getOrder = async (req, res, next) => {
  try {
    const order = await orderService.getOrderById(req.params.orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: `Order not found: ${req.params.orderId}`,
      });
    }
    return res.status(200).json({ success: true, order });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/orders/:orderId
 * Update an order.
 */
const updateOrder = async (req, res, next) => {
  try {
    const order = await orderService.updateOrder(req.params.orderId, req.body);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: `Order not found: ${req.params.orderId}`,
      });
    }
    return res.status(200).json({ success: true, order });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/orders/:orderId
 * Delete an order.
 */
const deleteOrder = async (req, res, next) => {
  try {
    const result = await orderService.deleteOrder(req.params.orderId);
    if (!result) {
      return res.status(404).json({
        success: false,
        message: `Order not found: ${req.params.orderId}`,
      });
    }
    return res.status(200).json({ success: true, message: 'Order deleted successfully' });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/orders/date/:date
 * Get orders by a specific date (YYYY-MM-DD).
 */
const getOrdersByDate = async (req, res, next) => {
  try {
    const orders = await orderService.getOrdersByDate(req.params.date);
    return res.status(200).json({ success: true, count: orders.length, orders });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/orders/day/:day
 * Get orders by day of week (0-6 or name).
 */
const getOrdersByDay = async (req, res, next) => {
  try {
    const orders = await orderService.getOrdersByDayOfWeek(req.params.day);
    return res.status(200).json({ success: true, count: orders.length, orders });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/orders/find/search
 * Find orders by generic search parameters.
 */
const findOrders = async (req, res, next) => {
  try {
    const orders = await orderService.findOrders(req.query);
    return res.status(200).json({ success: true, count: orders.length, orders });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createOrder,
  createOrderBatch,
  listOrders,
  getOrder,
  updateOrder,
  deleteOrder,
  getOrdersByDate,
  getOrdersByDay,
  findOrders,
};
