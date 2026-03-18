# API & Project Flow Documentation

This document describes every route, handler, and service in the project, how to test the API, and the overall request flow.

---

## 1. Project flow (request lifecycle)

```
HTTP Request
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│  CORS middleware (*)                                              │
│  - Handles preflight OPTIONS, allows origin (e.g. localhost:3000) │
└─────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│  Session middleware (*)                                          │
│  - Better Auth: getSession(headers)                               │
│  - Sets c.set('user', session.user) and c.set('session', ...)     │
│  - Unauthenticated requests: user = null, then next()             │
└─────────────────────────────────────────────────────────────────┘
    │
    ├── /api/auth/*  ──► auth.handler (Better Auth: sign-in, sign-up, etc.)
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│  registerRoutes(app)                                              │
│  - Mounts: /api/businesses, /api/clients, /api/workorders,        │
│    /api/invoices, /api/quotes, /api/price-list, /api/expenses,   │
│    /api/roles, /api/team, /test                                  │
└─────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│  Route handler (e.g. QUOTE_HANDLER.list)                         │
│  - Validates: user present (401 if not)                           │
│  - Resolves businessId: getBusinessIdByUserId(user.id)           │
│  - Permission: hasPermission(userId, businessId, resource, action)│
│  - Calls service (e.g. listQuotes(businessId, filters))           │
│  - Returns c.json({ message, success, data })                    │
└─────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│  Service (e.g. quote.service.ts)                                  │
│  - ensureBusinessExists(businessId)                              │
│  - Prisma queries (Quote, Client, LineItem, etc.)                 │
│  - Throws: QuoteNotFoundError, ClientNotFoundError, etc.         │
└─────────────────────────────────────────────────────────────────┘
    │
    ▼
  Response (JSON)
```

**Key points:**

- **Auth:** Session comes from Better Auth; `c.get('user')` is set by the session middleware. Use it in handlers to require login and resolve `businessId`.
- **Business context:** `getBusinessIdByUserId(user.id)` returns the business for owners (via `Business.ownerId`) or for team members (via active `Member`).
- **Permissions:** `hasPermission(userId, businessId, resource, action)` — owner always allowed; otherwise checks role permissions (e.g. `quotes: read`, `workorders: create`).
- **Errors:** Handlers catch service errors (e.g. `QuoteNotFoundError`) and return 404/400/403/500 with a JSON body.

---

## 2. Routes overview (base paths)

| Base path           | Router source              | Purpose |
|---------------------|----------------------------|---------|
| `/test`             | `~/routes/test`            | Test route (POST /test) |
| `/api/businesses`   | `~/routes/business`        | Business CRUD, clients/jobs, status, email, reminder |
| `/api/clients`      | `~/routes/clients`         | Client CRUD, list, stats, lead sources |
| `/api/workorders`   | `~/routes/workorders`      | Work orders: list, overview, CRUD, payments, line items |
| `/api/invoices`     | `~/routes/invoices`        | Invoices: list, overview, get, create, send |
| `/api/quotes`       | `~/routes/quotes`          | Quotes: list, overview, get, create, send, approve, reject |
| `/api/price-list`   | `~/routes/pricelistitems`  | Price list items CRUD, bulk import |
| `/api/expenses`     | `~/routes/expenses`        | Expenses: list, get, create, update, delete |
| `/api/roles`        | `~/routes/roles`           | Roles CRUD, permission matrix, actions list |
| `/api/team`         | `~/routes/team`            | Team members: list, add, update, remove |
| `/api/settings`     | `~/routes/settings`        | Current business profile + company settings (GET/PATCH) |

**Me (current user):** The app may expose a “me” or “context” route (e.g. under `/api/me` or similar) that returns current user context (businessId, role, permissions). The me router lives in `src/routes/me` but is not mounted in `src/app.ts`; add `.route('/api/me', meRouter)` to enable `GET /api/me/context`.

---

## 3. Routes folder – file roles and endpoints

Each route module follows this pattern:

- **`*.routes.ts`** – OpenAPI route definitions (path, method, query/body/params schemas, response schemas).
- **`*.handler.ts`** – Request handlers: auth check, `getBusinessIdByUserId`, `hasPermission`, call service, return JSON.
- **`index.ts`** – Builds the router with `createRouter()`, registers each route with its handler via `router.openapi(ROUTES[key], HANDLER[key])`.

---

### 3.1 `routes/test`

| File             | Role |
|------------------|------|
| `test.routes.ts` | Defines `POST /test` with body schema (e.g. UserSchema). |
| `test.handler.ts`| Handles POST /test. |
| `index.ts`       | Mounts the test route. |

