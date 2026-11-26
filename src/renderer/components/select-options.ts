import { Fragment, isValidElement, type ReactNode } from 'react'

export type SelectItem =
  | { kind: 'option'; value: string; label: string; disabled?: boolean }
  | { kind: 'group'; label: string }

function textOf(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children)
  return ''
}

/** Reads <option>/<optgroup> children (as written for a native <select>) into a flat item list. */
export function parseOptions(children: ReactNode): SelectItem[] {
  const out: SelectItem[] = []
  const walk = (node: ReactNode) => {
    if (node == null || typeof node === 'boolean') return
    if (Array.isArray(node)) return node.forEach(walk)
    if (!isValidElement<{ children?: ReactNode; value?: unknown; label?: string; disabled?: boolean }>(node)) return
    if (node.type === Fragment) return walk(node.props.children)
    if (node.type === 'optgroup') {
      out.push({ kind: 'group', label: String(node.props.label ?? '') })
      return walk(node.props.children)
    }
    if (node.type === 'option') {
      const label = textOf(node.props.children)
      const item: SelectItem = { kind: 'option', value: node.props.value === undefined ? label : String(node.props.value), label }
      if (node.props.disabled) item.disabled = true
      out.push(item)
    }
  }
  walk(children)
  return out
}
