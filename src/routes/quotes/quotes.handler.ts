import * as HttpStatusCodes from 'stoker/http-status-codes'
import type { QUOTE_ROUTES } from '~/routes/quotes/quotes.routes'
import { getBusinessIdByUserId, BusinessNotFoundError } from '~/services/business.service'
import { hasPermission } from '~/services/permission.service'
import { WorkOrderNotFoundError, ClientNotFoundError } from '~/services/workorder.service'
import {
  listQuotes,
  createQuote,
  getQuote,
  updateQuote,
  deleteQuote,
  setQuoteAwaitingResponse,
  sendQuote,
  sendQuoteEmail,
  approveQuote,
  rejectQuote,
  getQuoteOverview,
  QuoteNoLineItemsError,
  QuoteTerminalStateError,
} from '~/services/quotes.service'
import type { HandlerMapFromRoutes } from '~/types'

export const QUOTE_HANDLER: HandlerMapFromRoutes<typeof QUOTE_ROUTES> = {
  list: async (c) => {
    const user = c.get('user')
    if (!user) return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId)
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      if (!(await hasPermission(user.id, businessId, 'quotes', 'read')))
        return c.json({ message: 'Forbidden' }, HttpStatusCodes.FORBIDDEN)

      const query = c.req.valid('query')
      const page = query.page ? Number.parseInt(query.page, 10) : 1
      const limit = query.limit ? Number.parseInt(query.limit, 10) : 10

      const result = await listQuotes(businessId, {
        search: query.search,
        quoteStatus: query.quoteStatus,
        sortBy: query.sortBy,
        order: query.order,
        page,
        limit,
      })
      return c.json(
        { message: 'Quotes retrieved successfully', success: true, data: result },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof BusinessNotFoundError)
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      console.error('Error listing quotes:', error)
      return c.json({ message: 'Failed to retrieve quotes' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
    }
  },

  overview: async (c) => {
    const user = c.get('user')
    if (!user) return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId)
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)

      const overview = await getQuoteOverview(businessId)
      return c.json(
        { message: 'Overview retrieved successfully', success: true, data: overview },
        HttpStatusCodes.OK
      )
    } catch (error) {
      console.error('Error fetching quote overview:', error)
      return c.json({ message: 'Failed to retrieve overview' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
    }
  },

  getById: async (c) => {
    const user = c.get('user')
    if (!user) return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId)
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      if (!(await hasPermission(user.id, businessId, 'quotes', 'read')))
        return c.json({ message: 'Forbidden' }, HttpStatusCodes.FORBIDDEN)

      const { quoteId } = c.req.valid('param')
      const quote = await getQuote(businessId, quoteId)
      return c.json(
        { message: 'Quote retrieved successfully', success: true, data: quote },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof WorkOrderNotFoundError)
        return c.json({ message: 'Quote not found' }, HttpStatusCodes.NOT_FOUND)
      console.error('Error fetching quote:', error)
      return c.json({ message: 'Failed to retrieve quote' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
    }
  },

  create: async (c) => {
    const user = c.get('user')
    if (!user) return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId)
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      if (!(await hasPermission(user.id, businessId, 'quotes', 'create')))
        return c.json({ message: 'Forbidden' }, HttpStatusCodes.FORBIDDEN)

      const body = c.req.valid('json')
      const quote = await createQuote(businessId, {
        title: body.title,
        clientId: body.clientId,
        address: body.address,
        assignedToId: body.assignedToId,
        instructions: body.instructions,
        notes: body.notes,
        quoteTermsConditions: body.quoteTermsConditions,
        lineItems: body.lineItems,
      })
      return c.json(
        { message: 'Quote created successfully', success: true, data: quote },
        HttpStatusCodes.CREATED
      )
    } catch (error) {
      if (error instanceof BusinessNotFoundError)
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      if (error instanceof ClientNotFoundError)
        return c.json({ message: 'Client not found' }, HttpStatusCodes.NOT_FOUND)
      console.error('Error creating quote:', error)
      return c.json({ message: 'Failed to create quote' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
    }
  },

  update: async (c) => {
    const user = c.get('user')
    if (!user) return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId)
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      if (!(await hasPermission(user.id, businessId, 'quotes', 'update')))
        return c.json({ message: 'Forbidden' }, HttpStatusCodes.FORBIDDEN)

      const { quoteId } = c.req.valid('param')
      const body = c.req.valid('json')
      const quote = await updateQuote(businessId, quoteId, {
        ...(body.title != null && { title: body.title }),
        ...(body.clientId != null && { clientId: body.clientId }),
        ...(body.address != null && { address: body.address }),
        ...(body.isScheduleLater !== undefined && { isScheduleLater: body.isScheduleLater }),
        ...(body.scheduledAt !== undefined && { scheduledAt: body.scheduledAt ?? null }),
        ...(body.startTime !== undefined && { startTime: body.startTime ?? null }),
        ...(body.endTime !== undefined && { endTime: body.endTime ?? null }),
        ...(body.assignedToId !== undefined && { assignedToId: body.assignedToId ?? null }),
        ...(body.instructions !== undefined && { instructions: body.instructions ?? null }),
        ...(body.notes !== undefined && { notes: body.notes ?? null }),
        ...(body.quoteTermsConditions !== undefined && {
          quoteTermsConditions: body.quoteTermsConditions ?? null,
        }),
        ...(body.discount !== undefined && { discount: body.discount }),
        ...(body.discountType !== undefined && { discountType: body.discountType ?? null }),
        ...(body.lineItems !== undefined && { lineItems: body.lineItems }),
      })
      return c.json(
        { message: 'Quote updated successfully', success: true, data: quote },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof WorkOrderNotFoundError)
        return c.json({ message: 'Quote not found' }, HttpStatusCodes.NOT_FOUND)
      console.error('Error updating quote:', error)
      return c.json({ message: 'Failed to update quote' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
    }
  },

  delete: async (c) => {
    const user = c.get('user')
    if (!user) return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId)
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      if (!(await hasPermission(user.id, businessId, 'quotes', 'update')))
        return c.json({ message: 'Forbidden' }, HttpStatusCodes.FORBIDDEN)

      const { quoteId } = c.req.valid('param')
      await deleteQuote(businessId, quoteId)
      return c.json(
        { message: 'Quote deleted successfully', success: true as const },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof WorkOrderNotFoundError)
        return c.json({ message: 'Quote not found' }, HttpStatusCodes.NOT_FOUND)
      console.error('Error deleting quote:', error)
      return c.json({ message: 'Failed to delete quote' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
    }
  },

  setAwaitingResponse: async (c) => {
    const user = c.get('user')
    if (!user) return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId)
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      if (!(await hasPermission(user.id, businessId, 'quotes', 'update')))
        return c.json({ message: 'Forbidden' }, HttpStatusCodes.FORBIDDEN)

      const { quoteId } = c.req.valid('param')
      const quote = await setQuoteAwaitingResponse(businessId, quoteId)
      return c.json(
        { message: 'Quote set to awaiting response', success: true, data: quote },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof WorkOrderNotFoundError)
        return c.json({ message: 'Quote not found' }, HttpStatusCodes.NOT_FOUND)
      if (error instanceof QuoteTerminalStateError)
        return c.json(
          { message: 'Quote must be in NOT_SENT status to set awaiting response' },
          HttpStatusCodes.BAD_REQUEST
        )
      console.error('Error setting quote awaiting response:', error)
      return c.json(
        { message: 'Failed to set quote awaiting response' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  send: async (c) => {
    const user = c.get('user')
    if (!user) return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId)
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      if (!(await hasPermission(user.id, businessId, 'quotes', 'update')))
        return c.json({ message: 'Forbidden' }, HttpStatusCodes.FORBIDDEN)

      const { quoteId } = c.req.valid('param')
      const body = c.req.valid('json')
      const quote = await sendQuote(businessId, quoteId, {
        observations: body.observations ?? undefined,
      })
      return c.json(
        { message: 'Quote sent successfully', success: true, data: quote },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof WorkOrderNotFoundError)
        return c.json({ message: 'Quote not found' }, HttpStatusCodes.NOT_FOUND)
      if (error instanceof QuoteNoLineItemsError)
        return c.json(
          { message: 'Cannot send quote with no line items' },
          HttpStatusCodes.BAD_REQUEST
        )
      if (error instanceof QuoteTerminalStateError)
        return c.json(
          { message: 'Quote is in a terminal state and cannot be modified' },
          HttpStatusCodes.BAD_REQUEST
        )
      console.error('Error sending quote:', error)
      return c.json({ message: 'Failed to send quote' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
    }
  },

  sendEmail: async (c) => {
    const user = c.get('user')
    if (!user) return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId)
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      if (!(await hasPermission(user.id, businessId, 'quotes', 'update')))
        return c.json({ message: 'Forbidden' }, HttpStatusCodes.FORBIDDEN)

      const { quoteId } = c.req.valid('param')
      let body: { subject?: string; message?: string; to?: string } = {}
      try {
        const raw = await c.req.json()
        if (raw && typeof raw === 'object') body = raw as { subject?: string; message?: string; to?: string }
      } catch {
        // No body
      }

      const quote = await sendQuoteEmail(businessId, quoteId, {
        subject: body.subject ?? undefined,
        message: body.message ?? undefined,
        to: body.to ?? undefined,
      })
      return c.json(
        { message: 'Quote email sent successfully', success: true, data: quote },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof WorkOrderNotFoundError)
        return c.json({ message: 'Quote not found' }, HttpStatusCodes.NOT_FOUND)
      if (error instanceof Error && error.message.includes('no email'))
        return c.json(
          { message: 'Client has no email address. Add an email to the client to send the quote.' },
          HttpStatusCodes.BAD_REQUEST
        )
      console.error('Error sending quote email:', error)
      return c.json({ message: 'Failed to send quote email' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
    }
  },

  approve: async (c) => {
    const user = c.get('user')
    if (!user) return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId)
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)

      const { quoteId } = c.req.valid('param')
      const quote = await approveQuote(businessId, quoteId)
      return c.json(
        { message: 'Quote approved successfully', success: true, data: quote },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof WorkOrderNotFoundError)
        return c.json({ message: 'Quote not found' }, HttpStatusCodes.NOT_FOUND)
      if (error instanceof QuoteTerminalStateError)
        return c.json({ message: 'Quote is in a terminal state' }, HttpStatusCodes.BAD_REQUEST)
      console.error('Error approving quote:', error)
      return c.json({ message: 'Failed to approve quote' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
    }
  },

  reject: async (c) => {
    const user = c.get('user')
    if (!user) return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId)
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)

      const { quoteId } = c.req.valid('param')
      const quote = await rejectQuote(businessId, quoteId)
      return c.json(
        { message: 'Quote rejected successfully', success: true, data: quote },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof WorkOrderNotFoundError)
        return c.json({ message: 'Quote not found' }, HttpStatusCodes.NOT_FOUND)
      if (error instanceof QuoteTerminalStateError)
        return c.json({ message: 'Quote is in a terminal state' }, HttpStatusCodes.BAD_REQUEST)
      console.error('Error rejecting quote:', error)
      return c.json({ message: 'Failed to reject quote' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
    }
  },
}