// Same timezone as the server (APP_TZ), set before any module computes dates.
process.env.TZ = process.env.APP_TZ ?? 'America/Sao_Paulo'
