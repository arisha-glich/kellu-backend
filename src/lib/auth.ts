import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { customSession, openAPI } from 'better-auth/plugins'
import { ORIGINS } from '~/config/origins'
import { UserRole } from '~/generated/prisma'
import prisma from '~/lib/prisma'

const PRODUCTION_BACKEND_ORIGIN = 'https://kellu-backend.onrender.com'

function resolveAuthSecret(): string {
  const fromEnv = Bun.env.BETTER_AUTH_SECRET?.trim()
  if (fromEnv) return fromEnv
  if (Bun.env.NODE_ENV === 'production') {
    throw new Error(
      'BETTER_AUTH_SECRET must be set in production (e.g. Render environment variables).',
    )
  }
  return 'kellu-local-dev-only-better-auth-secret-min-32-chars'
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
    defaultCookieAttributes: {
      sameSite: 'none',
      secure: true,
      httpOnly: true,
      domain: Bun.env.NODE_ENV === 'production' ? '.onrender.com' : undefined,
    },
    crossSubDomainCookies: {
      enabled: Bun.env.NODE_ENV === 'production',
      domain: Bun.env.NODE_ENV === 'production' ? '.onrender.com' : undefined,
    },
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
