import { createMiddleware } from 'hono/factory'
import * as HttpStatusCodes from 'stoker/http-status-codes'
import { UserRole } from '~/generated/prisma'
import { HttpError } from '~/lib/error'
import type { AppBindings } from '~/types'
export const isBusiness = createMiddleware<AppBindings>(async (c, next) => {
  const user = c.get('user')
  if (!user) {
    throw new HttpError('Unauthorized', HttpStatusCodes.UNAUTHORIZED)
  }
  if (user.role !== UserRole.BUSINESS_OWNER) {
    throw new HttpError(
      'only business owner can create the clients and work orders',
      HttpStatusCodes.FORBIDDEN
    )
  }
  await next()
})
