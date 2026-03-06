'use strict';

const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'ShopSmart External Server API',
      version: '1.0.0',
      description: 'E-Commerce Orders & Customer Feedback API Documentation',
      contact: {
        name: 'API Support',
        email: 'support@shopsmart.com',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server',
      },
    ],
    security: [
      {
        ApiKeyAuth: [],
      },
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'Enter your API key to access protected routes',
        },
      },
      schemas: {
        Order: {
          type: 'object',
          properties: {
            order_id: { type: 'string' },
            customer_id: { type: 'string' },
            order_status: { type: 'string', enum: ['PENDING', 'FULFILLED', 'CANCELLED', 'RETURNED'] },
            delivery_region: { type: 'string' },
            delivery_city: { type: 'string' },
            payment_method: { type: 'string', enum: ['MOMO', 'CARD', 'COD'] },
            total_order_value_ghs: { type: 'number' },
            order_timestamp_utc: { type: 'string', format: 'date-time' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  sku: { type: 'string' },
                  quantity: { type: 'integer' },
                  price_ghs: { type: 'number' },
                },
              },
            },
          },
        },
        Feedback: {
          type: 'object',
          properties: {
            feedback_id: { type: 'string' },
            reference_id: { type: 'string' },
            delivery_region: { type: 'string' },
            sku: { type: 'string' },
            rating: { type: 'integer', minimum: 1, maximum: 5 },
            category: { type: 'string' },
            comment: { type: 'string' },
            submitted_at: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  },
  apis: ['./src/routes/*.js'], // Path to the API docs
};

const specs = swaggerJsdoc(options);

module.exports = {
  swaggerUi,
  specs,
};
