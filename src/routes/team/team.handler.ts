/**
 * Team API handlers – business from authenticated user.
 */

import * as HttpStatusCodes from 'stoker/http-status-codes'
import { RolePortalScope } from '~/generated/prisma'
import type { TEAM_ROUTES } from '~/routes/team/team.routes'
import { createAuditLog } from '~/services/audit-log.service'
import { getBusinessIdByUserId } from '~/services/business.service'
import { createUserNotification, sendUserOperationEmail } from '~/services/notifications.service'
import {
  addMember,
  EmailAlreadyUsedError,
  getMemberById,
  listMembers,
  MemberNotFoundError,
  RoleNotFoundError,
  removeMember,
  updateMember,
} from '~/services/team.service'
import type { HandlerMapFromRoutes } from '~/types'

function getClientMeta(c: { req: { header: (k: string) => string | undefined } }) {
  const forwarded = c.req.header('x-forwarded-for')
  const ipAddress = forwarded?.split(',')[0]?.trim() || null
  const userAgent = c.req.header('user-agent') ?? null
  return { ipAddress, userAgent }
}

export const TEAM_HANDLER: HandlerMapFromRoutes<typeof TEAM_ROUTES> = {
  list: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }
      const data = await listMembers(businessId, RolePortalScope.BUSINESS_PORTAL)
      return c.json(
        { message: 'Team members retrieved successfully', success: true, data: { data } },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof Error && error.message === 'BUSINESS_NOT_FOUND') {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error listing team members:', error)
      return c.json(
        { message: 'Failed to retrieve team members' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  getById: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }
      const { memberId } = c.req.valid('param')
      const member = await getMemberById(businessId, memberId, RolePortalScope.BUSINESS_PORTAL)
      if (!member) {
        return c.json({ message: 'Member not found' }, HttpStatusCodes.NOT_FOUND)
      }
      return c.json(
        { message: 'Member retrieved successfully', success: true, data: member },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof MemberNotFoundError) {
        return c.json({ message: 'Member not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof Error && error.message === 'BUSINESS_NOT_FOUND') {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error fetching member:', error)
      return c.json({ message: 'Failed to retrieve member' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
    }
  },

  add: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }
      const body = await c.req.valid('json')
      const member = await addMember(businessId, {
        name: body.name,
        email: body.email,
        phoneNumber: body.phoneNumber,
        rut: body.rut,
        roleId: body.roleId,
        pictureUrl: body.pictureUrl,
        includeInNotificationsWhenAssigned: body.includeInNotificationsWhenAssigned,
        password: body.password,
        emailDescription: body.emailDescription,
        portalType: 'business',
      })
      const { ipAddress, userAgent } = getClientMeta(c)
      await createAuditLog({
        action: 'USER_CREATED',
        module: 'user',
        entityId: member.user.id,
        newValues: {
          id: member.user.id,
          email: member.user.email,
          name: member.user.name,
          memberId: member.id,
        },
        userId: user.id,
        businessId,
        ipAddress,
        userAgent,
      })
      try {
        await createUserNotification({
          userId: user.id,
          type: 'TEAM_MEMBER_CREATED',
          title: `You added a team member - ${member.user.name}`,
          message: `${member.user.email} - ${member.role.displayName ?? member.role.name}`,
          metadata: {
            memberId: member.id,
            memberName: member.user.name,
            memberEmail: member.user.email,
            roleId: member.role.id,
            roleName: member.role.displayName ?? member.role.name,
          },
        })
        await sendUserOperationEmail({
          to: user.email,
          userName: user.name,
          actionTitle: 'Team member added successfully',
          actionMessage: `Your team member "${member.user.name}" was added successfully.`,
        })
      } catch (notifyError) {
        console.error('Team member notification/email failed:', notifyError)
      }
      return c.json(
        { message: 'Team member added successfully', success: true, data: member },
        HttpStatusCodes.CREATED
      )
    } catch (error) {
      if (error instanceof RoleNotFoundError) {
        return c.json({ message: 'Role not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof EmailAlreadyUsedError) {
        return c.json(
          { message: 'A team member with this email already exists in this business' },
          HttpStatusCodes.BAD_REQUEST
        )
      }
      if (error instanceof Error && error.message === 'BUSINESS_NOT_FOUND') {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error adding team member:', error)
      return c.json({ message: 'Failed to add team member' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
    }
  },

  update: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }
      const { memberId } = c.req.valid('param')
      const body = await c.req.valid('json')
      const member = await updateMember(businessId, memberId, {
        name: body.name,
        phoneNumber: body.phoneNumber,
        rut: body.rut,
        roleId: body.roleId,
        pictureUrl: body.pictureUrl,
        includeInNotificationsWhenAssigned: body.includeInNotificationsWhenAssigned,
        isActive: body.isActive,
        portalType: 'business',
      })
      const { ipAddress, userAgent } = getClientMeta(c)
      await createAuditLog({
        action: 'USER_UPDATED',
        module: 'user',
        entityId: member.user.id,
        newValues: {
          id: member.user.id,
          email: member.user.email,
          name: member.user.name,
          memberId: member.id,
          isActive: member.isActive,
        },
        userId: user.id,
        businessId,
        ipAddress,
        userAgent,
      })
      return c.json(
        { message: 'Team member updated successfully', success: true, data: member },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof MemberNotFoundError) {
        return c.json({ message: 'Member not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof RoleNotFoundError) {
        return c.json({ message: 'Role not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof Error && error.message === 'BUSINESS_NOT_FOUND') {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error updating team member:', error)
      return c.json(
        { message: 'Failed to update team member' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  remove: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }
      const { memberId } = c.req.valid('param')
      await removeMember(businessId, memberId, RolePortalScope.BUSINESS_PORTAL)
      const { ipAddress, userAgent } = getClientMeta(c)
      await createAuditLog({
        action: 'USER_DELETED',
        module: 'user',
        entityId: memberId,
        userId: user.id,
        businessId,
        ipAddress,
        userAgent,
      })
      return c.json(
        { message: 'Team member removed successfully', success: true, data: { deleted: true } },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof MemberNotFoundError) {
        return c.json({ message: 'Member not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof Error && error.message === 'BUSINESS_NOT_FOUND') {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error removing team member:', error)
      return c.json(
        { message: 'Failed to remove team member' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },
}
