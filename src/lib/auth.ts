import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { customSession, openAPI } from 'better-auth/plugins'
import { ORIGINS } from '~/config/origins'
import { UserRole } from '~/generated/prisma'
import prisma from '~/lib/prisma'

export const auth = betterAuth({
  emailAndPassword: {
    enabled: true,
  },
  trustedOrigins: [...ORIGINS, 'http://localhost:8000'],
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
