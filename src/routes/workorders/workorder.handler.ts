/**
 * Workorder API handlers – business resolved from authenticated user.
 */

import * as HttpStatusCodes from 'stoker/http-status-codes'
import type { WORK_ORDER_ROUTES } from '~/routes/workorders/workorder.routes'
import { createAuditLog } from '~/services/audit-log.service'
import { BusinessNotFoundError, getBusinessIdByUserId } from '~/services/business.service'
import { createExpenseForWorkOrder, listExpensesByWorkOrder } from '~/services/expense.service'
import { createUserNotification, sendUserOperationEmail } from '~/services/notifications.service'
import { hasPermission } from '~/services/permission.service'
import { listPriceListItems } from '~/services/price-list.service'
import {
  DEFAULT_INVOICE_TERMS_CONDITIONS,
  DEFAULT_QUOTE_TERMS_CONDITIONS,
  updateCurrentBusinessSettings,
} from '~/services/settings.service'
import {
  addLineItemsToWorkOrder,
  addLineItemToPriceList,
  addWorkOrderAttachments,
  ClientNotFoundError,
  createWorkOrder,
  createWorkOrderCustomerReminder,
  deleteWorkOrder,
  deleteWorkOrderAttachment,
  deleteWorkOrderPayment,
  getJobFollowUpEmailComposeData,
  getWorkOrderById,
  getWorkOrderOverview,
  getWorkOrderPayment,
  LineItemNotFoundError,
  listWorkOrderAttachments,
  listWorkOrderCustomerReminders,
  listWorkOrderPayments,
  listWorkOrders,
  PaymentNotFoundError,
  registerPayment,
  sendBookingConfirmation,
  sendJobFollowUpEmail,
  updateWorkOrder,
  updateWorkOrderPayment,
  WorkOrderAssigneeNotFoundError,
  WorkOrderNotFoundError,
} from '~/services/workorder.service'
import type { HandlerMapFromRoutes } from '~/types'

function resolveWorkOrderAssigneeIds(body: {
  assignedToIds?: string[] | null
}): string[] | undefined {
  if (Array.isArray(body.assignedToIds)) {
    const deduped = Array.from(new Set(body.assignedToIds.map(id => id.trim()).filter(Boolean)))
    return deduped.length > 0 ? deduped : undefined
  }
  return undefined
}

function resolvePrimaryAssigneeId(body: {
  assignedToIds?: string[] | null
}): string | null | undefined {
  if (!Array.isArray(body.assignedToIds)) {
    return undefined
  }
  const ids = Array.from(new Set(body.assignedToIds.map(id => id.trim()).filter(Boolean)))
  return ids[0] ?? null
}

function getClientMeta(c: { req: { header: (k: string) => string | undefined } }) {
  const forwarded = c.req.header('x-forwarded-for')
  const ipAddress = forwarded?.split(',')[0]?.trim() || null
  const userAgent = c.req.header('user-agent') ?? null
  return { ipAddress, userAgent }
}

