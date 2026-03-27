/**
 * Invoice API routes – §6.1, §6.2.5, §7.
 * List invoices (work orders), overview stats, get one, create (New Invoice form), send invoice.
 */

import { createRoute, z } from '@hono/zod-openapi'
import * as HttpStatusCodes from 'stoker/http-status-codes'
import { jsonContent, jsonContentRequired } from 'stoker/openapi/helpers'
import { zodResponseSchema } from '~/lib/zod-helper'

const InvoiceStatusEnum = z.enum([
  'NOT_SENT',
  'AWAITING_PAYMENT',
  'OVERDUE',
  'PAID',
  'BAD_DEBT',
  'CANCELLED',
])

export const InvoiceListQuerySchema = z.object({
  search: z
    .string()
    .optional()
    .openapi({
      param: { name: 'search', in: 'query' },
      description: 'Search by client name, title, address, or invoice number',
    }),
  status: InvoiceStatusEnum.optional().openapi({
    param: { name: 'status', in: 'query' },
    description: 'Filter by invoice status',
  }),
  sortBy: z
    .enum(['dueAt', 'createdAt', 'updatedAt', 'title'])
    .optional()
    .openapi({ param: { name: 'sortBy', in: 'query' } }),
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

const InvoiceListItemSchema = z.object({
  id: z.string(),
  invoiceNumber: z.string().nullable(),
  title: z.string(),
  address: z.string().nullable(),
  dueAt: z.coerce.date().nullable(),
  status: InvoiceStatusEnum,
  total: z.number(),
  balance: z.number(),
  amountPaid: z.number(),
  client: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().nullable(),
    phone: z.string(),
  }),
})

const PaginationSchema = z.object({
  page: z.number().int(),
  limit: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
})

export const InvoiceListResponseSchema = z.object({
  data: z.array(InvoiceListItemSchema),
  pagination: PaginationSchema,
})

const OverviewBucketSchema = z.object({
  status: InvoiceStatusEnum,
  count: z.number().int(),
  total: z.number(),
})

export const InvoiceOverviewResponseSchema = z.object({
  byStatus: z.array(OverviewBucketSchema),
  issuedLast30Days: z.object({ count: z.number().int(), total: z.number() }),
  averageInvoiceLast30Days: z.number(),
})

export const InvoiceParamsSchema = z.object({
  invoiceId: z
    .string()
    .openapi({ param: { name: 'invoiceId', in: 'path' }, description: 'Invoice ID' }),
})

const InvoiceEmailComposeAttachmentSchema = z.object({
  id: z.string(),
  label: z.string(),
  filename: z.string(),
  source: z.enum(['INVOICE_PDF', 'QUOTE_PDF', 'JOB_REPORT_PDF', 'WORK_ORDER_ATTACHMENT']),
  sizeBytes: z.number().int().nullable(),
  selectedByDefault: z.boolean(),
})

const InvoiceEmailComposeResponseSchema = z.object({
  invoiceId: z.string(),
  from: z.string(),
  replyTo: z.string(),
  to: z.string().nullable(),
  subject: z.string(),
  message: z.string(),
  sendMeCopyDefault: z.boolean(),
  maxAdditionalAttachmentsBytes: z.number().int(),
  attachments: z.array(InvoiceEmailComposeAttachmentSchema),
})

export const SendInvoiceEmailBodySchema = z
  .object({
    from: z.string().email().optional().nullable(),
    replyTo: z.string().email().optional().nullable(),
    subject: z.string().optional().nullable(),
    message: z.string().optional().nullable(),
    to: z.string().email().optional().nullable(),
    sendMeCopy: z.boolean().optional().default(false),
    selectedAttachmentIds: z.array(z.string()).optional().default([]),
    additionalAttachments: z
      .array(
        z.object({
          filename: z.string().min(1),
          contentBase64: z.string().min(1),
          contentType: z.string().optional().nullable(),
        })
      )
      .optional()
      .default([]),
    markInvoiceSent: z.boolean().optional().default(true),
  })
  .openapi({
    description:
      'Email invoice modal: compose fields, selectable attachments, optional extra base64 files',
  })

const LineItemCreateSchema = z.object({
  name: z.string().min(1),
  itemType: z.enum(['SERVICE', 'PRODUCT']).optional().default('SERVICE'),
  description: z.string().optional().nullable(),
  quantity: z.number().int().min(1),
  price: z.number(),
  cost: z.number().optional().nullable(),
  priceListItemId: z.string().optional().nullable(),
})

