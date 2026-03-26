import businessRouter from '~/routes/business'
import clientRouter from '~/routes/clients'
import expenseRouter from '~/routes/expenses'
import insightsRouter from '~/routes/insights'
import invoiceRouter from '~/routes/invoices'
import priceListRouter from '~/routes/pricelistitems'
import quoteRouter from '~/routes/quotes'
import roleRouter from '~/routes/roles'
import scheduleRouter from '~/routes/schedule'
import settingsRouter from '~/routes/settings'
import taskRouter from '~/routes/tasks'
import teamRouter from '~/routes/team'
import router from '~/routes/test'
import workorderRouter from '~/routes/workorders'
import type { AppOpenAPI } from '~/types'

export function registerRoutes(app: AppOpenAPI) {
  return app
    .route('/test', router)
    .route('/api/businesses', businessRouter)
    .route('/api/businesses', insightsRouter)
    .route('/api/clients', clientRouter)
    .route('/api/workorders', workorderRouter)
    .route('/api/invoices', invoiceRouter)
    .route('/api/price-list', priceListRouter)
    .route('/api/expenses', expenseRouter)
    .route('/api/roles', roleRouter)
    .route('/api/team', teamRouter)
    .route('/api/quotes', quoteRouter)
    .route('/api/tasks', taskRouter)
    .route('/api/schedule', scheduleRouter)
    .route('/api/settings', settingsRouter)
}
