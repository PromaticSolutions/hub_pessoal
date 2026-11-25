import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { api, type In, type Method, type Out } from './api'
import { useToast } from '../components/toast'
import { track } from './flush'

export function useApiQuery<K extends Method>(method: K, input: In<K>, opts?: { enabled?: boolean }) {
  return useQuery({ queryKey: [method, input], queryFn: () => api(method, input), enabled: opts?.enabled ?? true })
}

/** Mutation that invalidates every query on success (local DB is fast) and toasts errors. */
export function useApiMutation<K extends Method>(method: K, opts?: { onSuccess?: (data: Out<K>) => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: (input: In<K>) => api(method, input),
    onSuccess: (data) => {
      qc.invalidateQueries()
      opts?.onSuccess?.(data)
    },
    onError: (e: Error) => toast.error(e.message)
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
            toast.error((e as Error).message)
            throw e
          }
        })()
      ),
    [qc, toast]
  )
}
