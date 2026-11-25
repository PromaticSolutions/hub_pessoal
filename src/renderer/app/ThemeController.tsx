import { useEffect } from 'react'
import { useApiQuery } from '../lib/queries'

export function ThemeController() {
  const { data } = useApiQuery('settings.all', {})
  const theme = (data?.theme as string) ?? 'system'
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches)
      document.documentElement.classList.toggle('dark', dark)
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])
  return null
}
