import { statement } from '~/lib/permission'

/** Admin UI section labels by resource key (system permission matrix). */
export const PERMISSION_RESOURCE_SECTION: Record<string, string> = {
  // better-auth admin defaults (from defaultStatements)
  user: 'Platform',
  session: 'Platform',
  // App resources
  workorders: 'Jobs',
  quotes: 'Quotes',
  tasks: 'Tasks',
  expenses: 'Expenses',
  priceList: 'Price list',
  invoices: 'Invoices',
  clients: 'Clients',
  users: 'Team & users',
  roles: 'Roles & permissions',
  settings: 'Settings',
  reminderConfigs: 'Reminders',
  reports: 'Reports',
}

/**
 * Permissions that are locked for *custom* business roles by default after sync.
 * Platform admins can change locks per row in the DB.
 */
export const DEFAULT_LOCKED_FOR_CUSTOM_ROLES: Array<{ resource: string; action: string }> = [
  { resource: 'roles', action: 'delete' },
  { resource: 'users', action: 'delete' },
]

export function allStatementPermissionPairs(): Array<{ resource: string; action: string }> {
  const pairs: Array<{ resource: string; action: string }> = []
  for (const [resource, actions] of Object.entries(statement)) {
    for (const action of actions) {
      pairs.push({ resource, action })
    }
  }
  return pairs
}
