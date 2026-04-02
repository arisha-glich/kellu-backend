import { env } from 'node:process'
import * as HttpStatusCodes from 'stoker/http-status-codes'
import type { QUOTE_ROUTES } from '~/routes/quotes/quotes.routes'
import { BusinessNotFoundError, getBusinessIdByUserId } from '~/services/business.service'
import { createUserNotification, sendUserOperationEmail } from '~/services/notifications.service'
import { hasPermission } from '~/services/permission.service'
import {
  approveQuote,
  clientApproveQuoteByToken,
  clientRejectQuoteByToken,
  createQuote,
  deleteQuote,
  getQuote,
  getQuoteEmailComposeData,
  getQuoteOverview,
  listQuotes,
  QuoteNoLineItemsError,
  QuoteTerminalStateError,
  rejectQuote,
  sendQuote,
  sendQuoteEmail,
  setQuoteAwaitingResponse,
  updateQuote,
} from '~/services/quotes.service'
import { ClientNotFoundError, WorkOrderNotFoundError } from '~/services/workorder.service'
import type { HandlerMapFromRoutes } from '~/types'

export const QUOTE_HANDLER: HandlerMapFromRoutes<typeof QUOTE_ROUTES> = {
  list: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'quotes', 'read'))) {
        return c.json({ message: 'Forbidden' }, HttpStatusCodes.FORBIDDEN)
      }

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
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error listing quotes:', error)
      return c.json({ message: 'Failed to retrieve quotes' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
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
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }

      const overview = await getQuoteOverview(businessId)
      return c.json(
        { message: 'Overview retrieved successfully', success: true, data: overview },
        HttpStatusCodes.OK
      )
    } catch (error) {
      console.error('Error fetching quote overview:', error)
      return c.json(
        { message: 'Failed to retrieve overview' },
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
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'quotes', 'read'))) {
        return c.json({ message: 'Forbidden' }, HttpStatusCodes.FORBIDDEN)
      }

      const { quoteId } = c.req.valid('param')
      const quote = await getQuote(businessId, quoteId)
      return c.json(
        { message: 'Quote retrieved successfully', success: true, data: quote },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof WorkOrderNotFoundError) {
        return c.json({ message: 'Quote not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error fetching quote:', error)
      return c.json({ message: 'Failed to retrieve quote' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
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
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'quotes', 'create'))) {
        return c.json({ message: 'Forbidden' }, HttpStatusCodes.FORBIDDEN)
      }

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
      try {
        await sendQuoteEmail(businessId, quote.id, {
          requesterEmail: user.email,
        })
      } catch (emailError) {
        console.error('Quote auto-email on create failed:', emailError)
      }
      try {
        await createUserNotification({
          userId: user.id,
          type: 'QUOTE_CREATED',
          title: `You created a quote - ${quote.total != null ? `$${Number(quote.total).toFixed(2)}` : ''}`,
          message: `${quote.workOrderNumber ?? 'Quote'} - ${quote.title}`,
          metadata: {
            quoteId: quote.id,
            quoteNumber: quote.workOrderNumber,
            title: quote.title,
            total: quote.total != null ? Number(quote.total) : null,
          },
        })
        await sendUserOperationEmail({
          to: user.email,
          userName: user.name,
          actionTitle: 'Quote created successfully',
          actionMessage: `Your quote "${quote.title}" was created successfully.`,
        })
      } catch (notifyError) {
        console.error('Quote create notification/email failed:', notifyError)
      }
      return c.json(
        { message: 'Quote created successfully', success: true, data: quote },
        HttpStatusCodes.CREATED
      )
    } catch (error) {
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof ClientNotFoundError) {
        return c.json({ message: 'Client not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error creating quote:', error)
      return c.json({ message: 'Failed to create quote' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
    }
  },

  update: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'quotes', 'update'))) {
        return c.json({ message: 'Forbidden' }, HttpStatusCodes.FORBIDDEN)
      }

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
      if (error instanceof WorkOrderNotFoundError) {
        return c.json({ message: 'Quote not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error updating quote:', error)
      return c.json({ message: 'Failed to update quote' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
    }
  },

  delete: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'quotes', 'update'))) {
        return c.json({ message: 'Forbidden' }, HttpStatusCodes.FORBIDDEN)
      }

      const { quoteId } = c.req.valid('param')
      await deleteQuote(businessId, quoteId)
      return c.json(
        { message: 'Quote deleted successfully', success: true as const },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof WorkOrderNotFoundError) {
        return c.json({ message: 'Quote not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error deleting quote:', error)
      return c.json({ message: 'Failed to delete quote' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
    }
  },

  setAwaitingResponse: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'quotes', 'update'))) {
        return c.json({ message: 'Forbidden' }, HttpStatusCodes.FORBIDDEN)
      }

      const { quoteId } = c.req.valid('param')
      const quote = await setQuoteAwaitingResponse(businessId, quoteId)
      return c.json(
        { message: 'Quote set to awaiting response', success: true, data: quote },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof WorkOrderNotFoundError) {
        return c.json({ message: 'Quote not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof QuoteTerminalStateError) {
        return c.json(
          { message: 'Quote must be in NOT_SENT status to set awaiting response' },
          HttpStatusCodes.BAD_REQUEST
        )
      }
      console.error('Error setting quote awaiting response:', error)
      return c.json(
        { message: 'Failed to set quote awaiting response' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  send: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'quotes', 'update'))) {
        return c.json({ message: 'Forbidden' }, HttpStatusCodes.FORBIDDEN)
      }

      const { quoteId } = c.req.valid('param')
      const body = c.req.valid('json')
      const quote = await sendQuote(businessId, quoteId, {
        observations: body.observations ?? undefined,
      })
      try {
        await createUserNotification({
          userId: user.id,
          type: 'QUOTE_SENT',
          title: `You sent a quote - ${quote.total != null ? `$${Number(quote.total).toFixed(2)}` : ''}`,
          message: `${quote.workOrderNumber ?? 'Quote'} - ${quote.title}`,
          metadata: {
            quoteId: quote.id,
            quoteNumber: quote.workOrderNumber,
            title: quote.title,
            total: quote.total != null ? Number(quote.total) : null,
            sentAt: quote.quoteSentAt ?? null,
          },
        })
        await sendUserOperationEmail({
          to: user.email,
          userName: user.name,
          actionTitle: 'Quote sent successfully',
          actionMessage: `Your quote "${quote.title}" was sent successfully.`,
        })
      } catch (notifyError) {
        console.error('Quote send notification/email failed:', notifyError)
      }
      return c.json(
        { message: 'Quote sent successfully', success: true, data: quote },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof WorkOrderNotFoundError) {
        return c.json({ message: 'Quote not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof QuoteNoLineItemsError) {
        return c.json(
          { message: 'Cannot send quote with no line items' },
          HttpStatusCodes.BAD_REQUEST
        )
      }
      if (error instanceof QuoteTerminalStateError) {
        return c.json(
          { message: 'Quote is in a terminal state and cannot be modified' },
          HttpStatusCodes.BAD_REQUEST
        )
      }
      console.error('Error sending quote:', error)
      return c.json({ message: 'Failed to send quote' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
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
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'quotes', 'update'))) {
        return c.json({ message: 'Forbidden' }, HttpStatusCodes.FORBIDDEN)
      }

      const { quoteId } = c.req.valid('param')
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
      let sendViaWhatsapp = false
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
        sendViaWhatsapp = parseBoolean(getOptionalString('sendViaWhatsapp'))
        selectedAttachmentIds = parseSelectedAttachmentIds(
          getOptionalString('selectedAttachmentIds')
        )
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
        const body = await c.req.json().catch(() => ({}) as Record<string, unknown>)
        const readOptionalString = (value: unknown) =>
          typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
        from = readOptionalString(body.from)
        replyTo = readOptionalString(body.replyTo)
        subject = readOptionalString(body.subject)
        message = readOptionalString(body.message)
        to = readOptionalString(body.to)
        sendMeCopy = parseBoolean(readOptionalString(body.sendMeCopy))
        sendViaWhatsapp = parseBoolean(readOptionalString(body.sendViaWhatsapp))
        selectedAttachmentIds = parseSelectedAttachmentIds(
          readOptionalString(body.selectedAttachmentIds)
        )
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

      const quote = await sendQuoteEmail(businessId, quoteId, {
        from,
        replyTo,
        subject,
        message,
        to,
        sendMeCopy,
        sendViaWhatsapp,
        selectedAttachmentIds,
        additionalAttachments,
        requesterEmail: user.email,
      })
      return c.json(
        { message: 'Quote email sent successfully', success: true, data: quote },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof WorkOrderNotFoundError) {
        return c.json({ message: 'Quote not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof Error && error.message.includes('no email')) {
        return c.json(
          { message: 'Client has no email address. Add an email to the client to send the quote.' },
          HttpStatusCodes.BAD_REQUEST
        )
      }
      console.error('Error sending quote email:', error)
      return c.json(
        { message: 'Failed to send quote email' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
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
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'quotes', 'read'))) {
        return c.json({ message: 'Forbidden' }, HttpStatusCodes.FORBIDDEN)
      }
      const { quoteId } = c.req.valid('param')
      const data = await getQuoteEmailComposeData(businessId, quoteId)
      return c.json(
        { message: 'Quote email compose data retrieved successfully', success: true, data },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof WorkOrderNotFoundError) {
        return c.json({ message: 'Quote not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error fetching quote email compose data:', error)
      return c.json(
        { message: 'Failed to fetch quote email compose data' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  approve: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }

      const { quoteId } = c.req.valid('param')
      const quote = await approveQuote(businessId, quoteId)
      return c.json(
        { message: 'Quote approved successfully', success: true, data: quote },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof WorkOrderNotFoundError) {
        return c.json({ message: 'Quote not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof QuoteTerminalStateError) {
        return c.json({ message: 'Quote is in a terminal state' }, HttpStatusCodes.BAD_REQUEST)
      }
      console.error('Error approving quote:', error)
      return c.json({ message: 'Failed to approve quote' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
    }
  },

  reject: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }

      const { quoteId } = c.req.valid('param')
      const quote = await rejectQuote(businessId, quoteId)
      return c.json(
        { message: 'Quote rejected successfully', success: true, data: quote },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof WorkOrderNotFoundError) {
        return c.json({ message: 'Quote not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof QuoteTerminalStateError) {
        return c.json({ message: 'Quote is in a terminal state' }, HttpStatusCodes.BAD_REQUEST)
      }
      console.error('Error rejecting quote:', error)
      return c.json({ message: 'Failed to reject quote' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
    }
  },
  clientRespondGet: async c => {
    const { action, token } = c.req.valid('query')
    const frontendDefault = (Bun.env.FRONTEND_URL ?? 'http://localhost:3000').replace(/\/$/, '')
    const approvedBase =
      Bun.env.QUOTE_CLIENT_APPROVE_REDIRECT_URL?.trim() ||
      `${frontendDefault}/quotes/accept-quote`
    const rejectedBase =
      Bun.env.QUOTE_CLIENT_REJECT_REDIRECT_URL?.trim() ||
      `${frontendDefault}/quotes/reject-quote`

    /** Frontend uses dynamic segments e.g. `/quotes/accept-quote/[quoteId]` — append id to env base. */
    const quoteClientPageUrl = (
      basePath: string,
      quoteId: string | undefined,
      params: Record<string, string>
    ) => {
      const base = basePath.replace(/\/$/, '')
      const path = quoteId ? `${base}/${quoteId}` : base
      const url = new URL(path)
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value)
      }
      return url.toString()
    }

    if (action === 'approve') {
      try {
        const quote = await clientApproveQuoteByToken(token)
        return c.redirect(
          quoteClientPageUrl(approvedBase, quote.id, {
            quoteAction: 'approved',
            clientId: quote.clientId,
          })
        )
      } catch (error) {
        if (error instanceof QuoteTerminalStateError) {
          return c.redirect(
            quoteClientPageUrl(rejectedBase, undefined, { quoteAction: 'already-responded' })
          )
        }
        if (error instanceof WorkOrderNotFoundError) {
          return c.redirect(
            quoteClientPageUrl(approvedBase, undefined, { quoteAction: 'not-found' })
          )
        }
        console.error('Error approving quote by client token:', error)
        return c.redirect(quoteClientPageUrl(approvedBase, undefined, { quoteAction: 'error' }))
      }
    }

    const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Reject Quote</title>
    <style>
      body { font-family: Arial, sans-serif; background: #f8fafc; padding: 24px; color: #111827; }
      .card { max-width: 560px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 24px; }
      h1 { margin-top: 0; }
      textarea { width: 100%; min-height: 120px; padding: 10px; border: 1px solid #d1d5db; border-radius: 8px; }
      button { margin-top: 12px; background: #ef4444; color: #fff; border: 0; border-radius: 8px; padding: 10px 16px; cursor: pointer; }
      .note { color: #6b7280; font-size: 13px; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Reject Quote</h1>
      <p>Please tell us why you are rejecting this quote.</p>
      <form id="rejectForm">
        <textarea id="reason" name="reason" placeholder="Enter rejection reason..." required minlength="3"></textarea>
        <button type="submit">Submit rejection</button>
      </form>
      <p class="note">This reason will be shared with the business team.</p>
      <div id="result"></div>
    </div>
    <script>
      const form = document.getElementById('rejectForm');
      const result = document.getElementById('result');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const reason = document.getElementById('reason').value;
        const res = await fetch('/api/quotes/client/respond/reject', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: ${JSON.stringify(token)}, reason }),
        });
        if (res.ok) {
          const data = await res.json();
          const qid = data?.data?.quoteId ?? '';
          const cid = data?.data?.clientId ?? '';
          const base = ${JSON.stringify(rejectedBase.replace(/\/$/, ''))};
          const path = qid ? base + '/' + qid : base;
          const redirectUrl = new URL(path);
          redirectUrl.searchParams.set('quoteAction', 'rejected');
          if (cid) redirectUrl.searchParams.set('clientId', cid);
          window.location.href = redirectUrl.toString();
        } else {
          result.innerHTML = '<p style="color:#b91c1c;"><strong>Could not submit rejection. Please try again.</strong></p>';
        }
      });
    </script>
  </body>
</html>`
    return c.html(html, HttpStatusCodes.OK)
  },
  clientRespondPost: async c => {
    try {
      const { token, reason } = c.req.valid('json')
      const quote = await clientRejectQuoteByToken(token, reason)
      return c.json(
        {
          message: 'Quote rejected successfully',
          success: true,
          data: {
            quoteId: quote.id,
            clientId: quote.clientId,
            quoteCorrelative: quote.quoteCorrelative ?? null,
            status: 'REJECTED' as const,
          },
        },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof WorkOrderNotFoundError) {
        return c.json({ message: 'Quote not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof QuoteTerminalStateError) {
        return c.json({ message: 'Quote is in a terminal state' }, HttpStatusCodes.BAD_REQUEST)
      }
      console.error('Error rejecting quote by client token:', error)
      return c.json({ message: 'Failed to reject quote' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
    }
  },
}
