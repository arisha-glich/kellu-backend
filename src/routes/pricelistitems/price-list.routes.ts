/**
 * Master Price List API – CRUD for price list items (services/products).
 * Add item form: Item type, Item name, Description, Cost, Markup %, Price.
 */

import { createRoute, z } from '@hono/zod-openapi'
import * as HttpStatusCodes from 'stoker/http-status-codes'
import { jsonContent, jsonContentRequired } from 'stoker/openapi/helpers'
import { zodResponseSchema } from '~/lib/zod-helper'

const ItemTypeEnum = z.enum(['SERVICE', 'PRODUCT'])

export const PriceListItemIdParamsSchema = z.object({
  id: z.string().openapi({ param: { name: 'id', in: 'path' }, description: 'Price list item ID' }),
})

export const PriceListQuerySchema = z.object({
  search: z
    .string()
    .optional()
    .openapi({
      param: { name: 'search', in: 'query' },
      description: 'Search by name or description',
    }),
  itemType: ItemTypeEnum.optional().openapi({
    param: { name: 'itemType', in: 'query' },
    description: 'Filter by item type (SERVICE or PRODUCT)',
  }),
  sortBy: z
    .enum(['name', 'createdAt', 'itemType'])
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

const PriceListItemSchema = z.object({
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

export const PriceListResponseSchema = z.object({
  data: z.array(PriceListItemSchema),
  pagination: z.object({
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
})

export const CreatePriceListItemBodySchema = z
  .object({
    itemType: ItemTypeEnum.default('SERVICE'),
    name: z.string().min(1, 'Item name is required'),
    description: z.string().optional().nullable(),
    cost: z.number().min(0).optional().nullable(),
    markupPercent: z.number().min(0).optional().nullable(),
    price: z.number().min(0, 'Price is required'),
  })
  .openapi({ description: 'Add item – service or product with cost, markup %, price' })

export const UpdatePriceListItemBodySchema = CreatePriceListItemBodySchema.partial().openapi({
  description: 'Update price list item – partial',
})

/** Bulk import: same shape as create, array of items. CSV can be parsed client-side and sent as this. */
export const ImportPriceListBodySchema = z
  .object({
    items: z.array(CreatePriceListItemBodySchema).min(1).max(500),
  })
  .openapi({ description: 'Bulk import price list items (e.g. from CSV parsed client-side)' })

export const ImportPriceListResponseSchema = z.object({
  created: z.number().int(),
  data: z.array(PriceListItemSchema),
})

export const PRICE_LIST_ROUTES = {
  list: createRoute({
    method: 'get',
    tags: ['Price List'],
    path: '/',
    summary: 'List master price list items (services and products)',
    request: { query: PriceListQuerySchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(PriceListResponseSchema), 'OK'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Business not found'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  getById: createRoute({
    method: 'get',
    tags: ['Price List'],
    path: '/{id}',
    summary: 'Get price list item by ID',
    request: { params: PriceListItemIdParamsSchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(PriceListItemSchema), 'OK'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Price list item not found'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  create: createRoute({
    method: 'post',
    tags: ['Price List'],
    path: '/',
    summary: 'Add item to master price list (Add item form)',
    request: { body: jsonContentRequired(CreatePriceListItemBodySchema, 'Add item payload') },
    responses: {
      [HttpStatusCodes.CREATED]: jsonContent(zodResponseSchema(PriceListItemSchema), 'Created'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Business not found'),
      [HttpStatusCodes.BAD_REQUEST]: jsonContent(zodResponseSchema(), 'Validation error'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  update: createRoute({
    method: 'patch',
    tags: ['Price List'],
    path: '/{id}',
    summary: 'Update price list item',
    request: {
      params: PriceListItemIdParamsSchema,
      body: jsonContentRequired(UpdatePriceListItemBodySchema, 'Update payload'),
    },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(PriceListItemSchema), 'OK'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Price list item not found'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  delete: createRoute({
    method: 'delete',
    tags: ['Price List'],
    path: '/{id}',
    summary: 'Delete price list item',
    request: { params: PriceListItemIdParamsSchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(
        zodResponseSchema(z.object({ deleted: z.boolean() })),
        'OK'
      ),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Price list item not found'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  import: createRoute({
    method: 'post',
    tags: ['Price List'],
    path: '/import',
    summary: 'Bulk import price list items (CSV/Excel: parse client-side and send as JSON array)',
    request: { body: jsonContentRequired(ImportPriceListBodySchema, 'Array of items to import') },
    responses: {
      [HttpStatusCodes.CREATED]: jsonContent(
        zodResponseSchema(ImportPriceListResponseSchema),
        'Import result'
      ),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Business not found'),
      [HttpStatusCodes.BAD_REQUEST]: jsonContent(zodResponseSchema(), 'Validation error'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),
}

export type PriceListRoutes = typeof PRICE_LIST_ROUTES
