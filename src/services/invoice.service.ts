/**
 * Invoice module – uses the Invoice model (prisma/schema.prisma).
 * Invoice is a separate entity with client, lineItems (LineItem.invoiceId), payments (Payment.invoiceId).
 * Optional workOrderId links invoice to a work order.
 */

import type { InvoiceStatus } from '~/generated/prisma'
import { Prisma } from '~/generated/prisma'
import prisma from '~/lib/prisma'
import { BusinessNotFoundError } from '~/services/business.service'

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
