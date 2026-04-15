/**
 * Workorder Management – §6 of Business Owner Panel spec.
 * List view, overview blocks (quote/job/invoice status counts), create/update/delete,
 * financials (subtotal, discount, tax, total, cost, amountPaid, balance), job status derivation.
 */

import type { DiscountType, InvoiceStatus, JobStatus, QuoteStatus } from '~/generated/prisma'
import { Prisma } from '~/generated/prisma'
import prisma from '~/lib/prisma'
import { BusinessNotFoundError } from '~/services/business.service'
import { emailService } from '~/services/email.service'
import {
  clientToCustomerFrom,
  sendBookingConfirmationEmail,
  sendCustomerReminderEmail,
  sendWorkOrderAssignedToTeamMemberEmail,
  sendWorkOrderCreatedEmail,
} from '~/services/email-helpers'

export class WorkOrderNotFoundError extends Error {
  constructor() {
    super('WORK_ORDER_NOT_FOUND')
  }
}

export class ClientNotFoundError extends Error {
  constructor() {
    super('CLIENT_NOT_FOUND')
  }
}

export class WorkOrderAssigneeNotFoundError extends Error {
  constructor() {
    super('WORK_ORDER_ASSIGNEE_NOT_FOUND')
  }
}

export class PaymentNotFoundError extends Error {
  constructor() {
    super('PAYMENT_NOT_FOUND')
  }
}

export interface WorkOrderListFilters {
  search?: string
  jobStatus?: JobStatus
  invoiceStatus?: InvoiceStatus
  page?: number
  limit?: number
  sortBy?: 'scheduledAt' | 'createdAt' | 'updatedAt' | 'title'
  order?: 'asc' | 'desc'
}

export interface WorkOrderOverview {
  quoteStatus: { status: QuoteStatus; count: number }[]
  jobStatus: { status: JobStatus; count: number }[]
  invoiceStatus: { status: InvoiceStatus; count: number }[]
}

