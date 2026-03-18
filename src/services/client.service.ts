import type { ClientStatus, LeadSource } from '~/generated/prisma'
import prisma from '~/lib/prisma'
import { BusinessNotFoundError } from '~/services/business.service'
import { sendClientProfileUpdateEmail } from '~/services/email-helpers'

export class ClientNotFoundError extends Error {
  constructor() {
    super('CLIENT_NOT_FOUND')
  }
}

export interface CreateClientInput {
  name: string
  phone: string
  email?: string | null
  documentNumber?: string | null
  leadSource?: LeadSource
  notes?: string | null
}

export interface UpdateClientInput {
  name?: string
  phone?: string
  email?: string | null
  documentNumber?: string | null
  leadSource?: LeadSource
  notes?: string | null
  status?: ClientStatus
}

export interface ClientListFilters {
  search?: string
  status?: ClientStatus
  sortBy?: 'name' | 'lastActivityAt' | 'createdAt'
  order?: 'asc' | 'desc'
  page?: number
  limit?: number
}

export interface ClientListItem {
  id: string
  businessId: string
  name: string
  status: string
  lastActivity: string | null
}

export interface ClientStatistics {
  newClientsLast30Days: number
  totalNewClientsYTD: number
}

export interface ClientDetail {
  id: string
  businessId: string
  name: string
  phone: string
  email: string | null
  address: string | null
  documentNumber: string | null
  leadSource: string
  notes: string | null
  status: string
  lastActivityAt: Date | null
  lastActivity: string | null
  createdAt: Date
  updatedAt: Date
}

function formatLastActivity(d: Date | null): string | null {
  if (!d) return null
  const sec = Math.floor((Date.now() - d.getTime()) / 1000)
  if (sec < 60) return 'Just now'
  if (sec < 3600) return `${Math.floor(sec / 60)} minutes ago`
  if (sec < 86400) return `${Math.floor(sec / 3600)} hours ago`
  if (sec < 604800) return `${Math.floor(sec / 86400)} days ago`
  if (sec < 2592000) return `${Math.floor(sec / 86400)} days ago`
  if (sec < 31536000) return `${Math.floor(sec / 2592000)} months ago`
  return `${Math.floor(sec / 31536000)} years ago`
}

async function ensureBusinessExists(businessId: string): Promise<void> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true },
  })
  if (!business) throw new BusinessNotFoundError()
}

export async function createClient(businessId: string, data: CreateClientInput) {
  await ensureBusinessExists(businessId)

  const client = await prisma.client.create({
    data: {
      businessId,
      name: data.name,
      phone: data.phone,
      email: data.email ?? null,
      documentNumber: data.documentNumber ?? null,
      leadSource: data.leadSource ?? 'Website',
      notes: data.notes ?? null,
      lastActivityAt: new Date(),
    },
  })

  if (client.email) {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { name: true, email: true, logoUrl: true },
    })
    if (business?.email) {
      sendClientProfileUpdateEmail({
        to: client.email,
        clientName: client.name,
        businessName: business.name,
        companyReplyTo: business.email,
        companyLogoUrl: business.logoUrl ?? undefined,
        isUpdate: false,
      })
    }
  }

  return mapToClientDetail(client)
}

export async function getClients(
  businessId: string,
  filters: ClientListFilters = {}
) {
  await ensureBusinessExists(businessId)

  const {
    search,
    status,
    sortBy = 'createdAt',
    order = 'desc',
    page = 1,
    limit = 10,
  } = filters

  const skip = (page - 1) * limit

  const searchWhere = search
    ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
          { phone: { contains: search, mode: 'insensitive' as const } },
        ],
      }
    : {}

  const statusWhere = status ? { status } : {}
  const where = { businessId, ...searchWhere, ...statusWhere }

  const orderByField =
    sortBy === 'lastActivityAt' ? 'lastActivityAt' : sortBy === 'name' ? 'name' : 'createdAt'
  const orderBy = { [orderByField]: order }

  const [clients, total] = await Promise.all([
    prisma.client.findMany({
      where,
      skip,
      take: limit,
      orderBy,
    }),
    prisma.client.count({ where }),
  ])

  const data: ClientListItem[] = clients.map(c => ({
    id: c.id,
    businessId: c.businessId,
    name: c.name,
    status: c.status,
    lastActivity: formatLastActivity(c.lastActivityAt ?? c.updatedAt),
  }))

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  }
}

export async function getClientStatistics(businessId: string): Promise<ClientStatistics> {
  await ensureBusinessExists(businessId)

  const now = new Date()
  const thirtyDaysAgo = new Date(now)
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const startOfYear = new Date(now.getFullYear(), 0, 1)

  const [newClientsLast30Days, totalNewClientsYTD] = await Promise.all([
    prisma.client.count({
      where: {
        businessId,
        createdAt: { gte: thirtyDaysAgo },
      },
    }),
    prisma.client.count({
      where: {
        businessId,
        createdAt: { gte: startOfYear },
      },
    }),
  ])

  return {
    newClientsLast30Days,
    totalNewClientsYTD,
  }
}