**Endpoint:** `POST /test` – test payload (see OpenAPI/Scalar for body).

---

### 3.2 `routes/business`

| File                  | Role |
|-----------------------|------|
| `business.routes.ts`  | All business routes and request/response schemas. |
| `business.handler.ts` | Handlers for each route; uses `business.service`. |
| `index.ts`            | Registers business routes. |

**Endpoints (under `/api/businesses`):**

- `GET /` – List businesses (admin/super).
- `GET /:id` – Get business by ID.
- `POST /` – Create business.
- `PATCH /:id` – Update business.
- `PATCH /:id/commission` – Update business commission.
- `GET /:id/clients` – Get clients for business.
- `GET /:id/jobs` – Get jobs (work orders) for business.
- `GET /:id/clients-with-jobs` – Clients with their jobs.
- `PATCH /:id/status` – Toggle business status.
- `POST /:id/suspend` – Suspend business.
- `POST /:id/unsuspend` – Unsuspend business.
- `POST /:id/send-email` – Send email to business.
- `POST /:id/reminder` – Send reminder.

---

### 3.3 `routes/clients`

| File             | Role |
|------------------|------|
| `client.routes.ts`  | List, get, create, update, delete, statistics, lead sources. |
| `client.handler.ts`| Permission: `clients` create/read/update/delete; uses `client.service`. |
| `index.ts`         | Registers client routes. |

**Endpoints (under `/api/clients`):**

- `GET /` – List clients (query: search, status, sortBy, order, page, limit).
- `GET /statistics` – Client statistics (e.g. new last 30 days, YTD).
- `GET /lead-sources` – Lead sources list.
- `GET /:clientId` – Get client by ID.
- `POST /` – Create client.
- `PATCH /:clientId` – Update client.
- `DELETE /:clientId` – Delete (or archive) client.

---

### 3.4 `routes/workorders`

| File                  | Role |
|-----------------------|------|
| `workorder.routes.ts` | List, overview, get, create, update, delete, payments, line items. |
| `workorder.handler.ts`| Permission: `workorders` read/create/update/delete; uses `workorder.service`. |
| `index.ts`            | Registers workorder routes. |

**Endpoints (under `/api/workorders`):**

- `GET /` – List work orders (search, quoteStatus, jobStatus, invoiceStatus, sortBy, order, page, limit).
- `GET /overview` – Overview counts by quote/job/invoice status.
- `GET /:workOrderId` – Get work order by ID.
- `POST /` – Create work order (with optional line items).
- `PATCH /:workOrderId` – Update work order.
- `DELETE /:workOrderId` – Delete work order.
- `POST /:workOrderId/register-payment` – Register payment.
- Line items: list/add/update/delete (paths as defined in workorder.routes).

---

### 3.5 `routes/invoices`

| File                | Role |
|---------------------|------|
| `invoice.routes.ts` | List, overview, get by ID, create, send. |
| `invoice.handler.ts`| Permission: `invoices` read/create/update; uses `invoice.service`. |
| `index.ts`          | Registers invoice routes. |

**Endpoints (under `/api/invoices`):**

- `GET /` – List invoices (search, status, sortBy, order, page, limit).
- `GET /overview` – Overview by status, issued last 30 days, average.
- `GET /:invoiceId` – Get invoice by ID (includes client, line items, etc.).
- `POST /` – Create invoice (title, clientId, address, optional workOrderId, lineItems).
- `POST /:invoiceId/send` – Send invoice.

---

### 3.6 `routes/quotes`

| File               | Role |
|--------------------|------|
| `quote.routes.ts`  | List, overview, get, create, send, approve, reject. |
| `quote.handler.ts` | Permission: `quotes` read/create/update; uses `quote.service`. |
| `index.ts`         | Registers quote routes. |

**Endpoints (under `/api/quotes`):**

- `GET /` – List quotes (search, status, sortBy, order, page, limit).
- `GET /overview` – Overview by status, sent last 30 days, average.
- `GET /:quoteId` – Get quote by ID.
- `POST /` – Create quote (title, clientId, address, assignedToId?, workOrderId?, termsConditions?, lineItems?).
- `POST /:quoteId/send` – Send quote.
- `POST /:quoteId/approve` – Approve quote.
- `POST /:quoteId/reject` – Reject quote.

---

### 3.7 `routes/pricelistitems`

| File                   | Role |
|------------------------|------|
| `price-list.routes.ts` | List, get, create, update, delete, bulk import. |
| `price-list.handler.ts`| Uses `price-list.service`; permission as defined in routes. |
| `index.ts`             | Registers price list routes. |

**Endpoints (under `/api/price-list`):**

