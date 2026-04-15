import * as HttpStatusCodes from 'stoker/http-status-codes'
import { ClientStatus, UserRole } from '~/generated/prisma'
import type { CLIENT_ROUTES } from '~/routes/clients/client.routes'
import { BusinessNotFoundError, getBusinessIdByUserId } from '~/services/business.service'
import {
  ClientEmailRequiredError,
  ClientNotFoundError,
  createClient,
  createClientCustomerReminder,
  deleteClientByClientId,
  EmailAlreadyUsedError,
  getClientByClientId,
  getClientMessageTemplate,
  getClientStatistics,
  getClients,
  getLatestClientMessageTemplate,
  getLeadSources,
  listClientCustomerReminders,
  updateClientByClientId,
} from '~/services/client.service'
import { hasPermission } from '~/services/permission.service'
import type { HandlerMapFromRoutes } from '~/types'

function listStatusForService(
  status: 'ACTIVE' | 'ARCHIVED' | 'FOLLOW_UP' | 'ALL' | undefined
): ClientStatus | undefined {
  if (status === undefined || status === 'ALL') {
    return undefined
  }
  return status
}

export const CLIENT_HANDLER: HandlerMapFromRoutes<typeof CLIENT_ROUTES> = {
  list: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json(
        { message: 'only business owners can list clients' },
        HttpStatusCodes.UNAUTHORIZED
      )
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'clients', 'read'))) {
        return c.json(
          { message: 'You do not have permission to list clients' },
          HttpStatusCodes.FORBIDDEN
        )
      }
      const query = c.req.valid('query')
      const page = query.page ? Number.parseInt(query.page, 10) : 1
      const limit = query.limit ? Number.parseInt(query.limit, 10) : 10
      const result = await getClients(businessId, {
        search: query.search,
        status: listStatusForService(query.status),
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

  listArchived: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json(
        { message: 'only business owners can list clients' },
        HttpStatusCodes.UNAUTHORIZED
      )
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'clients', 'read'))) {
        return c.json(
          { message: 'You do not have permission to list clients' },
          HttpStatusCodes.FORBIDDEN
        )
      }
      const query = c.req.valid('query')
      const page = query.page ? Number.parseInt(query.page, 10) : 1
      const limit = query.limit ? Number.parseInt(query.limit, 10) : 10
      const result = await getClients(businessId, {
        search: query.search,
        status: ClientStatus.ARCHIVED,
        sortBy: query.sortBy,
        order: query.order,
        page,
        limit,
      })
      return c.json(
        { message: 'Archived clients retrieved successfully', success: true, data: result },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error fetching archived clients:', error)
      return c.json(
        { message: 'Failed to retrieve archived clients' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  getStatistics: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json(
        { message: 'only business owners can view client statistics' },
        HttpStatusCodes.UNAUTHORIZED
      )
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'clients', 'read'))) {
        return c.json(
          { message: 'You do not have permission to view client statistics' },
          HttpStatusCodes.FORBIDDEN
        )
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
      return c.json(
        { message: 'only business owners can view lead sources' },
        HttpStatusCodes.UNAUTHORIZED
      )
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'clients', 'read'))) {
        return c.json(
          { message: 'You do not have permission to view lead sources' },
          HttpStatusCodes.FORBIDDEN
        )
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
      return c.json(
        { message: 'only business owners can create clients' },
        HttpStatusCodes.UNAUTHORIZED
      )
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'clients', 'create'))) {
        return c.json(
          { message: 'You do not have permission to create clients' },
          HttpStatusCodes.FORBIDDEN
        )
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
      if (error instanceof EmailAlreadyUsedError) {
        return c.json({ message: 'Email already in use' }, HttpStatusCodes.CONFLICT)
      }
      console.error('Error creating client:', error)
      return c.json({ message: 'Failed to create client' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
    }
  },

  getById: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json(
        { message: 'only business owners can view clients' },
        HttpStatusCodes.UNAUTHORIZED
      )
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'clients', 'read'))) {
        return c.json(
          { message: 'You do not have permission to view this client' },
          HttpStatusCodes.FORBIDDEN
        )
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
      return c.json({ message: 'Failed to retrieve client' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
    }
  },

  update: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json(
        { message: 'only business owners can update clients' },
        HttpStatusCodes.UNAUTHORIZED
      )
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'clients', 'update'))) {
        return c.json(
          { message: 'You do not have permission to update clients' },
          HttpStatusCodes.FORBIDDEN
        )
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
      return c.json({ message: 'Failed to update client' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
    }
  },

  getMessageTemplate: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json(
        { message: 'only business owners can view client message templates' },
        HttpStatusCodes.UNAUTHORIZED
      )
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'clients', 'read'))) {
        return c.json(
          { message: 'You do not have permission to view client message templates' },
          HttpStatusCodes.FORBIDDEN
        )
      }
      const { clientId } = c.req.valid('param')
      const query = c.req.valid('query')
      const template = await getLatestClientMessageTemplate(clientId, query.status)
      return c.json(
        {
          message: 'Client message template retrieved successfully',
          success: true,
          data: template,
        },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof ClientNotFoundError) {
        return c.json({ message: 'Client not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error fetching client message template:', error)
      return c.json(
        { message: 'Failed to retrieve client message template' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  sendMessageTemplate: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json(
        { message: 'only business owners can send client message templates' },
        HttpStatusCodes.UNAUTHORIZED
      )
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'clients', 'read'))) {
        return c.json(
          { message: 'You do not have permission to send client message templates' },
          HttpStatusCodes.FORBIDDEN
        )
      }
      const { clientId } = c.req.valid('param')
      const body = await c.req.valid('json')
      const template = await getClientMessageTemplate(clientId, body.status, user.id)
      return c.json(
        { message: 'Client message sent successfully', success: true, data: template },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof ClientNotFoundError) {
        return c.json({ message: 'Client not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof ClientEmailRequiredError) {
        return c.json(
          { message: 'Client email is required to send this message' },
          HttpStatusCodes.BAD_REQUEST
        )
      }
      console.error('Error fetching client message template:', error)
      return c.json(
        { message: 'Failed to retrieve client message template' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  delete: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json(
        { message: 'only business owners can delete clients' },
        HttpStatusCodes.UNAUTHORIZED
      )
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'clients', 'delete'))) {
        return c.json(
          { message: 'You do not have permission to delete clients' },
          HttpStatusCodes.FORBIDDEN
        )
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
      return c.json({ message: 'Failed to delete client' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
    }
  },
  listCustomerReminders: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'clients', 'read'))) {
        return c.json(
          { message: 'You do not have permission to view client reminders' },
          HttpStatusCodes.FORBIDDEN
        )
      }
      const { clientId } = c.req.valid('param')
      const data = await listClientCustomerReminders(businessId, clientId)
      return c.json(
        { message: 'Customer reminders retrieved successfully', success: true, data },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof ClientNotFoundError) {
        return c.json({ message: 'Client not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error listing customer reminders:', error)
      return c.json(
        { message: 'Failed to retrieve customer reminders' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  createCustomerReminder: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'clients', 'update'))) {
        return c.json(
          { message: 'You do not have permission to create client reminders' },
          HttpStatusCodes.FORBIDDEN
        )
      }
      const { clientId } = c.req.valid('param')
      const body = await c.req.valid('json')

      const date = new Date(body.date)
      const [hours, minutes] =
        body.time
          .trim()
          .match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i)
          ?.slice(1) ?? []

      if (!hours || !minutes) {
        return c.json({ message: 'Invalid time format' }, HttpStatusCodes.BAD_REQUEST)
      }

      let h = Number.parseInt(hours, 10)
      const m = Number.parseInt(minutes, 10)
      const hasMeridiem = /AM|PM/i.test(body.time)
      if (hasMeridiem) {
        const isPm = /PM/i.test(body.time)
        if (h === 12) {
          h = isPm ? 12 : 0
        } else if (isPm) {
          h += 12
        }
      }
      date.setHours(h, m, 0, 0)

      const data = await createClientCustomerReminder(businessId, clientId, {
        dateTime: date,
        note: body.note ?? null,
      })
      return c.json(
        { message: 'Customer reminder saved successfully', success: true, data },
        HttpStatusCodes.CREATED
      )
    } catch (error) {
      if (error instanceof ClientNotFoundError) {
        return c.json({ message: 'Client not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error creating customer reminder:', error)
      return c.json(
        { message: 'Failed to create customer reminder' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },
}
