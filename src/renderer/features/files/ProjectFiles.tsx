export function ProjectFiles({ projectId }: { projectId: number }) {
  return <div className="p-6 text-sm text-zinc-500" data-testid={`project-files-${projectId}`}>Arquivos do projeto</div>
}
