import { createRoute, z } from '@hono/zod-openapi'
import * as HttpStatusCodes from 'stoker/http-status-codes'
import { jsonContent, jsonContentRequired } from 'stoker/openapi/helpers'
import { zodResponseSchema } from '~/lib/zod-helper'

const RuleIdParamsSchema = z.object({
  ruleId: z.string().openapi({ param: { name: 'ruleId', in: 'path' } }),
})

const PlatformNotificationRuleSchema = z.object({
  id: z.string(),
  eventKey: z.string(),
  eventName: z.string(),
  triggerDescription: z.string(),
  isActive: z.boolean(),
  sortOrder: z.number().int(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

const RulesListResponseSchema = z.object({
  data: z.array(PlatformNotificationRuleSchema),
  total: z.number().int(),
  activeCount: z.number().int(),
  inactiveCount: z.number().int(),
})

const CreateRuleBodySchema = z.object({
  eventKey: z
    .string()
    .min(3)
    .regex(/^[A-Za-z0-9_]+$/, 'eventKey must be alphanumeric with underscores'),
  eventName: z.string().min(1),
  triggerDescription: z.string().min(1),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
})

const UpdateRuleBodySchema = z
  .object({
    eventName: z.string().min(1).optional(),
    triggerDescription: z.string().min(1).optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
  })
  .refine(obj => Object.values(obj).some(v => v !== undefined), {
    message: 'At least one field is required',
  })

const EmailForwardingSchema = z.object({
  clientEmailCopyEnabled: z.boolean(),
  clientEmailCopyTo: z.string().nullable(),
})

const PatchEmailForwardingBodySchema = z
  .object({
    clientEmailCopyEnabled: z.boolean().optional(),
    clientEmailCopyTo: z.union([z.string().email(), z.literal(''), z.null()]).optional(),
  })
  .refine(obj => Object.values(obj).some(v => v !== undefined), {
    message: 'At least one field is required',
  })

const adminNotificationErrors = {
  [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
  [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
  [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Not found'),
  [HttpStatusCodes.BAD_REQUEST]: jsonContent(zodResponseSchema(), 'Bad request'),
  [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
} as const

export const ADMIN_NOTIFICATION_ROUTES = {
  listRules: createRoute({
    method: 'get',
    tags: ['Admin Notifications'],
    path: '/rules',
    summary: 'Admin: list platform notification rules (with active/inactive counts)',
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(RulesListResponseSchema), 'OK'),
      ...adminNotificationErrors,
    },
  }),

  createRule: createRoute({
    method: 'post',
    tags: ['Admin Notifications'],
    path: '/rules',
    summary: 'Admin: create a custom notification rule',
    request: { body: jsonContentRequired(CreateRuleBodySchema, 'Create rule payload') },
    responses: {
      [HttpStatusCodes.CREATED]: jsonContent(
        zodResponseSchema(PlatformNotificationRuleSchema),
        'Created'
      ),
      ...adminNotificationErrors,
    },
  }),

  getRule: createRoute({
    method: 'get',
    tags: ['Admin Notifications'],
    path: '/rules/{ruleId}',
    summary: 'Admin: get one notification rule',
    request: { params: RuleIdParamsSchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(PlatformNotificationRuleSchema), 'OK'),
      ...adminNotificationErrors,
    },
  }),

  updateRule: createRoute({
    method: 'patch',
    tags: ['Admin Notifications'],
    path: '/rules/{ruleId}',
    summary: 'Admin: update notification rule (toggle active, edit labels)',
    request: {
      params: RuleIdParamsSchema,
      body: jsonContentRequired(UpdateRuleBodySchema, 'Update rule payload'),
    },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(PlatformNotificationRuleSchema), 'OK'),
      ...adminNotificationErrors,
    },
  }),

  deleteRule: createRoute({
    method: 'delete',
    tags: ['Admin Notifications'],
    path: '/rules/{ruleId}',
    summary: 'Admin: delete a notification rule',
    request: { params: RuleIdParamsSchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(
        zodResponseSchema(z.object({ deleted: z.literal(true) })),
        'OK'
      ),
      ...adminNotificationErrors,
    },
  }),

  getEmailForwarding: createRoute({
    method: 'get',
    tags: ['Admin Notifications'],
    path: '/email-forwarding',
    summary: 'Admin: platform email copy (BCC) when businesses email their customers',
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(EmailForwardingSchema), 'OK'),
      ...adminNotificationErrors,
    },
  }),

  patchEmailForwarding: createRoute({
    method: 'patch',
    tags: ['Admin Notifications'],
    path: '/email-forwarding',
    summary: 'Admin: update platform email copy settings',
    request: {
      body: jsonContentRequired(PatchEmailForwardingBodySchema, 'Email forwarding payload'),
    },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(EmailForwardingSchema), 'OK'),
      ...adminNotificationErrors,
    },
  }),
}
