/**
 * Quote Management – quotes live on the `Quote` model (separate from `WorkOrder` jobs).
 * Line items use `LineItem.quoteId`. Optional `relatedWorkOrderId` links a quote to an existing job WO.
 */

import type { QuoteStatus } from '~/generated/prisma'
import { Prisma } from '~/generated/prisma'
import { renderEmailTemplate } from '~/lib/email-render'
import prisma from '~/lib/prisma'
import { BusinessNotFoundError } from '~/services/business.service'
import { emailService } from '~/services/email.service'
import { clientToCustomerFrom } from '~/services/email-helpers'
import {
  isPlatformNotificationRuleActive,
  PlatformNotificationEventKey,
} from '~/services/platform-notification-rule.service'
import { resolveClientEmailCopyBcc } from '~/services/platform-settings.service'
import { ClientNotFoundError, WorkOrderNotFoundError } from '~/services/workorder.service'

// ─── Errors ──────────────────────────────────────────────────────────────────

export class QuoteAlreadySentError extends Error {
  constructor() {
    super('QUOTE_ALREADY_SENT')
  }
}

export class QuoteTerminalStateError extends Error {
  constructor() {
    super('QUOTE_IN_TERMINAL_STATE')
  }
}

export class QuoteNoLineItemsError extends Error {
  constructor() {
    super('QUOTE_NO_LINE_ITEMS')
  }
}

const BACKEND_PUBLIC_URL =
  Bun.env.BACKEND_PUBLIC_URL?.trim() ||
  Bun.env.BETTER_AUTH_URL?.trim() ||
  `http://localhost:${Bun.env.PORT ?? Bun.env.PORT_NO ?? 8080}`

// ─── Types ───────────────────────────────────────────────────────────────────

export interface QuoteListFilters {
  search?: string
  quoteStatus?: QuoteStatus
  page?: number
  limit?: number
  sortBy?: 'createdAt' | 'updatedAt' | 'title' | 'scheduledAt'
  order?: 'asc' | 'desc'
}

export interface CreateQuoteInput {
  title: string
  clientId: string
  address: string
  assignedToId?: string | null
  instructions?: string | null
  workOrderId?: string | null
  notes?: string | null
  quoteTermsConditions?: string | null
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

/** Update quote (work order) fields. quoteStatus is never editable here — use send/approve/reject/setAwaitingResponse. */
export interface UpdateQuoteInput {
  title?: string
  clientId?: string
  address?: string
  isScheduleLater?: boolean
  scheduledAt?: Date | null
  startTime?: string | null
  endTime?: string | null
  assignedToId?: string | null
  workOrderId?: string | null
  instructions?: string | null
  notes?: string | null
  quoteTermsConditions?: string | null
  discount?: number
  discountType?: 'PERCENTAGE' | 'AMOUNT' | null
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function ensureBusinessExists(businessId: string): Promise<void> {
  const b = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true },
  })
  if (!b) {
    throw new BusinessNotFoundError()
  }
}

