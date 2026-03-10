'use strict';

const express    = require('express');
const { body }   = require('express-validator');
const router     = express.Router();
const ctrl       = require('../controllers/productController');

// ── Shared validation rules ───────────────────────────────────────────────────

const createValidation = [
  body('sku')
    .isString().trim().notEmpty().withMessage('sku is required')
    .matches(/^PRD-[A-Z0-9]+$/i).withMessage('sku must match format PRD-XXXXX'),
  body('product_name')
    .isString().trim().notEmpty().withMessage('product_name is required')
    .isLength({ max: 200 }).withMessage('product_name must be <= 200 characters'),
  body('category')
    .isString().trim().notEmpty().withMessage('category is required')
    .isLength({ max: 100 }).withMessage('category must be <= 100 characters'),
  body('brand')
    .optional({ nullable: true })
    .isString().trim()
    .isLength({ max: 100 }).withMessage('brand must be <= 100 characters'),
  body('unit_of_measure')
    .optional({ nullable: true })
    .isString().trim()
    .isLength({ max: 20 }).withMessage('unit_of_measure must be <= 20 characters'),
  body('is_active')
    .optional()
    .isBoolean().withMessage('is_active must be a boolean'),
];

const updateValidation = [
  body('product_name')
    .optional()
    .isString().trim().notEmpty()
    .isLength({ max: 200 }).withMessage('product_name must be <= 200 characters'),
  body('category')
    .optional()
    .isString().trim().notEmpty()
    .isLength({ max: 100 }).withMessage('category must be <= 100 characters'),
  body('brand')
    .optional({ nullable: true })
    .isString().trim()
    .isLength({ max: 100 }),
  body('unit_of_measure')
    .optional({ nullable: true })
    .isString().trim()
    .isLength({ max: 20 }),
  body('is_active')
    .optional()
    .isBoolean().withMessage('is_active must be a boolean'),
];

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/products:
 *   post:
 *     summary: Create a new product
 *     tags: [Products]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Product'
 *     responses:
 *       201:
 *         description: Product created
 *       422:
 *         description: Validation error
 *       409:
 *         description: Duplicate SKU
 */
router.post('/', createValidation, ctrl.createProduct);

/**
 * @swagger
 * /api/products/batch:
 *   post:
 *     summary: Create a batch of products
 *     tags: [Products]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               products:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/Product'
 *     responses:
 *       207:
 *         description: Batch processed
 */
router.post('/batch', ctrl.createProductBatch);

/**
 * @swagger
 * /api/products/all:
 *   get:
 *     summary: Retrieve all products without pagination
 *     tags: [Products]
 *     responses:
 *       200:
 *         description: List of all products
 */
router.get('/all', ctrl.getAllProducts);

/**
 * @swagger
 * /api/products:
 *   get:
 *     summary: List products with filtering
 *     tags: [Products]
 *     parameters:
 *       - in: query
 *         name: category
 *         schema: { type: string }
 *       - in: query
 *         name: brand
 *         schema: { type: string }
 *       - in: query
 *         name: is_active
 *         schema: { type: boolean }
 *       - in: query
 *         name: search
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
 *         description: List of products
 */
router.get('/', ctrl.listProducts);

/**
 * @swagger
 * /api/products/date/{date}:
 *   get:
 *     summary: Get products by ingestion date
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: date
 *         required: true
 *         schema: { type: string, format: date }
 *         description: YYYY-MM-DD
 *     responses:
 *       200:
 *         description: List of products for the date
 */
router.get('/date/:date', ctrl.getProductsByDate);

/**
 * @swagger
 * /api/products/day/{day}:
 *   get:
 *     summary: Get products by day of week
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: day
 *         required: true
 *         schema: { type: string }
 *         description: 0-6 or day name (monday)
 *     responses:
 *       200:
 *         description: List of products for the day
 */
router.get('/day/:day', ctrl.getProductsByDay);

/**
 * @swagger
 * /api/products/find/search:
 *   get:
 *     summary: Search products by any field
 *     tags: [Products]
 *     parameters:
 *       - in: query
 *         name: sku
 *         schema: { type: string }
 *       - in: query
 *         name: product_name
 *         schema: { type: string }
 *       - in: query
 *         name: category
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Matching products
 */
router.get('/find/search', ctrl.findProducts);

/**
 * @swagger
 * /api/products/validate-skus:
 *   post:
 *     summary: Validate a list of SKUs
 *     tags: [Products]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               skus:
 *                 type: array
 *                 items: { type: string }
 *     responses:
 *       200:
 *         description: Validation result
 */
router.post('/validate-skus', ctrl.validateSkus);

/**
 * @swagger
 * /api/products/sku/{sku}:
 *   get:
 *     summary: Get product by SKU
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: sku
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Product details
 *       404:
 *         description: Not found
 */
router.get('/sku/:sku', ctrl.getProductBySku);

/**
 * @swagger
 * /api/products/sku/{sku}:
 *   patch:
 *     summary: Update product by SKU
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: sku
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Product'
 *     responses:
 *       200:
 *         description: Updated product
 *       404:
 *         description: Not found
 */
router.patch('/sku/:sku', updateValidation, ctrl.updateProduct);

/**
 * @swagger
 * /api/products/sku/{sku}:
 *   delete:
 *     summary: Delete product by SKU
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: sku
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Product deleted
 *       404:
 *         description: Not found
 */
router.delete('/sku/:sku', ctrl.deleteProduct);

/**
 * @swagger
 * /api/products/sku/{sku}/deactivate:
 *   patch:
 *     summary: Deactivate product
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: sku
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Product deactivated
 */
router.patch('/sku/:sku/deactivate', ctrl.deactivateProduct);

/**
 * @swagger
 * /api/products/sku/{sku}/reactivate:
 *   patch:
 *     summary: Reactivate product
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: sku
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Product reactivated
 */
router.patch('/sku/:sku/reactivate', ctrl.reactivateProduct);

/**
 * @swagger
 * /api/products/{productId}:
 *   get:
 *     summary: Get product by ID
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Product details
 *       404:
 *         description: Not found
 */
router.get('/:productId', ctrl.getProductById);

module.exports = router;
