/**
 * Team Management – §11.1.
 * List members, add team member (name, email, phone, RUT, role, picture, includeInNotifications, password), update, remove.
 * When a new member is created, an email is sent with login credentials and an optional description.
 *
 * isOwner flag:
 *   - true  = actual business owner (UserRole.BUSINESS_OWNER, has Business record)
 *   - false = team member         (UserRole.BUSINESS_OWNER enum, but isOwner = false)
 * Both share the same UserRole enum value so they can log in the same way,
 * but isOwner distinguishes them at query level without adding a third enum value.
 */

import { hashPassword } from 'better-auth/crypto'
import { UserRole } from '~/generated/prisma'
import prisma from '~/lib/prisma'
import { sendTeamMemberInvitationEmail } from '~/services/email-helpers'

export class BusinessNotFoundError extends Error {
  constructor() {
    super('BUSINESS_NOT_FOUND')
  }
}

export class MemberNotFoundError extends Error {
  constructor() {
    super('MEMBER_NOT_FOUND')
  }
}

export class RoleNotFoundError extends Error {
  constructor() {
    super('ROLE_NOT_FOUND')
  }
}

export class EmailAlreadyUsedError extends Error {
  constructor() {
    super('EMAIL_ALREADY_USED')
  }
}

export class InvalidOperationError extends Error {}

export interface MemberWithUserAndRole {
  id: string
  isActive: boolean
  includeInNotificationsWhenAssigned: boolean
  createdAt: Date
  updatedAt: Date
  userId: string
  businessId: string
  roleId: string
  user: {
    id: string
    name: string
    email: string
    phone_no: string | null
    rut: string | null
    image: string | null
    isOwner: boolean
  }
  role: {
    id: string
    name: string
    displayName: string | null
  }
}

export interface AddMemberInput {
  name: string
  email: string
  phoneNumber: string
  rut?: string | null
  roleId: string
  pictureUrl?: string | null
  includeInNotificationsWhenAssigned?: boolean
  password: string
  /** Optional description included in the invitation email (e.g. role summary, what the member can do). */
  emailDescription?: string | null
}

export interface UpdateMemberInput {
  name?: string
  phoneNumber?: string
  rut?: string | null
  roleId?: string
  pictureUrl?: string | null
  includeInNotificationsWhenAssigned?: boolean
  isActive?: boolean
}

async function ensureBusinessExists(businessId: string): Promise<void> {
  const b = await prisma.business.findUnique({ where: { id: businessId }, select: { id: true } })
  if (!b) {
    throw new BusinessNotFoundError()
  }
}

/** List team members for the business — excludes the business owner. */
export async function listMembers(businessId: string): Promise<MemberWithUserAndRole[]> {
  await ensureBusinessExists(businessId)
  const members = await prisma.member.findMany({
    where: {
      businessId,
      user: { isOwner: false }, // ✅ only team members, never the business owner
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phone_no: true,
          rut: true,
          image: true,
          isOwner: true,
        },
      },
      role: {
        select: {
          id: true,
          name: true,
          displayName: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })
  return members as MemberWithUserAndRole[]
}

/** Get a single member by ID (must belong to business). */
export async function getMemberById(
  businessId: string,
  memberId: string
): Promise<MemberWithUserAndRole | null> {
  const member = await prisma.member.findFirst({
    where: { id: memberId, businessId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phone_no: true,
          rut: true,
          image: true,
          isOwner: true,
        },
      },
      role: {
        select: {
          id: true,
          name: true,
          displayName: true,
        },
      },
    },
  })
  return member as MemberWithUserAndRole | null
}

