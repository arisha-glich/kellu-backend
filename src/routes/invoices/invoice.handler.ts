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
      const parseBoolean = (value: string | undefined) =>
        Boolean(value && ['true', '1', 'yes', 'on'].includes(value.toLowerCase()))
      const parseSelectedAttachmentIds = (raw: string | undefined) => {
        if (!raw) {
          return [] as string[]
        }
        try {
          const parsed = JSON.parse(raw)
          if (Array.isArray(parsed)) {
            return parsed.filter(
              item => typeof item === 'string' && item.trim().length > 0
            ) as string[]
          }
        } catch {
          // Fallback to comma separated input.
        }
        return raw
          .split(',')
          .map(item => item.trim())
          .filter(Boolean)
      }

      const contentType = c.req.header('content-type') ?? ''
      let from: string | undefined
      let replyTo: string | undefined
      let subject: string | undefined
      let message: string | undefined
      let to: string | undefined
      let sendMeCopy = false
      let markInvoiceSent = true
      let selectedAttachmentIds: string[] = []
      let additionalAttachments: Array<{
        filename: string
        content: Buffer
        contentType?: string | null
      }> = []

      if (contentType.includes('multipart/form-data')) {
        let formData: FormData
        try {
          formData = await c.req.raw.formData()
        } catch {
          return c.json(
            {
              message:
                'Invalid multipart body. Ensure Content-Type is multipart/form-data with a valid boundary.',
            },
            HttpStatusCodes.BAD_REQUEST
          )
        }
        const getOptionalString = (key: string) => {
          const value = formData.get(key)
          if (typeof value !== 'string') {
            return undefined
          }
          const trimmed = value.trim()
          return trimmed.length > 0 ? trimmed : undefined
        }
        from = getOptionalString('from')
        replyTo = getOptionalString('replyTo')
        subject = getOptionalString('subject')
        message = getOptionalString('message')
        to = getOptionalString('to')
        sendMeCopy = parseBoolean(getOptionalString('sendMeCopy'))
        markInvoiceSent = !(
          getOptionalString('markInvoiceSent') &&
          ['false', '0', 'no', 'off'].includes((getOptionalString('markInvoiceSent') ?? '').toLowerCase())
        )
        selectedAttachmentIds = parseSelectedAttachmentIds(getOptionalString('selectedAttachmentIds'))
        const binaryFiles = [
          ...formData.getAll('additionalAttachments'),
          ...formData.getAll('attachments'),
        ].filter((item): item is File => item instanceof File)
        additionalAttachments = await Promise.all(
          binaryFiles.map(async file => ({
            filename: file.name || 'attachment',
            content: Buffer.from(await file.arrayBuffer()),
            contentType: file.type || null,
          }))
        )
      } else {
        const body = await c.req.json().catch(() => ({} as Record<string, unknown>))
        const readOptionalString = (value: unknown) =>
          typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
        from = readOptionalString(body.from)
        replyTo = readOptionalString(body.replyTo)
        subject = readOptionalString(body.subject)
        message = readOptionalString(body.message)
        to = readOptionalString(body.to)
        sendMeCopy = parseBoolean(readOptionalString(body.sendMeCopy))
        const markRaw = readOptionalString(body.markInvoiceSent)
        markInvoiceSent = !(markRaw && ['false', '0', 'no', 'off'].includes(markRaw.toLowerCase()))
        selectedAttachmentIds = parseSelectedAttachmentIds(readOptionalString(body.selectedAttachmentIds))
        const rawAdditional: unknown[] = Array.isArray(body.additionalAttachments)
          ? body.additionalAttachments
          : []
        const parsedAdditional: Array<{
          filename: string
          content: Buffer
          contentType?: string | null
        }> = []
        for (const item of rawAdditional) {
          if (typeof item !== 'object' || item === null) {
            continue
          }
          const attachment = item as {
            filename?: unknown
            contentBase64?: unknown
            contentType?: unknown
          }
          if (
            typeof attachment.filename !== 'string' ||
            typeof attachment.contentBase64 !== 'string'
          ) {
            continue
          }
          parsedAdditional.push({
            filename: attachment.filename,
            content: Buffer.from(attachment.contentBase64, 'base64'),
            contentType: typeof attachment.contentType === 'string' ? attachment.contentType : null,
          })
        }
        additionalAttachments = parsedAdditional
      }

      const invoice = await sendInvoiceEmail(businessId, invoiceId, {
        from,
        replyTo,
        subject,
        message,
        to,
        sendMeCopy,
        selectedAttachmentIds,
        additionalAttachments,
        requesterEmail: user.email,
        markInvoiceSent,
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
