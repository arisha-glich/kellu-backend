// /**
//  * Permission check for business members.
//  * - Business owner (userId === business.ownerId): full access (all resource:action allowed).
//  * - Team member: access only if their role has the matching Permission (RolePermission).
//  */

// import prisma from '~/lib/prisma'

// /**
//  * Returns true if the user is allowed to perform the given action on the resource
//  * in the context of the given business.
//  * - If the user is the business owner, returns true.
//  * - Otherwise, returns true only if the user's member role has a permission
//  *   with the given resource and action.
//  */
// export async function hasPermission(
//   userId: string,
//   businessId: string,
//   resource: string,
//   action: string
// ): Promise<boolean> {
//   const business = await prisma.business.findUnique({
//     where: { id: businessId },
//     select: { ownerId: true },
//   })
//   if (!business) {
//     return false
//   }
//   if (business.ownerId === userId) {
//     return true
//   }

//   const member = await prisma.member.findFirst({
//     where: { userId, businessId, isActive: true },
//     select: {
//       role: {
//         select: {
//           permissions: {
//             select: { permission: { select: { resource: true, action: true } } },
//           },
//         },
//       },
//     },
//   })
//   if (!member) {
//     return false
//   }

//   const allowed = member.role.permissions.some(
//     rp => rp.permission.resource === resource && rp.permission.action === action
//   )
//   return allowed
// }



import { UserRole } from '~/generated/prisma'
import { adminPortalAllows } from '~/lib/permission'
import prisma from '~/lib/prisma'

export async function hasPermission(
  userId: string,
  businessId: string,
  resource: string,
  action: string
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, adminPortalTeamMember: true },
  })

  // Primary SUPER_ADMIN with no Member row: business CRUD + read-only on business-scoped resources.
  if (user?.role === UserRole.SUPER_ADMIN && !user.adminPortalTeamMember) {
    const anyMembership = await prisma.member.findFirst({
      where: { userId, isActive: true },
      select: { id: true },
    })
    if (!anyMembership) {
      return adminPortalAllows(resource, action)
    }
  }

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { ownerId: true },
  })
  if (!business) {
    return false
  }
  // Actual business owner — full access; often has no Member row.
  if (business.ownerId === userId) {
    return true
  }

  const member = await prisma.member.findFirst({
    where: {
      userId,
      businessId,
      isActive: true,
    },
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

  if (!member) {
    return false
  }

  if (!member.role) {
    return false
  }

  return member.role.permissions.some(
    rp => rp.permission.resource === resource && rp.permission.action === action
  )
}