/** Next quote display number per business (e.g. 1 → "#1"). */
async function nextQuoteNumber(businessId: string): Promise<string> {
  const last = await prisma.quote.findFirst({
    where: { businessId },
    orderBy: { createdAt: 'desc' },
    select: { quoteNumber: true },
  })
  if (!last?.quoteNumber) {
    return '1'
  }
  const num = Number.parseInt(last.quoteNumber.replace(/^#/, ''), 10)
  return String(Number.isNaN(num) ? 1 : num + 1)
}

const quoteDetailInclude = {
  client: {
    select: { id: true, name: true, email: true, phone: true, address: true },
  },
  assignedTo: {
    include: { user: { select: { id: true, name: true, email: true } } },
  },
  lineItems: true,
  attachments: true,
  relatedWorkOrder: { select: { id: true, workOrderNumber: true, title: true } },
} as const

/** Full quote for API — shape kept close to the old WorkOrder-backed response. */
async function getQuoteById(businessId: string, quoteId: string) {
  const q = await prisma.quote.findFirst({
    where: { id: quoteId, businessId },
    include: quoteDetailInclude,
  })
  if (!q) {
    throw new WorkOrderNotFoundError()
  }
  return formatQuoteDetailResponse(q)
}

function formatQuoteDetailResponse(
  q: Prisma.QuoteGetPayload<{ include: typeof quoteDetailInclude }>
) {
  return {
    id: q.id,
    quoteId: q.id,
    workOrderId: q.id,
    quoteNumber: q.quoteNumber,
    workOrderNumber: q.quoteNumber,
    relatedWorkOrderId: q.relatedWorkOrderId,
    relatedWorkOrder: q.relatedWorkOrder,
    title: q.title,
    address: q.address,
    instructions: q.instructions,
    notes: q.notes,
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
    isScheduleLater: q.isScheduleLater,
    isAnyTime: q.isAnyTime,
    scheduledAt: q.scheduledAt,
    startTime: q.startTime,
    endTime: q.endTime,
    clientId: q.clientId,
    businessId: q.businessId,
    assignedToId: q.assignedToId,
    quoteRequired: true as const,
    quoteStatus: q.quoteStatus,
    quoteSentAt: q.quoteSentAt,
    quoteApprovedAt: q.quoteApprovedAt,
    quoteRejectedAt: q.quoteRejectedAt,
    quoteExpiredAt: q.quoteExpiredAt,
    quoteConvertedAt: q.quoteConvertedAt,
    quoteExpiresAt: q.quoteExpiresAt,
    lastQuotePdfUrl: q.lastQuotePdfUrl,
    quoteCorrelative: q.quoteCorrelative,
    quoteClientActionToken: q.quoteClientActionToken,
    quoteClientRespondedAt: q.quoteClientRespondedAt,
    quoteClientRejectionReason: q.quoteClientRejectionReason,
    quoteWhatsappStatus: q.quoteWhatsappStatus,
    quoteObservations: q.quoteObservations,
    quoteTermsConditions: q.quoteTermsConditions,
    quoteVersion: q.quoteVersion,
    subtotal: q.subtotal,
    discount: q.discount,
    discountType: q.discountType,
    tax: q.tax,
    total: q.total,
    cost: q.cost,
    amountPaid: q.amountPaid,
    balance: q.balance,
    lastJobReportPdfUrl: q.lastJobReportPdfUrl,
    client: q.client,
    assignedTo: q.assignedTo,
    lineItems: q.lineItems,
    payments: [] as const,
    expenses: [] as const,
    attachments: q.attachments,
  }
}

/** Recalculate quote financials from line items. */
async function recalculateQuoteFinancials(
  quoteId: string,
  tx?: Omit<
    typeof prisma,
    '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
  >
): Promise<void> {
  const db = tx ?? prisma
  const row = await db.quote.findUnique({
    where: { id: quoteId },
    select: { discount: true, discountType: true },
  })
  if (!row) {
    return
  }

  const lineItems = await db.lineItem.findMany({
    where: { quoteId },
    select: { quantity: true, price: true, cost: true },
  })

  function toNum(d: unknown): number {
    if (d == null) {
      return 0
    }
    if (typeof d === 'number') {
      return d
    }
    if (typeof d === 'string') {
      return Number.parseFloat(d) || 0
    }
    if (typeof d === 'object' && 'toNumber' in (d as object)) {
      return (d as { toNumber: () => number }).toNumber()
    }
    return 0
  }

  let subtotal = 0
  let costTotal = 0
  for (const li of lineItems) {
    subtotal += li.quantity * toNum(li.price)
    costTotal += li.quantity * toNum(li.cost)
  }

  const discountVal = toNum(row.discount)
  const discountAmount =
    row.discountType === 'PERCENTAGE' ? (subtotal * discountVal) / 100 : discountVal
  const total = subtotal - discountAmount
  const amountPaid = 0

  await db.quote.update({
    where: { id: quoteId },
    data: {
      subtotal: new Prisma.Decimal(subtotal),
      cost: new Prisma.Decimal(costTotal),
      tax: new Prisma.Decimal(0),
      total: new Prisma.Decimal(total),
      amountPaid: new Prisma.Decimal(amountPaid),
      balance: new Prisma.Decimal(total),
    },
  })
}

// ─── Service Functions ────────────────────────────────────────────────────────

/** Slim row for GET /quotes. */
function mapQuoteListRow(q: {
  id: string
  quoteNumber: string | null
  title: string
  address: string
  createdAt: Date
  updatedAt: Date
  quoteStatus: QuoteStatus
  quoteVersion: number
  quoteSentAt: Date | null
  quoteExpiresAt: Date | null
  total: Prisma.Decimal | null
  client: { id: string; name: string; email: string | null; phone: string }
  assignedTo: { id: string; user: { name: string | null; email: string } } | null
  lineItems: { id: string; name: string; quantity: number; price: Prisma.Decimal }[]
}) {
  const workOrderName = [q.quoteNumber, q.title].filter(Boolean).join(' — ')
  return {
    id: q.id,
    quoteId: q.id,
    workOrderId: q.id,
    quoteNumber: q.quoteNumber,
    workOrderNumber: q.quoteNumber,
    workOrderName: workOrderName || q.title,
    title: q.title,
    address: q.address,
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
    quoteStatus: q.quoteStatus,
    quoteVersion: q.quoteVersion,
    quoteSentAt: q.quoteSentAt,
    quoteExpiresAt: q.quoteExpiresAt,
    total: q.total,
    client: q.client,
    assignedTo: q.assignedTo,
    lineItems: q.lineItems.map(li => ({
      id: li.id,
      name: li.name,
      quantity: li.quantity,
      price: li.price,
    })),
  }
}

/**
 * List quotes with search + filter.
 */
export async function listQuotes(businessId: string, filters: QuoteListFilters = {}) {
  await ensureBusinessExists(businessId)

  const {
    search,
    quoteStatus,
    page = 1,
    limit = 10,
    sortBy = 'createdAt',
    order = 'desc',
  } = filters
  const skip = (page - 1) * limit

  const where: Prisma.QuoteWhereInput = { businessId }

  if (quoteStatus) {
    where.quoteStatus = quoteStatus
  }

  if (search?.trim()) {
    where.OR = [
      { title: { contains: search.trim(), mode: 'insensitive' } },
      { address: { contains: search.trim(), mode: 'insensitive' } },
      { client: { name: { contains: search.trim(), mode: 'insensitive' } } },
    ]
  }

  const [rows, total] = await Promise.all([
    prisma.quote.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sortBy]: order },
      select: {
        id: true,
        quoteNumber: true,
        title: true,
        address: true,
        createdAt: true,
        updatedAt: true,
        quoteStatus: true,
        quoteVersion: true,
        quoteSentAt: true,
        quoteExpiresAt: true,
        total: true,
        client: { select: { id: true, name: true, email: true, phone: true } },
        assignedTo: {
          select: { id: true, user: { select: { name: true, email: true } } },
        },
        lineItems: { select: { id: true, name: true, quantity: true, price: true } },
      },
    }),
    prisma.quote.count({ where }),
  ])

  return {
    quotes: rows.map(mapQuoteListRow),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  }
}

