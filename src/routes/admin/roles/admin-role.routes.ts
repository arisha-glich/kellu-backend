import { createRoute } from '@hono/zod-openapi'
import * as HttpStatusCodes from 'stoker/http-status-codes'
import { jsonContent, jsonContentRequired } from 'stoker/openapi/helpers'
import { zodResponseSchema } from '~/lib/zod-helper'
import {
  CreateRoleBodySchema,
  RoleParamsSchema,
  UpdateRoleBodySchema,
} from '~/routes/roles/role.routes'

export const ADMIN_ROLE_ROUTES = {
  getPermissionMatrix: createRoute({
    method: 'get',
    tags: ['Admin Roles'],
    path: '/permissions/matrix',
    summary: 'Admin: get all available resources and actions',
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(), 'OK'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Admin portal only'),
    },
  }),
  getPermissionActions: createRoute({
    method: 'get',
    tags: ['Admin Roles'],
    path: '/permissions/actions',
    summary: 'Admin: get all available actions only',
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(), 'OK'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Admin portal only'),
    },
  }),
  list: createRoute({
    method: 'get',
    tags: ['Admin Roles'],
    path: '/',
    summary: 'Admin: list roles (optionally by ?businessId=...)',
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(), 'OK'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Admin portal only'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Business not found'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),
  getById: createRoute({
    method: 'get',
    tags: ['Admin Roles'],
    path: '/{roleId}',
    summary: 'Admin: get role by id',
    request: { params: RoleParamsSchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(), 'OK'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Role not found'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Admin portal only'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),
  create: createRoute({
    method: 'post',
    tags: ['Admin Roles'],
    path: '/',
    summary: 'Admin: create role',
    request: { body: jsonContentRequired(CreateRoleBodySchema, 'Create role payload') },
    responses: {
      [HttpStatusCodes.CREATED]: jsonContent(zodResponseSchema(), 'Created'),
      [HttpStatusCodes.BAD_REQUEST]: jsonContent(zodResponseSchema(), 'Invalid permissions'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Admin portal only'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Business not found'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),
  update: createRoute({
    method: 'patch',
    tags: ['Admin Roles'],
    path: '/{roleId}',
    summary: 'Admin: update role',
    request: {
      params: RoleParamsSchema,
      body: jsonContentRequired(UpdateRoleBodySchema, 'Update role payload'),
    },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(), 'OK'),
      [HttpStatusCodes.BAD_REQUEST]: jsonContent(zodResponseSchema(), 'Invalid request'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Role not found'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Admin portal only'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),
  delete: createRoute({
    method: 'delete',
    tags: ['Admin Roles'],
    path: '/{roleId}',
    summary: 'Admin: delete role',
    request: { params: RoleParamsSchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(), 'OK'),
      [HttpStatusCodes.BAD_REQUEST]: jsonContent(zodResponseSchema(), 'Role in use'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Role not found'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Admin portal only'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),
}
