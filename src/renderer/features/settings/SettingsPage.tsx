import { useRef, useState, type ReactNode } from 'react'
import type { ApiMethods } from '@shared/api'
import { SPACE_COLORS } from '@shared/constants'
import { Button, ColorPicker, Field, Input, Modal, PageHeader, Select, useConfirm } from '../../components/ui'
import { useApiQuery, useCall } from '../../lib/queries'
import { TIME_OPTIONS } from '../my-day/BlockForm'
import { api } from '../../lib/api'
import { formatBytes, formatDate } from '../../lib/format'
import { useToast } from '../../components/toast'
import { uploadFiles } from '../../lib/upload'
import { openAsync } from '../../lib/links'
import { DEV_AUTH, signOut } from '../../lib/supabase'

type Manifest = ApiMethods['backup.inspect']['output']

const COUNT_LABELS: Record<string, string> = { companies: 'espaço(s)', projects: 'projeto(s)', tasks: 'tarefa(s)', attachments: 'anexo(s)', ideas: 'ideia(s)', shopping_items: 'item(ns) de compra' }
function countsText(counts: Record<string, number> | undefined): string {
  if (!counts) return ''
  const keys = Object.keys(COUNT_LABELS).filter((k) => k in counts)
  return keys.map((k) => `${counts[k]} ${COUNT_LABELS[k]}`).join(', ')
}

function Section({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return (
    <section className="surface space-y-3 p-5" data-testid={id}>
      <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
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
  const [pending, setPending] = useState<{ manifest: Manifest; key: string; file: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const withBusy = async (label: string, fn: () => Promise<void>) => {
    setBusy(label)
    try {
      await fn()
    } catch (e) {
      if (!(e as { toasted?: boolean }).toasted) toast.error((e as Error).message)
    } finally {
      setBusy(null)
    }
  }
  const download = () =>
    withBusy('Gerando backup…', async () => {
      let counts: Record<string, number> | undefined
      await openAsync(async () => {
        const r = await call('backup.create', {})
        counts = r.manifest.counts
        return r.url
      })
      toast.success(`Backup gerado${counts ? ` (${countsText(counts)})` : ''}`)
    })
  const chooseRestore = (file: File) =>
    withBusy('Enviando e verificando backup…', async () => {
      const [up] = await uploadFiles([file])
      const manifest = await call('backup.inspect', { key: up.key })
      setPending({ manifest, key: up.key, file: file.name })
    })
  const afterRestore = () => {
    toast.success('Backup restaurado.')
    setTimeout(() => window.location.reload(), 800)
  }
  return (
    <Section title="Backup e restauração" id="settings-backup">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        O backup gera um arquivo JSON com todos os dados (os anexos ficam guardados no Storage). Guarde-o em outro disco ou na nuvem.
        Além disso, o app guarda automaticamente uma cópia diária (últimos 30 dias).
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" data-testid="backup-full" disabled={!!busy} onClick={download}>Baixar backup</Button>
        <Button disabled={!!busy} data-testid="backup-restore" onClick={() => fileRef.current?.click()}>Restaurar de arquivo…</Button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,.gz,application/json,application/gzip"
          hidden
          data-testid="backup-restore-input"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void chooseRestore(f) }}
        />
      </div>
      {busy && <div className="text-sm text-indigo-600">{busy}</div>}
      <div>
        <h3 className="mb-1 text-sm font-medium">Backups automáticos</h3>
        <ul className="space-y-1 text-sm" data-testid="auto-backups">
          {autos?.map((b) => (
            <li key={b.key} className="flex items-center gap-3">
              <span>{formatDate(b.createdAt)}</span>
              <span className="text-xs text-zinc-500">{formatBytes(b.size)}</span>
              <Button
                size="sm"
                variant="ghost"
                disabled={!!busy}
                onClick={async () => {
                  if (await confirm({ title: `Restaurar o backup de ${formatDate(b.createdAt)}?`, description: 'Os dados atuais serão substituídos. Uma cópia deles é guardada antes como backup automático. Os anexos atuais são mantidos.', danger: true, confirmLabel: 'Restaurar' }))
                    await withBusy('Restaurando…', async () => { await call('backup.restoreAuto', { key: b.key }); afterRestore() })
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
              {pending.manifest.createdAt && <li>Criado em: {formatDate(pending.manifest.createdAt)}</li>}
              <li>Conteúdo: {countsText(pending.manifest.counts)}</li>
            </ul>
            <p className="rounded bg-amber-50 p-2 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              Os dados atuais serão substituídos. Uma cópia deles é guardada antes como backup automático.
            </p>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setPending(null)}>Cancelar</Button>
              <Button
                variant="danger"
                data-testid="restore-ok"
                disabled={!!busy}
                onClick={() => withBusy('Restaurando…', async () => { await call('backup.restore', { key: pending.key }); setPending(null); afterRestore() })}
              >
                Restaurar
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </Section>
  )
}

/** system.dataStats shape is "counts + Storage bytes"; read it loosely so the page survives small server-side naming changes. */
type LooseStats = { counts?: Record<string, number>; storageBytes?: number; attachmentCount?: number; attachmentsBytes?: number }

export default function SettingsPage() {
  const { data } = useApiQuery('settings.all', {})
  const { data: stats } = useApiQuery('system.dataStats', {})
  const { data: info } = useApiQuery('system.appInfo', {})
  const s = stats as unknown as LooseStats | undefined
  const call = useCall()
  const set = (key: string, value: unknown) => call('settings.set', { key, value })
  const workday = (data?.['myDay.workday'] as { start: string; end: string } | undefined) ?? { start: '08:00', end: '18:00' }
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
          <div className="grid grid-cols-2 gap-3">
            <Field label="Meu Dia — início do expediente">
              <Select data-testid="workday-start" value={workday.start} onChange={(e) => set('myDay.workday', { ...workday, start: e.target.value })}>
                {TIME_OPTIONS.filter((x) => x < workday.end).map((x) => <option key={x} value={x}>{x}</option>)}
              </Select>
            </Field>
            <Field label="Meu Dia — fim do expediente">
              <Select data-testid="workday-end" value={workday.end} onChange={(e) => set('myDay.workday', { ...workday, end: e.target.value })}>
                {TIME_OPTIONS.filter((x) => x > workday.start).map((x) => <option key={x} value={x}>{x}</option>)}
              </Select>
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={data?.showStartMarkers !== false} onChange={(e) => set('showStartMarkers', e.target.checked)} /> Mostrar datas de início no calendário
          </label>
        </Section>
        <LabelsSection />
        <Section title="Dados" id="settings-data">
          <div className="text-sm" data-testid="data-path">
            {s?.counts && <div>{countsText(s.counts)}</div>}
            <div className="mt-1 text-zinc-500">
              Uso do Storage: {formatBytes(s?.storageBytes ?? s?.attachmentsBytes ?? 0)}
              {s?.attachmentCount !== undefined && <> · Anexos: {s.attachmentCount} arquivo(s)</>}
            </div>
            <div className="mt-1 text-xs text-zinc-500">Os dados ficam na nuvem (Supabase) e são os mesmos em qualquer computador em que você entrar.</div>
          </div>
        </Section>
        <BackupSection />
        <Section title="Sobre">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-zinc-600 dark:text-zinc-400">
              Personal Task Hub {info?.version} · schema v{info?.schemaVersion}
            </div>
            {!DEV_AUTH && <Button size="sm" data-testid="sign-out" onClick={() => { void signOut() }}>Sair</Button>}
          </div>
        </Section>
      </div>
    </div>
  )
}
