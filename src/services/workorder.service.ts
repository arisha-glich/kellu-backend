/**
 * Workorder Management – §6 of Business Owner Panel spec.
 * List view, overview blocks (quote/job/invoice status counts), create/update/delete,
 * financials (subtotal, discount, tax, total, cost, amountPaid, balance), job status derivation.
 */

import type { Prisma } from '~/generated/prisma'
import type { DiscountType, InvoiceStatus, JobStatus, QuoteStatus } from '~/generated/prisma'
import prisma from '~/lib/prisma'
import { BusinessNotFoundError } from '~/services/business.service'

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

export interface WorkOrderListFilters {
  search?: string
  quoteStatus?: QuoteStatus
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
  scheduledAt?: Date | null
  startTime?: string | null
  endTime?: string | null
  assignedToId?: string | null
  instructions?: string | null
  notes?: string | null
  quoteRequired?: boolean
  quoteTermsConditions?: string | null
  invoiceTermsConditions?: string | null
  discount?: number
  discountType?: DiscountType | null
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

function toNum(d: unknown): number {
  if (d == null) return 0
  if (typeof d === 'number' && !Number.isNaN(d)) return d
  if (typeof d === 'string') return Number.parseFloat(d) || 0
  return 0
}

/** Derive job status from schedule and assignee (§6.1). */
function deriveJobStatus(data: {
  scheduledAt?: Date | null
  startTime?: string | null
  assignedToId?: string | null
}): JobStatus {
  const hasSchedule = !!(data.scheduledAt ?? data.startTime)
  if (!hasSchedule) return 'UNSCHEDULED'
  if (!data.assignedToId) return 'UNASSIGNED'
  return 'SCHEDULED'
}

/** Recalculate subtotal, discount amount, tax, total, cost, amountPaid, balance and update work order. */
async function recalculateFinancials(workOrderId: string, taxPercent: number = 0): Promise<void> {
  const [lineItems, payments, wo] = await Promise.all([
    prisma.lineItem.findMany({ where: { workOrderId }, select: { quantity: true, price: true, cost: true } }),
    prisma.payment.findMany({ where: { workOrderId }, select: { amount: true } }),
    prisma.workOrder.findUnique({
      where: { id: workOrderId },
      select: { discount: true, discountType: true },
    }),
  ])
  if (!wo) return

  let subtotal = 0
  let costTotal = 0
  for (const li of lineItems) {
    const q = li.quantity
    const p = toNum(li.price)
    const c = toNum(li.cost)
    subtotal += q * p
    costTotal += q * c
  }

  const discountVal = toNum(wo.discount)
  const discountType = wo.discountType
  let discountAmount = discountVal
  if (discountType === 'PERCENTAGE') {
    discountAmount = (subtotal * discountVal) / 100
  }
  const afterDiscount = subtotal - discountAmount
  const taxAmount = (afterDiscount * taxPercent) / 100
  const total = afterDiscount + taxAmount

  const amountPaid = payments.reduce((s, p) => s + toNum(p.amount), 0)
  const balance = total - amountPaid

  await prisma.workOrder.update({
    where: { id: workOrderId },
    data: {
      subtotal,
      cost: costTotal,
      tax: taxAmount,
      total,
      amountPaid,
      balance,
    },
  })
}

async function ensureBusinessExists(businessId: string): Promise<void> {
  const b = await prisma.business.findUnique({ where: { id: businessId }, select: { id: true } })
  if (!b) throw new BusinessNotFoundError()
}

/** Get default tax percent from business settings (or 0). */
async function getDefaultTaxPercent(businessId: string): Promise<number> {
  const s = await prisma.businessSettings.findUnique({
    where: { businessId },
    select: { id: true },
  })
  // Schema has no defaultTaxPercent yet; use 0 until added
  return 0
}

/** List work orders with filters and pagination (§6.2). */
export async function listWorkOrders(businessId: string, filters: WorkOrderListFilters = {}) {
  await ensureBusinessExists(businessId)
  const {
    search,
    quoteStatus,
    jobStatus,
    invoiceStatus,
    page = 1,
    limit = 10,
    sortBy = 'createdAt',
    order = 'desc',
  } = filters
  const skip = (page - 1) * limit

  const searchWhere: Prisma.WorkOrderWhereInput = { businessId }
  if (quoteStatus) searchWhere.quoteStatus = quoteStatus
  if (jobStatus) searchWhere.jobStatus = jobStatus
  if (invoiceStatus) searchWhere.invoiceStatus = invoiceStatus

  if (search?.trim()) {
    searchWhere.OR = [
      { title: { contains: search.trim(), mode: 'insensitive' } },
      { address: { contains: search.trim(), mode: 'insensitive' } },
      { client: { name: { contains: search.trim(), mode: 'insensitive' } } },
    ]
  }

  const orderByField = sortBy === 'scheduledAt' ? 'scheduledAt' : sortBy === 'title' ? 'title' : sortBy
  const orderBy = { [orderByField]: order }

  const [items, total] = await Promise.all([
    prisma.workOrder.findMany({
      where: searchWhere,
      skip,
      take: limit,
      orderBy,
      include: {
        client: { select: { id: true, name: true, email: true, phone: true } },
        assignedTo: { select: { id: true, user: { select: { name: true, email: true } } } },
      },
    }),
    prisma.workOrder.count({ where: searchWhere }),
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

/** Overview counts for the 3 blocks (§6.2): Quote status, Job status, Invoice status. */
export async function getWorkOrderOverview(businessId: string): Promise<WorkOrderOverview> {
  await ensureBusinessExists(businessId)
  const where = { businessId }

  const [quoteCounts, jobCounts, invoiceCounts] = await Promise.all([
    prisma.workOrder.groupBy({
      by: ['quoteStatus'],
      where,
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
      assignedTo: { include: { user: { select: { id: true, name: true, email: true } } } },
      lineItems: true,
      payments: true,
      expenses: true,
      attachments: true,
    },
  })
  if (!wo) throw new WorkOrderNotFoundError()
  return wo
}

/** Generate next work order number (e.g. #1, #2) per business. */
async function nextWorkOrderNumber(businessId: string): Promise<string> {
  const last = await prisma.workOrder.findFirst({
    where: { businessId },
    orderBy: { createdAt: 'desc' },
    select: { workOrderNumber: true },
  })
  if (!last?.workOrderNumber) return '1'
  const num = Number.parseInt(last.workOrderNumber.replace(/^#/, ''), 10)
  return String(Number.isNaN(num) ? 1 : num + 1)
}

/** Create work order (§6.3). Sets quote_status=NOT_SENT, invoice_status=NOT_SENT, derives job status. */
export async function createWorkOrder(businessId: string, input: CreateWorkOrderInput) {
  await ensureBusinessExists(businessId)
  const client = await prisma.client.findFirst({
    where: { id: input.clientId, businessId },
    select: { id: true },
  })
  if (!client) throw new ClientNotFoundError()

  const jobStatus = deriveJobStatus({
    scheduledAt: input.scheduledAt,
    startTime: input.startTime,
    assignedToId: input.assignedToId,
  })
  const workOrderNumber = `#${await nextWorkOrderNumber(businessId)}`
  const taxPercent = input.taxPercent ?? (await getDefaultTaxPercent(businessId))

  const wo = await prisma.workOrder.create({
    data: {
      businessId,
      clientId: input.clientId,
      title: input.title,
      address: input.address,
      instructions: input.instructions ?? null,
      notes: input.notes ?? null,
      isScheduleLater: input.isScheduleLater ?? false,
      scheduledAt: input.scheduledAt ?? null,
      startTime: input.startTime ?? null,
      endTime: input.endTime ?? null,
      assignedToId: input.assignedToId ?? null,
      quoteRequired: input.quoteRequired ?? false,
      quoteTermsConditions: input.quoteTermsConditions ?? null,
      invoiceTermsConditions: input.invoiceTermsConditions ?? null,
      quoteStatus: 'NOT_SENT',
      jobStatus,
      invoiceStatus: 'NOT_SENT',
      workOrderNumber,
      discount: input.discount ?? 0,
      discountType: input.discountType ?? null,
    },
    include: {
      client: { select: { id: true, name: true, email: true, phone: true } },
      assignedTo: { select: { id: true, user: { select: { name: true, email: true } } } },
    },
  })

  if (input.lineItems?.length) {
    await prisma.lineItem.createMany({
      data: input.lineItems.map(li => ({
        workOrderId: wo.id,
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
  await recalculateFinancials(wo.id, taxPercent)
  return getWorkOrderById(businessId, wo.id)
}

/** Update work order (§6.3). Recalculates financials and can re-derive job status. */
export async function updateWorkOrder(
  businessId: string,
  workOrderId: string,
  input: UpdateWorkOrderInput
) {
  await ensureBusinessExists(businessId)
  const existing = await prisma.workOrder.findFirst({
    where: { id: workOrderId, businessId },
    select: { id: true },
  })
  if (!existing) throw new WorkOrderNotFoundError()

  const jobStatus =
    input.scheduledAt !== undefined || input.startTime !== undefined || input.assignedToId !== undefined
      ? deriveJobStatus({
          scheduledAt: input.scheduledAt,
          startTime: input.startTime,
          assignedToId: input.assignedToId,
        })
      : undefined

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
    ...(input.quoteRequired !== undefined && { quoteRequired: input.quoteRequired }),
    ...(input.quoteTermsConditions !== undefined && { quoteTermsConditions: input.quoteTermsConditions }),
    ...(input.invoiceTermsConditions !== undefined && { invoiceTermsConditions: input.invoiceTermsConditions }),
    ...(input.discount !== undefined && { discount: input.discount }),
    ...(input.discountType !== undefined && { discountType: input.discountType }),
    ...(jobStatus != null && { jobStatus }),
  }

  await prisma.workOrder.update({
    where: { id: workOrderId },
    data: updateData,
  })

  if (input.lineItems) {
    await prisma.lineItem.deleteMany({ where: { workOrderId } })
    if (input.lineItems.length > 0) {
      await prisma.lineItem.createMany({
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

  const taxPercent = input.taxPercent ?? (await getDefaultTaxPercent(businessId))
  await recalculateFinancials(workOrderId, taxPercent)
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
  if (!wo) throw new WorkOrderNotFoundError()

  for (const item of items) {
    if (isFromPriceList(item)) {
      const pl = await prisma.priceListItem.findFirst({
        where: { id: item.priceListItemId, businessId },
      })
      if (!pl) throw new Error('PRICE_LIST_ITEM_NOT_FOUND')
      await prisma.lineItem.create({
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
      await prisma.lineItem.create({
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

  await recalculateFinancials(workOrderId)
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
  if (!wo) throw new WorkOrderNotFoundError()
  const lineItem = await prisma.lineItem.findFirst({
    where: { id: lineItemId, workOrderId },
  })
  if (!lineItem) throw new LineItemNotFoundError()

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
  if (!wo) throw new WorkOrderNotFoundError()
  await prisma.workOrder.delete({ where: { id: workOrderId } })
}

/** Register payment and recalc balance; set invoice_status=PAID if balance <= 0 (§6.1). */
export async function registerPayment(
  businessId: string,
  workOrderId: string,
  data: {
    amount: number
    paymentDate: Date
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
  if (!wo) throw new WorkOrderNotFoundError()

  await prisma.payment.create({
    data: {
      workOrderId,
      amount: data.amount,
      paymentDate: data.paymentDate,
      paymentMethod: data.paymentMethod as Parameters<typeof prisma.payment.create>[0]['data']['paymentMethod'],
      referenceNumber: data.referenceNumber ?? null,
      note: data.note ?? null,
    },
  })

  await recalculateFinancials(workOrderId)
  const updated = await prisma.workOrder.findUnique({
    where: { id: workOrderId },
    select: { balance: true, invoiceStatus: true },
  })
  if (updated && toNum(updated.balance) <= 0) {
    await prisma.workOrder.update({
      where: { id: workOrderId },
      data: { invoiceStatus: 'PAID' },
    })
  }
  return getWorkOrderById(businessId, workOrderId)
}
