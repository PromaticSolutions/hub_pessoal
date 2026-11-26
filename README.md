# Personal Task Hub

Central pessoal de tarefas, empresas e projetos. Site (Vercel + Supabase) com login de um único usuário: os dados ficam no Supabase (Postgres + Storage) e são os mesmos em qualquer computador.

A versão desktop antiga (Electron + SQLite) está na tag `desktop-v2`.

## Módulos

- **Abas** no topo: Ctrl+clique ou botão do meio abre em nova aba; Alt+T nova aba, Alt+W fecha, Alt+PageDown/PageUp alterna, Alt+1…9 vai direto. As abas abertas voltam quando você reabre o site (neste navegador).
- **Dashboard personalizável**: vários dashboards (Geral, Profissional, Pessoal, Financeiro…), blocos de indicadores, gráficos (barras, linhas, pizza, rosca, tabela), listas e projetos. Use "Editar layout" para arrastar, redimensionar, adicionar e configurar blocos.
- **Meu Dia**: agenda diária em blocos de horário. Aloque tarefas existentes (sem copiar) ou atividades livres; acompanhe concluídas, horas planejadas e intervalos livres.
- **Minha semana**: colunas por dia ou lista cronológica.
- **Todas as Tarefas**: lista ou cards com filtros e edição em massa (status, prioridade, vencimento, mover, arquivar, excluir).
- **Ideias**: registre ideias e transforme-as em tarefa ou projeto.
- **Lista de Compras**: itens com quantidade, preço e categoria; total estimado dos pendentes.
- **Kanban** com cores por quadro, coluna e cartão.

## Backup

Em **Configurações → Backup e restauração**:

- **Baixar backup** → um `.json.gz` com todos os dados (os anexos ficam no Storage). Guarde em outro disco/nuvem.
- **Restaurar de arquivo…** → envia o `.json.gz`, mostra o resumo, guarda os dados atuais como backup automático e recarrega.
- Backups automáticos diários (cron da Vercel, últimos 30 dias), cada um com "Restaurar este".

## Desenvolvimento local

```bash
npm install
npm run dev        # http://localhost:5173 — banco PGlite e arquivos em .data/dev, sem login
npm test           # testes unitários (Vitest, PGlite)
npm run e2e        # ponta a ponta (Playwright + Chrome) contra o servidor de dev na porta 5199 (.data/e2e)
npm run typecheck
npm run build      # gera .vercel/output (Build Output API v3)
```

`HUB_DATA_DIR` muda a pasta de dados do dev. O e2e usa o Google Chrome instalado (`PW_CHANNEL=` usa o Chromium do Playwright).

## Publicar (Vercel)

1. Na Vercel: **Add New → Project**, importe o repositório e clique em **Deploy** (o `vercel.json` já define build e instalação; Node 22).
2. Em **Settings → Environment Variables** defina:

| Variável | O quê |
|---|---|
| `DATABASE_URL` | Postgres do Supabase pelo pooler (porta 6543) |
| `SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_ANON_KEY` | chave anon/publishable |
| `SUPABASE_SERVICE_ROLE_KEY` | chave service_role (secreta) |
| `ALLOWED_EMAIL` | único email que pode entrar |
| `APP_TZ` | fuso das datas (padrão `America/Sao_Paulo`) |
| `CRON_SECRET` | segredo do cron diário (a Vercel envia no `Authorization`) |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | opcionais: por padrão o site usa `SUPABASE_URL` e `SUPABASE_ANON_KEY` |

3. Faça um novo deploy depois de mudar variáveis (as `VITE_*`/públicas entram no build).
4. Crie o usuário de login no Supabase (**Authentication → Users**) com o email de `ALLOWED_EMAIL`.

## Banco e importação

Os comandos leem `.env.local` (nunca vai para o Git): `DATABASE_URL_SESSION` (porta 5432), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

```bash
npm run db:migrate                     # aplica o esquema no Postgres do Supabase
npm run import:sqlite -- [--db <hub.db>] [--files <pasta de dados>] [--replace]
```

A importação copia o banco SQLite e os arquivos do app desktop (padrão `~/.local/share/personal-task-hub`) para o Supabase e confere tabela por tabela; termina com erro se algo diferir.

Atalhos: `Ctrl+K` busca global · `N` novo cartão no quadro · `Esc` fecha o modal · `Ctrl+Enter` envia comentário.