export interface CreateWorkOrderInput {
  title: string
  clientId: string
  address: string
  isScheduleLater?: boolean
  /** When true, job is shown in the schedule “anytime” bucket; start/end times are cleared. */
  isAnyTime?: boolean
  scheduledAt?: Date | null
  startTime?: string | null
  endTime?: string | null
  assignedToId?: string | null
  assignedToIds?: string[]
  instructions?: string | null
  notes?: string | null
  invoiceClientMessage?: string | null
  invoiceTermsConditions?: string | null
  applyInvoiceTermsToFuture?: boolean
  quoteClientMessage?: string | null
  quoteTermsConditions?: string | null
  applyQuoteTermsToFuture?: boolean
  discount?: number
  discountType?: DiscountType | null
  expenses?: Array<{
    date: Date
    itemName: string
    details?: string | null
    total: number
    invoiceNumber?: string | null
    attachmentUrl?: string | null
  }>
  payments?: Array<{
    amount: number
    paymentDate?: Date | null
    paymentMethod: string
    referenceNumber?: string | null
    note?: string | null
  }>
  taxPercent?: number | null
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

export type UpdateWorkOrderInput = Partial<CreateWorkOrderInput>

function normalizeCollectionInput<T>(value: T | T[] | null | undefined): T[] | undefined {
  if (value === undefined) {
    return undefined
  }
  if (value === null) {
    return []
  }
  return Array.isArray(value) ? value : [value]
}

/** When defined (including `[]`), replace `WorkOrderAssignment` rows and primary; when `undefined`, leave assignees unchanged. */
function assigneeIdsFromUpdateInput(input: UpdateWorkOrderInput): string[] | undefined {
  if (input.assignedToIds !== undefined || input.assignedToId !== undefined) {
    return normalizeAssigneeIds({
      assignedToId: input.assignedToId,
      assignedToIds: input.assignedToIds,
    })
  }
  return undefined
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
  // Handle Prisma Decimal objects
  if (typeof d === 'object' && d !== null && 'toNumber' in d) {
    return (d as { toNumber: () => number }).toNumber()
  }
  return 0
}

/** Derive job status from schedule and assignee (§6.1). */
function deriveJobStatus(data: {
  scheduledAt?: Date | null
  startTime?: string | null
  assignedToId?: string | null
  isAnyTime?: boolean
}): JobStatus {
  const isAnyTime = data.isAnyTime ?? false
  const hasSchedule = !!(data.scheduledAt ?? (!isAnyTime && data.startTime))
  if (!hasSchedule) {
    return 'UNSCHEDULED'
  }
  if (!data.assignedToId) {
    return 'UNASSIGNED'
  }
  return 'SCHEDULED'
}

/** When a job WO advances, convert any APPROVED quote linked via `relatedWorkOrderId`. */
async function convertQuotesWhenJobAdvances(
  businessId: string,
  workOrderId: string
): Promise<void> {
  const wo = await prisma.workOrder.findFirst({
    where: { id: workOrderId, businessId },
    select: { jobStatus: true },
  })
  if (!wo) {
    return
  }
  const eligible = ['SCHEDULED', 'ON_MY_WAY', 'IN_PROGRESS', 'COMPLETED']
  if (!eligible.includes(wo.jobStatus)) {
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

/** Recalculate subtotal, discount amount, tax, total, cost, amountPaid, balance and update work order. */
async function recalculateFinancials(
  workOrderId: string,
  taxPercent: number = 0,
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
    console.error('[recalc] workOrder NOT FOUND:', workOrderId)
    return
  }

  const lineItems = await db.lineItem.findMany({
    where: { workOrderId },
    select: { quantity: true, price: true, cost: true },
  })

  const payments = await db.payment.findMany({
    where: { workOrderId },
    select: { amount: true },
  })

  console.log('[recalc] workOrderId:', workOrderId)
  console.log('[recalc] lineItems:', JSON.stringify(lineItems))
  console.log('[recalc] payments:', JSON.stringify(payments))
  console.log('[recalc] discount:', wo.discount, 'discountType:', wo.discountType)

  let subtotal = 0
  let costTotal = 0
  for (const li of lineItems) {
    subtotal += li.quantity * toNum(li.price)
    costTotal += li.quantity * toNum(li.cost)
  }

  const discountVal = toNum(wo.discount)
  let discountAmount = discountVal
  if (wo.discountType === 'PERCENTAGE') {
    discountAmount = (subtotal * discountVal) / 100
  }
  const afterDiscount = subtotal - discountAmount
  const taxAmount = (afterDiscount * taxPercent) / 100
  const total = afterDiscount + taxAmount
  const amountPaid = payments.reduce((s, p) => s + toNum(p.amount), 0)
  const balance = total - amountPaid

  console.log('[recalc] computed → subtotal:', subtotal, 'total:', total, 'balance:', balance)

  await db.workOrder.update({
    where: { id: workOrderId },
    data: {
      subtotal: new Prisma.Decimal(subtotal),
      cost: new Prisma.Decimal(costTotal),
      tax: new Prisma.Decimal(taxAmount),
      total: new Prisma.Decimal(total),
      amountPaid: new Prisma.Decimal(amountPaid),
      balance: new Prisma.Decimal(balance),
    },
  })

  console.log('[recalc] update complete')
}

async function ensureBusinessExists(businessId: string): Promise<void> {
  const b = await prisma.business.findUnique({ where: { id: businessId }, select: { id: true } })
  if (!b) {
    throw new BusinessNotFoundError()
  }
}

/** Get default tax percent from business settings (or 0). */
async function getDefaultTaxPercent(businessId: string): Promise<number> {
  const _s = await prisma.businessSettings.findUnique({
    where: { businessId },
    select: { id: true },
  })
  // Schema has no defaultTaxPercent yet; use 0 until added
  return 0
}

const workOrderAssigneeMemberSelect = {
  id: true,
  calendarColor: true,
  user: { select: { id: true, name: true, email: true } },
} as const

const workOrderAssigneesInclude = {
  include: {
    member: { select: workOrderAssigneeMemberSelect },
  },
} as const

type WorkOrderAssigneeRow = {
  id: string
  workOrderId: string
  memberId: string
  createdAt: Date
  member: {
    id: string
    calendarColor: string | null
    user: { id: string; name: string | null; email: string }
  }
}

/** Public API: one shape for single or multiple assignees — no duplicate primary/legacy fields. */
function mapAssigneesForApi(assignees: WorkOrderAssigneeRow[]) {
  return assignees.map(a => ({
    id: a.id,
    workOrderId: a.workOrderId,
    memberId: a.memberId,
    createdAt: a.createdAt,
    member: {
      id: a.member.id,
      calendarColor: a.member.calendarColor,
      user: a.member.user,
    },
  }))
}

function mapWorkOrderForApi<
  T extends Record<string, unknown> & { assignees?: WorkOrderAssigneeRow[] },
>(wo: T) {
  const { primaryAssigneeId: _primaryId, primaryAssignee: _primary, assignees = [], ...rest } = wo
  return {
    ...rest,
    assignees: mapAssigneesForApi(assignees),
  }
}

function normalizeAssigneeIds(input: {
  assignedToId?: string | null
  assignedToIds?: string[]
}): string[] {
  const allIds = [...(input.assignedToIds ?? [])]
  if (input.assignedToId) {
    allIds.unshift(input.assignedToId)
  }
  return Array.from(new Set(allIds.map(id => id.trim()).filter(Boolean)))
}

/** List work orders with filters and pagination (§6.2). */
export async function listWorkOrders(businessId: string, filters: WorkOrderListFilters = {}) {
  await ensureBusinessExists(businessId)
  const {
    search,
    jobStatus,
    invoiceStatus,
    page = 1,
    limit = 10,
    sortBy = 'createdAt',
    order = 'desc',
  } = filters
  const skip = (page - 1) * limit

  const searchWhere: Prisma.WorkOrderWhereInput = { businessId }
  if (jobStatus) {
    searchWhere.jobStatus = jobStatus
  }
  if (invoiceStatus) {
    searchWhere.invoiceStatus = invoiceStatus
  }

  if (search?.trim()) {
    searchWhere.OR = [
      { title: { contains: search.trim(), mode: 'insensitive' } },
      { address: { contains: search.trim(), mode: 'insensitive' } },
      { client: { name: { contains: search.trim(), mode: 'insensitive' } } },
    ]
  }

  const orderByField =
    sortBy === 'scheduledAt' ? 'scheduledAt' : sortBy === 'title' ? 'title' : sortBy
  const orderBy = { [orderByField]: order }

  const [items, total] = await Promise.all([
    prisma.workOrder.findMany({
      where: searchWhere,
      skip,
      take: limit,
      orderBy,
      include: {
        client: { select: { id: true, name: true, email: true, phone: true } },
        assignees: workOrderAssigneesInclude,
      },
    }),
    prisma.workOrder.count({ where: searchWhere }),
  ])

  return {
    data: items.map(wo => mapWorkOrderForApi(wo)),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  }
}

/** Overview counts for the 3 blocks (§6.2): Quote status, Job status, Invoice status. */
export async function getWorkOrderOverview(businessId: string): Promise<WorkOrderOverview> {
  await ensureBusinessExists(businessId)
  const where = { businessId }

  const [quoteCounts, jobCounts, invoiceCounts] = await Promise.all([
    prisma.quote.groupBy({
      by: ['quoteStatus'],
      where: { businessId },
      _count: { id: true },
    }),
    prisma.workOrder.groupBy({
      by: ['jobStatus'],
      where,
      _count: { id: true },
    }),
    prisma.workOrder.groupBy({
      by: ['invoiceStatus'],
      where,
      _count: { id: true },
    }),
  ])

  return {
    quoteStatus: quoteCounts.map(q => ({ status: q.quoteStatus, count: q._count.id })),
    jobStatus: jobCounts.map(j => ({ status: j.jobStatus, count: j._count.id })),
    invoiceStatus: invoiceCounts.map(i => ({ status: i.invoiceStatus, count: i._count.id })),
  }
}

/** Get single work order with client, line items, payments, assignee (§6.4). */
export async function getWorkOrderById(businessId: string, workOrderId: string) {
  await ensureBusinessExists(businessId)
  const wo = await prisma.workOrder.findFirst({
    where: { id: workOrderId, businessId },
    include: {
      client: true,
      assignees: workOrderAssigneesInclude,
      lineItems: true,
      payments: true,
      expenses: true,
      attachments: true,
    },
  })
  if (!wo) {
    throw new WorkOrderNotFoundError()
  }
  return mapWorkOrderForApi(wo)
}

/** Generate next work order number (e.g. #1, #2) per business. */
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

function lineItemsSummaryForWorkOrderEmail(
  lineItems: Array<{ name: string; quantity: number; price: unknown }>
): string {
  return lineItems
    .map(
      li =>
        `${li.name} x ${li.quantity} @ ${Number(li.price)} = ${Number(li.quantity) * Number(li.price)}`
    )
    .join('\n')
}

/** Client + assigned team member emails after work order creation (failures logged only). */
//// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: multiple email payloads and assignee loops
async function sendWorkOrderCreatedNotificationEmails(
  businessId: string,
  woId: string
): Promise<void> {
  try {
    const woForEmail = await prisma.workOrder.findFirst({
      where: { id: woId, businessId },
      include: {
        client: { select: { name: true, email: true, phone: true } },
        primaryAssignee: { include: { user: { select: { name: true, email: true } } } },
        assignees: {
          include: {
            member: { include: { user: { select: { name: true, email: true } } } },
          },
        },
        business: { include: { settings: { select: { replyToEmail: true } } } },
        lineItems: true,
      },
    })
    if (!woForEmail?.business || !woForEmail.client) {
      return
    }

    const companyReplyTo =
      woForEmail.business.settings?.replyToEmail?.trim() || woForEmail.business.email
    const assigneeNames = Array.from(
      new Set(
        woForEmail.assignees
          .map(a => a.member.user.name?.trim())
          .filter((name): name is string => !!name)
      )
    )
    const assignedName =
      assigneeNames.length > 0
        ? assigneeNames.join(', ')
        : (woForEmail.primaryAssignee?.user?.name ?? 'Our team')
    const dateStr = formatBookingDate(woForEmail.scheduledAt)
    const timeRangeStr = formatTimeRange(
      woForEmail.startTime,
      woForEmail.endTime,
      woForEmail.scheduledAt
    )
    const lineItemsSummary = lineItemsSummaryForWorkOrderEmail(woForEmail.lineItems)
    const totalStr =
      woForEmail.total != null ? `$${Number(woForEmail.total).toFixed(2)}` : undefined
    const taxStr = `$${Number(woForEmail.tax ?? 0).toFixed(2)}`
    const logoUrl = woForEmail.business.logoUrl ?? undefined
    const woNumber = woForEmail.workOrderNumber ?? `#${woForEmail.id}`

    const clientEmail = woForEmail.client.email?.trim()
    if (clientEmail) {
      sendWorkOrderCreatedEmail({
        to: clientEmail,
        clientName: woForEmail.client.name,
        businessName: woForEmail.business.name,
        companyReplyTo,
        companyLogoUrl: logoUrl,
        workOrderNumber: woNumber,
        title: woForEmail.title,
        address: woForEmail.address ?? '',
        date: dateStr,
        timeRange: timeRangeStr,
        assignedTeamMemberName: assignedName,
        lineItemsSummary,
        tax: taxStr,
        instructions: woForEmail.instructions,
        total: totalStr,
      })
    }

    const assigneeEmails = Array.from(
      new Set(
        woForEmail.assignees
          .map(a => a.member.user.email?.trim())
          .filter((email): email is string => !!email)
      )
    )
    if (assigneeEmails.length === 0 && woForEmail.primaryAssignee?.user?.email?.trim()) {
      assigneeEmails.push(woForEmail.primaryAssignee.user.email.trim())
    }
    for (const assigneeEmail of assigneeEmails) {
      sendWorkOrderAssignedToTeamMemberEmail({
        to: assigneeEmail,
        assigneeName:
          woForEmail.assignees.find(a => a.member.user.email?.trim() === assigneeEmail)?.member.user
            .name ??
          woForEmail.primaryAssignee?.user?.name ??
          'there',
        businessName: woForEmail.business.name,
        companyReplyTo,
        companyLogoUrl: logoUrl,
        workOrderNumber: woNumber,
        title: woForEmail.title,
        clientName: woForEmail.client.name,
        clientPhone: woForEmail.client.phone,
        address: woForEmail.address ?? '',
        date: dateStr,
        timeRange: timeRangeStr,
        lineItemsSummary,
        instructions: woForEmail.instructions,
        total: totalStr,
      })
    }
  } catch (e) {
    console.error('[WORK_ORDER] Failed to send work order created / assignee email:', e)
  }
}

/** Create work order (§6.3). Sets invoice_status=NOT_SENT, derives job status. */
export async function createWorkOrder(businessId: string, input: CreateWorkOrderInput) {
  await ensureBusinessExists(businessId)

  const client = await prisma.client.findFirst({
    where: { id: input.clientId, businessId },
    select: { id: true },
  })
  if (!client) {
    throw new ClientNotFoundError()
  }

  const isAnyTime = input.isAnyTime ?? false
  const assignedIds = normalizeAssigneeIds({
    assignedToId: input.assignedToId,
    assignedToIds: input.assignedToIds,
  })

  if (assignedIds.length > 0) {
    const members = await prisma.member.findMany({
      where: { businessId, id: { in: assignedIds } },
      select: { id: true },
    })
    if (members.length !== assignedIds.length) {
      throw new WorkOrderAssigneeNotFoundError()
    }
  }

  const primaryAssignedToId = assignedIds[0] ?? null
  const jobStatus = deriveJobStatus({
    scheduledAt: input.scheduledAt,
    startTime: input.startTime,
    assignedToId: primaryAssignedToId,
    isAnyTime,
  })
  const workOrderNumber = `#${await nextWorkOrderNumber(businessId)}`
  const taxPercent = input.taxPercent ?? (await getDefaultTaxPercent(businessId))

  // ✅ Transaction only creates records — no recalculation inside
  const wo = await prisma.$transaction(async tx => {
    const created = await tx.workOrder.create({
      data: {
        businessId,
        clientId: input.clientId,
        title: input.title,
        address: input.address,
        instructions: input.instructions ?? null,
        notes: input.notes ?? null,
        isScheduleLater: input.isScheduleLater ?? false,
        isAnyTime,
        scheduledAt: input.scheduledAt ?? null,
        startTime: isAnyTime ? null : (input.startTime ?? null),
        endTime: isAnyTime ? null : (input.endTime ?? null),
        primaryAssigneeId: primaryAssignedToId,
        invoiceObservations: input.invoiceClientMessage ?? null,
        invoiceTermsConditions: input.invoiceTermsConditions ?? null,
        jobStatus,
        invoiceStatus: 'NOT_SENT',
        workOrderNumber,
        discount: input.discount ?? 0,
        discountType: input.discountType ?? null,
      },
    })

    if (assignedIds.length > 0) {
      await tx.workOrderAssignment.createMany({
        data: assignedIds.map(memberId => ({ workOrderId: created.id, memberId })),
        skipDuplicates: true,
      })
    }

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

    return created
  })

  // ✅ Recalculate AFTER transaction commits — no timeout risk
  await recalculateFinancials(wo.id, taxPercent)

  const result = await getWorkOrderById(businessId, wo.id)
  await sendWorkOrderCreatedNotificationEmails(businessId, wo.id)
  return result
}

/** Update work order (§6.3). Recalculates financials and can re-derive job status. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: schedule merge, batch transaction, nested replaces
export async function updateWorkOrder(
  businessId: string,
  workOrderId: string,
  input: UpdateWorkOrderInput
) {
  await ensureBusinessExists(businessId)
  const existing = await prisma.workOrder.findFirst({
    where: { id: workOrderId, businessId },
    select: {
      id: true,
      scheduledAt: true,
      startTime: true,
      primaryAssigneeId: true,
      isAnyTime: true,
    },
  })
  if (!existing) {
    throw new WorkOrderNotFoundError()
  }

  const assigneeIdsToApply = assigneeIdsFromUpdateInput(input)

  if (assigneeIdsToApply !== undefined && assigneeIdsToApply.length > 0) {
    const members = await prisma.member.findMany({
      where: { businessId, id: { in: assigneeIdsToApply } },
      select: { id: true },
    })
    if (members.length !== assigneeIdsToApply.length) {
      throw new WorkOrderAssigneeNotFoundError()
    }
  }

  if (input.clientId != null) {
    const client = await prisma.client.findFirst({
      where: { id: input.clientId, businessId },
      select: { id: true },
    })
    if (!client) {
      throw new ClientNotFoundError()
    }
  }

  const normalizedExpenses = normalizeCollectionInput(
    input.expenses as CreateWorkOrderInput['expenses']
  )
  const normalizedPayments = normalizeCollectionInput(
    input.payments as CreateWorkOrderInput['payments']
  )

  const scheduleFieldsTouched =
    input.scheduledAt !== undefined ||
    input.startTime !== undefined ||
    input.endTime !== undefined ||
    input.assignedToId !== undefined ||
    input.assignedToIds !== undefined ||
    input.isAnyTime !== undefined ||
    input.isScheduleLater !== undefined

  const mergedForStatus = {
    scheduledAt: input.scheduledAt !== undefined ? input.scheduledAt : existing.scheduledAt,
    startTime: input.startTime !== undefined ? input.startTime : existing.startTime,
    assignedToId:
      assigneeIdsToApply !== undefined
        ? (assigneeIdsToApply[0] ?? null)
        : input.assignedToId !== undefined
          ? input.assignedToId
          : existing.primaryAssigneeId,
    isAnyTime: input.isAnyTime !== undefined ? input.isAnyTime : existing.isAnyTime,
  }

  const jobStatus = scheduleFieldsTouched
    ? deriveJobStatus({
        scheduledAt: mergedForStatus.scheduledAt,
        startTime: mergedForStatus.startTime,
        assignedToId: mergedForStatus.assignedToId,
        isAnyTime: mergedForStatus.isAnyTime,
      })
    : undefined

  const taxPercent = input.taxPercent ?? (await getDefaultTaxPercent(businessId))

  const updateData: Parameters<typeof prisma.workOrder.update>[0]['data'] = {
    ...(input.title != null && { title: input.title }),
    ...(input.clientId != null && { client: { connect: { id: input.clientId } } }),
    ...(input.address != null && { address: input.address }),
    ...(input.instructions !== undefined && { instructions: input.instructions }),
    ...(input.notes !== undefined && { notes: input.notes }),
    ...(input.isScheduleLater !== undefined && { isScheduleLater: input.isScheduleLater }),
    ...(input.isAnyTime !== undefined && { isAnyTime: input.isAnyTime }),
    ...(input.isAnyTime === true && { startTime: null, endTime: null }),
    ...(input.scheduledAt !== undefined && { scheduledAt: input.scheduledAt }),
    ...(input.startTime !== undefined &&
      input.isAnyTime !== true && { startTime: input.startTime }),
    ...(input.endTime !== undefined && input.isAnyTime !== true && { endTime: input.endTime }),
    ...(assigneeIdsToApply !== undefined && {
      primaryAssignee:
        assigneeIdsToApply[0] != null
          ? { connect: { id: assigneeIdsToApply[0] } }
          : { disconnect: true },
    }),
    ...(input.invoiceClientMessage !== undefined && {
      invoiceObservations: input.invoiceClientMessage,
    }),
    ...(input.invoiceTermsConditions !== undefined && {
      invoiceTermsConditions: input.invoiceTermsConditions,
    }),
    ...(input.discount !== undefined && { discount: input.discount }),
    ...(input.discountType !== undefined && { discountType: input.discountType }),
    ...(jobStatus != null && { jobStatus }),
  }

  // Batch `$transaction([...])` avoids interactive transaction issues (e.g. P2028 on Bun).
  await prisma.$transaction([
    prisma.workOrder.update({ where: { id: workOrderId }, data: updateData }),
    ...(assigneeIdsToApply !== undefined
      ? [
          prisma.workOrderAssignment.deleteMany({ where: { workOrderId } }),
          ...(assigneeIdsToApply.length > 0
            ? [
                prisma.workOrderAssignment.createMany({
                  data: assigneeIdsToApply.map(memberId => ({ workOrderId, memberId })),
                  skipDuplicates: true,
                }),
              ]
            : []),
        ]
      : []),
    ...(input.lineItems
      ? [
          prisma.lineItem.deleteMany({ where: { workOrderId } }),
          ...(input.lineItems.length > 0
            ? [
                prisma.lineItem.createMany({
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
                }),
              ]
            : []),
        ]
      : []),
    ...(normalizedExpenses !== undefined
      ? [
          prisma.expense.deleteMany({ where: { workOrderId } }),
          ...(normalizedExpenses.length > 0
            ? [
                prisma.expense.createMany({
                  data: normalizedExpenses.map(exp => ({
                    businessId,
                    workOrderId,
                    date: exp.date,
                    itemName: exp.itemName,
                    details: exp.details ?? null,
                    total: exp.total,
                    invoiceNumber: exp.invoiceNumber ?? null,
                    attachmentUrl: exp.attachmentUrl ?? null,
                  })),
                }),
              ]
            : []),
        ]
      : []),
    ...(normalizedPayments !== undefined
      ? [
          prisma.payment.deleteMany({ where: { workOrderId } }),
          ...(normalizedPayments.length > 0
            ? [
                prisma.payment.createMany({
                  data: normalizedPayments.map(payment => ({
                    workOrderId,
                    amount: payment.amount,
                    paymentDate: payment.paymentDate ?? new Date(),
                    paymentMethod: payment.paymentMethod as Parameters<
                      typeof prisma.payment.create
                    >[0]['data']['paymentMethod'],
                    referenceNumber: payment.referenceNumber ?? null,
                    note: payment.note ?? null,
                  })),
                }),
              ]
            : []),
        ]
      : []),
  ])

  await recalculateFinancials(workOrderId, taxPercent)

  await convertQuotesWhenJobAdvances(businessId, workOrderId)

  return getWorkOrderById(businessId, workOrderId)
}

/** Format date for email (e.g. "January 15, 2024"). */
function formatBookingDate(d: Date | null): string {
  if (!d) {
    return 'To be confirmed'
  }
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

/**
 * Normalize a time value for display as "HH:mm". Handles ISO datetime strings and plain "09:00" strings.
 */
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

/** Format time range (e.g. "09:00 - 11:00"). Uses scheduledAt when start/end are missing. */
function formatTimeRange(
  start: string | null,
  end: string | null,
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
    const t = scheduledAt.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    return t
  }
  return 'To be confirmed'
}

/**
 * Send booking confirmation email to the work order's client (§6.2.3).
 * Sets bookingConfirmationSentAt. Client must have an email.
 */
export async function sendBookingConfirmation(
  businessId: string,
  workOrderId: string,
  options?: { subject?: string }
) {
  await ensureBusinessExists(businessId)

  const wo = await prisma.workOrder.findFirst({
    where: { id: workOrderId, businessId },
    include: {
      client: { select: { id: true, name: true, email: true } },
      primaryAssignee: { include: { user: { select: { name: true } } } },
      business: { include: { settings: { select: { replyToEmail: true } } } },
    },
  })
  if (!wo) {
    throw new WorkOrderNotFoundError()
  }

  const clientEmail = wo.client.email?.trim()
  if (!clientEmail) {
    throw new Error(
      'Client has no email address. Add an email to the client to send booking confirmation.'
    )
  }

  const companyReplyTo = wo.business.settings?.replyToEmail?.trim() || wo.business.email
  const assignedTeamMemberName = wo.primaryAssignee?.user?.name ?? 'Our team'
  const dateStr = formatBookingDate(wo.scheduledAt)
  const timeRangeStr = formatTimeRange(wo.startTime, wo.endTime, wo.scheduledAt)

  const subject =
    options?.subject ??
    `Booking Confirmation - ${wo.title} - ${wo.scheduledAt ? formatBookingDate(wo.scheduledAt) : 'TBC'}`

  sendBookingConfirmationEmail({
    to: clientEmail,
    clientName: wo.client.name,
    serviceTitle: wo.title,
    date: dateStr,
    timeRange: timeRangeStr,
    assignedTeamMemberName,
    businessName: wo.business.name,
    companyReplyTo,
    companyLogoUrl: wo.business.logoUrl ?? undefined,
    subject,
  })

  await prisma.workOrder.update({
    where: { id: workOrderId },
    data: { bookingConfirmationSentAt: new Date() },
  })

  return getWorkOrderById(businessId, workOrderId)
}

export class LineItemNotFoundError extends Error {
  constructor() {
    super('LINE_ITEM_NOT_FOUND')
  }
}

/** Item when adding from master price list: copy from PriceListItem. */
export interface AddLineItemFromPriceList {
  priceListItemId: string
  quantity: number
}

/** Custom line item (not in master list). */
export interface AddLineItemCustom {
  name: string
  quantity: number
  price: number
  itemType?: 'SERVICE' | 'PRODUCT'
  description?: string | null
  cost?: number | null
}

export type AddLineItemInput = AddLineItemFromPriceList | AddLineItemCustom

function isFromPriceList(item: AddLineItemInput): item is AddLineItemFromPriceList {
  return 'priceListItemId' in item && item.priceListItemId != null
}

/** Add line items to an existing work order: from price list (copy snapshot) or custom. */
export async function addLineItemsToWorkOrder(
  businessId: string,
  workOrderId: string,
  items: AddLineItemInput[]
) {
  await ensureBusinessExists(businessId)
  const wo = await prisma.workOrder.findFirst({
    where: { id: workOrderId, businessId },
    select: { id: true },
  })
  if (!wo) {
    throw new WorkOrderNotFoundError()
  }

  await prisma.$transaction(async tx => {
    for (const item of items) {
      if (isFromPriceList(item)) {
        const pl = await tx.priceListItem.findFirst({
          where: { id: item.priceListItemId, businessId },
        })
        if (!pl) {
          throw new Error('PRICE_LIST_ITEM_NOT_FOUND')
        }
        await tx.lineItem.create({
          data: {
            workOrderId,
            name: pl.name,
            itemType: pl.itemType,
            description: pl.description,
            quantity: item.quantity,
            price: pl.price,
            cost: pl.cost,
            priceListItemId: pl.id,
          },
        })
      } else {
        await tx.lineItem.create({
          data: {
            workOrderId,
            name: item.name,
            itemType: item.itemType ?? 'SERVICE',
            description: item.description ?? null,
            quantity: item.quantity,
            price: item.price,
            cost: item.cost ?? null,
            priceListItemId: null,
          },
        })
      }
    }

    await recalculateFinancials(workOrderId, 0, tx)
  })

  return getWorkOrderById(businessId, workOrderId)
}

/** Create a PriceListItem from a work order line item (e.g. "Save to Master Price List"). Optionally link the line item. */
export async function addLineItemToPriceList(
  businessId: string,
  workOrderId: string,
  lineItemId: string,
  options?: { linkLineItem?: boolean }
) {
  await ensureBusinessExists(businessId)
  const wo = await prisma.workOrder.findFirst({
    where: { id: workOrderId, businessId },
    select: { id: true },
  })
  if (!wo) {
    throw new WorkOrderNotFoundError()
  }
  const lineItem = await prisma.lineItem.findFirst({
    where: { id: lineItemId, workOrderId },
  })
  if (!lineItem) {
    throw new LineItemNotFoundError()
  }

  const priceListItem = await prisma.priceListItem.create({
    data: {
      businessId,
      itemType: lineItem.itemType,
      name: lineItem.name,
      description: lineItem.description,
      cost: lineItem.cost,
      markupPercent: lineItem.markupPercent,
      price: lineItem.price,
    },
  })

  if (options?.linkLineItem !== false) {
    await prisma.lineItem.update({
      where: { id: lineItemId },
      data: { priceListItemId: priceListItem.id },
    })
  }

  return { priceListItem, workOrder: await getWorkOrderById(businessId, workOrderId) }
}
export async function deleteWorkOrder(businessId: string, workOrderId: string): Promise<void> {
  await ensureBusinessExists(businessId)
  const wo = await prisma.workOrder.findFirst({
    where: { id: workOrderId, businessId },
    select: { id: true },
  })
  if (!wo) {
    throw new WorkOrderNotFoundError()
  }
  await prisma.workOrder.delete({ where: { id: workOrderId } })
}

/** Register payment and recalc balance; set invoice_status=PAID if balance <= 0 (§6.1). */

export async function registerPayment(
  businessId: string,
  workOrderId: string,
  data: {
    amount: number
    paymentDate?: Date | null
    paymentMethod: string
    referenceNumber?: string | null
    note?: string | null
  }
) {
  await ensureBusinessExists(businessId)
  const wo = await prisma.workOrder.findFirst({
    where: { id: workOrderId, businessId },
    select: { id: true },
  })
  if (!wo) {
    throw new WorkOrderNotFoundError()
  }

  await prisma.$transaction(async tx => {
    await tx.payment.create({
      data: {
        workOrderId,
        amount: data.amount,
        paymentDate: data.paymentDate ?? new Date(),
        paymentMethod: data.paymentMethod as Parameters<
          typeof prisma.payment.create
        >[0]['data']['paymentMethod'],
        referenceNumber: data.referenceNumber ?? null,
        note: data.note ?? null,
      },
    })

    await recalculateFinancials(workOrderId, 0, tx)

    const updated = await tx.workOrder.findUnique({
      where: { id: workOrderId },
      select: { balance: true },
    })
    if (updated && toNum(updated.balance) <= 0) {
      await tx.workOrder.update({
        where: { id: workOrderId },
        data: { invoiceStatus: 'PAID' },
      })
    }
  })

  return getWorkOrderById(businessId, workOrderId)
}

export async function listWorkOrderPayments(businessId: string, workOrderId: string) {
  await ensureBusinessExists(businessId)
  const wo = await prisma.workOrder.findFirst({
    where: { id: workOrderId, businessId },
    select: { id: true },
  })
  if (!wo) {
    throw new WorkOrderNotFoundError()
  }

  return prisma.payment.findMany({
    where: { workOrderId },
    orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }],
  })
}

