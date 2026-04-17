# Invoices Frontend Integration Guide

This guide explains the invoice endpoints and the new workorder-driven invoice flow.

## Base URL and Auth

- Base URL: `http://localhost:8000`
- Invoice API base path: `/api/invoices`
- All endpoints require authenticated user session/token.

## Invoice Creation Options

### A) Direct invoice create

`POST /api/invoices`
```json
{
  "title": "Invoice for AC install",
  "clientId": "client_id",
  "address": "Lahore",
  "assignedToId": null,
  "workOrderId": null,
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

### B) Workorder-driven invoice create (new flow)

Create workorder with `invoiceRequired: true`:

`POST /api/workorders`
```json
{
  "title": "Install AC",
  "clientId": "client_id",
  "address": "Lahore",
  "invoiceRequired": true,
  "invoiceTermsConditions": null,
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

Backend auto-creates invoice linked by `workOrderId`.
Workorder detail response now includes `data.invoices`.

## Invoice Endpoints

- `GET /api/invoices`
  - List invoices
  - Query: `search`, `status`, `sortBy`, `order`, `page`, `limit`

- `GET /api/invoices/overview`
  - Status + amount overview

- `GET /api/invoices/{invoiceId}`
  - Invoice detail

- `POST /api/invoices`
  - Create invoice directly

- `PATCH /api/invoices/{invoiceId}/status`
  - Update status manually

- `POST /api/invoices/{invoiceId}/send`
  - Mark/send invoice

- `GET /api/invoices/{invoiceId}/email-compose`
  - Prefill email modal data

- `POST /api/invoices/{invoiceId}/send-email`
  - Send email with selected attachments

## Fields Frontend Should Use

On invoice objects:

- `id`
- `invoiceNumber`
- `status`
- `workOrderId`
- `invoiceRequired` (for workorder-created invoices)
- `termsConditions`
- `observations`
- totals: `subtotal`, `tax`, `total`, `amountPaid`, `balance`
- `client`, `lineItems`, `payments`

## Recommended UI Flow

1. In workorder form, toggle "Invoice Required"
2. On create success, read `data.invoices` from workorder response
3. Open invoice details with `GET /api/invoices/{invoiceId}`
4. Let user update status/send email via invoice endpoints

