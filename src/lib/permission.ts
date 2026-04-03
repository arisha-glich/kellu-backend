import { createAccessControl, } from 'better-auth/plugins/access'
import { adminAc, defaultStatements } from 'better-auth/plugins/admin/access'

/**
 * Resource-action statement — defines ALL possible permissions in the system.
 * Merged with better-auth defaultStatements so built-in admin plugin checks still work.
 */
export const statement = {
  ...defaultStatements,
  /** Aligns with app-wide `read` checks; better-auth defaults use `get` / `list` only. */
  user: [...defaultStatements.user, 'read'],
  /** Platform admin: companies / tenants (session uses full CRUD for admin portal users). */
  business: ['create', 'read', 'update', 'delete'],
  workorders: ['create', 'read', 'update', 'delete'],
  quotes: ['create', 'read', 'update', 'delete'],
  tasks: ['create', 'read', 'update', 'delete'],
  expenses: ['create', 'read', 'update', 'delete'],
  priceList: ['create', 'read', 'update', 'delete'],
  invoices: ['create', 'read', 'update', 'delete'],
  clients: ['create', 'read', 'update', 'delete'],
  users: ['create', 'read', 'update', 'delete'],
  roles: ['create', 'read', 'update', 'delete'],
  settings: ['create', 'read', 'update', 'delete'],
  auditLogs: ['read'],
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
  user: [...adminAc.statements.user, 'read'],
  business: ['create', 'read', 'update', 'delete'],
  workorders: ['create', 'read', 'update', 'delete'],
  quotes: ['create', 'read', 'update','delete'],
  tasks: ['create', 'read', 'update', 'delete'],
  expenses: ['create', 'read', 'update', 'delete'],
  priceList: ['create', 'read', 'update', 'delete'],
  invoices: ['create', 'read', 'update', 'delete'],
  clients: ['create', 'read', 'update', 'delete'],
  users: ['create', 'read', 'update', 'delete'],
  roles: ['create', 'read', 'update', 'delete'],
  settings: ['create', 'read', 'update', 'delete'],
  auditLogs: ['read'],
  reminderConfigs: ['create', 'read', 'update', 'delete'],
  reports: ['read'],
})

/**
 * BUSINESS OWNER — full access to their own business (maps to UserRole.BUSINESS_OWNER).
 * Cannot access platform-level admin operations.
 */
export const businessOwner = ac.newRole({
  workorders: ['create', 'read', 'update', 'delete'],
  quotes: ['create', 'read', 'update', 'delete'],
  tasks: ['create', 'read', 'update', 'delete'],
  expenses: ['create', 'read', 'update', 'delete'],
  priceList: ['create', 'read', 'update', 'delete'],
  invoices: ['create', 'read', 'update', 'delete'],
  clients: ['create', 'read', 'update', 'delete'],
  users: ['read'],
  roles: ['create', 'read', 'update', 'delete'],
  settings: ['read', 'update'],
  reminderConfigs: ['create', 'read', 'update', 'delete'],
  auditLogs: ['read'],
  reports: ['read'],
})

/**
 * ADMIN (team role) — same as businessOwner but created as a team member role.
 * Business owner can assign this to trusted staff members.
 */
export const admin = ac.newRole({
  workorders: ['create', 'read', 'update', 'delete'],
  quotes: ['create', 'read', 'update', 'delete'],
  tasks: ['create', 'read', 'update', 'delete'],
  expenses: ['create', 'read', 'update', 'delete'],
  priceList: ['create', 'read', 'update', 'delete'],
  invoices: ['create', 'read', 'update', 'delete'],
  clients: ['create', 'read', 'update', 'delete'],
  users: ['read'],
  roles: ['read'],
  settings: ['read', 'update'],
  reminderConfigs: ['create', 'read', 'update', 'delete'],
  auditLogs: ['read'],
  reports: ['read'],
})

/**
 * TECHNICIAN — restricted to their assigned jobs only.
 * Per spec §11.2: can update job/visit status and submit job reports.
 */
