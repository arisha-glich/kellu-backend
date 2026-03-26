/**
 * Master Price List service – per-tenant services and products.
 * CRUD for PriceListItem: item type, name, description, cost, markup%, price.
 */

import type { ItemType, Prisma } from '~/generated/prisma'
import prisma from '~/lib/prisma'
import { BusinessNotFoundError } from '~/services/business.service'

export class PriceListItemNotFoundError extends Error {
  constructor() {
    super('PRICE_LIST_ITEM_NOT_FOUND')
  }
}

export interface PriceListFilters {
  search?: string
  itemType?: ItemType
  page?: number
  limit?: number
  sortBy?: 'name' | 'createdAt' | 'itemType'
  order?: 'asc' | 'desc'
}

export interface CreatePriceListItemInput {
  itemType: ItemType
  name: string
  description?: string | null
  cost?: number | null
  markupPercent?: number | null
  price: number
}

export type UpdatePriceListItemInput = Partial<CreatePriceListItemInput>

async function ensureBusinessExists(businessId: string): Promise<void> {
  const b = await prisma.business.findUnique({ where: { id: businessId }, select: { id: true } })
  if (!b) {
    throw new BusinessNotFoundError()
  }
}

/** List price list items (Master Price List) with optional search and filter. */
export async function listPriceListItems(businessId: string, filters: PriceListFilters = {}) {
  await ensureBusinessExists(businessId)
  const { search, itemType, page = 1, limit = 20, sortBy = 'name', order = 'asc' } = filters
  const skip = (page - 1) * limit

  const where: Prisma.PriceListItemWhereInput = { businessId }
  if (itemType) {
    where.itemType = itemType
  }
  if (search?.trim()) {
    where.OR = [
      { name: { contains: search.trim(), mode: 'insensitive' } },
      { description: { contains: search.trim(), mode: 'insensitive' } },
    ]
  }

  const orderByField = sortBy === 'itemType' ? 'itemType' : sortBy
  const orderBy = { [orderByField]: order }

  const [items, total] = await Promise.all([
    prisma.priceListItem.findMany({
      where,
      skip,
      take: limit,
      orderBy,
    }),
    prisma.priceListItem.count({ where }),
  ])

  return {
    data: items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  }
}

/** Get one price list item by ID. */
export async function getPriceListItemById(businessId: string, id: string) {
  await ensureBusinessExists(businessId)
  const item = await prisma.priceListItem.findFirst({
    where: { id, businessId },
  })
  if (!item) {
    throw new PriceListItemNotFoundError()
  }
  return item
}

/** Create a price list item (Add item – service or product). */
export async function createPriceListItem(businessId: string, input: CreatePriceListItemInput) {
  await ensureBusinessExists(businessId)
  return prisma.priceListItem.create({
    data: {
      businessId,
      itemType: input.itemType,
      name: input.name,
      description: input.description ?? null,
      cost: input.cost ?? null,
      markupPercent: input.markupPercent ?? null,
      price: input.price,
    },
  })
}

/** Update a price list item. */
export async function updatePriceListItem(
  businessId: string,
  id: string,
  input: UpdatePriceListItemInput
) {
  await ensureBusinessExists(businessId)
  const existing = await prisma.priceListItem.findFirst({
    where: { id, businessId },
    select: { id: true },
  })
  if (!existing) {
    throw new PriceListItemNotFoundError()
  }
  return prisma.priceListItem.update({
    where: { id },
    data: {
      ...(input.itemType != null && { itemType: input.itemType }),
      ...(input.name != null && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.cost !== undefined && { cost: input.cost }),
      ...(input.markupPercent !== undefined && { markupPercent: input.markupPercent }),
      ...(input.price != null && { price: input.price }),
    },
  })
}

/** Delete a price list item. LineItems referencing it will have priceListItemId set null (SetNull). */
export async function deletePriceListItem(businessId: string, id: string): Promise<void> {
  await ensureBusinessExists(businessId)
  const existing = await prisma.priceListItem.findFirst({
    where: { id, businessId },
    select: { id: true },
  })
  if (!existing) {
    throw new PriceListItemNotFoundError()
  }
  await prisma.priceListItem.delete({ where: { id } })
}

/** Bulk import price list items (e.g. from CSV). Creates many records in one call. */
export async function importPriceListItems(
  businessId: string,
  items: CreatePriceListItemInput[]
): Promise<{ created: number; data: Awaited<ReturnType<typeof prisma.priceListItem.create>>[] }> {
  await ensureBusinessExists(businessId)
  if (!items.length) {
    return { created: 0, data: [] }
  }
  const created = await prisma.priceListItem.createManyAndReturn({
    data: items.map(input => ({
      businessId,
      itemType: input.itemType,
      name: input.name,
      description: input.description ?? null,
      cost: input.cost ?? null,
      markupPercent: input.markupPercent ?? null,
      price: input.price,
    })),
  })
  return { created: created.length, data: created }
}
