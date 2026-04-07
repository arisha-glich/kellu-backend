/**
 * Invoice module – uses the Invoice model (prisma/schema.prisma).
 * Invoice is a separate entity with client, lineItems (LineItem.invoiceId), payments (Payment.invoiceId).
 * Optional workOrderId links invoice to a work order.
 */

import type { InvoiceStatus } from '~/generated/prisma'
import { Prisma } from '~/generated/prisma'
import prisma from '~/lib/prisma'
import { BusinessNotFoundError } from '~/services/business.service'
import { emailService } from '~/services/email.service'
import {
  clientToCustomerFrom,
  sendInvoiceAssignedToTeamMemberEmail,
  sendInvoiceCreatedClientEmail,
} from '~/services/email-helpers'

export class InvoiceNotFoundError extends Error {
  constructor() {
    super('INVOICE_NOT_FOUND')
  }
}

export class ClientNotFoundError extends Error {
  constructor() {
    super('CLIENT_NOT_FOUND')
  }
}

function toNum(d: unknown): number {
  if (d == null) {
    return 0
  }
  if (typeof d === 'number' && !Number.isNaN(d)) {
    return d
  }
  if (typeof d === 'string') {
    return Number.parseFloat(d) || 0
  }
  if (typeof d === 'object' && d !== null && 'toNumber' in d) {
    return (d as { toNumber: () => number }).toNumber()
  }
  return 0
}

/** Effective display status: OVERDUE when due passed and balance > 0 and status is AWAITING_PAYMENT. */
function effectiveInvoiceStatus(
  status: InvoiceStatus,
  dueAt: Date | null,
  balance: unknown
): InvoiceStatus {
  if (status !== 'AWAITING_PAYMENT' || !dueAt || toNum(balance) <= 0) {
    return status
  }
  return new Date() > dueAt ? 'OVERDUE' : status
}

async function ensureBusinessExists(businessId: string): Promise<void> {
  const b = await prisma.business.findUnique({ where: { id: businessId }, select: { id: true } })
  if (!b) {
    throw new BusinessNotFoundError()
  }
}

/** Generate next invoice number per business (unique). */
async function nextInvoiceNumber(businessId: string): Promise<string> {
  const last = await prisma.invoice.findFirst({
    where: { businessId },
    orderBy: { createdAt: 'desc' },
    select: { invoiceNumber: true },
  })
  if (!last?.invoiceNumber) {
    return '1'
  }
  const num = Number.parseInt(last.invoiceNumber.replace(/^\D+/, ''), 10)
  return String(Number.isNaN(num) ? 1 : num + 1)
}

/** Recalculate Invoice financials from line items and payments. */
async function recalculateInvoiceFinancials(
  invoiceId: string,
  taxPercent: number = 0,
  discountAmount: number = 0,
  tx?: Omit<
    typeof prisma,
    '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
  >
): Promise<void> {
  const db = tx ?? prisma
  const inv = await db.invoice.findUnique({
    where: { id: invoiceId },
    select: { discount: true, discountType: true },
  })
  if (!inv) {
    return
  }

  const lineItems = await db.lineItem.findMany({
    where: { invoiceId },
    select: { quantity: true, price: true, cost: true },
  })
  const payments = await db.payment.findMany({
    where: { invoiceId },
    select: { amount: true },
  })

  let subtotal = 0
  for (const li of lineItems) {
    subtotal += li.quantity * toNum(li.price)
  }
  let discount = discountAmount
  if (inv.discountType === 'PERCENTAGE') {
    discount = (subtotal * toNum(inv.discount)) / 100
  } else if (inv.discount != null) {
    discount = toNum(inv.discount)
  }
  const afterDiscount = subtotal - discount
  const tax = (afterDiscount * taxPercent) / 100
  const total = afterDiscount + tax
  const amountPaid = payments.reduce((s, p) => s + toNum(p.amount), 0)
  const balance = total - amountPaid

  await db.invoice.update({
    where: { id: invoiceId },
    data: {
      subtotal: new Prisma.Decimal(subtotal),
      tax: new Prisma.Decimal(tax),
      total: new Prisma.Decimal(total),
      amountPaid: new Prisma.Decimal(amountPaid),
      balance: new Prisma.Decimal(balance),
    },
  })
}

export interface InvoiceListFilters {
  search?: string
  status?: InvoiceStatus
  page?: number
  limit?: number
  sortBy?: 'dueAt' | 'createdAt' | 'updatedAt' | 'title'
  order?: 'asc' | 'desc'
}

