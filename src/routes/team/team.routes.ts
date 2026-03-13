/**
 * Team API – §11.1 Manage team members (Add team member: name, email, phone, RUT, role, picture, include in notifications, password).
 */

import { createRoute, z } from '@hono/zod-openapi'
import * as HttpStatusCodes from 'stoker/http-status-codes'
import { jsonContent, jsonContentRequired } from 'stoker/openapi/helpers'
import { zodResponseSchema } from '~/lib/zod-helper'

export const MemberIdParamSchema = z.object({
  memberId: z.string().openapi({ param: { name: 'memberId', in: 'path' }, description: 'Member ID' }),
})

const MemberUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  phone_no: z.string().nullable(),
  rut: z.string().nullable(),
  image: z.string().nullable(),
})

const MemberRoleSchema = z.object({
  id: z.string(),
  name: z.string(),
  displayName: z.string().nullable(),
})

const MemberItemSchema = z.object({
  id: z.string(),
  isActive: z.boolean(),
  includeInNotificationsWhenAssigned: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  userId: z.string(),
  businessId: z.string(),
  roleId: z.string(),
  user: MemberUserSchema,
  role: MemberRoleSchema,
})

export const AddMemberBodySchema = z
  .object({
    name: z.string().min(1, 'Name is required'),
    email: z.string().email('Valid email is required'),
    phoneNumber: z.string().min(1, 'Phone number is required'),
    rut: z.string().optional().nullable(),
    roleId: z.string().min(1, 'Role is required'),
    pictureUrl: z.string().optional().nullable().or(z.literal('')),
    includeInNotificationsWhenAssigned: z.boolean().optional().default(true),
    password: z.string().min(1, 'Password is required'),
    emailDescription: z.string().optional().nullable(),
  })
  .transform(d => ({
    ...d,
    pictureUrl: d.pictureUrl === '' ? null : d.pictureUrl ?? null,
  }))
  .openapi({
    description:
      'Add team member. Picture URL for email/WhatsApp when assigned. includeInNotificationsWhenAssigned: include in notifications when assigned to a job. emailDescription: optional text included in the invitation email (e.g. role summary).',
  })

export const UpdateMemberBodySchema = z
  .object({
    name: z.string().min(1).optional(),
    phoneNumber: z.string().optional(),
    rut: z.string().optional().nullable(),
    roleId: z.string().optional(),
    pictureUrl: z.string().optional().nullable().or(z.literal('')),
    includeInNotificationsWhenAssigned: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .transform(d => ({
    ...d,
    pictureUrl: d.pictureUrl === '' ? null : d.pictureUrl ?? null,
  }))
  .openapi({ description: 'Update team member (partial)' })

export const TEAM_ROUTES = {
  list: createRoute({
    method: 'get',
    tags: ['Team'],
    path: '/',
    summary: 'List team members',
    request: {},
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(z.object({ data: z.array(MemberItemSchema) })), 'OK'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Business not found'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  getById: createRoute({
    method: 'get',
    tags: ['Team'],
    path: '/{memberId}',
    summary: 'Get team member by ID',
    request: { params: MemberIdParamSchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(MemberItemSchema), 'OK'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Member not found'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  add: createRoute({
    method: 'post',
    tags: ['Team'],
    path: '/',
    summary: 'Add team member (creates user with password and assigns role)',
    request: { body: jsonContentRequired(AddMemberBodySchema, 'Team member payload') },
    responses: {
      [HttpStatusCodes.CREATED]: jsonContent(zodResponseSchema(MemberItemSchema), 'Created'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Business or role not found'),
      [HttpStatusCodes.BAD_REQUEST]: jsonContent(zodResponseSchema(), 'Email already in use in this business'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  update: createRoute({
    method: 'patch',
    tags: ['Team'],
    path: '/{memberId}',
    summary: 'Update team member',
    request: {
      params: MemberIdParamSchema,
      body: jsonContentRequired(UpdateMemberBodySchema, 'Update payload'),
    },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(MemberItemSchema), 'OK'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Member or role not found'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  remove: createRoute({
    method: 'delete',
    tags: ['Team'],
    path: '/{memberId}',
    summary: 'Remove team member from business',
    request: { params: MemberIdParamSchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(z.object({ deleted: z.boolean() })), 'OK'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Member not found'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),
}

export type TeamRoutes = typeof TEAM_ROUTES
