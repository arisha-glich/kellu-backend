import { createRouter } from '~/lib/create-app'
import { SETTINGS_HANDLER } from '~/routes/settings/settings.handler'
import { SETTINGS_ROUTES } from '~/routes/settings/settings.routes'

const router = createRouter()

;(Object.keys(SETTINGS_ROUTES) as Array<keyof typeof SETTINGS_ROUTES>).forEach(key => {
  // biome-ignore lint/suspicious/noExplicitAny: HandlerMapFromRoutes ensures type safety
  router.openapi(SETTINGS_ROUTES[key], SETTINGS_HANDLER[key] as any)
})

export default router
