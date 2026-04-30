import { cors } from 'hono/cors'
import { registerRoutes } from '~/app'
import { UserRole } from '~/generated/prisma'
import { auth } from '~/lib/auth'
import configureOpenAPI from '~/lib/configure-open-api'
import createApp from '~/lib/create-app'
import prisma from '~/lib/prisma'
import { triggerDueClientReminders } from '~/services/client.service'
import { registerEmailListeners } from '~/services/email-helpers'
import { createUserNotification } from '~/services/notifications.service'
import { ORIGINS } from './config/origins'
import type { AppBindings } from './types'

registerEmailListeners()
const CLIENT_REMINDER_TRIGGER_INTERVAL_MS = 60_000

void triggerDueClientReminders().catch(error => {
  console.error('[client-reminders] initial trigger check failed:', error)
})
setInterval(() => {
  void triggerDueClientReminders().catch(error => {
    console.error('[client-reminders] periodic trigger check failed:', error)
  })
}, CLIENT_REMINDER_TRIGGER_INTERVAL_MS)

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

function isSignInRequest(request: Request): boolean {
  if (request.method !== 'POST') {
    return false
  }
  const pathname = new URL(request.url).pathname
  return pathname.includes('/sign-in')
}

async function getSignInEmail(request: Request): Promise<string | null> {
  const body = (await request
    .clone()
    .json()
    .catch(() => null)) as { email?: string } | null
  const email = body?.email?.trim().toLowerCase()
  return email || null
}

async function notifyAdminsBusinessLoggedIn(email: string): Promise<void> {
  const signedInUser = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      role: true,
      adminPortalTeamMember: true,
      isOwner: true,
      businessesOwned: { select: { id: true, name: true } },
      teamMemberships: {
        where: { isActive: true },
        select: { business: { select: { id: true, name: true } } },
      },
    },
  })

  if (!signedInUser) {
    return
  }

  if (signedInUser.role === UserRole.SUPER_ADMIN || signedInUser.adminPortalTeamMember) {
    return
  }

  const ownedBusiness = signedInUser.businessesOwned[0] ?? null
  const memberBusiness = signedInUser.teamMemberships[0]?.business ?? null
  const business = ownedBusiness ?? memberBusiness
  if (!business) {
    return
  }

  const adminUsers = await prisma.user.findMany({
    where: { role: UserRole.SUPER_ADMIN, isActive: true },
    select: { id: true },
  })

  if (adminUsers.length === 0) {
    return
  }

  await Promise.all(
    adminUsers.map(adminUser =>
      createUserNotification({
        userId: adminUser.id,
        type: 'BUSINESS_LOGIN',
        title: 'Business Login',
        message: `${business.name} logged in to the business portal.`,
        metadata: {
          businessId: business.id,
          businessName: business.name,
          userId: signedInUser.id,
          email,
          isOwner: signedInUser.isOwner,
        },
      })
    )
  )
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
  const isLoginRequest = isSignInRequest(c.req.raw)
  const signInEmail = isLoginRequest ? await getSignInEmail(c.req.raw) : null
  if (await isInactiveBusinessLoginAttempt(c.req.raw)) {
    return c.json({ message: 'Your business account is inactive. Please contact support.' }, 403)
  }

  const response = await auth.handler(c.req.raw)
  if (isLoginRequest && signInEmail && response.ok) {
    try {
      await notifyAdminsBusinessLoggedIn(signInEmail)
    } catch (notificationError) {
      console.error('Failed to create admin notification for business login:', notificationError)
    }
  }
  return response
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
