/**
 * Workorder API routes – §6 Workorder Management.
 * List (with filters + search), overview blocks, get one, create, update, delete, register payment.
 */

import { createRoute, z } from '@hono/zod-openapi'
import * as HttpStatusCodes from 'stoker/http-status-codes'
import { jsonContent, jsonContentRequired } from 'stoker/openapi/helpers'
import { zodResponseSchema } from '~/lib/zod-helper'

const QuoteStatusEnum = z.enum([
  'NOT_SENT',
  'AWAITING_RESPONSE',
  'APPROVED',
  'CONVERTED',
  'REJECTED',
  'EXPIRED',
])
const JobStatusEnum = z.enum([
  'UNSCHEDULED',
  'UNASSIGNED',
  'SCHEDULED',
  'ON_MY_WAY',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
])
const InvoiceStatusEnum = z.enum([
  'NOT_SENT',
  'AWAITING_PAYMENT',
  'OVERDUE',
  'PAID',
  'BAD_DEBT',
  'CANCELLED',
])
const DiscountTypeEnum = z.enum(['PERCENTAGE', 'AMOUNT'])
const ItemTypeEnum = z.enum(['SERVICE', 'PRODUCT'])
const PaymentMethodEnum = z.enum([
  'CASH',
  'CARD',
  'TRANSFER',
  'MERCADOPAGO',
  'TRANSBANK',
  'OTHER',
])

export const WorkOrderParamsSchema = z.object({
  workOrderId: z.string().openapi({ param: { name: 'workOrderId', in: 'path' }, description: 'Work order ID' }),
})

/** Params for line-item sub-resource (workOrderId + lineItemId). */
export const WorkOrderLineItemParamsSchema = z.object({
  workOrderId: z.string().openapi({ param: { name: 'workOrderId', in: 'path' }, description: 'Work order ID' }),
  lineItemId: z.string().openapi({ param: { name: 'lineItemId', in: 'path' }, description: 'Line item ID' }),
})

const PriceListItemSchemaInWorkorder = z.object({
  id: z.string(),
  itemType: ItemTypeEnum,
  name: z.string(),
  description: z.string().nullable(),
  cost: z.union([z.number(), z.string()]).nullable(),
  markupPercent: z.union([z.number(), z.string()]).nullable(),
  price: z.union([z.number(), z.string()]),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export const WorkOrderListQuerySchema = z.object({
  search: z
    .string()
    .optional()
    .openapi({ param: { name: 'search', in: 'query' }, description: 'Search by client name, title, or address' }),
  quoteStatus: QuoteStatusEnum.optional().openapi({
    param: { name: 'quoteStatus', in: 'query' },
    description: 'Filter by quote status',
  }),
  jobStatus: JobStatusEnum.optional().openapi({
    param: { name: 'jobStatus', in: 'query' },
    description: 'Filter by job status',
  }),
  invoiceStatus: InvoiceStatusEnum.optional().openapi({
    param: { name: 'invoiceStatus', in: 'query' },
    description: 'Filter by invoice status',
  }),
  sortBy: z
    .enum(['scheduledAt', 'createdAt', 'updatedAt', 'title'])
    .optional()
    .openapi({ param: { name: 'sortBy', in: 'query' } }),
  order: z.enum(['asc', 'desc']).optional().openapi({ param: { name: 'order', in: 'query' } }),
  page: z.string().optional().openapi({ param: { name: 'page', in: 'query' } }),
  limit: z.string().optional().openapi({ param: { name: 'limit', in: 'query' } }),
})

const LineItemCreateSchema = z.object({
  name: z.string().min(1),
  itemType: ItemTypeEnum.optional().default('SERVICE'),
  description: z.string().optional().nullable(),
  quantity: z.number().int().min(1),
  price: z.number(),
  cost: z.number().optional().nullable(),
  priceListItemId: z.string().optional().nullable(),
})

/** Add from price list: copy item from master. */
const AddLineItemFromPriceListSchema = z.object({
  priceListItemId: z.string().min(1),
  quantity: z.number().int().min(1),
})

/** Custom line item (not in master list). */
const AddLineItemCustomSchema = z.object({
  name: z.string().min(1),
  quantity: z.number().int().min(1),
  price: z.number(),
  itemType: ItemTypeEnum.optional().default('SERVICE'),
  description: z.string().optional().nullable(),
  cost: z.number().optional().nullable(),
})

/** One of: from price list OR custom. */
const AddLineItemSchema = z.union([AddLineItemFromPriceListSchema, AddLineItemCustomSchema])

export const AddLineItemsBodySchema = z
  .object({
    items: z.array(AddLineItemSchema).min(1).max(100),
  })
  .openapi({ description: 'Add line items: from price list (priceListItemId + quantity) or custom (name, quantity, price)' })

export const AddToPriceListBodySchema = z
  .object({
    linkLineItem: z.boolean().optional().default(true),
  })
  .openapi({ description: 'If true, link the line item to the new price list item' })

export const CreateWorkOrderBodySchema = z
  .object({
    title: z.string().min(1, 'Title is required'),
    clientId: z.string().min(1, 'Client is required'),
    address: z.string().min(1, 'Address is required'),
    isScheduleLater: z.boolean().optional().default(false),
    scheduledAt: z.coerce.date().optional().nullable(),
    startTime: z.string().optional().nullable(),
    endTime: z.string().optional().nullable(),
    assignedToId: z.string().optional().nullable(),
    instructions: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    quoteRequired: z.boolean().optional().default(false),
    quoteTermsConditions: z.string().optional().nullable(),
    invoiceTermsConditions: z.string().optional().nullable(),
    discount: z.number().optional(),
    discountType: DiscountTypeEnum.optional().nullable(),
    taxPercent: z.number().optional().nullable(),
    lineItems: z.array(LineItemCreateSchema).optional(),
  })
  .openapi({ description: 'Create work order payload' })

export const UpdateWorkOrderBodySchema = CreateWorkOrderBodySchema.partial().openapi({
  description: 'Update work order – partial',
})

export const RegisterPaymentBodySchema = z
  .object({
    amount: z.number().positive(),
    paymentDate: z.coerce.date(),
    paymentMethod: PaymentMethodEnum,
    referenceNumber: z.string().optional().nullable(),
    note: z.string().optional().nullable(),
  })
  .openapi({ description: 'Register payment on work order' })

const WorkOrderListItemSchema = z.object({
  id: z.string(),
  workOrderNumber: z.string().nullable(),
  title: z.string(),
  address: z.string(),
  scheduledAt: z.coerce.date().nullable(),
  startTime: z.string().nullable(),
  endTime: z.string().nullable(),
  quoteStatus: QuoteStatusEnum,
  jobStatus: JobStatusEnum,
  invoiceStatus: InvoiceStatusEnum,
  total: z.union([z.number(), z.string()]).nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  client: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().nullable(),
    phone: z.string(),
  }),
  assignedTo: z
    .object({
      id: z.string(),
      user: z.object({ name: z.string().nullable(), email: z.string() }),
    })
    .nullable(),
})

