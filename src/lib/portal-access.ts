import { UserRole } from '~/generated/prisma'
import prisma from '~/lib/prisma'

/** Server-only checks (not exposed on session JSON). Mirrors logic in auth customSession. */
export async function resolvePortalAccess(userId: string): Promise<{
  adminPortalAccess: boolean
  businessPortalAccess: boolean
}> {
  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, adminPortalTeamMember: true },
  })
  const adminPortalTeamMember = dbUser?.adminPortalTeamMember ?? false
  const dbRole = (dbUser?.role as UserRole | undefined) ?? UserRole.BUSINESS_OWNER

  const activeMembership = await prisma.member.findFirst({
    where: { userId, isActive: true },
    select: { id: true },
  })

  const isPrimarySuperAdmin = dbRole === UserRole.SUPER_ADMIN && !adminPortalTeamMember
  const isAdminPortalTeamMember = adminPortalTeamMember && !!activeMembership

  return {
    adminPortalAccess: isPrimarySuperAdmin || isAdminPortalTeamMember,
    businessPortalAccess: dbRole === UserRole.BUSINESS_OWNER && !adminPortalTeamMember,
  }
}

/** Business app routes (`/api/*` tenant APIs): blocks admin primary + admin portal team members. */
export async function hasBusinessPortalAccess(userId: string): Promise<boolean> {
  const { businessPortalAccess } = await resolvePortalAccess(userId)
  return businessPortalAccess
}

/** Admin app routes (`/api/admin/*`): blocks pure business accounts. */
export async function hasAdminPortalAccess(userId: string): Promise<boolean> {
  const { adminPortalAccess } = await resolvePortalAccess(userId)
  return adminPortalAccess
}
