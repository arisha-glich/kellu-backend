/**
 * Schedule API handlers – business resolved from authenticated user.
 */

import * as HttpStatusCodes from 'stoker/http-status-codes'
import type { SCHEDULE_ROUTES } from '~/routes/schedule/schedule.routes'
import { getScheduleItems } from '~/services/schedule.service'
import { BusinessNotFoundError, getBusinessIdByUserId } from '~/services/business.service'
import { hasPermission } from '~/services/permission.service'
import type { HandlerMapFromRoutes } from '~/types'

export const SCHEDULE_HANDLER: HandlerMapFromRoutes<typeof SCHEDULE_ROUTES> = {
  list: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'workorders', 'read'))) {
        return c.json(
          { message: 'You do not have permission to view the schedule' },
          HttpStatusCodes.FORBIDDEN
        )
      }
      const query = c.req.valid('query')
      const result = await getScheduleItems(businessId, {
        start: query.start,
        end: query.end,
        type: query.type,
        teamMemberId: query.teamMemberId ?? undefined,
        includeUnscheduled: query.includeUnscheduled,
      })
      return c.json(
        { message: 'Schedule retrieved successfully', success: true, data: result },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error fetching schedule:', error)
      return c.json(
        { message: 'Failed to retrieve schedule' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },
}
