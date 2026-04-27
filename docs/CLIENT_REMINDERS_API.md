# Client Reminders API (Test Guide)

Base URL: `http://localhost:8000` (or your server).  
All endpoints require authentication.

This guide covers the full reminder flow for clients:
- create reminder
- list scheduled vs triggered reminders
- update reminder
- delete reminder
- auto-trigger behavior when reminder datetime is reached

---

## 1) Create a client reminder

**Endpoint:** `POST /api/clients/{clientId}/customer-reminders`

**Purpose:** Schedule a follow-up reminder for a client.

**Request body:**

```json
{
  "date": "2026-04-27",
  "time": "14:30",
  "note": "Call client about pending quote"
}
```

**Response (201):**

> Note: this endpoint returns the full reminder overview for the client.  
> If the client already has past triggered reminders, `triggeredReminders` may already contain items.

```json
{
  "message": "Customer reminder saved successfully",
  "success": true,
  "data": {
    "upcomingReminder": {
      "dateTime": "2026-04-27T09:30:00.000Z",
      "note": "Call client about pending quote"
    },
    "reminders": [
      {
        "id": "clx_rem_log_1",
        "dateTime": "2026-04-27T09:30:00.000Z",
        "note": "Call client about pending quote",
        "createdAt": "2026-04-27T09:00:00.000Z"
      }
    ],
    "scheduledReminders": [
      {
        "id": "clx_rem_log_1",
        "dateTime": "2026-04-27T09:30:00.000Z",
        "note": "Call client about pending quote",
        "createdAt": "2026-04-27T09:00:00.000Z"
      }
    ],
    "triggeredReminders": []
  }
}
```

---

## 2) List client reminders (includes triggered section)

**Endpoint:** `GET /api/clients/{clientId}/customer-reminders`

**Purpose:** Get reminder timeline for one client.

**Response fields:**
- `upcomingReminder`: next pending reminder if still in future, else `null`
- `scheduledReminders`: reminders not triggered yet
- `triggeredReminders`: reminders whose datetime has passed and were triggered

**Response (200):**

```json
{
  "message": "Customer reminders retrieved successfully",
  "success": true,
  "data": {
    "upcomingReminder": null,
    "scheduledReminders": [
      {
        "id": "clx_rem_log_2",
        "dateTime": "2026-05-01T10:00:00.000Z",
        "note": "Second follow-up",
        "createdAt": "2026-04-27T08:00:00.000Z"
      }
    ],
    "triggeredReminders": [
      {
        "id": "clx_rem_log_1",
        "dateTime": "2026-04-25T10:00:00.000Z",
        "note": "Old reminder that got triggered",
        "createdAt": "2026-04-27T08:15:00.000Z"
      }
    ]
  }
}
```

---

## 3) Update a scheduled reminder

**Endpoint:** `PATCH /api/clients/{clientId}/customer-reminders/{reminderId}`

**Purpose:** Update a scheduled (not triggered) reminder.

**Request body example:**

```json
{
  "date": "2026-04-28",
  "time": "16:00",
  "note": "Rescheduled follow-up call"
}
```

**Response (200):**

```json
{
  "message": "Customer reminder updated successfully",
  "success": true,
  "data": {
    "id": "clx_rem_log_2",
    "dateTime": "2026-04-28T11:00:00.000Z",
    "note": "Rescheduled follow-up call",
    "createdAt": "2026-04-27T08:00:00.000Z"
  }
}
```

> Triggered reminders are historical records and are not updatable.

---

## 4) Delete a scheduled reminder

**Endpoint:** `DELETE /api/clients/{clientId}/customer-reminders/{reminderId}`

**Purpose:** Delete a scheduled (not triggered) reminder.

**Response (200):**

```json
{
  "message": "Customer reminder deleted successfully",
  "success": true,
  "data": {
    "deleted": true
  }
}
```

> Triggered reminders are historical records and are not deletable.

---

## 5) Auto-trigger behavior (what to test)

When reminder datetime is reached:
- the reminder is marked as triggered (appears in `triggeredReminders`)
- client status is updated to `FOLLOW_UP`
- current `upcomingReminder` is cleared

Processing runs automatically in background (about every 30 minutes), and is also evaluated when loading reminder list.

---

## 6) Quick QA flow

1. Create a reminder 1-2 minutes in the future.  
2. Call `GET /api/clients/{clientId}/customer-reminders` and verify it appears in `scheduledReminders`.  
3. Wait until reminder time passes (+ up to ~30 minutes processing window if you are not calling reminder list).  
4. Call the same GET again:
   - entry moved to `triggeredReminders`
   - `upcomingReminder` is `null` (or next future reminder)
5. Verify client status:
   - call `GET /api/clients/{clientId}`
   - check `status` is `FOLLOW_UP`

---

## 7) Common errors

- `400 Bad Request`: invalid time format (example: malformed `time`)
- `404 Not Found`: client not found, or reminder not found
- `403 Forbidden`: user has no permission
- `401 Unauthorized`: unauthenticated request

