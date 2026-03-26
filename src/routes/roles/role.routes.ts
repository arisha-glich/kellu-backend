import { createRoute, z } from '@hono/zod-openapi'
import * as HttpStatusCodes from 'stoker/http-status-codes'
import { jsonContent, jsonContentRequired } from 'stoker/openapi/helpers'
import { zodResponseSchema } from '~/lib/zod-helper'

const PermissionInputSchema = z.object({
  resource: z.string().min(1),
  action: z.string().min(1),
})

const PermissionSchema = z.object({
  id: z.string(),
  resource: z.string(),
  action: z.string(),
  description: z.string().nullable(),
})

const RoleResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  displayName: z.string().nullable(),
  description: z.string().nullable(),
  isSystem: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  permissions: z.array(
    z.object({
      permission: PermissionSchema,
    })
  ),
  _count: z.object({ members: z.number().int() }),
})

export const RoleParamsSchema = z.object({
  roleId: z.string().openapi({ param: { name: 'roleId', in: 'path' } }),
})

export const CreateRoleBodySchema = z.object({
  name: z.string().min(1).max(50),
  displayName: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  permissions: z.array(PermissionInputSchema).min(1),
})

export const UpdateRoleBodySchema = z.object({
  name: z.string().min(1).max(50).optional(),
  displayName: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  permissions: z.array(PermissionInputSchema).optional(),
})

const PermissionMatrixSchema = z.array(
  z.object({
    resource: z.string(),
    actions: z.array(z.string()),
  })
)

const PermissionActionsSchema = z.array(z.string())

export const ROLE_ROUTES = {
  list: createRoute({
    method: 'get',
    tags: ['Roles'],
    path: '/',
    summary: 'List all roles for the business',
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(z.array(RoleResponseSchema)), 'OK'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Business not found'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  getPermissionMatrix: createRoute({
    method: 'get',
    tags: ['Roles'],
    path: '/permissions/matrix',
    summary: 'Get all available resources and actions (for permission builder UI)',
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(PermissionMatrixSchema), 'OK'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
    },
  }),

  getPermissionActions: createRoute({
    method: 'get',
    tags: ['Roles'],
    path: '/permissions/actions',
    summary: 'Get all available actions only (no resources)',
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(PermissionActionsSchema), 'OK'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
    },
  }),

  getById: createRoute({
    method: 'get',
    tags: ['Roles'],
    path: '/{roleId}',
    summary: 'Get role by ID with permissions',
    request: { params: RoleParamsSchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(RoleResponseSchema), 'OK'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Role not found'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  create: createRoute({
    method: 'post',
    tags: ['Roles'],
    path: '/',
    summary: 'Create a custom role with permissions',
    request: { body: jsonContentRequired(CreateRoleBodySchema, 'Create role payload') },
    responses: {
      [HttpStatusCodes.CREATED]: jsonContent(zodResponseSchema(RoleResponseSchema), 'Created'),
      [HttpStatusCodes.BAD_REQUEST]: jsonContent(zodResponseSchema(), 'Invalid permissions'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Business not found'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  update: createRoute({
    method: 'patch',
    tags: ['Roles'],
    path: '/{roleId}',
    summary: 'Update a custom role (system roles cannot be modified)',
    request: {
      params: RoleParamsSchema,
      body: jsonContentRequired(UpdateRoleBodySchema, 'Update role payload'),
    },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(RoleResponseSchema), 'OK'),
      [HttpStatusCodes.BAD_REQUEST]: jsonContent(
        zodResponseSchema(),
        'Invalid permissions or system role'
      ),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Role not found'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  delete: createRoute({
    method: 'delete',
    tags: ['Roles'],
    path: '/{roleId}',
    summary: 'Delete a custom role (fails if members are assigned)',
    request: { params: RoleParamsSchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(
        zodResponseSchema(z.object({ deleted: z.boolean() })),
        'OK'
      ),
      [HttpStatusCodes.BAD_REQUEST]: jsonContent(
        zodResponseSchema(),
        'Role is in use or is a system role'
      ),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Role not found'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),
}

export type RoleRoutes = typeof ROLE_ROUTES
