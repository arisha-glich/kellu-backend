# Frontend API Integration (Workorders, Quotes, Invoices, Settings)

This is the single entry doc for frontend integration.

## Base

- Base URL: `http://localhost:8000`
- Auth: all business endpoints require authenticated session/token

## Core Business Flow

1. Update company defaults in settings (`quoteTermsConditions`, `invoiceTermsConditions`)
2. Create workorder
3. Optionally auto-create quote/invoice from workorder flags:
   - `quoteRequired: true`
   - `invoiceRequired: true`
4. Manage quote/invoice with their own modules

## Workorders

Primary endpoints:

- `POST /api/workorders` (create)
- `GET /api/workorders/{workOrderId}` (detail)
- `PATCH /api/workorders/{workOrderId}` (update)
- `DELETE /api/workorders/{workOrderId}` (delete)

Important request flags on create:

- `quoteRequired` (boolean)
- `invoiceRequired` (boolean)
- `quoteTermsConditions`
- `invoiceTermsConditions`
- `applyQuoteTermsToFuture`
- `applyInvoiceTermsToFuture`

Important response fields:

- `quoteTermsConditions`, `invoiceTermsConditions`
- `quotes[]` (linked quote summaries)
- `invoices[]` (linked invoice summaries)

## Quotes

Current flow is workorder-driven.

- Quote is auto-created when workorder is created with `quoteRequired: true`.
- Quote is linked with `workOrderId`.

Endpoints:

- `GET /api/quotes`
- `GET /api/quotes/overview`
- `GET /api/quotes/{quoteId}`
- `PATCH /api/quotes/{quoteId}`
- `PATCH /api/quotes/{quoteId}/status`
- `POST /api/quotes/{quoteId}/send`
- `POST /api/quotes/{quoteId}/send-email`
- `GET /api/quotes/{quoteId}/email-compose`
- `POST /api/quotes/{quoteId}/approve`
- `POST /api/quotes/{quoteId}/reject`

## Invoices

Two creation paths:

1. Direct: `POST /api/invoices`
2. Workorder-driven: set `invoiceRequired: true` in `POST /api/workorders`

Endpoints:

- `GET /api/invoices`
- `GET /api/invoices/overview`
- `GET /api/invoices/{invoiceId}`
- `POST /api/invoices`
- `PATCH /api/invoices/{invoiceId}/status`
- `POST /api/invoices/{invoiceId}/send`
- `GET /api/invoices/{invoiceId}/email-compose`
- `POST /api/invoices/{invoiceId}/send-email`

## Settings

Endpoint:

- `GET /api/settings`
- `PATCH /api/settings`

For terms fields, backend accepts these request shapes:

- top-level:
  - `quoteTermsConditions`
  - `invoiceTermsConditions`
- nested:
  - `settings.quoteTermsConditions`
  - `settings.invoiceTermsConditions`
- nested in data:
  - `data.settings.quoteTermsConditions`
  - `data.settings.invoiceTermsConditions`

When settings terms are updated, existing workorders are synchronized with latest terms.

## Deletion Behavior

Deleting a workorder also deletes linked quotes and invoices (cascade by `workOrderId` FK).

## Module Docs

- `docs/WORKORDER_QUOTE_REQUIRED_FLOW.md`
- `docs/WORKORDER_QUOTE_UNLINK_TESTING.md`
- `docs/QUOTES_FRONTEND_INTEGRATION.md`
- `docs/INVOICES_FRONTEND_INTEGRATION.md`

