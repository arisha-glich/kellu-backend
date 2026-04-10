import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { customSession, openAPI } from 'better-auth/plugins'
import { ORIGINS } from '~/config/origins'
import { UserRole } from '~/generated/prisma'
import {
  buildAdminPortalSessionPermissions,
  buildBusinessOwnerSessionPermissions,
  type PermissionPair,
  statement,
} from '~/lib/permission'
import prisma from '~/lib/prisma'

const PRODUCTION_BACKEND_ORIGIN = 'https://api.kellu.co'

const INSECURE_FALLBACK_SECRET =
  'kellu-fallback-auth-secret-set-BETTER_AUTH_SECRET-env-min-length-48'

function resolveAuthSecret(): string {
  const fromEnv = Bun.env.BETTER_AUTH_SECRET?.trim()
  if (fromEnv) {
    return fromEnv
  }
  if (Bun.env.NODE_ENV === 'production') {
    console.warn(
      '[better-auth] BETTER_AUTH_SECRET is missing — using a source-visible fallback. Set BETTER_AUTH_SECRET on the host for real deployments.'
    )
  }
  return INSECURE_FALLBACK_SECRET
}

function allPermissionsFromStatement(): PermissionPair[] {
  return Object.entries(statement).flatMap(([resource, actions]) =>
    (actions as readonly string[]).map(action => ({ resource, action }))
  )
}

async function resolveUserPermissions(
  userId: string,
  fullCatalog: boolean
): Promise<PermissionPair[]> {
  if (fullCatalog) {
    return allPermissionsFromStatement()
  }

  const membership = await prisma.member.findFirst({
    where: { userId, isActive: true },
    select: {
      role: {
        select: {
          permissions: {
            select: {
              permission: {
                select: { resource: true, action: true },
              },
            },
          },
        },
      },
    },
  })

  if (!membership) {
    return []
  }

  return membership.role.permissions.map(rp => ({
    resource: rp.permission.resource,
    action: rp.permission.action,
  }))
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
      domain: Bun.env.NODE_ENV === 'production' ? '.kellu.co' : undefined,
    },
    crossSubDomainCookies: {
      enabled: Bun.env.NODE_ENV === 'production',
      domain: Bun.env.NODE_ENV === 'production' ? '.kellu.co' : undefined,
    },
    useSecureCookies: true,
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
      isOwner: {
        type: 'boolean',
        required: false,
        default: false,
        input: false,
      },
      adminPortalTeamMember: {
        type: 'boolean',
        required: false,
        default: false,
        input: false,
      },
    },
  },
  plugins: [
    customSession(async ({ user }) => {
      const { adminPortalTeamMember: _strippedFromSession, ...userWithoutPortalTeamFlag } =
        user as typeof user & {
          adminPortalTeamMember?: boolean
        }

      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { role: true, isOwner: true, adminPortalTeamMember: true },
      })
      const dbRole = (dbUser?.role as UserRole | undefined) ?? UserRole.BUSINESS_OWNER
      const dbIsOwner = dbUser?.isOwner ?? false
      const adminPortalTeamMember = dbUser?.adminPortalTeamMember ?? false

      const activeMembership = await prisma.member.findFirst({
        where: { userId: user.id, isActive: true },
        select: { id: true },
      })

      const isPrimarySuperAdmin = dbRole === UserRole.SUPER_ADMIN && !adminPortalTeamMember
      const isAdminPortalTeamMember = adminPortalTeamMember && !!activeMembership

      const sessionRole =
        isPrimarySuperAdmin || isAdminPortalTeamMember
          ? UserRole.SUPER_ADMIN
          : UserRole.BUSINESS_OWNER

      /** Matrix is only for primary super admin without business membership. */
      const useAdminPortalSessionMatrix = isPrimarySuperAdmin && !activeMembership

      let rawPermissions: PermissionPair[]
      if (useAdminPortalSessionMatrix) {
        rawPermissions = buildAdminPortalSessionPermissions()
      } else if (isPrimarySuperAdmin || isAdminPortalTeamMember) {
        rawPermissions = await resolveUserPermissions(user.id, true)
      } else if (dbRole === UserRole.BUSINESS_OWNER && dbIsOwner) {
        rawPermissions = buildBusinessOwnerSessionPermissions()
      } else {
        rawPermissions = await resolveUserPermissions(user.id, false)
      }

      const permissions = rawPermissions

      if (isPrimarySuperAdmin || isAdminPortalTeamMember) {
        return {
          user: {
            ...userWithoutPortalTeamFlag,
            role: sessionRole,
            permissions,
            isAdmin: isPrimarySuperAdmin,
            isOwner: false,
          } as typeof user & {
            permissions: PermissionPair[]
            isAdmin: boolean
            isOwner: boolean
          },
        }
      }

      return {
        user: {
          ...userWithoutPortalTeamFlag,
          role: UserRole.BUSINESS_OWNER,
          permissions,
          isOwner: dbIsOwner,
          isAdmin: false,
        } as typeof user & {
          permissions: PermissionPair[]
          isOwner: boolean
          isAdmin: boolean
        },
      }
    }),
    openAPI({ theme: 'kepler' }),
  ],
})
