/**
 * Workorder API handlers – business resolved from authenticated user.
 */

import * as HttpStatusCodes from 'stoker/http-status-codes'
import type { WORK_ORDER_ROUTES } from '~/routes/workorders/workorder.routes'
import { BusinessNotFoundError, getBusinessIdByUserId } from '~/services/business.service'
import { createExpenseForWorkOrder, listExpensesByWorkOrder } from '~/services/expense.service'
import { createUserNotification, sendUserOperationEmail } from '~/services/notifications.service'
import { hasPermission } from '~/services/permission.service'
import { listPriceListItems } from '~/services/price-list.service'
import { updateCurrentBusinessSettings } from '~/services/settings.service'
import {
  addLineItemsToWorkOrder,
  addLineItemToPriceList,
  addWorkOrderAttachments,
  ClientNotFoundError,
  createWorkOrder,
  createWorkOrderCustomerReminder,
  deleteWorkOrder,
  deleteWorkOrderAttachment,
  getJobFollowUpEmailComposeData,
  getWorkOrderById,
  getWorkOrderOverview,
  LineItemNotFoundError,
  listWorkOrderAttachments,
  listWorkOrderCustomerReminders,
  listWorkOrders,
  registerPayment,
  sendBookingConfirmation,
  sendJobFollowUpEmail,
  updateWorkOrder,
  WorkOrderNotFoundError,
} from '~/services/workorder.service'
import type { HandlerMapFromRoutes } from '~/types'

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
        quoteStatus: query.quoteStatus,
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
        scheduledAt: body.scheduledAt,
        startTime: body.startTime,
        endTime: body.endTime,
        assignedToId: body.assignedToId,
        instructions: body.instructions,
        notes: body.internalNotes ?? body.notes,
        quoteRequired: body.quoteRequired,
        quoteClientMessage: body.quoteClientMessage,
        quoteTermsConditions: body.quoteTermsConditions,
        invoiceClientMessage: body.invoiceClientMessage,
        invoiceTermsConditions: body.invoiceTermsConditions,
        discount: body.discount,
        discountType: body.discountType,
        taxPercent: body.taxPercent,
        lineItems: body.lineItems,
      })
      if (body.applyQuoteTermsToFuture || body.applyInvoiceTermsToFuture) {
        await updateCurrentBusinessSettings(businessId, {
          ...(body.applyQuoteTermsToFuture
            ? { quoteTermsConditions: body.quoteTermsConditions ?? null }
            : {}),
          ...(body.applyInvoiceTermsToFuture
            ? { invoiceTermsConditions: body.invoiceTermsConditions ?? null }
            : {}),
        })
      }
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
        scheduledAt: body.scheduledAt,
        startTime: body.startTime,
        endTime: body.endTime,
        assignedToId: body.assignedToId,
        instructions: body.instructions,
        notes: body.internalNotes ?? body.notes,
        quoteRequired: body.quoteRequired,
        quoteClientMessage: body.quoteClientMessage,
        quoteTermsConditions: body.quoteTermsConditions,
        invoiceClientMessage: body.invoiceClientMessage,
        invoiceTermsConditions: body.invoiceTermsConditions,
        discount: body.discount,
        discountType: body.discountType,
        taxPercent: body.taxPercent,
        lineItems: body.lineItems,
      })
      if (body.applyQuoteTermsToFuture || body.applyInvoiceTermsToFuture) {
        await updateCurrentBusinessSettings(businessId, {
          ...(body.applyQuoteTermsToFuture
            ? { quoteTermsConditions: body.quoteTermsConditions ?? null }
            : {}),
          ...(body.applyInvoiceTermsToFuture
            ? { invoiceTermsConditions: body.invoiceTermsConditions ?? null }
            : {}),
        })
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
      await deleteWorkOrder(businessId, workOrderId)
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
        attachmentUrl: body.attachmentUrl,
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
      const body = c.req.valid('json')
      const wo = await sendJobFollowUpEmail(businessId, workOrderId, {
        from: body.from ?? undefined,
        replyTo: body.replyTo ?? undefined,
        subject: body.subject ?? undefined,
        message: body.message ?? undefined,
        to: body.to ?? undefined,
        sendMeCopy: body.sendMeCopy ?? false,
        selectedAttachmentIds: body.selectedAttachmentIds ?? [],
        additionalAttachments: body.additionalAttachments ?? [],
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