export const CreateInvoiceBodySchema = z
  .object({
    title: z.string().min(1, 'Title is required'),
    clientId: z.string().min(1, 'Client is required'),
    address: z.string().min(1, 'Address is required'),
    assignedToId: z.string().optional().nullable(),
    workOrderId: z.string().optional().nullable(),
    lineItems: z.array(LineItemCreateSchema).optional(),
  })
  .openapi({ description: 'New Invoice form: client, address, title, line items' })

const InvoiceDetailSchema = z
  .object({
    id: z.string(),
    invoiceNumber: z.string().nullable(),
    title: z.string(),
    address: z.string().nullable(),
    status: InvoiceStatusEnum,
    sentAt: z.coerce.date().nullable(),
    dueAt: z.coerce.date().nullable(),
    subtotal: z.union([z.number(), z.string()]).nullable(),
    discount: z.union([z.number(), z.string()]).nullable(),
    tax: z.union([z.number(), z.string()]).nullable(),
    total: z.union([z.number(), z.string()]).nullable(),
    amountPaid: z.union([z.number(), z.string()]).nullable(),
    balance: z.union([z.number(), z.string()]).nullable(),
    client: z.any(),
    lineItems: z.array(z.any()),
    payments: z.array(z.any()),
    workOrder: z.any().nullable(),
    assignedTo: z.any().nullable(),
  })
  .passthrough()

export const INVOICE_ROUTES = {
  list: createRoute({
    method: 'get',
    tags: ['Invoices'],
    path: '/',
    summary: 'List all invoices with search and status filter',
    request: { query: InvoiceListQuerySchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(InvoiceListResponseSchema), 'OK'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Business not found'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  overview: createRoute({
    method: 'get',
    tags: ['Invoices'],
    path: '/overview',
    summary:
      'Get invoice overview (Past due, Sent but not due, Pending to send, Issued 30d, Average)',
    request: {},
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(InvoiceOverviewResponseSchema), 'OK'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Business not found'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  getById: createRoute({
    method: 'get',
    tags: ['Invoices'],
    path: '/{invoiceId}',
    summary: 'Get invoice by ID',
    request: { params: InvoiceParamsSchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(InvoiceDetailSchema), 'OK'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Invoice not found'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  create: createRoute({
    method: 'post',
    tags: ['Invoices'],
    path: '/',
    summary: 'Create new invoice (New Invoice form)',
    request: { body: jsonContentRequired(CreateInvoiceBodySchema, 'New Invoice payload') },
    responses: {
      [HttpStatusCodes.CREATED]: jsonContent(zodResponseSchema(InvoiceDetailSchema), 'Created'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Business or client not found'),
      [HttpStatusCodes.BAD_REQUEST]: jsonContent(zodResponseSchema(), 'Validation error'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  sendInvoice: createRoute({
    method: 'post',
    tags: ['Invoices'],
    path: '/{invoiceId}/send',
    summary: 'Send invoice (set status AWAITING_PAYMENT, sentAt, dueAt)',
    request: { params: InvoiceParamsSchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(InvoiceDetailSchema), 'Invoice sent'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Invoice not found'),
      [HttpStatusCodes.BAD_REQUEST]: jsonContent(
        zodResponseSchema(),
        'Invoice already sent or invalid state'
      ),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  getEmailCompose: createRoute({
    method: 'get',
    tags: ['Invoices'],
    path: '/{invoiceId}/email-compose',
    summary: 'Get prefilled data for Email invoice modal (From, Reply-To, attachments, etc.)',
    request: { params: InvoiceParamsSchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(InvoiceEmailComposeResponseSchema), 'OK'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Invoice not found'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  sendEmail: createRoute({
    method: 'post',
    tags: ['Invoices'],
    path: '/{invoiceId}/send-email',
    summary:
      'Send invoice email (HTML + attachments). Optional: mark invoice as sent (NOT_SENT → AWAITING_PAYMENT).',
    request: {
      params: InvoiceParamsSchema,
      body: jsonContentRequired(SendInvoiceEmailBodySchema, 'Invoice email payload'),
    },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(InvoiceDetailSchema), 'Email sent'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Invoice not found'),
      [HttpStatusCodes.BAD_REQUEST]: jsonContent(
        zodResponseSchema(),
        'No client email or attachments too large'
      ),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),
}

export type InvoiceRoutes = typeof INVOICE_ROUTES
