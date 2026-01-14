import { createRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import * as TanstackQuery from './integrations/tanstack-query/root-provider'

// Import the generated route tree
import { routeTree } from './routeTree.gen'

// Create a new router instance
export const getRouter = () => {
  const rqContext = TanstackQuery.getContext()
  const queryClientId =
    (rqContext.queryClient as { __debugId?: string }).__debugId ?? 'missing'
  // #region agent log
  fetch('http://127.0.0.1:7245/ingest/150ee9a9-9ed8-47a6-a49f-3d7830732250', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      location: 'router.tsx:10',
      message: 'initialize router',
      data: { queryClientId },
      timestamp: Date.now(),
      sessionId: 'debug-session',
      runId: 'pre-fix',
      hypothesisId: 'B',
    }),
  }).catch(() => {})
  // #endregion

  const router = createRouter({
    routeTree,
    context: { ...rqContext },
    defaultPreload: 'intent',
    Wrap: (props: { children: React.ReactNode }) => {
      return (
        <TanstackQuery.Provider {...rqContext}>
          {props.children}
        </TanstackQuery.Provider>
      )
    },
  })

  setupRouterSsrQueryIntegration({ router, queryClient: rqContext.queryClient })
  // #region agent log
  fetch('http://127.0.0.1:7245/ingest/150ee9a9-9ed8-47a6-a49f-3d7830732250', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      location: 'router.tsx:27',
      message: 'setup ssr query integration',
      data: { queryClientId },
      timestamp: Date.now(),
      sessionId: 'debug-session',
      runId: 'pre-fix',
      hypothesisId: 'B',
    }),
  }).catch(() => {})
  // #endregion

  return router
}
