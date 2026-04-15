import * as HttpStatusCodes from 'stoker/http-status-codes'
import { UserRole } from '~/generated/prisma'
import prisma from '~/lib/prisma'
import type { ADMIN_WORKORDER_ROUTES } from '~/routes/admin/workorders/admin-workorder.routes'
import { getAdminWorkordersDashboard } from '~/services/admin-workorder.service'
import { getBusinessIdByUserId } from '~/services/business.service'
import type { HandlerMapFromRoutes } from '~/types'

async function resolveBusinessScopeForAdminPortal(
  userId: string,
  queryBusinessId?: string
): Promise<string | undefined | null> {
  if (queryBusinessId?.trim()) {
    return queryBusinessId.trim()
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, adminPortalTeamMember: true },
  })
  const isPrimarySuperAdmin =
    dbUser?.role === UserRole.SUPER_ADMIN && !dbUser?.adminPortalTeamMember
  if (isPrimarySuperAdmin) {
    return undefined
  }

  return getBusinessIdByUserId(userId)
}

export const ADMIN_WORKORDER_HANDLER: HandlerMapFromRoutes<typeof ADMIN_WORKORDER_ROUTES> = {
  listDashboard: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }

    try {
      const query = c.req.valid('query')
      const businessId = await resolveBusinessScopeForAdminPortal(user.id, query.businessId)
      if (businessId === null) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }

      const page = query.page ? Number.parseInt(query.page, 10) : 1
      const limit = query.limit ? Number.parseInt(query.limit, 10) : 10

      const data = await getAdminWorkordersDashboard({
        businessId: businessId ?? undefined,
        search: query.search,
        status: query.status,
        page,
        limit,
      })

      return c.json(
        { message: 'Admin workorders retrieved successfully', success: true, data },
        HttpStatusCodes.OK
      )
    } catch (error) {
      console.error('Error fetching admin workorders:', error)
      return c.json(
        { message: 'Failed to retrieve admin workorders' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },
}
