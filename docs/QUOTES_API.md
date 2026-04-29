# Quotes API – Documentation & Testing

**Route folder:** `src/routes/quotes`
**Base path:** `/api/quotes`
**Service:** `src/services/quote.service.ts`

All endpoints require **authentication**. Permissions: **quotes read** (list, overview, getById), **quotes create** (create), **quotes update** (send, approve, reject).
Base URL: `http://localhost:8000` (or your server).

---

## Module files

| File | Purpose |
|------|--------|
| `quote.routes.ts` | OpenAPI routes and schemas: QuoteListQuerySchema, CreateQuoteBodySchema, QuoteParamsSchema, response schemas |
| `quote.handler.ts` | Handlers: getBusinessIdByUserId, hasPermission(quotes, read/create/update), call quote.service; maps QuoteNotFoundError → 404 |
| `index.ts` | Registers quote routes with the router |

---

## Endpoints

| Method | Path | Summary | Permission |
|--------|------|---------|------------|
| GET | `/` | List quotes (search, status, sortBy, order, page, limit) | quotes read |
| GET | `/overview` | Overview by status, sent last 30d, average | quotes read |
| GET | `/{quoteId}` | Get quote by ID | quotes read |
| POST | `/` | Create quote | quotes create |
| POST | `/{quoteId}/send` | Send quote | quotes update |
| POST | `/{quoteId}/approve` | Approve quote | quotes update |
| POST | `/{quoteId}/reject` | Reject quote | quotes update |

**Quote statuses:** `NOT_APPLIED`, `AWAITING_RESPONSE`, `APPROVED`, `CONVERTED`, `REJECTED`, `EXPIRED` (effective when expiresAt passed and status was AWAITING_RESPONSE).

---

## 1. List quotes

**Endpoint:** `GET /api/quotes`

**Query (optional):** `search`, `status`, `sortBy` (sentAt | createdAt | updatedAt | title), `order` (asc | desc), `page`, `limit`

**Example:** `GET http://localhost:8000/api/quotes?page=1&limit=10&status=NOT_SENT`

**What to check:**

- `data` array: each item has `id`, `quoteNumber`, `title`, `address`, `sentAt`, `expiresAt`, `status`, `total`, `client` (id, name, email, phone)
- `pagination`: `page`, `limit`, `total`, `totalPages`
- 403 if user lacks quotes read

---

## 2. Quote overview

**Endpoint:** `GET /api/quotes/overview`

**Purpose:** Aggregates for dashboard: counts and totals by status, sent in last 30 days, average quote value.

**What to check:**

- `data.byStatus`: array of `{ status, count, total }`
- `data.sentLast30Days`: `{ count, total }`
- `data.averageQuoteLast30Days`: number
- 403 if user lacks quotes read

---

## 3. Get quote by ID

**Endpoint:** `GET /api/quotes/{quoteId}`

**What to check:**

- `data.id`, `quoteNumber`, `title`, `address`, `status`, `sentAt`, `expiresAt`, `subtotal`, `discount`, `tax`, `total`, `client`, `lineItems`, `workOrder`, `assignedTo`
- 404 if quote not found; 403 if no quotes read

---

## 4. Create quote

**Endpoint:** `POST /api/quotes`

**Purpose:** Creates a quote with optional line items; generates quote number and recalculates financials.

**Request body (JSON):**

```json
{
  "title": "Kitchen repair quote",
  "clientId": "<client-id>",
  "address": "123 Main St",
  "assignedToId": null,
  "workOrderId": null,
  "termsConditions": "Payment due in 30 days.",
  "lineItems": [
    {
      "name": "Labour",
      "itemType": "SERVICE",
      "description": "Repair work",
      "quantity": 2,
      "price": 150,
      "cost": null,
      "priceListItemId": null
    }
  ]
}
```

- **Required:** `title`, `clientId`, `address`
- **Optional:** `assignedToId`, `workOrderId`, `termsConditions`, `lineItems` (array of name, itemType, description, quantity, price, cost, priceListItemId)

**What to check (201 Created):**

- `data.id`, `data.quoteNumber`, `data.title`, `data.status` = `NOT_SENT`, `data.client`, `data.lineItems`
- `data.subtotal`, `data.total` recalculated from line items
- 404 if business or client not found; 403 if no quotes create

**Save:** `data.id` for send/approve/reject.

---

## 5. Send quote

**Endpoint:** `POST /api/quotes/{quoteId}/send`

**Purpose:** Sets status to `AWAITING_RESPONSE`, sets `sentAt` (and typically `expiresAt`). Only valid when quote is `NOT_SENT`.

**No body.**

**What to check (200 OK):**

- `data.status` = `AWAITING_RESPONSE`, `data.sentAt` set
- 404 if quote not found; 400 if already sent or terminal state; 403 if no quotes update

---

## 6. Approve quote

**Endpoint:** `POST /api/quotes/{quoteId}/approve`

**Purpose:** Sets status to `APPROVED`. Only valid when quote is `AWAITING_RESPONSE`.

**No body.**

**What to check (200 OK):**

- `data.status` = `APPROVED`, `data.approvedAt` set
- 404 if quote not found; 400 if not awaiting response; 403 if no quotes update

---

## 7. Reject quote

**Endpoint:** `POST /api/quotes/{quoteId}/reject`

**Purpose:** Sets status to `REJECTED`. Only valid when quote is `AWAITING_RESPONSE`.

**No body.**

**What to check (200 OK):**

- `data.status` = `REJECTED`, `data.rejectedAt` set
- 404 if quote not found; 400 if not awaiting response; 403 if no quotes update

---

## Quick checklist

| Step | Endpoint | Check |
|------|----------|--------|
| 1 | `GET /api/quotes` | List returns `data` + `pagination` |
| 2 | `GET /api/quotes/overview` | byStatus, sentLast30Days, averageQuoteLast30Days |
| 3 | `POST /api/quotes` | 201, `data.id`, `data.quoteNumber`, `data.lineItems`, totals |
| 4 | `GET /api/quotes/{quoteId}` | Full quote detail |
| 5 | `POST /api/quotes/{quoteId}/send` | status AWAITING_RESPONSE, sentAt set |
| 6 | `POST /api/quotes/{quoteId}/approve` or `reject` | status and timestamp updated |

---

## Getting clientId

- **Client list:** `GET /api/clients` → use one of the returned `id` values as `clientId` in create quote.

---

## Related

- **Service:** `quote.service.ts` – listQuotes, getQuoteOverview, getQuoteById, createQuote, sendQuote, approveQuote, rejectQuote; effective status EXPIRED; recalculateQuoteFinancials.
- **Errors:** `QuoteNotFoundError` → 404, `ClientNotFoundError` → 404 (in handler).
