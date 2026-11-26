import { groupChronological, dueBadge } from '@shared/week'
import type { TaskListItem } from '@shared/types'

const t = (id: number, dueAt: string | null, priority: TaskListItem['priority'] = 'medium', extra: Partial<TaskListItem> = {}) =>
  ({ id, title: `t${id}`, dueAt, priority, status: 'todo', isOverdue: false, ...extra }) as TaskListItem

const days = ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29']

test('groupChronological: Atrasadas, Hoje, Amanhã, demais dias; ordem por prioridade e hora', () => {
  const g = groupChronological(
    [
      t(1, '2026-11-20', 'low', { isOverdue: true }),
      t(2, '2026-11-25T15:00', 'high'),
      t(3, '2026-11-25', 'urgent'),
      t(4, '2026-11-26', 'low'),
      t(5, '2026-11-28', 'medium'),
      t(6, null),
      t(7, '2026-11-24', 'high', { isOverdue: true })
    ],
    days,
    '2026-11-25'
  )
  expect(g.map((x) => [x.key, x.label, x.items.map((i) => i.id)])).toEqual([
    ['overdue', 'Atrasadas', [7, 1]],
    ['2026-11-25', 'Hoje', [3, 2]],
    ['2026-11-26', 'Amanhã', [4]],
    ['2026-11-28', 'sábado, 28/11', [5]]
  ])
})

test('dueBadge', () => {
  expect(dueBadge(t(1, '2026-11-20', 'low', { isOverdue: true }), '2026-11-25')).toBe('overdue')
  expect(dueBadge(t(1, '2026-11-25T10:00'), '2026-11-25')).toBe('today')
  expect(dueBadge(t(1, '2026-11-26'), '2026-11-25')).toBe('tomorrow')
  expect(dueBadge(t(1, '2026-11-27'), '2026-11-25')).toBeNull()
  expect(dueBadge(t(1, '2026-11-25', 'low', { status: 'done' }), '2026-11-25')).toBeNull()
})