export const WORK_ORDER_HANDLER: HandlerMapFromRoutes<typeof WORK_ORDER_ROUTES> = {
  list: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'workorders', 'read'))) {
        return c.json(
          { message: 'You do not have permission to list work orders' },
          HttpStatusCodes.FORBIDDEN
        )
      }
      const query = c.req.valid('query')
      const page = query.page ? Number.parseInt(query.page, 10) : 1
      const limit = query.limit ? Number.parseInt(query.limit, 10) : 10
      const result = await listWorkOrders(businessId, {
        search: query.search,
        jobStatus: query.jobStatus,
        invoiceStatus: query.invoiceStatus,
        sortBy: query.sortBy,
        order: query.order,
        page,
        limit,
      })
      return c.json(
        { message: 'Work orders retrieved successfully', success: true, data: result },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error listing work orders:', error)
      return c.json(
        { message: 'Failed to retrieve work orders' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  overview: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'workorders', 'read'))) {
        return c.json(
          { message: 'You do not have permission to view work order overview' },
          HttpStatusCodes.FORBIDDEN
        )
      }
      const overview = await getWorkOrderOverview(businessId)
      return c.json(
        { message: 'Overview retrieved successfully', success: true, data: overview },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error fetching work order overview:', error)
      return c.json(
        { message: 'Failed to retrieve overview' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  getPriceListItems: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'workorders', 'read'))) {
        return c.json(
          { message: 'You do not have permission to view price list items for work orders' },
          HttpStatusCodes.FORBIDDEN
        )
      }
      const query = c.req.valid('query')
      const page = query.page ? Number.parseInt(query.page, 10) : 1
      const limit = query.limit ? Number.parseInt(query.limit, 10) : 50
      const result = await listPriceListItems(businessId, {
        search: query.search,
        itemType: query.itemType,
        sortBy: query.sortBy,
        order: query.order,
        page,
        limit,
      })
      return c.json(
        { message: 'Price list items retrieved successfully', success: true, data: result },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error fetching price list items:', error)
      return c.json(
        { message: 'Failed to retrieve price list items' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  getById: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'workorders', 'read'))) {
        return c.json(
          { message: 'You do not have permission to view this work order' },
          HttpStatusCodes.FORBIDDEN
        )
      }
      const { workOrderId } = c.req.valid('param')
      const workOrder = await getWorkOrderById(businessId, workOrderId)
      return c.json(
        { message: 'Work order retrieved successfully', success: true, data: workOrder },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof WorkOrderNotFoundError) {
        return c.json({ message: 'Work order not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof ClientNotFoundError) {
        return c.json({ message: 'Client not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error fetching work order:', error)
      return c.json(
        { message: 'Failed to retrieve work order' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  create: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'workorders', 'create'))) {
        return c.json(
          { message: 'You do not have permission to create work orders' },
          HttpStatusCodes.FORBIDDEN
        )
      }
      const body = await c.req.valid('json')
      const workOrder = await createWorkOrder(businessId, {
        title: body.title,
        clientId: body.clientId,
        address: body.address,
        isScheduleLater: body.isScheduleLater,
        isAnyTime: body.isAnyTime,
        scheduledAt: body.scheduledAt,
        startTime: body.startTime,
        endTime: body.endTime,
        assignedToId: resolvePrimaryAssigneeId({ assignedToIds: body.assignedToIds }) ?? null,
        assignedToIds: resolveWorkOrderAssigneeIds({
          assignedToIds: body.assignedToIds,
        }),
        instructions: body.instructions,
        notes: body.internalNotes ?? body.notes,
        quoteRequired: body.quoteRequired,
        invoiceRequired: body.invoiceRequired,
        quoteClientMessage: body.quoteClientMessage,
        quoteTermsConditions: body.quoteTermsConditions,
        invoiceClientMessage: body.invoiceClientMessage,
        invoiceTermsConditions: body.invoiceTermsConditions,
        discount: body.discount,
        discountType: body.discountType,
        taxPercent: body.taxPercent,
        lineItems: body.lineItems,
      })
      if (body.applyQuoteTermsToFuture) {
        await updateCurrentBusinessSettings(businessId, {
          quoteTermsConditions: body.quoteTermsConditions ?? DEFAULT_QUOTE_TERMS_CONDITIONS,
        })
      }
      if (body.applyInvoiceTermsToFuture) {
        await updateCurrentBusinessSettings(businessId, {
          invoiceTermsConditions: body.invoiceTermsConditions ?? DEFAULT_INVOICE_TERMS_CONDITIONS,
        })
      }
      const { ipAddress, userAgent } = getClientMeta(c)
      await createAuditLog({
        action: 'WORKORDER_CREATED',
        module: 'workorder',
        entityId: workOrder.id,
        newValues: {
          id: workOrder.id,
          title: workOrder.title,
          workOrderNumber: workOrder.workOrderNumber,
          jobStatus: workOrder.jobStatus,
        },
        userId: user.id,
        businessId,
        ipAddress,
        userAgent,
      })
      try {
        await createUserNotification({
          userId: user.id,
          type: 'WORKORDER_CREATED',
          title: `You created a work order - ${workOrder.title}`,
          message: `${workOrder.workOrderNumber ?? 'Work order'} - ${workOrder.client?.name ?? ''}`,
          metadata: {
            workOrderId: workOrder.id,
            workOrderNumber: workOrder.workOrderNumber,
            clientName: workOrder.client?.name ?? null,
          },
        })
        await sendUserOperationEmail({
          to: user.email,
          userName: user.name,
          actionTitle: 'Work order created successfully',
          actionMessage: `Your work order "${workOrder.title}" was created successfully.`,
        })
      } catch (notifyError) {
        console.error('Work order notification/email failed:', notifyError)
      }
      return c.json(
        { message: 'Work order created successfully', success: true, data: workOrder },
        HttpStatusCodes.CREATED
      )
    } catch (error) {
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof ClientNotFoundError) {
        return c.json({ message: 'Client not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof WorkOrderAssigneeNotFoundError) {
        return c.json(
          { message: 'One or more assigned team members were not found in this business' },
          HttpStatusCodes.NOT_FOUND
        )
      }
      console.error('Error creating work order:', error)
      return c.json(
        { message: 'Failed to create work order' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  update: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'workorders', 'update'))) {
        return c.json(
          { message: 'You do not have permission to update work orders' },
          HttpStatusCodes.FORBIDDEN
        )
      }
      const { workOrderId } = c.req.valid('param')
      const body = await c.req.valid('json')
      const workOrder = await updateWorkOrder(businessId, workOrderId, {
        title: body.title,
        clientId: body.clientId,
        address: body.address,
        isScheduleLater: body.isScheduleLater,
        isAnyTime: body.isAnyTime,
        scheduledAt: body.scheduledAt,
        startTime: body.startTime,
        endTime: body.endTime,
        assignedToIds: body.assignedToIds,
        instructions: body.instructions,
        notes: body.internalNotes ?? body.notes,
        invoiceClientMessage: body.invoiceClientMessage,
        invoiceTermsConditions: body.invoiceTermsConditions,
        applyInvoiceTermsToFuture: body.applyInvoiceTermsToFuture,
        quoteClientMessage: body.quoteClientMessage,
        quoteTermsConditions: body.quoteTermsConditions,
        applyQuoteTermsToFuture: body.applyQuoteTermsToFuture,
        discount: body.discount,
        discountType: body.discountType,
        taxPercent: body.taxPercent,
        lineItems: body.lineItems,
        expenses: body.expenses,
        payments: body.payments,
      })
      if (body.applyInvoiceTermsToFuture) {
        await updateCurrentBusinessSettings(businessId, {
          invoiceTermsConditions: body.invoiceTermsConditions ?? DEFAULT_INVOICE_TERMS_CONDITIONS,
        })
      }
      if (body.applyQuoteTermsToFuture) {
        await updateCurrentBusinessSettings(businessId, {
          quoteTermsConditions: body.quoteTermsConditions ?? DEFAULT_QUOTE_TERMS_CONDITIONS,
        })
      }
      const { ipAddress, userAgent } = getClientMeta(c)
      await createAuditLog({
        action: 'WORKORDER_UPDATED',
        module: 'workorder',
        entityId: workOrderId,
        newValues: {
          id: workOrder.id,
          title: workOrder.title,
          workOrderNumber: workOrder.workOrderNumber,
          jobStatus: workOrder.jobStatus,
        },
        userId: user.id,
        businessId,
        ipAddress,
        userAgent,
      })
      try {
        await createUserNotification({
          userId: user.id,
          type: 'WORKORDER_UPDATED',
          title: `You updated a work order - ${workOrder.title}`,
          message: `${workOrder.workOrderNumber ?? 'Work order'} - ${workOrder.client?.name ?? ''}`,
          metadata: {
            workOrderId: workOrder.id,
            workOrderNumber: workOrder.workOrderNumber,
            clientName: workOrder.client?.name ?? null,
          },
        })
      } catch (notifyError) {
        console.error('Work order update notification failed:', notifyError)
      }
      return c.json(
        { message: 'Work order updated successfully', success: true, data: workOrder },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof WorkOrderNotFoundError) {
        return c.json({ message: 'Work order not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof WorkOrderAssigneeNotFoundError) {
        return c.json(
          { message: 'One or more assigned team members were not found in this business' },
          HttpStatusCodes.NOT_FOUND
        )
      }
      console.error('Error updating work order:', error)
      return c.json(
        { message: 'Failed to update work order' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  delete: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'workorders', 'delete'))) {
        return c.json(
          { message: 'You do not have permission to delete work orders' },
          HttpStatusCodes.FORBIDDEN
        )
      }
      const { workOrderId } = c.req.valid('param')
      let deletedWorkOrderTitle = 'Work order'
      let deletedWorkOrderNumber: string | null = null
      let deletedClientName: string | null = null
      try {
        const toDelete = await getWorkOrderById(businessId, workOrderId)
        deletedWorkOrderTitle = toDelete.title
        deletedWorkOrderNumber = toDelete.workOrderNumber
        deletedClientName = toDelete.client?.name ?? null
      } catch {
        // Ignore metadata fetch failure and continue delete flow.
      }
      await deleteWorkOrder(businessId, workOrderId)
      const { ipAddress, userAgent } = getClientMeta(c)
      await createAuditLog({
        action: 'WORKORDER_DELETED',
        module: 'workorder',
        entityId: workOrderId,
        userId: user.id,
        businessId,
        ipAddress,
        userAgent,
      })
      try {
        await createUserNotification({
          userId: user.id,
          type: 'WORKORDER_DELETED',
          title: `You deleted a work order - ${deletedWorkOrderTitle}`,
          message: `${deletedWorkOrderNumber ?? 'Work order'} - ${deletedClientName ?? ''}`,
          metadata: {
            workOrderId,
            workOrderNumber: deletedWorkOrderNumber,
            clientName: deletedClientName,
          },
        })
      } catch (notifyError) {
        console.error('Work order delete notification failed:', notifyError)
      }
      return c.json(
        { message: 'Work order deleted successfully', success: true, data: { deleted: true } },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof WorkOrderNotFoundError) {
        return c.json({ message: 'Work order not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error deleting work order:', error)
      return c.json(
        { message: 'Failed to delete work order' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  registerPayment: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'workorders', 'update'))) {
        return c.json(
          { message: 'You do not have permission to register payments on work orders' },
          HttpStatusCodes.FORBIDDEN
        )
      }
      const { workOrderId } = c.req.valid('param')
      const body = await c.req.valid('json')
      const workOrder = await registerPayment(businessId, workOrderId, {
        amount: body.amount,
        paymentDate: body.paymentDate ?? new Date(),
        paymentMethod: body.paymentMethod,
        referenceNumber: body.referenceNumber,
        note: body.note,
      })
      return c.json(
        { message: 'Payment registered successfully', success: true, data: workOrder },
        HttpStatusCodes.CREATED
      )
    } catch (error) {
      if (error instanceof WorkOrderNotFoundError) {
        return c.json({ message: 'Work order not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error registering payment:', error)
      return c.json(
        { message: 'Failed to register payment' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  listPayments: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'workorders', 'read'))) {
        return c.json(
          { message: 'You do not have permission to view payments on work orders' },
          HttpStatusCodes.FORBIDDEN
        )
      }
      const { workOrderId } = c.req.valid('param')
      const payments = await listWorkOrderPayments(businessId, workOrderId)
      return c.json(
        { message: 'Payments retrieved successfully', success: true, data: payments },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof WorkOrderNotFoundError) {
        return c.json({ message: 'Work order not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error listing payments:', error)
      return c.json(
        { message: 'Failed to retrieve payments' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  getPayment: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'workorders', 'read'))) {
        return c.json(
          { message: 'You do not have permission to view payment on work orders' },
          HttpStatusCodes.FORBIDDEN
        )
      }
      const { workOrderId, paymentId } = c.req.valid('param')
      const payment = await getWorkOrderPayment(businessId, workOrderId, paymentId)
      return c.json(
        { message: 'Payment retrieved successfully', success: true, data: payment },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof WorkOrderNotFoundError || error instanceof PaymentNotFoundError) {
        return c.json({ message: 'Work order or payment not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error getting payment:', error)
      return c.json(
        { message: 'Failed to retrieve payment' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  updatePayment: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'workorders', 'update'))) {
        return c.json(
          { message: 'You do not have permission to update payments on work orders' },
          HttpStatusCodes.FORBIDDEN
        )
      }
      const { workOrderId, paymentId } = c.req.valid('param')
      const body = await c.req.valid('json')
      const workOrder = await updateWorkOrderPayment(businessId, workOrderId, paymentId, {
        ...(body.amount !== undefined && { amount: body.amount }),
        ...(body.paymentDate !== undefined && { paymentDate: body.paymentDate ?? null }),
        ...(body.paymentMethod !== undefined && { paymentMethod: body.paymentMethod }),
        ...(body.referenceNumber !== undefined && {
          referenceNumber: body.referenceNumber ?? null,
        }),
        ...(body.note !== undefined && { note: body.note ?? null }),
      })
      return c.json(
        { message: 'Payment updated successfully', success: true, data: workOrder },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof WorkOrderNotFoundError || error instanceof PaymentNotFoundError) {
        return c.json({ message: 'Work order or payment not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error updating payment:', error)
      return c.json({ message: 'Failed to update payment' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
    }
  },

  deletePayment: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'workorders', 'update'))) {
        return c.json(
          { message: 'You do not have permission to delete payments on work orders' },
          HttpStatusCodes.FORBIDDEN
        )
      }
      const { workOrderId, paymentId } = c.req.valid('param')
      const workOrder = await deleteWorkOrderPayment(businessId, workOrderId, paymentId)
      return c.json(
        { message: 'Payment deleted successfully', success: true, data: workOrder },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof WorkOrderNotFoundError || error instanceof PaymentNotFoundError) {
        return c.json({ message: 'Work order or payment not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error deleting payment:', error)
      return c.json({ message: 'Failed to delete payment' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
    }
  },

  sendBookingConfirmation: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'workorders', 'update'))) {
        return c.json(
          { message: 'You do not have permission to send booking confirmation' },
          HttpStatusCodes.FORBIDDEN
        )
      }
      const { workOrderId } = c.req.valid('param')
      let options: { subject?: string } | undefined
      try {
        const body = (await c.req.json()) as { subject?: string } | null
        if (body?.subject) {
          options = { subject: body.subject }
        }
      } catch {
        // No body or invalid JSON – use default subject
      }
      const workOrder = await sendBookingConfirmation(businessId, workOrderId, options)
      return c.json(
        { message: 'Booking confirmation sent successfully', success: true, data: workOrder },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof WorkOrderNotFoundError) {
        return c.json({ message: 'Work order not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof Error && error.message.includes('no email')) {
        return c.json(
          {
            message:
              'Client has no email address. Add an email to the client to send booking confirmation.',
          },
          HttpStatusCodes.BAD_REQUEST
        )
      }
      console.error('Error sending booking confirmation:', error)
      return c.json(
        { message: 'Failed to send booking confirmation' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  addLineItems: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'workorders', 'update'))) {
        return c.json(
          { message: 'You do not have permission to add line items to work orders' },
          HttpStatusCodes.FORBIDDEN
        )
      }
      const { workOrderId } = c.req.valid('param')
      const body = await c.req.valid('json')
      const workOrder = await addLineItemsToWorkOrder(businessId, workOrderId, body.items)
      return c.json(
        { message: 'Line items added successfully', success: true, data: workOrder },
        HttpStatusCodes.CREATED
      )
    } catch (error) {
      if (error instanceof WorkOrderNotFoundError) {
        return c.json({ message: 'Work order not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof Error && error.message === 'PRICE_LIST_ITEM_NOT_FOUND') {
        return c.json({ message: 'Price list item not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error adding line items:', error)
      return c.json({ message: 'Failed to add line items' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
    }
  },

  addLineItemToPriceList: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'workorders', 'update'))) {
        return c.json(
          { message: 'You do not have permission to add line items to the price list' },
          HttpStatusCodes.FORBIDDEN
        )
      }
      const { workOrderId, lineItemId } = c.req.valid('param')
      const body = await c.req.valid('json')
      const result = await addLineItemToPriceList(businessId, workOrderId, lineItemId, {
        linkLineItem: body.linkLineItem,
      })
      return c.json(
        {
          message: 'Line item saved to master price list',
          success: true,
          data: result,
        },
        HttpStatusCodes.CREATED
      )
    } catch (error) {
      if (error instanceof WorkOrderNotFoundError) {
        return c.json({ message: 'Work order not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof LineItemNotFoundError) {
        return c.json({ message: 'Line item not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error adding line item to price list:', error)
      return c.json(
        { message: 'Failed to add line item to price list' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  listExpenses: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'workorders', 'read'))) {
        return c.json(
          { message: 'You do not have permission to list work order expenses' },
          HttpStatusCodes.FORBIDDEN
        )
      }
      const { workOrderId } = c.req.valid('param')
      const expenses = await listExpensesByWorkOrder(businessId, workOrderId)
      return c.json(
        { message: 'Expenses retrieved successfully', success: true, data: { data: expenses } },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof Error && error.message === 'WORK_ORDER_NOT_FOUND') {
        return c.json({ message: 'Work order not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error listing work order expenses:', error)
      return c.json(
        { message: 'Failed to retrieve expenses' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  createExpense: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'workorders', 'update'))) {
        return c.json(
          { message: 'You do not have permission to create expenses on work orders' },
          HttpStatusCodes.FORBIDDEN
        )
      }
      const { workOrderId } = c.req.valid('param')
      const body = await c.req.valid('json')
      const expense = await createExpenseForWorkOrder(businessId, workOrderId, {
        date: body.date,
        itemName: body.itemName,
        details: body.details,
        total: body.total,
        invoiceNumber: body.invoiceNumber,
        attachmentUrl: body.attachmentUrl ? [body.attachmentUrl] : null,
      })
      return c.json(
        { message: 'Expense created successfully', success: true, data: expense },
        HttpStatusCodes.CREATED
      )
    } catch (error) {
      if (error instanceof Error && error.message === 'WORK_ORDER_NOT_FOUND') {
        return c.json({ message: 'Work order not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error creating work order expense:', error)
      return c.json({ message: 'Failed to create expense' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
    }
  },

  listAttachments: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'workorders', 'read'))) {
        return c.json(
          { message: 'You do not have permission to view work order attachments' },
          HttpStatusCodes.FORBIDDEN
        )
      }
      const { workOrderId } = c.req.valid('param')
      const attachments = await listWorkOrderAttachments(businessId, workOrderId)
      return c.json(
        {
          message: 'Attachments retrieved successfully',
          success: true,
          data: { data: attachments },
        },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof WorkOrderNotFoundError) {
        return c.json({ message: 'Work order not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error listing work order attachments:', error)
      return c.json(
        { message: 'Failed to retrieve attachments' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  addAttachments: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'workorders', 'update'))) {
        return c.json(
          { message: 'You do not have permission to add work order attachments' },
          HttpStatusCodes.FORBIDDEN
        )
      }
      const { workOrderId } = c.req.valid('param')
      const body = await c.req.valid('json')
      const attachments = await addWorkOrderAttachments(businessId, workOrderId, body.attachments)
      return c.json(
        { message: 'Attachments added successfully', success: true, data: { data: attachments } },
        HttpStatusCodes.CREATED
      )
    } catch (error) {
      if (error instanceof WorkOrderNotFoundError) {
        return c.json({ message: 'Work order not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof Error && error.message === 'MAX_ATTACHMENTS_EXCEEDED') {
        return c.json(
          { message: 'A work order can have at most 10 attachments' },
          HttpStatusCodes.BAD_REQUEST
        )
      }
      console.error('Error adding work order attachments:', error)
      return c.json({ message: 'Failed to add attachments' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
    }
  },

  deleteAttachment: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'workorders', 'update'))) {
        return c.json(
          { message: 'You do not have permission to delete work order attachments' },
          HttpStatusCodes.FORBIDDEN
        )
      }
      const { workOrderId, attachmentId } = c.req.valid('param')
      await deleteWorkOrderAttachment(businessId, workOrderId, attachmentId)
      return c.json(
        { message: 'Attachment deleted successfully', success: true, data: { deleted: true } },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof WorkOrderNotFoundError) {
        return c.json({ message: 'Work order not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof Error && error.message === 'ATTACHMENT_NOT_FOUND') {
        return c.json({ message: 'Attachment not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error deleting work order attachment:', error)
      return c.json(
        { message: 'Failed to delete attachment' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  listCustomerReminders: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'workorders', 'read'))) {
        return c.json(
          { message: 'You do not have permission to view work order reminders' },
          HttpStatusCodes.FORBIDDEN
        )
      }
      const { workOrderId } = c.req.valid('param')
      const data = await listWorkOrderCustomerReminders(businessId, workOrderId)
      return c.json(
        { message: 'Customer reminders retrieved successfully', success: true, data },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof WorkOrderNotFoundError) {
        return c.json({ message: 'Work order not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error listing customer reminders:', error)
      return c.json(
        { message: 'Failed to retrieve customer reminders' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  createCustomerReminder: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'workorders', 'update'))) {
        return c.json(
          { message: 'You do not have permission to create work order reminders' },
          HttpStatusCodes.FORBIDDEN
        )
      }
      const { workOrderId } = c.req.valid('param')
      const body = await c.req.valid('json')

      const date = new Date(body.date)
      const [hours, minutes] =
        body.time
          .trim()
          .match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i)
          ?.slice(1) ?? []

      if (!hours || !minutes) {
        return c.json({ message: 'Invalid time format' }, HttpStatusCodes.BAD_REQUEST)
      }

      let h = Number.parseInt(hours, 10)
      const m = Number.parseInt(minutes, 10)
      const hasMeridiem = /AM|PM/i.test(body.time)
      if (hasMeridiem) {
        const isPm = /PM/i.test(body.time)
        if (h === 12) {
          h = isPm ? 12 : 0
        } else if (isPm) {
          h += 12
        }
      }
      date.setHours(h, m, 0, 0)

      const data = await createWorkOrderCustomerReminder(businessId, workOrderId, {
        dateTime: date,
        note: body.note ?? null,
      })
      return c.json(
        { message: 'Customer reminder saved successfully', success: true, data },
        HttpStatusCodes.CREATED
      )
    } catch (error) {
      if (error instanceof WorkOrderNotFoundError) {
        return c.json({ message: 'Work order not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error creating customer reminder:', error)
      return c.json(
        { message: 'Failed to create customer reminder' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  getJobFollowUpEmailCompose: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'workorders', 'read'))) {
        return c.json(
          { message: 'You do not have permission to view this work order' },
          HttpStatusCodes.FORBIDDEN
        )
      }
      const { workOrderId } = c.req.valid('param')
      const data = await getJobFollowUpEmailComposeData(businessId, workOrderId)
      return c.json(
        { message: 'Job follow-up email compose data retrieved successfully', success: true, data },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof WorkOrderNotFoundError) {
        return c.json({ message: 'Work order not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error fetching job follow-up email compose data:', error)
      return c.json(
        { message: 'Failed to fetch job follow-up email compose data' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: multipart parsing and attachment handling flow
  sendJobFollowUpEmail: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'workorders', 'update'))) {
        return c.json(
          { message: 'You do not have permission to send emails for this work order' },
          HttpStatusCodes.FORBIDDEN
        )
      }
      const { workOrderId } = c.req.valid('param')
      const parseBoolean = (value: string | undefined) =>
        Boolean(value && ['true', '1', 'yes', 'on'].includes(value.toLowerCase()))
      const parseSelectedAttachmentIds = (raw: string | undefined) => {
        if (!raw) {
          return [] as string[]
        }
        try {
          const parsed = JSON.parse(raw)
          if (Array.isArray(parsed)) {
            return parsed.filter(
              item => typeof item === 'string' && item.trim().length > 0
            ) as string[]
          }
        } catch {
          // Fallback to comma separated input.
        }
        return raw
          .split(',')
          .map(item => item.trim())
          .filter(Boolean)
      }

      const contentType = c.req.header('content-type') ?? ''
      let from: string | undefined
      let replyTo: string | undefined
      let subject: string | undefined
      let message: string | undefined
      let to: string | undefined
      let sendMeCopy = false
      let selectedAttachmentIds: string[] = []
      let additionalAttachments: Array<{
        filename: string
        content: Buffer
        contentType?: string | null
      }> = []

      if (contentType.includes('multipart/form-data')) {
        let formData: FormData
        try {
          formData = await c.req.raw.formData()
        } catch {
          return c.json(
            {
              message:
                'Invalid multipart body. Ensure Content-Type is multipart/form-data with a valid boundary.',
            },
            HttpStatusCodes.BAD_REQUEST
          )
        }

        const getOptionalString = (key: string) => {
          const value = formData.get(key)
          if (typeof value !== 'string') {
            return undefined
          }
          const trimmed = value.trim()
          return trimmed.length > 0 ? trimmed : undefined
        }

        from = getOptionalString('from')
        replyTo = getOptionalString('replyTo')
        subject = getOptionalString('subject')
        message = getOptionalString('message')
        to = getOptionalString('to')
        sendMeCopy = parseBoolean(getOptionalString('sendMeCopy'))
        selectedAttachmentIds = parseSelectedAttachmentIds(
          getOptionalString('selectedAttachmentIds')
        )

        const binaryFiles = [
          ...formData.getAll('additionalAttachments'),
          ...formData.getAll('attachments'),
        ].filter((item): item is File => item instanceof File)

        additionalAttachments = await Promise.all(
          binaryFiles.map(async file => ({
            filename: file.name || 'attachment',
            content: Buffer.from(await file.arrayBuffer()),
            contentType: file.type || null,
          }))
        )
      } else {
        const body = await c.req.json().catch(() => ({}) as Record<string, unknown>)
        const readOptionalString = (value: unknown) =>
          typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined

        from = readOptionalString(body.from)
        replyTo = readOptionalString(body.replyTo)
        subject = readOptionalString(body.subject)
        message = readOptionalString(body.message)
        to = readOptionalString(body.to)
        sendMeCopy = parseBoolean(readOptionalString(body.sendMeCopy))
        selectedAttachmentIds = parseSelectedAttachmentIds(
          readOptionalString(body.selectedAttachmentIds)
        )

        const rawAdditional: unknown[] = Array.isArray(body.additionalAttachments)
          ? body.additionalAttachments
          : []
        const parsedAdditional: Array<{
          filename: string
          content: Buffer
          contentType?: string | null
        }> = []
        for (const item of rawAdditional) {
          if (typeof item !== 'object' || item === null) {
            continue
          }
          const attachment = item as {
            filename?: unknown
            contentBase64?: unknown
            contentType?: unknown
          }
          if (
            typeof attachment.filename !== 'string' ||
            typeof attachment.contentBase64 !== 'string'
          ) {
            continue
          }
          parsedAdditional.push({
            filename: attachment.filename,
            content: Buffer.from(attachment.contentBase64, 'base64'),
            contentType: typeof attachment.contentType === 'string' ? attachment.contentType : null,
          })
        }
        additionalAttachments = parsedAdditional
      }

      const wo = await sendJobFollowUpEmail(businessId, workOrderId, {
        from,
        replyTo,
        subject,
        message,
        to,
        sendMeCopy,
        selectedAttachmentIds,
        additionalAttachments,
        requesterEmail: user.email,
      })
      return c.json(
        { message: 'Job follow-up email sent successfully', success: true, data: wo },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof WorkOrderNotFoundError) {
        return c.json({ message: 'Work order not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof Error && error.message.includes('no email')) {
        return c.json(
          {
            message:
              'Client has no email address. Add an email to the client to send the follow-up.',
          },
          HttpStatusCodes.BAD_REQUEST
        )
      }
      if (error instanceof Error && error.message === 'ATTACHMENTS_TOO_LARGE') {
        return c.json(
          { message: 'Attachments exceed the 10 MB limit' },
          HttpStatusCodes.BAD_REQUEST
        )
      }
      if (error instanceof Error && error.message === 'ATTACHMENT_FETCH_FAILED') {
        return c.json(
          { message: 'Could not download one of the work order attachments' },
          HttpStatusCodes.BAD_REQUEST
        )
      }
      console.error('Error sending job follow-up email:', error)
      return c.json(
        { message: 'Failed to send job follow-up email' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },
}