export interface InvoiceListItem {
  id: string
  invoiceNumber: string | null
  title: string
  address: string | null
  dueAt: Date | null
  status: InvoiceStatus
  total: number
  balance: number
  amountPaid: number
  client: { id: string; name: string; email: string | null; phone: string }
  workOrder: { id: string; title: string; address: string | null } | null | undefined
}

/** List invoices (Invoice model) with optional search and status filter. */
export async function listInvoices(businessId: string, filters: InvoiceListFilters = {}) {
  await ensureBusinessExists(businessId)
  const { search, status, page = 1, limit = 10, sortBy = 'dueAt', order = 'desc' } = filters
  const skip = (page - 1) * limit

  const where: Prisma.InvoiceWhereInput = { businessId }
  if (status) {
    if (status === 'OVERDUE') {
      where.status = 'AWAITING_PAYMENT'
      where.dueAt = { lt: new Date() }
      where.balance = { gt: new Prisma.Decimal(0) }
    } else {
      where.status = status
    }
  }
  if (search?.trim()) {
    where.OR = [
      { title: { contains: search.trim(), mode: 'insensitive' } },
      { address: { contains: search.trim(), mode: 'insensitive' } },
      { invoiceNumber: { contains: search.trim(), mode: 'insensitive' } },
      { client: { name: { contains: search.trim(), mode: 'insensitive' } } },
    ]
  }

  const orderByField = sortBy === 'dueAt' ? 'dueAt' : sortBy === 'title' ? 'title' : sortBy
  const orderBy = { [orderByField]: order } as const

  const [items, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: {
        client: { select: { id: true, name: true, email: true, phone: true } },
        workOrder: { select: { id: true, title: true, address: true } },
      },
    }),
    prisma.invoice.count({ where }),
  ])

  const data: InvoiceListItem[] = items.map(inv => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    title: inv.title,
    address: inv.address,
    dueAt: inv.dueAt,
    status: effectiveInvoiceStatus(inv.status, inv.dueAt, inv.balance),
    total: toNum(inv.total),
    balance: toNum(inv.balance),
    amountPaid: toNum(inv.amountPaid),
    client: inv.client,
    workOrder: inv.workOrder ?? null,
  }))

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  }
}

export interface InvoiceOverviewBucket {
  status: InvoiceStatus
  count: number
  total: number
}

export interface InvoiceOverview {
  byStatus: InvoiceOverviewBucket[]
  issuedLast30Days: { count: number; total: number }
  averageInvoiceLast30Days: number
}

/** Overview for Invoices UI: by status (count + total $), issued 30d, average 30d. */
export async function getInvoiceOverview(businessId: string): Promise<InvoiceOverview> {
  await ensureBusinessExists(businessId)

  const now = new Date()
  const thirtyDaysAgo = new Date(now)
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const all = await prisma.invoice.findMany({
    where: { businessId },
    select: { status: true, dueAt: true, balance: true, total: true, sentAt: true },
  })

  const statusOrder: InvoiceStatus[] = [
    'OVERDUE',
    'AWAITING_PAYMENT',
    'NOT_SENT',
    'PAID',
    'CANCELLED',
    'BAD_DEBT',
  ]
  const byStatusMap = new Map<string, { count: number; total: number }>()
  for (const s of statusOrder) {
    byStatusMap.set(s, { count: 0, total: 0 })
  }

  let issuedCount = 0
  let issuedTotal = 0

  for (const inv of all) {
    const effective = effectiveInvoiceStatus(inv.status, inv.dueAt, inv.balance)
    const total = toNum(inv.total)
    const bucket = byStatusMap.get(effective) ?? { count: 0, total: 0 }
    bucket.count += 1
    bucket.total += total
    byStatusMap.set(effective, bucket)

    if (inv.sentAt && inv.sentAt >= thirtyDaysAgo) {
      issuedCount += 1
      issuedTotal += total
    }
  }

  const byStatus: InvoiceOverviewBucket[] = statusOrder
    .filter(s => (byStatusMap.get(s)?.count ?? 0) > 0)
    .map(status => {
      const b = byStatusMap.get(status) ?? { count: 0, total: 0 }
      return { status, count: b.count, total: b.total }
    })

  return {
    byStatus,
    issuedLast30Days: { count: issuedCount, total: issuedTotal },
    averageInvoiceLast30Days: issuedCount > 0 ? issuedTotal / issuedCount : 0,
  }
}

