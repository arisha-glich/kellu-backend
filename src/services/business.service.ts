import { hashPassword } from 'better-auth/crypto'
import type { Prisma } from '~/generated/prisma'
import { appEventEmitter } from '~/lib/event-emitter'
import prisma from '~/lib/prisma'
import { sendBusinessInvitationEmail } from '~/services/email-helpers'

export class BusinessNotFoundError extends Error {
  constructor() {
    super('BUSINESS_NOT_FOUND')
  }
}

/** Get the first business ID owned by this user (for resolving "current business" from auth). */
export async function getBusinessIdByOwnerId(userId: string): Promise<string | null> {
  const business = await prisma.business.findFirst({
    where: { ownerId: userId },
    select: { id: true },
  })
  return business?.id ?? null
}

/**
 * ✅ NEW — Resolve businessId for ANY authenticated user.
 *
 * - Business owner (isOwner=true) → finds business where ownerId = userId
 * - Team member    (isOwner=false) → finds business via active Member record
 *
 * USE THIS everywhere instead of getBusinessIdByOwnerId.
 * Handlers to update:
 *   • src/routes/workorders/workorder.handler.ts  ← causes your current 404 bug
 *   • src/routes/roles/role.handler.ts
 *   • src/routes/team/member.handler.ts
 *   • src/routes/clients/client.handler.ts
 *   • any other handler that calls getBusinessIdByOwnerId
 */
export async function getBusinessIdByUserId(userId: string): Promise<string | null> {
  // 1. Check if they own a business
  const ownedBusiness = await prisma.business.findFirst({
    where: { ownerId: userId },
    select: { id: true },
  })
  if (ownedBusiness) {
    return ownedBusiness.id
  }

  // 2. Otherwise check if they are an active team member
  const membership = await prisma.member.findFirst({
    where: { userId, isActive: true },
    select: { businessId: true },
  })
  return membership?.businessId ?? null
}

export class EmailAlreadyUsedError extends Error {
  constructor() {
    super('EMAIL_ALREADY_USED')
  }
}

export interface CreateBusinessInput {
  companyName: string
  email: string
  phone: string
  address?: string
  website?: string
  tempPassword?: string
  status?: boolean
}

export interface UpdateBusinessInput {
  companyName?: string
  email?: string
  phone?: string
  address?: string
  website?: string
  status?: boolean
}

/** Kelly Figma: Company Name, Business Email, Status, Total Jobs, Revenue, Users, Last Login */
export interface BusinessListResult {
  id: string
  companyName: string
  email: string
  phone: string | null
  address: string | null
  website: string | null
  status: string
  registered: Date
  lastLogin: string | null
  userId: string
  owner: {
    name: string | null
    email: string
    phone: string | null
    address: string | null
  }
  totalJobs: number
  revenue: number
  users: number
  contactInfo: {
    email: string
    phone: string
    address: string | null
    website: string | null
  }
}

export interface BusinessDetailResult {
  id: string
  companyName: string
  email: string
  phone: string | null
  address: string | null
  website: string | null
  status: string
  registered: Date
  lastLogin: string | null
  userId: string
  owner: {
    name: string | null
    email: string
    phone: string | null
    address: string | null
  }
  totalJobs: number
  revenue: number
  users: number
  contactInfo: {
    email: string
    phone: string
    address: string | null
    website: string | null
  }
}

function resolveStatus(business: { isActive: boolean }, owner: { banned: boolean } | null): string {
  if (owner?.banned) {
    return 'Suspended'
  }
  if (!business.isActive) {
    return 'Inactive'
  }
  return 'Active'
}

function buildOwnerUpdateData(data: UpdateBusinessInput) {
  const hasOwnerChanges = data.email || data.phone || data.status !== undefined
  if (!hasOwnerChanges) {
    return null
  }
  return {
    ...(data.email && { email: data.email }),
    ...(data.phone && { phone_no: data.phone }),
    ...(data.status !== undefined && { banned: !data.status }),
  }
}

function buildBusinessUpdateData(data: UpdateBusinessInput) {
  return {
    ...(data.companyName && { name: data.companyName }),
    ...(data.email && { email: data.email }),
    ...(data.phone && { phone: data.phone }),
    ...(data.address !== undefined && { address: data.address }),
    ...(data.website !== undefined && { webpage: data.website }),
    ...(data.status !== undefined && { isActive: data.status }),
  }
}

