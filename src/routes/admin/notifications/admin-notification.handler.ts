import * as HttpStatusCodes from 'stoker/http-status-codes'
import { Prisma } from '~/generated/prisma'
import { hasAdminPortalAccess } from '~/lib/portal-access'
import type { ADMIN_NOTIFICATION_ROUTES } from '~/routes/admin/notifications/admin-notification.routes'
import {
  createPlatformNotificationRule,
  deletePlatformNotificationRule,
  getPlatformNotificationRuleById,
  listPlatformNotificationRules,
  updatePlatformNotificationRule,
} from '~/services/platform-notification-rule.service'
import { getUnreadNotificationCount, listNotifications } from '~/services/notifications.service'
import {
  getEmailForwardingSettings,
  updateEmailForwardingSettings,
} from '~/services/platform-settings.service'
import type { HandlerMapFromRoutes } from '~/types'

const FORBIDDEN_ADMIN_PORTAL_ONLY =
  'This endpoint is only for admin portal accounts. Business users must use business-scoped APIs.'

function canReadSettings(user: {
  permissions?: Array<{ resource: string; action: string }>
  isAdmin?: boolean
}) {
  return (
    !!user.isAdmin ||
    !!user.permissions?.some(p => p.resource === 'settings' && p.action === 'read')
  )
}

function canUpdateSettings(user: {
  permissions?: Array<{ resource: string; action: string }>
  isAdmin?: boolean
}) {
  return (
    !!user.isAdmin ||
    !!user.permissions?.some(p => p.resource === 'settings' && p.action === 'update')
  )
}

