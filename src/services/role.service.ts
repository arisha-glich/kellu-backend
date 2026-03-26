/**
 * Role & Permission Service — §11 Team Management.
 * Business owners manage custom roles; system roles are seeded automatically.
 */

import { statement } from '~/lib/permission'
import prisma from '~/lib/prisma'
import { BusinessNotFoundError } from '~/services/business.service'

export class RoleNotFoundError extends Error {
  constructor() {
    super('ROLE_NOT_FOUND')
  }
}

export class RoleInUseError extends Error {
  constructor() {
    super('ROLE_IN_USE')
  }
}

export class InvalidPermissionError extends Error {}

/** All valid resources extracted from the statement */
export const ALL_RESOURCES = Object.keys(statement) as Array<keyof typeof statement>

/** All valid actions for a given resource */
export function getActionsForResource(resource: string): string[] {
  return Array.from((statement as Record<string, readonly string[]>)[resource] ?? [])
}

/** All unique actions across all resources (no resource names, actions only). */
export function getAllActions(): string[] {
  const actions = new Set<string>()
  for (const resource of ALL_RESOURCES) {
    for (const action of getActionsForResource(resource)) {
      actions.add(action)
    }
  }
  return Array.from(actions).sort()
}

/** Validate that all permissions in the input are valid resource:action pairs */
export function validatePermissions(
  permissions: Array<{ resource: string; action: string }>
): void {
  for (const p of permissions) {
    const validActions = getActionsForResource(p.resource)
    if (validActions.length === 0) {
      throw new InvalidPermissionError(`Unknown resource: ${p.resource}`)
    }
    if (!validActions.includes(p.action)) {
      throw new InvalidPermissionError(
        `Invalid action '${p.action}' for resource '${p.resource}'. Valid: ${validActions.join(', ')}`
      )
    }
  }
}

export interface CreateRoleInput {
  name: string
  displayName?: string
  description?: string
  permissions: Array<{ resource: string; action: string }>
}

export interface UpdateRoleInput {
  name?: string
  displayName?: string
  description?: string
  permissions?: Array<{ resource: string; action: string }>
}

async function ensureBusinessExists(businessId: string): Promise<void> {
  const b = await prisma.business.findUnique({ where: { id: businessId }, select: { id: true } })
  if (!b) {
    throw new BusinessNotFoundError()
  }
}

/** List all roles for a business (including system roles). */
export async function listRoles(businessId: string) {
  await ensureBusinessExists(businessId)
  return prisma.role.findMany({
    where: { businessId },
    include: {
      permissions: {
        include: { permission: true },
      },
      _count: { select: { members: true } },
    },
    orderBy: [{ isSystem: 'desc' }, { createdAt: 'asc' }],
  })
}

/** Get a single role with its permissions. */
export async function getRoleById(businessId: string, roleId: string) {
  await ensureBusinessExists(businessId)
  const role = await prisma.role.findFirst({
    where: { id: roleId, businessId },
    include: {
      permissions: { include: { permission: true } },
      _count: { select: { members: true } },
    },
  })
  if (!role) {
    throw new RoleNotFoundError()
  }
  return role
}

/** Create a custom role with permissions. System roles cannot be created here. */
export async function createRole(businessId: string, input: CreateRoleInput) {
  await ensureBusinessExists(businessId)
  validatePermissions(input.permissions)

  const resolvedPermissions = await Promise.all(
    input.permissions.map(async p =>
      prisma.permission.upsert({
        where: { resource_action: { resource: p.resource, action: p.action } },
        update: {},
        create: { resource: p.resource, action: p.action },
      })
    )
  )

  const role = await prisma.$transaction(async tx => {
    const created = await tx.role.create({
      data: {
        businessId,
        name: input.name,
        displayName: input.displayName ?? null,
        description: input.description ?? null,
        isSystem: false,
      },
    })

    await tx.rolePermission.createMany({
      data: resolvedPermissions.map(p => ({
        roleId: created.id,
        permissionId: p.id,
      })),
    })
    return tx.role.findUnique({
      where: { id: created.id },
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { members: true } },
      },
    })
  })

  return role
}

/** Update a custom role. System roles cannot be modified. */
export async function updateRole(
  businessId: string,

  roleId: string,

  input: UpdateRoleInput
) {
  await ensureBusinessExists(businessId)

  const existing = await prisma.role.findFirst({
    where: { id: roleId, businessId },

    select: { id: true, isSystem: true },
  })

  if (!existing) {
    throw new RoleNotFoundError()
  }

  if (existing.isSystem) {
    throw new InvalidPermissionError('System roles cannot be modified')
  }

  if (input.permissions) {
    validatePermissions(input.permissions)
  }

  // Step 1: Upsert all permissions OUTSIDE the transaction (no timeout risk)

  const resolvedPermissions = input.permissions
    ? await Promise.all(
        input.permissions.map(p =>
          prisma.permission.upsert({
            where: { resource_action: { resource: p.resource, action: p.action } },

            update: {},

            create: { resource: p.resource, action: p.action },
          })
        )
      )
    : null

  // Step 2: Update role + swap permissions in one fast transaction

  return prisma.$transaction(async tx => {
    await tx.role.update({
      where: { id: roleId },

      data: {
        ...(input.name != null && { name: input.name }),

        ...(input.displayName !== undefined && { displayName: input.displayName }),

        ...(input.description !== undefined && { description: input.description }),
      },
    })

    if (resolvedPermissions !== null) {
      await tx.rolePermission.deleteMany({ where: { roleId } })

      await tx.rolePermission.createMany({
        data: resolvedPermissions.map(p => ({
          roleId,

          permissionId: p.id,
        })),
      })
    }

    return tx.role.findUnique({
      where: { id: roleId },

      include: {
        permissions: { include: { permission: true } },

        _count: { select: { members: true } },
      },
    })
  })
}

