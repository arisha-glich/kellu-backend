/**
 * Company Settings (Profile & Company Settings §13.1).
 * GET/PATCH current business profile + BusinessSettings for Reply list, Due dates,
 * Company details, Bank details, Terms, Arrival window, WhatsApp, Tax.
 */

import { Prisma } from '~/generated/prisma'
import prisma from '~/lib/prisma'
import { BusinessNotFoundError } from '~/services/business.service'

export const DEFAULT_QUOTE_TERMS_CONDITIONS = `This quote is valid for 7 days from the issue date. Work will begin once the quote is approved. Any additional work requested outside the quoted scope may be billed separately.`

export const DEFAULT_INVOICE_TERMS_CONDITIONS = `Payment is due within 3 days of invoice date unless otherwise agreed in writing. Late payments may be subject to service delays. Please include the invoice number with your payment for faster processing.`

export interface CurrentSettingsResult {
  /** Personal profile (owner user) */
  personalProfile: {
    fullName: string | null
    email: string
  }
  /** Company profile (Business) – used on quotes, invoices, communications */
  company: {
    id: string
    name: string
    legalName: string | null
    email: string
    phone: string | null
    webpage: string | null
    address: string | null
    street1: string | null
    street2: string | null
    city: string | null
    state: string | null
    zipcode: string | null
    logoUrl: string | null
    primaryColor: string | null
    secondaryColor: string | null
    rutNumber: string | null
  }
  /** Company settings (Reply list, Due dates, Bank, Terms, Arrival, WhatsApp, Tax) */
  settings: {
    replyToEmail: string | null
    quoteExpirationDays: number
    invoiceDueDays: number
    arrivalWindowHours: number | null
    arrivalWindowMinutes: number | null
    defaultDurationMinutes: number | null
    bankName: string | null
    accountType: string | null
    accountNumber: string | null
    paymentEmail: string | null
    onlinePaymentLink: string | null
    quoteTermsConditions: string | null
    invoiceTermsConditions: string | null
    whatsappSender: string | null
    defaultTaxRate: number | null
    taxIdRut: string | null
    sendTeamPhotosWithConfirmation: boolean
    timeZone: string | null
  }
}

export interface UpdateSettingsInput {
  // Personal profile (owner)
  fullName?: string
  email?: string
  // Company (Business)
  name?: string
  legalName?: string | null
  companyEmail?: string
  phone?: string | null
  webpage?: string | null
  address?: string | null
  street1?: string | null
  street2?: string | null
  city?: string | null
  state?: string | null
  zipcode?: string | null
  logoUrl?: string | null
  primaryColor?: string | null
  secondaryColor?: string | null
  rutNumber?: string | null
  // Settings (Reply list, Due dates, Bank, Terms, Arrival, WhatsApp, Tax)
  replyToEmail?: string | null
  quoteExpirationDays?: number
  invoiceDueDays?: number
  arrivalWindowHours?: number | null
  bankName?: string | null
  accountType?: string | null
  accountNumber?: string | null
  paymentEmail?: string | null
  onlinePaymentLink?: string | null
  quoteTermsConditions?: string | null
  invoiceTermsConditions?: string | null
  whatsappSender?: string | null
  defaultTaxRate?: number | null
  taxIdRut?: string | null
  sendTeamPhotosWithConfirmation?: boolean
  timeZone?: string | null
}

export interface ScheduleColorAssignee {
  memberId: string
  name: string
  email: string
  color: string | null
}

export interface ScheduleColorUpdateInput {
  memberId: string
  color: string | null
}

async function ensureBusinessExists(businessId: string): Promise<void> {
  const b = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true },
  })
  if (!b) {
    throw new BusinessNotFoundError()
  }
}

