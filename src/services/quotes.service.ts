/**
 * Quote Management – quotes are WorkOrders with quoteRequired = true.
 * "New Quote" modal → POST /quotes → creates WorkOrder { quoteRequired: true }.
 * "Quotes list" → GET /quotes → lists WorkOrders filtered by quoteRequired = true.
 * All quote status transitions live here (send, approve, reject, convert, expire).
 */

import type { JobStatus, QuoteStatus } from '~/generated/prisma'
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

/** Generate next work order number (shared with workorder service). */
async function nextWorkOrderNumber(businessId: string): Promise<string> {
  const last = await prisma.workOrder.findFirst({
    where: { businessId },
    orderBy: { createdAt: 'desc' },
    select: { workOrderNumber: true },
  })
  if (!last?.workOrderNumber) {
    return '1'
  }
  const num = Number.parseInt(last.workOrderNumber.replace(/^#/, ''), 10)
  return String(Number.isNaN(num) ? 1 : num + 1)
}

/** Derive job status from schedule/assignee (same logic as workorder.service; used for quote update). */
function deriveJobStatus(data: {
  scheduledAt?: Date | null
  startTime?: string | null
  assignedToId?: string | null
}): JobStatus {
  const hasSchedule = !!(data.scheduledAt ?? data.startTime)
  if (!hasSchedule) {
    return 'UNSCHEDULED'
  }
  if (!data.assignedToId) {
    return 'UNASSIGNED'
  }
  return 'SCHEDULED'
}

/** Get the full quote (WorkOrder) with client, line items, payments, assignee. */
async function getQuoteById(businessId: string, workOrderId: string) {
  const wo = await prisma.workOrder.findFirst({
    where: { id: workOrderId, businessId, quoteRequired: true },
    include: {
      client: {
        select: { id: true, name: true, email: true, phone: true, address: true },
      },
      assignedTo: {
        include: { user: { select: { id: true, name: true, email: true } } },
      },
      lineItems: true,
      payments: true,
      expenses: true,
    },
  })
  if (!wo) {
    throw new WorkOrderNotFoundError()
  }
  return wo
}

/** Recalculate quote financials from line items. */
async function recalculateQuoteFinancials(
  workOrderId: string,
  tx?: Omit<
    typeof prisma,
    '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
  >
): Promise<void> {
  const db = tx ?? prisma
  const wo = await db.workOrder.findUnique({
    where: { id: workOrderId },
    select: { discount: true, discountType: true },
  })
  if (!wo) {
    return
  }

  const lineItems = await db.lineItem.findMany({
    where: { workOrderId },
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

  const discountVal = toNum(wo.discount)
  const discountAmount =
    wo.discountType === 'PERCENTAGE' ? (subtotal * discountVal) / 100 : discountVal
  const total = subtotal - discountAmount
  const amountPaid = 0 // quotes have no payments yet

  await db.workOrder.update({
    where: { id: workOrderId },
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

/**
 * List quotes (WorkOrders where quoteRequired = true) with search + filter.
 * Maps to the "Quotes" left-nav list view.
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

  const where: Prisma.WorkOrderWhereInput = {
    businessId,
    quoteRequired: true, // ← the only difference from listWorkOrders
  }

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

  const [items, total] = await Promise.all([
    prisma.workOrder.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sortBy]: order },
      include: {
        client: { select: { id: true, name: true, email: true, phone: true } },
        assignedTo: {
          select: { id: true, user: { select: { name: true, email: true } } },
        },
        lineItems: { select: { id: true, quantity: true, price: true } },
      },
    }),
    prisma.workOrder.count({ where }),
  ])

  return {
    data: items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  }
}

/**
 * Create a new quote.
 * Internally creates a WorkOrder with quoteRequired = true, quoteStatus = NOT_SENT.
 * This is what "Save Quote" button triggers.
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

  const workOrderNumber = `#${await nextWorkOrderNumber(businessId)}`

  // Pre-fill T&C from BusinessSettings
  const settings = await prisma.businessSettings.findUnique({
    where: { businessId },
    select: { quoteTermsConditions: true, quoteExpirationDays: true },
  })

  const wo = await prisma.$transaction(async tx => {
    const created = await tx.workOrder.create({
      data: {
        businessId,
        clientId: input.clientId,
        title: input.title,
        address: input.address,
        instructions: input.instructions ?? null,
        notes: input.notes ?? null,
        assignedToId: input.assignedToId ?? null,
        workOrderNumber,

        // Quote-specific defaults
        quoteRequired: true,
        quoteStatus: 'NOT_SENT',
        quoteTermsConditions: input.quoteTermsConditions ?? settings?.quoteTermsConditions ?? null,

        // Job defaults
        isScheduleLater: true, // quotes don't require schedule at creation
        jobStatus: 'UNSCHEDULED',

        // Invoice defaults
        invoiceStatus: 'NOT_SENT',

        discount: 0,
        discountType: null,
      },
    })

    if (input.lineItems?.length) {
      await tx.lineItem.createMany({
        data: input.lineItems.map(li => ({
          workOrderId: created.id,
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

    await recalculateQuoteFinancials(created.id, tx)
    return created
  })

  return getQuoteById(businessId, wo.id)
}

/**
 * Get single quote by ID.
 * Only returns WorkOrders where quoteRequired = true.
 */
export async function getQuote(businessId: string, workOrderId: string) {
  await ensureBusinessExists(businessId)
  return getQuoteById(businessId, workOrderId)
}

/** Client-facing rejection copy saved when the customer rejects via the public flow. */
export async function getQuoteRejectionReason(businessId: string, quoteId: string) {
  await ensureBusinessExists(businessId)
  const wo = await prisma.workOrder.findFirst({
    where: { id: quoteId, businessId, quoteRequired: true },
    select: {
      id: true,
      quoteStatus: true,
      quoteClientRejectionReason: true,
      quoteRejectedAt: true,
      quoteClientRespondedAt: true,
    },
  })
  if (!wo) {
    throw new WorkOrderNotFoundError()
  }
  return {
    quoteId: wo.id,
    quoteStatus: wo.quoteStatus,
    rejectionReason: wo.quoteClientRejectionReason,
    quoteRejectedAt: wo.quoteRejectedAt,
    quoteClientRespondedAt: wo.quoteClientRespondedAt,
  }
}

/**
 * Update quote (work order) fields. quoteStatus is never editable via this — use actions (send, approve, reject, setAwaitingResponse).
 */
export async function updateQuote(
  businessId: string,
  workOrderId: string,
  input: UpdateQuoteInput
) {
  await ensureBusinessExists(businessId)

  const existing = await prisma.workOrder.findFirst({
    where: { id: workOrderId, businessId, quoteRequired: true },
    select: {
      id: true,
      scheduledAt: true,
      startTime: true,
      assignedToId: true,
    },
  })
  if (!existing) {
    throw new WorkOrderNotFoundError()
  }

  const jobStatus =
    input.scheduledAt !== undefined ||
    input.startTime !== undefined ||
    input.assignedToId !== undefined
      ? deriveJobStatus({
          scheduledAt: input.scheduledAt,
          startTime: input.startTime,
          assignedToId: input.assignedToId,
        })
      : undefined

  await prisma.$transaction(async tx => {
    const updateData: Parameters<typeof prisma.workOrder.update>[0]['data'] = {
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
      ...(jobStatus != null && { jobStatus }),
    }

    await tx.workOrder.update({ where: { id: workOrderId }, data: updateData })

    if (input.lineItems) {
      await tx.lineItem.deleteMany({ where: { workOrderId } })
      if (input.lineItems.length > 0) {
        await tx.lineItem.createMany({
          data: input.lineItems.map(li => ({
            workOrderId,
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

    await recalculateQuoteFinancials(workOrderId, tx)
  })

  return getQuoteById(businessId, workOrderId)
}

/**
 * Delete quote (work order with quoteRequired=true). Cascades to line items, payments, etc.
 */
export async function deleteQuote(businessId: string, workOrderId: string) {
  await ensureBusinessExists(businessId)

  const existing = await prisma.workOrder.findFirst({
    where: { id: workOrderId, businessId, quoteRequired: true },
    select: { id: true },
  })
  if (!existing) {
    throw new WorkOrderNotFoundError()
  }

  await prisma.workOrder.delete({ where: { id: workOrderId } })
}

/**
 * Manually set quote status to AWAITING_RESPONSE (spec: "Awaiting response: also can be set manually").
 * Only allowed when current status is NOT_SENT. Sets sent_at and expires_at per settings.
 */
export async function setQuoteAwaitingResponse(businessId: string, workOrderId: string) {
  await ensureBusinessExists(businessId)

  const wo = await prisma.workOrder.findFirst({
    where: { id: workOrderId, businessId, quoteRequired: true },
    select: { id: true, quoteStatus: true },
  })
  if (!wo) {
    throw new WorkOrderNotFoundError()
  }
  if (wo.quoteStatus !== 'NOT_SENT') {
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

  await prisma.workOrder.update({
    where: { id: workOrderId },
    data: {
      quoteStatus: 'AWAITING_RESPONSE',
      quoteSentAt: now,
      quoteExpiresAt: expiresAt,
    },
  })

  return getQuoteById(businessId, workOrderId)
}

/**
 * Send quote action (§6.2.1).
 * Sets quoteStatus = AWAITING_RESPONSE, records timestamps, generates correlative.
 * Blocks if no line items exist (spec: "Sent Quote blocked if no Line items specified").
 */
export async function sendQuote(
  businessId: string,
  workOrderId: string,
  options?: { observations?: string }
) {
  await ensureBusinessExists(businessId)

  const wo = await prisma.workOrder.findFirst({
    where: { id: workOrderId, businessId, quoteRequired: true },
    include: { lineItems: { select: { id: true } } },
  })
  if (!wo) {
    throw new WorkOrderNotFoundError()
  }

  // Block if terminal state
  const terminalStates: QuoteStatus[] = ['CONVERTED', 'REJECTED', 'EXPIRED']
  if (terminalStates.includes(wo.quoteStatus)) {
    throw new QuoteTerminalStateError()
  }

  // Block if no line items (spec requirement)
  const lineItemCount = await prisma.lineItem.count({ where: { workOrderId } })
  if (lineItemCount === 0) {
    throw new QuoteNoLineItemsError()
  }

  // Get settings for expiry days
  const settings = await prisma.businessSettings.findUnique({
    where: { businessId },
    select: { quoteExpirationDays: true },
  })
  const expirationDays = settings?.quoteExpirationDays ?? 7

  const now = new Date()
  const expiresAt = new Date(now)
  expiresAt.setDate(expiresAt.getDate() + expirationDays)

  // Increment version on resend
  const currentVersion = wo.quoteVersion ?? 1
  const newVersion = wo.quoteSentAt ? currentVersion + 1 : currentVersion

  // Generate correlative: #workOrderNumber_YYYY-MM-DD
  const dateStr = now.toISOString().slice(0, 10)
  const quoteCorrelative = `Q-${workOrderId.slice(-4)}-${dateStr}-v${newVersion}`

  await prisma.workOrder.update({
    where: { id: workOrderId },
    data: {
      quoteStatus: 'AWAITING_RESPONSE',
      quoteSentAt: now,
      quoteExpiresAt: expiresAt,
      quoteVersion: newVersion,
      quoteCorrelative,
      ...(options?.observations && { quoteObservations: options.observations }),
    },
  })

  return getQuoteById(businessId, workOrderId)
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
  workOrderId: string
  rejectionReason: string
}): Promise<void> {
  const wo = await prisma.workOrder.findFirst({
    where: { id: params.workOrderId, quoteRequired: true },
    include: {
      client: { select: { name: true } },
      business: {
        include: {
          settings: { select: { notificationEmail: true } },
        },
      },
    },
  })
  if (!wo) {
    return
  }

  const toEmail =
    wo.business.settings?.notificationEmail?.trim() || wo.business.email?.trim()
  if (!toEmail) {
    console.warn('[quote] No business email for quote rejection notification', wo.id)
    return
  }

  const displayName = wo.business.name?.trim() || 'Company'
  const noReply = Bun.env.RESEND_FROM_EMAIL?.trim() || 'noresponder@notificaciones.kellu.co'
  const kelluName = Bun.env.RESEND_KELLU_FROM_NAME?.trim() || 'Kellu'
  const fromHeader = `${kelluName} <${noReply}>`
  const replyTo = Bun.env.RESEND_KELLU_REPLY_TO?.trim() || 'equipo@kellu.co'
  const base = (Bun.env.FRONTEND_URL?.trim() || 'http://localhost:3000').replace(/\/$/, '')
  const dashboardUrl = `${base}/dashboard`

  const html = await renderEmailTemplate('quote-rejected-by-client', {
    businessName: displayName,
    clientName: wo.client.name,
    quoteNumber: wo.workOrderNumber ?? `#${wo.id}`,
    quoteReference: wo.quoteCorrelative ?? undefined,
    title: wo.title,
    rejectionReason: params.rejectionReason,
    logoUrl: wo.business.logoUrl ?? undefined,
    dashboardUrl,
  })

  const subjectRef = wo.quoteCorrelative?.trim() || wo.title
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
  workOrderId: string,
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

  const wo = await prisma.workOrder.findFirst({
    where: { id: workOrderId, businessId, quoteRequired: true },
    include: {
      client: { select: { id: true, name: true, email: true } },
      assignedTo: { include: { user: { select: { name: true } } } },
      lineItems: { select: { name: true, quantity: true, price: true } },
      business: { include: { settings: { select: { replyToEmail: true } } } },
    },
  })
  if (!wo) {
    throw new WorkOrderNotFoundError()
  }

  const toEmail = (options?.to ?? wo.client.email)?.trim()
  if (!toEmail) {
    throw new Error('Client has no email address. Add an email to the client to send the quote.')
  }

  const companyReplyTo =
    options?.replyTo?.trim() || wo.business.settings?.replyToEmail?.trim() || wo.business.email
  const displayName = wo.business.name?.trim() || 'Company'
  const actionToken = wo.quoteClientActionToken ?? crypto.randomUUID().replace(/-/g, '')
  if (!wo.quoteClientActionToken) {
    await prisma.workOrder.update({
      where: { id: wo.id },
      data: { quoteClientActionToken: actionToken },
    })
  }
  // Use verified sender for From (Resend only allows verified domains); replies go to Reply-To
  const fromHeader = options?.from?.trim() || clientToCustomerFrom(displayName)
  const subject =
    options?.subject ??
    `Quote from ${displayName} - ${wo.title} ${wo.quoteCorrelative ?? ''}`.trim()
  const approveUrl = buildClientQuoteActionUrl(actionToken, 'approve')
  const rejectUrl = buildClientQuoteActionUrl(actionToken, 'reject')
  const htmlBase =
    options?.message ??
    (await renderEmailTemplate('quote-created', {
      clientName: wo.client.name,
      businessName: displayName,
      quoteNumber: wo.workOrderNumber ?? `#${wo.id}`,
      quoteReference: wo.quoteCorrelative ?? undefined,
      title: wo.title,
      address: wo.address ?? 'To be confirmed',
      date: formatQuoteDate(wo.scheduledAt),
      timeRange: formatQuoteTimeRange(wo.startTime, wo.endTime, wo.scheduledAt),
      assignedTeamMemberName: wo.assignedTo?.user?.name ?? 'Our team',
      lineItemsSummary: summarizeQuoteLineItems(wo.lineItems),
      total: formatMoney(wo.total),
      logoUrl: wo.business.logoUrl ?? undefined,
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
  if (wo.lastQuotePdfUrl) {
    builtInAttachments.push({
      id: 'quote_pdf',
      filename: 'Quote.pdf',
      url: wo.lastQuotePdfUrl,
      contentType: 'application/pdf',
    })
  }
  if (wo.lastJobReportPdfUrl) {
    builtInAttachments.push({
      id: 'work_order_summary_pdf',
      filename: 'Work order summary.pdf',
      url: wo.lastJobReportPdfUrl,
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
    const workOrderAttachments = await prisma.workOrderAttachment.findMany({
      where: { workOrderId },
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
    await prisma.workOrder.update({
      where: { id: workOrderId },
      data: {
        quoteWhatsappStatus: options.sendViaWhatsapp ? 'PENDING' : null,
      },
    })
  }

  return getQuoteById(businessId, workOrderId)
}

export async function getQuoteEmailComposeData(businessId: string, workOrderId: string) {
  await ensureBusinessExists(businessId)

  const wo = await prisma.workOrder.findFirst({
    where: { id: workOrderId, businessId, quoteRequired: true },
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
  if (!wo) {
    throw new WorkOrderNotFoundError()
  }

  const displayName = wo.business.name?.trim() || 'Company'
  const actionToken = wo.quoteClientActionToken ?? crypto.randomUUID().replace(/-/g, '')
  if (!wo.quoteClientActionToken) {
    await prisma.workOrder.update({
      where: { id: wo.id },
      data: { quoteClientActionToken: actionToken },
    })
  }
  const from = clientToCustomerFrom(displayName)
  const replyTo = wo.business.settings?.replyToEmail?.trim() || wo.business.email
  const subject = `Quote from ${displayName} - ${wo.title} ${wo.quoteCorrelative ?? ''}`.trim()
  const message = await renderEmailTemplate('quote-created', {
    clientName: wo.client.name,
    businessName: displayName,
    quoteNumber: wo.workOrderNumber ?? `#${wo.id}`,
    quoteReference: wo.quoteCorrelative ?? undefined,
    title: wo.title,
    address: wo.address ?? 'To be confirmed',
    date: formatQuoteDate(wo.scheduledAt),
    timeRange: formatQuoteTimeRange(wo.startTime, wo.endTime, wo.scheduledAt),
    assignedTeamMemberName: wo.assignedTo?.user?.name ?? 'Our team',
    lineItemsSummary: summarizeQuoteLineItems(wo.lineItems),
    total: formatMoney(wo.total),
    logoUrl: wo.business.logoUrl ?? undefined,
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

  if (wo.lastQuotePdfUrl) {
    attachments.push({
      id: 'quote_pdf',
      label: 'Quote.pdf',
      filename: 'Quote.pdf',
      source: 'QUOTE_PDF',
      sizeBytes: null,
      selectedByDefault: true,
    })
  }
  if (wo.lastJobReportPdfUrl) {
    attachments.push({
      id: 'work_order_summary_pdf',
      label: 'Work order summary.pdf',
      filename: 'Work order summary.pdf',
      source: 'JOB_REPORT_PDF',
      sizeBytes: null,
      selectedByDefault: true,
    })
  }

  const workOrderAttachments = await prisma.workOrderAttachment.findMany({
    where: { workOrderId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, filename: true },
  })
  for (const item of workOrderAttachments) {
    attachments.push({
      id: `woa_${item.id}`,
      label: item.filename ?? 'Attachment',
      filename: item.filename ?? 'Attachment',
      source: 'WORK_ORDER_ATTACHMENT',
      sizeBytes: null,
      selectedByDefault: false,
    })
  }

  return {
    quoteId: wo.id,
    from,
    replyTo,
    to: wo.client.email ?? null,
    subject,
    message,
    sendMeCopyDefault: false,
    sendViaWhatsappDefault: wo.business.settings?.sendQuoteWhatsappDefault ?? false,
    maxAdditionalAttachmentsBytes: 10 * 1024 * 1024,
    attachments,
  }
}

export async function clientApproveQuoteByToken(token: string) {
  const wo = await prisma.workOrder.findFirst({
    where: { quoteClientActionToken: token, quoteRequired: true },
    select: { id: true, businessId: true, clientId: true, quoteStatus: true, quoteCorrelative: true },
  })
  if (!wo) {
    throw new WorkOrderNotFoundError()
  }
  const terminalStates: QuoteStatus[] = ['CONVERTED', 'REJECTED', 'EXPIRED']
  if (terminalStates.includes(wo.quoteStatus)) {
    throw new QuoteTerminalStateError()
  }
  await prisma.workOrder.update({
    where: { id: wo.id },
    data: {
      quoteStatus: 'APPROVED',
      quoteApprovedAt: new Date(),
      quoteClientRespondedAt: new Date(),
      quoteClientRejectionReason: null,
    },
  })
  return wo
}

/** Resolve work order id for the token-based reject HTML page (email link still uses token in query). */
export async function resolveClientRejectFormQuote(token: string): Promise<
  | { ok: true; quoteId: string }
  | { ok: false; kind: 'not_found' | 'terminal' }
> {
  const wo = await prisma.workOrder.findFirst({
    where: { quoteClientActionToken: token, quoteRequired: true },
    select: { id: true, quoteStatus: true },
  })
  if (!wo) {
    return { ok: false, kind: 'not_found' }
  }
  const terminalStates: QuoteStatus[] = ['CONVERTED', 'REJECTED', 'EXPIRED']
  if (terminalStates.includes(wo.quoteStatus)) {
    return { ok: false, kind: 'terminal' }
  }
  return { ok: true, quoteId: wo.id }
}

/** Public reject API: body is `{ quoteId, reason }` only (no token). */
export async function clientRejectQuoteByQuoteId(quoteId: string, reason: string) {
  const wo = await prisma.workOrder.findFirst({
    where: { id: quoteId, quoteRequired: true },
    select: { id: true, businessId: true, clientId: true, quoteStatus: true, quoteCorrelative: true },
  })
  if (!wo) {
    throw new WorkOrderNotFoundError()
  }
  const terminalStates: QuoteStatus[] = ['CONVERTED', 'REJECTED', 'EXPIRED']
  if (terminalStates.includes(wo.quoteStatus)) {
    throw new QuoteTerminalStateError()
  }
  await prisma.workOrder.update({
    where: { id: wo.id },
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
        workOrderId: wo.id,
        rejectionReason: reason.trim(),
      })
    }
  } catch (err) {
    console.error('[quote] Failed to notify business of client quote rejection:', err)
  }

  return wo
}

/**
 * Approve quote action (§6.1).
 * Can be triggered manually by business owner OR via public approval link.
 */
export async function approveQuote(businessId: string, workOrderId: string) {
  await ensureBusinessExists(businessId)

  const wo = await prisma.workOrder.findFirst({
    where: { id: workOrderId, businessId, quoteRequired: true },
    select: { id: true, quoteStatus: true },
  })
  if (!wo) {
    throw new WorkOrderNotFoundError()
  }

  const terminalStates: QuoteStatus[] = ['CONVERTED', 'REJECTED', 'EXPIRED']
  if (terminalStates.includes(wo.quoteStatus)) {
    throw new QuoteTerminalStateError()
  }

  await prisma.workOrder.update({
    where: { id: workOrderId },
    data: {
      quoteStatus: 'APPROVED',
      quoteApprovedAt: new Date(),
    },
  })

  return getQuoteById(businessId, workOrderId)
}

/**
 * Reject quote action (§6.1).
 */
export async function rejectQuote(businessId: string, workOrderId: string) {
  await ensureBusinessExists(businessId)

  const wo = await prisma.workOrder.findFirst({
    where: { id: workOrderId, businessId, quoteRequired: true },
    select: { id: true, quoteStatus: true },
  })
  if (!wo) {
    throw new WorkOrderNotFoundError()
  }

  const terminalStates: QuoteStatus[] = ['CONVERTED', 'REJECTED', 'EXPIRED']
  if (terminalStates.includes(wo.quoteStatus)) {
    throw new QuoteTerminalStateError()
  }

  await prisma.workOrder.update({
    where: { id: workOrderId },
    data: {
      quoteStatus: 'REJECTED',
      quoteRejectedAt: new Date(),
    },
  })

  return getQuoteById(businessId, workOrderId)
}

/**
 * Convert quote (automatic — triggered when jobStatus advances).
 * Called internally by workorder service on job status change.
 * Spec: if quoteStatus=APPROVED and jobStatus IN [SCHEDULED, ON_MY_WAY, IN_PROGRESS, COMPLETED]
 */
export async function convertQuoteIfEligible(
  businessId: string,
  workOrderId: string
): Promise<void> {
  const wo = await prisma.workOrder.findFirst({
    where: { id: workOrderId, businessId },
    select: { quoteStatus: true, jobStatus: true },
  })
  if (!wo) {
    return
  }
  if (wo.quoteStatus !== 'APPROVED') {
    return
  }

  const eligibleJobStatuses = ['SCHEDULED', 'ON_MY_WAY', 'IN_PROGRESS', 'COMPLETED']
  if (!eligibleJobStatuses.includes(wo.jobStatus)) {
    return
  }

  await prisma.workOrder.update({
    where: { id: workOrderId },
    data: {
      quoteStatus: 'CONVERTED',
      quoteConvertedAt: new Date(),
    },
  })
}

/**
 * Expire quotes (background job — run every hour via cron).
 * Spec: if now > quoteExpiresAt AND quoteStatus = AWAITING_RESPONSE → EXPIRED
 */
export async function expireOverdueQuotes(): Promise<number> {
  const result = await prisma.workOrder.updateMany({
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
 * Quote status overview counts (for the overview block on the Quotes list view).
 */
export async function getQuoteOverview(businessId: string) {
  await ensureBusinessExists(businessId)

  const counts = await prisma.workOrder.groupBy({
    by: ['quoteStatus'],
    where: { businessId, quoteRequired: true },
    _count: { id: true },
  })

  return counts.map(c => ({ status: c.quoteStatus, count: c._count.id }))
}
