# Quotes Frontend Integration Guide

This guide explains how frontend should work with Quotes in the current backend flow.

## Base URL and Auth

- Base URL: `http://localhost:8000`
- Quote API base path: `/api/quotes`
- All endpoints require authenticated user session/token.

## Important Flow Rule

Quote creation is workorder-driven.

- Direct `POST /api/quotes` is currently disabled in routes.
- To create a quote, create a workorder with `quoteRequired: true`.

Example:

`POST /api/workorders`
```json
{
  "title": "Install AC",
  "clientId": "client_id",
  "address": "Lahore",
  "quoteRequired": true,
  "quoteTermsConditions": null,
  "lineItems": [
    {
      "name": "Service",
      "itemType": "SERVICE",
      "quantity": 1,
      "price": 100
    }
  ]
}
```

After creation:
- workorder response includes `data.quotes`
- quote record includes `workOrderId` and `quoteRequired`

## Quote Endpoints (Current)

- `GET /api/quotes`
  - List quotes
  - Query: `search`, `quoteStatus`, `sortBy`, `order`, `page`, `limit`

- `GET /api/quotes/overview`
  - Quote status counts

- `GET /api/quotes/{quoteId}`
  - Quote detail

- `PATCH /api/quotes/{quoteId}`
  - Update editable fields (`title`, `address`, `notes`, `quoteTermsConditions`, `lineItems`, etc.)

- `PATCH /api/quotes/{quoteId}/status`
  - Direct status update

- `POST /api/quotes/{quoteId}/set-awaiting-response`
- `POST /api/quotes/{quoteId}/send`
- `POST /api/quotes/{quoteId}/send-email`
- `GET /api/quotes/{quoteId}/email-compose`
- `POST /api/quotes/{quoteId}/approve`
- `POST /api/quotes/{quoteId}/reject`

- Client actions:
  - `GET /api/quotes/client/respond`
  - `POST /api/quotes/client/respond/reject`

## Fields Frontend Should Use

On quote objects:

- `id`
- `quoteNumber`
- `workOrderId`
- `workOrderNumber`
- `quoteRequired`
- `quoteStatus`
- `quoteTermsConditions`
- `client`
- `lineItems`
- totals: `subtotal`, `tax`, `total`, `balance`

## Recommended UI Flow

1. User creates workorder and checks "Quote Required"
2. Backend auto-creates quote
3. Frontend reads quote from:
   - workorder response `data.quotes`, or
   - `GET /api/quotes?search=...`
4. Frontend opens quote details with `GET /api/quotes/{quoteId}`
5. User edits/sends quote using quote endpoints above