function formatUpdateStatus(
  data: UpdateBusinessInput,
  business: { isActive: boolean },
  owner: { banned: boolean } | null
): string {
  if (data.status !== undefined) {
    return data.status ? 'Active' : 'Inactive'
  }
  return resolveStatus(business, owner)
}

export async function getBusinesses(search?: string, status?: string, page = 1, limit = 10) {
  const skip = (page - 1) * limit

  const searchWhere = search
    ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
          { owner: { email: { contains: search, mode: 'insensitive' as const } } },
          { owner: { phone_no: { contains: search, mode: 'insensitive' as const } } },
        ],
      }
    : {}

  let statusWhere: Prisma.BusinessWhereInput = {}
  if (status === 'Active') {
    statusWhere = { isActive: true, OR: [{ owner: null }, { owner: { banned: false } }] }
  } else if (status === 'Inactive') {
    statusWhere = { isActive: false }
  } else if (status === 'Suspended') {
    statusWhere = { owner: { banned: true } }
  } else if (status === 'Pending') {
    statusWhere = { OR: [{ owner: null }, { owner: { banned: false } }] }
  }

  const where = { ...searchWhere, ...statusWhere }

  const [businesses, total] = await Promise.all([
    prisma.business.findMany({
      where,
      skip,
      take: limit,
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            phone_no: true,
            banned: true,
            emailVerified: true,
            lastLoginAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.business.count({ where }),
  ])

  const now = new Date()
  const businessesWithData = await Promise.all(
    businesses.map(async b => processBusinessListItem(b, now))
  )

  return {
    data: businessesWithData,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  }
}

async function processBusinessListItem(
  business: {
    id: string
    name: string
    email: string
    phone: string | null
    address: string | null
    webpage: string | null
    isActive: boolean
    createdAt: Date
    ownerId: string | null
    owner: {
      id: string
      name: string
      email: string
      phone_no: string | null
      banned: boolean
      emailVerified: boolean
      lastLoginAt: Date | null
    } | null
  },
  _now: Date
): Promise<BusinessListResult> {
  const [totalJobs, totalRevenue, userCount] = await Promise.all([
    prisma.workOrder.count({ where: { businessId: business.id } }),
    prisma.workOrder.aggregate({
      where: { businessId: business.id },
      _sum: { total: true },
    }),
    prisma.member.count({ where: { businessId: business.id, isActive: true } }),
  ])

  const revenue = totalRevenue._sum.total ? Number(totalRevenue._sum.total) : 0

  return {
    id: business.id,
    companyName: business.name,
    email: business.email,
    phone: business.phone,
    address: business.address,
    website: business.webpage,
    status: resolveStatus(business, business.owner),
    registered: business.createdAt,
    lastLogin: formatLastLogin(business.owner?.lastLoginAt ?? null),
    userId: business.ownerId ?? '',
    owner: {
      name: business.owner?.name ?? null,
      email: business.owner?.email ?? business.email,
      phone: business.owner?.phone_no ?? null,
      address: business.address,
    },
    totalJobs,
    revenue: Math.round(revenue * 100) / 100,
    users: userCount,
    contactInfo: {
      email: business.email,
      phone: business.phone ?? '',
      address: business.address,
      website: business.webpage,
    },
  }
}

function formatLastLogin(d: Date | null): string | null {
  if (!d) {
    return null
  }
  const sec = Math.floor((Date.now() - d.getTime()) / 1000)
  if (sec < 60) {
    return 'Just now'
  }
  if (sec < 3600) {
    return `${Math.floor(sec / 60)} minutes ago`
  }
  if (sec < 86400) {
    return `${Math.floor(sec / 3600)} hours ago`
  }
  if (sec < 604800) {
    return `${Math.floor(sec / 86400)} days ago`
  }
  if (sec < 2592000) {
    return `${Math.floor(sec / 604800)} weeks ago`
  }
  if (sec < 31536000) {
    return `${Math.floor(sec / 2592000)} months ago`
  }
  return `${Math.floor(sec / 31536000)} years ago`
}

export async function getBusinessById(id: string): Promise<BusinessDetailResult | null> {
  const business = await prisma.business.findUnique({
    where: { id },
    include: {
      owner: {
        select: {
          id: true,
          name: true,
          email: true,
          phone_no: true,
          banned: true,
          lastLoginAt: true,
        },
      },
    },
  })

  if (!business) {
    return null
  }

  const _now = new Date()
  const [totalJobs, totalRevenue] = await Promise.all([
    prisma.workOrder.count({ where: { businessId: business.id } }),
    prisma.workOrder.aggregate({
      where: { businessId: business.id },
      _sum: { total: true },
    }),
  ])

  const revenue = totalRevenue._sum.total ? Number(totalRevenue._sum.total) : 0

  const [userCount] = await Promise.all([
    prisma.member.count({ where: { businessId: business.id, isActive: true } }),
  ])

  return {
    id: business.id,
    companyName: business.name,
    email: business.email,
    phone: business.phone,
    address: business.address,
    website: business.webpage,
    status: resolveStatus(business, business.owner),
    registered: business.createdAt,
    lastLogin: formatLastLogin(business.owner?.lastLoginAt ?? null),
    userId: business.ownerId ?? '',
    owner: {
      name: business.owner?.name ?? null,
      email: business.owner?.email ?? business.email,
      phone: business.owner?.phone_no ?? null,
      address: business.address,
    },
    totalJobs,
    revenue: Math.round(revenue * 100) / 100,
    users: userCount,
    contactInfo: {
      email: business.email,
      phone: business.phone ?? '',
      address: business.address,
      website: business.webpage,
    },
  }
}

export async function createBusiness(data: CreateBusinessInput): Promise<{
  id: string
  companyName: string
  email: string
  phone: string
  status: string
  address: string | null
  owner: { name: string | null; email: string; phone: string | null; address: string | null }
}> {
  let user: { id: string; name: string; email: string; phone_no: string | null } | null = null

  if (data.tempPassword) {
    const existing = await prisma.user.findUnique({
      where: { email: data.email },
      select: { id: true },
    })
    if (existing) {
      throw new EmailAlreadyUsedError()
    }

    const hashedPassword = await hashPassword(data.tempPassword)
    user = await prisma.user.create({
      data: {
        name: data.companyName,
        email: data.email,
        phone_no: data.phone,
        banned: data.status === false,
        role: 'BUSINESS_OWNER',
        isOwner: true, // ✅ marks this user as the actual business owner
      },
    })

    await prisma.account.create({
      data: {
        userId: user.id,
        accountId: user.id,
        providerId: 'credential',
        password: hashedPassword,
      },
    })
  }

  const business = await prisma.business.create({
    data: {
      ...(user && { ownerId: user.id }),
      name: data.companyName,
      email: data.email,
      phone: data.phone,
      address: data.address ?? null,
      webpage: data.website ?? null,
      isActive: data.status !== false,
    },
  })

  await prisma.businessSettings.upsert({
    where: { businessId: business.id },
    create: {
      businessId: business.id,
      replyToEmail: business.email,
    },
    update: { replyToEmail: business.email },
  })

  if (user && data.tempPassword) {
    const ownerName = data.companyName || data.email.split('@')[0]
    await sendBusinessInvitationEmail({
      to: data.email,
      businessName: data.companyName,
      ownerName,
      email: data.email,
      tempPassword: data.tempPassword,
    })
  }

  return {
    id: business.id,
    companyName: business.name,
    email: business.email,
    phone: business.phone ?? '',
    status: data.status === false ? 'Inactive' : user ? 'Invited' : 'Active',
    address: business.address,
    owner: {
      name: user?.name ?? null,
      email: business.email,
      phone: business.phone,
      address: business.address,
    },
  }
}

export async function updateBusiness(id: string, data: UpdateBusinessInput) {
  const business = await prisma.business.findUnique({
    where: { id },
    include: { owner: true },
  })

  if (!business) {
    throw new BusinessNotFoundError()
  }

  const ownerData = buildOwnerUpdateData(data)
  if (ownerData && business.ownerId) {
    await prisma.user.update({
      where: { id: business.ownerId },
      data: ownerData,
    })
  }

  const updatePayload = buildBusinessUpdateData(data)
  const updated = await prisma.business.update({
    where: { id },
    data: updatePayload,
    include: { owner: true },
  })

  return {
    id: updated.id,
    companyName: updated.name,
    email: updated.email,
    phone: updated.phone ?? '',
    address: updated.address,
    status: formatUpdateStatus(data, updated, updated.owner),
  }
}

export interface UpdateCommissionInput {
  commissionType?: 'PERCENTAGE' | 'FIXED' | 'TIERED'
  commissionValue?: number | null
  percentageCommission?: number | null
  fixedCommission?: number | null
  setBoth?: boolean
  country?: string
  currency?: string
}

export async function updateBusinessCommission(_businessId: string, _data: UpdateCommissionInput) {
  // Kelly schema has no Commission model - return stub for API compatibility
  return {
    commissionType: 'PERCENTAGE' as const,
    commissionValue: null as number | null,
  }
}

export async function getBusinessClients(businessId: string, page = 1, limit = 10) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true },
  })
  if (!business) {
    throw new BusinessNotFoundError()
  }

  const skip = (page - 1) * limit

  const [clients, total] = await Promise.all([
    prisma.client.findMany({
      where: { businessId },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.client.count({ where: { businessId } }),
  ])

  return {
    data: clients.map(c => ({
      id: c.id,
      name: c.name,
      email: c.email ?? '',
      phone: c.phone,
      status: String(c.status),
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  }
}

export async function getBusinessJobs(businessId: string, page = 1, limit = 10) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true },
  })
  if (!business) {
    throw new BusinessNotFoundError()
  }

  const skip = (page - 1) * limit

  const [workOrders, total] = await Promise.all([
    prisma.workOrder.findMany({
      where: { businessId },
      skip,
      take: limit,
      include: {
        assignedTo: { include: { user: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.workOrder.count({ where: { businessId } }),
  ])

  const data = workOrders.map(wo => ({
    id: wo.id,
    title: wo.title,
    assignee: wo.assignedTo?.user?.name ?? null,
    scheduledAt: wo.scheduledAt ? wo.scheduledAt.toISOString() : null,
    status: wo.jobStatus,
  }))

  return {
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  }
}

export async function getBusinessClientsWithJobs(businessId: string, page = 1, limit = 10) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true },
  })
  if (!business) {
    throw new BusinessNotFoundError()
  }

  const skip = (page - 1) * limit

  const [clients, total] = await Promise.all([
    prisma.client.findMany({
      where: { businessId },
      skip,
      take: limit,
      include: { _count: { select: { workOrders: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.client.count({ where: { businessId } }),
  ])

  const data = clients.map(c => ({
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    workOrderCount: c._count.workOrders,
  }))

  return {
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  }
}

export async function toggleBusinessStatus(id: string, status: boolean) {
  const business = await prisma.business.findUnique({
    where: { id },
    select: { ownerId: true },
  })
  if (!business) {
    throw new BusinessNotFoundError()
  }

  if (business.ownerId) {
    await prisma.user.update({
      where: { id: business.ownerId },
      data: { banned: !status },
    })
  } else {
    await prisma.business.update({
      where: { id },
      data: { isActive: status },
    })
  }

  return { id, status: status ? 'Active' : 'Inactive' }
}

export async function suspendBusiness(id: string) {
  return toggleBusinessStatus(id, false)
}

export async function unsuspendBusiness(id: string) {
  return toggleBusinessStatus(id, true)
}

export async function sendBusinessEmail(id: string, subject: string, body: string) {
  const business = await prisma.business.findUnique({
    where: { id },
    include: { owner: { select: { email: true } } },
  })
  if (!business) {
    throw new BusinessNotFoundError()
  }

  const email = business.owner?.email ?? business.email
  if (!email) {
    throw new Error('Business has no contact email')
  }

  const html = body.trim().startsWith('<') ? body : `<p>${body.replace(/\n/g, '</p><p>')}</p>`
  appEventEmitter.emitSendMail({ to: email, subject, html })
  return { success: true, message: 'Email sent successfully', email }
}

/** Resend login credentials (docs §3.1 - Resend login credentials) */
export async function sendBusinessReminder(id: string) {
  const business = await prisma.business.findUnique({
    where: { id },
    include: { owner: { select: { email: true } } },
  })
  if (!business) {
    throw new BusinessNotFoundError()
  }

  const email = business.owner?.email ?? business.email
  const loginUrl = `${process.env.FRONTEND_URL ?? 'http://localhost:3001'}/login`
  const subject = `${process.env.APP_NAME ?? 'Kelly'} - Login Reminder`
  const html = `<p>You requested a login reminder for your business portal. <a href="${loginUrl}">Click here to log in</a>.</p><p>If you forgot your password, use the password reset option on the login page.</p>`
  appEventEmitter.emitSendMail({ to: email, subject, html })
  return { success: true, message: 'Reminder sent successfully', email }
}

/** Business service – all DB and business logic lives here. Import and use in handlers. */
export const businessService = {
  getBusinesses,
  getBusinessById,
  createBusiness,
  updateBusiness,
  updateBusinessCommission,
  getBusinessClients,
  getBusinessJobs,
  getBusinessClientsWithJobs,
  toggleBusinessStatus,
  suspendBusiness,
  unsuspendBusiness,
  sendBusinessEmail,
  sendBusinessReminder,
}
