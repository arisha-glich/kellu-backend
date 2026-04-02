import prisma from '~/lib/prisma'

export async function getOrCreatePlatformSettings() {
  const existing = await prisma.platformSettings.findFirst({ orderBy: { createdAt: 'asc' } })
  if (existing) {
    return existing
  }
  return prisma.platformSettings.create({
    data: {},
  })
}

export async function getEmailForwardingSettings() {
  const s = await getOrCreatePlatformSettings()
  return {
    clientEmailCopyEnabled: s.clientEmailCopyEnabled,
    clientEmailCopyTo: s.clientEmailCopyTo,
  }
}

export async function updateEmailForwardingSettings(input: {
  clientEmailCopyEnabled?: boolean
  clientEmailCopyTo?: string | null
}) {
  const s = await getOrCreatePlatformSettings()
  return prisma.platformSettings.update({
    where: { id: s.id },
    data: {
      ...(input.clientEmailCopyEnabled !== undefined && {
        clientEmailCopyEnabled: input.clientEmailCopyEnabled,
      }),
      ...(input.clientEmailCopyTo !== undefined && {
        clientEmailCopyTo: input.clientEmailCopyTo?.trim() || null,
      }),
    },
    select: {
      clientEmailCopyEnabled: true,
      clientEmailCopyTo: true,
    },
  })
}

/** BCC address for business → customer emails when platform copy is enabled. */
export async function resolveClientEmailCopyBcc(): Promise<string | undefined> {
  const s = await prisma.platformSettings.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { clientEmailCopyEnabled: true, clientEmailCopyTo: true },
  })
  if (!s?.clientEmailCopyEnabled) {
    return undefined
  }
  const addr = s.clientEmailCopyTo?.trim()
  if (!addr || !addr.includes('@')) {
    return undefined
  }
  return addr.toLowerCase()
}
