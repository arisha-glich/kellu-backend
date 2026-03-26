import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { customSession, openAPI } from 'better-auth/plugins'
import { ORIGINS } from '~/config/origins'
import { UserRole } from '~/generated/prisma'
import prisma from '~/lib/prisma'

const PRODUCTION_BACKEND_ORIGIN = 'https://kellu-backend.onrender.com'

export const auth = betterAuth({
  emailAndPassword: {
    enabled: true,
  },
  trustedOrigins: [...ORIGINS, 'http://localhost:8000', PRODUCTION_BACKEND_ORIGIN],
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