/** Delete a custom role. Fails if members are assigned to it. */
export async function deleteRole(businessId: string, roleId: string): Promise<void> {
  await ensureBusinessExists(businessId)
  const role = await prisma.role.findFirst({
    where: { id: roleId, businessId },
    select: { id: true, isSystem: true, _count: { select: { members: true } } },
  })
  if (!role) {
    throw new RoleNotFoundError()
  }
  if (role.isSystem) {
    throw new InvalidPermissionError('System roles cannot be deleted')
  }
  if (role._count.members > 0) {
    throw new RoleInUseError()
  }

  await prisma.role.delete({ where: { id: roleId } })
}

/**
 * Seed system roles for a business on creation.
 * Creates: Admin, Technician (isSystem = true, cannot be modified/deleted).
 */
export async function seedSystemRoles(businessId: string): Promise<void> {
  const systemRoles = [
    {
      name: 'admin',
      displayName: 'Admin',
      description: 'Full access to all business modules',
      permissions: [
        { resource: 'workorders', action: 'create' },
        { resource: 'workorders', action: 'read' },
        { resource: 'workorders', action: 'update' },
        { resource: 'workorders', action: 'delete' },
        { resource: 'tasks', action: 'create' },
        { resource: 'tasks', action: 'read' },
        { resource: 'tasks', action: 'update' },
        { resource: 'tasks', action: 'delete' },
        { resource: 'expenses', action: 'create' },
        { resource: 'expenses', action: 'read' },
        { resource: 'expenses', action: 'update' },
        { resource: 'expenses', action: 'delete' },
        { resource: 'priceList', action: 'create' },
        { resource: 'priceList', action: 'read' },
        { resource: 'priceList', action: 'update' },
        { resource: 'priceList', action: 'delete' },
        { resource: 'invoices', action: 'create' },
        { resource: 'invoices', action: 'read' },
        { resource: 'invoices', action: 'update' },
        { resource: 'invoices', action: 'delete' },
        { resource: 'quotes', action: 'create' },
        { resource: 'quotes', action: 'read' },
        { resource: 'quotes', action: 'update' },
        { resource: 'clients', action: 'create' },
        { resource: 'clients', action: 'read' },
        { resource: 'clients', action: 'update' },
        { resource: 'clients', action: 'delete' },
        { resource: 'users', action: 'read' },
        { resource: 'roles', action: 'read' },
        { resource: 'settings', action: 'read' },
        { resource: 'settings', action: 'update' },
        { resource: 'reminderConfigs', action: 'create' },
        { resource: 'reminderConfigs', action: 'read' },
        { resource: 'reminderConfigs', action: 'update' },
        { resource: 'reminderConfigs', action: 'delete' },
        { resource: 'reports', action: 'read' },
      ],
    },
    {
      name: 'technician',
      displayName: 'Technician',
      description: 'Access only to assigned jobs and status updates',
      permissions: [
        { resource: 'workorders', action: 'read' },
        { resource: 'workorders', action: 'update' },
        { resource: 'quotes', action: 'read' },
        { resource: 'tasks', action: 'read' },
        { resource: 'tasks', action: 'update' },
        { resource: 'expenses', action: 'create' },
        { resource: 'expenses', action: 'read' },
        { resource: 'clients', action: 'read' },
        { resource: 'reports', action: 'read' },
      ],
    },
  ]

  for (const roleData of systemRoles) {
    // Skip if already exists
    const exists = await prisma.role.findUnique({
      where: { businessId_name: { businessId, name: roleData.name } },
      select: { id: true },
    })
    if (exists) {
      continue
    }

    const role = await prisma.role.create({
      data: {
        businessId,
        name: roleData.name,
        displayName: roleData.displayName,
        description: roleData.description,
        isSystem: true,
      },
    })

    for (const p of roleData.permissions) {
      const permission = await prisma.permission.upsert({
        where: { resource_action: { resource: p.resource, action: p.action } },
        update: {},
        create: { resource: p.resource, action: p.action },
      })
      await prisma.rolePermission.create({
        data: { roleId: role.id, permissionId: permission.id },
      })
    }
  }
}

/** Get available resources and their actions (for UI permission builder). */
export function getPermissionMatrix() {
  return Object.entries(statement).map(([resource, actions]) => ({
    resource,
    actions: [...actions],
  }))
}