export async function getWorkOrderPayment(
  businessId: string,
  workOrderId: string,
  paymentId: string
) {
  await ensureBusinessExists(businessId)
  const wo = await prisma.workOrder.findFirst({
    where: { id: workOrderId, businessId },
    select: { id: true },
  })
  if (!wo) {
    throw new WorkOrderNotFoundError()
  }

  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, workOrderId },
  })
  if (!payment) {
    throw new PaymentNotFoundError()
  }
  return payment
}

export async function updateWorkOrderPayment(
  businessId: string,
  workOrderId: string,
  paymentId: string,
  data: {
    amount?: number
    paymentDate?: Date | null
    paymentMethod?: string
    referenceNumber?: string | null
    note?: string | null
  }
) {
  await ensureBusinessExists(businessId)
  const wo = await prisma.workOrder.findFirst({
    where: { id: workOrderId, businessId },
    select: { id: true },
  })
  if (!wo) {
    throw new WorkOrderNotFoundError()
  }

  const existing = await prisma.payment.findFirst({
    where: { id: paymentId, workOrderId },
    select: { id: true },
  })
  if (!existing) {
    throw new PaymentNotFoundError()
  }

  await prisma.$transaction(async tx => {
    await tx.payment.update({
      where: { id: paymentId },
      data: {
        ...(data.amount !== undefined && { amount: data.amount }),
        ...(data.paymentDate !== undefined && { paymentDate: data.paymentDate ?? new Date() }),
        ...(data.paymentMethod !== undefined && {
          paymentMethod: data.paymentMethod as Parameters<
            typeof prisma.payment.create
          >[0]['data']['paymentMethod'],
        }),
        ...(data.referenceNumber !== undefined && { referenceNumber: data.referenceNumber }),
        ...(data.note !== undefined && { note: data.note }),
      },
    })

    await recalculateFinancials(workOrderId, 0, tx)

    const updated = await tx.workOrder.findUnique({
      where: { id: workOrderId },
      select: { balance: true, invoiceStatus: true },
    })
    if (!updated) {
      return
    }
    if (toNum(updated.balance) <= 0 && updated.invoiceStatus !== 'PAID') {
      await tx.workOrder.update({
        where: { id: workOrderId },
        data: { invoiceStatus: 'PAID' },
      })
    } else if (toNum(updated.balance) > 0 && updated.invoiceStatus === 'PAID') {
      await tx.workOrder.update({
        where: { id: workOrderId },
        data: { invoiceStatus: 'AWAITING_PAYMENT' },
      })
    }
  })

  return getWorkOrderById(businessId, workOrderId)
}

