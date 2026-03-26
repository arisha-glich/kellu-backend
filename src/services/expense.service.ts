/**
 * Expenses Management – §7/§8.
 * Job-level expenses (linked to work order) and global expenses (optional link).
 * List with filters: work order, date range, invoice number, client (via linked work order).
 */

import { Prisma } from '~/generated/prisma'
import prisma from '~/lib/prisma'

export class ExpenseNotFoundError extends Error {
  constructor() {
    super('EXPENSE_NOT_FOUND')
  }
}

export class WorkOrderNotFoundError extends Error {
  constructor() {
    super('WORK_ORDER_NOT_FOUND')
  }
}

export interface ExpenseListFilters {
  workOrderId?: string
  dateFrom?: Date
  dateTo?: Date
  invoiceNumber?: string
  clientId?: string
  page?: number
  limit?: number
  sortBy?: 'date' | 'createdAt' | 'total' | 'itemName'
  order?: 'asc' | 'desc'
}

export interface CreateExpenseInput {
  date: Date
  itemName: string
  details?: string | null
  total: number
  invoiceNumber?: string | null
  attachmentUrl?: string | null
  workOrderId?: string | null
}

export type ExpenseUpdatePayload = Partial<CreateExpenseInput>

export interface ExpenseWithWorkOrder {
  id: string
  date: Date
  itemName: string
  details: string | null
  total: Prisma.Decimal
  invoiceNumber: string | null
  attachmentUrl: string | null
  createdAt: Date
  updatedAt: Date
  businessId: string
  workOrderId: string | null
  workOrder?: {
    id: string
    workOrderNumber: string | null
    title: string
    clientId: string
    client?: { id: string; name: string; email: string | null } | null
  } | null
}

function toDecimalSafe(value: number | string): string {
  if (typeof value === 'number') {
    return String(value)
  }
  return value
}

