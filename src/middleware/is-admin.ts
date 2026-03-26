import { createMiddleware } from 'hono/factory'
import * as HttpStatusCodes from 'stoker/http-status-codes'
import { UserRole } from '~/generated/prisma'
import { HttpError } from '~/lib/error'
import type { AppBindings } from '~/types'
export const isAdmin = createMiddleware<AppBindings>(async (c, next) => {
  const user = c.get('user')
  if (!user) {
    throw new HttpError('Unauthorized', HttpStatusCodes.UNAUTHORIZED)
  }
  if (user.role !== UserRole.SUPER_ADMIN) {
    throw new HttpError('only super admins can access this resource', HttpStatusCodes.FORBIDDEN)
  }
  await next()
})
