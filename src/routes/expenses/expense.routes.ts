/**
 * Expenses API – §7 Expenses Management, §8 Global module.
 * List (filters: work order, date range, invoice number, client), get one, create, update, delete.
 */

import { createRoute, z } from '@hono/zod-openapi'
import * as HttpStatusCodes from 'stoker/http-status-codes'
import { jsonContent, jsonContentRequired } from 'stoker/openapi/helpers'
import { zodResponseSchema } from '~/lib/zod-helper'

export const ExpenseIdParamSchema = z.object({
  expenseId: z
    .string()
    .openapi({ param: { name: 'expenseId', in: 'path' }, description: 'Expense ID' }),
})

export const ExpenseListQuerySchema = z.object({
  workOrderId: z
    .string()
    .optional()
    .openapi({
      param: { name: 'workOrderId', in: 'query' },
      description: 'Filter by linked work order',
    }),
  dateFrom: z
    .string()
    .optional()
    .openapi({
      param: { name: 'dateFrom', in: 'query' },
      description: 'Filter expenses from this date (e.g. YYYY-MM-DD)',
    }),
  dateTo: z
    .string()
    .optional()
    .openapi({
      param: { name: 'dateTo', in: 'query' },
      description: 'Filter expenses until this date (e.g. YYYY-MM-DD)',
    }),
  invoiceNumber: z
    .string()
    .optional()
    .openapi({
      param: { name: 'invoiceNumber', in: 'query' },
      description: 'Filter by invoice number (partial match)',
    }),
  clientId: z
    .string()
    .optional()
    .openapi({
      param: { name: 'clientId', in: 'query' },
      description: 'Filter by client (expenses linked to a work order for this client)',
    }),
  sortBy: z
    .enum(['date', 'createdAt', 'total', 'itemName'])
    .optional()
    .openapi({
      param: { name: 'sortBy', in: 'query' },
    }),
  order: z
    .enum(['asc', 'desc'])
    .optional()
    .openapi({ param: { name: 'order', in: 'query' } }),
  page: z
    .string()
    .optional()
    .openapi({ param: { name: 'page', in: 'query' } }),
  limit: z
    .string()
    .optional()
    .openapi({ param: { name: 'limit', in: 'query' } }),
})

const WorkOrderRefSchema = z.object({
  id: z.string(),
  workOrderNumber: z.string().nullable(),
  title: z.string(),
  clientId: z.string(),
  client: z
    .object({
      id: z.string(),
      name: z.string(),
      email: z.string().nullable(),
    })
    .nullable()
    .optional(),
})

const ExpenseItemSchema = z.object({
  id: z.string(),
  date: z.coerce.date(),
  itemName: z.string(),
  details: z.string().nullable(),
  total: z.union([z.number(), z.string()]),
  invoiceNumber: z.string().nullable(),
  attachmentUrl: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  businessId: z.string(),
  workOrderId: z.string().nullable(),
  workOrder: WorkOrderRefSchema.nullable().optional(),
})

const PaginationSchema = z.object({
  page: z.number().int(),
  limit: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
})

export const ExpenseListResponseSchema = z.object({
  data: z.array(ExpenseItemSchema),
  pagination: PaginationSchema,
})

export const CreateExpenseBodySchema = z
  .object({
    date: z.coerce.date(),
    itemName: z.string().min(1, 'Item name is required'),
    details: z.string().optional().nullable(),
    total: z.number().min(0),
    invoiceNumber: z.string().optional().nullable(),
    attachmentUrl: z.string().optional().nullable().or(z.literal('')),
    workOrderId: z.string().optional().nullable(),
  })
  .transform(d => ({
    ...d,
    attachmentUrl: d.attachmentUrl === '' ? null : (d.attachmentUrl ?? null),
  }))
  .openapi({
    description:
      'Create expense. workOrderId optional (link when adding from Expenses module; omit when adding from work order).',
  })

export const UpdateExpenseBodySchema = z
  .object({
    date: z.coerce.date().optional(),
    itemName: z.string().min(1).optional(),
    details: z.string().optional().nullable(),
    total: z.number().min(0).optional(),
    invoiceNumber: z.string().optional().nullable(),
    attachmentUrl: z.string().optional().nullable().or(z.literal('')),
    workOrderId: z.string().optional().nullable(),
  })
  .transform(d => ({
    ...d,
    attachmentUrl: d.attachmentUrl === '' ? null : (d.attachmentUrl ?? null),
  }))
  .openapi({ description: 'Update expense (partial)' })

export const EXPENSE_ROUTES = {
  list: createRoute({
    method: 'get',
    tags: ['Expenses'],
    path: '/',
    summary: 'List all expenses with filters (work order, date range, invoice number, client)',
    request: { query: ExpenseListQuerySchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(ExpenseListResponseSchema), 'OK'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Business not found'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  getById: createRoute({
    method: 'get',
    tags: ['Expenses'],
    path: '/{expenseId}',
    summary: 'Get expense by ID',
    request: { params: ExpenseIdParamSchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(ExpenseItemSchema), 'OK'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Expense not found'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  create: createRoute({
    method: 'post',
    tags: ['Expenses'],
    path: '/',
    summary: 'Create expense (optionally linked to a work order)',
    request: { body: jsonContentRequired(CreateExpenseBodySchema, 'Expense payload') },
    responses: {
      [HttpStatusCodes.CREATED]: jsonContent(zodResponseSchema(ExpenseItemSchema), 'Created'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(
        zodResponseSchema(),
        'Business or work order not found'
      ),
      [HttpStatusCodes.BAD_REQUEST]: jsonContent(zodResponseSchema(), 'Validation error'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  update: createRoute({
    method: 'patch',
    tags: ['Expenses'],
    path: '/{expenseId}',
    summary: 'Update expense',
    request: {
      params: ExpenseIdParamSchema,
      body: jsonContentRequired(UpdateExpenseBodySchema, 'Update payload'),
    },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(ExpenseItemSchema), 'OK'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(
        zodResponseSchema(),
        'Expense or work order not found'
      ),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  delete: createRoute({
    method: 'delete',
    tags: ['Expenses'],
    path: '/{expenseId}',
    summary: 'Delete expense',
    request: { params: ExpenseIdParamSchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(
        zodResponseSchema(z.object({ deleted: z.boolean() })),
        'OK'
      ),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Expense not found'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),
}

export type ExpenseRoutes = typeof EXPENSE_ROUTES