- `GET /` – List price list items (search, itemType, sortBy, order, page, limit).
- `GET /:id` – Get item by ID.
- `POST /` – Create item (itemType, name, description, cost, markupPercent, price).
- `PATCH /:id` – Update item.
- `DELETE /:id` – Delete item.
- `POST /import` – Bulk import items.

---

### 3.8 `routes/expenses`

| File                 | Role |
|----------------------|------|
| `expense.routes.ts`  | List, get, create, update, delete. |
| `expense.handler.ts` | Permission: `expenses`; uses `expense.service`. |
| `index.ts`           | Registers expense routes. |

**Endpoints (under `/api/expenses`):**

- `GET /` – List expenses (workOrderId, dateFrom, dateTo, invoiceNumber, clientId, sortBy, order, page, limit).
- `GET /:expenseId` – Get expense by ID.
- `POST /` – Create expense.
- `PATCH /:expenseId` – Update expense.
- `DELETE /:expenseId` – Delete expense.

---

### 3.9 `routes/roles`

| File              | Role |
|-------------------|------|
| `role.routes.ts`  | List roles, permission matrix, actions list, get, create, update, delete. |
| `role.handler.ts` | Uses `role.service` and business resolution. |
| `index.ts`        | Registers role routes. |

**Endpoints (under `/api/roles`):**

- `GET /` – List all roles for the business.
- `GET /permissions/matrix` – All resources and actions (for permission builder UI).
- `GET /permissions/actions` – All unique actions only.
- `GET /:roleId` – Get role by ID.
- `POST /` – Create role (name, displayName?, description?, permissions[]).
- `PATCH /:roleId` – Update role.
- `DELETE /:roleId` – Delete role.

---

### 3.10 `routes/team`

| File             | Role |
|------------------|------|
| `team.routes.ts` | List members, add, update, remove. |
| `team.handler.ts`| Uses `team.service`; add member sends invitation email. |
| `index.ts`       | Registers team routes. |

**Endpoints (under `/api/team`):**

- `GET /` – List team members.
- `GET /:memberId` – Get member by ID.
- `POST /` – Add team member (name, email, phoneNumber, rut?, roleId, pictureUrl?, includeInNotificationsWhenAssigned?, password, emailDescription?).
- `PATCH /:memberId` – Update member.
- `DELETE /:memberId` – Remove member.

---

### 3.11 `routes/settings`

| File                 | Role |
|----------------------|------|
| `settings.routes.ts` | GET `/`, PATCH `/` – current business profile + company settings (§13.1). |
| `settings.handler.ts`| getBusinessIdByUserId, hasPermission(settings, read/update), settings.service. |
| `index.ts`           | Registers settings routes. |

**Endpoints (under `/api/settings`):**

- `GET /` – Get current business settings (personalProfile, company, settings: reply list, due dates, bank, terms, arrival window, whatsapp, tax).
- `PATCH /` – Update any subset of profile and company settings.

---

### 3.12 `routes/me`

| File           | Role |
|----------------|------|
| `me.routes.ts` | Single route: get current user context. |
| `me.handler.ts`| Calls `getMeContext(user.id)` from `~/services/me.service`. |
| `index.ts`     | Registers me route. |

**Endpoint:** `GET /context` (when mounted at `/api/me` → `GET /api/me/context`) – returns businessId, isOwner, memberId, role, permissions for the current user.

**Note:** This router is not mounted in `app.ts` by default. `getMeContext` is imported from `~/services/me.service` – ensure that service exists (e.g. using `getBusinessIdByUserId`, member and role lookup).

---

## 4. Services folder – responsibilities

