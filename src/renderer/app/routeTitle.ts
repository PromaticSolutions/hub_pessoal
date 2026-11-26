import type { ApiMethods } from '@shared/api'

type Tree = ApiMethods['spaces.tree']['output'] | undefined

const STATIC: Record<string, string> = {
  '/': 'Dashboard',
  '/day': 'Meu Dia',
  '/week': 'Minha semana',
  '/all': 'Todas as Tarefas',
  '/calendar': 'Calendário',
  '/ideas': 'Ideias',
  '/shopping': 'Lista de Compras',
  '/files': 'Arquivos',
  '/companies': 'Empresas',
  '/search': 'Busca',
  '/settings': 'Configurações'
}

export type RouteInfo = { title: string; kind: 'static' | 'project' | 'space' | 'missing'; color?: string }

export function routeTitle(path: string, tree: Tree): RouteInfo {
  const pathname = path.split('?')[0]
  if (STATIC[pathname]) return { title: STATIC[pathname], kind: 'static' }
  const proj = pathname.match(/^\/projects\/(\d+)/)
  if (proj) {
    if (!tree) return { title: 'Projeto', kind: 'project' }
    const id = Number(proj[1])
    for (const s of tree) {
      const all = [...s.projects]
      const walk = (fs: typeof s.folders) => fs.forEach((f) => { all.push(...f.projects); walk(f.children) })
      walk(s.folders)
      const p = all.find((x) => x.id === id)
      if (p) return { title: p.name, kind: 'project', color: p.color }
    }
    return { title: 'Não encontrado', kind: 'missing' }
  }
  const sp = pathname.match(/^\/spaces\/(\d+)/)
  if (sp) {
    if (!tree) return { title: 'Espaço', kind: 'space' }
    const c = tree.find((s) => s.company.id === Number(sp[1]))
    return c ? { title: c.company.name, kind: 'space', color: c.company.color } : { title: 'Não encontrado', kind: 'missing' }
  }
  return { title: 'Página', kind: 'static' }
}