const PaginationSchema = z.object({
  page: z.number().int(),
  limit: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
})

export const WorkOrderListResponseSchema = z.object({
  data: z.array(WorkOrderListItemSchema),
  pagination: PaginationSchema,
})

const StatusCountSchema = z.object({
  status: z.string(),
  count: z.number().int(),
})

export const WorkOrderOverviewResponseSchema = z.object({
  quoteStatus: z.array(StatusCountSchema),
  jobStatus: z.array(StatusCountSchema),
  invoiceStatus: z.array(StatusCountSchema),
})

const LineItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  itemType: ItemTypeEnum,
  description: z.string().nullable(),
  quantity: z.number().int(),
  price: z.union([z.number(), z.string()]),
  cost: z.union([z.number(), z.string()]).nullable(),
})

const PaymentSchema = z.object({
  id: z.string(),
  amount: z.union([z.number(), z.string()]),
  paymentDate: z.coerce.date(),
  paymentMethod: z.string(),
  referenceNumber: z.string().nullable(),
  note: z.string().nullable(),
})

export const WorkOrderDetailResponseSchema = z.object({
  id: z.string(),
  workOrderNumber: z.string().nullable(),
  title: z.string(),
  address: z.string(),
  instructions: z.string().nullable(),
  notes: z.string().nullable(),
  isScheduleLater: z.boolean(),
  scheduledAt: z.coerce.date().nullable(),
  startTime: z.string().nullable(),
  endTime: z.string().nullable(),
  quoteStatus: QuoteStatusEnum,
  jobStatus: JobStatusEnum,
  invoiceStatus: InvoiceStatusEnum,
  subtotal: z.union([z.number(), z.string()]).nullable(),
  discount: z.union([z.number(), z.string()]).nullable(),
  discountType: DiscountTypeEnum.nullable(),
  tax: z.union([z.number(), z.string()]).nullable(),
  total: z.union([z.number(), z.string()]).nullable(),
  cost: z.union([z.number(), z.string()]).nullable(),
  amountPaid: z.union([z.number(), z.string()]).nullable(),
  balance: z.union([z.number(), z.string()]).nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  client: z.any(),
  assignedTo: z.any().nullable(),
  lineItems: z.array(LineItemSchema),
  payments: z.array(PaymentSchema),
})

const AddToPriceListResponseSchema = z.object({
  priceListItem: PriceListItemSchemaInWorkorder,
  workOrder: WorkOrderDetailResponseSchema,
})

