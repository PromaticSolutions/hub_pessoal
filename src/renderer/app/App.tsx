import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HashRouter } from 'react-router-dom'
import { ToastProvider } from '../components/toast'
import { ConfirmProvider, PromptProvider } from '../components/ui'
import { AppRoutes } from './routes'
import { ThemeController } from './ThemeController'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 0, refetchOnWindowFocus: false, retry: false } }
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ConfirmProvider>
          <PromptProvider>
            <ThemeController />
            <HashRouter>
              <AppRoutes />
            </HashRouter>
          </PromptProvider>
        </ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>
  )
}
