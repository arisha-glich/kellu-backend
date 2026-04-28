# Notifications / Emails Policy

This backend must only send outbound notifications (especially **emails**) in cases explicitly requested/triggered by the business user (on behalf of the client) or by configured reminders.

## Allowed outbound emails

- **Explicit client-directed actions**
  - Booking confirmation (e.g. work order booking confirmation endpoint)
  - Send Message (offer / maintenance / bulk messages)
  - Send Quote
  - Send Invoice
- **Reminders**
  - Client reminders (scheduled reminders, follow-ups, etc.)

## User / business creation emails

Allowed:
- When creating a **new business** (emails directed to the business)
- When a business creates **technicians/team members** (emails directed to the technician/user)

## Disallowed outbound emails

Do **not** send emails to the **final customer** or **business owner** for automatic CRUD operations such as:

- Creating/updating a **Customer/Client**
- Creating/updating a **Work order**
  - Do not send “Work order created successfully” emails to the business owner
  - Do not email the final customer automatically for “Work order created”
- Updating **Settings**
  - Do not send “Your company settings have been updated” emails to the business owner

## Implementation notes (where enforced)

- `PATCH/POST /api/workorders/...`
  - Work order create/update no longer triggers business-owner operation emails.
  - Work order create no longer sends “work order created” emails to the final customer automatically.
- `src/services/schedule.service.ts`
  - Quick-create and reschedule flows no longer email the final customer automatically.
  - Business-owner operation emails for schedule changes are disabled.

