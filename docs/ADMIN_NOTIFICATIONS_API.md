# Admin portal notifications API – documentation & testing

**Base path:** `/api/admin/notifications`  
**Router:** `src/routes/admin/notifications`  
**Services:** `platform-notification-rule.service.ts`, `platform-settings.service.ts`

Use your API base URL, for example: `http://localhost:8000`.

---

## Prerequisites

1. **Run migrations** so `PlatformNotificationRule` and `PlatformSettings.clientEmailCopyTo` exist:

   ```bash
   bunx prisma migrate deploy
   bunx prisma generate
   ```

2. **Authentication:** Endpoints use the same session as the rest of the app (Better Auth). You must be logged in as an **admin portal** user (primary super admin or admin-portal team member with active membership).

3. **Permissions:**  
   - **GET** endpoints require `settings:read` (or `isAdmin`).  
   - **POST / PATCH / DELETE** require `settings:update` (or `isAdmin`).

4. **How to send the session in tests**
   - **Browser:** Log in on the admin app; DevTools → Network → copy `Cookie` header from any authenticated request.
   - **Postman / Insomnia:** Add header `Cookie: <paste full cookie string>` (often includes `better-auth.session_token=...` or your project’s session cookie name).
   - **curl:** `-H "Cookie: your_session_cookie_here"`

If you get **401**, the session is missing. **403** with “admin portal only” means the user is not an admin portal account. **403** with “Forbidden” means missing `settings:read` / `settings:update`.

---

## Endpoints overview

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/notifications/rules` | List all rules + counts |
| POST | `/api/admin/notifications/rules` | Create a custom rule |
| GET | `/api/admin/notifications/rules/{ruleId}` | Get one rule by `id` |
| PATCH | `/api/admin/notifications/rules/{ruleId}` | Update rule (e.g. toggle `isActive`) |
| DELETE | `/api/admin/notifications/rules/{ruleId}` | Delete a rule |
| GET | `/api/admin/notifications/email-forwarding` | Read platform BCC copy settings |
| PATCH | `/api/admin/notifications/email-forwarding` | Update platform BCC copy settings |

---

## 1. List notification rules

**Request**

```http
GET /api/admin/notifications/rules
```

**Example (curl)**

```bash
curl -sS "http://localhost:8000/api/admin/notifications/rules" \
  -H "Cookie: YOUR_SESSION_COOKIE"
```

**Typical success response shape**

```json
{
  "message": "Notification rules retrieved successfully",
  "success": true,
  "data": {
    "data": [
      {
        "id": "clxxxxxxxxxxxxxxxxxxxxxxxx",
        "eventKey": "JOB_COMPLETED",
        "eventName": "Job Completed",
        "triggerDescription": "When job status changes to completed",
        "isActive": true,
        "sortOrder": 10,
        "createdAt": "2026-04-02T12:00:00.000Z",
        "updatedAt": "2026-04-02T12:00:00.000Z"
      }
    ],
    "total": 4,
    "activeCount": 3,
    "inactiveCount": 1
  }
}
```

**What to verify**

- `data.data` is an array; built-in keys are `JOB_COMPLETED`, `USER_INVITATION`, `QUOTE_REJECTED_BY_CLIENT`, plus any custom rules you created.
- Deprecated keys (`NEW_BUSINESS_REGISTRATION`, `PAYMENT_RECEIVED`, `FAILED_LOGIN_ALERT`) are **removed from the database** whenever rules are listed or ensured.
- Copy a rule’s `id` for **get / patch / delete** tests below.

---

## 2. Get one rule

**Request**

```http
GET /api/admin/notifications/rules/{ruleId}
```

Replace `{ruleId}` with a real `id` from the list response (not `eventKey`).

**Example**

```bash
curl -sS "http://localhost:8000/api/admin/notifications/rules/clxxxxxxxxxxxxxxxxxxxxxxxx" \
  -H "Cookie: YOUR_SESSION_COOKIE"
```

**Success:** `success: true`, `data` is a single rule object. **404** if `ruleId` is wrong.

---

## 3. Update rule (toggle active, edit labels)

**Request**

```http
PATCH /api/admin/notifications/rules/{ruleId}
Content-Type: application/json
```

**Body (at least one field required)**

| Field | Type | Notes |
|-------|------|--------|
| `eventName` | string | Optional |
| `triggerDescription` | string | Optional |
| `isActive` | boolean | Use for Figma-style toggle |
| `sortOrder` | number | Optional |

**Example – turn off “Quote Rejected” automation**

First find the rule where `eventKey` is `QUOTE_REJECTED_BY_CLIENT`, then:

```bash
curl -sS -X PATCH "http://localhost:8000/api/admin/notifications/rules/RULE_ID_HERE" \
  -H "Content-Type: application/json" \
  -H "Cookie: YOUR_SESSION_COOKIE" \
  -d "{\"isActive\": false}"