/** List expenses for the business with optional filters (global module). */
export async function listExpenses(
  businessId: string,
  filters: ExpenseListFilters = {}
): Promise<{
  data: ExpenseWithWorkOrder[]
  pagination: { page: number; limit: number; total: number; totalPages: number }
}> {
  const {
    workOrderId,
    dateFrom,
    dateTo,
    invoiceNumber,
    clientId,
    page = 1,
    limit = 20,
    sortBy = 'date',
    order = 'desc',
  } = filters

  const where: Prisma.ExpenseWhereInput = {
    businessId,
  }

  if (workOrderId) {
    where.workOrderId = workOrderId
  }
  if (dateFrom || dateTo) {
    where.date = {}
    if (dateFrom) {
      ;(where.date as Prisma.DateTimeFilter).gte = dateFrom
    }
    if (dateTo) {
      ;(where.date as Prisma.DateTimeFilter).lte = dateTo
    }
  }
  if (invoiceNumber) {
    where.invoiceNumber = { contains: invoiceNumber, mode: 'insensitive' }
  }
  if (clientId) {
    where.workOrder = { clientId }
  }

  const [items, total] = await Promise.all([
    prisma.expense.findMany({
      where,
      include: {
        workOrder: {
          select: {
            id: true,
            workOrderNumber: true,
            title: true,
            clientId: true,
            client: { select: { id: true, name: true, email: true } },
          },
        },
      },
      orderBy: { [sortBy]: order },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.expense.count({ where }),
  ])

  return {
    data: items as ExpenseWithWorkOrder[],
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  }
}

/** List expenses for a specific work order (job-level). */
export async function listExpensesByWorkOrder(
  businessId: string,
  workOrderId: string
): Promise<ExpenseWithWorkOrder[]> {
  const workOrder = await prisma.workOrder.findFirst({
    where: { id: workOrderId, businessId },
    select: { id: true },
  })
  if (!workOrder) {
    throw new WorkOrderNotFoundError()
  }

  const items = await prisma.expense.findMany({
    where: { businessId, workOrderId },
    include: {
      workOrder: {
        select: {
          id: true,
          workOrderNumber: true,
          title: true,
          clientId: true,
          client: { select: { id: true, name: true, email: true } },
        },
      },
    },
    orderBy: { date: 'desc' },
  })
  return items as ExpenseWithWorkOrder[]
}

/** Get a single expense by ID (must belong to business). */
export async function getExpenseById(
  businessId: string,
  expenseId: string
): Promise<ExpenseWithWorkOrder | null> {
  const expense = await prisma.expense.findFirst({
    where: { id: expenseId, businessId },
    include: {
      workOrder: {
        select: {
          id: true,
          workOrderNumber: true,
          title: true,
          clientId: true,
          client: { select: { id: true, name: true, email: true } },
        },
      },
    },
  })
  return expense as ExpenseWithWorkOrder | null
}

/** Create an expense (global: workOrderId optional; job-level: pass workOrderId). */
export async function createExpense(
  businessId: string,
  input: CreateExpenseInput
): Promise<ExpenseWithWorkOrder> {
  if (input.workOrderId) {
    const wo = await prisma.workOrder.findFirst({
      where: { id: input.workOrderId, businessId },
      select: { id: true },
    })
    if (!wo) {
      throw new WorkOrderNotFoundError()
    }
  }

  const expense = await prisma.expense.create({
    data: {
      businessId,
      date: input.date,
      itemName: input.itemName,
      details: input.details ?? null,
      total: new Prisma.Decimal(toDecimalSafe(input.total)),
      invoiceNumber: input.invoiceNumber ?? null,
      attachmentUrl: input.attachmentUrl ?? null,
      workOrderId: input.workOrderId ?? null,
    },
    include: {
      workOrder: {
        select: {
          id: true,
          workOrderNumber: true,
          title: true,
          clientId: true,
          client: { select: { id: true, name: true, email: true } },
        },
      },
    },
  })
  return expense as ExpenseWithWorkOrder
}

/** Create expense linked to a specific work order (job-level). */
export async function createExpenseForWorkOrder(
  businessId: string,
  workOrderId: string,
  input: Omit<CreateExpenseInput, 'workOrderId'>
): Promise<ExpenseWithWorkOrder> {
  return createExpense(businessId, { ...input, workOrderId })
}

/** Update an expense. */
export async function updateExpense(
  businessId: string,
  expenseId: string,
  input: ExpenseUpdatePayload
): Promise<ExpenseWithWorkOrder> {
  const existing = await prisma.expense.findFirst({
    where: { id: expenseId, businessId },
    select: { id: true },
  })
  if (!existing) {
    throw new ExpenseNotFoundError()
  }

  if (input.workOrderId !== undefined && input.workOrderId !== null) {
    const wo = await prisma.workOrder.findFirst({
      where: { id: input.workOrderId, businessId },
      select: { id: true },
    })
    if (!wo) {
      throw new WorkOrderNotFoundError()
    }
  }

  const data: Prisma.ExpenseUpdateInput = {}
  if (input.date !== undefined) {
    data.date = input.date
  }
  if (input.itemName !== undefined) {
    data.itemName = input.itemName
  }
  if (input.details !== undefined) {
    data.details = input.details
  }
  if (input.total !== undefined) {
    data.total = new Prisma.Decimal(toDecimalSafe(input.total))
  }
  if (input.invoiceNumber !== undefined) {
    data.invoiceNumber = input.invoiceNumber
  }
  if (input.attachmentUrl !== undefined) {
    data.attachmentUrl = input.attachmentUrl
  }
  if (input.workOrderId !== undefined) {
    data.workOrder = input.workOrderId
      ? { connect: { id: input.workOrderId } }
      : { disconnect: true }
  }

  const expense = await prisma.expense.update({
    where: { id: expenseId },
    data,
    include: {
      workOrder: {
        select: {
          id: true,
          workOrderNumber: true,
          title: true,
          clientId: true,
          client: { select: { id: true, name: true, email: true } },
        },
      },
    },
  })
  return expense as ExpenseWithWorkOrder
}

/** Delete an expense. */
export async function deleteExpense(businessId: string, expenseId: string): Promise<void> {
  const existing = await prisma.expense.findFirst({
    where: { id: expenseId, businessId },
    select: { id: true },
  })
  if (!existing) {
    throw new ExpenseNotFoundError()
  }
  await prisma.expense.delete({ where: { id: expenseId } })
}
