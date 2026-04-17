/**
 * Quote API routes – `Quote` model (separate from work orders / jobs).
 */

import { createRoute, z } from '@hono/zod-openapi'
import * as HttpStatusCodes from 'stoker/http-status-codes'
import { jsonContent, jsonContentRequired } from 'stoker/openapi/helpers'
import { zodResponseSchema } from '~/lib/zod-helper'

// ─── Enums (reuse same values as workorder routes) ───────────────────────────

const QuoteStatusEnum = z.enum([
  'NOT_SENT',
  'AWAITING_RESPONSE',
  'APPROVED',
  'CONVERTED',
  'REJECTED',
  'EXPIRED',
])

const ItemTypeEnum = z.enum(['SERVICE', 'PRODUCT'])

// ─── Params ──────────────────────────────────────────────────────────────────

export const QuoteParamsSchema = z.object({
  quoteId: z.string().openapi({
    param: { name: 'quoteId', in: 'path' },
    description: 'Quote id',
  }),
})

// ─── Request bodies ───────────────────────────────────────────────────────────

const LineItemCreateSchema = z.object({
  name: z.string().min(1),
  itemType: ItemTypeEnum.optional().default('SERVICE'),
  description: z.string().optional().nullable(),
  quantity: z.number().int().min(1),
  price: z.number().min(0),
  cost: z.number().optional().nullable(),
  priceListItemId: z.string().optional().nullable(),
})

export const CreateQuoteBodySchema = z
  .object({
    title: z.string().min(1, 'Title is required'),
    clientId: z.string().min(1, 'Client is required'),
    address: z.string().min(1, 'Address is required'),
    assignedToId: z.string().optional().nullable(),
    instructions: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    quoteTermsConditions: z.string().optional().nullable(),
    workOrderId: z.string().optional().nullable(),
    quoteRequired: z.boolean().optional().default(false),
    lineItems: z.array(LineItemCreateSchema).optional(),
  })
  .openapi({ description: 'Create quote (`Quote` row + line items)' })

/** Update quote (work order) fields. quoteStatus is never sent here — use send/approve/reject/set-awaiting-response. */
export const UpdateQuoteBodySchema = z
  .object({
    title: z.string().min(1).optional(),
    clientId: z.string().min(1).optional(),
    address: z.string().min(1).optional(),
    isScheduleLater: z.boolean().optional(),
    scheduledAt: z.coerce.date().optional().nullable(),
    startTime: z.string().optional().nullable(),
    endTime: z.string().optional().nullable(),
    assignedToId: z.string().optional().nullable(),
    instructions: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    quoteTermsConditions: z.string().optional().nullable(),
    workOrderId: z.string().optional().nullable(),
    quoteRequired: z.boolean().optional(),
    discount: z.number().min(0).optional(),
    discountType: z.enum(['PERCENTAGE', 'AMOUNT']).optional().nullable(),
    lineItems: z.array(LineItemCreateSchema).optional(),
  })
  .openapi({ description: 'Update quote; status changes only via actions' })

export const SendQuoteBodySchema = z
  .object({
    observations: z.string().optional().nullable(),
  })
  .openapi({ description: 'Send quote to client' })

export const UpdateQuoteStatusBodySchema = z
  .object({
    quoteStatus: QuoteStatusEnum,
  })
  .openapi({ description: 'Set quote status directly (business owner only)' })

export const ClientQuoteRespondQuerySchema = z.object({
  action: z.enum(['approve', 'reject']).openapi({
    param: { name: 'action', in: 'query' },
    description: 'Client response action',
  }),
  token: z
    .string()
    .min(10)
    .transform(s => s.trim())
    .openapi({
      param: { name: 'token', in: 'query' },
      description: 'Secure quote action token',
    }),
  quoteId: z
    .string()
    .min(1)
    .optional()
    .openapi({
      param: { name: 'quoteId', in: 'query' },
      description:
        'Quote id (included in email links; improves resolution if token encoding differs)',
    }),
})

export const ClientQuoteRejectBodySchema = z.object({
  quoteId: z
    .string()
    .min(1)
    .openapi({ description: 'Work order / quote id (same as quote record id)' }),
  reason: z.string().min(3, 'Rejection reason is required'),
  token: z
    .string()
    .min(10)
    .transform(s => s.trim())
    .optional()
    .openapi({
      description:
        'Quote action token from the email/link, or use the `x-quote-token` header instead',
    }),
})

