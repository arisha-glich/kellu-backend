# File & Image Storage Report (Kellu Backend)

## Executive summary

This backend **does not store file/image bytes in the database**.

What it *does* store in Postgres (via Prisma) is:

- **A URL string** that points to where the file actually lives (plus optional metadata like filename / mime-type).
- In a few places, single “asset URL” fields like `logoUrl`, `pdfUrl`, etc.

There is **no API endpoint in this repo that accepts multipart file upload and persists the bytes** (to S3, disk, or DB). The only multipart handling that exists is for **email sending** (attachments are read into memory and sent, not persisted).

---

## Where “files/images” appear in the data model (Prisma)

Prisma schema: `prisma/schema.prisma`.

### Work order attachments (multiple)

- **Model**: `WorkOrderAttachment`
- **Fields**: `url` (required), `filename?`, `type?`, timestamps, `workOrderId`

### Quote attachments (multiple)

- **Model**: `QuoteAttachment`
- **Fields**: `url` (required), `filename?`, `type?`, timestamps, `quoteId`

### Expense attachments (stored as a string field)

- **Model**: `Expense`
- **Field**: `attachmentUrl String?`

Important: the API layer treats `attachmentUrl` like `string[]` in some places, but the DB column is a **single string**, and services store it as a **comma-separated string**.

### Other URL fields used like “file references”

These are also **URLs** (not bytes), stored directly on models:

- `Business.logoUrl`
- `Invoice.pdfUrl`
- `Quote.lastQuotePdfUrl`
- `WorkOrder.lastJobReportPdfUrl`
- `WorkOrder.lastInvoicePdfUrl`

---

## How file/image “storage” works today (current behavior)

### 1) Work order attachments: DB stores URL + metadata (no upload)

Routes: `src/routes/workorders/workorder.routes.ts`

Endpoints:

- **List attachments**: `GET /workorders/{workOrderId}/attachments`
- **Add attachments**: `POST /workorders/{workOrderId}/attachments`
- **Delete attachment**: `DELETE /workorders/{workOrderId}/attachments/{attachmentId}`

Request body for “add attachments” is JSON (not multipart):

```json
{
  "attachments": [
    { "url": "https://.../file.png", "filename": "file.png", "type": "image/png" }
  ]
}
```

Implementation:

- Handler: `src/routes/workorders/workorder.handler.ts` → `addAttachments`
- Service: `src/services/workorder.service.ts` → `addWorkOrderAttachments(...)`
  - Validates the work order exists
  - Enforces **max 10 total attachments**
  - Inserts rows into `WorkOrderAttachment` with `url`, `filename`, `type`

**Key point**: the file bytes never touch the backend in this flow. The backend simply stores the URL you provide.

#### What must happen before calling this API

Because this backend only accepts a URL, the typical real-world flow is:

1. The **frontend uploads** the file somewhere (S3, Cloudinary, Firebase Storage, etc.) and gets a public/secure URL.
2. The frontend calls `POST /workorders/{id}/attachments` with that URL.
3. Backend stores URL in DB.

### 2) Expense attachments: DB stores a comma-separated URL string

Routes: `src/routes/expenses/expense.routes.ts`

- The API schemas accept `attachmentUrl` as `string[] | null`.

Service: `src/services/expense.service.ts`

- On create/update, it stores:
  - `attachmentUrl: input.attachmentUrl?.join(',') ?? null`

So, in the DB, `Expense.attachmentUrl` is effectively:

- `null` OR
- a single string like: `"https://a.png,https://b.jpg"`

**Key point**: this is still “store URLs in DB”, not bytes. Also, comma-joining URLs has edge cases (commas in URLs, searching, ordering, etc.).

### 3) Multipart uploads exist only for sending emails (not storage)

There are endpoints that accept `multipart/form-data`, but they do **not** save uploaded file bytes anywhere. They use the uploaded bytes as **email attachments** only.

Examples:

- `src/routes/quotes/quotes.routes.ts` → `POST /quotes/{quoteId}/send-email`
- `src/routes/invoices/invoice.routes.ts` → `POST /invoices/{invoiceId}/send-email`
- `src/routes/workorders/workorder.routes.ts` → `POST /workorders/{workOrderId}/send-job-follow-up-email`

Handlers:

- `src/routes/quotes/quotes.handler.ts`
- `src/routes/invoices/invoice.handler.ts`
- `src/routes/workorders/workorder.handler.ts`

Behavior:

1. Backend parses multipart with `c.req.raw.formData()`.
2. Uploaded files (`File`) are read into memory as `Buffer`.
3. Email service sends them as attachments.
4. **Nothing is persisted** to DB / disk / S3 in this path.

Additionally, these email flows can also attach files that already exist as URLs:

