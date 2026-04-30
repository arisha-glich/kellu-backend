import type { Prisma } from '~/generated/prisma'
import prisma from '~/lib/prisma'
import { emailService } from '~/services/email.service'

const HIDDEN_NOTIFICATION_TYPES = ['NEW_BUSINESS_REGISTRATION'] as const

function buildNotificationVisibilityFilter(type?: string) {
  if (type) {
    return { type }
  }
  return { type: { notIn: [...HIDDEN_NOTIFICATION_TYPES] } as Prisma.StringFilter }
}

export interface NotificationFeedFilters {
  page?: number
  limit?: number
  search?: string
  type?: string
  unreadOnly?: boolean
}

export interface NotificationFeedItem {
  id: string
  type: string
  title: string
  message: string | null
  readAt: Date | null
  createdAt: Date
  metadata: Record<string, unknown> | null
}

export interface NotificationFeedResult {
  data: NotificationFeedItem[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export interface CreateUserNotificationInput {
  userId: string
  type: string
  title: string
  message?: string | null
  metadata?: Record<string, unknown> | null
}

function toRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) {
    return null
  }
  return v as Record<string, unknown>
}

/** Activity Feed list with search/filter/pagination for top header notification hub. */
export async function listNotifications(
  userId: string,
  filters: NotificationFeedFilters = {}
): Promise<NotificationFeedResult> {
  const page = filters.page ?? 1
  const limit = filters.limit ?? 20
  const skip = (page - 1) * limit

  const where = {
    userId,
    ...buildNotificationVisibilityFilter(filters.type),
    ...(filters.unreadOnly ? { readAt: null } : {}),
    ...(filters.search?.trim()
      ? {
          OR: [
            { title: { contains: filters.search.trim(), mode: 'insensitive' as const } },
            { message: { contains: filters.search.trim(), mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }

  const [items, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.notification.count({ where }),
  ])

  return {
    data: items.map(n => ({
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.message,
      readAt: n.readAt,
      createdAt: n.createdAt,
      metadata: toRecord(n.metadata),
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  }
}

/** Unread badge count for bell icon. */
export async function getUnreadNotificationCount(userId: string): Promise<number> {
  return prisma.notification.count({
    where: {
      userId,
      readAt: null,
      type: { notIn: [...HIDDEN_NOTIFICATION_TYPES] },
    },
  })
}

/** Mark one notification as read (idempotent). */
export async function markNotificationRead(userId: string, notificationId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { id: notificationId, userId, readAt: null },
    data: { readAt: new Date() },
  })
}

/** Mark all user notifications as read (idempotent). */
export async function markAllNotificationsRead(userId: string): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  })
  return result.count
}

/** Feed customization options for UI modal; includes type counts for quick toggles. */
export async function getNotificationFeedOptions(userId: string): Promise<{
  byType: Array<{ type: string; count: number }>
  total: number
}> {
  const grouped = await prisma.notification.groupBy({
    by: ['type'],
    where: {
      userId,
      type: { notIn: [...HIDDEN_NOTIFICATION_TYPES] },
    },
    _count: { _all: true },
    orderBy: { type: 'asc' },
  })

  const byType = grouped.map(row => ({
    type: row.type,
    count: row._count._all,
  }))

  return {
    byType,
    total: byType.reduce((sum, row) => sum + row.count, 0),
  }
}

/** Create an in-app notification item for activity feed hub. */
export async function createUserNotification(input: CreateUserNotificationInput): Promise<void> {
  await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      message: input.message ?? null,
      metadata: (input.metadata as Prisma.InputJsonValue | null | undefined) ?? undefined,
    },
  })
}

/** Send a simple operation acknowledgment email to the acting user. */
export async function sendUserOperationEmail(input: {
  to: string
  userName?: string | null
  actionTitle: string
  actionMessage: string
}): Promise<void> {
  const name = input.userName?.trim() || 'there'
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
      <h2 style="margin: 0 0 12px;">${input.actionTitle}</h2>
      <p style="margin: 0 0 8px;">Hi ${name},</p>
      <p style="margin: 0 0 8px;">${input.actionMessage}</p>
      <p style="margin: 0;">This is an automatic confirmation from Kellu.</p>
    </div>
  `

  await emailService.send({
    to: input.to,
    subject: input.actionTitle,
    html,
  })
}
