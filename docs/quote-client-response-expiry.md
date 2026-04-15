# Quote Client Response Expiry (7 days)

This document explains how the quote approve/reject links behave when the client responds after 7 days.

## Behavior

- Quote action links expire after the quote expiry window (default 7 days).
- When expired:
  - Approve button flow redirects with `quoteAction=expired-approve`.
  - Reject button flow redirects with `quoteAction=expired-reject`.
- Reject API (`POST /api/quotes/client/respond/reject`) returns `410 Gone` with an expiry message.

## Redirect outcomes for frontend

- Approve success:
  - `.../accept-quote/{quoteId}?quoteAction=approved&clientId={clientId}`
- Approve expired:
  - `.../accept-quote/{quoteId}?quoteAction=expired-approve`
- Reject open form:
  - `.../reject-quote/{quoteId}?quoteAction=reject&token={token}`
- Reject expired:
  - `.../reject-quote/{quoteId}?quoteAction=expired-reject`
- Already responded / terminal state:
  - `.../reject-quote/{quoteId}?quoteAction=already-responded`

## Suggested frontend messages

- For `expired-approve`:
  - `You can not approve-quote because the 7-day response window has passed.`
- For `expired-reject`:
  - `You can not reject-quote because the 7-day response window has passed.`

## How to test

1. Create a quote and send quote email (`POST /api/quotes/{quoteId}/send-email`).
2. Open one email link and verify normal behavior before expiry.
3. Force expiry for testing:
   - Set `quoteExpiresAt` to a past time in DB (Prisma Studio), or
   - Wait until expiration naturally.
4. Test approve link:
   - `GET /api/quotes/client/respond?action=approve&token={token}&quoteId={quoteId}`
   - Verify redirect contains `quoteAction=expired-approve`.
5. Test reject link:
   - `GET /api/quotes/client/respond?action=reject&token={token}&quoteId={quoteId}`
   - Verify redirect contains `quoteAction=expired-reject`.
6. Test reject API directly:
   - `POST /api/quotes/client/respond/reject`
   - Body:
     ```json
     {
       "quoteId": "YOUR_QUOTE_ID",
       "reason": "Too expensive",
       "token": "YOUR_QUOTE_TOKEN"
     }
     ```
   - Expected: `410 Gone` and expiry message.

## Curl examples

Approve link test:

```bash
curl -i "http://localhost:8000/api/quotes/client/respond?action=approve&token=YOUR_TOKEN&quoteId=YOUR_QUOTE_ID"
```

Reject link test:

```bash
curl -i "http://localhost:8000/api/quotes/client/respond?action=reject&token=YOUR_TOKEN&quoteId=YOUR_QUOTE_ID"
```

Reject API expired test:

```bash
curl -i -X POST "http://localhost:8000/api/quotes/client/respond/reject" \
  -H "Content-Type: application/json" \
  -d "{\"quoteId\":\"YOUR_QUOTE_ID\",\"reason\":\"Too expensive\",\"token\":\"YOUR_TOKEN\"}"
```
