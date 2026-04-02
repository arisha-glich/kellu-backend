// import { cors } from 'hono/cors'
// import { registerRoutes } from '~/app'
// import { auth } from '~/lib/auth'
// import configureOpenAPI from '~/lib/configure-open-api'
// import createApp from '~/lib/create-app'
// import { registerEmailListeners } from '~/services/email-helpers'
// import { ORIGINS } from './config/origins'

// registerEmailListeners()
// const app = createApp()

// // ✅ 1. CORS must be first — handles preflight OPTIONS before anything else
// app.use(
//   '*',
//   cors({
//     origin: origin => {
//       if (!origin) {
//         return null
//       }
//       return ORIGINS.includes(origin) ? origin : null
//     },
//     allowHeaders: ['Content-Type', 'Authorization'],
//     allowMethods: ['POST', 'GET', 'PATCH', 'DELETE', 'OPTIONS'],
//     exposeHeaders: ['Content-Length', 'Set-Cookie'],
//     maxAge: 600,
//     credentials: true,
//   })
// )

// // ✅ 2. Session middleware after CORS
// app.use('*', async (c, next) => {
//   const session = await auth.api.getSession({ headers: c.req.raw.headers })
//   if (!session) {
//     c.set('user', null)
//     c.set('session', null)
//     return next()
//   }
//   c.set('user', session.user as typeof session.user)
//   c.set(
//     'session',
//     (session as { user: typeof session.user; session?: typeof auth.$Infer.Session.session })
//       .session ?? null
//   )
//   return next()
// })

// // ✅ 3. Auth routes
// app.on(['POST', 'GET'], '/api/auth/*', c => {
//   return auth.handler(c.req.raw)
// })

// registerRoutes(app)
// configureOpenAPI(app)

// const port = Number(Bun.env.PORT ?? Bun.env.PORT_NO ?? 8080)

// console.log(`Auth reference available at http://localhost:${port}/api/auth/reference`)
// console.log(`API reference available at http://localhost:${port}/reference`)

// export default {
//   fetch: app.fetch,
//   port,
// }


import { cors } from 'hono/cors'
import { registerRoutes } from '~/app'
import { auth } from '~/lib/auth'
import configureOpenAPI from '~/lib/configure-open-api'
import createApp from '~/lib/create-app'
import { registerEmailListeners } from '~/services/email-helpers'
import { ORIGINS } from './config/origins'
import { AppBindings } from './types'

registerEmailListeners()
const app = createApp()

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
    allowHeaders: ['Content-Type', 'Authorization'],
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
 type AppUser=NonNullable<AppBindings['Variables']['user']>
  // Cast session.user to the concrete shape Hono's context expects.
  // The extra fields (permissions, isAdmin, isOwner) are present at runtime —
  // we just satisfy TypeScript's strict check on the core required fields.
  c.set(
    'user',
    session.user as AppUser
  )

  c.set(
    'session',
    (session as { user: typeof session.user; session?: typeof auth.$Infer.Session.session })
      .session ?? null
  )
  return next()
})

// ✅ 3. Auth routes
app.on(['POST', 'GET'], '/api/auth/*', c => {
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