/**
 * Create a new quote (`Quote` row + optional line items).
 */
export async function createQuote(businessId: string, input: CreateQuoteInput) {
  await ensureBusinessExists(businessId)

  const client = await prisma.client.findFirst({
    where: { id: input.clientId, businessId },
    select: { id: true },
  })
  if (!client) {
    throw new ClientNotFoundError()
  }

  let relatedWorkOrderId: string | null = null
  if (input.workOrderId) {
    const rel = await prisma.workOrder.findFirst({
      where: { id: input.workOrderId, businessId },
      select: { id: true },
    })
    if (!rel) {
      throw new WorkOrderNotFoundError()
    }
    relatedWorkOrderId = rel.id
  }

  const quoteNumber = `#${await nextQuoteNumber(businessId)}`

  const settings = await prisma.businessSettings.findUnique({
    where: { businessId },
    select: { quoteTermsConditions: true, quoteExpirationDays: true },
  })

  const created = await prisma.$transaction(async tx => {
    const q = await tx.quote.create({
      data: {
        businessId,
        clientId: input.clientId,
        title: input.title,
        address: input.address,
        instructions: input.instructions ?? null,
        notes: input.notes ?? null,
        assignedToId: input.assignedToId ?? null,
        quoteNumber,
        relatedWorkOrderId,
        quoteStatus: 'NOT_SENT',
        quoteTermsConditions: input.quoteTermsConditions ?? settings?.quoteTermsConditions ?? null,
        isScheduleLater: true,
        discount: new Prisma.Decimal(0),
        discountType: null,
      },
    })

    if (input.lineItems?.length) {
      await tx.lineItem.createMany({
        data: input.lineItems.map(li => ({
          quoteId: q.id,
          name: li.name,
          itemType: li.itemType ?? 'SERVICE',
          description: li.description ?? null,
          quantity: li.quantity,
          price: li.price,
          cost: li.cost ?? null,
          priceListItemId: li.priceListItemId ?? null,
        })),
      })
    }

    await recalculateQuoteFinancials(q.id, tx)
    return q
  })

  return getQuoteById(businessId, created.id)
}

/**
 * Get single quote by ID.
 */
export async function getQuote(businessId: string, quoteId: string) {
  await ensureBusinessExists(businessId)
  return getQuoteById(businessId, quoteId)
}

/** Client-facing rejection copy saved when the customer rejects via the public flow. */
export async function getQuoteRejectionReason(businessId: string, quoteId: string) {
  await ensureBusinessExists(businessId)
  const row = await prisma.quote.findFirst({
    where: { id: quoteId, businessId },
    select: {
      id: true,
      quoteStatus: true,
      quoteClientRejectionReason: true,
      quoteRejectedAt: true,
      quoteClientRespondedAt: true,
    },
  })
  if (!row) {
    throw new WorkOrderNotFoundError()
  }
  return {
    quoteId: row.id,
    quoteStatus: row.quoteStatus,
    rejectionReason: row.quoteClientRejectionReason,
    quoteRejectedAt: row.quoteRejectedAt,
    quoteClientRespondedAt: row.quoteClientRespondedAt,
  }
}

/**
 * Update quote fields. quoteStatus is only changed via actions (send, approve, reject, setAwaitingResponse).
 */
