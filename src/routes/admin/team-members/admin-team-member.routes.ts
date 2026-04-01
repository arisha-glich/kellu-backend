import { createRoute } from '@hono/zod-openapi'
import * as HttpStatusCodes from 'stoker/http-status-codes'
import { jsonContent, jsonContentRequired } from 'stoker/openapi/helpers'
import { zodResponseSchema } from '~/lib/zod-helper'
import {
  AddMemberBodySchema,
  MemberIdParamSchema,
  UpdateMemberBodySchema,
} from '~/routes/team/team.routes'

export const ADMIN_TEAM_MEMBER_ROUTES = {
  list: createRoute({
    method: 'get',
    tags: ['Admin Team Members'],
    path: '/',
    summary: 'Admin: list team members',
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(), 'OK'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Business not found'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),
  getById: createRoute({
    method: 'get',
    tags: ['Admin Team Members'],
    path: '/{memberId}',
    summary: 'Admin: get team member by id',
    request: { params: MemberIdParamSchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(), 'OK'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Member not found'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),
  add: createRoute({
    method: 'post',
    tags: ['Admin Team Members'],
    path: '/',
    summary: 'Admin: add team member',
    request: { body: jsonContentRequired(AddMemberBodySchema, 'Team member payload') },
    responses: {
      [HttpStatusCodes.CREATED]: jsonContent(zodResponseSchema(), 'Created'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Business or role not found'),
      [HttpStatusCodes.BAD_REQUEST]: jsonContent(zodResponseSchema(), 'Invalid payload'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),
  update: createRoute({
    method: 'patch',
    tags: ['Admin Team Members'],
    path: '/{memberId}',
    summary: 'Admin: update team member',
    request: {
      params: MemberIdParamSchema,
      body: jsonContentRequired(UpdateMemberBodySchema, 'Update payload'),
    },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(), 'OK'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Member not found'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),
  remove: createRoute({
    method: 'delete',
    tags: ['Admin Team Members'],
    path: '/{memberId}',
    summary: 'Admin: remove team member',
    request: { params: MemberIdParamSchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(), 'OK'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Member not found'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),
}
