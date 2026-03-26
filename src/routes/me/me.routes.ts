/**
 * Current user context – role/permission for portal view (Better Auth integration).
 */

import { createRoute, z } from '@hono/zod-openapi'
import * as HttpStatusCodes from 'stoker/http-status-codes'
import { jsonContent } from 'stoker/openapi/helpers'
import { zodResponseSchema } from '~/lib/zod-helper'

const MeContextSchema = z.object({
  businessId: z.string().nullable(),
  isOwner: z.boolean(),
  memberId: z.string().nullable(),
  role: z
    .object({
      id: z.string(),
      name: z.string(),
      displayName: z.string().nullable(),
    })
    .nullable(),
  permissions: z.array(z.object({ resource: z.string(), action: z.string() })),
})

export const ME_ROUTES = {
  context: createRoute({
    method: 'get',
    tags: ['Me'],
    path: '/context',
    summary:
      'Get current user context (business, member role, permissions) for role-based portal view',
    request: {},
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(MeContextSchema), 'OK'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),
}

export type MeRoutes = typeof ME_ROUTES
