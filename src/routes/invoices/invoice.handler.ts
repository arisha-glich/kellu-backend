/**
 * Invoice API handlers – §6.1, §6.2.5, §7.
 * Permission checks: invoices read/create/update.
 */

import * as HttpStatusCodes from 'stoker/http-status-codes'
import type { INVOICE_ROUTES } from '~/routes/invoices/invoice.routes'
import { BusinessNotFoundError, getBusinessIdByUserId } from '~/services/business.service'
import {
  ClientNotFoundError,
  createInvoice,
  getInvoiceById,
  getInvoiceEmailComposeData,
  getInvoiceOverview,
  InvoiceNotFoundError,
  listInvoices,
  sendInvoice,
  sendInvoiceEmail,
} from '~/services/invoice.service'
import { createUserNotification, sendUserOperationEmail } from '~/services/notifications.service'
import { hasPermission } from '~/services/permission.service'
import type { HandlerMapFromRoutes } from '~/types'

export const INVOICE_HANDLER: HandlerMapFromRoutes<typeof INVOICE_ROUTES> = {
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
      if (!(await hasPermission(user.id, businessId, 'invoices', 'read'))) {
        return c.json(
          { message: 'You do not have permission to list invoices' },
          HttpStatusCodes.FORBIDDEN
        )
      }
      const query = c.req.valid('query')
      const page = query.page ? Number.parseInt(query.page, 10) : 1
      const limit = query.limit ? Number.parseInt(query.limit, 10) : 10
      const result = await listInvoices(businessId, {
        search: query.search,
        status: query.status,
        sortBy: query.sortBy,
        order: query.order,
        page,
        limit,
      })
      return c.json(
        { message: 'Invoices retrieved successfully', success: true, data: result },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error listing invoices:', error)
      return c.json(
        { message: 'Failed to retrieve invoices' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  overview: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'invoices', 'read'))) {
        return c.json(
          { message: 'You do not have permission to view invoice overview' },
          HttpStatusCodes.FORBIDDEN
        )
      }
      const overview = await getInvoiceOverview(businessId)
      return c.json(
        { message: 'Invoice overview retrieved successfully', success: true, data: overview },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error fetching invoice overview:', error)
      return c.json(
        { message: 'Failed to retrieve invoice overview' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  getById: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'invoices', 'read'))) {
        return c.json(
          { message: 'You do not have permission to view this invoice' },
          HttpStatusCodes.FORBIDDEN
        )
      }
      const { invoiceId } = c.req.valid('param')
      const invoice = await getInvoiceById(businessId, invoiceId)
      return c.json(
        { message: 'Invoice retrieved successfully', success: true, data: invoice },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof InvoiceNotFoundError) {
        return c.json({ message: 'Invoice not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error fetching invoice:', error)
      return c.json(
        { message: 'Failed to retrieve invoice' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  create: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'invoices', 'create'))) {
        return c.json(
          { message: 'You do not have permission to create invoices' },
          HttpStatusCodes.FORBIDDEN
        )
      }
      const body = await c.req.valid('json')
      const invoice = await createInvoice(businessId, {
        title: body.title,
        clientId: body.clientId,
        address: body.address,
        assignedToId: body.assignedToId,
        workOrderId: body.workOrderId,
        lineItems: body.lineItems,
      })
      try {
        await createUserNotification({
          userId: user.id,
          type: 'INVOICE_CREATED',
          title: `You created an invoice - ${invoice.total != null ? `$${Number(invoice.total).toFixed(2)}` : ''}`,
          message: `${invoice.invoiceNumber ?? 'Invoice'} - ${invoice.title}`,
          metadata: {
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            title: invoice.title,
            total: invoice.total != null ? Number(invoice.total) : null,
          },
        })
        await sendUserOperationEmail({
          to: user.email,
          userName: user.name,
          actionTitle: 'Invoice created successfully',
          actionMessage: `Your invoice "${invoice.title}" was created successfully.`,
        })
      } catch (notifyError) {
        console.error('Invoice create notification/email failed:', notifyError)
      }
      return c.json(
        { message: 'Invoice created successfully', success: true, data: invoice },
        HttpStatusCodes.CREATED
      )
    } catch (error) {
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof ClientNotFoundError) {
        return c.json({ message: 'Client not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error creating invoice:', error)
      return c.json({ message: 'Failed to create invoice' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
    }
  },

  sendInvoice: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'invoices', 'update'))) {
        return c.json(
          { message: 'You do not have permission to send invoices' },
          HttpStatusCodes.FORBIDDEN
        )
      }
      const { invoiceId } = c.req.valid('param')
      const invoice = await sendInvoice(businessId, invoiceId)
      try {
        await createUserNotification({
          userId: user.id,
          type: 'INVOICE_SENT',
          title: `You sent an invoice - ${invoice.total != null ? `$${Number(invoice.total).toFixed(2)}` : ''}`,
          message: `${invoice.invoiceNumber ?? 'Invoice'} - ${invoice.title}`,
          metadata: {
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            title: invoice.title,
            total: invoice.total != null ? Number(invoice.total) : null,
            sentAt: invoice.sentAt ?? null,
          },
        })
        await sendUserOperationEmail({
          to: user.email,
          userName: user.name,
          actionTitle: 'Invoice sent successfully',
          actionMessage: `Your invoice "${invoice.title}" was sent successfully.`,
        })
      } catch (notifyError) {
        console.error('Invoice send notification/email failed:', notifyError)
      }
      return c.json(
        { message: 'Invoice sent successfully', success: true, data: invoice },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof InvoiceNotFoundError) {
        return c.json({ message: 'Invoice not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof Error && error.message.includes('already sent')) {
        return c.json({ message: error.message }, HttpStatusCodes.BAD_REQUEST)
      }
      console.error('Error sending invoice:', error)
      return c.json({ message: 'Failed to send invoice' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
    }
  },

  getEmailCompose: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'invoices', 'read'))) {
        return c.json(
          { message: 'You do not have permission to view invoice email compose data' },
          HttpStatusCodes.FORBIDDEN
        )
      }
      const { invoiceId } = c.req.valid('param')
      const data = await getInvoiceEmailComposeData(businessId, invoiceId)
      return c.json(
        { message: 'Invoice email compose data retrieved successfully', success: true, data },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof InvoiceNotFoundError) {
        return c.json({ message: 'Invoice not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error fetching invoice email compose:', error)
      return c.json(
        { message: 'Failed to retrieve invoice email compose data' },
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
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'invoices', 'update'))) {
        return c.json(
          { message: 'You do not have permission to send invoice emails' },
          HttpStatusCodes.FORBIDDEN
        )
      }
      const { invoiceId } = c.req.valid('param')
      const body = await c.req.valid('json')
      const invoice = await sendInvoiceEmail(businessId, invoiceId, {
        from: body.from ?? undefined,
        replyTo: body.replyTo ?? undefined,
        subject: body.subject ?? undefined,
        message: body.message ?? undefined,
        to: body.to ?? undefined,
        sendMeCopy: body.sendMeCopy ?? false,
        selectedAttachmentIds: body.selectedAttachmentIds ?? [],
        additionalAttachments: body.additionalAttachments ?? [],
        requesterEmail: user.email,
        markInvoiceSent: body.markInvoiceSent ?? true,
      })
      return c.json(
        { message: 'Invoice email sent successfully', success: true, data: invoice },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof InvoiceNotFoundError) {
        return c.json({ message: 'Invoice not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof Error && error.message.includes('no email')) {
        return c.json(
          {
            message: 'Client has no email address. Add an email to the client to send the invoice.',
          },
          HttpStatusCodes.BAD_REQUEST
        )
      }
      if (error instanceof Error && error.message === 'ATTACHMENTS_TOO_LARGE') {
        return c.json(
          { message: 'Total attachments exceed 10 MB limit' },
          HttpStatusCodes.BAD_REQUEST
        )
      }
      if (error instanceof Error && error.message === 'ATTACHMENT_FETCH_FAILED') {
        return c.json(
          { message: 'Failed to download one or more attachment files' },
          HttpStatusCodes.BAD_REQUEST
        )
      }
      console.error('Error sending invoice email:', error)
      return c.json(
        { message: 'Failed to send invoice email' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },
}