- `sendInvoiceEmail(...)` in `src/services/invoice.service.ts` fetches URLs (invoice PDF, quote PDF, work order attachments) and attaches them.
- `sendJobFollowUpEmail(...)` in `src/services/workorder.service.ts` fetches work order attachment URLs and attaches them.
- `sendQuoteEmail(...)` in `src/services/quotes.service.ts` fetches `QuoteAttachment.url` and attaches them.

---

## S3 support in this repo (present but disabled)

File: `src/lib/s3.ts`

- The S3 implementation (AWS SDK client, upload helper, signed URL helpers) is currently **fully commented out**.
- The env vars referenced inside that file include:
  - `S3_BUCKET_NAME`, `S3_BUCKET_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `AWS_BUCKET_URL`
- Your `.env` contains an `#S3credencials` section marker but no values.
- No active code path imports/uses `src/lib/s3.ts` in the current repo.

**Meaning**: the project *intended* to use S3, but as committed right now, S3 is not part of the runtime behavior.

---

## Answering your question directly: “store files/images into the database — which method?”

There are 3 common approaches:

### Option A — Store bytes in the database (BLOB / `bytea`)

- **How**: save raw bytes in a DB column (`bytea` in Postgres), maybe with filename/type.
- **Pros**: transactional consistency; one system to back up.
- **Cons**: DB grows fast; backups/replication heavier; serving large files from DB is inefficient; CDN not straightforward.

This repo **does not** do this today.

### Option B — Store files in object storage (S3/R2/GCS/etc.), store only metadata in DB (recommended)

- **How**:
  - Upload bytes to object storage.
  - Store `url` (or `key`) + metadata (filename, mime type, size) in DB.
- **Pros**: scalable; cheap storage; easy CDN; good performance.
- **Cons**: you must manage lifecycle/permissions and cleanup.

This repo’s **current DB design matches this approach** (URL + metadata), but the actual upload step is not implemented inside the backend.

### Option C — Store files on backend server disk, store file path in DB

- **How**: save under `uploads/` locally; store relative path in DB.
- **Pros**: simplest for small/self-hosted setups.
- **Cons**: breaks with multiple instances; needs shared storage; backups/deploys are tricky.

This repo **does not** do this today.

---

## End-to-end: “When user uploads a file/image, how does it get stored in backend?”

### What happens today (implemented)

There are only two implemented patterns:

#### Pattern 1: “Attach by URL” (Work orders, quotes, expenses)

1. **User uploads the file somewhere else** (frontend or external service).
2. Frontend gets a **URL** (e.g. S3 public URL, Cloudinary URL, etc.).
3. Frontend calls backend with JSON containing the URL.
4. Backend stores the URL in Postgres:
   - Work orders: inserts into `WorkOrderAttachment`
   - Quotes: (model exists; used when sending emails if rows exist)
   - Expenses: stores comma-separated string in `Expense.attachmentUrl`

#### Pattern 2: “Upload for email only” (quotes/invoices/workorders email sending)

1. Frontend sends `multipart/form-data` to email endpoint.
2. Backend reads files into memory buffers.
3. Backend sends email with those buffers as attachments.
4. Backend does **not** persist those files anywhere.

### What does *not* exist today (missing)

- A dedicated endpoint like `POST /uploads` that accepts a file and stores it (S3/disk/DB).
- A presigned URL flow endpoint like `POST /uploads/presign` that returns a signed upload URL.

---

## If you want the backend to “store uploads” properly (recommended design for this repo)

Because your DB already stores `url`, `filename`, `type`, the cleanest production approach is:

### Presigned upload flow (best UX + scalable)

1. Frontend calls backend:
   - `POST /uploads/presign` with `{ filename, contentType, entityType, entityId }`
2. Backend returns:
   - `uploadUrl` (signed PUT)
   - `publicUrl` (or `key`) to store in DB
3. Frontend uploads the bytes directly to S3 using `uploadUrl`.
4. Frontend calls:
   - `POST /workorders/{id}/attachments` with the resulting `url` (+ metadata)

### Direct backend upload flow (simpler but heavier backend)

1. Frontend uploads via `multipart/form-data` to backend.
2. Backend streams to S3 (or writes to disk).
3. Backend stores the resulting `url` in DB.

Your repo already has a placeholder for S3 helpers in `src/lib/s3.ts`, but it’s disabled and not wired up.

---

## Concrete “current state” checklist

- **DB stores bytes?** No.
- **DB stores URLs + metadata?** Yes (WorkOrderAttachment / QuoteAttachment) + other URL fields.
- **Backend uploads to S3?** Not currently (S3 code commented out).
- **Backend accepts multipart upload to persist files?** Not for storage; only for email attachments (in-memory).
- **Work order attachments are stored as**: rows in `WorkOrderAttachment` with `url` + optional metadata.
- **Expenses attachments are stored as**: comma-joined string in `Expense.attachmentUrl`.

