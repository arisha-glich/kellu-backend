import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { customSession, openAPI } from 'better-auth/plugins'
import { ORIGINS } from '~/config/origins'
import { UserRole } from '~/generated/prisma'
import prisma from '~/lib/prisma'

const PRODUCTION_BACKEND_ORIGIN = 'https://api.kellu.co'

/** Not Better Auth's built-in default — only used when BETTER_AUTH_SECRET is unset (insecure if public). */
const INSECURE_FALLBACK_SECRET =
  'kellu-fallback-auth-secret-set-BETTER_AUTH_SECRET-env-min-length-48'

function resolveAuthSecret(): string {
  const fromEnv = Bun.env.BETTER_AUTH_SECRET?.trim()
  if (fromEnv) return fromEnv
  if (Bun.env.NODE_ENV === 'production') {
    console.warn(
      '[better-auth] BETTER_AUTH_SECRET is missing — using a source-visible fallback. Set BETTER_AUTH_SECRET on the host for real deployments.',
    )
  }
  return INSECURE_FALLBACK_SECRET
}

export const auth = betterAuth({
  secret: resolveAuthSecret(),
  emailAndPassword: {
    enabled: true,
  },
  trustedOrigins: [
    ...ORIGINS,
    'http://localhost:8000',
    'http://localhost:8080',
    PRODUCTION_BACKEND_ORIGIN,
  ],
  advanced: {
    // kelluproject.kellu.co → api.kellu.co is same-site (eTLD+1: kellu.co); Lax + host-only API cookies work.
    defaultCookieAttributes: {
      sameSite: 'lax',
      secure: Bun.env.NODE_ENV === 'production',
      httpOnly: true,
    },
    useSecureCookies: Bun.env.NODE_ENV === 'production',
  },
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  user: {
    additionalFields: {
      role: {
        type: 'string',
        required: false,
        default: UserRole.BUSINESS_OWNER,
        input: false,
      },
    },
  },
  plugins: [
    customSession(async ({ user }) => {
      const dbUser = await prisma.user.findUnique({
        where: {
          id: user.id,
        },
        select: {
          role: true,
        },
      })
      return {
        user: {
          ...user,
          role: dbUser?.role as UserRole,
        },
      }
    }),
    openAPI({
      theme: 'kepler',
    }),
  ],
})
