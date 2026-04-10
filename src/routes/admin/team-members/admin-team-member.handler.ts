import * as HttpStatusCodes from 'stoker/http-status-codes'
import { RolePortalScope } from '~/generated/prisma'
import { resolveAdminBusinessScope } from '~/routes/admin/_helpers'
import type { ADMIN_TEAM_MEMBER_ROUTES } from '~/routes/admin/team-members/admin-team-member.routes'
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

export const ADMIN_TEAM_MEMBER_HANDLER: HandlerMapFromRoutes<typeof ADMIN_TEAM_MEMBER_ROUTES> = {
  list: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    const businessId = await resolveAdminBusinessScope(c, user)
    if (!businessId) {
      return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
    }
    const data = await listMembers(businessId, RolePortalScope.ADMIN_PORTAL)
    return c.json(
      { message: 'Team members retrieved successfully', success: true, data: { data } },
      HttpStatusCodes.OK
    )
  },
  getById: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await resolveAdminBusinessScope(c, user)
      if (!businessId) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      const { memberId } = c.req.valid('param')
      const member = await getMemberById(businessId, memberId, RolePortalScope.ADMIN_PORTAL)
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
      return c.json({ message: 'Failed to retrieve member' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
    }
  },
  add: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await resolveAdminBusinessScope(c, user)
      if (!businessId) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      const body = c.req.valid('json')
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
        portalType: 'admin',
      })
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
      return c.json({ message: 'Failed to add team member' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
    }
  },
  update: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await resolveAdminBusinessScope(c, user)
      if (!businessId) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      const { memberId } = c.req.valid('param')
      const body = c.req.valid('json')
      const member = await updateMember(businessId, memberId, {
        name: body.name,
        phoneNumber: body.phoneNumber,
        rut: body.rut,
        roleId: body.roleId,
        pictureUrl: body.pictureUrl,
        includeInNotificationsWhenAssigned: body.includeInNotificationsWhenAssigned,
        isActive: body.isActive,
        portalType: 'admin',
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
      const businessId = await resolveAdminBusinessScope(c, user)
      if (!businessId) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      const { memberId } = c.req.valid('param')
      await removeMember(businessId, memberId, RolePortalScope.ADMIN_PORTAL)
      return c.json(
        { message: 'Team member removed successfully', success: true, data: { deleted: true } },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof MemberNotFoundError) {
        return c.json({ message: 'Member not found' }, HttpStatusCodes.NOT_FOUND)
      }
      return c.json(
        { message: 'Failed to remove team member' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },
}