/** Add a team member: creates User (with isOwner=false), Account (credential), and Member. */
export async function addMember(
  businessId: string,
  input: AddMemberInput
): Promise<MemberWithUserAndRole> {
  await ensureBusinessExists(businessId)

  const role = await prisma.role.findFirst({
    where: { id: input.roleId, businessId },
    select: { id: true },
  })
  if (!role) {
    throw new RoleNotFoundError()
  }

  // Check if a user with this email already exists
  const existingUser = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true, role: true, isOwner: true },
  })

  if (existingUser) {
    // Block: super admins cannot be added as team members
    if (existingUser.role === UserRole.SUPER_ADMIN) {
      throw new InvalidOperationError('Cannot add a super admin as a team member')
    }

    // Block: the actual business owner of THIS business cannot be re-added
    if (existingUser.isOwner) {
      const ownsThisBusiness = await prisma.business.findFirst({
        where: { id: businessId, ownerId: existingUser.id },
        select: { id: true },
      })
      if (ownsThisBusiness) {
        throw new InvalidOperationError(
          'This user is the owner of this business and cannot be added as a team member'
        )
      }
    }

    // Check if already a member of this business
    const existingMember = await prisma.member.findUnique({
      where: { userId_businessId: { userId: existingUser.id, businessId } },
      select: { id: true },
    })
    if (existingMember) {
      throw new EmailAlreadyUsedError()
    }

    // User exists but not yet in this business — add as member only (no new user created)
    const member = await prisma.member.create({
      data: {
        businessId,
        userId: existingUser.id,
        roleId: input.roleId,
        includeInNotificationsWhenAssigned: input.includeInNotificationsWhenAssigned ?? true,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone_no: true,
            rut: true,
            image: true,
            isOwner: true,
          },
        },
        role: {
          select: {
            id: true,
            name: true,
            displayName: true,
          },
        },
      },
    })
    return member as MemberWithUserAndRole
  }

  // New user — create User + Account + Member inside a transaction
  const member = await prisma.$transaction(async tx => {
    const hashedPassword = await hashPassword(input.password)

    const newUser = await tx.user.create({
      data: {
        name: input.name,
        email: input.email,
        phone_no: input.phoneNumber,
        rut: input.rut ?? null,
        image: input.pictureUrl ?? null,
        role: UserRole.BUSINESS_OWNER, // same enum — allows login through the same auth flow
        isOwner: false, // ✅ distinguishes them from an actual business owner
      },
    })

    await tx.account.create({
      data: {
        userId: newUser.id,
        accountId: newUser.id,
        providerId: 'credential',
        password: hashedPassword,
      },
    })

    const newMember = await tx.member.create({
      data: {
        businessId,
        userId: newUser.id,
        roleId: input.roleId,
        includeInNotificationsWhenAssigned: input.includeInNotificationsWhenAssigned ?? true,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone_no: true,
            rut: true,
            image: true,
            isOwner: true,
          },
        },
        role: {
          select: {
            id: true,
            name: true,
            displayName: true,
          },
        },
      },
    })

    return newMember
  })

  // Send invitation email with login credentials, dashboard link, and role permissions
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { name: true },
  })
  const roleWithPermissions = await prisma.role.findUnique({
    where: { id: member.roleId },
    select: {
      displayName: true,
      name: true,
      permissions: {
        select: { permission: { select: { resource: true, action: true } } },
      },
    },
  })
  const roleName = roleWithPermissions?.displayName ?? roleWithPermissions?.name ?? member.role.name
  const permissions =
    roleWithPermissions?.permissions.map(rp => ({
      resource: rp.permission.resource,
      action: rp.permission.action,
    })) ?? []

  try {
    await sendTeamMemberInvitationEmail({
      to: input.email,
      memberName: input.name,
      businessName: business?.name ?? 'Your company',
      roleName,
      email: input.email,
      password: input.password,
      description: input.emailDescription ?? undefined,
      permissions,
    })
  } catch (err) {
    console.error('Failed to send team member invitation email:', err)
    // Do not fail the request — member was created successfully
  }

  return member as MemberWithUserAndRole
}

/** Update team member (user fields and/or member role / includeInNotifications). */
export async function updateMember(
  businessId: string,
  memberId: string,
  input: UpdateMemberInput
): Promise<MemberWithUserAndRole> {
  await ensureBusinessExists(businessId)

  const member = await prisma.member.findFirst({
    where: {
      id: memberId,
      businessId,
      user: { isOwner: false }, // ✅ prevent updating the business owner through this endpoint
    },
    include: { user: { select: { id: true } } },
  })
  if (!member) {
    throw new MemberNotFoundError()
  }

  if (input.roleId !== undefined) {
    const role = await prisma.role.findFirst({
      where: { id: input.roleId, businessId },
      select: { id: true },
    })
    if (!role) {
      throw new RoleNotFoundError()
    }
  }

  await prisma.$transaction(async tx => {
    // Update user profile fields if any provided
    const userData: {
      name?: string
      phone_no?: string
      rut?: string | null
      image?: string | null
    } = {}
    if (input.name !== undefined) {
      userData.name = input.name
    }
    if (input.phoneNumber !== undefined) {
      userData.phone_no = input.phoneNumber
    }
    if (input.rut !== undefined) {
      userData.rut = input.rut
    }
    if (input.pictureUrl !== undefined) {
      userData.image = input.pictureUrl
    }

    if (Object.keys(userData).length > 0) {
      await tx.user.update({
        where: { id: member.user.id },
        data: userData,
      })
    }

    // Update member fields
    const memberData: {
      roleId?: string
      includeInNotificationsWhenAssigned?: boolean
      isActive?: boolean
    } = {}
    if (input.roleId !== undefined) {
      memberData.roleId = input.roleId
    }
    if (input.includeInNotificationsWhenAssigned !== undefined) {
      memberData.includeInNotificationsWhenAssigned = input.includeInNotificationsWhenAssigned
    }
    if (input.isActive !== undefined) {
      memberData.isActive = input.isActive
    }

    if (Object.keys(memberData).length > 0) {
      await tx.member.update({
        where: { id: memberId },
        data: memberData,
      })
    }
  })

  const updated = await getMemberById(businessId, memberId)
  if (!updated) {
    throw new MemberNotFoundError()
  }
  return updated
}

/** Remove team member from business (deletes Member record; User account is preserved). */
export async function removeMember(businessId: string, memberId: string): Promise<void> {
  await ensureBusinessExists(businessId)

  const member = await prisma.member.findFirst({
    where: { id: memberId, businessId },
    select: { id: true, user: { select: { isOwner: true } } },
  })
  if (!member) {
    throw new MemberNotFoundError()
  }

  // Safety guard: never allow removing the business owner via this endpoint
  if (member.user.isOwner) {
    throw new InvalidOperationError('Cannot remove the business owner from the team')
  }

  await prisma.member.delete({ where: { id: memberId } })
  // Note: User account is intentionally preserved — they may belong to other businesses
}
