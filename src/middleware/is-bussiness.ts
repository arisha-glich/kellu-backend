import { createMiddleware } from 'hono/factory'
import * as HttpStatusCodes from 'stoker/http-status-codes'
import { HttpError } from '~/lib/error'
import { resolvePortalAccess } from '~/lib/portal-access'
import type { AppBindings } from '~/types'
export const isBusiness = createMiddleware<AppBindings>(async (c, next) => {
  const user = c.get('user')
  if (!user) {
    throw new HttpError('Unauthorized', HttpStatusCodes.UNAUTHORIZED)
  }
  const { businessPortalAccess } = await resolvePortalAccess(user.id)
  if (!businessPortalAccess) {
    throw new HttpError(
      'only business owner can create the clients and work orders',
      HttpStatusCodes.FORBIDDEN
    )
  }
  await next()
})
