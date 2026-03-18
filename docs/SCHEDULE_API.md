# Schedule / Calendar API (§4 Scheduling & Calendar)

Base URL: `http://localhost:8000` (or your server).  
All schedule endpoints require **authentication** (session cookie or auth header).  
Permission: user must have **workorders read** for the business.

---

## 1. Get schedule items (Day / Week / Month)

**Endpoint:** `GET /api/schedule`

**Purpose:** Returns work orders and tasks for a date range for the company schedule. Supports Daily, Weekly, and Monthly views. Includes unassigned items and optional unscheduled items (no date/time).

**Query parameters:**

| Parameter          | Type   | Required | Default | Description |
|--------------------|--------|----------|---------|-------------|
| `start`            | string | Yes      | —       | Start of range. ISO date (`YYYY-MM-DD`) or date-time. |
| `end`              | string | Yes      | —       | End of range. ISO date or date-time. |
| `type`             | string | No       | `all`   | Filter by type: `all`, `workorder`, `task`. |
| `teamMemberId`     | string | No       | —       | Filter by assigned team member ID (technician). |
| `includeUnscheduled` | string | No     | `true`  | Set to `false` or `0` to exclude items with no date. |

**Example – day view (March 18, 2026):**

```
GET /api/schedule?start=2026-03-18&end=2026-03-18
```

**Example – week view:**

```
GET /api/schedule?start=2026-03-16&end=2026-03-22
```

**Example – month view:**

```
GET /api/schedule?start=2026-03-01&end=2026-03-31
```

**Example – filter by team member and type:**

```
GET /api/schedule?start=2026-03-18&end=2026-03-18&type=workorder&teamMemberId=<member-id>
```

**Example – exclude unscheduled appointments:**

```
GET /api/schedule?start=2026-03-18&end=2026-03-18&includeUnscheduled=false
```

**Response (200 OK):**

```json
{
  "message": "Schedule retrieved successfully",
  "success": true,
  "data": {
    "scheduled": [
      {
        "id": "<work-order-or-task-id>",
        "type": "workorder",
        "title": "Install AC",
        "clientName": "Acme Corp",
        "address": "123 Main St",
        "scheduledAt": "2026-03-18T00:00:00.000Z",
        "startTime": "09:00",
        "endTime": "11:00",
        "isAnyTime": false,
        "isScheduleLater": false,
        "assignedToId": "<member-id>",
        "assignedToName": "Jane Doe",
        "status": "SCHEDULED",
        "completedAt": null,
        "workOrderNumber": "WO-001",
        "workOrderId": null
      },
      {
        "id": "<task-id>",
        "type": "task",
        "title": "Follow-up call",
        "clientName": "Acme Corp",
        "address": "",
        "scheduledAt": "2026-03-18T00:00:00.000Z",
        "startTime": null,
        "endTime": null,
        "isAnyTime": true,
        "isScheduleLater": false,
        "assignedToId": null,
        "assignedToName": null,
        "status": "PENDING",
        "completedAt": null,
        "workOrderNumber": null,
        "workOrderId": "<work-order-id>"
      }
    ],
    "unscheduled": [
      {
        "id": "<id>",
        "type": "workorder",
        "title": "TBD job",
        "clientName": "Beta Inc",
        "address": "456 Oak Ave",
        "scheduledAt": null,
        "startTime": null,
        "endTime": null,
        "isAnyTime": false,
        "isScheduleLater": true,
        "assignedToId": null,
        "assignedToName": null,
        "status": "UNSCHEDULED",
        "completedAt": null,
        "workOrderNumber": "WO-002",
        "workOrderId": null
      }
    ]
  }
}
```

**Schedule item fields (for calendar block view):**

- **id**, **type** (`workorder` | `task`) – identify the item.
- **title**, **clientName**, **address** – for “Customer name – title” and address.
- **scheduledAt**, **startTime**, **endTime**, **isAnyTime** – for timeline placement; “Anytime” when `isAnyTime` is true or times null.
- **assignedToId**, **assignedToName** – technician; null = unassigned row.
- **status** – job status (work order) or task status; use for “Completed” symbol (e.g. `COMPLETED` or `completedAt` non-null).
- **completedAt** – set when completed; can drive completed symbol.
- **workOrderNumber** – only for `type: workorder`.
- **workOrderId** – only for tasks; null for standalone tasks.

---

## 2. Calendar actions (create / reschedule / reassign)

The schedule API is **read-only**. Create, update, reschedule, and reassign use existing APIs:

| Action | API |
|--------|-----|
| Create work order | `POST /api/workorders` (body: clientId, address, title, instructions, lineItems, assignedToId, scheduledAt, startTime, endTime, etc.) |
| Create standalone task | `POST /api/tasks` (body: no workOrderId; clientId, title, address, assignedToId, scheduledAt, startTime, endTime, etc.) |
| Reschedule / reassign / change times | `PATCH /api/workorders/{workOrderId}` or `PATCH /api/tasks/{taskId}` (send updated scheduledAt, startTime, endTime, assignedToId) |
| Short creation form | Same as above; use minimal fields for “short form” and “More options” can open full work order or task detail. |

Block colors by technician are a **front-end / Settings** concern; the API returns `assignedToId` and `assignedToName` so the client can map colors in Schedule Settings.
