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
  page?: number
  limit?: number
}

export async function createAuditLog(input: CreateAuditLogInput): Promise<void> {
  await prisma.auditLog.create({
    data: {
      action: input.action,
      entityType: input.module,
      entityId: input.entityId ?? null,
      oldValues: input.oldValues as JsonValue | null | undefined,
      newValues: input.newValues as JsonValue | null | undefined,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      userId: input.userId ?? null,
      businessId: input.businessId ?? null,
    },
  })
}

export async function listAuditLogs(filters: AuditLogListFilters = {}) {
  const { action, module, businessId, search, page = 1, limit = 20 } = filters
  const skip = (page - 1) * limit

  const where: Parameters<typeof prisma.auditLog.findMany>[0]['where'] = {
    ...(action ? { action: { contains: action, mode: 'insensitive' } } : {}),
    ...(module ? { entityType: { contains: module, mode: 'insensitive' } } : {}),
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
      module: r.entityType,
      targetBusiness: r.business
        ? { id: r.business.id, name: r.business.name }
        : null,
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
