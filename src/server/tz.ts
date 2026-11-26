// Import first in every server entry: dates are computed in APP_TZ (default São Paulo).
process.env.TZ = process.env.APP_TZ ?? 'America/Sao_Paulo'
export {}
