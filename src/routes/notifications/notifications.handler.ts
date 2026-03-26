import * as HttpStatusCodes from 'stoker/http-status-codes'
import type { NOTIFICATION_ROUTES } from '~/routes/notifications/notifications.routes'
import {
  getNotificationFeedOptions,
  getUnreadNotificationCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '~/services/notifications.service'
import type { HandlerMapFromRoutes } from '~/types'

export const NOTIFICATION_HANDLER: HandlerMapFromRoutes<typeof NOTIFICATION_ROUTES> = {
  list: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }

    try {
      const query = c.req.valid('query')
      const page = query.page ? Number.parseInt(query.page, 10) : 1
      const limit = query.limit ? Number.parseInt(query.limit, 10) : 20
      const data = await listNotifications(user.id, {
        page,
        limit,
        search: query.search,
        type: query.type,
        unreadOnly: query.unreadOnly,
      })

      return c.json(
        { message: 'Notifications retrieved successfully', success: true, data },
        HttpStatusCodes.OK
      )
    } catch (error) {
      console.error('Error listing notifications:', error)
      return c.json(
        { message: 'Failed to retrieve notifications' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  unreadCount: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }

    try {
      const unread = await getUnreadNotificationCount(user.id)
      return c.json(
        { message: 'Unread count retrieved successfully', success: true, data: { unread } },
        HttpStatusCodes.OK
      )
    } catch (error) {
      console.error('Error getting unread count:', error)
      return c.json(
        { message: 'Failed to retrieve unread count' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  feedOptions: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }

    try {
      const data = await getNotificationFeedOptions(user.id)
      return c.json(
        { message: 'Feed options retrieved successfully', success: true, data },
        HttpStatusCodes.OK
      )
    } catch (error) {
      console.error('Error getting feed options:', error)
      return c.json(
        { message: 'Failed to retrieve feed options' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  markRead: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }

    try {
      const { notificationId } = c.req.valid('param')
      await markNotificationRead(user.id, notificationId)
      return c.json(
        { message: 'Notification marked as read', success: true, data: { marked: true } },
        HttpStatusCodes.OK
      )
    } catch (error) {
      console.error('Error marking notification as read:', error)
      return c.json(
        { message: 'Failed to mark notification as read' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  markAllRead: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }

    try {
      const markedCount = await markAllNotificationsRead(user.id)
      return c.json(
        { message: 'All notifications marked as read', success: true, data: { markedCount } },
        HttpStatusCodes.OK
      )
    } catch (error) {
      console.error('Error marking all notifications as read:', error)
      return c.json(
        { message: 'Failed to mark all notifications as read' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },
}