function invoiceLineItemsSummaryForEmail(
  lineItems: Array<{ name: string; quantity: number; price: unknown }>
): string {
  if (!lineItems.length) {
    return ''
  }
  return lineItems
    .map(li => {
      const unit = Number(li.price)
      const line = unit * li.quantity
      return `${li.name} x ${li.quantity} @ $${unit.toFixed(2)} = $${line.toFixed(2)}`
    })
    .join('\n')
}

function invoiceMoney(d: unknown): string | undefined {
  if (d == null) {
    return undefined
  }
  return `$${toNum(d).toFixed(2)}`
}

function invoiceWorkOrderSummary(
  workOrder: { workOrderNumber: string | null; title: string } | null
): string | null {
  if (!workOrder) {
    return null
  }
  const num = workOrder.workOrderNumber?.trim() || 'Job'
  return `${num} — ${workOrder.title}`
}

/** Client + assigned team member emails after invoice creation (failures logged only). */
async function sendInvoiceCreatedNotificationEmails(
  businessId: string,
  invoiceId: string
): Promise<void> {
  try {
    const inv = await prisma.invoice.findFirst({
      where: { id: invoiceId, businessId },
      include: {
        client: { select: { name: true, email: true, phone: true } },
        business: { include: { settings: { select: { replyToEmail: true } } } },
        lineItems: { select: { name: true, quantity: true, price: true } },
        assignedTo: { include: { user: { select: { name: true, email: true } } } },
        workOrder: { select: { workOrderNumber: true, title: true } },
      },
    })
    if (!inv?.business || !inv.client) {
      return
    }

    const companyReplyTo = inv.business.settings?.replyToEmail?.trim() || inv.business.email
    const logoUrl = inv.business.logoUrl ?? undefined
    const invNumber = inv.invoiceNumber?.trim() || inv.id
    const lineItemsSummary = invoiceLineItemsSummaryForEmail(inv.lineItems)
    const createdDate = inv.createdAt.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
    const addressDisplay = inv.address?.trim() || '—'
    const workOrderSummary = invoiceWorkOrderSummary(inv.workOrder)
    const assignedName = inv.assignedTo?.user?.name ?? 'Our team'
    const subtotalStr = invoiceMoney(inv.subtotal)
    const taxStr = invoiceMoney(inv.tax)
    const totalStr = invoiceMoney(inv.total)
    const balanceStr = invoiceMoney(inv.balance)

    try {
      const clientEmail = inv.client.email?.trim()
      if (clientEmail) {
        sendInvoiceCreatedClientEmail({
          to: clientEmail,
          clientName: inv.client.name,
          businessName: inv.business.name,
          companyReplyTo,
          companyLogoUrl: logoUrl,
          invoiceNumber: invNumber,
          title: inv.title,
          address: addressDisplay,
          createdDate,
          assignedTeamMemberName: assignedName,
          lineItemsSummary,
          subtotal: subtotalStr,
          tax: taxStr,
          total: totalStr,
          balance: balanceStr,
          workOrderSummary,
        })
      }
    } catch (e) {
      console.error('[INVOICE] Failed to send invoice created client email:', e)
    }

    try {
      const assigneeEmail = inv.assignedTo?.user?.email?.trim()
      if (assigneeEmail && inv.assignedTo?.user) {
        sendInvoiceAssignedToTeamMemberEmail({
          to: assigneeEmail,
          assigneeName: inv.assignedTo.user.name ?? 'there',
          businessName: inv.business.name,
          companyReplyTo,
          companyLogoUrl: logoUrl,
          invoiceNumber: invNumber,
          title: inv.title,
          clientName: inv.client.name,
          clientPhone: inv.client.phone,
          address: addressDisplay,
          createdDate,
          lineItemsSummary,
          subtotal: subtotalStr,
          tax: taxStr,
          total: totalStr,
          balance: balanceStr,
          workOrderSummary,
          observations: inv.observations,
        })
      }
    } catch (e) {
      console.error('[INVOICE] Failed to send invoice assignee email:', e)
    }
  } catch (e) {
    console.error('[INVOICE] Failed to send invoice created notification emails:', e)
  }
}

