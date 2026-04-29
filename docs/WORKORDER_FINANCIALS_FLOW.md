# Workorder Financials Flow (Tax / Subtotal / Total)

This doc explains how `tax`, `subtotal`, `discount`, `total`, `amountPaid`, and `balance` are calculated and when they can be recalculated.

## Endpoints involved

- `POST /api/workorders`: create a work order (creates line items, payments, expenses, etc.)
- `GET /api/workorders/{workOrderId}`: fetch a work order detail
- `PATCH /api/workorders/{workOrderId}`: update a work order (schedule/assignees/terms/etc.)
- `POST /api/workorders/{workOrderId}/payments`: register a payment
- `POST /api/workorders/{workOrderId}/line-items`: add line items

The actual math is implemented in:

- `src/services/workorder.service.ts`
  - `recalculateFinancials()`
  - `updateWorkOrder()`
  - `addLineItemsToWorkOrder()`
  - payment handlers

## Calculation rules

Inside `recalculateFinancials()`:

1. `subtotal` = sum over line items: `quantity * price`
2. `discountAmount`
   - if `discountType === 'PERCENTAGE'`: `subtotal * (discount / 100)`
   - else: `discountAmount = discount`
3. `afterDiscount = subtotal - discountAmount`
4. `tax = afterDiscount * (taxPercent / 100)`
5. `total = afterDiscount + tax`
6. `amountPaid` = sum of payments for this work order
7. `balance = total - amountPaid`

## Why tax was changing (root cause)

Previously, `PATCH /api/workorders/{workOrderId}` could overwrite the stored tax using the *current* business default when the request body did not include `taxPercent` (or included `taxPercent: null`).

That meant if your business tax setting changed (e.g. 19% → 0% or 20% → 36%), the work order could be recalculated later with a different tax percent even though the work order content hadn’t changed.

## Current correct behavior (after the fix)

### `POST /api/workorders`

- If `taxPercent` is included in the create request body, it is used.
- Otherwise it falls back to the business settings default tax percent.
- Then `recalculateFinancials()` is run once to persist `tax/total/balance`.

### `PATCH /api/workorders/{workOrderId}`

- If the patch request includes `taxPercent` as a **number** (e.g. `19`, `0`, `36`), that value is used and workorder financials are recalculated.
- If the patch request includes `taxPercent: null` or omits `taxPercent` entirely, the backend **does not reset tax**.
  - Instead, it derives the *effective* `taxPercent` from the work order’s already-stored financials (`tax`, `subtotal`, `discount`, `discountType`)
  - Then it recalculates using that derived percent, so tax stays stable.

### Adding line items / registering payments

`addLineItemsToWorkOrder()` and payment handlers recompute financials too.

- They derive the effective tax percent from the stored workorder financials
- So operations like “add another line item” or “register a payment” do not accidentally wipe/zero out tax.

## Quick way to verify in your UI

1. Create workorder with `taxPercent = 19`
2. Immediately `GET /api/workorders/{id}` → verify `tax` is non-zero
3. Run `PATCH /api/workorders/{id}` for schedule/assignees/etc **without** sending `taxPercent`
4. Wait a minute and `GET /api/workorders/{id}` again → `tax` should remain the same