function mapToClientDetail(client: {
  id: string
  businessId: string
  name: string
  phone: string
  email: string | null
  address: string | null
  documentNumber: string | null
  leadSource: string
  notes: string | null
  status: string
  lastActivityAt: Date | null
  createdAt: Date
  updatedAt: Date
}): ClientDetail {
  return {
    id: client.id,
    businessId: client.businessId,
    name: client.name,
    phone: client.phone,
    email: client.email,
    address: client.address,
    documentNumber: client.documentNumber,
    leadSource: client.leadSource,
    notes: client.notes,
    status: client.status,
    lastActivityAt: client.lastActivityAt,
    lastActivity: formatLastActivity(client.lastActivityAt ?? client.updatedAt),
    createdAt: client.createdAt,
    updatedAt: client.updatedAt,
  }
}

export async function getClientById(businessId: string, clientId: string) {
  await ensureBusinessExists(businessId)

  const client = await prisma.client.findFirst({
    where: { id: clientId, businessId },
  })

  if (!client) throw new ClientNotFoundError()
  return mapToClientDetail(client)
}

/** Get client by ID only (no business scope – use for GET /clients/:clientId) */
export async function getClientByClientId(clientId: string) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
  })
  if (!client) throw new ClientNotFoundError()
  return mapToClientDetail(client)
}

export async function updateClient(
  businessId: string,
  clientId: string,
  data: UpdateClientInput
) {
  await ensureBusinessExists(businessId)

  const existing = await prisma.client.findFirst({
    where: { id: clientId, businessId },
  })
  if (!existing) throw new ClientNotFoundError()

  const client = await prisma.client.update({
    where: { id: clientId },
    data: {
      ...(data.name != null && { name: data.name }),
      ...(data.phone != null && { phone: data.phone }),
      ...(data.email !== undefined && { email: data.email }),
      ...(data.documentNumber !== undefined && { documentNumber: data.documentNumber }),
      ...(data.leadSource != null && { leadSource: data.leadSource }),
      ...(data.notes !== undefined && { notes: data.notes }),
      ...(data.status != null && { status: data.status }),
    },
  })

  if (client.email) {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { name: true, email: true, logoUrl: true },
    })
    if (business?.email) {
      sendClientProfileUpdateEmail({
        to: client.email,
        clientName: client.name,
        businessName: business.name,
        companyReplyTo: business.email,
        companyLogoUrl: business.logoUrl ?? undefined,
        isUpdate: true,
      })
    }
  }

  return mapToClientDetail(client)
}

/** Update client by ID only (no business in path – use for PATCH /clients/:clientId) */
export async function updateClientByClientId(clientId: string, data: UpdateClientInput) {
  const existing = await prisma.client.findUnique({
    where: { id: clientId },
  })
  if (!existing) throw new ClientNotFoundError()

  const client = await prisma.client.update({
    where: { id: clientId },
    data: {
      ...(data.name != null && { name: data.name }),
      ...(data.phone != null && { phone: data.phone }),
      ...(data.email !== undefined && { email: data.email }),
      ...(data.documentNumber !== undefined && { documentNumber: data.documentNumber }),
      ...(data.leadSource != null && { leadSource: data.leadSource }),
      ...(data.notes !== undefined && { notes: data.notes }),
      ...(data.status != null && { status: data.status }),
    },
  })

  if (client.email) {
    const business = await prisma.business.findUnique({
      where: { id: client.businessId },
      select: { name: true, email: true, logoUrl: true },
    })
    if (business?.email) {
      sendClientProfileUpdateEmail({
        to: client.email,
        clientName: client.name,
        businessName: business.name,
        companyReplyTo: business.email,
        companyLogoUrl: business.logoUrl ?? undefined,
        isUpdate: true,
      })
    }
  }

  return mapToClientDetail(client)
}

export async function deleteClient(businessId: string, clientId: string) {
  await ensureBusinessExists(businessId)

  const existing = await prisma.client.findFirst({
    where: { id: clientId, businessId },
  })
  if (!existing) throw new ClientNotFoundError()

  await prisma.client.delete({
    where: { id: clientId },
  })
}

/** Delete client by ID only (no business in path – use for DELETE /clients/:clientId) */
export async function deleteClientByClientId(clientId: string) {
  const existing = await prisma.client.findUnique({
    where: { id: clientId },
  })
  if (!existing) throw new ClientNotFoundError()
  await prisma.client.delete({
    where: { id: clientId },
  })
}

export function getLeadSources(): { value: string; label: string }[] {
  return [
    { value: 'Website', label: 'Website' },
    { value: 'SocialMedia', label: 'Social Media' },
    { value: 'All', label: 'All' },
  ]
}
