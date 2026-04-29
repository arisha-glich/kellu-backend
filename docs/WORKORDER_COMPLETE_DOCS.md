# Workorder Complete Docs

This document explains how workorders are created and calculated in this backend, with formulas and real examples.

## Base Endpoint

- Resource root: `POST /api/workorders`
- Read detail: `GET /api/workorders/{workOrderId}`
- Update: `PATCH /api/workorders/{workOrderId}`
- Register payment: `POST /api/workorders/{workOrderId}/payments`

## Create Workorder Payload (Key Fields)

- `title`, `clientId`, `address`: required
- `lineItems[]`: each row uses
  - `quantity`
  - `price` (sell price)
  - `cost` (internal cost)
- `discount`: numeric value
- `discountType`: `PERCENTAGE` or `AMOUNT`
- `taxPercent`: tax percentage
- `payments`: optional initial payments
- `expenses`: optional initial expenses
- `assignedToIds`: supports multiple team members

## Financial Formula Used by Backend

Financials are computed in `recalculateFinancials()`:

1. `subtotal = sum(quantity * price for all lineItems)`
2. `discountAmount =`
   - `subtotal * (discount / 100)` when `discountType = PERCENTAGE`
   - `discount` when `discountType = AMOUNT`
3. `afterDiscount = subtotal - discountAmount`
4. `tax = afterDiscount * (taxPercent / 100)`
5. `total = afterDiscount + tax`
6. `amountPaid = sum(all payment amounts on this workorder)`
7. `balance = total - amountPaid`
8. `cost = sum(quantity * cost for all lineItems)`

## Why Your Tax Became 118.8 (Not 120)

Your payload:

- `subtotal = 1 * 1200 = 1200`
- `discount = 1`, `discountType = PERCENTAGE`
- So `discountAmount = 1200 * 1% = 12`
- `afterDiscount = 1200 - 12 = 1188`
- `taxPercent = 10`
- `tax = 1188 * 10% = 118.8`
- `total = 1188 + 118.8 = 1306.8`

So the API result is correct for the current formula: **tax is applied after discount**.

If you want tax from full subtotal (1200 * 10% = 120), you must either:

- set `discount = 0`, or
- change business rule to calculate tax before discount.

## Notes About Payments and Expenses on Create

- `payments` and `expenses` are accepted by schema and now forwarded by create handler.
- `payments` affect `amountPaid` and `balance`.
- `expenses` are stored under workorder expenses, but do not change `subtotal/tax/total`.

## Status Behavior

- `jobStatus` is derived from schedule + assignment:
  - no schedule => `UNSCHEDULED`
  - scheduled but no assignee => `UNASSIGNED`
  - scheduled + assignee => `SCHEDULED`
- `invoiceStatus` starts at `NOT_SENT` on create.
- Payment routes can move invoice status to `PAID` when `balance <= 0`.

## Example Quick Verification

Use this to verify math:

1. Create with one line item (qty 1, price 1200), discount 1%, tax 10%.
2. Expect:
   - `subtotal = 1200`
   - `discount = 1`
   - `tax = 118.8`
   - `total = 1306.8`
3. Add payment 1:
   - `amountPaid = 1`
   - `balance = 1305.8`

## Team Member Detail View

- Workorder detail for team members is a restricted view:
  - includes job details and `jobStatus`
  - hides quote/invoice statuses and pricing totals
  - no separate technician endpoint; this is role-based on existing endpoints

