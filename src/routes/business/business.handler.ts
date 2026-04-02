import * as HttpStatusCodes from 'stoker/http-status-codes'
import type { BUSINESS_ROUTES } from '~/routes/business/business.routes'
import {
  BusinessNotFoundError,
  businessService,
  EmailAlreadyUsedError,
} from '~/services/business.service'
import { createAuditLog } from '~/services/audit-log.service'
import type { HandlerMapFromRoutes } from '~/types'

function getClientMeta(c: { req: { header: (k: string) => string | undefined } }) {
  const forwarded = c.req.header('x-forwarded-for')
  const ipAddress = forwarded?.split(',')[0]?.trim() || null
  const userAgent = c.req.header('user-agent') ?? null
  return { ipAddress, userAgent }
}

export const BUSINESS_HANDLER: HandlerMapFromRoutes<typeof BUSINESS_ROUTES> = {
  getBusinesses: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const query = c.req.valid('query')
      const search = query.search
      const status = query.status
      const page = query.page ? Number.parseInt(query.page, 10) : 1
      const limit = query.limit ? Number.parseInt(query.limit, 10) : 10
      const result = await businessService.getBusinesses(search, status, page, limit)
      return c.json(
        { message: 'Businesses retrieved successfully', success: true, data: result },
        HttpStatusCodes.OK
      )
    } catch (error) {
      console.error('Error fetching businesses:', error)
      return c.json(
        { message: 'Failed to retrieve businesses' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  getBusiness: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const { id } = c.req.valid('param')
      const business = await businessService.getBusinessById(id)
      if (!business) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      return c.json(
        { message: 'Business details retrieved successfully', success: true, data: business },
        HttpStatusCodes.OK
      )
    } catch (error) {
      console.error('Error fetching business:', error)
      return c.json(
        { message: 'Failed to retrieve business' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  createBusiness: async c => {
    const user = c.get('user')
    console.log(user)
    if (!user || !user.isAdmin) {
      return c.json(
        { message: 'only super admins can create businesses' },
        HttpStatusCodes.UNAUTHORIZED
      )
    }

    try {
      const body = await c.req.valid('json')
      const business = await businessService.createBusiness({
        companyName: body.companyName,
        email: body.email,
        phone: body.phone,
        address: body.address,
        website: body.website,
        tempPassword: body.tempPassword,
        status: body.status,
      })
      const { ipAddress, userAgent } = getClientMeta(c)
      await createAuditLog({
        action: 'BUSINESS_CREATED',
        module: 'business',
        entityId: business.id,
        newValues: {
          id: business.id,
          name: business.name,
          status: business.status,
        },
        userId: user.id,
        businessId: business.id,
        ipAddress,
        userAgent,
      })
      return c.json(
        { message: 'Business created successfully', success: true, data: business },
        HttpStatusCodes.CREATED
      )
    } catch (error) {
      if (error instanceof EmailAlreadyUsedError) {
        return c.json({ message: 'Email already in use' }, HttpStatusCodes.CONFLICT)
      }
      console.error('Error creating business:', error)
      return c.json({ message: 'Failed to create business' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
    }
  },

  updateBusiness: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const { id } = c.req.valid('param')
      const body = await c.req.valid('json')
      const business = await businessService.updateBusiness(id, {
        companyName: body.companyName,
        email: body.email,
        phone: body.phone,
        address: body.address,
        website: body.website,
        status: body.status,
      })
      const { ipAddress, userAgent } = getClientMeta(c)
      await createAuditLog({
        action: 'BUSINESS_UPDATED',
        module: 'business',
        entityId: id,
        newValues: {
          id: business.id,
          name: business.name,
          status: business.status,
        },
        userId: user.id,
        businessId: id,
        ipAddress,
        userAgent,
      })
      return c.json(
        { message: 'Business updated successfully', success: true, data: business },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error updating business:', error)
      return c.json({ message: 'Failed to update business' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
    }
  },

  updateBusinessCommission: async c => {
    const user = c.get('user')
    if (!user || !user.isAdmin) {
      return c.json(
        { message: 'only super admins can update business commission' },
        HttpStatusCodes.UNAUTHORIZED
      )
    }
    try {
      const { id } = c.req.valid('param')
      const body = await c.req.valid('json')
      const commission = await businessService.updateBusinessCommission(id, {
        commissionType: body.commissionType,
        commissionValue: body.commissionValue,
      })
      const { ipAddress, userAgent } = getClientMeta(c)
      await createAuditLog({
        action: 'BUSINESS_COMMISSION_UPDATED',
        module: 'business',
        entityId: id,
        newValues: {
          commissionType: commission.commissionType,
          commissionValue: commission.commissionValue,
        },
        userId: user.id,
        businessId: id,
        ipAddress,
        userAgent,
      })
      return c.json(
        { message: 'Commission updated successfully', success: true, data: commission },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error updating commission:', error)
      return c.json(
        { message: 'Failed to update commission' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  getBusinessClients: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const { id } = c.req.valid('param')
      const query = c.req.valid('query')
      const page = query.page ? Number.parseInt(query.page, 10) : 1
      const limit = query.limit ? Number.parseInt(query.limit, 10) : 10
      const result = await businessService.getBusinessClients(id, page, limit)
      return c.json(
        { message: 'Clients retrieved successfully', success: true, data: result },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error fetching clients:', error)
      return c.json(
        { message: 'Failed to retrieve clients' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  getBusinessJobs: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const { id } = c.req.valid('param')
      const query = c.req.valid('query')
      const page = query.page ? Number.parseInt(query.page, 10) : 1
      const limit = query.limit ? Number.parseInt(query.limit, 10) : 10
      const result = await businessService.getBusinessJobs(id, page, limit)
      return c.json(
        { message: 'Jobs retrieved successfully', success: true, data: result },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error fetching jobs:', error)
      return c.json({ message: 'Failed to retrieve jobs' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
    }
  },

  getBusinessClientsWithJobs: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const { id } = c.req.valid('param')
      const query = c.req.valid('query')
      const page = query.page ? Number.parseInt(query.page, 10) : 1
      const limit = query.limit ? Number.parseInt(query.limit, 10) : 10
      const result = await businessService.getBusinessClientsWithJobs(id, page, limit)
      return c.json(
        { message: 'Clients with jobs retrieved successfully', success: true, data: result },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error fetching clients with jobs:', error)
      return c.json(
        { message: 'Failed to retrieve clients with jobs' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  toggleBusinessStatus: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const { id } = c.req.valid('param')
      const { status } = await c.req.valid('json')
      const result = await businessService.toggleBusinessStatus(id, status)
      const { ipAddress, userAgent } = getClientMeta(c)
      await createAuditLog({
        action: 'BUSINESS_STATUS_TOGGLED',
        module: 'business',
        entityId: id,
        newValues: { status: result.status },
        userId: user.id,
        businessId: id,
        ipAddress,
        userAgent,
      })
      return c.json(
        { message: 'Business status updated successfully', success: true, data: result },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error toggling status:', error)
      return c.json({ message: 'Failed to update status' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
    }
  },

  suspendBusiness: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const { id } = c.req.valid('param')
      const result = await businessService.suspendBusiness(id)
      const { ipAddress, userAgent } = getClientMeta(c)
      await createAuditLog({
        action: 'BUSINESS_SUSPENDED',
        module: 'business',
        entityId: id,
        newValues: { status: result.status },
        userId: user.id,
        businessId: id,
        ipAddress,
        userAgent,
      })
      return c.json(
        { message: 'Business suspended successfully', success: true, data: result },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error suspending business:', error)
      return c.json(
        { message: 'Failed to suspend business' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  unsuspendBusiness: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const { id } = c.req.valid('param')
      const result = await businessService.unsuspendBusiness(id)
      const { ipAddress, userAgent } = getClientMeta(c)
      await createAuditLog({
        action: 'BUSINESS_UNSUSPENDED',
        module: 'business',
        entityId: id,
        newValues: { status: result.status },
        userId: user.id,
        businessId: id,
        ipAddress,
        userAgent,
      })
      return c.json(
        { message: 'Business unsuspended successfully', success: true, data: result },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error unsuspending business:', error)
      return c.json(
        { message: 'Failed to unsuspend business' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  sendEmail: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const { id } = c.req.valid('param')
      const body = await c.req.valid('json')
      const content = (body.body ?? body.message ?? '').trim()
      const result = await businessService.sendBusinessEmail(id, body.subject, content)
      return c.json(
        { message: result.message, success: result.success, data: result },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error sending email:', error)
      return c.json(
        { message: error instanceof Error ? error.message : 'Failed to send email' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  sendReminder: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const { id } = c.req.valid('param')
      const result = await businessService.sendBusinessReminder(id)
      return c.json(
        { message: 'Reminder sent successfully', success: true, data: result },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error sending reminder:', error)
      return c.json({ message: 'Failed to send reminder' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
    }
  },
}
