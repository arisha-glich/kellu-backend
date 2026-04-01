import { UserRole } from '~/generated/prisma'
import prisma from '~/lib/prisma'
import { getBusinessIdByUserId } from '~/services/business.service'

export async function resolveAdminBusinessScope(
  c: { req: { query: (key: string) => string | undefined } },
  user: { id: string; role?: string }
): Promise<string | null> {
  const explicitBusinessId = c.req.query('businessId')?.trim()
  if (explicitBusinessId) {
    return explicitBusinessId
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { role: true, adminPortalTeamMember: true },
  })
  const isPrimarySuperAdmin =
    dbUser?.role === UserRole.SUPER_ADMIN && !dbUser?.adminPortalTeamMember

  if (isPrimarySuperAdmin) {
    const anyBusiness = await prisma.business.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    })
    return anyBusiness?.id ?? null
  }

  return getBusinessIdByUserId(user.id)
}