| Service file            | Purpose |
|-------------------------|--------|
| **business.service.ts** | Business CRUD, getBusinessIdByUserId, getBusinessIdByOwnerId, clients/jobs for business, status/suspend/unsuspend, send email/reminder. Errors: BusinessNotFoundError, EmailAlreadyUsedError. |
| **client.service.ts**  | Client CRUD, list with filters, statistics, lead sources. Uses BusinessNotFoundError, ClientNotFoundError. Sends client profile update email when needed. |
| **workorder.service.ts** | Work order list/overview/get/create/update/delete, financials, job status, payments, line items. Errors: WorkOrderNotFoundError, ClientNotFoundError. |
| **invoice.service.ts** | Invoice list/overview/get/create/send using Invoice model and LineItem.invoiceId. Next invoice number, recalc financials, effective status (e.g. OVERDUE). Errors: InvoiceNotFoundError, ClientNotFoundError. |
| **quote.service.ts**   | Quote list/overview/get/create/send/approve/reject using Quote model and LineItem.quoteId. Effective status EXPIRED. Errors: QuoteNotFoundError, ClientNotFoundError. |
| **price-list.service.ts** | Price list items CRUD, list with filters, bulk import. Errors: PriceListItemNotFoundError, BusinessNotFoundError. |
| **expense.service.ts** | Expenses list/get/create/update/delete; filters by work order, date range, invoice number, client. Errors: ExpenseNotFoundError, WorkOrderNotFoundError, BusinessNotFoundError. |
| **role.service.ts**    | Roles list/get/create/update/delete; permission matrix and actions list; validate permissions against statement; seed system roles (Admin, Technician). Errors: RoleNotFoundError, RoleInUseError, InvalidPermissionError. |
| **team.service.ts**    | Members list/get/add/update/remove; invite email on add. Errors: BusinessNotFoundError, MemberNotFoundError, RoleNotFoundError, EmailAlreadyUsedError, InvalidOperationError. |
| **permission.service.ts** | hasPermission(userId, businessId, resource, action): owner always true; else checks member role permissions. |
| **email.service.ts**   | Email sending (e.g. Resend). |
| **email-helpers.ts**   | Business invitation, team member invitation, client profile update, etc. |
| **me.service**         | Referenced by routes/me for getMeContext(userId). Returns current user context (businessId, isOwner, memberId, role, permissions). Implement in `src/services/me.service.ts` if missing. |

---

## 5. How to test the API

### 5.1 Interactive docs (Scalar)

- Start the app: `bun run dev` (or `npm run dev`).
- Open: **http://localhost:8000/reference** (or the port in your `.env`, e.g. `PORT_NO`).
- Use Scalar to browse routes, see request/response schemas, and send test requests.
- Auth: if the app uses session cookies, use the same origin or configure Scalar to send credentials; if it uses Bearer tokens, set the header in Scalar.

### 5.2 OpenAPI JSON

- **http://localhost:8000/doc** – OpenAPI 3.0 spec (if configured in `configureOpenAPI`). Use this in Postman/Insomnia (import URL) or for codegen.

### 5.3 cURL examples

Assume base URL `http://localhost:8000` and that auth uses a session cookie or Bearer token.

**Login (Better Auth – adjust path/body to your auth setup):**

```bash
curl -X POST http://localhost:8000/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@example.com","password":"yourpassword"}'
```

**List quotes (with cookie or token):**

```bash
curl -X GET "http://localhost:8000/api/quotes?page=1&limit=10" \
  -H "Cookie: better-auth.session_token=YOUR_SESSION_COOKIE"
```

**Create quote:**

```bash
curl -X POST http://localhost:8000/api/quotes \
  -H "Content-Type: application/json" \
  -H "Cookie: better-auth.session_token=YOUR_SESSION_COOKIE" \
  -d '{"title":"Quote 1","clientId":"CLIENT_ID","address":"123 Main St","lineItems":[{"name":"Service","quantity":1,"price":100}]}'
```

**Get roles permission matrix:**

```bash
curl -X GET http://localhost:8000/api/roles/permissions/matrix \
  -H "Cookie: better-auth.session_token=YOUR_SESSION_COOKIE"
```

Replace the cookie with your actual session cookie after signing in (or use Bearer token if the app supports it).

### 5.4 Environment

- Copy `.env.example` to `.env` and set:
  - Database URL (Prisma).
  - Port (`PORT_NO` or similar).
  - Better Auth secret and any auth-related vars.
  - Email (Resend) and other service keys as needed.
- Run migrations: `bun run db:migrate` (or `npx prisma migrate dev`).
- Seed data if you have a seed script (e.g. businesses, users, roles) so you can log in and call protected endpoints.

### 5.5 Permission testing

- Create a business and owner user; create a role with limited permissions (e.g. `quotes: read` only).
- Add a team member with that role; sign in as that member.
- Call `GET /api/quotes` – should succeed.
- Call `POST /api/quotes` – should return 403 if the role has no `quotes: create`.

---

## 6. Quick reference – route → service

| Route module   | Service(s) used        |
|----------------|------------------------|
| business       | business.service       |
| clients        | client.service         |
| workorders     | workorder.service      |
| invoices       | invoice.service        |
| quotes         | quote.service          |
| pricelistitems | price-list.service     |
| expenses       | expense.service        |
| roles          | role.service           |
| team           | team.service           |
| me             | me.service (getMeContext) |

All protected handlers use:

- `getBusinessIdByUserId(user.id)` (from business.service)
- `hasPermission(userId, businessId, resource, action)` (from permission.service)

where `resource`/`action` come from `src/lib/permission.ts` (e.g. `workorders`, `quotes`, `invoices`, `clients`, `roles`, `expenses`, etc.).
