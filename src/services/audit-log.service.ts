import { Prisma } from '~/generated/prisma'
import prisma from '~/lib/prisma'

export interface CreateAuditLogInput {
  action: string
  module: string
  entityId?: string | null
  oldValues?: unknown
  newValues?: unknown
  userId?: string | null
  businessId?: string | null
  ipAddress?: string | null
  userAgent?: string | null
}

export interface AuditLogListFilters {
  action?: string
  module?: string
  businessId?: string
  search?: string
  adminOnly?: boolean
  page?: number
  limit?: number
}

const AUDIT_ACTION_FILTERS = ['LOGIN_LOGOUT', 'CREATED', 'UPDATED', 'DELETED'] as const
const DEFAULT_AUDIT_MODULES = [
  'authentication',
  'business',
  'client',
  'quote',
  'task',
  'schedule',
  'expense',
  'priceList',
  'workorder',
  'invoice',
  'user',
  'settings',
  'reports',
  'roles',
  'notifications',
  'insights',
] as const

function normalizeModuleValue(value: string): string {
  const v = value.trim().toLowerCase()
  if (v === 'job' || v === 'jobs' || v === 'work_order' || v === 'work-order') {
    return 'workorder'
  }
  return v
}

function buildActionWhere(action?: string): Prisma.AuditLogWhereInput | undefined {
  if (!action) {
    return undefined
  }
  const a = action.trim().toUpperCase()
  if (a === 'LOGIN_LOGOUT') {
    return {
      OR: [
        { action: { contains: 'login', mode: 'insensitive' } },
        { action: { contains: 'logout', mode: 'insensitive' } },
        { action: { contains: 'sign_in', mode: 'insensitive' } },
        { action: { contains: 'sign_out', mode: 'insensitive' } },
      ],
    }
  }
  if (a === 'CREATED') {
    return { action: { contains: 'create', mode: 'insensitive' } }
  }
  if (a === 'UPDATED') {
    return { action: { contains: 'update', mode: 'insensitive' } }
  }
  if (a === 'DELETED') {
    return { action: { contains: 'delete', mode: 'insensitive' } }
  }
  return { action: { contains: action.trim(), mode: 'insensitive' } }
}

function buildModuleWhere(module?: string): Prisma.AuditLogWhereInput | undefined {
  if (!module) {
    return undefined
  }
  const m = normalizeModuleValue(module)
  if (m === 'workorder') {
    return {
      OR: [
        { entityType: { contains: 'workorder', mode: 'insensitive' } },
        { entityType: { contains: 'work_order', mode: 'insensitive' } },
        { entityType: { contains: 'job', mode: 'insensitive' } },
      ],
    }
  }
  return { entityType: { contains: m, mode: 'insensitive' } }
}

function toAuditJsonField(
  v: unknown
): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue | undefined {
  if (v === undefined) {
    return undefined
  }
  if (v === null) {
    return Prisma.JsonNull
  }
  return v as Prisma.InputJsonValue
}

export async function createAuditLog(input: CreateAuditLogInput): Promise<void> {
  await prisma.auditLog.create({
    data: {
      action: input.action,
      entityType: input.module,
      entityId: input.entityId ?? null,
      oldValues: toAuditJsonField(input.oldValues),
      newValues: toAuditJsonField(input.newValues),
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      userId: input.userId ?? null,
      businessId: input.businessId ?? null,
    },
  })
}

function buildActorScopeWhere(adminOnly?: boolean): Prisma.AuditLogWhereInput | undefined {
  if (!adminOnly) {
    return undefined
  }
  return {
    user: {
      is: {
        OR: [{ role: 'SUPER_ADMIN' }, { adminPortalTeamMember: true }],
      },
    },
  }
}

export async function listAuditLogs(filters: AuditLogListFilters = {}) {
  const { action, module, businessId, search, adminOnly, page = 1, limit = 20 } = filters
  const skip = (page - 1) * limit
  const actionWhere = buildActionWhere(action)
  const moduleWhere = buildModuleWhere(module)
  const actorScopeWhere = buildActorScopeWhere(adminOnly)

  const where: Prisma.AuditLogWhereInput = {
    ...(actorScopeWhere ?? {}),
    ...(actionWhere ?? {}),
    ...(moduleWhere ?? {}),
    ...(businessId ? { businessId } : {}),
    ...(search?.trim()
      ? {
          OR: [
            { action: { contains: search.trim(), mode: 'insensitive' } },
            { entityType: { contains: search.trim(), mode: 'insensitive' } },
            { user: { email: { contains: search.trim(), mode: 'insensitive' } } },
            { business: { name: { contains: search.trim(), mode: 'insensitive' } } },
          ],
        }
      : {}),
  }

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        user: { select: { id: true, email: true, name: true } },
        business: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.auditLog.count({ where }),
  ])

  return {
    data: rows.map(r => ({
      id: r.id,
      timestamp: r.createdAt,
      action: r.action,
      module: normalizeModuleValue(r.entityType),
      targetBusiness: r.business ? { id: r.business.id, name: r.business.name } : null,
      performedBy: r.user
        ? { id: r.user.id, email: r.user.email, name: r.user.name ?? null }
        : null,
      entityId: r.entityId,
      oldValues: r.oldValues,
      newValues: r.newValues,
      ipAddress: r.ipAddress,
      userAgent: r.userAgent,
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  }
}

export async function listAuditLogFilterOptions({ adminOnly }: { adminOnly?: boolean } = {}) {
  const rows = await prisma.auditLog.findMany({
    where: {
      ...(buildActorScopeWhere(adminOnly) ?? {}),
    },
    select: { entityType: true },
    distinct: ['entityType'],
    orderBy: { entityType: 'asc' },
  })

  const discovered = rows.map(r => normalizeModuleValue(r.entityType)).filter(Boolean)

  const modules = Array.from(new Set([...DEFAULT_AUDIT_MODULES, ...discovered])).sort((a, b) =>
    a.localeCompare(b)
  )

  return {
    actions: [...AUDIT_ACTION_FILTERS],
    modules,
  }
}