export async function deleteWorkOrderPayment(
  businessId: string,
  workOrderId: string,
  paymentId: string
) {
  await ensureBusinessExists(businessId)
  const wo = await prisma.workOrder.findFirst({
    where: { id: workOrderId, businessId },
    select: { id: true },
  })
  if (!wo) {
    throw new WorkOrderNotFoundError()
  }

  const existing = await prisma.payment.findFirst({
    where: { id: paymentId, workOrderId },
    select: { id: true },
  })
  if (!existing) {
    throw new PaymentNotFoundError()
  }

  await prisma.$transaction(async tx => {
    await tx.payment.delete({ where: { id: paymentId } })
    await recalculateFinancials(workOrderId, 0, tx)

    const updated = await tx.workOrder.findUnique({
      where: { id: workOrderId },
      select: { balance: true, invoiceStatus: true },
    })
    if (!updated) {
      return
    }
    if (toNum(updated.balance) > 0 && updated.invoiceStatus === 'PAID') {
      await tx.workOrder.update({
        where: { id: workOrderId },
        data: { invoiceStatus: 'AWAITING_PAYMENT' },
      })
    }
  })

  return getWorkOrderById(businessId, workOrderId)
}

export async function listWorkOrderAttachments(businessId: string, workOrderId: string) {
  await ensureBusinessExists(businessId)
  const wo = await prisma.workOrder.findFirst({
    where: { id: workOrderId, businessId },
    select: { id: true },
  })
  if (!wo) {
    throw new WorkOrderNotFoundError()
  }

  return prisma.workOrderAttachment.findMany({
    where: { workOrderId },
    orderBy: { createdAt: 'asc' },
  })
}

