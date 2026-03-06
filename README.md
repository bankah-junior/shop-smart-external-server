# ShopSmartExternalServer

A secure Node.js + Express server backed by local MongoDB that acts as the **staging layer** for ShopSmart's Online Channel data. It receives raw E-Commerce API order payloads (via GET-sync) and Customer Feedback webhook POSTs, applies data quality rules, and makes clean, de-duplicated records available to downstream ETL pipelines.

---

## Architecture Overview

```
External E-Commerce API  ──(sync job GET)──▶  POST /api/orders
Customer Feedback Webhook ──(real-time)──────▶  POST /api/feedback
                                                        │
                                               MongoDB Staging DB
                                                        │
                                               ETL Pipeline reads
                                                GET /api/orders
                                                GET /api/feedback
```

---

## Quick Start

### Prerequisites
- Node.js ≥ 18
- MongoDB running locally on port 27017

### Install & run

```bash
cd ShopSmartExternalServer
npm install

# Copy and edit environment config
cp .env.example .env

npm run dev   # development (nodemon)
npm start     # production
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `NODE_ENV` | `development` | Environment |
| `MONGO_URI` | `mongodb://localhost:27017/shopsmart_external` | MongoDB connection string |
| `API_KEY` | *(set in .env)* | Shared secret for `X-API-Key` header |
| `RATE_LIMIT_WINDOW_MS` | `900000` | Rate limit window (ms) |
| `RATE_LIMIT_MAX` | `100` | Max requests per window per IP |
| `LOG_LEVEL` | `info` | Winston log level |

---

## API Reference

### Authentication

All `/api/*` routes require the `X-API-Key` header:

```
X-API-Key: your-api-key
```

The `/health` endpoint is public (for load balancer checks).

---

### Health Check

```
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "service": "ShopSmartExternalServer",
  "database": "connected",
  "timestamp": "2026-03-05T12:00:00.000Z",
  "uptime_seconds": 3600
}
```

---

### Orders

#### Ingest a single order
```
POST /api/orders
Content-Type: application/json
X-API-Key: <key>
```

**Request body** (raw E-Commerce API payload):
```json
{
  "order_id": "WEB-99021",
  "customer_id": "CUST-441",
  "order_status": "FULFILLED",
  "delivery_region": "Greater Accra",
  "delivery_city": "Accra",
  "delivery_address": "12 Independence Ave, Accra",
  "payment_method": "MOMO",
  "total_order_value_ghs": 150.00,
  "order_timestamp_utc": "2026-03-05T12:00:00Z",
  "items": [
    { "sku": "PRD-A12", "quantity": 1, "price_ghs": 150.00 }
  ]
}
```

**Responses:**
- `201` — Order ingested
- `200` — Skipped (duplicate)
- `422` — Validation errors

#### Ingest a batch of orders
```
POST /api/orders/batch
Content-Type: application/json
X-API-Key: <key>

{ "orders": [ ...array of order payloads... ] }
```

**Response `207`:**
```json
{ "success": true, "ingested": 5, "skipped": 1, "errors": [] }
```

#### List orders
```
GET /api/orders?status=FULFILLED&region=Greater+Accra&from=2026-01-01&to=2026-03-31&page=1&limit=50
X-API-Key: <key>
```

| Query param | Values |
|---|---|
| `status` | `PENDING`, `FULFILLED`, `CANCELLED`, `RETURNED` |
| `region` | `Greater Accra`, `Ashanti`, `Western`, `Central` |
| `from` | ISO 8601 date |
| `to` | ISO 8601 date |
| `page` | integer (default: 1) |
| `limit` | integer (default: 50, max: 200) |

#### Get a single order
```
GET /api/orders/:orderId
X-API-Key: <key>
```

---

### Feedback (Webhook Receiver)

#### Receive a feedback submission
```
POST /api/feedback
Content-Type: application/json
X-API-Key: <key>
```

**Request body** (raw webhook payload):
```json
{
  "feedback_id": "FB-882",
  "reference_id": "WEB-99021",
  "delivery_region": "Western",
  "sku": "PRD-A12",
  "rating": 4,
  "category": "Delivery Speed",
  "comment": "Arrived on time in Takoradi.",
  "submitted_at": "2026-03-05T15:44:00Z"
}
```

