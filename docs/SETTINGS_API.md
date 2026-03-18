# Settings API – Profile & Company Settings (§13.1)

**Route folder:** `src/routes/settings`  
**Base path:** `/api/settings`  
**Service:** `src/services/settings.service.ts`

All endpoints require **authentication**. Permissions: **settings read** (get), **settings update** (update).  
The “current” business is resolved via `getBusinessIdByUserId(user.id)` (owner or active member).  
Base URL: `http://localhost:8000` (or your server).

---

## UI screens covered

| Screen | Backend fields |
|--------|-----------------|
| **Reply list** | `settings.replyToEmail` – Reply-to emails for customer communication |
| **Due dates** | `settings.quoteExpirationDays`, `settings.invoiceDueDays` |
| **Personal profile** | `personalProfile.fullName`, `personalProfile.email` |
| **Company details** | `company.name`, `company.legalName`, `company.email`, `company.phone`, `company.webpage`, `company.street1`, `company.street2`, `company.city`, `company.state`, `company.zipcode`, `company.rutNumber`, `company.logoUrl`, `company.primaryColor`, `company.secondaryColor` |
| **Bank details** | `settings.bankName`, `settings.accountType`, `settings.accountNumber`, `settings.paymentEmail`, `settings.onlinePaymentLink` |
| **Terms & conditions** | `settings.quoteTermsConditions`, `settings.invoiceTermsConditions` |
| **Arrival window** | `settings.arrivalWindowHours` (1–4 hours for booking confirmation) |
| **WhatsApp sender** | `settings.whatsappSender` |
| **Tax (VAT/IVA)** | `settings.taxIdRut`, `settings.defaultTaxRate` |

---

## Module files

| File | Purpose |
|------|--------|
| `settings.routes.ts` | OpenAPI routes: GET `/`, PATCH `/`; CurrentSettingsResponseSchema, UpdateSettingsBodySchema |
| `settings.handler.ts` | Handlers: getBusinessIdByUserId, hasPermission(settings, read/update), call settings.service |
| `index.ts` | Registers settings routes |

---

## Endpoints

| Method | Path | Summary | Permission |
|--------|------|---------|------------|
| GET | `/` | Get current business settings (profile + company + settings) | settings read |
| PATCH | `/` | Update current business profile and/or company settings | settings update |

---

## 1. Get settings

**Endpoint:** `GET /api/settings`

**Response (200):**

```json
{
  "message": "Settings retrieved successfully",
  "success": true,
  "data": {
    "personalProfile": {
      "fullName": "John Doe",
      "email": "you@company.com"
    },
    "company": {
      "id": "<business-id>",
      "name": "Water Test",
      "legalName": null,
      "email": "info@company.com",
      "phone": "+56 9 1234 5678",
      "webpage": "https://example.com",
      "address": null,
      "street1": null,
      "street2": null,
      "city": null,
      "state": null,
      "zipcode": null,
      "logoUrl": null,
      "primaryColor": "#28AFB0",
      "secondaryColor": "#1F271B",
      "rutNumber": null
    },
    "settings": {
      "replyToEmail": "replies@company.com",
      "quoteExpirationDays": 7,
      "invoiceDueDays": 3,
      "arrivalWindowHours": 1,
      "arrivalWindowMinutes": null,
      "defaultDurationMinutes": null,
      "bankName": "Banco de Chile",
      "accountType": "Cuenta corriente",
      "accountNumber": null,
      "paymentEmail": "payments@company.com",
      "onlinePaymentLink": null,
      "quoteTermsConditions": "Payment terms for quotes...",
      "invoiceTermsConditions": "Payment due terms for invoices...",
      "whatsappSender": "+56 9 1234 5678",
      "defaultTaxRate": 19,
      "taxIdRut": "12.345.678-9",
      "sendTeamPhotosWithConfirmation": false
    }
  }
}
```

**What to check:**

- 401 if not authenticated
- 404 if user has no business (not owner and not active member)
- 403 if user lacks `settings` read permission

---