export const SendQuoteEmailBodySchema = z
  .object({
    from: z.string().email().optional().nullable(),
    replyTo: z.string().email().optional().nullable(),
    subject: z
      .string()
      .optional()
      .nullable()
      .openapi({ description: 'Override default subject (e.g. from template)' }),
    message: z
      .string()
      .optional()
      .nullable()
      .openapi({ description: 'HTML or plain text body; default used if omitted' }),
    to: z
      .string()
      .email()
      .optional()
      .nullable()
      .openapi({ description: 'Override recipient; defaults to client email' }),
    sendMeCopy: z.boolean().optional().default(false),
    sendViaWhatsapp: z.boolean().optional().default(false),
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
  })
  .openapi({
    description:
      'Quote email compose payload: sender fields, message, recipient, selectable attachments, and optional extra attachments',
  })

const QuoteEmailComposeAttachmentSchema = z.object({
  id: z.string(),
  label: z.string(),
  filename: z.string(),
  source: z.enum(['QUOTE_PDF', 'JOB_REPORT_PDF', 'WORK_ORDER_ATTACHMENT']),
  sizeBytes: z.number().int().nullable(),
  selectedByDefault: z.boolean(),
})

const QuoteEmailComposeResponseSchema = z.object({
  quoteId: z.string(),
  from: z.string(),
  replyTo: z.string(),
  to: z.string().nullable(),
  subject: z.string(),
  message: z.string(),
  sendMeCopyDefault: z.boolean(),
  sendViaWhatsappDefault: z.boolean(),
  maxAdditionalAttachmentsBytes: z.number().int(),
  attachments: z.array(QuoteEmailComposeAttachmentSchema),
})

// ─── Query ───────────────────────────────────────────────────────────────────

export const QuoteListQuerySchema = z.object({
  search: z
    .string()
    .optional()
    .openapi({
      param: { name: 'search', in: 'query' },
      description: 'Search by client name, title, or address',
    }),
  quoteStatus: QuoteStatusEnum.optional().openapi({
    param: { name: 'quoteStatus', in: 'query' },
  }),
  sortBy: z
    .enum(['createdAt', 'updatedAt', 'title', 'scheduledAt'])
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

// ─── Response schemas ─────────────────────────────────────────────────────────

const LineItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  itemType: ItemTypeEnum,
  description: z.string().nullable(),
  quantity: z.number().int(),
  price: z.union([z.number(), z.string()]),
  cost: z.union([z.number(), z.string()]).nullable(),
})

const QuoteDetailSchema = z.object({
  id: z.string(),
  quoteId: z.string(),
  /** Present only when the quote is linked to a job work order (`workOrderId` on create/update). */
  workOrderId: z.string().optional(),
  quoteNumber: z.string().nullable(),
  workOrderNumber: z.string().nullable().optional(),
  title: z.string(),
  address: z.string(),
  instructions: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  isScheduleLater: z.boolean(),
  isAnyTime: z.boolean(),
  scheduledAt: z.coerce.date().nullable(),
  startTime: z.string().nullable(),
  endTime: z.string().nullable(),
  clientId: z.string(),
  businessId: z.string(),
  assignedToId: z.string().nullable(),
  quoteRequired: z.boolean(),
  quoteStatus: QuoteStatusEnum,
  quoteVersion: z.number().int(),
  quoteSentAt: z.coerce.date().nullable(),
  quoteApprovedAt: z.coerce.date().nullable(),
  quoteRejectedAt: z.coerce.date().nullable(),
  quoteExpiredAt: z.coerce.date().nullable(),
  quoteConvertedAt: z.coerce.date().nullable(),
  quoteExpiresAt: z.coerce.date().nullable(),
  quoteCorrelative: z.string().nullable(),
  quoteClientRespondedAt: z.coerce.date().nullable(),
  quoteClientRejectionReason: z.string().nullable(),
  quoteObservations: z.string().nullable(),
  quoteTermsConditions: z.string().nullable(),
  lastQuotePdfUrl: z.string().nullable(),
  lastJobReportPdfUrl: z.string().nullable().optional(),
  quoteClientActionToken: z.string().nullable().optional(),
  quoteWhatsappStatus: z.string().nullable().optional(),
  subtotal: z.union([z.number(), z.string()]).nullable(),
  discount: z.union([z.number(), z.string()]).nullable().optional(),
  discountType: z.enum(['PERCENTAGE', 'AMOUNT']).nullable().optional(),
  tax: z.union([z.number(), z.string()]).nullable().optional(),
  total: z.union([z.number(), z.string()]).nullable(),
  cost: z.union([z.number(), z.string()]).nullable(),
  amountPaid: z.union([z.number(), z.string()]).nullable().optional(),
  balance: z.union([z.number(), z.string()]).nullable(),
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
  lineItems: z.array(LineItemSchema),
  payments: z.array(z.unknown()).optional(),
  expenses: z.array(z.unknown()).optional(),
  attachments: z.array(z.unknown()).optional(),
})

const QuoteListLineItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  quantity: z.number().int(),
  price: z.union([z.number(), z.string()]),
})

const QuoteListItemSchema = z.object({
  id: z.string(),
  quoteId: z.string(),
  /** Present only when the quote is linked to a job work order. */
  workOrderId: z.string().optional(),
  quoteNumber: z.string().nullable(),
  workOrderNumber: z.string().nullable().optional(),
  quoteRequired: z.boolean(),
  /** e.g. "#3 — Window clean" */
  workOrderName: z.string(),
  title: z.string(),
  address: z.string(),
  quoteStatus: QuoteStatusEnum,
  quoteVersion: z.number().int(),
  quoteSentAt: z.coerce.date().nullable(),
  quoteExpiresAt: z.coerce.date().nullable(),
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
  lineItems: z.array(QuoteListLineItemSchema),
})

const PaginationSchema = z.object({
  page: z.number().int(),
  limit: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
})

const QuoteListEnvelopeSchema = z.object({
  quotes: z.array(QuoteListItemSchema),
  pagination: PaginationSchema,
})

const QuoteRejectionReasonResponseSchema = z.object({
  quoteId: z.string(),
  quoteStatus: QuoteStatusEnum,
  rejectionReason: z.string().nullable(),
  quoteRejectedAt: z.coerce.date().nullable(),
  quoteClientRespondedAt: z.coerce.date().nullable(),
})

const QuoteOverviewItemSchema = z.object({
  status: QuoteStatusEnum,
  count: z.number().int(),
})

// ─── Routes ───────────────────────────────────────────────────────────────────

