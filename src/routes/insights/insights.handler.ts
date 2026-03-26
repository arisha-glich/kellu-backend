import type { Context } from 'hono'
import * as HttpStatusCodes from 'stoker/http-status-codes'
import { HttpError } from '~/lib/error'
import type { INSIGHTS_ROUTES } from '~/routes/insights/insights.routes'
import { BusinessNotFoundError, getBusinessIdByUserId } from '~/services/business.service'
import {
  getInsightsInvoices,
  getInsightsJobs,
  getInsightsLeadConversion,
  getInsightsOverview,
  getInsightsRevenue,
  resolveInsightsRange,
} from '~/services/insights.service'
import { hasPermission } from '~/services/permission.service'
import type { AppBindings, HandlerMapFromRoutes } from '~/types'

export async function assertInsightsAccess(
  c: Context<AppBindings>,
  pathBusinessId: string
): Promise<void> {
  const user = c.get('user')
  if (!user) {
    throw new HttpError('Unauthorized', HttpStatusCodes.UNAUTHORIZED)
  }
  const businessId = await getBusinessIdByUserId(user.id)
  if (!businessId || businessId !== pathBusinessId) {
    throw new HttpError('Business not found for this user', HttpStatusCodes.NOT_FOUND)
  }
  if (!(await hasPermission(user.id, businessId, 'reports', 'read'))) {
    throw new HttpError('You do not have permission to view insights', HttpStatusCodes.FORBIDDEN)
  }
}

export const INSIGHTS_HANDLER: HandlerMapFromRoutes<typeof INSIGHTS_ROUTES> = {
  getOverview: async c => {
    const { id } = c.req.valid('param')
    await assertInsightsAccess(c, id)
    try {
      const query = c.req.valid('query')
      const range = resolveInsightsRange(query.preset, query.from, query.to)
      const data = await getInsightsOverview(id, range)
      return c.json(
        { message: 'Insights overview retrieved successfully', success: true, data },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof Error && error.message === 'CUSTOM_PRESET_REQUIRES_FROM_TO') {
        return c.json(
          { message: 'from and to are required when preset is CUSTOM', success: false },
          HttpStatusCodes.BAD_REQUEST
        )
      }
      if (error instanceof Error && error.message.startsWith('INVALID_')) {
        return c.json(
          { message: 'Invalid from or to date', success: false },
          HttpStatusCodes.BAD_REQUEST
        )
      }
      console.error('Error fetching insights overview:', error)
      return c.json(
        { message: 'Failed to retrieve insights overview' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  getRevenue: async c => {
    const { id } = c.req.valid('param')
    await assertInsightsAccess(c, id)
    try {
      const query = c.req.valid('query')
      const range = resolveInsightsRange(query.preset, query.from, query.to)
      const data = await getInsightsRevenue(id, range)
      return c.json(
        { message: 'Insights revenue retrieved successfully', success: true, data },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof Error && error.message === 'CUSTOM_PRESET_REQUIRES_FROM_TO') {
        return c.json(
          { message: 'from and to are required when preset is CUSTOM', success: false },
          HttpStatusCodes.BAD_REQUEST
        )
      }
      if (error instanceof Error && error.message.startsWith('INVALID_')) {
        return c.json(
          { message: 'Invalid from or to date', success: false },
          HttpStatusCodes.BAD_REQUEST
        )
      }
      console.error('Error fetching insights revenue:', error)
      return c.json(
        { message: 'Failed to retrieve insights revenue' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  getLeadConversion: async c => {
    const { id } = c.req.valid('param')
    await assertInsightsAccess(c, id)
    try {
      const query = c.req.valid('query')
      const range = resolveInsightsRange(query.preset, query.from, query.to)
      const data = await getInsightsLeadConversion(id, range)
      return c.json(
        { message: 'Lead conversion insights retrieved successfully', success: true, data },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof Error && error.message === 'CUSTOM_PRESET_REQUIRES_FROM_TO') {
        return c.json(
          { message: 'from and to are required when preset is CUSTOM', success: false },
          HttpStatusCodes.BAD_REQUEST
        )
      }
      if (error instanceof Error && error.message.startsWith('INVALID_')) {
        return c.json(
          { message: 'Invalid from or to date', success: false },
          HttpStatusCodes.BAD_REQUEST
        )
      }
      console.error('Error fetching lead conversion insights:', error)
      return c.json(
        { message: 'Failed to retrieve lead conversion insights' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  getJobs: async c => {
    const { id } = c.req.valid('param')
    await assertInsightsAccess(c, id)
    try {
      const query = c.req.valid('query')
      const range = resolveInsightsRange(query.preset, query.from, query.to)
      const data = await getInsightsJobs(id, range)
      return c.json(
        { message: 'Jobs insights retrieved successfully', success: true, data },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof Error && error.message === 'CUSTOM_PRESET_REQUIRES_FROM_TO') {
        return c.json(
          { message: 'from and to are required when preset is CUSTOM', success: false },
          HttpStatusCodes.BAD_REQUEST
        )
      }
      if (error instanceof Error && error.message.startsWith('INVALID_')) {
        return c.json(
          { message: 'Invalid from or to date', success: false },
          HttpStatusCodes.BAD_REQUEST
        )
      }
      console.error('Error fetching jobs insights:', error)
      return c.json(
        { message: 'Failed to retrieve jobs insights' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  getInvoices: async c => {
    const { id } = c.req.valid('param')
    await assertInsightsAccess(c, id)
    try {
      const query = c.req.valid('query')
      const range = resolveInsightsRange(query.preset, query.from, query.to)
      const data = await getInsightsInvoices(id, range)
      return c.json(
        { message: 'Invoice insights retrieved successfully', success: true, data },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof Error && error.message === 'CUSTOM_PRESET_REQUIRES_FROM_TO') {
        return c.json(
          { message: 'from and to are required when preset is CUSTOM', success: false },
          HttpStatusCodes.BAD_REQUEST
        )
      }
      if (error instanceof Error && error.message.startsWith('INVALID_')) {
        return c.json(
          { message: 'Invalid from or to date', success: false },
          HttpStatusCodes.BAD_REQUEST
        )
      }
      console.error('Error fetching invoice insights:', error)
      return c.json(
        { message: 'Failed to retrieve invoice insights' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },
}
