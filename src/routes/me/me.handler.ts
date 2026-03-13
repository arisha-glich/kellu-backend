/**
 * Current user context handler – for role/permission-based UI.
 */

import * as HttpStatusCodes from 'stoker/http-status-codes'
import type { ME_ROUTES } from '~/routes/me/me.routes'
import { getMeContext } from '~/services/me.service'
import type { HandlerMapFromRoutes } from '~/types'

export const ME_HANDLER: HandlerMapFromRoutes<typeof ME_ROUTES> = {
  context: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const data = await getMeContext(user.id)
      return c.json(
        { message: 'Context retrieved successfully', success: true, data },
        HttpStatusCodes.OK
      )
    } catch (error) {
      console.error('Error fetching me context:', error)
      return c.json(
        { message: 'Failed to retrieve context' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },
}