## 2. Update settings

**Endpoint:** `PATCH /api/settings`

**Purpose:** Update any subset of personal profile, company profile, and company settings. Creates `BusinessSettings` if missing.

**Request body (JSON, all fields optional):**

| Section | Field | Type | Description |
|---------|--------|------|-------------|
| Personal | `fullName` | string | Owner display name |
| Personal | `email` | string | Owner email |
| Company | `name` | string | Company name |
| Company | `legalName` | string \| null | Legal name |
| Company | `companyEmail` | string | Company email (customer-facing, Reply-To) |
| Company | `phone` | string \| null | Company phone |
| Company | `webpage` | string \| null | Website URL |
| Company | `address` | string \| null | Single-line address (legacy) |
| Company | `street1`, `street2`, `city`, `state`, `zipcode` | string \| null | Address components |
| Company | `logoUrl` | string \| null | Logo URL (upload handled elsewhere) |
| Company | `primaryColor`, `secondaryColor` | string \| null | Hex codes for PDFs/emails |
| Company | `rutNumber` | string \| null | Company RUT / Tax ID |
| Reply list | `replyToEmail` | string \| null | Reply-to for customer emails |
| Due dates | `quoteExpirationDays` | number | Days until quote expires (e.g. 7) |
| Due dates | `invoiceDueDays` | number | Days until invoice due (e.g. 3) |
| Arrival | `arrivalWindowHours` | number \| null | 1–4 hours for booking confirmation |
| Bank | `bankName`, `accountType`, `accountNumber` | string \| null | Bank details |
| Bank | `paymentEmail` | string \| null | Email for payment notifications |
| Bank | `onlinePaymentLink` | string \| null | URL for online payment |
| Terms | `quoteTermsConditions`, `invoiceTermsConditions` | string \| null | Default T&C text |
| WhatsApp | `whatsappSender` | string \| null | Company WhatsApp number |
| Tax | `defaultTaxRate` | number \| null | Default tax % (e.g. 19) |
| Tax | `taxIdRut` | string \| null | Tax ID / RUT for invoices |
| Other | `sendTeamPhotosWithConfirmation` | boolean | Send team photos with booking confirmation |

**Example (partial update):**

```json
{
  "replyToEmail": "replies@company.com",
  "quoteExpirationDays": 7,
  "invoiceDueDays": 3,
  "arrivalWindowHours": 1,
  "primaryColor": "#28AFB0",
  "secondaryColor": "#1F271B",
  "defaultTaxRate": 19,
  "taxIdRut": "12.345.678-9"
}
```

**Response (200):** Same shape as GET `/api/settings` with updated data.

**What to check:**

- 403 if user lacks `settings` update permission
- `arrivalWindowHours` is clamped to 1–4 when provided

---

## Schema reference (Prisma)

**Business:** `name`, `legalName`, `email`, `phone`, `address`, `street1`, `street2`, `city`, `state`, `zipcode`, `webpage`, `logoUrl`, `primaryColor`, `secondaryColor`, `rutNumber`, `ownerId`, etc.

**BusinessSettings:** `replyToEmail`, `quoteExpirationDays`, `invoiceDueDays`, `arrivalWindowHours`, `arrivalWindowMinutes`, `bankName`, `accountType`, `accountNumber`, `paymentEmail`, `onlinePaymentLink`, `quoteTermsConditions`, `invoiceTermsConditions`, `whatsappSender`, `defaultTaxRate`, `rutNumber` (tax ID), `sendTeamPhotosWithConfirmation`, etc.

**User (owner):** `name`, `email` – updated when `fullName` or `email` are sent in PATCH.

---

## Email architecture note

Per Kellu Email Architecture:

- **Client → Their customers:** Automated emails (quotes, booking confirmation, etc.) use **From:** `{Company name} <noresponder@...>` and **Reply-To:** company email. The Reply-To is taken from `settings.replyToEmail` (or `company.email`). So `replyToEmail` / `companyEmail` must be set for “Reply list” and “Email address” in Company details.
