import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

export function getContext() {
  const queryClient = new QueryClient()
  const queryClientId = Math.random().toString(36).slice(2)
  ;(queryClient as QueryClient & { __debugId?: string }).__debugId =
    queryClientId
  // #region agent log
  fetch('http://127.0.0.1:7245/ingest/150ee9a9-9ed8-47a6-a49f-3d7830732250',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'integrations/tanstack-query/root-provider.tsx:5',message:'create query client',data:{queryClientId},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'B'})}).catch(()=>{});
  // #endregion
  return {
    queryClient,
  }
}

export function Provider({
  children,
  queryClient,
}: {
  children: React.ReactNode
  queryClient: QueryClient
}) {
  const queryClientId =
    (queryClient as QueryClient & { __debugId?: string }).__debugId ?? 'missing'
  // #region agent log
  fetch('http://127.0.0.1:7245/ingest/150ee9a9-9ed8-47a6-a49f-3d7830732250',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'integrations/tanstack-query/root-provider.tsx:20',message:'render QueryClientProvider',data:{queryClientId,hasChildren:!!children},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}
