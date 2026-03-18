import { createRouter } from '~/lib/create-app'
import { TASK_HANDLER } from '~/routes/tasks/tasks.handler'
import { TASK_ROUTES } from '~/routes/tasks/tasks.routes'

const router = createRouter()

;(Object.keys(TASK_ROUTES) as Array<keyof typeof TASK_ROUTES>).forEach((key) => {
  // biome-ignore lint/suspicious/noExplicitAny: HandlerMapFromRoutes ensures type safety
  router.openapi(TASK_ROUTES[key], TASK_HANDLER[key] as any)
})

export default router
