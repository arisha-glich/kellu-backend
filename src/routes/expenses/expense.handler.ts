/**
 * Expenses API handlers – business resolved from authenticated user.
 */

import * as HttpStatusCodes from 'stoker/http-status-codes'
import type { EXPENSE_ROUTES } from '~/routes/expenses/expense.routes'
import { getBusinessIdByUserId } from '~/services/business.service'
import {
  createExpense,
  deleteExpense,
  ExpenseNotFoundError,
  getExpenseById,
  listExpenses,
  updateExpense,
  WorkOrderNotFoundError,
} from '~/services/expense.service'
import { hasPermission } from '~/services/permission.service'
import type { HandlerMapFromRoutes } from '~/types'

function parseDate(value: string | undefined): Date | undefined {
  if (!value) {
    return undefined
  }
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? undefined : d
}

export const EXPENSE_HANDLER: HandlerMapFromRoutes<typeof EXPENSE_ROUTES> = {
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
      if (!(await hasPermission(user.id, businessId, 'expenses', 'read'))) {
        return c.json(
          { message: 'You do not have permission to list expenses' },
          HttpStatusCodes.FORBIDDEN
        )
      }
      const query = c.req.valid('query')
      const page = query.page ? Number.parseInt(query.page, 10) : 1
      const limit = query.limit ? Number.parseInt(query.limit, 10) : 20
      const dateFrom = parseDate(query.dateFrom)
      const dateTo = parseDate(query.dateTo)
      const result = await listExpenses(businessId, {
        workOrderId: query.workOrderId,
        dateFrom,
        dateTo,
        invoiceNumber: query.invoiceNumber,
        clientId: query.clientId,
        sortBy: query.sortBy,
        order: query.order,
        page,
        limit,
      })
      return c.json(
        { message: 'Expenses retrieved successfully', success: true, data: result },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof Error && error.message === 'BUSINESS_NOT_FOUND') {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error listing expenses:', error)
      return c.json(
        { message: 'Failed to retrieve expenses' },
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
      if (!(await hasPermission(user.id, businessId, 'expenses', 'read'))) {
        return c.json(
          { message: 'You do not have permission to view this expense' },
          HttpStatusCodes.FORBIDDEN
        )
      }
      const { expenseId } = c.req.valid('param')
      const expense = await getExpenseById(businessId, expenseId)
      if (!expense) {
        return c.json({ message: 'Expense not found' }, HttpStatusCodes.NOT_FOUND)
      }
      return c.json(
        { message: 'Expense retrieved successfully', success: true, data: expense },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof Error && error.message === 'BUSINESS_NOT_FOUND') {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error fetching expense:', error)
      return c.json(
        { message: 'Failed to retrieve expense' },
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
      if (!(await hasPermission(user.id, businessId, 'expenses', 'create'))) {
        return c.json(
          { message: 'You do not have permission to create expenses' },
          HttpStatusCodes.FORBIDDEN
        )
      }
      const body = await c.req.valid('json')
      const expense = await createExpense(businessId, {
        date: body.date,
        itemName: body.itemName,
        details: body.details,
        total: body.total,
        invoiceNumber: body.invoiceNumber,
        attachmentUrl: body.attachmentUrl ? [body.attachmentUrl.join(',')] : undefined,
        workOrderId: body.workOrderId,
      })
      return c.json(
        { message: 'Expense created successfully', success: true, data: expense },
        HttpStatusCodes.CREATED
      )
    } catch (error) {
      if (error instanceof WorkOrderNotFoundError) {
        return c.json({ message: 'Work order not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof Error && error.message === 'BUSINESS_NOT_FOUND') {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error creating expense:', error)
      return c.json({ message: 'Failed to create expense' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
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
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'expenses', 'update'))) {
        return c.json(
          { message: 'You do not have permission to update expenses' },
          HttpStatusCodes.FORBIDDEN
        )
      }
      const { expenseId } = c.req.valid('param')
      const body = await c.req.valid('json')
      const expense = await updateExpense(businessId, expenseId, {
        date: body.date,
        itemName: body.itemName,
        details: body.details,
        total: body.total,
        invoiceNumber: body.invoiceNumber,
        attachmentUrl: body.attachmentUrl?.join(',') ? [body.attachmentUrl.join(',')] : undefined,
        workOrderId: body.workOrderId,
      })
      return c.json(
        { message: 'Expense updated successfully', success: true, data: expense },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof ExpenseNotFoundError) {
        return c.json({ message: 'Expense not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof WorkOrderNotFoundError) {
        return c.json({ message: 'Work order not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof Error && error.message === 'BUSINESS_NOT_FOUND') {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error updating expense:', error)
      return c.json({ message: 'Failed to update expense' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
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
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'expenses', 'delete'))) {
        return c.json(
          { message: 'You do not have permission to delete expenses' },
          HttpStatusCodes.FORBIDDEN
        )
      }
      const { expenseId } = c.req.valid('param')
      await deleteExpense(businessId, expenseId)
      return c.json(
        { message: 'Expense deleted successfully', success: true, data: { deleted: true } },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof ExpenseNotFoundError) {
        return c.json({ message: 'Expense not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof Error && error.message === 'BUSINESS_NOT_FOUND') {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error deleting expense:', error)
      return c.json({ message: 'Failed to delete expense' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
    }
  },
}
