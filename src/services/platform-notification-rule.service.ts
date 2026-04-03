import prisma from '~/lib/prisma'

/** Machine keys referenced by application code for gating automations. */
export const PlatformNotificationEventKey = {
  WORK_ORDER_COMPLETED: 'WORK_ORDER_COMPLETED',
  USER_INVITATION: 'USER_INVITATION',
  QUOTE_REJECTED_BY_CLIENT: 'QUOTE_REJECTED_BY_CLIENT',
} as const

/** Removed from product; deleted from DB whenever defaults are ensured. */
const DEPRECATED_EVENT_KEYS = [
  'NEW_BUSINESS_REGISTRATION',
  'PAYMENT_RECEIVED',
  'FAILED_LOGIN_ALERT',
] as const

export type PlatformNotificationEventKeyType =
  (typeof PlatformNotificationEventKey)[keyof typeof PlatformNotificationEventKey]

const DEFAULT_RULES: Array<{
  eventKey: string
  eventName: string
  triggerDescription: string
  isActive: boolean
  sortOrder: number
}> = [
  {
    eventKey: PlatformNotificationEventKey.WORK_ORDER_COMPLETED,
    eventName: 'Job Completed',
    triggerDescription: 'When job status changes to completed',
    isActive: true,
    sortOrder: 10,
  },
  {
    eventKey: PlatformNotificationEventKey.USER_INVITATION,
    eventName: 'User Invitation',
    triggerDescription: 'When new user is invited',
    isActive: false,
    sortOrder: 20,
  },
  {
    eventKey: PlatformNotificationEventKey.QUOTE_REJECTED_BY_CLIENT,
    eventName: 'Quote Rejected',
    triggerDescription: 'When a client rejects a quote (includes reason)',
    isActive: true,
    sortOrder: 30,
  },
]

/** Ensures built-in rows exist; does not overwrite existing name/active/sort. */
export async function ensureDefaultPlatformNotificationRules(): Promise<void> {
  await prisma.platformNotificationRule.deleteMany({
    where: { eventKey: { in: [...DEPRECATED_EVENT_KEYS] } },
  })
  for (const d of DEFAULT_RULES) {
    await prisma.platformNotificationRule.upsert({
      where: { eventKey: d.eventKey },
      create: {
        eventKey: d.eventKey,
        eventName: d.eventName,
        triggerDescription: d.triggerDescription,
        isActive: d.isActive,
        sortOrder: d.sortOrder,
      },
      update: {},
    })
  }
}

export async function listPlatformNotificationRules() {
  await ensureDefaultPlatformNotificationRules()
  const data = await prisma.platformNotificationRule.findMany({
    orderBy: [{ sortOrder: 'asc' }, { eventName: 'asc' }],
  })
  const activeCount = data.filter(r => r.isActive).length
  const inactiveCount = data.length - activeCount
  return { data, activeCount, inactiveCount, total: data.length }
}

export async function getPlatformNotificationRuleById(id: string) {
  await ensureDefaultPlatformNotificationRules()
  return prisma.platformNotificationRule.findUnique({ where: { id } })
}

export async function createPlatformNotificationRule(input: {
  eventKey: string
  eventName: string
  triggerDescription: string
  isActive?: boolean
  sortOrder?: number
}) {
  const eventKey = input.eventKey.trim().toUpperCase().replace(/\s+/g, '_')
  return prisma.platformNotificationRule.create({
    data: {
      eventKey,
      eventName: input.eventName.trim(),
      triggerDescription: input.triggerDescription.trim(),
      isActive: input.isActive ?? true,
      sortOrder: input.sortOrder ?? 100,
    },
  })
}

export async function updatePlatformNotificationRule(
  id: string,
  input: {
    eventName?: string
    triggerDescription?: string
    isActive?: boolean
    sortOrder?: number
  }
) {
  return prisma.platformNotificationRule.update({
    where: { id },
    data: {
      ...(input.eventName !== undefined && { eventName: input.eventName.trim() }),
      ...(input.triggerDescription !== undefined && {
        triggerDescription: input.triggerDescription.trim(),
      }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
      ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
    },
  })
}

export async function deletePlatformNotificationRule(id: string) {
  await prisma.platformNotificationRule.delete({ where: { id } })
}

/**
 * Whether a platform automation should run for this event.
 * Unknown keys default to true so custom triggers stay enabled unless a row exists and is off.
 */
export async function isPlatformNotificationRuleActive(eventKey: string): Promise<boolean> {
  await ensureDefaultPlatformNotificationRules()
  const row = await prisma.platformNotificationRule.findUnique({
    where: { eventKey },
    select: { isActive: true },
  })
  if (!row) {
    return true
  }
  return row.isActive
}
