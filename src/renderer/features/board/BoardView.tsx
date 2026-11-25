export function BoardView({ boardId }: { boardId: number }) {
  return <div className="p-6 text-sm text-zinc-500" data-testid={`board-${boardId}`}>Quadro</div>
}