export async function updateQuote(businessId: string, quoteId: string, input: UpdateQuoteInput) {
  await ensureBusinessExists(businessId)

  const existing = await prisma.quote.findFirst({
    where: { id: quoteId, businessId },
    select: { id: true },
  })
  if (!existing) {
    throw new WorkOrderNotFoundError()
  }

  let relatedWorkOrderId: string | null | undefined
  if (input.workOrderId !== undefined) {
    if (input.workOrderId === null) {
      relatedWorkOrderId = null
    } else {
      const rel = await prisma.workOrder.findFirst({
        where: { id: input.workOrderId, businessId },
        select: { id: true },
      })
      if (!rel) {
        throw new WorkOrderNotFoundError()
      }
      relatedWorkOrderId = rel.id
    }
  }

  await prisma.$transaction(async tx => {
    await tx.quote.update({
      where: { id: quoteId },
      data: {
        ...(input.title != null && { title: input.title }),
        ...(input.clientId != null && { clientId: input.clientId }),
        ...(input.address != null && { address: input.address }),
        ...(input.instructions !== undefined && { instructions: input.instructions }),
        ...(input.notes !== undefined && { notes: input.notes }),
        ...(input.isScheduleLater !== undefined && { isScheduleLater: input.isScheduleLater }),
        ...(input.scheduledAt !== undefined && { scheduledAt: input.scheduledAt }),
        ...(input.startTime !== undefined && { startTime: input.startTime }),
        ...(input.endTime !== undefined && { endTime: input.endTime }),
        ...(input.assignedToId !== undefined && { assignedToId: input.assignedToId }),
        ...(input.quoteTermsConditions !== undefined && {
          quoteTermsConditions: input.quoteTermsConditions,
        }),
        ...(input.discount !== undefined && { discount: new Prisma.Decimal(input.discount) }),
        ...(input.discountType !== undefined && { discountType: input.discountType }),
        ...(relatedWorkOrderId !== undefined && { relatedWorkOrderId }),
      },
    })

    if (input.lineItems) {
      await tx.lineItem.deleteMany({ where: { quoteId } })
      if (input.lineItems.length > 0) {
        await tx.lineItem.createMany({
          data: input.lineItems.map(li => ({
            quoteId,
            name: li.name,
            itemType: li.itemType ?? 'SERVICE',
            description: li.description ?? null,
            quantity: li.quantity,
            price: li.price,
            cost: li.cost ?? null,
            priceListItemId: li.priceListItemId ?? null,
          })),
        })
      }
    }

    await recalculateQuoteFinancials(quoteId, tx)
  })

  return getQuoteById(businessId, quoteId)
}

/**
 * Delete quote. Cascades line items and quote attachments.
 */
export async function deleteQuote(businessId: string, quoteId: string) {
  await ensureBusinessExists(businessId)

  const existing = await prisma.quote.findFirst({
    where: { id: quoteId, businessId },
    select: { id: true },
  })
  if (!existing) {
    throw new WorkOrderNotFoundError()
  }

  await prisma.quote.delete({ where: { id: quoteId } })
}

/**
 * Manually set quote status to AWAITING_RESPONSE (spec: "Awaiting response: also can be set manually").
 * Only allowed when current status is NOT_SENT. Sets sent_at and expires_at per settings.
 */
export async function setQuoteAwaitingResponse(businessId: string, quoteId: string) {
  await ensureBusinessExists(businessId)

  const row = await prisma.quote.findFirst({
    where: { id: quoteId, businessId },
    select: { id: true, quoteStatus: true },
  })
  if (!row) {
    throw new WorkOrderNotFoundError()
  }
  if (row.quoteStatus !== 'NOT_SENT') {
    throw new QuoteTerminalStateError()
  }

  const settings = await prisma.businessSettings.findUnique({
    where: { businessId },
    select: { quoteExpirationDays: true },
  })
  const expirationDays = settings?.quoteExpirationDays ?? 7
  const now = new Date()
  const expiresAt = new Date(now)
  expiresAt.setDate(expiresAt.getDate() + expirationDays)

  await prisma.quote.update({
    where: { id: quoteId },
    data: {
      quoteStatus: 'AWAITING_RESPONSE',
      quoteSentAt: now,
      quoteExpiresAt: expiresAt,
    },
  })

  return getQuoteById(businessId, quoteId)
}

/**
 * Send quote action (§6.2.1).
 * Sets quoteStatus = AWAITING_RESPONSE, records timestamps, generates correlative.
 * Blocks if no line items exist (spec: "Sent Quote blocked if no Line items specified").
 */
export async function sendQuote(
  businessId: string,
  quoteId: string,
  options?: { observations?: string }
) {
  await ensureBusinessExists(businessId)

  const q = await prisma.quote.findFirst({
    where: { id: quoteId, businessId },
    include: { lineItems: { select: { id: true } } },
  })
  if (!q) {
    throw new WorkOrderNotFoundError()
  }

  const terminalStates: QuoteStatus[] = ['CONVERTED', 'REJECTED', 'EXPIRED']
  if (terminalStates.includes(q.quoteStatus)) {
    throw new QuoteTerminalStateError()
  }

  const lineItemCount = await prisma.lineItem.count({ where: { quoteId } })
  if (lineItemCount === 0) {
    throw new QuoteNoLineItemsError()
  }

  const settings = await prisma.businessSettings.findUnique({
    where: { businessId },
    select: { quoteExpirationDays: true },
  })
  const expirationDays = settings?.quoteExpirationDays ?? 7

  const now = new Date()
  const expiresAt = new Date(now)
  expiresAt.setDate(expiresAt.getDate() + expirationDays)

  const currentVersion = q.quoteVersion ?? 1
  const newVersion = q.quoteSentAt ? currentVersion + 1 : currentVersion

  const dateStr = now.toISOString().slice(0, 10)
  const quoteCorrelative = `Q-${quoteId.slice(-4)}-${dateStr}-v${newVersion}`

  await prisma.quote.update({
    where: { id: quoteId },
    data: {
      quoteStatus: 'AWAITING_RESPONSE',
      quoteSentAt: now,
      quoteExpiresAt: expiresAt,
      quoteVersion: newVersion,
      quoteCorrelative,
      ...(options?.observations && { quoteObservations: options.observations }),
    },
  })

  return getQuoteById(businessId, quoteId)
}

