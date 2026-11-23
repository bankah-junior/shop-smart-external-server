# ShopSmart External Server API Documentation

This document provides a detailed reference for all available endpoints in the ShopSmart External Server.

## Table of Contents
- [Authentication](#authentication)
- [Base URL](#base-url)
- [Orders API](#orders-api)
  - [Create Order](#create-order)
  - [Create Order Batch](#create-order-batch)
  - [List Orders](#list-orders)
  - [Get Order by ID](#get-order-by-id)
  - [Get Orders by Date](#get-orders-by-date)
  - [Get Orders by Day](#get-orders-by-day)
  - [Search Orders](#search-orders)
  - [Update Order](#update-order)
  - [Delete Order](#delete-order)
- [Feedback API](#feedback-api)
  - [Submit Feedback](#submit-feedback)
  - [List Feedback](#list-feedback)
  - [Get Feedback by ID](#get-feedback-by-id)
  - [Get Feedback by Date](#get-feedback-by-date)
  - [Get Feedback by Day](#get-feedback-by-day)
  - [Search Feedback](#search-feedback)
  - [Update Feedback](#update-feedback)
  - [Delete Feedback](#delete-feedback)

---

## Authentication
All API requests (except for the `/health` check) require an API Key.
- **Header Name**: `X-API-Key`
- **Example**: `X-API-Key: your_secret_api_key_here`

---

## Base URL
- **Development**: `http://localhost:3000`
- **Production**: `<your-deployed-url>`

---

## Orders API

### Create Order
Ingest a single order.
- **Method**: `POST`
- **Path**: `/api/orders`
- **Body** (JSON):
  ```json
  {
    "order_id": "WEB-12345",
    "customer_id": "CUST-001",
    "order_status": "PENDING",
    "delivery_region": "Greater Accra",
    "delivery_city": "Accra",
    "payment_method": "MOMO",
    "total_order_value_ghs": 150.50,
    "order_timestamp_utc": "2023-10-27T10:00:00Z",
    "items": [
      { "sku": "SKU-001", "quantity": 2, "price_ghs": 75.25 }
    ]
  }
  ```
- **Success Response** (201): `{ "success": true, "message": "Order ingested successfully", "order_id": "WEB-12345" }`

### Create Order Batch
Ingest multiple orders in one request.
- **Method**: `POST`
- **Path**: `/api/orders/batch`
- **Body**: `{ "orders": [ ...order objects ] }`
- **Success Response** (207): Returns counts for ingested/skipped/errors.

### List Orders
Retrieve orders with optional filtering and pagination.
- **Method**: `GET`
- **Path**: `/api/orders`
- **Query Params**:
  - `status`: Filter by status (PENDING, FULFILLED, etc.)
  - `region`: Filter by region (Greater Accra, Ashanti, etc.)
  - `from`: Start date (ISO 8601)
  - `to`: End date (ISO 8601)
  - `page`: Page number (default: 1)
  - `limit`: Items per page (default: 50)
- **Success Response** (200): Returns list of orders and pagination metadata.

### Get Order by ID
- **Method**: `GET`
- **Path**: `/api/orders/:orderId`

### Get Orders by Date
Retrieve orders for a specific calendar day.
- **Method**: `GET`
- **Path**: `/api/orders/date/:date` (Example: `/api/orders/date/2023-10-27`)

### Get Orders by Day
Retrieve orders by day of the week.
- **Method**: `GET`
- **Path**: `/api/orders/day/:day` (Example: `/api/orders/day/monday` or `/api/orders/day/1`)

### Search Orders
Generic search by specific fields.
- **Method**: `GET`
- **Path**: `/api/orders/find/search`
- **Query Params**: `order_id`, `customer_id`, `order_status`, `delivery_region`, `delivery_city`, `payment_method`.

### Update Order
Partially update an order's details.
- **Method**: `PATCH`
- **Path**: `/api/orders/:orderId`
- **Body**: JSON object containing fields to update.

### Delete Order
- **Method**: `DELETE`
- **Path**: `/api/orders/:orderId`

---

## Feedback API

### Submit Feedback
- **Method**: `POST`
- **Path**: `/api/feedback`
- **Body** (JSON):
  ```json
  {
    "feedback_id": "FB-999",
    "reference_id": "WEB-12345",
    "rating": 5,
    "category": "Delivery Speed",
    "comment": "Very fast!",
    "submitted_at": "2023-10-27T12:00:00Z"
  }
  ```

### List Feedback
- **Method**: `GET`
  - `category`: Filter by category (Packaging, Staff Service, etc.)
  - `min_rating`: Minimum rating (1-5)
  - `max_rating`: Maximum rating (1-5)
  - `is_orphan`: Boolean string ('true'/'false')

### Get Feedback by ID
- **Method**: `GET`
- **Path**: `/api/feedback/:feedbackId`

### Get Feedback by Date
- **Method**: `GET`
- **Path**: `/api/feedback/date/:date`

### Get Feedback by Day
- **Method**: `GET`
- **Path**: `/api/feedback/day/:day`

### Search Feedback
- **Method**: `GET`
- **Path**: `/api/feedback/find/search`
- **Query Params**: `feedback_id`, `reference_id`, `category`, `rating`, `sku`.

### Update Feedback
- **Method**: `PATCH`
- **Path**: `/api/feedback/:feedbackId`

### Delete Feedback
- **Method**: `DELETE`
- **Path**: `/api/feedback/:feedbackId`
