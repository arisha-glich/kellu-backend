/**
 * Quote Management – quotes are WorkOrders with quoteRequired = true.
 * "New Quote" modal → POST /quotes → creates WorkOrder { quoteRequired: true }.
 * "Quotes list" → GET /quotes → lists WorkOrders filtered by quoteRequired = true.
 * All quote status transitions live here (send, approve, reject, convert, expire).
 */

import type { JobStatus, QuoteStatus } from '~/generated/prisma'
import { Prisma } from '~/generated/prisma'
import prisma from '~/lib/prisma'
import { BusinessNotFoundError } from '~/services/business.service'
import { emailService } from '~/services/email.service'
import { clientToCustomerFrom } from '~/services/email-helpers'
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

/** Default HTML body when no message is provided. */
const defaultQuoteEmailMessage = (clientName: string, businessName: string, title: string) =>
  `<!DOCTYPE html><html><body style="font-family: sans-serif; line-height: 1.5;">` +
  `<p>Dear ${clientName},</p>` +
  `<p>Please find your quote from <strong>${businessName}</strong> for <strong>${title}</strong>.</p>` +
  `<p>If you have any questions, please reply to this email.</p>` +
  `<p>Best regards,<br/>${businessName}</p>` +
  `</body></html>`

/**
 * Send quote email to client (for first send or resend).
 * From: verified sender (Resend) with company name; Reply-To: company email from Settings.
 * Requires client to have an email.
 */
export async function sendQuoteEmail(
  businessId: string,
  workOrderId: string,
  options?: { subject?: string; message?: string; to?: string }
) {
  await ensureBusinessExists(businessId)

  const wo = await prisma.workOrder.findFirst({
    where: { id: workOrderId, businessId, quoteRequired: true },
    include: {
      client: { select: { id: true, name: true, email: true } },
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

  const companyReplyTo = wo.business.settings?.replyToEmail?.trim() || wo.business.email
  const displayName = wo.business.name?.trim() || 'Company'
  // Use verified sender for From (Resend only allows verified domains); replies go to Reply-To
  const fromHeader = clientToCustomerFrom(displayName)
  const subject =
    options?.subject ??
    `Quote from ${displayName} - ${wo.title} ${wo.quoteCorrelative ?? ''}`.trim()
  const html = options?.message ?? defaultQuoteEmailMessage(wo.client.name, displayName, wo.title)

  await emailService.send({
    to: toEmail,
    subject,
    html,
    from: fromHeader,
    replyTo: companyReplyTo,
  })

  return getQuoteById(businessId, workOrderId)
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
