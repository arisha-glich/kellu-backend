# Admin Portal Dashboard API

This document describes the backend API for the Admin Portal dashboard UI.

## Endpoint

- **Method:** `GET`
- **URL:** `/api/admin/reports/dashboard-overview`
- **Auth:** Required (same auth/session used by other admin routes)
- **Access:** Admin portal accounts with reports read access

## Query Parameters

All query parameters are optional.

- `preset`: `LAST_7_DAYS | LAST_30_DAYS | LAST_3_MONTHS | LAST_12_MONTHS | ALL_TIME`
- `from`: date string (`YYYY-MM-DD` or ISO datetime)
- `to`: date string (`YYYY-MM-DD` or ISO datetime)
- `businessId`: string (use this to scope dashboard to one business)

Notes:
- If `from` and `to` are provided, they are used as the date range.
- If omitted, backend defaults to `LAST_30_DAYS`.

## Response Shape

```json
{
  "message": "Admin dashboard overview retrieved successfully",
  "success": true,
  "data": {
    "totalBusinesses": 1247,
    "totalRevenue": 892000,
    "totalWorkordersCreated": 8432,
    "totalUsers": 15284,
    "invoicesGenerated": 4721,
    "activeBusinesses": 1089,
    "inactiveBusinesses": 128,
    "suspendedAccounts": 30,
    "systemHealth": {
      "serverUptimePercent": 99.9,
      "activeSessions": 3847,
      "suspendedAccounts": 30,
      "failedLogins24h": 0
    }
  }
}
```

## UI Field Mapping

Use these keys for the cards in the screenshot:

- `Total Businesses` -> `data.totalBusinesses`
- `Total Revenue` -> `data.totalRevenue`
- `Total Workorders Created` -> `data.totalWorkordersCreated`
- `Total Users` -> `data.totalUsers`
- `Invoices Generated` -> `data.invoicesGenerated`
- `Active Businesses` -> `data.activeBusinesses`
- `Inactive Businesses` -> `data.inactiveBusinesses`
- `Suspended Accounts` -> `data.suspendedAccounts`

System Health row:

- `Server Uptime` -> `data.systemHealth.serverUptimePercent`
- `Active Sessions` -> `data.systemHealth.activeSessions`
- `Suspended Accounts` -> `data.systemHealth.suspendedAccounts`
- `Failed Logins (24h)` -> `data.systemHealth.failedLogins24h`

## Important Naming Change

The metric label/key is:

- `totalWorkordersCreated` (NOT `totalJobsCreated`)

This was done specifically for the Admin Portal UI requirement: **Total Jobs Created -> Total Workorders Created**.

## Example Request

```bash
curl -X GET "http://localhost:3000/api/admin/reports/dashboard-overview?preset=LAST_30_DAYS" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>"
```

## Error Responses

Common error response structure:

```json
{
  "message": "Forbidden"
}
```

Possible statuses:

- `400` bad date/range input
- `401` unauthorized
- `403` forbidden (non-admin-portal or missing reports read permission)
- `500` server error
