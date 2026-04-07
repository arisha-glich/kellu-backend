import { createRoute, z } from '@hono/zod-openapi'
import * as HttpStatusCodes from 'stoker/http-status-codes'
import { jsonContent, jsonContentRequired } from 'stoker/openapi/helpers'
import { zodResponseSchema } from '~/lib/zod-helper'

/** List filter only — maps to no status filter when ALL */
const ClientStatusFilterEnum = z.enum(['ACTIVE', 'ARCHIVED', 'FOLLOW_UP', 'ALL'])
const ClientStatusOnlyEnum = z.enum(['ACTIVE', 'ARCHIVED', 'FOLLOW_UP'])

/** Normalize query typos/casing (e.g. `archived`, ` Archived `) for reliable filters. */
function normalizeClientListStatusQuery(
  v: unknown
): z.infer<typeof ClientStatusFilterEnum> | undefined {
  if (v === undefined || v === null) {
    return undefined
  }
  if (typeof v !== 'string') {
    return undefined
  }
  const s = v.trim().toUpperCase()
  if (s === '' || s === 'ALL') {
    return 'ALL'
  }
  if (s === 'ACTIVE' || s === 'ARCHIVED' || s === 'FOLLOW_UP') {
    return s
  }
  return undefined
}
/** Matches Prisma `LeadSource` (no UI-only values like All) */
const LeadSourcePrismaEnum = z.enum(['Website', 'SocialMedia', 'Referral', 'Other'])

export const ClientParamsSchema = z.object({
  id: z.string().openapi({ param: { name: 'id', in: 'path' }, description: 'Business ID' }),
})

/** Params for get/update/delete – only clientId (no business id in path) */
export const ClientOnlyParamsSchema = z.object({
  clientId: z
    .string()
    .openapi({ param: { name: 'clientId', in: 'path' }, description: 'Client ID' }),
})
export const ClientListQuerySchema = z.object({
  search: z
    .string()
    .optional()
    .openapi({
      param: { name: 'search', in: 'query' },
      description: 'Search by name, email, or phone',
    }),
  status: z.preprocess(normalizeClientListStatusQuery, ClientStatusFilterEnum.optional()).openapi({
    param: { name: 'status', in: 'query' },
    description: 'Filter by status (ACTIVE, ARCHIVED, FOLLOW_UP, ALL)',
  }),
  sortBy: z
    .enum(['name', 'lastActivityAt', 'createdAt'])
    .optional()
    .openapi({ param: { name: 'sortBy', in: 'query' }, description: 'Sort field' }),
  order: z
    .enum(['asc', 'desc'])
    .optional()
    .openapi({ param: { name: 'order', in: 'query' }, description: 'Sort order' }),
  page: z
    .string()
    .optional()
    .openapi({ param: { name: 'page', in: 'query' } }),
  limit: z
    .string()
    .optional()
    .openapi({ param: { name: 'limit', in: 'query' } }),
})

/** Same as list but without `status` (used for GET /archived). */
export const ClientArchivedListQuerySchema = ClientListQuerySchema.omit({ status: true })

export const ClientListItemSchema = z.object({
  id: z.string(),
  businessId: z.string(),
  name: z.string(),
  status: z.string(),
  lastActivity: z.string().nullable(),
})

export const ClientListResponseSchema = z.object({
  data: z.array(ClientListItemSchema),
  pagination: z.object({
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
})

export const ClientStatisticsSchema = z.object({
  newClientsLast30Days: z.number().int(),
  totalNewClientsYTD: z.number().int(),
})

export const ClientDetailSchema = z.object({
  id: z.string(),
  businessId: z.string(),
  name: z.string(),
  phone: z.string(),
  email: z.string().nullable(),
  address: z.string().nullable(),
  documentNumber: z.string().nullable(),
  leadSource: z.string(),
  notes: z.string().nullable(),
  status: z.string(),
  lastActivityAt: z.coerce.date().nullable(),
  lastActivity: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export const CreateClientBodySchema = z
  .object({
    name: z.string().min(1, 'Name is required'),
    phone: z.string().min(1, 'Phone is required'),
    email: z.string().email().optional().nullable().or(z.literal('')),
    documentNumber: z.string().optional().nullable(),
    leadSource: LeadSourcePrismaEnum.optional().default('Website'),
    notes: z.string().optional().nullable(),
  })
  .transform(d => ({
    ...d,
    email: d.email === '' ? null : (d.email ?? null),
  }))
  .openapi({ description: 'Add Client form: Contact details + Details + Notes' })

export const UpdateClientBodySchema = z
  .object({
    name: z.string().min(1).optional(),
    phone: z.string().min(1).optional(),
    email: z.string().email().optional().nullable().or(z.literal('')),
    documentNumber: z.string().optional().nullable(),
    leadSource: LeadSourcePrismaEnum.optional(),
    notes: z.string().optional().nullable(),
    status: ClientStatusOnlyEnum.optional(),
  })
  .transform(d => ({
    ...d,
    email: d.email === '' ? null : d.email,
  }))
  .openapi({ description: 'Update client fields' })

export const LeadSourceOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
})

export const LeadSourcesResponseSchema = z.array(LeadSourceOptionSchema)

export const CLIENT_ROUTES = {
  list: createRoute({
    method: 'get',
    tags: ['Clients'],
    path: '/',
    summary: 'List clients with filters and pagination',
    request: { query: ClientListQuerySchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(ClientListResponseSchema), 'OK'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Business not found'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  listArchived: createRoute({
    method: 'get',
    tags: ['Clients'],
    path: '/archived',
    summary: 'List archived clients (status ARCHIVED only)',
    request: { query: ClientArchivedListQuerySchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(ClientListResponseSchema), 'OK'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Business not found'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  getStatistics: createRoute({
    method: 'get',
    tags: ['Clients'],
    path: '/statistics',
    summary: 'Get client statistics (new clients last 30 days, total YTD)',
    request: {},
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(ClientStatisticsSchema), 'OK'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Business not found'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  getLeadSources: createRoute({
    method: 'get',
    tags: ['Clients'],
    path: '/lead-sources',
    summary: 'Get lead source options for dropdown',
    request: {},
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(LeadSourcesResponseSchema), 'OK'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Business not found'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  create: createRoute({
    method: 'post',
    tags: ['Clients'],
    path: '/',
    summary: 'Create a new client',
    request: { body: jsonContentRequired(CreateClientBodySchema, 'Add Client payload') },
    responses: {
      [HttpStatusCodes.CREATED]: jsonContent(zodResponseSchema(ClientDetailSchema), 'Created'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Business not found'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  getById: createRoute({
    method: 'get',
    tags: ['Clients'],
    path: '/{clientId}',
    summary: 'Get client by ID',
    request: { params: ClientOnlyParamsSchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(ClientDetailSchema), 'OK'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Client not found'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  update: createRoute({
    method: 'patch',
    tags: ['Clients'],
    path: '/{clientId}',
    summary: 'Update client',
    request: {
      params: ClientOnlyParamsSchema,
      body: jsonContentRequired(UpdateClientBodySchema, 'Update client payload'),
    },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(ClientDetailSchema), 'OK'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Client not found'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  delete: createRoute({
    method: 'delete',
    tags: ['Clients'],
    path: '/{clientId}',
    summary: 'Delete client',
    request: { params: ClientOnlyParamsSchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(
        zodResponseSchema(z.object({ deleted: z.boolean() })),
        'Deleted'
      ),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Client not found'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),
}

export type ClientRoutes = typeof CLIENT_ROUTES