export async function addWorkOrderAttachments(
  businessId: string,
  workOrderId: string,
  attachments: Array<{ url: string; filename?: string | null; type?: string | null }>
) {
  await ensureBusinessExists(businessId)
  const wo = await prisma.workOrder.findFirst({
    where: { id: workOrderId, businessId },
    select: { id: true },
  })
  if (!wo) {
    throw new WorkOrderNotFoundError()
  }

  return prisma.$transaction(async tx => {
    const existingCount = await tx.workOrderAttachment.count({ where: { workOrderId } })
    if (existingCount + attachments.length > 10) {
      throw new Error('MAX_ATTACHMENTS_EXCEEDED')
    }

    await tx.workOrderAttachment.createMany({
      data: attachments.map(item => ({
        workOrderId,
        url: item.url,
        filename: item.filename ?? null,
        type: item.type ?? null,
      })),
    })

    return tx.workOrderAttachment.findMany({
      where: { workOrderId },
      orderBy: { createdAt: 'asc' },
    })
  })
}

export async function deleteWorkOrderAttachment(
  businessId: string,
  workOrderId: string,
  attachmentId: string
) {
  await ensureBusinessExists(businessId)
  const wo = await prisma.workOrder.findFirst({
    where: { id: workOrderId, businessId },
    select: { id: true },
  })
  if (!wo) {
    throw new WorkOrderNotFoundError()
  }

  const existing = await prisma.workOrderAttachment.findFirst({
    where: { id: attachmentId, workOrderId },
    select: { id: true },
  })
  if (!existing) {
    throw new Error('ATTACHMENT_NOT_FOUND')
  }

  await prisma.workOrderAttachment.delete({ where: { id: attachmentId } })
}

