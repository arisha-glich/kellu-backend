import adminAuditLogRouter from '~/routes/admin/audit-logs'
import adminExpenseRouter from '~/routes/admin/expenses'
import adminNotificationRouter from '~/routes/admin/notifications'
import adminReportRouter from '~/routes/admin/reports'
import adminRoleRouter from '~/routes/admin/roles'
import adminTeamMemberRouter from '~/routes/admin/team-members'
import adminWorkorderRouter from '~/routes/admin/workorders'
import businessRouter from '~/routes/business'
import clientRouter from '~/routes/clients'
import expenseRouter from '~/routes/expenses'
import insightsRouter from '~/routes/insights'
import invoiceRouter from '~/routes/invoices'
import notificationRouter from '~/routes/notifications'
import priceListRouter from '~/routes/pricelistitems'
import quoteRouter from '~/routes/quotes'
import roleRouter from '~/routes/roles'
import scheduleRouter from '~/routes/schedule'
import settingsRouter from '~/routes/settings'
import taskRouter from '~/routes/tasks'
import teamRouter from '~/routes/team'
import workorderRouter from '~/routes/workorders'
import type { AppOpenAPI } from '~/types'

export function registerRoutes(app: AppOpenAPI) {
  return app

    .route('/api/businesses', businessRouter)
    .route('/api/businesses', insightsRouter)
    .route('/api/clients', clientRouter)
    .route('/api/workorders', workorderRouter)
    .route('/api/invoices', invoiceRouter)
    .route('/api/notifications', notificationRouter)
    .route('/api/price-list', priceListRouter)
    .route('/api/expenses', expenseRouter)
    .route('/api/roles', roleRouter)
    .route('/api/team', teamRouter)
    .route('/api/admin/roles', adminRoleRouter)
    .route('/api/admin/team', adminTeamMemberRouter)
    .route('/api/admin/audit-logs', adminAuditLogRouter)
    .route('/api/admin/expenses', adminExpenseRouter)
    .route('/api/admin/notifications', adminNotificationRouter)
    .route('/api/admin/reports', adminReportRouter)
    .route('/api/admin/workorders', adminWorkorderRouter)
    .route('/api/quotes', quoteRouter)
    .route('/api/tasks', taskRouter)
    .route('/api/schedule', scheduleRouter)
    .route('/api/settings', settingsRouter)
}
