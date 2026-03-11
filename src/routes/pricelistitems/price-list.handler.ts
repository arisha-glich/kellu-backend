/**
 * Master Price List API handlers – business resolved from authenticated user.
 */

import * as HttpStatusCodes from 'stoker/http-status-codes'
import type { PRICE_LIST_ROUTES } from '~/routes/pricelistitems/price-list.routes'
import {
  createPriceListItem,
  deletePriceListItem,
  getPriceListItemById,
  importPriceListItems,
  listPriceListItems,
  updatePriceListItem,
  PriceListItemNotFoundError,
} from '~/services/price-list.service'
import { BusinessNotFoundError, getBusinessIdByOwnerId } from '~/services/business.service'
import type { HandlerMapFromRoutes } from '~/types'

export const PRICE_LIST_HANDLER: HandlerMapFromRoutes<typeof PRICE_LIST_ROUTES> = {
  list: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByOwnerId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }
      const query = c.req.valid('query')
      const page = query.page ? Number.parseInt(query.page, 10) : 1
      const limit = query.limit ? Number.parseInt(query.limit, 10) : 20
      const result = await listPriceListItems(businessId, {
        search: query.search,
        itemType: query.itemType,
        sortBy: query.sortBy,
        order: query.order,
        page,
        limit,
      })
      return c.json(
        { message: 'Price list retrieved successfully', success: true, data: result },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error listing price list:', error)
      return c.json(
        { message: 'Failed to retrieve price list' },
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
      const businessId = await getBusinessIdByOwnerId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }
      const { id } = c.req.valid('param')
      const item = await getPriceListItemById(businessId, id)
      return c.json(
        { message: 'Price list item retrieved successfully', success: true, data: item },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof PriceListItemNotFoundError) {
        return c.json({ message: 'Price list item not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error fetching price list item:', error)
      return c.json(
        { message: 'Failed to retrieve price list item' },
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
      const businessId = await getBusinessIdByOwnerId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }
      const body = await c.req.valid('json')
      const item = await createPriceListItem(businessId, {
        itemType: body.itemType,
        name: body.name,
        description: body.description ?? null,
        cost: body.cost ?? null,
        markupPercent: body.markupPercent ?? null,
        price: body.price,
      })
      return c.json(
        { message: 'Price list item created successfully', success: true, data: item },
        HttpStatusCodes.CREATED
      )
    } catch (error) {
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error creating price list item:', error)
      return c.json(
        { message: 'Failed to create price list item' },
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
      const businessId = await getBusinessIdByOwnerId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }
      const { id } = c.req.valid('param')
      const body = await c.req.valid('json')
      const item = await updatePriceListItem(businessId, id, {
        itemType: body.itemType,
        name: body.name,
        description: body.description,
        cost: body.cost,
        markupPercent: body.markupPercent,
        price: body.price,
      })
      return c.json(
        { message: 'Price list item updated successfully', success: true, data: item },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof PriceListItemNotFoundError) {
        return c.json({ message: 'Price list item not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error updating price list item:', error)
      return c.json(
        { message: 'Failed to update price list item' },
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
      const businessId = await getBusinessIdByOwnerId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }
      const { id } = c.req.valid('param')
      await deletePriceListItem(businessId, id)
      return c.json(
        { message: 'Price list item deleted successfully', success: true, data: { deleted: true } },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof PriceListItemNotFoundError) {
        return c.json({ message: 'Price list item not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error deleting price list item:', error)
      return c.json(
        { message: 'Failed to delete price list item' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  import: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByOwnerId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }
      const body = await c.req.valid('json')
      const result = await importPriceListItems(businessId, body.items)
      return c.json(
        {
          message: `Imported ${result.created} price list item(s) successfully`,
          success: true,
          data: result,
        },
        HttpStatusCodes.CREATED
      )
    } catch (error) {
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error importing price list:', error)
      return c.json(
        { message: 'Failed to import price list items' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },
}
