import { PageHeader, Select, Field } from '../../components/ui'
import { useApiQuery, useCall } from '../../lib/queries'

export default function SettingsPage() {
  const { data } = useApiQuery('settings.all', {})
  const call = useCall()
  return (
    <div className="flex-1 overflow-y-auto">
      <PageHeader title="Configurações" />
      <div className="max-w-2xl space-y-6 p-6">
        <section className="space-y-3">
          <h2 className="font-semibold">Aparência</h2>
          <Field label="Tema">
            <Select
              data-testid="theme-select"
              value={(data?.theme as string) ?? 'system'}
              onChange={(e) => call('settings.set', { key: 'theme', value: e.target.value })}
            >
              <option value="system">Seguir o sistema</option>
              <option value="light">Claro</option>
              <option value="dark">Escuro</option>
            </Select>
          </Field>
        </section>
      </div>
    </div>
  )
}