export const ADMIN_NOTIFICATION_HANDLER: HandlerMapFromRoutes<typeof ADMIN_NOTIFICATION_ROUTES> = {
  listFeed: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    if (!(await hasAdminPortalAccess(user.id))) {
      return c.json({ message: FORBIDDEN_ADMIN_PORTAL_ONLY }, HttpStatusCodes.FORBIDDEN)
    }
    if (!canReadSettings(user)) {
      return c.json({ message: 'Forbidden' }, HttpStatusCodes.FORBIDDEN)
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
        { message: 'Admin notifications retrieved successfully', success: true, data },
        HttpStatusCodes.OK
      )
    } catch (error) {
      console.error('Error listing admin notifications:', error)
      return c.json(
        { message: 'Failed to retrieve admin notifications' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  unreadCount: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    if (!(await hasAdminPortalAccess(user.id))) {
      return c.json({ message: FORBIDDEN_ADMIN_PORTAL_ONLY }, HttpStatusCodes.FORBIDDEN)
    }
    if (!canReadSettings(user)) {
      return c.json({ message: 'Forbidden' }, HttpStatusCodes.FORBIDDEN)
    }
    try {
      const unread = await getUnreadNotificationCount(user.id)
      return c.json(
        { message: 'Unread count retrieved successfully', success: true, data: { unread } },
        HttpStatusCodes.OK
      )
    } catch (error) {
      console.error('Error fetching admin unread notification count:', error)
      return c.json(
        { message: 'Failed to retrieve unread count' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  listRules: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    if (!(await hasAdminPortalAccess(user.id))) {
      return c.json({ message: FORBIDDEN_ADMIN_PORTAL_ONLY }, HttpStatusCodes.FORBIDDEN)
    }
    if (!canReadSettings(user)) {
      return c.json({ message: 'Forbidden' }, HttpStatusCodes.FORBIDDEN)
    }
    try {
      const data = await listPlatformNotificationRules()
      return c.json(
        { message: 'Notification rules retrieved successfully', success: true, data },
        HttpStatusCodes.OK
      )
    } catch (error) {
      console.error('Error listing platform notification rules:', error)
      return c.json(
        { message: 'Failed to list notification rules' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  createRule: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    if (!(await hasAdminPortalAccess(user.id))) {
      return c.json({ message: FORBIDDEN_ADMIN_PORTAL_ONLY }, HttpStatusCodes.FORBIDDEN)
    }
    if (!canUpdateSettings(user)) {
      return c.json({ message: 'Forbidden' }, HttpStatusCodes.FORBIDDEN)
    }
    try {
      const body = c.req.valid('json')
      const row = await createPlatformNotificationRule(body)
      return c.json(
        { message: 'Notification rule created successfully', success: true, data: row },
        HttpStatusCodes.CREATED
      )
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return c.json(
          { message: 'A rule with this eventKey already exists' },
          HttpStatusCodes.BAD_REQUEST
        )
      }
      console.error('Error creating platform notification rule:', error)
      return c.json(
        { message: 'Failed to create notification rule' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  getRule: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    if (!(await hasAdminPortalAccess(user.id))) {
      return c.json({ message: FORBIDDEN_ADMIN_PORTAL_ONLY }, HttpStatusCodes.FORBIDDEN)
    }
    if (!canReadSettings(user)) {
      return c.json({ message: 'Forbidden' }, HttpStatusCodes.FORBIDDEN)
    }
    const { ruleId } = c.req.valid('param')
    const row = await getPlatformNotificationRuleById(ruleId)
    if (!row) {
      return c.json({ message: 'Rule not found' }, HttpStatusCodes.NOT_FOUND)
    }
    return c.json(
      { message: 'Notification rule retrieved successfully', success: true, data: row },
      HttpStatusCodes.OK
    )
  },

  updateRule: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    if (!(await hasAdminPortalAccess(user.id))) {
      return c.json({ message: FORBIDDEN_ADMIN_PORTAL_ONLY }, HttpStatusCodes.FORBIDDEN)
    }
    if (!canUpdateSettings(user)) {
      return c.json({ message: 'Forbidden' }, HttpStatusCodes.FORBIDDEN)
    }
    try {
      const { ruleId } = c.req.valid('param')
      const body = c.req.valid('json')
      const row = await updatePlatformNotificationRule(ruleId, body)
      return c.json(
        { message: 'Notification rule updated successfully', success: true, data: row },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return c.json({ message: 'Rule not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error updating platform notification rule:', error)
      return c.json(
        { message: 'Failed to update notification rule' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  deleteRule: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    if (!(await hasAdminPortalAccess(user.id))) {
      return c.json({ message: FORBIDDEN_ADMIN_PORTAL_ONLY }, HttpStatusCodes.FORBIDDEN)
    }
    if (!canUpdateSettings(user)) {
      return c.json({ message: 'Forbidden' }, HttpStatusCodes.FORBIDDEN)
    }
    try {
      const { ruleId } = c.req.valid('param')
      await deletePlatformNotificationRule(ruleId)
      return c.json(
        {
          message: 'Notification rule deleted successfully',
          success: true,
          data: { deleted: true as const },
        },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return c.json({ message: 'Rule not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error deleting platform notification rule:', error)
      return c.json(
        { message: 'Failed to delete notification rule' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  getEmailForwarding: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    if (!(await hasAdminPortalAccess(user.id))) {
      return c.json({ message: FORBIDDEN_ADMIN_PORTAL_ONLY }, HttpStatusCodes.FORBIDDEN)
    }
    if (!canReadSettings(user)) {
      return c.json({ message: 'Forbidden' }, HttpStatusCodes.FORBIDDEN)
    }
    try {
      const data = await getEmailForwardingSettings()
      return c.json(
        { message: 'Email forwarding settings retrieved successfully', success: true, data },
        HttpStatusCodes.OK
      )
    } catch (error) {
      console.error('Error reading email forwarding settings:', error)
      return c.json(
        { message: 'Failed to read email forwarding settings' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  patchEmailForwarding: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    if (!(await hasAdminPortalAccess(user.id))) {
      return c.json({ message: FORBIDDEN_ADMIN_PORTAL_ONLY }, HttpStatusCodes.FORBIDDEN)
    }
    if (!canUpdateSettings(user)) {
      return c.json({ message: 'Forbidden' }, HttpStatusCodes.FORBIDDEN)
    }
    try {
      const body = c.req.valid('json')
      if (body.clientEmailCopyEnabled === true) {
        const addr = body.clientEmailCopyTo?.trim()
        if (addr === undefined) {
          const current = await getEmailForwardingSettings()
          if (!current.clientEmailCopyTo?.trim()) {
            return c.json(
              { message: 'clientEmailCopyTo is required when enabling email copy' },
              HttpStatusCodes.BAD_REQUEST
            )
          }
        } else if (addr === '' || !addr.includes('@')) {
          return c.json(
            { message: 'clientEmailCopyTo must be a valid email' },
            HttpStatusCodes.BAD_REQUEST
          )
        }
      }
      const data = await updateEmailForwardingSettings({
        clientEmailCopyEnabled: body.clientEmailCopyEnabled,
        clientEmailCopyTo:
          body.clientEmailCopyTo === ''
            ? null
            : (body.clientEmailCopyTo as string | null | undefined),
      })
      return c.json(
        { message: 'Email forwarding settings updated successfully', success: true, data },
        HttpStatusCodes.OK
      )
    } catch (error) {
      console.error('Error updating email forwarding settings:', error)
      return c.json(
        { message: 'Failed to update email forwarding settings' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },
}
