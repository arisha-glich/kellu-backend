/**
 * Settings API handlers – current business profile + company settings (§13.1).
 */

import * as HttpStatusCodes from 'stoker/http-status-codes'
import type { SETTINGS_ROUTES } from '~/routes/settings/settings.routes'
import { getBusinessIdByUserId, BusinessNotFoundError } from '~/services/business.service'
import { hasPermission } from '~/services/permission.service'
import {
  getCurrentBusinessSettings,
  updateCurrentBusinessSettings,
} from '~/services/settings.service'
import type { HandlerMapFromRoutes } from '~/types'

export const SETTINGS_HANDLER: HandlerMapFromRoutes<typeof SETTINGS_ROUTES> = {
  get: async (c) => {
    const user = c.get('user')
    if (!user) return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId)
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      if (!(await hasPermission(user.id, businessId, 'settings', 'read')))
        return c.json({ message: 'Forbidden' }, HttpStatusCodes.FORBIDDEN)

      const data = await getCurrentBusinessSettings(businessId)
      return c.json(
        { message: 'Settings retrieved successfully', success: true, data },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof BusinessNotFoundError)
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      console.error('Error fetching settings:', error)
      return c.json({ message: 'Failed to retrieve settings' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
    }
  },

  update: async (c) => {
    const user = c.get('user')
    if (!user) return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId)
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      if (!(await hasPermission(user.id, businessId, 'settings', 'update')))
        return c.json({ message: 'Forbidden' }, HttpStatusCodes.FORBIDDEN)

      const body = c.req.valid('json')
      const data = await updateCurrentBusinessSettings(businessId, {
        ...(body.fullName !== undefined && { fullName: body.fullName }),
        ...(body.email !== undefined && { email: body.email }),
        ...(body.name !== undefined && { name: body.name }),
        ...(body.legalName !== undefined && { legalName: body.legalName }),
        ...(body.companyEmail !== undefined && { companyEmail: body.companyEmail }),
        ...(body.phone !== undefined && { phone: body.phone }),
        ...(body.webpage !== undefined && { webpage: body.webpage || null }),
        ...(body.address !== undefined && { address: body.address }),
        ...(body.street1 !== undefined && { street1: body.street1 }),
        ...(body.street2 !== undefined && { street2: body.street2 }),
        ...(body.city !== undefined && { city: body.city }),
        ...(body.state !== undefined && { state: body.state }),
        ...(body.zipcode !== undefined && { zipcode: body.zipcode }),
        ...(body.logoUrl !== undefined && { logoUrl: body.logoUrl }),
        ...(body.primaryColor !== undefined && { primaryColor: body.primaryColor }),
        ...(body.secondaryColor !== undefined && { secondaryColor: body.secondaryColor }),
        ...(body.rutNumber !== undefined && { rutNumber: body.rutNumber }),
        ...(body.replyToEmail !== undefined && { replyToEmail: body.replyToEmail || null }),
        ...(body.quoteExpirationDays !== undefined && {
          quoteExpirationDays: body.quoteExpirationDays,
        }),
        ...(body.invoiceDueDays !== undefined && { invoiceDueDays: body.invoiceDueDays }),
        ...(body.arrivalWindowHours !== undefined && {
          arrivalWindowHours: body.arrivalWindowHours,
        }),
        ...(body.bankName !== undefined && { bankName: body.bankName }),
        ...(body.accountType !== undefined && { accountType: body.accountType }),
        ...(body.accountNumber !== undefined && { accountNumber: body.accountNumber }),
        ...(body.paymentEmail !== undefined && { paymentEmail: body.paymentEmail || null }),
        ...(body.onlinePaymentLink !== undefined && {
          onlinePaymentLink: body.onlinePaymentLink || null,
        }),
        ...(body.quoteTermsConditions !== undefined && {
          quoteTermsConditions: body.quoteTermsConditions,
        }),
        ...(body.invoiceTermsConditions !== undefined && {
          invoiceTermsConditions: body.invoiceTermsConditions,
        }),
        ...(body.whatsappSender !== undefined && { whatsappSender: body.whatsappSender }),
        ...(body.defaultTaxRate !== undefined && { defaultTaxRate: body.defaultTaxRate }),
        ...(body.taxIdRut !== undefined && { taxIdRut: body.taxIdRut }),
        ...(body.sendTeamPhotosWithConfirmation !== undefined && {
          sendTeamPhotosWithConfirmation: body.sendTeamPhotosWithConfirmation,
        }),
      })
      return c.json(
        { message: 'Settings updated successfully', success: true, data },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof BusinessNotFoundError)
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      console.error('Error updating settings:', error)
      return c.json({ message: 'Failed to update settings' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
    }
  },
}
