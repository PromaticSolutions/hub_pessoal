import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HashRouter } from 'react-router-dom'
import { ToastProvider } from '../components/toast'
import { ConfirmProvider, PromptProvider } from '../components/ui'
import { AppRoutes } from './routes'
import { ThemeController } from './ThemeController'
import { AuthGate } from './AuthGate'

const queryClient = new QueryClient({
  // refetchOnWindowFocus: coming back to the window shows changes made on the other notebook.
  defaultOptions: { queries: { staleTime: 0, refetchOnWindowFocus: true, retry: false } }
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthGate>
          <ConfirmProvider>
            <PromptProvider>
              <ThemeController />
              <HashRouter>
                <AppRoutes />
              </HashRouter>
            </PromptProvider>
          </ConfirmProvider>
        </AuthGate>
      </ToastProvider>
    </QueryClientProvider>
  )
}