/** Get single invoice by id with client, lineItems, payments. */
export async function getInvoiceById(businessId: string, invoiceId: string) {
  await ensureBusinessExists(businessId)
  const inv = await prisma.invoice.findFirst({
    where: { id: invoiceId, businessId },
    include: {
      client: true,
      lineItems: true,
      payments: true,
      assignedTo: { include: { user: { select: { id: true, name: true, email: true } } } },
      workOrder: { select: { id: true, workOrderNumber: true, title: true } },
    },
  })
  if (!inv) {
    throw new InvoiceNotFoundError()
  }
  return inv
}

/** Create new Invoice (New Invoice form). Creates Invoice + LineItems (invoiceId); optional workOrderId. */
export async function createInvoice(
  businessId: string,
  input: {
    title: string
    clientId: string
    address: string
    assignedToId?: string | null
    workOrderId?: string | null
    lineItems?: Array<{
      name: string
      itemType?: 'SERVICE' | 'PRODUCT'
      description?: string | null
      quantity: number
      price: number
      cost?: number | null
      priceListItemId?: string | null
    }>
  }
) {
  await ensureBusinessExists(businessId)

  const client = await prisma.client.findFirst({
    where: { id: input.clientId, businessId },
    select: { id: true },
  })
  if (!client) {
    throw new ClientNotFoundError()
  }

  if (input.assignedToId) {
    const member = await prisma.member.findFirst({
      where: { id: input.assignedToId, businessId },
      select: { id: true },
    })
    if (!member) {
      throw new Error('MEMBER_NOT_FOUND')
    }
  }

  const invoiceNumber = await nextInvoiceNumber(businessId)

  const inv = await prisma.$transaction(async tx => {
    const created = await tx.invoice.create({
      data: {
        businessId,
        clientId: input.clientId,
        title: input.title,
        address: input.address,
        workOrderId: input.workOrderId ?? null,
        assignedToId: input.assignedToId ?? null,
        status: 'NOT_SENT',
        invoiceNumber,
      },
    })

    if (input.lineItems?.length) {
      await tx.lineItem.createMany({
        data: input.lineItems.map(li => ({
          invoiceId: created.id,
          name: li.name,
          itemType: (li.itemType ?? 'SERVICE') as 'SERVICE' | 'PRODUCT',
          description: li.description ?? null,
          quantity: li.quantity,
          price: li.price,
          cost: li.cost ?? null,
          priceListItemId: li.priceListItemId ?? null,
        })),
      })
    }

    await recalculateInvoiceFinancials(created.id, 0, 0, tx)
    return created
  })

  await sendInvoiceCreatedNotificationEmails(businessId, inv.id)
  return getInvoiceById(businessId, inv.id)
}

/** Send invoice: set status=AWAITING_PAYMENT, sentAt=now, dueAt=now+X days. */
export async function sendInvoice(businessId: string, invoiceId: string) {
  await ensureBusinessExists(businessId)

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    include: { settings: true },
  })
  if (!business) {
    throw new BusinessNotFoundError()
  }

  const inv = await prisma.invoice.findFirst({
    where: { id: invoiceId, businessId },
    select: { id: true, status: true },
  })
  if (!inv) {
    throw new InvoiceNotFoundError()
  }
  if (inv.status !== 'NOT_SENT') {
    throw new Error('Invoice was already sent or is in a terminal state')
  }

  const dueDays = business.settings?.invoiceDueDays ?? 3
  const sentAt = new Date()
  const dueAt = new Date(sentAt)
  dueAt.setDate(dueAt.getDate() + dueDays)

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      status: 'AWAITING_PAYMENT',
      sentAt,
      dueAt,
    },
  })

  return getInvoiceById(businessId, invoiceId)
}

const defaultInvoiceEmailMessage = (clientName: string, businessName: string, title: string) =>
  `<!DOCTYPE html><html><body style="font-family: sans-serif; line-height: 1.5;">` +
  `<p>Hi ${clientName},</p>` +
  `<p>Please find your invoice from <strong>${businessName}</strong> for <strong>${title}</strong>.</p>` +
  `<p>If you have any questions, please reply to this email.</p>` +
  `<p>Best regards,<br/>${businessName}</p>` +
  `</body></html>`

export type InvoiceEmailComposeAttachment = {
  id: string
  label: string
  filename: string
  source: 'INVOICE_PDF' | 'QUOTE_PDF' | 'JOB_REPORT_PDF' | 'WORK_ORDER_ATTACHMENT'
  sizeBytes: number | null
  selectedByDefault: boolean
}