/** Query for listing price list items (for work order "add from price list" UI). */
export const WorkOrderPriceListQuerySchema = z.object({
  search: z
    .string()
    .optional()
    .openapi({ param: { name: 'search', in: 'query' }, description: 'Search by name or description' }),
  itemType: ItemTypeEnum.optional().openapi({
    param: { name: 'itemType', in: 'query' },
    description: 'Filter by item type (SERVICE or PRODUCT)',
  }),
  sortBy: z
    .enum(['name', 'createdAt', 'itemType'])
    .optional()
    .openapi({ param: { name: 'sortBy', in: 'query' } }),
  order: z.enum(['asc', 'desc']).optional().openapi({ param: { name: 'order', in: 'query' } }),
  page: z.string().optional().openapi({ param: { name: 'page', in: 'query' } }),
  limit: z.string().optional().openapi({ param: { name: 'limit', in: 'query' } }),
})

const WorkOrderPriceListResponseSchema = z.object({
  data: z.array(PriceListItemSchemaInWorkorder),
  pagination: PaginationSchema,
})

export const WORK_ORDER_ROUTES = {
  list: createRoute({
    method: 'get',
    tags: ['Workorders'],
    path: '/',
    summary: 'List work orders with filters and pagination ',
    request: { query: WorkOrderListQuerySchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(WorkOrderListResponseSchema), 'OK'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Business not found'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  overview: createRoute({
    method: 'get',
    tags: ['Workorders'],
    path: '/overview',
    summary: 'Get quote/job/invoice status counts for overview blocks ',
    request: {},
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(WorkOrderOverviewResponseSchema), 'OK'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Business not found'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  getPriceListItems: createRoute({
    method: 'get',
    tags: ['Workorders'],
    path: '/price-list-items',
    summary: 'Get master price list items (for work order: add from price list)',
    request: { query: WorkOrderPriceListQuerySchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(WorkOrderPriceListResponseSchema), 'OK'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Business not found'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  getById: createRoute({
    method: 'get',
    tags: ['Workorders'],
    path: '/{workOrderId}',
    summary: 'Get work order by ID with full details ',
    request: { params: WorkOrderParamsSchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(WorkOrderDetailResponseSchema), 'OK'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Work order not found'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  create: createRoute({
    method: 'post',
    tags: ['Workorders'],
    path: '/',
    summary: 'Create work order ',
    request: { body: jsonContentRequired(CreateWorkOrderBodySchema, 'Create work order payload') },
    responses: {
      [HttpStatusCodes.CREATED]: jsonContent(zodResponseSchema(WorkOrderDetailResponseSchema), 'Created'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Business or client not found'),
      [HttpStatusCodes.BAD_REQUEST]: jsonContent(zodResponseSchema(), 'Validation error'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  update: createRoute({
    method: 'patch',
    tags: ['Workorders'],
    path: '/{workOrderId}',
    summary: 'Update work order ',
    request: {
      params: WorkOrderParamsSchema,
      body: jsonContentRequired(UpdateWorkOrderBodySchema, 'Update payload'),
    },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(WorkOrderDetailResponseSchema), 'OK'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Work order not found'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  delete: createRoute({
    method: 'delete',
    tags: ['Workorders'],
    path: '/{workOrderId}',
    summary: 'Delete work order',
    request: { params: WorkOrderParamsSchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(z.object({ deleted: z.boolean() })), 'OK'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Work order not found'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  registerPayment: createRoute({
    method: 'post',
    tags: ['Workorders'],
    path: '/{workOrderId}/payments',
    summary: 'Register payment on work order ',
    request: {
      params: WorkOrderParamsSchema,
      body: jsonContentRequired(RegisterPaymentBodySchema, 'Payment payload'),
    },
    responses: {
      [HttpStatusCodes.CREATED]: jsonContent(zodResponseSchema(WorkOrderDetailResponseSchema), 'Payment registered'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Work order not found'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  addLineItems: createRoute({
    method: 'post',
    tags: ['Workorders'],
    path: '/{workOrderId}/line-items',
    summary: 'Add line items to work order (from price list or custom)',
    request: {
      params: WorkOrderParamsSchema,
      body: jsonContentRequired(AddLineItemsBodySchema, 'Items: from price list or custom'),
    },
    responses: {
      [HttpStatusCodes.CREATED]: jsonContent(zodResponseSchema(WorkOrderDetailResponseSchema), 'Line items added'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Work order or price list item not found'),
      [HttpStatusCodes.BAD_REQUEST]: jsonContent(zodResponseSchema(), 'Validation error'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  addLineItemToPriceList: createRoute({
    method: 'post',
    tags: ['Workorders'],
    path: '/{workOrderId}/line-items/{lineItemId}/add-to-price-list',
    summary: 'Save line item to master price list (reusable for future work orders)',
    request: {
      params: WorkOrderLineItemParamsSchema,
      body: jsonContentRequired(AddToPriceListBodySchema, 'Optional: { linkLineItem: true }'),
    },
    responses: {
      [HttpStatusCodes.CREATED]: jsonContent(
        zodResponseSchema(AddToPriceListResponseSchema),
        'Price list item created from line item'
      ),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Work order or line item not found'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),
}

export type WorkOrderRoutes = typeof WORK_ORDER_ROUTES