export const technician = ac.newRole({
  workorders: ['read', 'update'], // read assigned, update status (on_my_way, in_progress, completed)
  quotes: ['read', 'update'], // read assigned quotes
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

/** Session + API matrix for primary SUPER_ADMIN and admin-portal team members. */
export const ADMIN_PORTAL_BUSINESS_RESOURCE = 'business'

/** All actions from `statement` for these resources (business + platform admin surfaces). */
const ADMIN_PORTAL_FULL_CRUD_RESOURCES = new Set([
  ADMIN_PORTAL_BUSINESS_RESOURCE,
  'user',
  'users',
  'session',
  'sessions',
  'settings',
])

/** Non-destructive / view actions allowed on every other resource for admin portal. */
const ADMIN_PORTAL_READ_LIKE_ACTIONS = new Set(['read', 'get', 'list'])

function statementActionsFor(resource: string): readonly string[] | undefined {
  return (statement as Record<string, readonly string[]>)[resource]
}

export function adminPortalAllows(resource: string, action: string): boolean {
  const defined = statementActionsFor(resource)
  if (defined && ADMIN_PORTAL_FULL_CRUD_RESOURCES.has(resource)) {
    return defined.includes(action)
  }
  return ADMIN_PORTAL_READ_LIKE_ACTIONS.has(action)
}

export type PermissionPair = { resource: string; action: string }

/**
 * Session `permissions` for primary business owners (`isOwner`): every resource/action in
 * `statement`, except `user`, `users`, and `reports` are read-only there (only `read` is listed).
 * Platform-style resources are omitted from the session list entirely (`business`, `session`, `sessions`).
 * API access is unchanged (`hasPermission` still grants full access for `business.ownerId`).
 */
const BUSINESS_OWNER_SESSION_READ_ONLY_RESOURCES = new Set(['user', 'users', 'reports'])

const BUSINESS_OWNER_SESSION_EXCLUDED_RESOURCES = new Set(['business', 'session', 'sessions'])

export function buildBusinessOwnerSessionPermissions(): PermissionPair[] {
  const pairs: PermissionPair[] = []
  for (const [resource, actions] of Object.entries(statement)) {
    if (BUSINESS_OWNER_SESSION_EXCLUDED_RESOURCES.has(resource)) {
      continue
    }
    const acts = actions as readonly string[]
    if (BUSINESS_OWNER_SESSION_READ_ONLY_RESOURCES.has(resource)) {
      for (const action of acts) {
        if (action === 'read') {
          pairs.push({ resource, action })
        }
      }
    } else {
      for (const action of acts) {
        pairs.push({ resource, action })
      }
    }
  }
  return pairs
}

/** Permissions exposed on the session for admin portal users. */
export function buildAdminPortalSessionPermissions(): PermissionPair[] {
  const pairs: PermissionPair[] = []
  for (const [resource, actions] of Object.entries(statement)) {
    for (const action of actions as readonly string[]) {
      if (ADMIN_PORTAL_FULL_CRUD_RESOURCES.has(resource)) {
        pairs.push({ resource, action })
      } else if (ADMIN_PORTAL_READ_LIKE_ACTIONS.has(action)) {
        pairs.push({ resource, action })
      }
    }
  }
  return pairs
}

export type PermissionMatrixRow = { resource: string; actions: string[] }

/**
 * Permission matrix for admin portal role UI (`GET /api/admin/roles/permissions/matrix`).
 * Matches session / `adminPortalAllows`: full `statement` actions on business, user, users, session(s), settings; read-like only elsewhere.
 */
export function getAdminPortalPermissionMatrix(): PermissionMatrixRow[] {
  return Object.entries(statement).map(([resource, actions]) => {
    const acts = actions as readonly string[]
    if (ADMIN_PORTAL_FULL_CRUD_RESOURCES.has(resource)) {
      return { resource, actions: [...acts] }
    }
    const readOnly = acts.filter(a => ADMIN_PORTAL_READ_LIKE_ACTIONS.has(a))
    return { resource, actions: readOnly }
  })
}

/** Distinct actions referenced by `getAdminPortalPermissionMatrix` (admin role builder chips). */
export function getAdminPortalPermissionActions(): string[] {
  const set = new Set<string>()
  for (const row of getAdminPortalPermissionMatrix()) {
    for (const a of row.actions) {
      set.add(a)
    }
  }
  return Array.from(set).sort()
}
