import { useState, type ReactNode } from 'react'
import { format, parseISO } from 'date-fns'
import type { ApiMethods } from '@shared/api'
import { SPACE_COLORS } from '@shared/constants'
import { Button, ColorPicker, Field, Input, Modal, PageHeader, Select, useConfirm } from '../../components/ui'
import { useApiQuery, useCall } from '../../lib/queries'
import { api } from '../../lib/api'
import { formatBytes, formatDate } from '../../lib/format'
import { useToast } from '../../components/toast'

type Manifest = ApiMethods['backup.inspect']['output']['manifest']

function Section({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return (
    <section className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800" data-testid={id}>
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  )
}

function LabelsSection() {
  const { data: labels } = useApiQuery('labels.list', {})
  const [name, setName] = useState('')
  const [color, setColor] = useState(SPACE_COLORS[0])
  const call = useCall()
  const confirm = useConfirm()
  return (
    <Section title="Etiquetas" id="settings-labels">
      <div className="space-y-1">
        {labels?.map((l) => (
          <div key={l.id} className="flex items-center gap-2 text-sm">
            <input type="color" value={l.color} onChange={(e) => call('labels.update', { id: l.id, color: e.target.value })} className="h-6 w-8 cursor-pointer bg-transparent" />
            <input
              data-testid={`label-name-${l.id}`}
              className="flex-1 rounded bg-transparent px-1 outline-none focus:bg-zinc-50 dark:focus:bg-zinc-900"
              defaultValue={l.name}
              onBlur={(e) => e.target.value.trim() && e.target.value !== l.name && call('labels.update', { id: l.id, name: e.target.value }).catch(() => { e.target.value = l.name })}
            />
            <span className="text-xs text-zinc-500">{l.usage} uso(s)</span>
            <Button
              size="sm"
              variant="ghost"
              className="text-red-600"
              data-testid={`label-delete-${l.id}`}
              onClick={async () => (await confirm({ title: `Excluir a etiqueta "${l.name}"?`, description: `Ela será removida de ${l.usage} tarefa(s).`, danger: true, confirmLabel: 'Excluir' })) && call('labels.delete', { id: l.id })}
            >
              Excluir
            </Button>
          </div>
        ))}
        {!labels?.length && <div className="text-sm text-zinc-500">Nenhuma etiqueta.</div>}
      </div>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!name.trim()) return
          await call('labels.create', { name, color })
          setName('')
        }}
      >
        <Input data-testid="settings-new-label" className="w-48" placeholder="Nova etiqueta" value={name} onChange={(e) => setName(e.target.value)} />
        <ColorPicker value={color} onChange={setColor} />
        <Button type="submit" size="sm" variant="primary">Adicionar</Button>
      </form>
    </Section>
  )
}

function BackupSection() {
  const call = useCall()
  const toast = useToast()
  const confirm = useConfirm()
  const { data: autos } = useApiQuery('backup.listAuto', {})
  const [busy, setBusy] = useState<string | null>(null)
  const [pending, setPending] = useState<{ manifest: Manifest; token: string; file: string } | null>(null)

  const backup = async (kind: 'full' | 'db') => {
    const suggested = await api('backup.defaultPath', { kind })
    const dest = await api('system.pickSavePath', { defaultPath: suggested })
    if (!dest) return
    setBusy(kind === 'full' ? 'Gerando backup completo…' : 'Gerando backup do banco…')
    try {
      const m = kind === 'full' ? await call('backup.createFull', { destPath: dest }) : await call('backup.createDb', { destPath: dest })
      toast.success(`Backup salvo em ${dest} (${m.counts.tasks} tarefas, ${m.counts.attachments} anexos)`)
    } finally {
      setBusy(null)
    }
  }
  const chooseRestore = async () => {
    const file = await api('system.pickOpenPath', { extensions: ['zip', 'db'] })
    if (!file) return
    setBusy('Verificando backup…')
    try {
      const r = await call('backup.inspect', { path: file })
      setPending({ ...r, file })
    } finally {
      setBusy(null)
    }
  }
  return (
    <Section title="Backup e restauração" id="settings-backup">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        O backup completo gera um arquivo .zip com o banco de dados e todos os anexos. Guarde-o em outro disco ou na nuvem.
        Além disso, o app guarda automaticamente uma cópia diária do banco (últimos 14 dias).
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" data-testid="backup-full" disabled={!!busy} onClick={() => backup('full')}>Fazer backup completo</Button>
        <Button disabled={!!busy} onClick={() => backup('db')}>Backup só do banco</Button>
        <Button disabled={!!busy} data-testid="backup-restore" onClick={chooseRestore}>Restaurar backup…</Button>
      </div>
      {busy && <div className="text-sm text-indigo-600">{busy}</div>}
      <div>
        <h3 className="mb-1 text-sm font-medium">Backups automáticos</h3>
        <ul className="space-y-1 text-sm" data-testid="auto-backups">
          {autos?.map((b) => (
            <li key={b.file} className="flex items-center gap-3">
              <span>{format(parseISO(b.date), 'dd/MM/yyyy')}</span>
              <span className="text-xs text-zinc-500">{formatBytes(b.sizeBytes)}</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  if (await confirm({ title: `Restaurar o backup de ${format(parseISO(b.date), 'dd/MM/yyyy')}?`, description: 'O estado atual será guardado em backups/pre-restore e o app reiniciará. Os anexos atuais são mantidos.', danger: true, confirmLabel: 'Restaurar e reiniciar' }))
                    await call('backup.restoreAuto', { file: b.file })
                }}
              >
                Restaurar este
              </Button>
            </li>
          ))}
          {!autos?.length && <li className="text-zinc-500">Nenhum ainda.</li>}
        </ul>
      </div>
      {pending && (
        <Modal open onClose={() => setPending(null)} title="Restaurar backup" testId="restore-dialog">
          <div className="space-y-3 text-sm">
            <div className="break-all text-xs text-zinc-500">{pending.file}</div>
            <ul className="space-y-0.5">
              <li>Tipo: {pending.manifest.kind === 'full' ? 'completo (banco + anexos)' : 'somente banco de dados'}</li>
              {pending.manifest.createdAt && <li>Criado em: {formatDate(pending.manifest.createdAt)}</li>}
              <li>Conteúdo: {pending.manifest.counts.companies} espaço(s), {pending.manifest.counts.projects} projeto(s), {pending.manifest.counts.tasks} tarefa(s), {pending.manifest.counts.attachments} anexo(s)</li>
            </ul>
            <p className="rounded bg-amber-50 p-2 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              Os dados atuais serão substituídos. Uma cópia deles fica guardada em backups/pre-restore. O app reiniciará.
            </p>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setPending(null)}>Cancelar</Button>
              <Button variant="danger" data-testid="restore-ok" onClick={() => call('backup.restore', { token: pending.token })}>Restaurar e reiniciar</Button>
            </div>
          </div>
        </Modal>
      )}
    </Section>
  )
}

