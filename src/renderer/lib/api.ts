import type { ApiMethods } from '@shared/api'

export class ApiError extends Error {
  constructor(public code: string, message: string) {
    super(message)
  }
}

export type Method = keyof ApiMethods
export type In<K extends Method> = ApiMethods[K]['input']
export type Out<K extends Method> = ApiMethods[K]['output']

export async function api<K extends Method>(method: K, input: In<K>): Promise<Out<K>> {
  const res = await window.api.invoke(method as string, input)
  if (!res.ok) throw new ApiError(res.error.code, res.error.message)
  return res.data as Out<K>
}
