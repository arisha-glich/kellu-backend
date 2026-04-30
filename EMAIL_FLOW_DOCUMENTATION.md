# Kellu Backend Email Flow Documentation

This document explains the complete email system used in `kellu-backend`: modules, environment variables, flow, templates, folder structure, and how to add new email types.

## 1) Email Provider and Core Modules

### Provider
- **Provider:** Resend
- **SDK package:** `resend`
- **Where used:** `src/services/email.service.ts`

### Rendering engine
- **Template system:** React Email
- **Packages used:**
  - `@react-email/components`
  - `react-email`
- **Where used:** `src/lib/email-render.tsx` and `src/emails/*`

### Event-driven architecture
- **Event bus:** Node `EventEmitter`
- **Where defined:** `src/lib/event-emitter.ts`
- **Main email events:**
  - `mail:send` (final send event)
  - `mail:send-template` (template + payload event)
  - `mail:error` (error channel)

## 2) Bootstrapping (How email flow starts)

Email listeners are initialized at app startup:

- `src/index.ts` calls `registerEmailListeners()` from `src/services/email-helpers.ts`.
- `email-helpers` listener setup does two things:
  1. Registers base send listener from `src/services/email.service.ts` (for `mail:send`)
  2. Registers template listener for `mail:send-template` that:
     - renders HTML using `renderEmailTemplate(...)`
     - resolves subject from `emailSubjects`
     - emits final `mail:send`

## 3) End-to-End Flow

Typical flow:

1. A business/service action happens (for example: create work order, create invoice, etc.).
2. A helper function (usually in `src/services/email-helpers.ts`) emits `mail:send-template` with:
   - `template`
   - `payload`
   - `to`
   - optional `from`, `replyTo`, `subjectOverride`
3. The template listener renders HTML from React Email component.
4. It emits `mail:send` with final HTML and subject.
5. `email.service.ts` receives `mail:send` and pushes to internal email queue.
6. Queue applies rate limiting and retry logic.
7. Resend API sends the message.
8. On failure, `mail:error` is emitted.

## 4) Queue, Rate Limit, Retry Behavior

Defined in `src/services/email.service.ts`:

- `RATE_LIMIT_DELAY = 700ms` (about 1.4 emails/second)
- `MAX_RETRIES = 3`
- `RETRY_DELAY = 2000ms` base (increases with retry count)
- Retries are focused on rate-limit style failures (`Too many requests`).
- Recipients and BCC are normalized and validated before send.

## 5) Required and Optional Environment Variables

## Required for email sending
- `RESEND_API_KEY`
  - Required by `Resend(...)` client initialization.
  - Without this, email send throws an error.

## Strongly recommended
- `RESEND_FROM_EMAIL`
  - Default sender address used across flows.
- `RESEND_KELLU_FROM_NAME`
  - Display name for Kellu system emails.
- `RESEND_KELLU_REPLY_TO`
  - Reply-to for Kellu -> Client communication.
- `FRONTEND_URL`
  - Used for links in email payloads (login redirects, etc.).
- `APP_NAME`
  - Used in subjects/layout branding.

## Optional but used by templates/layout
- `ADMIN_DASHBOARD_PATH`
- `EMAIL_LOGO_URL`
- `BETTER_AUTH_URL`
- `BASE_URL`

## Quote email related URLs (when quote flow is used)
- `QUOTE_CLIENT_APPROVE_REDIRECT_URL`
- `QUOTE_CLIENT_REJECT_REDIRECT_URL`

## Example `.env` block (safe template)

```env
APP_NAME=Kellu
FRONTEND_URL=http://localhost:3000

RESEND_API_KEY=your_resend_api_key_here
RESEND_FROM_EMAIL=noresponder@notificaciones.kellu.co
RESEND_KELLU_FROM_NAME=Kellu
RESEND_KELLU_REPLY_TO=equipo@kellu.co

ADMIN_DASHBOARD_PATH=/admin
EMAIL_LOGO_URL=
BETTER_AUTH_URL=http://localhost:3000
BASE_URL=http://localhost:3000

QUOTE_CLIENT_APPROVE_REDIRECT_URL=http://localhost:3000/quotes/accept-quote
QUOTE_CLIENT_REJECT_REDIRECT_URL=http://localhost:3000/quotes/reject-quote
```

## 6) Folder Structure (Email Related)

```text
src/
  index.ts                                  # calls registerEmailListeners()
  lib/
    event-emitter.ts                        # typed event bus + mail events
    email-render.tsx                        # template registry + subject map + render function
  services/
    email.service.ts                        # Resend integration + queue + retries
    email-helpers.ts                        # domain helper functions to emit email events
  emails/
    components/
      email-layout.tsx                      # shared email wrapper/layout
    admin/
      add.business.tsx
      add.team-member.tsx
    booking-confirmation.tsx
    email.verification.tsx
    invoice-assigned-team.tsx
    invoice-created-client.tsx
    quote-created.tsx
    quote-rejected-by-client.tsx
    settings-updated.tsx
    task-assigned-team.tsx
    task-created.tsx
    task-rescheduled.tsx
    welcome.tsx
    work-order-assigned-team.tsx
    work-order-created.tsx
    work-order-rescheduled.tsx
```

## 7) Communication Patterns Used

There are two sender patterns implemented in `src/services/email-helpers.ts`:

1. **Kellu -> Client (system emails)**
   - From: `Kellu <RESEND_FROM_EMAIL>` (configurable)
   - Reply-To: `RESEND_KELLU_REPLY_TO`

2. **Client Business -> Their Customers/Team**
   - From: `{Business Name} <RESEND_FROM_EMAIL>`
   - Reply-To: company email from business settings

## 8) Available Template Names

Defined in `src/lib/email-render.tsx`:

- `add-business`
- `add-team-member`
- `welcome`
- `email-verification`
- `booking-confirmation`
- `quote-created`
- `quote-rejected-by-client`
- `invoice-created-client`
- `invoice-assigned-team`
- `work-order-created`
- `work-order-assigned-team`
- `work-order-rescheduled`
- `task-created`
- `task-assigned-team`
- `task-rescheduled`
- `settings-updated`

## 9) How to Trigger Email from Code

Two supported ways:

1. **Template-based (recommended)**
   - Emit `mail:send-template` with `template` + `payload`.
   - System renders HTML and sends via queue.

2. **Direct HTML**
   - Emit `mail:send` with raw `subject` + `html`.

Most business flows use helper methods from `src/services/email-helpers.ts` (recommended for consistency).

## 10) How to Add a New Email Template

1. Create new template component in `src/emails/`.
2. Import it in `src/lib/email-render.tsx`.
3. Add template key to `EmailTemplate` union type.
4. Add subject in `emailSubjects`.
5. Add case in `renderEmailTemplate(...)`.
6. Add helper function in `src/services/email-helpers.ts` for your use case.
7. Trigger helper from the relevant domain service/handler.

## 11) Operational Notes

- If `RESEND_API_KEY` is missing, send will fail early with explicit error.
- Email sending is async and non-blocking due to queue/event model.
- There is recipient validation before sending (`@` sanity check + normalization).
- Errors are logged and also emitted through `mail:error`.

## 12) Production Checklist

- Verify your domain in Resend.
- Ensure `RESEND_FROM_EMAIL` belongs to verified domain.
- Set `RESEND_API_KEY` in production secrets manager (not in git).
- Configure `FRONTEND_URL` to production frontend URL.
- Keep `RESEND_KELLU_REPLY_TO` monitored by support team.
- Test at least one email from each major flow:
  - business onboarding
  - team invite
  - quote/invoice/work order/task lifecycle

