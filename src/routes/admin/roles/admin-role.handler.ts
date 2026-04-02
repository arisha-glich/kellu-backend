import * as HttpStatusCodes from 'stoker/http-status-codes'
import { hasAdminPortalAccess } from '~/lib/portal-access'
import {
  getAdminPortalPermissionActions,
  getAdminPortalPermissionMatrix,
} from '~/lib/permission'
import { resolveAdminBusinessScope } from '~/routes/admin/_helpers'
import type { ADMIN_ROLE_ROUTES } from '~/routes/admin/roles/admin-role.routes'
import {
  createRole,
  deleteRole,
  InvalidPermissionError,
  listRoles,
  RoleInUseError,
  RoleNotFoundError,
  updateRole,
  getRoleById,
} from '~/services/role.service'
import { RolePortalScope } from '~/generated/prisma'
import { createAuditLog } from '~/services/audit-log.service'
import type { HandlerMapFromRoutes } from '~/types'

const FORBIDDEN_ADMIN_PORTAL_ONLY =
  'This endpoint is only for admin portal accounts. Business users must use /api/roles.'

function getClientMeta(c: { req: { header: (k: string) => string | undefined } }) {
  const forwarded = c.req.header('x-forwarded-for')
  const ipAddress = forwarded?.split(',')[0]?.trim() || null
  const userAgent = c.req.header('user-agent') ?? null
  return { ipAddress, userAgent }
}

export const ADMIN_ROLE_HANDLER: HandlerMapFromRoutes<typeof ADMIN_ROLE_ROUTES> = {
  getPermissionMatrix: async c => {
    const user = c.get('user')
    if (!user) return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    if (!(await hasAdminPortalAccess(user.id))) {
      return c.json({ message: FORBIDDEN_ADMIN_PORTAL_ONLY }, HttpStatusCodes.FORBIDDEN)
    }
    return c.json(
      {
        message: 'Permission matrix retrieved',
        success: true,
        data: getAdminPortalPermissionMatrix(),
      },
      HttpStatusCodes.OK
    )
  },
  getPermissionActions: async c => {
    const user = c.get('user')
    if (!user) return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    if (!(await hasAdminPortalAccess(user.id))) {
      return c.json({ message: FORBIDDEN_ADMIN_PORTAL_ONLY }, HttpStatusCodes.FORBIDDEN)
    }
    return c.json(
      {
        message: 'Permission actions retrieved',
        success: true,
        data: getAdminPortalPermissionActions(),
      },
      HttpStatusCodes.OK
    )
  },
  list: async c => {
    const user = c.get('user')
    if (!user) return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    if (!(await hasAdminPortalAccess(user.id))) {
      return c.json({ message: FORBIDDEN_ADMIN_PORTAL_ONLY }, HttpStatusCodes.FORBIDDEN)
    }
    const businessId = await resolveAdminBusinessScope(c, user)
    if (!businessId) return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
    const roles = await listRoles(businessId, RolePortalScope.ADMIN_PORTAL)
    return c.json({ message: 'Roles retrieved successfully', success: true, data: roles }, HttpStatusCodes.OK)
  },
  getById: async c => {
    const user = c.get('user')
    if (!user) return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    if (!(await hasAdminPortalAccess(user.id))) {
      return c.json({ message: FORBIDDEN_ADMIN_PORTAL_ONLY }, HttpStatusCodes.FORBIDDEN)
    }
    try {
      const businessId = await resolveAdminBusinessScope(c, user)
      if (!businessId) return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      const { roleId } = c.req.valid('param')
      const role = await getRoleById(businessId, roleId, RolePortalScope.ADMIN_PORTAL)
      return c.json({ message: 'Role retrieved successfully', success: true, data: role }, HttpStatusCodes.OK)
    } catch (error) {
      if (error instanceof RoleNotFoundError) return c.json({ message: 'Role not found' }, HttpStatusCodes.NOT_FOUND)
      return c.json({ message: 'Failed to retrieve role' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
    }
  },
  create: async c => {
    const user = c.get('user')
    if (!user) return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    if (!(await hasAdminPortalAccess(user.id))) {
      return c.json({ message: FORBIDDEN_ADMIN_PORTAL_ONLY }, HttpStatusCodes.FORBIDDEN)
    }
    try {
      const businessId = await resolveAdminBusinessScope(c, user)
      if (!businessId) return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      const body = c.req.valid('json')
      const role = await createRole(
        businessId,
        {
          name: body.name,
          displayName: body.displayName ?? undefined,
          description: body.description ?? undefined,
          permissions: body.permissions,
        },
        RolePortalScope.ADMIN_PORTAL
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
            portalScope: 'ADMIN_PORTAL',
          },
          userId: user.id,
          businessId,
          ipAddress,
          userAgent,
        })
      }
      return c.json({ message: 'Role created successfully', success: true, data: role }, HttpStatusCodes.CREATED)
    } catch (error) {
      if (error instanceof InvalidPermissionError) return c.json({ message: error.message }, HttpStatusCodes.BAD_REQUEST)
      return c.json({ message: 'Failed to create role' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
    }
  },
  update: async c => {
    const user = c.get('user')
    if (!user) return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    if (!(await hasAdminPortalAccess(user.id))) {
      return c.json({ message: FORBIDDEN_ADMIN_PORTAL_ONLY }, HttpStatusCodes.FORBIDDEN)
    }
    try {
      const businessId = await resolveAdminBusinessScope(c, user)
      if (!businessId) return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
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
        RolePortalScope.ADMIN_PORTAL
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
            portalScope: 'ADMIN_PORTAL',
          },
          userId: user.id,
          businessId,
          ipAddress,
          userAgent,
        })
      }
      return c.json({ message: 'Role updated successfully', success: true, data: role }, HttpStatusCodes.OK)
    } catch (error) {
      if (error instanceof RoleNotFoundError) return c.json({ message: 'Role not found' }, HttpStatusCodes.NOT_FOUND)
      if (error instanceof InvalidPermissionError) return c.json({ message: error.message }, HttpStatusCodes.BAD_REQUEST)
      return c.json({ message: 'Failed to update role' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
    }
  },
  delete: async c => {
    const user = c.get('user')
    if (!user) return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    if (!(await hasAdminPortalAccess(user.id))) {
      return c.json({ message: FORBIDDEN_ADMIN_PORTAL_ONLY }, HttpStatusCodes.FORBIDDEN)
    }
    try {
      const businessId = await resolveAdminBusinessScope(c, user)
      if (!businessId) return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      const { roleId } = c.req.valid('param')
      await deleteRole(businessId, roleId, RolePortalScope.ADMIN_PORTAL)
      const { ipAddress, userAgent } = getClientMeta(c)
      await createAuditLog({
        action: 'ROLE_DELETED',
        module: 'roles',
        entityId: roleId,
        oldValues: {
          roleId,
          portalScope: 'ADMIN_PORTAL',
        },
        userId: user.id,
        businessId,
        ipAddress,
        userAgent,
      })
      return c.json({ message: 'Role deleted successfully', success: true, data: { deleted: true } }, HttpStatusCodes.OK)
    } catch (error) {
      if (error instanceof RoleNotFoundError) return c.json({ message: 'Role not found' }, HttpStatusCodes.NOT_FOUND)
      if (error instanceof RoleInUseError) return c.json({ message: 'Role is assigned to members and cannot be deleted' }, HttpStatusCodes.BAD_REQUEST)
      if (error instanceof InvalidPermissionError) return c.json({ message: error.message }, HttpStatusCodes.BAD_REQUEST)
      return c.json({ message: 'Failed to delete role' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
    }
  },
}