/** Prefill data for "Email invoice" modal (Figma). */
export async function getInvoiceEmailComposeData(businessId: string, invoiceId: string) {
  await ensureBusinessExists(businessId)

  const inv = await prisma.invoice.findFirst({
    where: { id: invoiceId, businessId },
    include: {
      client: { select: { id: true, name: true, email: true } },
      business: {
        include: {
          settings: { select: { replyToEmail: true } },
        },
      },
      workOrder: {
        select: {
          id: true,
          lastJobReportPdfUrl: true,
        },
      },
    },
  })
  if (!inv) {
    throw new InvoiceNotFoundError()
  }

  const quotePdfForWo =
    inv.workOrderId != null
      ? await prisma.quote.findFirst({
          where: {
            OR: [
              { relatedWorkOrderId: inv.workOrderId },
              { convertedToWorkOrderId: inv.workOrderId },
            ],
            lastQuotePdfUrl: { not: null },
          },
          select: { lastQuotePdfUrl: true },
        })
      : null

  const displayName = inv.business.name?.trim() || 'Company'
  const from = clientToCustomerFrom(displayName)
  const replyTo = inv.business.settings?.replyToEmail?.trim() || inv.business.email
  const subject = `Invoice from ${displayName} - ${inv.title}`.trim()
  const message = defaultInvoiceEmailMessage(inv.client.name, displayName, inv.title)

  const attachments: InvoiceEmailComposeAttachment[] = []

  if (inv.pdfUrl) {
    attachments.push({
      id: 'invoice_pdf',
      label: 'Invoice.pdf',
      filename: 'Invoice.pdf',
      source: 'INVOICE_PDF',
      sizeBytes: null,
      selectedByDefault: true,
    })
  }

  if (quotePdfForWo?.lastQuotePdfUrl) {
    attachments.push({
      id: 'quote_pdf',
      label: 'Quote.pdf',
      filename: 'Quote.pdf',
      source: 'QUOTE_PDF',
      sizeBytes: null,
      selectedByDefault: true,
    })
  }

  if (inv.workOrder?.lastJobReportPdfUrl) {
    attachments.push({
      id: 'work_order_summary_pdf',
      label: 'Work order summary.pdf',
      filename: 'Work order summary.pdf',
      source: 'JOB_REPORT_PDF',
      sizeBytes: null,
      selectedByDefault: true,
    })
  }

  if (inv.workOrderId) {
    const woa = await prisma.workOrderAttachment.findMany({
      where: { workOrderId: inv.workOrderId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, filename: true },
    })
    for (const item of woa) {
      attachments.push({
        id: `woa_${item.id}`,
        label: item.filename ?? 'Attachment',
        filename: item.filename ?? 'Attachment',
        source: 'WORK_ORDER_ATTACHMENT',
        sizeBytes: null,
        selectedByDefault: false,
      })
    }
  }

  return {
    invoiceId: inv.id,
    from,
    replyTo,
    to: inv.client.email ?? null,
    subject,
    message,
    sendMeCopyDefault: false,
    maxAdditionalAttachmentsBytes: 10 * 1024 * 1024,
    attachments,
  }
}

/**
 * Send invoice email (modal "Send Email"). Attaches selected PDFs from invoice / linked work order.
 * If invoice status is NOT_SENT, also marks invoice as sent (AWAITING_PAYMENT, sentAt, dueAt).
 */
