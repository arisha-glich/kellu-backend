import { createAccessControl } from 'better-auth/plugins/access'
import { adminAc, defaultStatements } from 'better-auth/plugins/admin/access'

/**
 * Resource-action statement — defines ALL possible permissions in the system.
 * Merged with better-auth defaultStatements so built-in admin plugin checks still work.
 */
export const statement = {
  ...defaultStatements,
  workorders: ['create', 'read', 'update', 'delete'],
  quotes: ['create', 'read', 'update'],
  tasks: ['create', 'read', 'update', 'delete'],
  expenses: ['create', 'read', 'update', 'delete'],
  priceList: ['create', 'read', 'update', 'delete'],
  invoices: ['create', 'read', 'update', 'delete'],
  clients: ['create', 'read', 'update', 'delete'],
  users: ['create', 'read', 'update', 'delete'],
  roles: ['create', 'read', 'update', 'delete'],
  settings: ['read', 'update'],
  reminderConfigs: ['create', 'read', 'update', 'delete'],
  reports: ['read'],
} as const

export const ac = createAccessControl(statement)

/**
 * SUPER ADMIN — platform-level (maps to UserRole.SUPER_ADMIN).
 * Has everything including better-auth admin built-ins (ban, impersonate, etc.)
 */
export const superAdmin = ac.newRole({
  ...adminAc.statements,
  workorders: ['create', 'read', 'update', 'delete'],
  quotes: ['create', 'read', 'update'],
  tasks: ['create', 'read', 'update', 'delete'],
  expenses: ['create', 'read', 'update', 'delete'],
  priceList: ['create', 'read', 'update', 'delete'],
  invoices: ['create', 'read', 'update', 'delete'],
  clients: ['create', 'read', 'update', 'delete'],
  users: ['create', 'read', 'update', 'delete'],
  roles: ['create', 'read', 'update', 'delete'],
  settings: ['read', 'update'],
  reminderConfigs: ['create', 'read', 'update', 'delete'],
  reports: ['read'],
})

/**
 * BUSINESS OWNER — full access to their own business (maps to UserRole.BUSINESS_OWNER).
 * Cannot access platform-level admin operations.
 */
export const businessOwner = ac.newRole({
  workorders: ['create', 'read', 'update', 'delete'],
  quotes: ['create', 'read', 'update'],
  tasks: ['create', 'read', 'update', 'delete'],
  expenses: ['create', 'read', 'update', 'delete'],
  priceList: ['create', 'read', 'update', 'delete'],
  invoices: ['create', 'read', 'update', 'delete'],
  clients: ['create', 'read', 'update', 'delete'],
  users: ['read'],
  roles: ['create', 'read', 'update', 'delete'],
  settings: ['read', 'update'],
  reminderConfigs: ['create', 'read', 'update', 'delete'],
  reports: ['read'],
})

/**
 * ADMIN (team role) — same as businessOwner but created as a team member role.
 * Business owner can assign this to trusted staff members.
 */
export const admin = ac.newRole({
  workorders: ['create', 'read', 'update', 'delete'],
  quotes: ['create', 'read', 'update'],
  tasks: ['create', 'read', 'update', 'delete'],
  expenses: ['create', 'read', 'update', 'delete'],
  priceList: ['create', 'read', 'update', 'delete'],
  invoices: ['create', 'read', 'update', 'delete'],
  clients: ['create', 'read', 'update', 'delete'],
  users: ['read'],
  roles: ['read'],
  settings: ['read', 'update'],
  reminderConfigs: ['create', 'read', 'update', 'delete'],
  reports: ['read'],
})

/**
 * TECHNICIAN — restricted to their assigned jobs only.
 * Per spec §11.2: can update job/visit status and submit job reports.
 */
export const technician = ac.newRole({
  workorders: ['read', 'update'], // read assigned, update status (on_my_way, in_progress, completed)
  quotes: ['read'], // read assigned quotes
  tasks: ['read', 'update'], // read assigned tasks, update status
  expenses: ['create', 'read'], // can log expenses on their jobs
  clients: ['read'], // read-only client info on assigned jobs
  reports: ['read'], // can view/submit job reports
})

/**
 * Role name constants — used in DB and JWT.
 * Matches the keys passed to the admin plugin.
 */
export const ROLES = {
  SUPER_ADMIN: 'superAdmin',
  BUSINESS_OWNER: 'businessOwner',
  ADMIN: 'admin',
  TECHNICIAN: 'technician',
} as const

export type RoleName = (typeof ROLES)[keyof typeof ROLES]
