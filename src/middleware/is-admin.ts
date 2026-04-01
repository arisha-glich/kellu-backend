import { createMiddleware } from 'hono/factory'
import * as HttpStatusCodes from 'stoker/http-status-codes'
import { HttpError } from '~/lib/error'
import { resolvePortalAccess } from '~/lib/portal-access'
import type { AppBindings } from '~/types'
export const isAdmin = createMiddleware<AppBindings>(async (c, next) => {
  const user = c.get('user')
  if (!user) {
    throw new HttpError('Unauthorized', HttpStatusCodes.UNAUTHORIZED)
  }
  const { adminPortalAccess } = await resolvePortalAccess(user.id)
  if (!adminPortalAccess) {
    throw new HttpError('only super admins can access this resource', HttpStatusCodes.FORBIDDEN)
  }
  await next()
})
