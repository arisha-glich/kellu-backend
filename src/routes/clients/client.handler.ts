import * as HttpStatusCodes from 'stoker/http-status-codes'
import type { CLIENT_ROUTES } from '~/routes/clients/client.routes'
import {
  createClient,
  deleteClientByClientId,
  getClientByClientId,
  getClients,
  getLeadSources,
  getClientStatistics,
  updateClientByClientId,
  ClientNotFoundError,
} from '~/services/client.service'
import { BusinessNotFoundError, getBusinessIdByUserId } from '~/services/business.service'
import { hasPermission } from '~/services/permission.service'
import type { HandlerMapFromRoutes } from '~/types'
import { UserRole } from '~/generated/prisma'

export const CLIENT_HANDLER: HandlerMapFromRoutes<typeof CLIENT_ROUTES> = {
  list: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'only business owners can list clients' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'clients', 'read'))) {
        return c.json({ message: 'You do not have permission to list clients' }, HttpStatusCodes.FORBIDDEN)
      }
      const query = c.req.valid('query')
      const page = query.page ? Number.parseInt(query.page, 10) : 1
      const limit = query.limit ? Number.parseInt(query.limit, 10) : 10
      const result = await getClients(businessId, {
        search: query.search,
        status: query.status,
        sortBy: query.sortBy,
        order: query.order,
        page,
        limit,
      })
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

  getStatistics: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'only business owners can view client statistics' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'clients', 'read'))) {
        return c.json({ message: 'You do not have permission to view client statistics' }, HttpStatusCodes.FORBIDDEN)
      }
      const stats = await getClientStatistics(businessId)
      return c.json(
        { message: 'Statistics retrieved successfully', success: true, data: stats },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error fetching client statistics:', error)
      return c.json(
        { message: 'Failed to retrieve statistics' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  getLeadSources: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'only business owners can view lead sources' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'clients', 'read'))) {
        return c.json({ message: 'You do not have permission to view lead sources' }, HttpStatusCodes.FORBIDDEN)
      }
      const sources = getLeadSources()
      return c.json(
        { message: 'Lead sources retrieved successfully', success: true, data: sources },
        HttpStatusCodes.OK
      )
    } catch (error) {
      console.error('Error fetching lead sources:', error)
      return c.json(
        { message: 'Failed to retrieve lead sources' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  create: async c => {
    const user = c.get('user')
    if (!user || user.role !== UserRole.BUSINESS_OWNER) {
      return c.json({ message: 'only business owners can create clients' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'clients', 'create'))) {
        return c.json({ message: 'You do not have permission to create clients' }, HttpStatusCodes.FORBIDDEN)
      }
      const body = await c.req.valid('json')  
      const client = await createClient(businessId, {
        name: body.name,
        phone: body.phone,
        email: body.email,
        documentNumber: body.documentNumber,
        leadSource: body.leadSource,
        notes: body.notes,
      })
      return c.json(
        { message: 'Client created successfully', success: true, data: client },
        HttpStatusCodes.CREATED
      )
    } catch (error) {
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error creating client:', error)
      return c.json(
        { message: 'Failed to create client' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  getById: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'only business owners can create clients' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'clients', 'read'))) {
        return c.json({ message: 'You do not have permission to view this client' }, HttpStatusCodes.FORBIDDEN)
      }
      const { clientId } = c.req.valid('param')
      const client = await getClientByClientId(clientId)
      return c.json(
        { message: 'Client retrieved successfully', success: true, data: client },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof ClientNotFoundError) {
        return c.json({ message: 'Client not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error fetching client:', error)
      return c.json(
        { message: 'Failed to retrieve client' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  update: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'only business owners can update clients' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'clients', 'update'))) {
        return c.json({ message: 'You do not have permission to update clients' }, HttpStatusCodes.FORBIDDEN)
      }
      const { clientId } = c.req.valid('param') 
      const body = await c.req.valid('json')
      const client = await updateClientByClientId(clientId, {
        name: body.name,
        phone: body.phone,
        email: body.email,
        documentNumber: body.documentNumber,
        leadSource: body.leadSource,
        notes: body.notes,
        status: body.status,
      })
      return c.json(
        { message: 'Client updated successfully', success: true, data: client },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof ClientNotFoundError) {
        return c.json({ message: 'Client not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error updating client:', error)
      return c.json(
        { message: 'Failed to update client' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  delete: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'only business owners can delete clients' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'clients', 'delete'))) {
        return c.json({ message: 'You do not have permission to delete clients' }, HttpStatusCodes.FORBIDDEN)
      }
      const { clientId } = c.req.valid('param')
      await deleteClientByClientId(clientId)
      return c.json(
        { message: 'Client deleted successfully', success: true, data: { deleted: true } },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof ClientNotFoundError) {
        return c.json({ message: 'Client not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error deleting client:', error)
      return c.json(
        { message: 'Failed to delete client' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },
}