export async function sendInvoiceEmail(
  businessId: string,
  invoiceId: string,
  options?: {
    from?: string
    replyTo?: string
    subject?: string
    message?: string
    to?: string
    sendMeCopy?: boolean
    selectedAttachmentIds?: string[]
    additionalAttachments?: Array<{
      filename: string
      content: Buffer
      contentType?: string | null
    }>
    requesterEmail?: string
    /** If false, only send email without updating NOT_SENT → AWAITING_PAYMENT. Default true. */
    markInvoiceSent?: boolean
  }
) {
  await ensureBusinessExists(businessId)

  const inv = await prisma.invoice.findFirst({
    where: { id: invoiceId, businessId },
    include: {
      client: { select: { id: true, name: true, email: true } },
      business: { include: { settings: { select: { replyToEmail: true, invoiceDueDays: true } } } },
      workOrder: {
        select: {
          id: true,
          lastJobReportPdfUrl: true,
        },
      },
    },
  })
  if (!inv) {
    throw new InvoiceNotFoundError()
  }

  const quotePdfForWoSend =
    inv.workOrderId != null
      ? await prisma.quote.findFirst({
          where: {
            OR: [
              { relatedWorkOrderId: inv.workOrderId },
              { convertedToWorkOrderId: inv.workOrderId },
            ],
            lastQuotePdfUrl: { not: null },
          },
          select: { lastQuotePdfUrl: true },
        })
      : null

  const toEmail = (options?.to ?? inv.client.email)?.trim()
  if (!toEmail) {
    throw new Error('Client has no email address. Add an email to the client to send the invoice.')
  }

  const companyReplyTo =
    options?.replyTo?.trim() || inv.business.settings?.replyToEmail?.trim() || inv.business.email
  const displayName = inv.business.name?.trim() || 'Company'
  const fromHeader = options?.from?.trim() || clientToCustomerFrom(displayName)
  const subject = options?.subject ?? `Invoice from ${displayName} - ${inv.title}`.trim()
  const html =
    options?.message ?? defaultInvoiceEmailMessage(inv.client.name, displayName, inv.title)

  const selectedIds = new Set(options?.selectedAttachmentIds ?? [])
  const attachmentPayload: Array<{ filename: string; content: Buffer; contentType?: string }> = []
  let totalBytes = 0
  const maxBytes = 10 * 1024 * 1024
  const pushAttachment = (filename: string, content: Buffer, contentType?: string) => {
    totalBytes += content.byteLength
    if (totalBytes > maxBytes) {
      throw new Error('ATTACHMENTS_TOO_LARGE')
    }
    attachmentPayload.push({ filename, content, contentType })
  }

  const fetchUrlAsBuffer = async (url: string) => {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error('ATTACHMENT_FETCH_FAILED')
    }
    const arrayBuffer = await response.arrayBuffer()
    return Buffer.from(arrayBuffer)
  }

  if (selectedIds.has('invoice_pdf') && inv.pdfUrl) {
    const content = await fetchUrlAsBuffer(inv.pdfUrl)
    pushAttachment('Invoice.pdf', content, 'application/pdf')
  }

  if (inv.workOrder) {
    if (selectedIds.has('quote_pdf') && quotePdfForWoSend?.lastQuotePdfUrl) {
      const content = await fetchUrlAsBuffer(quotePdfForWoSend.lastQuotePdfUrl)
      pushAttachment('Quote.pdf', content, 'application/pdf')
    }
    if (selectedIds.has('work_order_summary_pdf') && inv.workOrder.lastJobReportPdfUrl) {
      const content = await fetchUrlAsBuffer(inv.workOrder.lastJobReportPdfUrl)
      pushAttachment('Work order summary.pdf', content, 'application/pdf')
    }
  }

  if (inv.workOrderId) {
    const workOrderAttachments = await prisma.workOrderAttachment.findMany({
      where: { workOrderId: inv.workOrderId },
      select: { id: true, url: true, filename: true, type: true },
    })
    for (const item of workOrderAttachments) {
      const id = `woa_${item.id}`
      if (!selectedIds.has(id)) {
        continue
      }
      const content = await fetchUrlAsBuffer(item.url)
      pushAttachment(item.filename ?? 'Attachment', content, item.type ?? undefined)
    }
  }

  for (const item of options?.additionalAttachments ?? []) {
    pushAttachment(item.filename, item.content, item.contentType ?? undefined)
  }

  await emailService.send({
    to: toEmail,
    subject,
    html,
    from: fromHeader,
    replyTo: companyReplyTo,
    attachments: attachmentPayload,
  })

  if (options?.sendMeCopy && options.requesterEmail?.trim()) {
    await emailService.send({
      to: options.requesterEmail.trim(),
      subject: `[Copy] ${subject}`,
      html,
      from: fromHeader,
      replyTo: companyReplyTo,
      attachments: attachmentPayload,
    })
  }

  const markSent = options?.markInvoiceSent !== false
  if (markSent && inv.status === 'NOT_SENT') {
    const dueDays = inv.business.settings?.invoiceDueDays ?? 3
    const sentAt = new Date()
    const dueAt = new Date(sentAt)
    dueAt.setDate(dueAt.getDate() + dueDays)
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: 'AWAITING_PAYMENT',
        sentAt,
        dueAt,
      },
    })
  }

  return getInvoiceById(businessId, invoiceId)
}