export const QUOTE_ROUTES = {
  list: createRoute({
    method: 'get',
    tags: ['Quotes'],
    path: '/',
    summary: 'List quotes (WorkOrders with quoteRequired=true)',
    request: { query: QuoteListQuerySchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(QuoteListEnvelopeSchema), 'OK'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Business not found'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  overview: createRoute({
    method: 'get',
    tags: ['Quotes'],
    path: '/overview',
    summary: 'Get quote status counts for overview block',
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(z.array(QuoteOverviewItemSchema)), 'OK'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Business not found'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  getRejectionReason: createRoute({
    method: 'get',
    tags: ['Quotes'],
    path: '/{quoteId}/rejection-reason',
    summary: 'Get client rejection reason and related timestamps for a quote',
    request: { params: QuoteParamsSchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(
        zodResponseSchema(QuoteRejectionReasonResponseSchema),
        'OK'
      ),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Quote not found'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  getById: createRoute({
    method: 'get',
    tags: ['Quotes'],
    path: '/{quoteId}',
    summary: 'Get quote by ID',
    request: { params: QuoteParamsSchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(QuoteDetailSchema), 'OK'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Quote not found'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  // create: createRoute({
  //   method: 'post',
  //   tags: ['Quotes'],
  //   path: '/',
  //   summary: 'Create new quote ("Save Quote" button → creates WorkOrder with quoteRequired=true)',
  //   request: { body: jsonContentRequired(CreateQuoteBodySchema, 'Create quote payload') },
  //   responses: {
  //     [HttpStatusCodes.CREATED]: jsonContent(zodResponseSchema(QuoteDetailSchema), 'Created'),
  //     [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Business or client not found'),
  //     [HttpStatusCodes.BAD_REQUEST]: jsonContent(zodResponseSchema(), 'Validation error'),
  //     [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
  //     [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
  //     [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
  //   },
  // }),

  update: createRoute({
    method: 'patch',
    tags: ['Quotes'],
    path: '/{quoteId}',
    summary:
      'Update quote (work order) fields. quoteStatus is only changed via actions (send/approve/reject/set-awaiting-response).',
    request: {
      params: QuoteParamsSchema,
      body: jsonContentRequired(UpdateQuoteBodySchema, 'Update quote payload'),
    },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(QuoteDetailSchema), 'Updated'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Quote not found'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  updateStatus: createRoute({
    method: 'patch',
    tags: ['Quotes'],
    path: '/{quoteId}/status',
    summary: 'Update quote status (business owner only)',
    request: {
      params: QuoteParamsSchema,
      body: jsonContentRequired(UpdateQuoteStatusBodySchema, 'Update quote status payload'),
    },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(QuoteDetailSchema), 'Status updated'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Quote not found'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  delete: createRoute({
    method: 'delete',
    tags: ['Quotes'],
    path: '/{quoteId}',
    summary:
      'Delete quote (work order with quoteRequired=true). Cascades to line items, payments, etc.',
    request: { params: QuoteParamsSchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(
        zodResponseSchema(z.object({ message: z.string(), success: z.literal(true) })),
        'Deleted'
      ),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Quote not found'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  setAwaitingResponse: createRoute({
    method: 'post',
    tags: ['Quotes'],
    path: '/{quoteId}/set-awaiting-response',
    summary:
      'Manually set quote status to AWAITING_RESPONSE (only when current status is NOT_SENT). Sets sent_at and expires_at from settings.',
    request: { params: QuoteParamsSchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(QuoteDetailSchema), 'Status updated'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Quote not found'),
      [HttpStatusCodes.BAD_REQUEST]: jsonContent(
        zodResponseSchema(),
        'Quote not in NOT_SENT state'
      ),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  send: createRoute({
    method: 'post',
    tags: ['Quotes'],
    path: '/{quoteId}/send',
    summary: 'Send quote to client — sets status to AWAITING_RESPONSE',
    request: {
      params: QuoteParamsSchema,
      body: jsonContentRequired(SendQuoteBodySchema, 'Send options'),
    },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(QuoteDetailSchema), 'Quote sent'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Quote not found'),
      [HttpStatusCodes.BAD_REQUEST]: jsonContent(
        zodResponseSchema(),
        'No line items or terminal state'
      ),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  sendEmail: createRoute({
    method: 'post',
    tags: ['Quotes'],
    path: '/{quoteId}/send-email',
    summary:
      'Send (or resend) quote email to client using multipart/form-data (supports binary attachments).',
    request: {
      params: QuoteParamsSchema,
    },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(QuoteDetailSchema), 'Quote email sent'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Quote not found'),
      [HttpStatusCodes.BAD_REQUEST]: jsonContent(zodResponseSchema(), 'Client has no email'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  getEmailCompose: createRoute({
    method: 'get',
    tags: ['Quotes'],
    path: '/{quoteId}/email-compose',
    summary: 'Get prefilled quote email compose data for Send Quote modal',
    request: { params: QuoteParamsSchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(QuoteEmailComposeResponseSchema), 'OK'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Quote not found'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  approve: createRoute({
    method: 'post',
    tags: ['Quotes'],
    path: '/{quoteId}/approve',
    summary: 'Approve quote (manual or via public link)',
    request: { params: QuoteParamsSchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(QuoteDetailSchema), 'Quote approved'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Quote not found'),
      [HttpStatusCodes.BAD_REQUEST]: jsonContent(zodResponseSchema(), 'Terminal state'),
      [HttpStatusCodes.GONE]: jsonContent(zodResponseSchema(), 'Quote expired -7 days have passed'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  reject: createRoute({
    method: 'post',
    tags: ['Quotes'],
    path: '/{quoteId}/reject',
    summary: 'Reject quote',
    request: { params: QuoteParamsSchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(QuoteDetailSchema), 'Quote rejected'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Quote not found'),
      [HttpStatusCodes.BAD_REQUEST]: jsonContent(zodResponseSchema(), 'Terminal state'),
      [HttpStatusCodes.GONE]: jsonContent(zodResponseSchema(), 'Quote expired -7 days have passed'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),
  clientRespondGet: createRoute({
    method: 'get',
    tags: ['Quotes'],
    path: '/client/respond',
    summary: 'Client quote response (approve applies; reject redirects to frontend with token)',
    request: { query: ClientQuoteRespondQuerySchema },
    responses: {
      [HttpStatusCodes.MOVED_TEMPORARILY]: {
        description: 'Redirect to frontend (approve success, reject form, or error state)',
      },
      [HttpStatusCodes.BAD_REQUEST]: jsonContent(zodResponseSchema(), 'Invalid request'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Quote not found'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),
  clientRespondPost: createRoute({
    method: 'post',
    tags: ['Quotes'],
    path: '/client/respond/reject',
    summary: 'Client rejects quote (quoteId + reason + token in body or x-quote-token header)',
    request: {
      body: jsonContentRequired(ClientQuoteRejectBodySchema, 'Client rejection reason payload'),
    },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(
        zodResponseSchema(
          z.object({
            quoteId: z.string(),
            clientId: z.string(),
            quoteCorrelative: z.string().nullable(),
            status: z.literal('REJECTED'),
          })
        ),
        'Rejected'
      ),
      [HttpStatusCodes.BAD_REQUEST]: jsonContent(zodResponseSchema(), 'Invalid payload'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Quote not found'),
      [HttpStatusCodes.GONE]: jsonContent(zodResponseSchema(), 'Quote expired -7 days have passed'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),
}

export type QuoteRoutes = typeof QUOTE_ROUTES
