import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { TaskFilter } from '@shared/types'
import { api } from '../../lib/api'

/** Filter state persisted in settings[key]; `?space=<id>` in the URL overrides the company filter. */
export function usePersistedFilter(key: string): [TaskFilter, (f: TaskFilter) => void, boolean] {
  const [params] = useSearchParams()
  const [filter, setFilter] = useState<TaskFilter>({})
  const [ready, setReady] = useState(false)
  useEffect(() => {
    api('settings.get', { key }).then((v) => {
      const base = (v && typeof v === 'object' ? v : {}) as TaskFilter
      const space = params.get('space')
      setFilter(space ? { ...base, companyIds: [Number(space)], projectIds: undefined } : base)
      setReady(true)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  const update = (f: TaskFilter) => {
    setFilter(f)
    api('settings.set', { key, value: f }).catch(() => {})
  }
  return [filter, update, ready]
}
