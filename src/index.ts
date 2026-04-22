import { cors } from 'hono/cors'
import { registerRoutes } from '~/app'
import { auth } from '~/lib/auth'
import configureOpenAPI from '~/lib/configure-open-api'
import createApp from '~/lib/create-app'
import prisma from '~/lib/prisma'
import { registerEmailListeners } from '~/services/email-helpers'
import { ORIGINS } from './config/origins'
import type { AppBindings } from './types'

registerEmailListeners()
const app = createApp()

async function isInactiveBusinessLoginAttempt(request: Request): Promise<boolean> {
  if (request.method !== 'POST') {
    return false
  }

  const pathname = new URL(request.url).pathname
  if (!pathname.includes('/sign-in')) {
    return false
  }

  const body = (await request
    .clone()
    .json()
    .catch(() => null)) as { email?: string } | null
  const email = body?.email?.trim().toLowerCase()
  if (!email) {
    return false
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      role: true,
      adminPortalTeamMember: true,
      businessesOwned: { select: { id: true, isActive: true } },
      teamMemberships: {
        where: { isActive: true },
        select: { business: { select: { id: true, isActive: true } } },
      },
    },
  })

  if (!user) {
    return false
  }

  // Super admins and admin-portal team users are never blocked by business state.
  if (user.role === 'SUPER_ADMIN' || user.adminPortalTeamMember) {
    return false
  }

  const hasInactiveOwnedBusiness = user.businessesOwned.some(b => !b.isActive)
  const hasInactiveTeamBusiness = user.teamMemberships.some(m => !m.business.isActive)

  return hasInactiveOwnedBusiness || hasInactiveTeamBusiness
}

// ✅ 1. CORS must be first — handles preflight OPTIONS before anything else
app.use(
  '*',
  cors({
    origin: origin => {
      if (!origin) {
        return null
      }
      return ORIGINS.includes(origin) ? origin : null
    },
    allowHeaders: ['Content-Type', 'Authorization', 'x-quote-token'],
    allowMethods: ['POST', 'GET', 'PATCH', 'DELETE', 'OPTIONS'],
    exposeHeaders: ['Content-Length', 'Set-Cookie'],
    maxAge: 600,
    credentials: true,
  })
)

// ✅ 2. Session middleware after CORS
app.use('*', async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session) {
    c.set('user', null)
    c.set('session', null)
    return next()
  }
  type AppUser = NonNullable<AppBindings['Variables']['user']>
  // Cast session.user to the concrete shape Hono's context expects.
  // The extra fields (permissions, isAdmin, isOwner) are present at runtime —
  // we just satisfy TypeScript's strict check on the core required fields.
  c.set('user', session.user as AppUser)

  c.set(
    'session',
    (session as { user: typeof session.user; session?: typeof auth.$Infer.Session.session })
      .session ?? null
  )
  return next()
})

// ✅ 3. Auth routes
app.on(['POST', 'GET'], '/api/auth/*', async c => {
  if (await isInactiveBusinessLoginAttempt(c.req.raw)) {
    return c.json(
      { message: 'Your business account is inactive. Please contact support.' },
      403
    )
  }

  return auth.handler(c.req.raw)
})

registerRoutes(app)
configureOpenAPI(app)

const port = Number(Bun.env.PORT ?? Bun.env.PORT_NO ?? 8080)

console.log(`Auth reference available at http://localhost:${port}/api/auth/reference`)
console.log(`API reference available at http://localhost:${port}/reference`)

export default {
  fetch: app.fetch,
  port,
}