export async function listWorkOrderCustomerReminders(businessId: string, workOrderId: string) {
  await ensureBusinessExists(businessId)
  const wo = await prisma.workOrder.findFirst({
    where: { id: workOrderId, businessId },
    select: { id: true, clientId: true },
  })
  if (!wo) {
    throw new WorkOrderNotFoundError()
  }

  const [client, reminderLogs] = await Promise.all([
    prisma.client.findUnique({
      where: { id: wo.clientId },
      select: { reminderDate: true, reminderNote: true },
    }),
    prisma.reminderLog.findMany({
      where: { businessId, workOrderId, reminderType: 'CLIENT_FOLLOW_UP' },
      orderBy: { sentAt: 'desc' },
    }),
  ])

  return {
    upcomingReminder:
      client?.reminderDate != null
        ? {
            dateTime: client.reminderDate,
            note: client.reminderNote ?? null,
          }
        : null,
    reminders: reminderLogs.map(item => ({
      id: item.id,
      dateTime: item.sentAt,
      note: null,
      channel: item.channel,
      createdAt: item.createdAt,
    })),
  }
}

export async function createWorkOrderCustomerReminder(
  businessId: string,
  workOrderId: string,
  data: { dateTime: Date; note?: string | null }
) {
  await ensureBusinessExists(businessId)
  const wo = await prisma.workOrder.findFirst({
    where: { id: workOrderId, businessId },
    select: { id: true, clientId: true },
  })
  if (!wo) {
    throw new WorkOrderNotFoundError()
  }

  await prisma.$transaction(async tx => {
    await tx.client.update({
      where: { id: wo.clientId },
      data: {
        reminderDate: data.dateTime,
        reminderNote: data.note ?? null,
        status: 'FOLLOW_UP',
      },
    })

    await tx.reminderLog.create({
      data: {
        reminderType: 'CLIENT_FOLLOW_UP',
        sentAt: data.dateTime,
        channel: 'EMAIL',
        entityType: 'WORK_ORDER',
        entityId: workOrderId,
        workOrderId,
        clientId: wo.clientId,
        businessId,
      },
    })
  })

  try {
    const woForEmail = await prisma.workOrder.findFirst({
      where: { id: workOrderId, businessId },
      include: {
        client: { select: { name: true, email: true } },
        business: { include: { settings: { select: { replyToEmail: true } } } },
      },
    })
    const clientEmail = woForEmail?.client?.email?.trim()
    if (woForEmail && clientEmail) {
      const companyReplyTo =
        woForEmail.business.settings?.replyToEmail?.trim() || woForEmail.business.email
      sendCustomerReminderEmail({
        to: clientEmail,
        clientName: woForEmail.client.name,
        businessName: woForEmail.business.name,
        companyReplyTo,
        workOrderTitle: woForEmail.title,
        reminderDateTime: data.dateTime,
        note: data.note ?? null,
      })
    }
  } catch (error) {
    console.error('[WORK_ORDER] Failed to send customer reminder email:', error)
  }

  return listWorkOrderCustomerReminders(businessId, workOrderId)
}