/** Get current business settings (profile + company + settings) for the logged-in user's business. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: response mapping object intentionally explicit for API contract clarity
export async function getCurrentBusinessSettings(
  businessId: string
): Promise<CurrentSettingsResult> {
  await ensureBusinessExists(businessId)

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    include: {
      owner: { select: { name: true, email: true } },
      settings: true,
    },
  })

  if (!business) {
    throw new BusinessNotFoundError()
  }

  const settings = business.settings

  return {
    personalProfile: {
      fullName: business.owner?.name ?? null,
      email: business.owner?.email ?? business.email,
    },
    company: {
      id: business.id,
      name: business.name,
      legalName: business.legalName,
      email: business.email,
      phone: business.phone,
      webpage: business.webpage,
      address: business.address,
      street1: business.street1,
      street2: business.street2,
      city: business.city,
      state: business.state,
      zipcode: business.zipcode,
      logoUrl: business.logoUrl,
      primaryColor: business.primaryColor,
      secondaryColor: business.secondaryColor,
      rutNumber: business.rutNumber,
    },
    settings: {
      replyToEmail: settings?.replyToEmail?.trim() || business.email || null,
      quoteExpirationDays: settings?.quoteExpirationDays ?? 7,
      invoiceDueDays: settings?.invoiceDueDays ?? 3,
      arrivalWindowHours: settings?.arrivalWindowHours ?? null,
      arrivalWindowMinutes: settings?.arrivalWindowMinutes ?? null,
      defaultDurationMinutes: settings?.defaultDurationMinutes ?? null,
      bankName: settings?.bankName ?? null,
      accountType: settings?.accountType ?? null,
      accountNumber: settings?.accountNumber ?? null,
      paymentEmail: settings?.paymentEmail ?? null,
      onlinePaymentLink: settings?.onlinePaymentLink ?? null,
      quoteTermsConditions:
        settings?.quoteTermsConditions?.trim() || DEFAULT_QUOTE_TERMS_CONDITIONS,
      invoiceTermsConditions:
        settings?.invoiceTermsConditions?.trim() || DEFAULT_INVOICE_TERMS_CONDITIONS,
      whatsappSender: settings?.whatsappSender ?? null,
      defaultTaxRate: settings?.defaultTaxRate != null ? Number(settings.defaultTaxRate) : null,
      taxIdRut: settings?.rutNumber ?? null,
      sendTeamPhotosWithConfirmation: settings?.sendTeamPhotosWithConfirmation ?? false,
      timeZone: business.timeZone ?? null,
    },
  }
}

/** Update current business profile and/or settings. Creates BusinessSettings if missing. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: many optional independent patch fields for business/settings payload
export async function updateCurrentBusinessSettings(
  businessId: string,
  input: UpdateSettingsInput
): Promise<CurrentSettingsResult> {
  await ensureBusinessExists(businessId)

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    include: { owner: true, settings: true },
  })
  if (!business) {
    throw new BusinessNotFoundError()
  }

  // Owner (personal profile)
  if ((input.fullName !== undefined || input.email !== undefined) && business.ownerId) {
    const ownerData: Prisma.UserUpdateInput = {}
    if (input.fullName !== undefined) {
      ownerData.name = input.fullName
    }
    if (input.email !== undefined) {
      ownerData.email = input.email
    }
    if (Object.keys(ownerData).length > 0) {
      await prisma.user.update({
        where: { id: business.ownerId },
        data: ownerData,
      })
    }
  }

  // Business (company profile)
  const businessData: Prisma.BusinessUpdateInput = {
    ...(input.name !== undefined && { name: input.name }),
    ...(input.legalName !== undefined && { legalName: input.legalName }),
    ...(input.companyEmail !== undefined && { email: input.companyEmail }),
    ...(input.timeZone !== undefined && input.timeZone !== null && { timeZone: input.timeZone }),
    ...(input.phone !== undefined && { phone: input.phone }),
    ...(input.webpage !== undefined && { webpage: input.webpage }),
    ...(input.address !== undefined && { address: input.address }),
    ...(input.street1 !== undefined && { street1: input.street1 }),
    ...(input.street2 !== undefined && { street2: input.street2 }),
    ...(input.city !== undefined && { city: input.city }),
    ...(input.state !== undefined && { state: input.state }),
    ...(input.zipcode !== undefined && { zipcode: input.zipcode }),
    ...(input.logoUrl !== undefined && { logoUrl: input.logoUrl }),
    ...(input.primaryColor !== undefined && { primaryColor: input.primaryColor }),
    ...(input.secondaryColor !== undefined && { secondaryColor: input.secondaryColor }),
    ...(input.rutNumber !== undefined && { rutNumber: input.rutNumber }),
  }
  if (Object.keys(businessData).length > 0) {
    await prisma.business.update({
      where: { id: businessId },
      data: businessData,
    })
  }

  // BusinessSettings (reply list, due dates, bank, terms, arrival, whatsapp, tax)
  const settingsInput = {
    ...(input.replyToEmail !== undefined && { replyToEmail: input.replyToEmail }),
    ...(input.quoteExpirationDays !== undefined && {
      quoteExpirationDays: input.quoteExpirationDays,
    }),
    ...(input.invoiceDueDays !== undefined && { invoiceDueDays: input.invoiceDueDays }),
    ...(input.arrivalWindowHours !== undefined && {
      arrivalWindowHours:
        input.arrivalWindowHours != null
          ? Math.min(4, Math.max(1, input.arrivalWindowHours))
          : null,
    }),
    ...(input.bankName !== undefined && { bankName: input.bankName }),
    ...(input.accountType !== undefined && { accountType: input.accountType }),
    ...(input.accountNumber !== undefined && { accountNumber: input.accountNumber }),
    ...(input.paymentEmail !== undefined && { paymentEmail: input.paymentEmail }),
    ...(input.onlinePaymentLink !== undefined && { onlinePaymentLink: input.onlinePaymentLink }),
    ...(input.quoteTermsConditions !== undefined && {
      quoteTermsConditions: input.quoteTermsConditions,
    }),
    ...(input.invoiceTermsConditions !== undefined && {
      invoiceTermsConditions: input.invoiceTermsConditions,
    }),
    ...(input.whatsappSender !== undefined && { whatsappSender: input.whatsappSender }),
    ...(input.defaultTaxRate !== undefined && {
      defaultTaxRate:
        input.defaultTaxRate != null ? new Prisma.Decimal(input.defaultTaxRate) : null,
    }),
    ...(input.taxIdRut !== undefined && { rutNumber: input.taxIdRut }),
    ...(input.sendTeamPhotosWithConfirmation !== undefined && {
      sendTeamPhotosWithConfirmation: input.sendTeamPhotosWithConfirmation,
    }),
  }

  if (Object.keys(settingsInput).length > 0) {
    await prisma.businessSettings.upsert({
      where: { businessId },
      create: {
        businessId,
        ...settingsInput,
      },
      update: settingsInput,
    })
  }

  // Keep work orders aligned with latest business-level quote/invoice terms when settings change.
  if (input.quoteTermsConditions !== undefined || input.invoiceTermsConditions !== undefined) {
    await prisma.workOrder.updateMany({
      where: { businessId },
      data: {
        ...(input.quoteTermsConditions !== undefined && {
          quoteTermsConditions: input.quoteTermsConditions,
        }),
        ...(input.invoiceTermsConditions !== undefined && {
          invoiceTermsConditions: input.invoiceTermsConditions,
        }),
      },
    })
  }

  const result = await getCurrentBusinessSettings(businessId)
  return result
}

/** Schedule settings: list active team members and their calendar colors. */
export async function listScheduleColors(businessId: string): Promise<ScheduleColorAssignee[]> {
  await ensureBusinessExists(businessId)

  const members = await prisma.member.findMany({
    where: { businessId, isActive: true },
    include: {
      user: {
        select: {
          name: true,
          email: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  return members.map(m => ({
    memberId: m.id,
    name: m.user.name ?? 'Unknown',
    email: m.user.email,
    color: m.calendarColor ?? null,
  }))
}

/** Schedule settings: assign/update one team member calendar color. */
export async function updateScheduleColor(
  businessId: string,
  input: ScheduleColorUpdateInput
): Promise<ScheduleColorAssignee> {
  await ensureBusinessExists(businessId)

  const member = await prisma.member.findFirst({
    where: { id: input.memberId, businessId, isActive: true },
    include: {
      user: {
        select: {
          name: true,
          email: true,
        },
      },
    },
  })
  if (!member) {
    throw new Error('MEMBER_NOT_FOUND')
  }

  const updated = await prisma.member.update({
    where: { id: input.memberId },
    data: { calendarColor: input.color },
    include: {
      user: {
        select: {
          name: true,
          email: true,
        },
      },
    },
  })

  return {
    memberId: updated.id,
    name: updated.user.name ?? 'Unknown',
    email: updated.user.email,
    color: updated.calendarColor ?? null,
  }
}
