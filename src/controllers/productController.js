'use strict';

const { validationResult } = require('express-validator');
const productService = require('../services/productService');
const logger = require('../utils/logger');

/**
 * POST /api/products
 * Create a new product in the catalogue.
 */
const createProduct = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ success: false, errors: errors.array() });
    }

    const result = await productService.createProduct(req.body);
    if (!result.saved) {
      return res.status(409).json({
        success: false,
        message: `Product not created: ${result.reason}`,
        sku: result.sku,
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Product created successfully',
      sku: result.sku,
      product_id: result.product_id,
    });
  } catch (err) {
    logger.error('createProduct error', { error: err.message });
    next(err);
  }
};

/**
 * POST /api/products/batch
 * Create a batch of products.
 */
const createProductBatch = async (req, res, next) => {
  try {
    const { products } = req.body;
    if (!Array.isArray(products) || products.length === 0) {
      return res.status(422).json({ success: false, message: '`products` must be a non-empty array' });
    }

    const result = await productService.createProductBatch(products);
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
 * GET /api/products
 * List products with optional filters and pagination.
 * Query params: category, brand, is_active, search, from, to, page, limit
 */
const listProducts = async (req, res, next) => {
  try {
    const { category, brand, is_active, search, page, limit } = req.query;

    const result = await productService.getProducts({
      category,
      brand,
      is_active: is_active !== undefined ? is_active === 'true' : undefined,
      search,
      page:  parseInt(page, 10)  || 1,
      limit: Math.min(parseInt(limit, 10) || 50, 200),
    });

    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/products/sku/:sku
 * Retrieve a single product by SKU — primary lookup for cross-collection joins.
 */
const getProductBySku = async (req, res, next) => {
  try {
    const product = await productService.getProductBySku(req.params.sku);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: `Product not found: SKU ${req.params.sku}`,
      });
    }
    return res.status(200).json({ success: true, product });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/products/:productId
 * Retrieve a single product by numeric product_id.
 */
const getProductById = async (req, res, next) => {
  try {
    const id = parseInt(req.params.productId, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: 'product_id must be a number' });
    }

    const product = await productService.getProductById(id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: `Product not found: product_id ${id}`,
      });
    }
    return res.status(200).json({ success: true, product });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/products/sku/:sku
 * Partially update a product. Allowed fields: product_name, category,
 * brand, unit_of_measure, is_active.
 */
const updateProduct = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ success: false, errors: errors.array() });
    }

    const result = await productService.updateProduct(req.params.sku, req.body);
    if (!result.updated) {
      const status = result.reason === 'not_found' ? 404 : 400;
      return res.status(status).json({ success: false, message: result.reason });
    }

    return res.status(200).json({
      success: true,
      message: 'Product updated',
      product: result.product,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/products/sku/:sku/deactivate
 * Soft-delete: mark product as inactive (is_active = false).
 */
const deactivateProduct = async (req, res, next) => {
  try {
    const result = await productService.deactivateProduct(req.params.sku);
    if (!result.updated) {
      return res.status(404).json({ success: false, message: `Product not found: ${req.params.sku}` });
    }
    return res.status(200).json({ success: true, message: 'Product deactivated', product: result.product });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/products/sku/:sku/reactivate
 * Re-enable a previously deactivated product (is_active = true).
 */
const reactivateProduct = async (req, res, next) => {
  try {
    const result = await productService.reactivateProduct(req.params.sku);
    if (!result.updated) {
      return res.status(404).json({ success: false, message: `Product not found: ${req.params.sku}` });
    }
    return res.status(200).json({ success: true, message: 'Product reactivated', product: result.product });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/products/sku/:sku
 * Delete product from catalogue.
 */
const deleteProduct = async (req, res, next) => {
  try {
    const result = await productService.deleteProduct(req.params.sku);
    if (!result) {
      return res.status(404).json({ success: false, message: `Product not found: ${req.params.sku}` });
    }
    return res.status(200).json({ success: true, message: 'Product deleted successfully' });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/products/date/:date
 * Get products by a specific date (YYYY-MM-DD).
 */
const getProductsByDate = async (req, res, next) => {
  try {
    const products = await productService.getProductsByDate(req.params.date);
    return res.status(200).json({ success: true, count: products.length, products });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/products/day/:day
 * Get products by day of week (0-6 or name).
 */
const getProductsByDay = async (req, res, next) => {
  try {
    const products = await productService.getProductsByDayOfWeek(req.params.day);
    return res.status(200).json({ success: true, count: products.length, products });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/products/find/search
 * Find products by generic search parameters.
 */
const findProducts = async (req, res, next) => {
  try {
    const products = await productService.findProducts(req.query);
    return res.status(200).json({ success: true, count: products.length, products });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/products/validate-skus
 * Validate a list of SKUs against the catalogue.
 * Used by upstream services and ETL tools.
 * Body: { skus: ["PRD-A12", "PRD-B04"] }
 */
const validateSkus = async (req, res, next) => {
  try {
    const { skus } = req.body;
    if (!Array.isArray(skus) || skus.length === 0) {
      return res.status(422).json({ success: false, message: '`skus` must be a non-empty array' });
    }

    const result = await productService.validateSkus(skus);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createProduct,
  createProductBatch,
  listProducts,
  getProductBySku,
  getProductById,
  updateProduct,
  deactivateProduct,
  reactivateProduct,
  deleteProduct,
  getProductsByDate,
  getProductsByDay,
  findProducts,
  validateSkus,
};
