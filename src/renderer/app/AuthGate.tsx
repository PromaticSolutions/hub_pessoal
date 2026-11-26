import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Field, Input } from '../components/ui'
import { useToast } from '../components/toast'
import { UNAUTHORIZED_EVENT } from '../lib/api'
import { DEV_AUTH, getSupabase, signIn, wasManualSignOut } from '../lib/supabase'

type Status = 'loading' | 'in' | 'out'

function LoginForm({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <form
      className="surface w-full max-w-sm space-y-4 p-6"
      data-testid="login-form"
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        setError(null)
        try {
          await signIn(email.trim(), password)
          setPassword('')
          onDone()
        } catch (err) {
          const status = (err as { status?: number }).status
          setError(status === 400 || status === 401 || status === undefined ? 'Email ou senha incorretos' : (err as Error).message)
        } finally {
          setBusy(false)
        }
      }}
    >
      <div>
        <div className="text-xs font-medium text-zinc-500">Personal Task Hub</div>
        <h1 className="text-xl font-semibold tracking-tight">Entrar</h1>
      </div>
      <Field label="Email">
        <Input data-testid="login-email" type="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Senha">
        <Input data-testid="login-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      {error && <div data-testid="login-error" className="text-sm text-red-600">{error}</div>}
      <Button type="submit" variant="primary" className="w-full" data-testid="login-submit" disabled={busy || !email || !password}>
        Entrar
      </Button>
    </form>
  )
}

/**
 * Without a session shows the login screen. When the session expires mid-use (API 401 / token refresh fails)
 * the login is laid over the app WITHOUT unmounting it, so unsaved text stays on screen.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  if (DEV_AUTH) return <>{children}</>
  return <SupabaseGate>{children}</SupabaseGate>
}

function SupabaseGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading')
  const [expired, setExpired] = useState(false)
  const qc = useQueryClient()
  const toast = useToast()
  const statusRef = useRef(status)
  statusRef.current = status
  const expiredRef = useRef(expired)
  expiredRef.current = expired

  useEffect(() => {
    const markExpired = () => {
      if (statusRef.current !== 'in' || expiredRef.current) return
      expiredRef.current = true
      setExpired(true)
      toast.error('Sessão expirada. Entre novamente.')
    }
    const sb = getSupabase()
    let alive = true
    sb.auth.getSession().then(({ data }) => { if (alive) setStatus(data.session ? 'in' : 'out') })
    const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        if (wasManualSignOut()) {
          qc.clear()
          setExpired(false)
          setStatus('out')
        } else if (statusRef.current === 'in') markExpired()
        else setStatus('out')
      } else setStatus('in')
    })
    window.addEventListener(UNAUTHORIZED_EVENT, markExpired)
    return () => {
      alive = false
      sub.subscription.unsubscribe()
      window.removeEventListener(UNAUTHORIZED_EVENT, markExpired)
    }
  }, [qc, toast])

  if (status === 'loading') return null
  if (status === 'out')
    return (
      <div className="flex min-h-screen items-center justify-center p-4" data-testid="login-screen">
        <LoginForm onDone={() => setStatus('in')} />
      </div>
    )
  return (
    <>
      {children}
      {expired && (
        <div className="backdrop fixed inset-0 z-[90] flex items-center justify-center p-4" data-testid="login-screen">
          <LoginForm
            onDone={() => {
              setExpired(false)
              void qc.invalidateQueries()
            }}
          />
        </div>
      )}
    </>
  )
}
