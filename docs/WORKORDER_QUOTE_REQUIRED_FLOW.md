# Workorder → Quote/Invoice Required Flow

## Goal

When creating a workorder:

- if `quoteRequired` is `true`, backend auto-creates a `Quote` linked by `workOrderId`
- if `quoteRequired` is `false` (or omitted), no quote is created
- if `invoiceRequired` is `true`, backend auto-creates an `Invoice` linked by `workOrderId`
- if `invoiceRequired` is `false` (or omitted), no invoice is created

## Data model changes

`Quote` now has:

- `workOrderId` (`String?`) with FK to `WorkOrder.id`
- `quoteRequired` (`Boolean`, default `false`)

`Invoice` now has:

- `invoiceRequired` (`Boolean`, default `false`)

## Create workorder request

Endpoint: `POST /api/workorders`

Include:

```json
{
  "title": "AC Repair",
  "clientId": "client_id_here",
  "address": "123 Main St",
  "quoteRequired": true,
  "invoiceRequired": true,
  "quoteTermsConditions": "Custom quote terms",
  "lineItems": [
    {
      "name": "Inspection",
      "itemType": "SERVICE",
      "quantity": 1,
      "price": 100
    }
  ]
}
```

## What backend does when `quoteRequired=true`

1. Creates the workorder
2. Creates a quote with:
   - `workOrderId = createdWorkOrder.id`
   - `quoteRequired = true`
   - `title`, `address`, `clientId`, assignee copied from workorder payload
   - `quoteTermsConditions` from payload, otherwise settings default
3. Copies workorder line items into quote line items
4. Calculates quote financial fields (`subtotal`, `total`, `cost`, `balance`)

## What backend does when `invoiceRequired=true`

1. Creates the workorder
2. Creates an invoice with:
   - `workOrderId = createdWorkOrder.id`
   - `invoiceRequired = true`
   - `title`, `address`, `clientId`, assignee copied from workorder payload
   - `termsConditions` from invoice terms payload/default
3. Copies workorder line items into invoice line items
4. Calculates invoice financial fields (`subtotal`, `total`, `balance`)

## Testing checklist

1. Create a workorder with `quoteRequired=true`
2. Query quotes:
   - `GET /api/quotes`
   - verify returned quote has `workOrderId` set and `quoteRequired=true`
3. Create a second workorder with `quoteRequired=false`
4. Query quotes again and confirm no new quote was created for that workorder
5. Query invoices:
   - `GET /api/invoices`
   - verify returned invoice has `workOrderId` set and `invoiceRequired=true`