function formatQuoteDate(d: Date | null | undefined): string {
  if (!d) {
    return 'To be confirmed'
  }
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function normalizeTimeDisplay(value: string | null | undefined): string | null {
  if (value == null || String(value).trim() === '') {
    return null
  }
  const s = String(value).trim()
  const date = new Date(s)
  if (!Number.isNaN(date.getTime()) && s.includes('T')) {
    return date.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  }
  if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(s)) {
    return s.length === 5 ? s : s.slice(0, 5)
  }
  return s
}

function formatQuoteTimeRange(
  start: string | null | undefined,
  end: string | null | undefined,
  scheduledAt?: Date | null
): string {
  const startNorm = normalizeTimeDisplay(start)
  const endNorm = normalizeTimeDisplay(end)
  if (startNorm && endNorm) {
    return `${startNorm} - ${endNorm}`
  }
  if (startNorm || endNorm) {
    return startNorm ?? endNorm ?? 'To be confirmed'
  }
  if (scheduledAt) {
    return scheduledAt.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  }
  return 'To be confirmed'
}

function formatMoney(value: unknown): string {
  if (value == null) {
    return ''
  }
  return `$${Number(value).toFixed(2)}`
}

function summarizeQuoteLineItems(
  lineItems: Array<{ name: string; quantity: number; price: unknown }>
): string {
  return lineItems
    .map(
      li =>
        `${li.name} x ${li.quantity} @ ${formatMoney(li.price)} = ${formatMoney(Number(li.quantity) * Number(li.price ?? 0))}`
    )
    .join('\n')
}

function buildClientQuoteActionUrl(token: string, action: 'approve' | 'reject'): string {
  const base = BACKEND_PUBLIC_URL.replace(/\/$/, '')
  return `${base}/api/quotes/client/respond?action=${action}&token=${encodeURIComponent(token)}`
}

function appendQuoteActionButtons(
  html: string,
  approveUrl: string,
  rejectUrl: string
): string {
  const buttons = `
  <div style="margin-top:24px;text-align:center;">
    <a href="${approveUrl}" style="display:inline-block;background:#10b981;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:700;margin-right:8px;">Approve Quote</a>
    <a href="${rejectUrl}" style="display:inline-block;background:#ef4444;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:700;">Reject Quote</a>
  </div>`
  if (html.includes('</body>')) {
    return html.replace('</body>', `${buttons}</body>`)
  }
  return `${html}${buttons}`
}

async function sendQuoteRejectedByClientNotification(params: {
  quoteId: string
  rejectionReason: string
}): Promise<void> {
  const q = await prisma.quote.findFirst({
    where: { id: params.quoteId },
    include: {
      client: { select: { name: true } },
      business: {
        include: {
          settings: { select: { notificationEmail: true } },
        },
      },
    },
  })
  if (!q) {
    return
  }

  const toEmail =
    q.business.settings?.notificationEmail?.trim() || q.business.email?.trim()
  if (!toEmail) {
    console.warn('[quote] No business email for quote rejection notification', q.id)
    return
  }

  const displayName = q.business.name?.trim() || 'Company'
  const noReply = Bun.env.RESEND_FROM_EMAIL?.trim() || 'noresponder@notificaciones.kellu.co'
  const kelluName = Bun.env.RESEND_KELLU_FROM_NAME?.trim() || 'Kellu'
  const fromHeader = `${kelluName} <${noReply}>`
  const replyTo = Bun.env.RESEND_KELLU_REPLY_TO?.trim() || 'equipo@kellu.co'
  const base = (Bun.env.FRONTEND_URL?.trim() || 'http://localhost:3000').replace(/\/$/, '')
  const dashboardUrl = `${base}/dashboard`

  const html = await renderEmailTemplate('quote-rejected-by-client', {
    businessName: displayName,
    clientName: q.client.name,
    quoteNumber: q.quoteNumber ?? `#${q.id}`,
    quoteReference: q.quoteCorrelative ?? undefined,
    title: q.title,
    rejectionReason: params.rejectionReason,
    logoUrl: q.business.logoUrl ?? undefined,
    dashboardUrl,
  })

  const subjectRef = q.quoteCorrelative?.trim() || q.title
  await emailService.send({
    to: toEmail,
    subject: `Quote rejected by client — ${subjectRef}`,
    html,
    from: fromHeader,
    replyTo,
  })
}