**Responses:**
- `201` — Feedback ingested (with optional `warnings` array for PII redaction, truncation)
- `200` — Skipped (duplicate or invalid rating)
- `422` — Validation errors

#### List feedback submissions
```
GET /api/feedback?reference_id=WEB-99021&category=Delivery+Speed&min_rating=3&is_orphan=false
X-API-Key: <key>
```

| Query param | Values |
|---|---|
| `reference_id` | e.g. `WEB-99021` |
| `category` | See valid values below |
| `min_rating` / `max_rating` | 1–5 |
| `region` | Ghana region |
| `is_orphan` | `true` or `false` |
| `from` / `to` | ISO 8601 date |
| `page` / `limit` | pagination |

**Valid categories:** `Delivery Speed`, `Product Quality`, `Staff Service`, `App Experience`, `Packaging`

#### Get a single feedback submission
```
GET /api/feedback/:feedbackId
X-API-Key: <key>
```

---

## Data Quality Rules Implemented

### Orders
| Rule | Implementation |
|---|---|
| Deduplication on `order_id` | `Order.findOne({ order_id })` before save — skip if exists |
| Items unpacked from array | Each `items[]` entry → flat `order_items` subdocument |
| `order_item_id` generated | `{order_id}-{001, 002, ...}` padded sequence |
| `line_total_ghs` derived | `quantity × unit_price_ghs` persisted per item |
| Line total validation | `SUM(line_total_ghs)` vs `total_order_value_ghs` — mismatch logged and flagged |
| UTC → Ghana time | `order_timestamp_ghana` set (GMT+0 = UTC for Ghana) |
| PII masking | `customer_id_masked` (deterministic hash) and `delivery_address_masked` stored alongside raw values |
| Enum validation | `order_status`, `payment_method`, `delivery_region` all strictly validated |

### Feedback
| Rule | Implementation |
|---|---|
| Rating validation | `1–5` enforced at route validation; out-of-range → logged and rejected |
| PII scan in comment | Regex scan for email patterns and phone numbers; detected PII replaced with `[REDACTED_*]` |
| Comment truncation | Hard limit at 1000 characters |
| Orphan detection | `reference_id` checked against `orders` collection; unresolved → `is_orphan: true` |
| Deduplication on `feedback_id` | Skip if already exists |
| UTC timestamp annotation | `submitted_at` stored as-is; `ingested_at` set on receipt |

---

## MongoDB Collections

| Collection | Description |
|---|---|
| `orders` | One document per online order. Contains embedded `order_items` array. |
| `feedbacksubmissions` | One document per feedback webhook POST. |

---

## Project Structure

```
ShopSmartExternalServer/
├── src/
│   ├── app.js                    # Express server entry point
│   ├── config/
│   │   └── db.js                 # MongoDB connection
│   ├── models/
│   │   ├── Order.js              # Order + OrderItem schema
│   │   └── FeedbackSubmission.js # Feedback schema
│   ├── routes/
│   │   ├── orders.js             # Order routes + validation
│   │   ├── feedback.js           # Feedback routes + validation
│   │   └── health.js             # Health check
│   ├── controllers/
│   │   ├── orderController.js
│   │   └── feedbackController.js
│   ├── services/
│   │   ├── orderService.js       # Ingest, deduplicate, transform orders
│   │   └── feedbackService.js    # Ingest, validate, PII-scan feedback
│   ├── middleware/
│   │   ├── auth.js               # X-API-Key authentication
│   │   └── errorHandler.js       # Central error + 404 handler
│   └── utils/
│       ├── logger.js             # Winston logger
│       ├── piiScanner.js         # PII detection, redaction, masking
│       └── timezone.js           # UTC → Ghana GMT+0 conversion
├── logs/                         # Log files (gitignored)
├── .env                          # Local config (gitignored)
├── .env.example                  # Config template
├── .gitignore
└── package.json
```

---

## Security Features

- **API Key auth** on all `/api/*` routes via `X-API-Key` header
- **Helmet** sets secure HTTP headers
- **Rate limiting** — 100 requests / 15 min per IP (configurable)
- **Request size limit** — 2MB max body
- **PII never logged** — raw `customer_id` and `delivery_address` are not written to logs
- **Stack traces hidden** in production (`NODE_ENV=production`)