const defaultJobFollowUpEmailMessage = (clientName: string, businessName: string, title: string) =>
  `<!DOCTYPE html><html><body style="font-family: sans-serif; line-height: 1.5;">` +
  `<p>Hi ${clientName},</p>` +
  `<p>Thank you for choosing <strong>${businessName}</strong> for work on <strong>${title}</strong>.</p>` +
  `<p>We hope everything went well. If you have a moment, we would love to hear your feedback.</p>` +
  `<p>Best regards,<br/>${businessName}</p>` +
  `</body></html>`

export async function getJobFollowUpEmailComposeData(businessId: string, workOrderId: string) {
  await ensureBusinessExists(businessId)

  const wo = await prisma.workOrder.findFirst({
    where: { id: workOrderId, businessId },
    include: {
      client: { select: { id: true, name: true, email: true } },
      business: {
        include: {
          settings: { select: { replyToEmail: true } },
        },
      },
    },
  })
  if (!wo) {
    throw new WorkOrderNotFoundError()
  }

  const linkedQuotePdf = await prisma.quote.findFirst({
    where: {
      OR: [{ relatedWorkOrderId: workOrderId }, { convertedToWorkOrderId: workOrderId }],
      lastQuotePdfUrl: { not: null },
    },
    select: { id: true },
  })

  const displayName = wo.business.name?.trim() || 'Company'
  const from = clientToCustomerFrom(displayName)
  const replyTo = wo.business.settings?.replyToEmail?.trim() || wo.business.email
  const subject = `Thank you – feedback for ${wo.title}`
  const message = defaultJobFollowUpEmailMessage(wo.client.name, displayName, wo.title)

  const attachments: Array<{
    id: string
    label: string
    filename: string
    source: 'QUOTE_PDF' | 'JOB_REPORT_PDF' | 'WORK_ORDER_ATTACHMENT'
    sizeBytes: number | null
    selectedByDefault: boolean
  }> = []

  if (linkedQuotePdf) {
    attachments.push({
      id: 'quote_pdf',
      label: 'Quote.pdf',
      filename: 'Quote.pdf',
      source: 'QUOTE_PDF',
      sizeBytes: null,
      selectedByDefault: false,
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
    workOrderId: wo.id,
    from,
    replyTo,
    to: wo.client.email ?? null,
    subject,
    message,
    sendMeCopyDefault: false,
    maxAdditionalAttachmentsBytes: 10 * 1024 * 1024,
    attachments,
  }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: attachment selection, fetch, and optional copy send
export async function sendJobFollowUpEmail(
  businessId: string,
  workOrderId: string,
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
  }
) {
  await ensureBusinessExists(businessId)

  const wo = await prisma.workOrder.findFirst({
    where: { id: workOrderId, businessId },
    include: {
      client: { select: { id: true, name: true, email: true } },
      business: { include: { settings: { select: { replyToEmail: true } } } },
    },
  })
  if (!wo) {
    throw new WorkOrderNotFoundError()
  }

  const linkedQuoteForPdf = await prisma.quote.findFirst({
    where: {
      OR: [{ relatedWorkOrderId: workOrderId }, { convertedToWorkOrderId: workOrderId }],
      lastQuotePdfUrl: { not: null },
    },
    select: { lastQuotePdfUrl: true },
  })

  const toEmail = (options?.to ?? wo.client.email)?.trim()
  if (!toEmail) {
    throw new Error(
      'Client has no email address. Add an email to the client to send the follow-up.'
    )
  }

  const companyReplyTo =
    options?.replyTo?.trim() || wo.business.settings?.replyToEmail?.trim() || wo.business.email
  const displayName = wo.business.name?.trim() || 'Company'
  const fromHeader = options?.from?.trim() || clientToCustomerFrom(displayName)
  const subject = options?.subject ?? `Thank you – feedback for ${wo.title}`
  const html =
    options?.message ?? defaultJobFollowUpEmailMessage(wo.client.name, displayName, wo.title)

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
  if (linkedQuoteForPdf?.lastQuotePdfUrl) {
    builtInAttachments.push({
      id: 'quote_pdf',
      filename: 'Quote.pdf',
      url: linkedQuoteForPdf.lastQuotePdfUrl,
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

  return getWorkOrderById(businessId, workOrderId)
}