/**
 * Send quote email to client (for first send or resend).
 * From: verified sender (Resend) with company name; Reply-To: company email from Settings.
 * Requires client to have an email.
 */
export async function sendQuoteEmail(
  businessId: string,
  quoteId: string,
  options?: {
    from?: string
    replyTo?: string
    subject?: string
    message?: string
    to?: string
    sendMeCopy?: boolean
    sendViaWhatsapp?: boolean
    selectedAttachmentIds?: string[]
    additionalAttachments?: Array<{
      filename: string
      content: Buffer
      contentType?: string | null
    }>
    requesterEmail?: string
  }
) {
  await ensureBusinessExists(businessId)

  const q = await prisma.quote.findFirst({
    where: { id: quoteId, businessId },
    include: {
      client: { select: { id: true, name: true, email: true } },
      assignedTo: { include: { user: { select: { name: true } } } },
      lineItems: { select: { name: true, quantity: true, price: true } },
      business: { include: { settings: { select: { replyToEmail: true } } } },
    },
  })
  if (!q) {
    throw new WorkOrderNotFoundError()
  }

  const toEmail = (options?.to ?? q.client.email)?.trim()
  if (!toEmail) {
    throw new Error('Client has no email address. Add an email to the client to send the quote.')
  }

  const companyReplyTo =
    options?.replyTo?.trim() || q.business.settings?.replyToEmail?.trim() || q.business.email
  const displayName = q.business.name?.trim() || 'Company'
  const actionToken = q.quoteClientActionToken ?? crypto.randomUUID().replace(/-/g, '')
  if (!q.quoteClientActionToken) {
    await prisma.quote.update({
      where: { id: q.id },
      data: { quoteClientActionToken: actionToken },
    })
  }
  const fromHeader = options?.from?.trim() || clientToCustomerFrom(displayName)
  const subject =
    options?.subject ??
    `Quote from ${displayName} - ${q.title} ${q.quoteCorrelative ?? ''}`.trim()
  const approveUrl = buildClientQuoteActionUrl(actionToken, 'approve')
  const rejectUrl = buildClientQuoteActionUrl(actionToken, 'reject')
  const htmlBase =
    options?.message ??
    (await renderEmailTemplate('quote-created', {
      clientName: q.client.name,
      businessName: displayName,
      quoteNumber: q.quoteNumber ?? `#${q.id}`,
      quoteReference: q.quoteCorrelative ?? undefined,
      title: q.title,
      address: q.address ?? 'To be confirmed',
      date: formatQuoteDate(q.scheduledAt),
      timeRange: formatQuoteTimeRange(q.startTime, q.endTime, q.scheduledAt),
      assignedTeamMemberName: q.assignedTo?.user?.name ?? 'Our team',
      lineItemsSummary: summarizeQuoteLineItems(q.lineItems),
      total: formatMoney(q.total),
      logoUrl: q.business.logoUrl ?? undefined,
      approveUrl,
      rejectUrl,
    }))
  const html = options?.message ? appendQuoteActionButtons(htmlBase, approveUrl, rejectUrl) : htmlBase

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

  const builtInAttachments: Array<{
    id: string
    filename: string
    url: string
    contentType: string
  }> = []
  if (q.lastQuotePdfUrl) {
    builtInAttachments.push({
      id: 'quote_pdf',
      filename: 'Quote.pdf',
      url: q.lastQuotePdfUrl,
      contentType: 'application/pdf',
    })
  }
  if (q.lastJobReportPdfUrl) {
    builtInAttachments.push({
      id: 'work_order_summary_pdf',
      filename: 'Work order summary.pdf',
      url: q.lastJobReportPdfUrl,
      contentType: 'application/pdf',
    })
  }

  for (const item of builtInAttachments) {
    if (selectedIds.has(item.id)) {
      const content = await fetchUrlAsBuffer(item.url)
      pushAttachment(item.filename, content, item.contentType)
    }
  }

  if (selectedIds.size > 0) {
    const quoteAttachments = await prisma.quoteAttachment.findMany({
      where: { quoteId },
      select: { id: true, url: true, filename: true, type: true },
    })
    for (const item of quoteAttachments) {
      const id = `qa_${item.id}`
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

  const platformBcc = await resolveClientEmailCopyBcc()
  await emailService.send({
    to: toEmail,
    subject,
    html,
    from: fromHeader,
    replyTo: companyReplyTo,
    ...(platformBcc ? { bcc: platformBcc } : {}),
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

  if (options?.sendViaWhatsapp !== undefined) {
    await prisma.quote.update({
      where: { id: quoteId },
      data: {
        quoteWhatsappStatus: options.sendViaWhatsapp ? 'PENDING' : null,
      },
    })
  }

  return getQuoteById(businessId, quoteId)
}

export async function getQuoteEmailComposeData(businessId: string, quoteId: string) {
  await ensureBusinessExists(businessId)

  const q = await prisma.quote.findFirst({
    where: { id: quoteId, businessId },
    include: {
      client: { select: { id: true, name: true, email: true } },
      assignedTo: { include: { user: { select: { name: true } } } },
      lineItems: { select: { name: true, quantity: true, price: true } },
      business: {
        include: {
          settings: { select: { replyToEmail: true, sendQuoteWhatsappDefault: true } },
        },
      },
    },
  })
  if (!q) {
    throw new WorkOrderNotFoundError()
  }

  const displayName = q.business.name?.trim() || 'Company'
  const actionToken = q.quoteClientActionToken ?? crypto.randomUUID().replace(/-/g, '')
  if (!q.quoteClientActionToken) {
    await prisma.quote.update({
      where: { id: q.id },
      data: { quoteClientActionToken: actionToken },
    })
  }
  const from = clientToCustomerFrom(displayName)
  const replyTo = q.business.settings?.replyToEmail?.trim() || q.business.email
  const subject = `Quote from ${displayName} - ${q.title} ${q.quoteCorrelative ?? ''}`.trim()
  const message = await renderEmailTemplate('quote-created', {
    clientName: q.client.name,
    businessName: displayName,
    quoteNumber: q.quoteNumber ?? `#${q.id}`,
    quoteReference: q.quoteCorrelative ?? undefined,
    title: q.title,
    address: q.address ?? 'To be confirmed',
    date: formatQuoteDate(q.scheduledAt),
    timeRange: formatQuoteTimeRange(q.startTime, q.endTime, q.scheduledAt),
    assignedTeamMemberName: q.assignedTo?.user?.name ?? 'Our team',
    lineItemsSummary: summarizeQuoteLineItems(q.lineItems),
    total: formatMoney(q.total),
    logoUrl: q.business.logoUrl ?? undefined,
    approveUrl: buildClientQuoteActionUrl(actionToken, 'approve'),
    rejectUrl: buildClientQuoteActionUrl(actionToken, 'reject'),
  })
  const attachments: Array<{
    id: string
    label: string
    filename: string
    source: 'QUOTE_PDF' | 'JOB_REPORT_PDF' | 'WORK_ORDER_ATTACHMENT'
    sizeBytes: number | null
    selectedByDefault: boolean
  }> = []

  if (q.lastQuotePdfUrl) {
    attachments.push({
      id: 'quote_pdf',
      label: 'Quote.pdf',
      filename: 'Quote.pdf',
      source: 'QUOTE_PDF',
      sizeBytes: null,
      selectedByDefault: true,
    })
  }
  if (q.lastJobReportPdfUrl) {
    attachments.push({
      id: 'work_order_summary_pdf',
      label: 'Work order summary.pdf',
      filename: 'Work order summary.pdf',
      source: 'JOB_REPORT_PDF',
      sizeBytes: null,
      selectedByDefault: true,
    })
  }

  const quoteAttachments = await prisma.quoteAttachment.findMany({
    where: { quoteId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, filename: true },
  })
  for (const item of quoteAttachments) {
    attachments.push({
      id: `qa_${item.id}`,
      label: item.filename ?? 'Attachment',
      filename: item.filename ?? 'Attachment',
      source: 'WORK_ORDER_ATTACHMENT',
      sizeBytes: null,
      selectedByDefault: false,
    })
  }

  return {
    quoteId: q.id,
    from,
    replyTo,
    to: q.client.email ?? null,
    subject,
    message,
    sendMeCopyDefault: false,
    sendViaWhatsappDefault: q.business.settings?.sendQuoteWhatsappDefault ?? false,
    maxAdditionalAttachmentsBytes: 10 * 1024 * 1024,
    attachments,
  }
}

export async function clientApproveQuoteByToken(token: string) {
  const row = await prisma.quote.findFirst({
    where: { quoteClientActionToken: token },
    select: { id: true, businessId: true, clientId: true, quoteStatus: true, quoteCorrelative: true },
  })
  if (!row) {
    throw new WorkOrderNotFoundError()
  }
  const terminalStates: QuoteStatus[] = ['CONVERTED', 'REJECTED', 'EXPIRED']
  if (terminalStates.includes(row.quoteStatus)) {
    throw new QuoteTerminalStateError()
  }
  await prisma.quote.update({
    where: { id: row.id },
    data: {
      quoteStatus: 'APPROVED',
      quoteApprovedAt: new Date(),
      quoteClientRespondedAt: new Date(),
      quoteClientRejectionReason: null,
    },
  })
  return row
}

/** Resolve quote id for the token-based reject HTML page. */
export async function resolveClientRejectFormQuote(token: string): Promise<
  | { ok: true; quoteId: string }
  | { ok: false; kind: 'not_found' | 'terminal' }
> {
  const row = await prisma.quote.findFirst({
    where: { quoteClientActionToken: token },
    select: { id: true, quoteStatus: true },
  })
  if (!row) {
    return { ok: false, kind: 'not_found' }
  }
  const terminalStates: QuoteStatus[] = ['CONVERTED', 'REJECTED', 'EXPIRED']
  if (terminalStates.includes(row.quoteStatus)) {
    return { ok: false, kind: 'terminal' }
  }
  return { ok: true, quoteId: row.id }
}

/** Public reject API: body is `{ quoteId, reason }` only (no token). */
export async function clientRejectQuoteByQuoteId(quoteId: string, reason: string) {
  const row = await prisma.quote.findFirst({
    where: { id: quoteId },
    select: { id: true, businessId: true, clientId: true, quoteStatus: true, quoteCorrelative: true },
  })
  if (!row) {
    throw new WorkOrderNotFoundError()
  }
  const terminalStates: QuoteStatus[] = ['CONVERTED', 'REJECTED', 'EXPIRED']
  if (terminalStates.includes(row.quoteStatus)) {
    throw new QuoteTerminalStateError()
  }
  await prisma.quote.update({
    where: { id: row.id },
    data: {
      quoteStatus: 'REJECTED',
      quoteRejectedAt: new Date(),
      quoteClientRespondedAt: new Date(),
      quoteClientRejectionReason: reason.trim(),
    },
  })

  try {
    if (await isPlatformNotificationRuleActive(PlatformNotificationEventKey.QUOTE_REJECTED_BY_CLIENT)) {
      await sendQuoteRejectedByClientNotification({
        quoteId: row.id,
        rejectionReason: reason.trim(),
      })
    }
  } catch (err) {
    console.error('[quote] Failed to notify business of client quote rejection:', err)
  }

  return row
}

/**
 * Approve quote action (§6.1).
 * Can be triggered manually by business owner OR via public approval link.
 */
export async function approveQuote(businessId: string, quoteId: string) {
  await ensureBusinessExists(businessId)

  const row = await prisma.quote.findFirst({
    where: { id: quoteId, businessId },
    select: { id: true, quoteStatus: true },
  })
  if (!row) {
    throw new WorkOrderNotFoundError()
  }

  const terminalStates: QuoteStatus[] = ['CONVERTED', 'REJECTED', 'EXPIRED']
  if (terminalStates.includes(row.quoteStatus)) {
    throw new QuoteTerminalStateError()
  }

  await prisma.quote.update({
    where: { id: quoteId },
    data: {
      quoteStatus: 'APPROVED',
      quoteApprovedAt: new Date(),
    },
  })

  return getQuoteById(businessId, quoteId)
}

/**
 * Reject quote action (§6.1).
 */
export async function rejectQuote(businessId: string, quoteId: string) {
  await ensureBusinessExists(businessId)

  const row = await prisma.quote.findFirst({
    where: { id: quoteId, businessId },
    select: { id: true, quoteStatus: true },
  })
  if (!row) {
    throw new WorkOrderNotFoundError()
  }

  const terminalStates: QuoteStatus[] = ['CONVERTED', 'REJECTED', 'EXPIRED']
  if (terminalStates.includes(row.quoteStatus)) {
    throw new QuoteTerminalStateError()
  }

  await prisma.quote.update({
    where: { id: quoteId },
    data: {
      quoteStatus: 'REJECTED',
      quoteRejectedAt: new Date(),
    },
  })

  return getQuoteById(businessId, quoteId)
}

/**
 * When a job work order linked via `relatedWorkOrderId` reaches an in-progress state,
 * mark an APPROVED quote as CONVERTED.
 */
export async function convertQuoteIfEligible(businessId: string, workOrderId: string): Promise<void> {
  const wo = await prisma.workOrder.findFirst({
    where: { id: workOrderId, businessId },
    select: { jobStatus: true },
  })
  if (!wo) {
    return
  }

  const eligibleJobStatuses = ['SCHEDULED', 'ON_MY_WAY', 'IN_PROGRESS', 'COMPLETED']
  if (!eligibleJobStatuses.includes(wo.jobStatus)) {
    return
  }

  await prisma.quote.updateMany({
    where: {
      businessId,
      relatedWorkOrderId: workOrderId,
      quoteStatus: 'APPROVED',
    },
    data: {
      quoteStatus: 'CONVERTED',
      quoteConvertedAt: new Date(),
      convertedToWorkOrderId: workOrderId,
    },
  })
}

/**
 * Expire quotes (background job — run every hour via cron).
 */
export async function expireOverdueQuotes(): Promise<number> {
  const result = await prisma.quote.updateMany({
    where: {
      quoteStatus: 'AWAITING_RESPONSE',
      quoteExpiresAt: { lt: new Date() },
    },
    data: {
      quoteStatus: 'EXPIRED',
      quoteExpiredAt: new Date(),
    },
  })
  return result.count
}

/**
 * Quote status overview counts (Quotes list view).
 */
export async function getQuoteOverview(businessId: string) {
  await ensureBusinessExists(businessId)

  const counts = await prisma.quote.groupBy({
    by: ['quoteStatus'],
    where: { businessId },
    _count: { id: true },
  })

  return counts.map(c => ({ status: c.quoteStatus, count: c._count.id }))
}
