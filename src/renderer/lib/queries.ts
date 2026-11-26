import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { api, ApiError, type In, type Method, type Out } from './api'
import { useToast } from '../components/toast'
import { track } from './flush'

/** Session expiry is announced once by AuthGate; don't stack a generic error toast on top. */
const isUnauthorized = (e: unknown) => e instanceof ApiError && e.code === 'UNAUTHORIZED'

export function useApiQuery<K extends Method>(method: K, input: In<K>, opts?: { enabled?: boolean; staleTime?: number }) {
  return useQuery({ queryKey: [method, input], queryFn: () => api(method, input), enabled: opts?.enabled ?? true, staleTime: opts?.staleTime })
}

/** Mutation that invalidates every query on success and toasts errors. */
export function useApiMutation<K extends Method>(method: K, opts?: { onSuccess?: (data: Out<K>) => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: (input: In<K>) => api(method, input),
    onSuccess: (data) => {
      qc.invalidateQueries()
      opts?.onSuccess?.(data)
    },
    onError: (e: Error) => { if (!isUnauthorized(e)) toast.error(e.message) }
  })
}

/** Imperative call + invalidate everything. Errors are toasted and rethrown. */
export function useCall() {
  const qc = useQueryClient()
  const toast = useToast()
  return useCallback(
    <K extends Method>(method: K, input: In<K>): Promise<Out<K>> =>
      track(
        (async () => {
          try {
            const r = await api(method, input)
            await qc.invalidateQueries()
            return r
          } catch (e) {
            if (!isUnauthorized(e)) toast.error((e as Error).message)
            if (e && typeof e === 'object') (e as { toasted?: boolean }).toasted = true
            throw e
          }
        })()
      ),
    [qc, toast]
  )
}

/** Runs an async action (upload, open signed URL…) toasting its error instead of leaving an unhandled rejection. */
export function useRun() {
  const toast = useToast()
  return useCallback(
    (fn: () => Promise<unknown>) => {
      fn().catch((e) => { if (!isUnauthorized(e) && !(e as { toasted?: boolean })?.toasted) toast.error((e as Error).message) })
    },
    [toast]
  )
}
