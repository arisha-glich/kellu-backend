import * as HttpStatusCodes from 'stoker/http-status-codes'
import type { ROLE_ROUTES } from '~/routes/roles/role.routes'
import { BusinessNotFoundError, getBusinessIdByUserId } from '~/services/business.service'
import {
  createRole,
  deleteRole,
  getAllActions,
  getPermissionMatrix,
  getRoleById,
  InvalidPermissionError,
  listRoles,
  RoleInUseError,
  RoleNotFoundError,
  updateRole,
} from '~/services/role.service'
import { createAuditLog } from '~/services/audit-log.service'
import { hasBusinessPortalAccess } from '~/lib/portal-access'
import type { HandlerMapFromRoutes } from '~/types'
import { Prisma, RolePortalScope, UserRole } from '~/generated/prisma'

const FORBIDDEN_BUSINESS_PORTAL_ONLY =
  'This endpoint is only for business portal accounts. Admin users must use /api/admin/roles.'

function getClientMeta(c: { req: { header: (k: string) => string | undefined } }) {
  const forwarded = c.req.header('x-forwarded-for')
  const ipAddress = forwarded?.split(',')[0]?.trim() || null
  const userAgent = c.req.header('user-agent') ?? null
  return { ipAddress, userAgent }
}

export const ROLE_HANDLER: HandlerMapFromRoutes<typeof ROLE_ROUTES> = {
  list: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    if (!(await hasBusinessPortalAccess(user.id))) {
      return c.json({ message: FORBIDDEN_BUSINESS_PORTAL_ONLY }, HttpStatusCodes.FORBIDDEN)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      const roles = await listRoles(businessId, RolePortalScope.BUSINESS_PORTAL)
      return c.json(
        { message: 'Roles retrieved successfully', success: true, data: roles },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error listing roles:', error)
      return c.json({ message: 'Failed to retrieve roles' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
    }
  },

  getPermissionMatrix: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    if (!(await hasBusinessPortalAccess(user.id))) {
      return c.json({ message: FORBIDDEN_BUSINESS_PORTAL_ONLY }, HttpStatusCodes.FORBIDDEN)
    }
    const matrix = getPermissionMatrix()
    let filteredMatrix = matrix.filter(
      item =>
        item.resource !== 'user' &&
        item.resource !== 'users' &&
        item.resource !== 'session' &&
        item.resource !== 'sessions'
    )

    const sessionUser = user as typeof user & { isOwner?: boolean }
    const isPrimaryBusinessOwner =
      user.role === UserRole.BUSINESS_OWNER && sessionUser.isOwner === true
    if (isPrimaryBusinessOwner) {
      filteredMatrix = filteredMatrix.filter(item => item.resource !== 'business')
      filteredMatrix = [{ resource: 'user', actions: ['read'] }, ...filteredMatrix]
    }

    return c.json(
      { message: 'Permission matrix retrieved', success: true, data: filteredMatrix },
      HttpStatusCodes.OK
    )
  },

  getPermissionActions: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    if (!(await hasBusinessPortalAccess(user.id))) {
      return c.json({ message: FORBIDDEN_BUSINESS_PORTAL_ONLY }, HttpStatusCodes.FORBIDDEN)
    }
    const actions = getAllActions()
    return c.json(
      { message: 'Permission actions retrieved', success: true, data: actions },
      HttpStatusCodes.OK
    )
  },

  getById: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    if (!(await hasBusinessPortalAccess(user.id))) {
      return c.json({ message: FORBIDDEN_BUSINESS_PORTAL_ONLY }, HttpStatusCodes.FORBIDDEN)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      const { roleId } = c.req.valid('param')
      const role = await getRoleById(businessId, roleId, RolePortalScope.BUSINESS_PORTAL)
      return c.json(
        { message: 'Role retrieved successfully', success: true, data: role },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof RoleNotFoundError) {
        return c.json({ message: 'Role not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error fetching role:', error)
      return c.json({ message: 'Failed to retrieve role' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
    }
  },

  create: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    if (!(await hasBusinessPortalAccess(user.id))) {
      return c.json({ message: FORBIDDEN_BUSINESS_PORTAL_ONLY }, HttpStatusCodes.FORBIDDEN)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      const body = c.req.valid('json')
      const role = await createRole(
        businessId,
        {
          name: body.name,
          displayName: body.displayName ?? undefined,
          description: body.description ?? undefined,
          permissions: body.permissions,
        },
        RolePortalScope.BUSINESS_PORTAL
      )
      if (role) {
        const { ipAddress, userAgent } = getClientMeta(c)
        await createAuditLog({
          action: 'ROLE_CREATED',
          module: 'roles',
          entityId: role.id,
          newValues: {
            roleId: role.id,
            name: role.name,
            portalScope: 'BUSINESS_PORTAL',
          },
          userId: user.id,
          businessId,
          ipAddress,
          userAgent,
        })
      }
      return c.json(
        { message: 'Role created successfully', success: true, data: role },
        HttpStatusCodes.CREATED
      )
    } catch (error:any) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return c.json({ message: 'Role name already exists' }, HttpStatusCodes.CONFLICT)
      }
      if (error instanceof InvalidPermissionError) {
        return c.json({ message: error.message }, HttpStatusCodes.BAD_REQUEST)
      }
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error creating role:', error)
      return c.json({ message: 'Failed to create role' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
    }
  },

  update: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    if (!(await hasBusinessPortalAccess(user.id))) {
      return c.json({ message: FORBIDDEN_BUSINESS_PORTAL_ONLY }, HttpStatusCodes.FORBIDDEN)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      const { roleId } = c.req.valid('param')
      const body = c.req.valid('json')
      const role = await updateRole(
        businessId,
        roleId,
        {
          name: body.name ?? undefined,
          displayName: body.displayName ?? undefined,
          description: body.description ?? undefined,
          permissions: body.permissions ?? undefined,
        },
        RolePortalScope.BUSINESS_PORTAL
      )
      if (role) {
        const { ipAddress, userAgent } = getClientMeta(c)
        await createAuditLog({
          action: 'ROLE_UPDATED',
          module: 'roles',
          entityId: role.id,
          newValues: {
            roleId: role.id,
            name: role.name,
            portalScope: 'BUSINESS_PORTAL',
          },
          userId: user.id,
          businessId,
          ipAddress,
          userAgent,
        })
      }
      return c.json(
        { message: 'Role updated successfully', success: true, data: role },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof RoleNotFoundError) {
        return c.json({ message: 'Role not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof InvalidPermissionError) {
        return c.json({ message: error.message }, HttpStatusCodes.BAD_REQUEST)
      }
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error updating role:', error)
      return c.json({ message: 'Failed to update role' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
    }
  },

  delete: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    if (!(await hasBusinessPortalAccess(user.id))) {
      return c.json({ message: FORBIDDEN_BUSINESS_PORTAL_ONLY }, HttpStatusCodes.FORBIDDEN)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      const { roleId } = c.req.valid('param')
      await deleteRole(businessId, roleId, RolePortalScope.BUSINESS_PORTAL)
      const { ipAddress, userAgent } = getClientMeta(c)
      await createAuditLog({
        action: 'ROLE_DELETED',
        module: 'roles',
        entityId: roleId,
        oldValues: {
          roleId,
          portalScope: 'BUSINESS_PORTAL',
        },
        userId: user.id,
        businessId,
        ipAddress,
        userAgent,
      })
      return c.json(
        { message: 'Role deleted successfully', success: true, data: { deleted: true } },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof RoleNotFoundError) {
        return c.json({ message: 'Role not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof RoleInUseError) {
        return c.json(
          { message: 'Role is assigned to members and cannot be deleted' },
          HttpStatusCodes.BAD_REQUEST
        )
      }
      if (error instanceof InvalidPermissionError) {
        return c.json({ message: error.message }, HttpStatusCodes.BAD_REQUEST)
      }
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error deleting role:', error)
      return c.json({ message: 'Failed to delete role' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
    }
  },
}
