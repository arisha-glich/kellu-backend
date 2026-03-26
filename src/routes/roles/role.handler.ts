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
import type { HandlerMapFromRoutes } from '~/types'

export const ROLE_HANDLER: HandlerMapFromRoutes<typeof ROLE_ROUTES> = {
  list: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      const roles = await listRoles(businessId)
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
    const matrix = getPermissionMatrix()
    return c.json(
      { message: 'Permission matrix retrieved', success: true, data: matrix },
      HttpStatusCodes.OK
    )
  },

  getPermissionActions: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
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
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      const { roleId } = c.req.valid('param')
      const role = await getRoleById(businessId, roleId)
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
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      const body = c.req.valid('json')
      const role = await createRole(businessId, {
        name: body.name,
        displayName: body.displayName ?? undefined,
        description: body.description ?? undefined,
        permissions: body.permissions,
      })
      return c.json(
        { message: 'Role created successfully', success: true, data: role },
        HttpStatusCodes.CREATED
      )
    } catch (error) {
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
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      const { roleId } = c.req.valid('param')
      const body = c.req.valid('json')
      const role = await updateRole(businessId, roleId, {
        name: body.name ?? undefined,
        displayName: body.displayName ?? undefined,
        description: body.description ?? undefined,
        permissions: body.permissions ?? undefined,
      })
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
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      const { roleId } = c.req.valid('param')
      await deleteRole(businessId, roleId)
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
