import * as HttpStatusCodes from 'stoker/http-status-codes'
import { resolveAdminBusinessScope } from '~/routes/admin/_helpers'
import type { ADMIN_EXPENSE_ROUTES } from '~/routes/admin/expenses/admin-expense.routes'
import { getAdminExpensesDashboard } from '~/services/admin-expense.service'
import type { HandlerMapFromRoutes } from '~/types'

export const ADMIN_EXPENSE_HANDLER: HandlerMapFromRoutes<typeof ADMIN_EXPENSE_ROUTES> = {
  listDashboard: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const query = c.req.valid('query')
      const businessId = await resolveAdminBusinessScope(c, user)
      if (query.businessId && businessId !== query.businessId) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }

      const page = query.page ? Number.parseInt(query.page, 10) : 1
      const limit = query.limit ? Number.parseInt(query.limit, 10) : 20

      const data = await getAdminExpensesDashboard({
        businessId: query.businessId ?? businessId ?? undefined,
        category: query.category,
        status: query.status,
        search: query.search,
        page,
        limit,
      })

      return c.json(
        { message: 'Admin expenses retrieved successfully', success: true, data },
        HttpStatusCodes.OK
      )
    } catch (error) {
      console.error('Error fetching admin expenses:', error)
      return c.json(
        { message: 'Failed to retrieve admin expenses' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },
}
