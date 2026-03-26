import { createRoute, z } from '@hono/zod-openapi'
import * as HttpStatusCodes from 'stoker/http-status-codes'
import { jsonContent } from 'stoker/openapi/helpers'
import { TAGS } from '~/config/tags'
import { zodResponseSchema } from '~/lib/zod-helper'

const NotificationFeedQuerySchema = z.object({
  search: z
    .string()
    .optional()
    .openapi({ param: { name: 'search', in: 'query' } }),
  type: z
    .string()
    .optional()
    .openapi({ param: { name: 'type', in: 'query' } }),
  unreadOnly: z
    .string()
    .optional()
    .transform(v => v === 'true' || v === '1')
    .openapi({ param: { name: 'unreadOnly', in: 'query' } }),
  page: z
    .string()
    .optional()
    .openapi({ param: { name: 'page', in: 'query' } }),
  limit: z
    .string()
    .optional()
    .openapi({ param: { name: 'limit', in: 'query' } }),
})

const NotificationItemSchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  message: z.string().nullable(),
  readAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
})

const NotificationListResponseSchema = z.object({
  data: z.array(NotificationItemSchema),
  pagination: z.object({
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
})

const NotificationParamsSchema = z.object({
  notificationId: z
    .string()
    .openapi({ param: { name: 'notificationId', in: 'path' }, description: 'Notification ID' }),
})

const NotificationFeedOptionsSchema = z.object({
  byType: z.array(
    z.object({
      type: z.string(),
      count: z.number().int(),
    })
  ),
  total: z.number().int(),
})

export const NOTIFICATION_ROUTES = {
  list: createRoute({
    method: 'get',
    tags: [TAGS.notifications],
    path: '/',
    summary: 'List activity feed notifications',
    request: { query: NotificationFeedQuerySchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(NotificationListResponseSchema), 'OK'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  unreadCount: createRoute({
    method: 'get',
    tags: [TAGS.notifications],
    path: '/unread-count',
    summary: 'Get unread notifications count',
    responses: {
      [HttpStatusCodes.OK]: jsonContent(
        zodResponseSchema(z.object({ unread: z.number().int() })),
        'OK'
      ),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  feedOptions: createRoute({
    method: 'get',
    tags: [TAGS.notifications],
    path: '/feed-options',
    summary: 'Get feed customization options (types with counts)',
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(NotificationFeedOptionsSchema), 'OK'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  markRead: createRoute({
    method: 'patch',
    tags: [TAGS.notifications],
    path: '/{notificationId}/read',
    summary: 'Mark one notification as read',
    request: { params: NotificationParamsSchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(
        zodResponseSchema(z.object({ marked: z.boolean() })),
        'Marked as read'
      ),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  markAllRead: createRoute({
    method: 'patch',
    tags: [TAGS.notifications],
    path: '/read-all',
    summary: 'Mark all notifications as read',
    responses: {
      [HttpStatusCodes.OK]: jsonContent(
        zodResponseSchema(z.object({ markedCount: z.number().int() })),
        'All marked as read'
      ),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),
}

export type NotificationRoutes = typeof NOTIFICATION_ROUTES