```

**Example – toggle back on**

```json
{ "isActive": true }
```

**Example – rename display strings**

```json
{
  "eventName": "Quote declined by customer",
  "triggerDescription": "Client rejects a quote from the email link (includes reason)"
}
```

---

## 4. Create custom rule

**Request**

```http
POST /api/admin/notifications/rules
Content-Type: application/json
```

**Body**

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| `eventKey` | string | Yes | Letters, numbers, underscores only; stored uppercased |
| `eventName` | string | Yes | Display name |
| `triggerDescription` | string | Yes | Display trigger text |
| `isActive` | boolean | No | Default `true` |
| `sortOrder` | number | No | Default `100` |

**Example test payload**

```json
{
  "eventKey": "CUSTOM_DEMO_ALERT",
  "eventName": "Demo alert",
  "triggerDescription": "Fires when demo flag is set (example)",
  "isActive": true,
  "sortOrder": 200
}
```

**curl**

```bash
curl -sS -X POST "http://localhost:8000/api/admin/notifications/rules" \
  -H "Content-Type: application/json" \
  -H "Cookie: YOUR_SESSION_COOKIE" \
  -d "{\"eventKey\":\"CUSTOM_DEMO_ALERT\",\"eventName\":\"Demo alert\",\"triggerDescription\":\"Fires when demo flag is set (example)\",\"isActive\":true,\"sortOrder\":200}"
```

**Errors**

- **400** if `eventKey` already exists (duplicate).

---

## 5. Delete rule

**Request**

```http
DELETE /api/admin/notifications/rules/{ruleId}
```

**Example**

```bash
curl -sS -X DELETE "http://localhost:8000/api/admin/notifications/rules/RULE_ID_OF_CUSTOM_RULE" \
  -H "Cookie: YOUR_SESSION_COOKIE"
```

**Note:** Deleting a built-in rule removes that row; the next **GET list** can **re-upsert** defaults for missing `eventKey`s (built-ins come back with default labels/active flags).

---

## 6. Get email forwarding (platform BCC)

**Request**

```http
GET /api/admin/notifications/email-forwarding
```

**Example**

```bash
curl -sS "http://localhost:8000/api/admin/notifications/email-forwarding" \
  -H "Cookie: YOUR_SESSION_COOKIE"
```

**Typical response**

```json
{
  "message": "Email forwarding settings retrieved successfully",
  "success": true,
  "data": {
    "clientEmailCopyEnabled": false,
    "clientEmailCopyTo": null
  }
}
```

---

## 7. Patch email forwarding

**Request**

```http
PATCH /api/admin/notifications/email-forwarding
Content-Type: application/json
```

**Body (at least one field required)**

| Field | Type | Notes |
|-------|------|--------|
| `clientEmailCopyEnabled` | boolean | When `true`, BCC is applied to business → customer emails (e.g. quote to client) if `clientEmailCopyTo` is set |
| `clientEmailCopyTo` | string / `null` / `""` | Valid email or empty/`null` to clear |

**Example – enable with address**

```json
{
  "clientEmailCopyEnabled": true,
  "clientEmailCopyTo": "compliance@yourcompany.com"
}
```

**Example – disable**

```json
{
  "clientEmailCopyEnabled": false
}
```

**Example – clear address**

```json
{
  "clientEmailCopyTo": null
}
```

**Validation**

- Enabling copy (`clientEmailCopyEnabled: true`) without sending `clientEmailCopyTo` requires an **already saved** non-empty `clientEmailCopyTo` in the database; otherwise **400** with a message that the address is required.

**curl (enable + BCC)**

```bash
curl -sS -X PATCH "http://localhost:8000/api/admin/notifications/email-forwarding" \
  -H "Content-Type: application/json" \
  -H "Cookie: YOUR_SESSION_COOKIE" \
  -d "{\"clientEmailCopyEnabled\":true,\"clientEmailCopyTo\":\"compliance@yourcompany.com\"}"
```

---

## Suggested test order (Postman collection flow)

1. **GET** `/api/admin/notifications/rules` → confirm `200`, note `total` / `activeCount` / `inactiveCount`.
2. **GET** `/api/admin/notifications/rules/{ruleId}` → use first rule’s `id` → `200`.
3. **PATCH** same rule `{ "isActive": false }` → `200`, then **GET** list again → `activeCount` decreases.
4. **PATCH** `{ "isActive": true }` → restore.
5. **POST** create `CUSTOM_DEMO_ALERT` → `201`, note new `id`.
6. **DELETE** that custom rule by `id` → `200`.
7. **GET** `/api/admin/notifications/email-forwarding` → `200`.
8. **PATCH** set `clientEmailCopyTo` only (if you want to stage address before enabling).
9. **PATCH** `clientEmailCopyEnabled: true` with valid `clientEmailCopyTo` → then send a **quote email** to a client and confirm BCC in your mail provider (Resend dashboard / inbox).

---

## Built-in `eventKey` values (for app logic)

These are created automatically when you list rules:

| `eventKey` | Typical use |
|------------|-------------|
| `JOB_COMPLETED` | Job completed |
| `USER_INVITATION` | User invited |
| `QUOTE_REJECTED_BY_CLIENT` | Client rejects quote (business email + reason) |

Application code should call `isPlatformNotificationRuleActive('<eventKey>')` before sending for each event. **Quote rejection** is already gated on `QUOTE_REJECTED_BY_CLIENT`.

The following keys are **not** used anymore; existing rows are deleted on sync: `NEW_BUSINESS_REGISTRATION`, `PAYMENT_RECEIVED`, `FAILED_LOGIN_ALERT`.

---

## Quick reference – test JSON snippets

**Toggle rule off**

```json
{ "isActive": false }
```

**Create minimal custom rule**

```json
{
  "eventKey": "TEST_RULE_1",
  "eventName": "Test rule",
  "triggerDescription": "Manual test only"
}
```

**Email forwarding – full enable**

```json
{
  "clientEmailCopyEnabled": true,
  "clientEmailCopyTo": "archive@example.com"
}
```