export default function SettingsPage() {
  const { data } = useApiQuery('settings.all', {})
  const { data: stats } = useApiQuery('system.dataStats', {})
  const { data: info } = useApiQuery('system.appInfo', {})
  const call = useCall()
  const set = (key: string, value: unknown) => call('settings.set', { key, value })
  return (
    <div className="flex-1 overflow-y-auto">
      <PageHeader title="Configurações" />
      <div className="max-w-3xl space-y-4 p-6">
        <Section title="Aparência">
          <Field label="Tema">
            <Select data-testid="theme-select" value={(data?.theme as string) ?? 'system'} onChange={(e) => set('theme', e.target.value)}>
              <option value="system">Seguir o sistema</option>
              <option value="light">Claro</option>
              <option value="dark">Escuro</option>
            </Select>
          </Field>
        </Section>
        <Section title="Preferências">
          <div className="grid grid-cols-2 gap-3">
            <Field label="“Vencimento próximo” = próximos N dias">
              <Input
                data-testid="near-due-days"
                type="number"
                min={1}
                max={30}
                value={(data?.nearDueDays as number) ?? 7}
                onChange={(e) => { const n = Math.min(30, Math.max(1, Number(e.target.value) || 1)); set('nearDueDays', n) }}
              />
            </Field>
            <Field label="A semana começa no">
              <Select value={String(data?.weekStartsOn ?? 1)} onChange={(e) => set('weekStartsOn', Number(e.target.value))}>
                <option value="1">Segunda-feira</option>
                <option value="0">Domingo</option>
              </Select>
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={data?.showStartMarkers !== false} onChange={(e) => set('showStartMarkers', e.target.checked)} /> Mostrar datas de início no calendário
          </label>
        </Section>
        <LabelsSection />
        <Section title="Dados" id="settings-data">
          <div className="text-sm">
            <div>Pasta de dados: <code data-testid="data-path" className="break-all rounded bg-zinc-100 px-1 dark:bg-zinc-800">{stats?.dataPath}</code></div>
            <div className="mt-1 text-zinc-500">
              Banco: {formatBytes(stats?.dbBytes ?? 0)} · Anexos: {stats?.attachmentCount ?? 0} arquivo(s), {formatBytes(stats?.attachmentsBytes ?? 0)}
            </div>
            <div className="mt-1 text-xs text-zinc-500">Esta pasta não faz parte da instalação: atualizar ou reinstalar o app não apaga nada.</div>
          </div>
          <Button size="sm" onClick={() => call('system.openDataFolder', {})}>Abrir pasta</Button>
        </Section>
        <BackupSection />
        <Section title="Sobre">
          <div className="text-sm text-zinc-600 dark:text-zinc-400">
            Personal Task Hub {info?.version} · schema v{info?.schemaVersion} · Electron {info?.electron}
          </div>
        </Section>
      </div>
    </div>
  )
}
