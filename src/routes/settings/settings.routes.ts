/**
 * Company Settings API (§13.1 Profile & Company Settings).
 * GET/PATCH current business profile + settings (Reply list, Due dates, Company details,
 * Bank details, Terms, Arrival window, WhatsApp, Tax).
 */

import { createRoute, z } from '@hono/zod-openapi'
import * as HttpStatusCodes from 'stoker/http-status-codes'
import { jsonContent, jsonContentRequired } from 'stoker/openapi/helpers'
import { zodResponseSchema } from '~/lib/zod-helper'

const PersonalProfileSchema = z.object({
  fullName: z.string().nullable(),
  email: z.string(),
})

const CompanySchema = z.object({
  id: z.string(),
  name: z.string(),
  legalName: z.string().nullable(),
  email: z.string(),
  phone: z.string().nullable(),
  webpage: z.string().nullable(),
  address: z.string().nullable(),
  street1: z.string().nullable(),
  street2: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  zipcode: z.string().nullable(),
  logoUrl: z.string().nullable(),
  primaryColor: z.string().nullable(),
  secondaryColor: z.string().nullable(),
  rutNumber: z.string().nullable(),
})

const SettingsBlockSchema = z.object({
  replyToEmail: z.string().nullable(),
  quoteExpirationDays: z.number().int(),
  invoiceDueDays: z.number().int(),
  arrivalWindowHours: z.number().int().nullable(),
  arrivalWindowMinutes: z.number().int().nullable(),
  defaultDurationMinutes: z.number().int().nullable(),
  bankName: z.string().nullable(),
  accountType: z.string().nullable(),
  accountNumber: z.string().nullable(),
  paymentEmail: z.string().nullable(),
  onlinePaymentLink: z.string().nullable(),
  quoteTermsConditions: z.string().nullable(),
  invoiceTermsConditions: z.string().nullable(),
  whatsappSender: z.string().nullable(),
  defaultTaxRate: z.number().nullable(),
  taxIdRut: z.string().nullable(),
  sendTeamPhotosWithConfirmation: z.boolean(),
})

const CurrentSettingsResponseSchema = z.object({
  personalProfile: PersonalProfileSchema,
  company: CompanySchema,
  settings: SettingsBlockSchema,
})

const UpdateSettingsBodySchema = z
  .object({
    fullName: z.string().optional(),
    email: z.string().email().optional(),
    name: z.string().optional(),
    legalName: z.string().nullable().optional(),
    companyEmail: z.string().email().optional(),
    phone: z.string().nullable().optional(),
    webpage: z.string().url().nullable().or(z.literal('')).optional(),
    address: z.string().nullable().optional(),
    street1: z.string().nullable().optional(),
    street2: z.string().nullable().optional(),
    city: z.string().nullable().optional(),
    state: z.string().nullable().optional(),
    zipcode: z.string().nullable().optional(),
    logoUrl: z.string().nullable().optional(),
    primaryColor: z.string().nullable().optional(),
    secondaryColor: z.string().nullable().optional(),
    rutNumber: z.string().nullable().optional(),
    replyToEmail: z.string().email().nullable().or(z.literal('')).optional(),
    quoteExpirationDays: z.number().int().min(1).optional(),
    invoiceDueDays: z.number().int().min(1).optional(),
    arrivalWindowHours: z.number().int().min(1).max(4).nullable().optional(),
    bankName: z.string().nullable().optional(),
    accountType: z.string().nullable().optional(),
    accountNumber: z.string().nullable().optional(),
    paymentEmail: z.string().email().nullable().or(z.literal('')).optional(),
    onlinePaymentLink: z.string().url().nullable().or(z.literal('')).optional(),
    quoteTermsConditions: z.string().nullable().optional(),
    invoiceTermsConditions: z.string().nullable().optional(),
    whatsappSender: z.string().nullable().optional(),
    defaultTaxRate: z.number().min(0).max(100).nullable().optional(),
    taxIdRut: z.string().nullable().optional(),
    sendTeamPhotosWithConfirmation: z.boolean().optional(),
  })
  .openapi({ description: 'Update any subset of profile and company settings' })

export const SETTINGS_ROUTES = {
  get: createRoute({
    method: 'get',
    tags: ['Settings'],
    path: '/',
    summary: 'Get current business settings (profile + company + settings)',
    responses: {
      [HttpStatusCodes.OK]: jsonContent(
        zodResponseSchema(CurrentSettingsResponseSchema),
        'OK'
      ),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Business not found'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  update: createRoute({
    method: 'patch',
    tags: ['Settings'],
    path: '/',
    summary: 'Update current business profile and/or company settings',
    request: { body: jsonContentRequired(UpdateSettingsBodySchema, 'Update payload') },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(
        zodResponseSchema(CurrentSettingsResponseSchema),
        'OK'
      ),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Business not found'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),
}

export type SettingsRoutes = typeof SETTINGS_ROUTES
