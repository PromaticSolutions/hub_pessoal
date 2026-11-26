import type { Company } from '@shared/types'
import { useApiQuery } from '../../lib/queries'
import { SIGNED_URL_STALE_MS } from '../../lib/attachments'

export function CompanyLogo({ company, size = 40 }: { company: Company; size?: number }) {
  const { data } = useApiQuery('companies.logoUrl', { id: company.id }, { enabled: !!company.logoPath, staleTime: SIGNED_URL_STALE_MS })
  if (company.logoPath && data) return <img src={data} alt="" className="shrink-0 rounded-md object-cover" style={{ width: size, height: size }} />
  return (
    <div className="flex shrink-0 items-center justify-center rounded-md font-semibold text-white" style={{ width: size, height: size, background: company.color, fontSize: size * 0.45 }}>
      {company.name.slice(0, 1).toUpperCase()}
    </div>
  )
}
