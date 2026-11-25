# Personal Task Hub — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App desktop local (Electron + SQLite) para gerenciar espaços (Pessoal/empresas), pastas, projetos, quadros Kanban e tarefas, com dashboard, calendário, busca, anexos e backup — sem nunca perder dados.

**Architecture:** Processo principal do Electron é dono do banco (better-sqlite3) e dos arquivos; expõe serviços por um único canal IPC tipado e validado (zod). O renderer React consome via TanStack Query e invalida todas as consultas após cada mutação. Dados em `~/.local/share/personal-task-hub/`, fora da instalação.

**Tech Stack:** Electron 45.5, electron-vite 6, React 19, TypeScript 5, react-router-dom 7 (HashRouter), @tanstack/react-query 5, Tailwind CSS 4 (@tailwindcss/vite), Radix UI primitives, lucide-react, @dnd-kit (core 6, sortable 10, utilities 3), Recharts 3, date-fns 4 (pt-BR), zod 4, better-sqlite3 **12.x**, archiver 8 + extract-zip (backup), react-markdown 10 + remark-gfm, @fontsource-variable/inter, Vitest **4.x**, @playwright/test 1.65, electron-builder 26.

**Spec:** `docs/superpowers/specs/2026-11-25-personal-task-hub-design.md` (as seções citadas como §N referem-se a ele).

## Global Constraints

- Node do sistema é **v20.20** (Debian 12). Não usar pacotes que exijam Node ≥ 22 no tooling: `better-sqlite3@^12.11` (não 13), `vitest@^4.1` (não 5). Vite 7 (via electron-vite 6) aceita Node 20.19+.
- Testes unitários rodam **dentro do Node do Electron**: `ELECTRON_RUN_AS_NODE=1 electron node_modules/vitest/vitest.mjs run` — um único binário nativo do better-sqlite3 (ABI do Electron), recompilado por `electron-builder install-app-deps` no `postinstall`.
- Caminho do projeto contém espaço (`PROJETOS PESSOAIS`): sempre aspas em scripts shell.
- Pasta de dados: env `PTH_DATA_DIR` se definida; senão, empacotado → `${XDG_DATA_HOME:-~/.local/share}/personal-task-hub`; em dev (`!app.isPackaged`) → `.../personal-task-hub-dev` (dev nunca toca os dados reais).
- Proibido: localStorage/sessionStorage para dados; dados mockados; botões sem ação; Google Fonts/CDN (tudo offline).
- `PRAGMA journal_mode=WAL; synchronous=FULL; foreign_keys=ON; busy_timeout=5000`.
- Toda operação que grava mais de uma linha roda em `db.transaction(...)`.
- Caminhos de arquivo no banco são **relativos** à pasta de dados.
- UI em pt-BR; datas com date-fns locale `ptBR`; semana começa na segunda (`weekStartsOn` padrão 1).
- Enums (valores exatos no banco e no código): prioridade `'low'|'medium'|'high'|'urgent'` (rótulos Baixa/Média/Alta/Urgente); categoria de coluna/status `'todo'|'in_progress'|'done'` (A fazer/Em andamento/Concluído); status de projeto `'planned'|'active'|'paused'|'completed'` (Planejado/Ativo/Pausado/Concluído); status de empresa `'active'|'archived'`.
- Datas: `start_at`/`due_at` são `'YYYY-MM-DD'` ou `'YYYY-MM-DDTHH:mm'` (hora local); carimbos (`created_at` etc.) são `'YYYY-MM-DDTHH:mm:ss.sssZ'` (UTC ISO). Data sem hora vence às 23:59 do dia.
- Colunas padrão de quadro novo, nesta ordem: Backlog (todo), A fazer (todo), Em andamento (in_progress), Em revisão (in_progress), Concluído (done).
- "Vencimento próximo" padrão = 7 dias (setting `nearDueDays`). Backups automáticos: 1/dia, manter 14. Anexos excluídos: manter 30 dias em `attachments-deleted/`.
- Renderer: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. Instância única.
- Cada mudança com teste; commits frequentes com mensagens convencionais (`feat:`, `fix:`, `test:`, `chore:`).

- **Escopo revisado pelo usuário:** sem tela "Minhas tarefas" (rota `/tasks` removida); "Minha semana" é página própria em `/week`. Visual simples e funcional (Tailwind básico, sem polimento); priorizar velocidade. e2e só nos fluxos de persistência/durabilidade (Tasks 1, 5, 10, 13, 22, 25); demais telas verificadas manualmente rodando o app.

## Review Focus

1. **Texto de busca com sintaxe FTS** (`"`, `*`, `-`, `OR`, `NEAR(`, `:`) ou acentos → a busca nunca lança erro; trata tudo como palavras literais. Teste em Task 19.
2. **Anexos com mesmo nome, espaços, acentos e arquivos grandes** → cada um armazenado em caminho único, nenhum sobrescreve outro, nome original preservado na UI. Teste em Task 12.
3. **Caminhos com espaço e aspas simples** (pasta de dados ou destino de backup como `/tmp/x/it's dir/`) → `VACUUM INTO` e cópias funcionam (escape correto). Teste em Task 4 e Task 22.
4. **Tarefa com vencimento só-data igual a hoje** → não aparece como atrasada até virar o dia; aparece em "vencimento próximo". Teste em Task 14.
5. **Restaurar backup inválido** (zip corrompido, sem manifest, schema mais novo que o app, banco que falha `integrity_check`) → rejeitado com mensagem clara, dados atuais intactos. Teste em Task 22.

---

## Estrutura de arquivos

```
package.json · electron.vite.config.ts · electron-builder.yml · tsconfig.json
tsconfig.node.json · tsconfig.web.json · vitest.config.ts · playwright.config.ts
build/icon.png (512x512)
scripts/install-linux.sh
src/shared/
  types.ts          # tipos de entidade e inputs
  api.ts            # mapa ApiMethods (método → input/output)
  dates.ts          # helpers puros de data (usados no main e no renderer)
  constants.ts      # enums, rótulos pt-BR, DEFAULT_COLUMNS, cores padrão
src/main/
  index.ts          # ciclo de vida, janela, single-instance, startup/shutdown
  paths.ts          # getDataRoot, resolveDataPaths, ensureDataDirs
  context.ts        # AppContext
  db/connection.ts  # openDatabase
  db/migrate.ts     # runMigrations
  db/migrations/001_initial.sql
  db/migrations/index.ts
  db/sqlutil.ts     # sqlQuote, vacuumInto
  lib/position.ts   # positionBetween, needsRenormalize
  lib/errors.ts     # AppError
  lib/activity.ts   # logActivity
  services/{settings,companies,folders,projects,boards,columns,tasks,taskQuery,
            labels,comments,checklists,attachments,dashboard,calendar,search,
            backup,maintenance}.ts
  ipc/registry.ts   # registerHandler, dispatch
  ipc/handlers.ts   # registra todos os métodos com schemas zod
  ipc/schemas.ts
src/preload/index.ts
src/renderer/
  index.html · main.tsx · styles.css
  lib/api.ts · lib/queries.ts · lib/format.ts
  app/App.tsx · app/routes.tsx · app/Layout.tsx · app/Sidebar.tsx · app/SpaceTree.tsx
  components/ui/*   # Button, Input, Dialog, ConfirmDialog, Menu, Select, Tabs,
                    # ColorPicker, PriorityBadge, SpaceDot, EmptyState, DateInput
  features/dashboard/ · features/companies/ · features/projects/ · features/board/
  features/task-modal/ · features/my-tasks/ · features/calendar/ · features/files/
  features/search/ · features/settings/
tests/helpers/db.ts · tests/helpers/app.ts
tests/unit/*.test.ts · tests/e2e/*.spec.ts
```

---

## Fase 1 — Fundação

### Task 1: Scaffold do projeto, janela e infraestrutura de testes

**Files:**
- Create: `package.json`, `electron.vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `tsconfig.web.json`, `vitest.config.ts`, `playwright.config.ts`, `.gitignore`, `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/index.html`, `src/renderer/main.tsx`, `src/renderer/styles.css`, `src/renderer/app/App.tsx`
- Test: `tests/unit/smoke.test.ts`, `tests/e2e/launch.spec.ts`, `tests/helpers/app.ts`

**Interfaces:**
- Produces: scripts npm `dev`, `build` (electron-vite build → `out/`), `test`, `e2e` (`npm run build && playwright test`), `typecheck`, `dist` (Task 24); helper `launchApp(dataDir: string): Promise<{ app: ElectronApplication; page: Page }>` em `tests/helpers/app.ts` (lança `out/main/index.js` com `env.PTH_DATA_DIR = dataDir`); `makeTempDir(prefix: string): string`.

- [ ] **Step 1:** `git init` na raiz; `.gitignore` com `node_modules/ out/ dist/ test-results/ playwright-report/`.
- [ ] **Step 2:** Criar `package.json` (`"name": "personal-task-hub"`, `"productName": "Personal Task Hub"`, `"main": "out/main/index.js"`, sem `"type": "module"` — saída CJS padrão do electron-vite) com as dependências da Tech Stack e scripts:
  ```json
  "postinstall": "electron-builder install-app-deps",
  "dev": "electron-vite dev",
  "build": "electron-vite build",
  "typecheck": "tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json",
  "test": "ELECTRON_RUN_AS_NODE=1 electron node_modules/vitest/vitest.mjs run",
  "e2e": "npm run build && playwright test"
  ```
  Rodar `npm install`. Esperado: termina sem erro e `install-app-deps` reporta rebuild do `better-sqlite3`.
- [ ] **Step 3:** `electron.vite.config.ts`: main e preload com `externalizeDepsPlugin()`; renderer com `@vitejs/plugin-react` e `@tailwindcss/vite`. `vitest.config.ts`: `environment: 'node'`, `include: ['tests/unit/**/*.test.ts']`, alias `@shared` → `src/shared`, `@main` → `src/main`. Mesmos aliases nos tsconfigs e no electron-vite.
- [ ] **Step 4:** `src/main/index.ts` mínimo: `BrowserWindow` 1280×800, `minWidth 960`, `minHeight 640`, `show: false` + `ready-to-show`, `webPreferences: { preload, contextIsolation: true, nodeIntegration: false, sandbox: true }`, título "Personal Task Hub", menu nativo removido (`Menu.setApplicationMenu(null)`). Renderer mostra `<h1>Personal Task Hub</h1>`; `styles.css` importa `tailwindcss` e `@fontsource-variable/inter`.
- [ ] **Step 5:** Escrever testes:
  ```ts
  // tests/unit/smoke.test.ts
  import Database from 'better-sqlite3'
  test('better-sqlite3 carrega no runtime do Electron', () => {
    const db = new Database(':memory:')
    expect(db.prepare('select sqlite_version() v').get()).toHaveProperty('v')
    expect(process.versions.electron).toBeDefined()
  })
  // tests/e2e/launch.spec.ts
  test('abre a janela principal', async () => {
    const { app, page } = await launchApp(makeTempDir('pth-e2e-'))
    await expect(page).toHaveTitle('Personal Task Hub')
    await app.close()
  })
  ```
- [ ] **Step 6:** Rodar `npm test` e `npm run e2e`. Esperado: ambos PASS. Rodar `npm run typecheck`: sem erros.
- [ ] **Step 7:** Commit `chore: scaffold electron + react + sqlite`.

### Task 2: Pasta de dados, conexão, migrações e schema inicial

**Files:**
- Create: `src/main/paths.ts`, `src/main/db/connection.ts`, `src/main/db/migrate.ts`, `src/main/db/sqlutil.ts`, `src/main/db/migrations/001_initial.sql`, `src/main/db/migrations/index.ts`, `src/shared/types.ts`, `src/shared/constants.ts`, `tests/helpers/db.ts`
- Test: `tests/unit/db.test.ts`

**Interfaces:**
- Produces:
  - `type DataPaths = { root; dbFile; attachments; attachmentsDeleted; logos; backupsAuto; backupsPreMigration; backupsPreRestore; restoreStaging; logs: string }`
  - `getDataRoot(): string` (regras em Global Constraints) · `resolveDataPaths(root: string): DataPaths` (`dbFile = root/hub.db`, demais = subpastas homônimas: `attachments`, `attachments-deleted`, `logos`, `backups/auto`, `backups/pre-migration`, `backups/pre-restore`, `restore-staging`, `logs`) · `ensureDataDirs(p: DataPaths): void`
  - `openDatabase(file: string): Database.Database` (aplica pragmas)
  - `LATEST_SCHEMA_VERSION: number` · `runMigrations(db, opts: { preMigrationDir?: string; now?: Date }): { from: number; to: number }` — se `from > 0 && from < LATEST`, faz `vacuumInto(db, <preMigrationDir>/hub-v<from>-<timestamp>.db)` antes; cada migração em transação e seta `PRAGMA user_version`. Se `from > LATEST` lança `AppError('SCHEMA_TOO_NEW')`.
  - `sqlQuote(s: string): string` (dobra aspas simples) · `vacuumInto(db, dest: string): void`
  - `createTestDb(): { db; paths: DataPaths; cleanup(): void }` (tmp dir, ensureDataDirs, openDatabase, runMigrations)
  - Tipos em `shared/types.ts`: `Priority`, `ColumnCategory`, `ProjectStatus`, `CompanyStatus`, `Company`, `Folder`, `Project`, `Board`, `Column`, `Task`, `Label`, `Comment`, `Checklist`, `ChecklistItem`, `Attachment`, `ActivityEntry` (campos = colunas da tabela em camelCase).
  - `DEFAULT_COLUMNS: { name: string; category: ColumnCategory }[]`, `PRIORITY_LABELS`, `CATEGORY_LABELS`, `PROJECT_STATUS_LABELS`, `PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3 }`, `SPACE_COLORS` (10 cores hex).

Schema `001_initial.sql` — tabelas e colunas exatamente como §8 do spec, mais estas decisões:
- `CHECK` em todos os enums. `created_at`/`updated_at` `NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))`.
- FKs: `folders.company_id`, `folders.parent_id`, `projects.company_id`, `boards.project_id`, `columns.board_id`, `tasks.board_id`, `tasks.column_id`, `task_labels.*`, `comments.task_id`, `checklists.task_id`, `checklist_items.checklist_id`, `attachments.task_id`, `attachments.project_id`, `activity_log.task_id` → **ON DELETE CASCADE**; `projects.folder_id` → **ON DELETE SET NULL**.
- `CREATE UNIQUE INDEX one_personal ON companies(is_personal) WHERE is_personal = 1;` e seed: `INSERT INTO companies(name, color, is_personal, position) VALUES ('Pessoal', '#6366F1', 1, 0)`.
- `CHECK ((task_id IS NULL) <> (project_id IS NULL))` em attachments.
- Índices do §8.
- View `v_tasks`: `tasks t JOIN columns c JOIN boards b JOIN projects p JOIN companies co`, expondo todas as colunas de `t` + `c.category AS status`, `c.name AS column_name`, `b.name AS board_name`, `p.id AS project_id`, `p.name AS project_name`, `p.color AS project_color`, `co.id AS company_id`, `co.name AS company_name`, `co.color AS company_color`, `co.is_personal`, `CASE WHEN t.due_at IS NULL THEN NULL WHEN length(t.due_at)=10 THEN t.due_at||'T23:59' ELSE t.due_at END AS due_end`, `(t.archived_at IS NOT NULL OR b.archived_at IS NOT NULL OR p.archived_at IS NOT NULL OR co.status='archived') AS effective_archived`.
- FTS: `CREATE VIRTUAL TABLE search_index USING fts5(entity_type UNINDEXED, entity_id UNINDEXED, title, body, tokenize='unicode61 remove_diacritics 2')`. `rowid = entity_id * 8 + code` com códigos task=1, comment=2, project=3, company=4, attachment=5. Triggers AFTER INSERT/UPDATE/DELETE em tasks (title, description), comments (body→body, title vazio), projects (name, description), companies (name, description), attachments (original_name) mantêm o índice via `DELETE FROM search_index WHERE rowid = ...` + `INSERT`.

- [ ] **Step 1: Escrever os testes**
  ```ts
  test('pragmas aplicados', () => { /* journal_mode 'wal', foreign_keys 1, synchronous 2 */ })
  test('migração inicial cria Pessoal único e user_version = LATEST', () => {
    // companies where is_personal=1 → 1 linha, name 'Pessoal'; inserir outra is_personal=1 → throws
  })
  test('runMigrations é idempotente', () => { /* 2ª chamada → { from: LATEST, to: LATEST } */ })
  test('cria backup pré-migração ao atualizar schema existente', () => {
    // user_version=1 forçado com LATEST simulado via opts; arquivo hub-v1-*.db existe em preMigrationDir
  })
  test('schema mais novo que o app é recusado', () => { /* user_version = LATEST+1 → throws SCHEMA_TOO_NEW */ })
  test('cascade de empresa apaga projeto, quadro, colunas, tarefas e remove do search_index', () => {})
  test('v_tasks calcula status, due_end e effective_archived herdado do projeto', () => {})
  test('vacuumInto funciona com caminho contendo espaço e aspas simples', () => {
    // dest = join(tmp, "it's dir", 'copy.db') → arquivo existe e abre com integrity_check 'ok'
  })
  ```
  Para o teste de pré-migração, `runMigrations` aceita `opts.migrations` (padrão = lista real) para injetar uma migração v2 fictícia **apenas no teste**.
- [ ] **Step 2:** `npm test -- db` → FAIL (módulos inexistentes).
- [ ] **Step 3:** Implementar os arquivos listados. `migrations/index.ts` importa SQL com `?raw` e exporta `migrations: { version: number; name: string; sql: string }[]`.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `feat(db): data dir, connection, migrations and initial schema`.

### Task 3: Posições fracionárias, erros, histórico e canal IPC tipado

**Files:**
- Create: `src/main/lib/position.ts`, `src/main/lib/errors.ts`, `src/main/lib/activity.ts`, `src/main/context.ts`, `src/main/ipc/registry.ts`, `src/shared/api.ts`, `src/renderer/lib/api.ts`
- Modify: `src/preload/index.ts`
- Test: `tests/unit/position.test.ts`, `tests/unit/ipc.test.ts`

**Interfaces:**
- Produces:
  - `positionBetween(before: number | null, after: number | null): number` → ambos null: `1024`; só before: `before + 1024`; só after: `after / 2`; ambos: `(before + after) / 2`.
  - `needsRenormalize(before: number | null, after: number | null): boolean` → `true` se ambos definidos e `after - before < 1e-6`.
  - `renormalize(db, table: 'columns'|'tasks'|'boards'|'projects'|'folders'|'companies'|'checklists'|'checklist_items', scopeWhere: string, params: unknown[]): void` → reescreve posições como 1024, 2048, … na ordem atual.
  - `class AppError extends Error { code: string }` — códigos usados: `NOT_FOUND`, `VALIDATION`, `FORBIDDEN` (ex.: excluir Pessoal), `CONFLICT`, `SCHEMA_TOO_NEW`, `INVALID_BACKUP`.
  - `logActivity(db, e: { entityType: 'task'|'project'|'company'|'board'; entityId: number; taskId?: number | null; action: string; field?: string; oldValue?: unknown; newValue?: unknown; at?: string }): void` (valores serializados com `JSON.stringify` quando não-string).
  - `type AppContext = { db: Database.Database; paths: DataPaths; now: () => Date }`
  - `interface ApiMethods { [method: string]: { input: unknown; output: unknown } }` — cada task seguinte acrescenta entradas (`'companies.list': { input: {...}; output: Company[] }`, etc.).
  - `registerHandler<K extends keyof ApiMethods>(method: K, schema: z.ZodType<ApiMethods[K]['input']>, fn: (ctx: AppContext, input) => ApiMethods[K]['output'] | Promise<...>): void` · `dispatch(ctx, method: string, input: unknown): Promise<{ ok: true; data: unknown } | { ok: false; error: { code: string; message: string } }>` — valida com zod (falha → `VALIDATION`), captura `AppError` e erros genéricos (`INTERNAL`, registra em `logs/main.log`).
  - Main: `ipcMain.handle('api', (_e, method, input) => dispatch(ctx, method, input))`.
  - Preload expõe `window.api = { invoke(method, input), getPathForFile(file: File): string (webUtils.getPathForFile) }` e tipagem global em `src/renderer/env.d.ts`.
  - Renderer: `api<K extends keyof ApiMethods>(method: K, input: ApiMethods[K]['input']): Promise<ApiMethods[K]['output']>` — desembrulha o envelope e lança `ApiError { code; message }`.

- [ ] **Step 1: Testes**
  ```ts
  test('positionBetween mantém ordem estrita em 60 inserções no mesmo ponto com renormalização', () => {
    // simula lista [1024, 2048]; insere 60x entre os dois primeiros; quando needsRenormalize → renormaliza;
    // ao final as posições estão estritamente crescentes e na ordem de inserção esperada
  })
  test('dispatch retorna VALIDATION para input inválido', async () => {})
  test('dispatch retorna NOT_FOUND quando o handler lança AppError', async () => {})
  test('dispatch retorna INTERNAL e não vaza stack para erro genérico', async () => {})
  test('logActivity grava old/new serializados', () => {})
  ```
- [ ] **Step 2:** Rodar → FAIL. **Step 3:** Implementar. **Step 4:** Rodar → PASS.
- [ ] **Step 5:** Commit `feat(core): fractional positions, typed IPC and activity log`.

### Task 4: Ciclo de vida seguro — instância única, verificação de integridade, backup diário, desligamento limpo

**Files:**
- Create: `src/main/services/maintenance.ts`
- Modify: `src/main/index.ts`
- Test: `tests/unit/maintenance.test.ts`, `tests/e2e/durability.spec.ts`

**Interfaces:**
- Consumes: `openDatabase`, `runMigrations`, `vacuumInto`, `resolveDataPaths`, `ensureDataDirs`.
- Produces:
  - `quickCheck(db): boolean` (`PRAGMA quick_check` = 'ok')
  - `runDailyAutoBackup(db, paths, now: Date, keep = 14): string | null` → cria `backups/auto/hub-YYYY-MM-DD.db` se ainda não existe o de hoje; apaga os mais antigos além de `keep`; retorna caminho criado ou null.
  - `listAutoBackups(paths): { file: string; date: string; sizeBytes: number }[]` (mais novo primeiro)
  - `purgeDeletedAttachments(paths, now: Date, days = 30): number` (remove arquivos em `attachments-deleted/` com mtime mais velho que `days`)
  - `closeDatabase(db): void` → `PRAGMA wal_checkpoint(TRUNCATE)` + `db.close()`
  - Sequência de startup em `index.ts`: `requestSingleInstanceLock` (falhou → `app.quit()`; `second-instance` → foca/restaura janela) → `ensureDataDirs` → `openDatabase` → `quickCheck` (falhou → `dialog.showMessageBoxSync` "O banco de dados parece danificado." com botões "Restaurar último backup automático" / "Sair"; restaurar = fechar, mover `hub.db*` para `backups/pre-restore/corrupted-<ts>/`, copiar o backup mais recente para `hub.db`, reabrir) → `runMigrations({ preMigrationDir })` (erro → diálogo com a mensagem e sair sem gravar) → `runDailyAutoBackup` → `purgeDeletedAttachments` → registrar handlers → criar janela. `before-quit` → `closeDatabase`.

- [ ] **Step 1: Testes**
  ```ts
  test('runDailyAutoBackup cria um por dia e mantém só 14', () => {
    // 20 dias simulados (now avançando) → 14 arquivos; 2ª chamada no mesmo dia → null
  })
  test('backup automático é íntegro e contém os dados', () => {})
  test('purgeDeletedAttachments remove só arquivos com mais de 30 dias', () => { /* utimesSync para envelhecer */ })
  test('quickCheck retorna false para arquivo de banco corrompido', () => { /* sobrescrever bytes no meio do arquivo */ })
  ```
  (Os e2e de durabilidade — kill -9 e segunda instância — ficam em `tests/e2e/durability.spec.ts` na Task 5, porque usam `settings.set/get`.)
- [ ] **Step 2:** Rodar → FAIL. **Step 3:** Implementar. **Step 4:** Rodar unit → PASS.
- [ ] **Step 5:** Commit `feat(main): safe startup, integrity check, daily backups, clean shutdown`.

---

## Fase 2 — Shell da interface

### Task 5: Settings, layout, sidebar, rotas, tema e componentes base

**Files:**
- Create: `src/main/services/settings.ts`, `src/main/ipc/handlers.ts`, `src/main/ipc/schemas.ts`, `src/renderer/lib/queries.ts`, `src/renderer/lib/format.ts`, `src/renderer/app/{routes.tsx,Layout.tsx,Sidebar.tsx}`, `src/renderer/components/ui/*` (lista na Estrutura), páginas placeholder **com estado vazio real** (não mocks) para cada rota
- Test: `tests/unit/settings.test.ts`, `tests/e2e/navigation.spec.ts`

**Interfaces:**
- Produces:
  - `getSetting<T>(db, key: string, fallback: T): T` · `setSetting(db, key: string, value: unknown): void` · `getAllSettings(db): Record<string, unknown>`
  - `SETTINGS_DEFAULTS = { theme: 'system', nearDueDays: 7, weekStartsOn: 1, showStartMarkers: true }` em `shared/constants.ts`
  - API: `'settings.get' {key}→unknown`, `'settings.set' {key,value}→void`, `'settings.all' {}→Record<string,unknown>`, `'system.dataPath' {}→string`, `'system.openDataFolder' {}→void`, `'system.pickFiles' {multiple:boolean, images?:boolean}→string[]`, `'system.pickSavePath' {defaultName:string}→string|null`, `'system.pickOpenPath' {extensions:string[]}→string|null`.
  - Renderer: `useApiQuery(method, input, opts?)` (queryKey = `[method, input]`) e `useApiMutation(method)` (no `onSuccess` chama `queryClient.invalidateQueries()` — invalida tudo, decisão consciente: banco local é rápido); `formatDate(iso)`, `formatRelativeDue(dueAt, now)`.
  - Rotas (HashRouter): `/` Dashboard · `/week` · `/calendar` · `/files` · `/companies` · `/spaces/:companyId` · `/projects/:projectId` · `/projects/:projectId/boards/:boardId` · `/search` · `/settings`. Query param global `?task=<id>` abre o modal do card (host montado no `Layout`, Task 13).
  - `ConfirmDialog` props: `{ title; description; confirmLabel; danger?: boolean; requireText?: string; onConfirm(): void }` — com `requireText`, o botão só habilita quando o texto digitado é igual.
  - Tema: classe `dark` em `<html>`, a partir do setting `theme` + `matchMedia('(prefers-color-scheme: dark)')`. Tokens de cor em `styles.css` (`@theme` + variante `.dark`). Visual: fundo neutro, sidebar 248px, texto 14px, bordas 1px sutis, raio 8px, sem sombras pesadas (referência Linear).
  - Sidebar: busca (abre paleta, Task 20), itens Dashboard / Minha semana / Calendário / Arquivos / Empresas, separador "ESPAÇOS" (árvore — Task 8), Configurações no rodapé. `data-testid="nav-<rota>"`.
  - Última rota salva em setting `lastRoute` e restaurada ao abrir.

- [ ] **Step 1:** Testes: settings get/set/default/JSON roundtrip; e2e: clicar em cada `nav-*` mostra o cabeçalho da página correspondente; trocar tema para escuro persiste após reiniciar; última rota é restaurada. Em `tests/e2e/durability.spec.ts`:
  ```ts
  test('dados confirmados sobrevivem a kill -9', async () => {
    // launchApp(dir); page.evaluate(() => window.api.invoke('settings.set', { key: 'probe', value: 42 }))
    // process.kill(app.process().pid!, 'SIGKILL'); launchApp(dir) de novo → settings.get('probe') === 42
  })
  test('segunda instância encerra e foca a primeira', async () => {
    // com o app aberto, lançar outro com mesmo dataDir → o 2º processo sai com código 0 em < 5 s
  })
  ```
- [ ] **Step 2:** Rodar → FAIL. **Step 3:** Implementar. **Step 4:** `npm test && npm run e2e` → PASS.
- [ ] **Step 5:** Commit `feat(ui): app shell, routing, theme and settings`.

---

## Fase 3 — Espaços, pastas e projetos

### Task 6: Serviço de empresas (espaços)

**Files:**
- Create: `src/main/services/companies.ts`
- Modify: `src/main/ipc/handlers.ts`, `src/main/ipc/schemas.ts`, `src/shared/api.ts`
- Test: `tests/unit/companies.test.ts`

**Interfaces:**
- Produces (todas recebem `ctx: AppContext` como 1º parâmetro):
  - `listCompanies(ctx, { includeArchived?: boolean }): CompanySummary[]` — `CompanySummary = Company & { activeProjects: number; openTasks: number; overdueTasks: number }`; Pessoal sempre primeiro, depois `position`.
  - `getCompany(ctx, id): Company` · `createCompany(ctx, { name; description?; color }): Company` · `updateCompany(ctx, id, patch: Partial<{ name; description; color }>): Company`
  - `setCompanyLogo(ctx, id, sourcePath: string | null): Company` → copia para `logos/<id>-<uuid><ext>`, remove o anterior; null remove.
  - `archiveCompany(ctx, id)` / `restoreCompany(ctx, id)` → status + archived_at; `FORBIDDEN` para Pessoal.
  - `getCompanyDeletionImpact(ctx, id): { projects: number; tasks: number; attachments: number }`
  - `deleteCompany(ctx, id): void` → `FORBIDDEN` para Pessoal; coleta caminhos de anexos do escopo, apaga em transação, depois move arquivos para `attachments-deleted/` (via `moveToDeleted` da Task 12 — até lá, implemente `moveToDeleted(paths, relPath)` aqui em `services/attachments.ts` e reutilize) e apaga o logo.
  - `reorderCompany(ctx, id, { beforeId: number | null; afterId: number | null })`
  - API: `'companies.list'`, `'companies.get'`, `'companies.create'`, `'companies.update'`, `'companies.setLogo'`, `'companies.archive'`, `'companies.restore'`, `'companies.deletionImpact'`, `'companies.delete'`, `'companies.reorder'` (inputs = parâmetros acima; `id` vai no objeto).
  - Toda alteração registra `logActivity` com `entityType: 'company'`.

- [ ] **Step 1: Testes**: criar/editar; nome vazio → VALIDATION; arquivar/restaurar; Pessoal não arquiva nem exclui (FORBIDDEN); deletionImpact conta corretamente; delete remove tudo e move arquivo de anexo para `attachments-deleted/`; setLogo copia arquivo e troca o anterior; listCompanies conta tarefas abertas/atrasadas (usa `now` do ctx).
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5:** Commit `feat(companies): company/space service`.

### Task 7: Serviços de pastas e projetos

**Files:**
- Create: `src/main/services/folders.ts`, `src/main/services/projects.ts`, `src/main/services/boards.ts` (só `createBoard` nesta task)
- Modify: handlers/schemas/api
- Test: `tests/unit/folders.test.ts`, `tests/unit/projects.test.ts`

**Interfaces:**
- Produces:
  - `type SpaceTree = { company: Company; folders: FolderNode[]; projects: Project[] }[]`, `FolderNode = Folder & { children: FolderNode[]; projects: Project[] }` — `getSpaceTree(ctx, { includeArchived?: boolean }): SpaceTree` (alimenta a sidebar).
  - Pastas: `createFolder(ctx, { companyId; parentId: number | null; name }): Folder` · `updateFolder(ctx, id, { name?; color? })` · `moveFolder(ctx, { id; companyId; parentId: number | null; beforeId; afterId })` (recusa `VALIDATION` se `parentId` for a própria pasta ou descendente, ou de outro espaço; mover para outro espaço leva junto subpastas e projetos — atualiza `company_id` recursivamente) · `archiveFolder` / `restoreFolder` · `deleteFolder(ctx, id)` → filhos (pastas e projetos) sobem para `parent_id` da pasta excluída, depois apaga.
  - Projetos: `createProject(ctx, { companyId; folderId: number | null; name; description?; color; startDate?; dueDate?; status? = 'active' }): Project` → cria também o quadro "Quadro principal" com `DEFAULT_COLUMNS` (mesma transação) · `getProject(ctx, id): ProjectDetail` (`Project & { company: Company; boards: Board[]; taskCounts: { total; done; overdue } }`) · `updateProject` · `moveProject(ctx, { id; companyId; folderId; beforeId; afterId })` (pasta precisa ser do espaço de destino) · `archiveProject` / `restoreProject` · `getProjectDeletionImpact` · `deleteProject` (mesma lógica de anexos da empresa).
  - `createBoard(ctx, { projectId; name }): Board` → cria `DEFAULT_COLUMNS`.
  - API: `'spaces.tree'`, `'folders.create|update|move|archive|restore|delete'`, `'projects.get|create|update|move|archive|restore|deletionImpact|delete'`, `'boards.create'`.

- [ ] **Step 1: Testes**: projeto novo tem 1 quadro com 5 colunas nas categorias certas; mover pasta para dentro de descendente → VALIDATION; mover pasta para outro espaço move projetos e subpastas; excluir pasta sobe conteúdo um nível; projeto com pasta de outro espaço → VALIDATION; árvore exclui arquivados por padrão; deleteProject apaga tarefas e move anexos.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5:** Commit `feat(projects): folders, projects and space tree`.

### Task 8: UI de empresas, espaços, árvore da sidebar e página de projeto

**Files:**
- Create: `src/renderer/app/SpaceTree.tsx`, `src/renderer/features/companies/{CompaniesPage.tsx,CompanyForm.tsx,SpacePage.tsx}`, `src/renderer/features/projects/{ProjectPage.tsx,ProjectForm.tsx,FolderForm.tsx}`, `src/renderer/components/ui/ColorPicker.tsx`
- Test: `tests/e2e/spaces.spec.ts`

**Interfaces:**
- Consumes: APIs das Tasks 6–7.
- Produces (UI, comportamento — §10.1–10.3):
  - `/companies`: grade de cards (logo ou inicial colorida, nome, nº projetos ativos, abertas, atrasadas), alternador Ativas/Arquivadas, botão "Nova empresa" (`data-testid="new-company"`).
  - `CompanyForm` (modal): nome*, descrição, cor (`ColorPicker` com `SPACE_COLORS` + hex livre), logo (escolher imagem/remover), mostra data de cadastro na edição.
  - `/spaces/:companyId`: cabeçalho com cor/logo, mini-indicadores (abertas, atrasadas, projetos ativos), projetos agrupados por pasta (cards), botões "Nova pasta"/"Novo projeto", aba "Arquivados" (pastas/projetos arquivados com Restaurar), menu: editar, arquivar, excluir (ConfirmDialog com `requireText` = nome da empresa e texto com o impacto).
  - `SpaceTree`: espaços → pastas → projetos; expandir/recolher persistido em setting `sidebar.expanded` (array de chaves `c:<id>`/`f:<id>`); drag com dnd-kit para reordenar e mover projeto/pasta entre pastas e espaços (chama `projects.move`/`folders.move`); menu de contexto (clique direito e botão "⋯"): Novo projeto, Nova pasta, Renomear, Cor, Arquivar, Excluir. Ponto colorido por espaço. `data-testid="tree-company-<id>"`, `tree-project-<id>`.
  - `/projects/:projectId`: cabeçalho (cor, nome editável inline, espaço, status `Select`, datas, barra de progresso %), abas Quadros | Arquivos | Sobre. Quadros: lista com criar/renomear/arquivar/excluir e reordenar; abre `/projects/:id/boards/:boardId` (padrão: primeiro quadro). Arquivos: placeholder ligado à Task 21 (mostra lista real via `attachments.list` quando existir). Sobre: descrição (Markdown) e campos.
  - API extra necessária: `'boards.list' {projectId, includeArchived?}→Board[]`, `'boards.update' {id,name}`, `'boards.reorder'`, `'boards.archive|restore|delete'` (implementar em `boards.ts` nesta task, com teste unitário simples em `tests/unit/boards.test.ts`).

- [ ] **Step 1: e2e**: criar empresa "Empresa A" com cor; criar pasta "Clientes" e projeto "CRM" dentro; reiniciar app (mesmo dataDir); árvore mostra Empresa A › Clientes › CRM; abrir projeto mostra "Quadro principal"; arquivar projeto some da árvore e aparece em Arquivados; restaurar volta; excluir empresa exige digitar o nome.
- [ ] **Step 2:** Rodar → FAIL. **Step 3:** Implementar. **Step 4:** `npm run e2e` → PASS; `npm run typecheck` limpo.
- [ ] **Step 5:** Commit `feat(ui): companies, spaces tree and project page`.

---

## Fase 4 — Kanban

### Task 9: Serviço de quadro, colunas e movimentação de tarefas

**Files:**
- Create: `src/main/services/columns.ts`, `src/main/services/tasks.ts` (núcleo)
- Modify: `src/main/services/boards.ts`, handlers/schemas/api
- Test: `tests/unit/board.test.ts`

**Interfaces:**
- Produces:
  - `getBoard(ctx, id, { includeArchived?: boolean }): BoardFull` — `BoardFull = { board: Board; project: Project; company: Company; columns: Column[]; cards: CardSummary[] }`; `CardSummary = { id; columnId; title; priority; dueAt; startAt; position; archivedAt; labels: Label[]; checklistDone: number; checklistTotal: number; commentCount: number; attachmentCount: number; isOverdue: boolean; status: ColumnCategory }`.
  - `createColumn(ctx, { boardId; name; category; afterId?: number | null })` · `updateColumn(ctx, id, { name?; category? })` (mudar categoria reavalia `completed_at` dos cards: vira done → seta now; deixa de ser done → limpa) · `moveColumn(ctx, { id; beforeId; afterId })` · `deleteColumn(ctx, { id; moveTasksTo: number | null })` (com cards e `moveTasksTo` null → apaga os cards, coletando anexos; com destino → move todos para o fim do destino; destino de outro quadro → VALIDATION).
  - `createTask(ctx, { columnId; title; afterId?: number | null; description?; priority? = 'medium'; startAt?; dueAt? }): Task` — `board_id` derivado da coluna; log `created`.
  - `moveTask(ctx, { id; columnId; beforeId: number | null; afterId: number | null }): Task` — permite coluna de outro quadro (atualiza `board_id`); seta/limpa `completed_at` conforme categoria; log `moved` com `{ from: columnName, to: columnName }`; renormaliza quando `needsRenormalize`.
  - `setTaskStatus(ctx, id, status: ColumnCategory): Task` → move para o fim da primeira coluna (por posição) daquela categoria no mesmo quadro; sem coluna dessa categoria → `CONFLICT` "Este quadro não tem coluna de <rótulo>".
  - `isOverdue(dueAt: string | null, status: ColumnCategory, now: Date): boolean` em `shared/dates.ts` (compara `dueEnd(dueAt)` com `toLocalMinute(now)`), mais `dueEnd(dueAt)`, `toLocalMinute(d: Date): string`, `toLocalDate(d: Date): string`.
  - API: `'boards.get'`, `'columns.create|update|move|delete'`, `'tasks.create'`, `'tasks.move'`, `'tasks.setStatus'`.

- [ ] **Step 1: Testes**: mover para coluna done seta completed_at e sair limpa; mudar categoria de coluna reavalia cards; mover entre quadros atualiza board_id; ordem preservada após 3 moves; deleteColumn com destino move cards, sem destino apaga; setTaskStatus sem coluna → CONFLICT; getBoard retorna contagens de checklist/comentário/anexo; `isOverdue('2026-11-25','todo', new Date(2026,10,25,18,0))` → false; com `new Date(2026,10,26,0,1)` → true; done nunca é atrasada.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5:** Commit `feat(board): columns and task movement service`.

### Task 10: UI do quadro Kanban com drag and drop

**Files:**
- Create: `src/renderer/features/board/{BoardPage.tsx,BoardColumn.tsx,TaskCard.tsx,QuickAddCard.tsx,ColumnMenu.tsx,BoardFilters.tsx,dnd.ts}`
- Test: `tests/unit/dnd.test.ts`, `tests/e2e/board.spec.ts`

**Interfaces:**
- Consumes: `boards.get`, `columns.*`, `tasks.create|move`.
- Produces:
  - `computeDrop(cardsByColumn: Record<number, { id: number }[]>, activeId: number, overColumnId: number, overIndex: number): { columnId: number; beforeId: number | null; afterId: number | null }` em `dnd.ts` (puro, testado) — "before" = vizinho acima no destino desconsiderando o próprio card.
  - Igual para colunas: `computeColumnDrop(columnIds: number[], activeId, overIndex): { beforeId; afterId }`.
  - Atualização otimista: ao soltar, aplica a nova ordem no cache de `['boards.get', …]` com `queryClient.setQueryData`, chama a mutação; em erro, desfaz e mostra toast.
  - Card (§10.4): faixa de etiquetas, título, `PriorityBadge` (urgente vermelho, alta laranja, média azul, baixa cinza), data (vermelha se `isOverdue`), `☑ 2/5`, ícones de comentário/anexo com contagem. Clique → `?task=<id>`.
  - `QuickAddCard`: rodapé "+ Adicionar cartão"; Enter cria e mantém o campo aberto; Esc fecha.
  - `ColumnMenu`: renomear (também duplo clique no título), categoria, excluir (se tiver cards: diálogo com `Select` "Mover cartões para…" ou "Excluir cartões").
  - "+ Nova coluna" ao fim; filtros locais (texto, etiqueta, prioridade, mostrar arquivados) aplicados no cliente.
  - Atalho `N` (sem foco em input) abre o QuickAdd da primeira coluna.
  - `data-testid`: `column-<id>`, `card-<id>`, `quick-add-<columnId>`.

- [ ] **Step 1: Testes**: `computeDrop` (mesmo lugar, topo, fim, outra coluna vazia, mover para baixo na mesma coluna); e2e: criar 3 colunas extras, 200 cards via `window.api.invoke('tasks.create', …)` em loop, arrastar um card para outra coluna e outro para o topo (Playwright `dragTo`), reordenar uma coluna, reiniciar → ordem idêntica (comparar arrays de ids por coluna antes e depois).
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5:** Commit `feat(ui): kanban board with persistent drag and drop`.

---

## Fase 5 — Card completo

### Task 11: Detalhe da tarefa, etiquetas, comentários, checklists, histórico, duplicar/arquivar/excluir

**Files:**
- Create: `src/main/services/labels.ts`, `src/main/services/comments.ts`, `src/main/services/checklists.ts`
- Modify: `src/main/services/tasks.ts`, handlers/schemas/api
- Test: `tests/unit/task-detail.test.ts`

**Interfaces:**
- Produces:
  - `getTask(ctx, id): TaskDetail` — `Task & { status; column: Column; board: Board; project: Project; company: Company; labels: Label[]; checklists: (Checklist & { items: ChecklistItem[] })[]; comments: Comment[]; attachments: Attachment[]; isOverdue: boolean }`.
  - `updateTask(ctx, id, patch: Partial<{ title; description; priority; startAt: string | null; dueAt: string | null }>): Task` — registra uma entrada `updated` por campo alterado (`field`, old, new); ignora campos iguais; `startAt > dueAt` → VALIDATION "Início depois do vencimento".
  - `duplicateTask(ctx, id): Task` — regras §9.5; posição logo abaixo; log `created` com `newValue: { duplicatedFrom: id }`.
  - `archiveTask` / `restoreTask` (logs) · `deleteTask(ctx, id)` (coleta anexos → `moveToDeleted`).
  - Labels: `listLabels`, `createLabel({ name; color })` (nome único, case-insensitive → CONFLICT), `updateLabel`, `deleteLabel`, `setTaskLabels(ctx, taskId, labelIds: number[])` (log diff).
  - Comments: `addComment(ctx, { taskId; body })` (log `commented`), `updateComment`, `deleteComment`.
  - Checklists: `addChecklist(ctx, { taskId; title = 'Checklist' })`, `renameChecklist`, `deleteChecklist`, `addChecklistItem(ctx, { checklistId; text })`, `updateChecklistItem(ctx, id, { text?; done? })` (done seta `completed_at`; log `checklist_item_done` quando marca), `moveChecklistItem(ctx, { id; checklistId; beforeId; afterId })`, `deleteChecklistItem`.
  - `listActivity(ctx, taskId): ActivityEntry[]` (mais recente primeiro).
  - API: `'tasks.get|update|duplicate|archive|restore|delete|setLabels'`, `'labels.list|create|update|delete'`, `'comments.add|update|delete'`, `'checklists.add|rename|delete'`, `'checklistItems.add|update|move|delete'`, `'activity.list'`.

- [ ] **Step 1: Testes**: update registra só campos alterados; duplicate copia etiquetas e checklists desmarcados e não copia comentários; datas invertidas → VALIDATION; label duplicada (case-insensitive) → CONFLICT; excluir label remove das tarefas; histórico em ordem; deleteTask some de search_index.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5:** Commit `feat(tasks): task detail, labels, comments, checklists and history`.

### Task 12: Serviço de anexos

**Files:**
- Modify: `src/main/services/attachments.ts`, handlers/schemas/api
- Test: `tests/unit/attachments.test.ts`

**Interfaces:**
- Produces:
  - `addAttachments(ctx, { taskId?: number; projectId?: number; sourcePaths: string[] }): Attachment[]` — copia (não move) cada arquivo para `attachments/YYYY/MM/<uuid>-<nomeSanitizado>` (sanitizar: remove `/` e caracteres de controle, mantém acentos e espaços, corta em 120 chars preservando extensão); `mime_type` por extensão (tabela pequena + `application/octet-stream`); log `attachment_added` quando de tarefa. Cópia com `fs.copyFile` para temp no mesmo diretório + `rename` (atômico); só insere a linha depois da cópia concluída.
  - `listAttachments(ctx, { companyId?; projectId?; taskId?; kind?: 'image'|'pdf'|'document'|'other'; text?; includeArchived? }): AttachmentListItem[]` — inclui `taskTitle`, `projectId`, `projectName`, `companyId`, `companyName`, `companyColor`; anexo de tarefa herda projeto/espaço da tarefa.
  - `openAttachment(ctx, id)` → `shell.openPath(abs)`; arquivo ausente → `NOT_FOUND` "Arquivo indisponível". `revealAttachment(ctx, id)` → `shell.showItemInFolder`.
  - `deleteAttachment(ctx, id)` → remove linha, `moveToDeleted(paths, relPath)` (mesmo caminho relativo dentro de `attachments-deleted/`, `utimesSync` para agora), log `attachment_removed`.
  - `getAttachmentDataUrl(ctx, id, maxBytes = 5_000_000): string | null` (miniatura de imagens no renderer, já que o renderer é sandbox).
  - `restoreMissingAttachments(paths, db): { restored: number; missing: number }` → para cada linha cujo arquivo não existe em `attachments/` mas existe em `attachments-deleted/`, move de volta (usado na Task 22).
  - API: `'attachments.add|list|open|reveal|delete|thumbnail'`.

- [ ] **Step 1: Testes**: dois arquivos `relatório final.pdf` com conteúdos diferentes → dois caminhos distintos e conteúdos preservados; nome com acento e espaço preservado em `original_name`; arquivo de 50 MB copiado com tamanho igual; arquivo de origem continua existindo; delete move para `attachments-deleted/`; `restoreMissingAttachments` traz de volta; open de arquivo ausente → NOT_FOUND; anexo aparece em `search_index` pelo nome.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5:** Commit `feat(attachments): local attachment storage`.

### Task 13: Modal do card

**Files:**
- Create: `src/renderer/features/task-modal/{TaskModalHost.tsx,TaskModal.tsx,DescriptionEditor.tsx,ChecklistSection.tsx,AttachmentsSection.tsx,ActivitySection.tsx,SidePanel.tsx,MoveTaskDialog.tsx,LabelPicker.tsx}`
- Modify: `src/renderer/app/Layout.tsx` (monta `TaskModalHost`)
- Test: `tests/e2e/task-modal.spec.ts`

**Interfaces:**
- Consumes: Tasks 9, 11, 12.
- Produces (layout §10.5):
  - `TaskModalHost` lê `?task=<id>` da URL em qualquer rota; fechar remove o parâmetro (Esc, ✕, clique fora).
  - Autosave: título e descrição salvam no blur e com debounce de 800 ms; selects/datas salvam ao mudar; indicador "Salvo" discreto. Nunca perder digitação ao fechar: fechar força flush do debounce antes.
  - `DescriptionEditor`: textarea Markdown + alternância Editar/Visualizar (react-markdown + remark-gfm).
  - Painel lateral: Status (`tasks.setStatus`), Prioridade, Início/Vencimento (`DateInput` com hora opcional — checkbox "incluir hora"), Etiquetas (`LabelPicker` com criar inline), Projeto/Quadro/Coluna (`MoveTaskDialog` → `tasks.move` para qualquer quadro de qualquer espaço), "Criado em", ações Duplicar / Arquivar ou Restaurar / Excluir (ConfirmDialog).
  - Breadcrumb clicável: Espaço › Projeto › Quadro.
  - Anexos: botão (dialog nativo `system.pickFiles`), soltar arquivos sobre o modal e um `<input type="file" multiple hidden data-testid="attach-input">` — os dois últimos convertem `File` em caminho com `window.api.getPathForFile(file)` e chamam `attachments.add`; miniaturas para imagens; abrir, mostrar na pasta, remover.
  - Atividade: abas Comentários (lista + campo; Ctrl+Enter envia; editar/excluir os próprios) e Histórico (`activity.list`, frases em pt-BR: "Prioridade: Média → Alta", "Movido de A fazer para Em andamento").

- [ ] **Step 1: e2e**: abrir card pelo quadro; editar título, descrição, prioridade Alta, vencimento; criar etiqueta "Cliente"; checklist com 3 itens, marcar 1; comentário; anexar arquivo com `page.setInputFiles('[data-testid=attach-input]', tmpFile)`; fechar; reiniciar; reabrir: tudo igual, histórico lista as mudanças, card no quadro mostra `☑ 1/3`.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5:** Commit `feat(ui): task detail modal`.

---

## Fase 6 — Minha semana

### Task 14: Consulta global de tarefas e agrupamento por semana

**Files:**
- Create: `src/main/services/taskQuery.ts`
- Modify: `src/shared/dates.ts`, handlers/schemas/api
- Test: `tests/unit/task-query.test.ts`, `tests/unit/dates.test.ts`

**Interfaces:**
- Produces:
  - `type TaskFilter = { companyIds?: number[]; projectIds?: number[]; statuses?: ColumnCategory[]; priorities?: Priority[]; labelIds?: number[]; dueFrom?: string; dueTo?: string; scope?: 'all'|'personal'|'professional'; overdueOnly?: boolean; noDueOnly?: boolean; includeDone?: boolean = true; includeArchived?: boolean = false; text?: string }`
  - `type TaskSort = 'due' | 'priority' | 'created' | 'updated'` (due: nulos por último, depois prioridade; priority: `PRIORITY_ORDER`, depois due)
  - `queryTasks(ctx, { filter: TaskFilter; sort: TaskSort; limit?: number }): TaskListItem[]` — sobre `v_tasks` (arquivamento herdado via `effective_archived`); `TaskListItem = CardSummary & { boardId; boardName; projectId; projectName; projectColor; companyId; companyName; companyColor; isPersonal: boolean; createdAt; completedAt; isNearDue: boolean }`. `isNearDue` usa setting `nearDueDays`. `text` usa LIKE em título (busca completa é a Task 19).
  - `getWeekRange(anchor: Date, weekStartsOn: 0|1): { start: string; end: string; days: string[] }` (datas `YYYY-MM-DD`)
  - `bucketByWeek(tasks: TaskListItem[], days: string[], now: Date): { overdue: TaskListItem[]; byDay: Record<string, TaskListItem[]> }` — atrasadas (não done) com vencimento antes do 1º dia vão para `overdue`; cada dia ordenado por `PRIORITY_ORDER` e depois hora (sem hora primeiro).
  - `quickCreateTask(ctx, { projectId; title; dueAt?; priority? }): Task` → primeira coluna `todo` do primeiro quadro não arquivado; sem quadro → cria "Quadro principal"; grava setting `lastProjectId`.
  - API: `'tasks.query'`, `'tasks.quickCreate'`.

- [ ] **Step 1: Testes**: filtros combinados (empresa + prioridade + período); scope personal/professional; tarefa em projeto arquivado some por padrão e aparece com `includeArchived`; ordenação por vencimento com nulos por último; **vencimento `'2026-11-25'` com now = 25/11 18:00 → `isOverdue` false e `isNearDue` true; com now = 26/11 00:01 → `isOverdue` true**; `noDueOnly`; `bucketByWeek` coloca atrasadas e ordena urgente antes de baixa; `getWeekRange` com início na segunda; quickCreate sem quadros cria quadro.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5:** Commit `feat(tasks): global task query and week bucketing`.

### Task 15: UI "Minha semana"

**Files:**
- Create: `src/renderer/features/week/{WeekPage.tsx,TaskFilters.tsx,QuickCreateTask.tsx}`

**Interfaces:**
- Consumes: `tasks.query`, `tasks.quickCreate`, `tasks.setStatus`, `spaces.tree`.
- Produces (§10.6 revisado): rota `/week`; `TaskFilters` (espaço, projeto, prioridade, escopo pessoal/profissional, mostrar concluídas — reutilizado no calendário e no dashboard) salvo em setting `week.filters`; colunas Atrasadas + 7 dias via `bucketByWeek`; ‹ › "Esta semana"; checkbox concluir (`setStatus('done'|'todo')`); clique → `?task=`; `QuickCreateTask` (título, projeto padrão `lastProjectId`, vencimento, prioridade).

- [ ] **Step 1:** Implementar; verificar manualmente no app (tarefa de hoje no dia certo, atrasada na coluna Atrasadas, filtro por projeto).
- [ ] **Step 2:** Commit `feat(ui): my week view`.

---

## Fase 7 — Dashboard

### Task 16: Serviço do dashboard

**Files:**
- Create: `src/main/services/dashboard.ts`
- Modify: handlers/schemas/api
- Test: `tests/unit/dashboard.test.ts`

**Interfaces:**
- Produces:
  - `getDashboard(ctx, { scope: 'all'|'personal'|'professional' | { companyId: number } | { projectId: number } }): DashboardData`
  - `DashboardData = { kpis: { total; todo; inProgress; done; overdue; nearDue; activeProjects; companies: number }; byPriority: { priority: Priority; count: number }[]; byCompany: { companyId; name; color; low; medium; high; urgent: number }[]; completedPerWeek: { weekStart: string; count: number }[] /* 8 semanas, inclui zeros */; createdVsCompleted: { weekStart: string; created: number; completed: number }[] /* 8 semanas */; overdueList: TaskListItem[] /* até 10, mais atrasada primeiro */; nearDueList: TaskListItem[] /* até 10 */ }`
  - Regras: todas as contagens ignoram `effective_archived`; `byPriority`/`byCompany` contam só não concluídas; `activeProjects` = status 'active' e não arquivado; `companies` = empresas ativas sem contar Pessoal; semanas seguem `weekStartsOn`.
  - API: `'dashboard.get'`.

- [ ] **Step 1: Testes** com dataset montado no teste (2 empresas + Pessoal, 12 tarefas com datas relativas a um `now` fixo): cada KPI com valor exato; tarefa em projeto arquivado não conta; `completedPerWeek` tem 8 entradas com zeros; escopo professional exclui Pessoal; escopo `{companyId}` e `{projectId}`.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5:** Commit `feat(dashboard): metrics service`.

### Task 17: UI do dashboard

**Files:**
- Create: `src/renderer/features/dashboard/{DashboardPage.tsx,KpiCard.tsx,PriorityChart.tsx,WorkloadChart.tsx,ProductivityChart.tsx,TaskMiniList.tsx}`
- Test: `tests/e2e/dashboard.spec.ts`

**Interfaces:**
- Consumes: `dashboard.get`.
- Produces (§10.7): saudação com data de hoje ("Bom dia — quarta-feira, 25 de novembro"); seletor de escopo (Tudo/Pessoal/Profissional/espaço/projeto); 8 KPIs; gráficos Recharts: barras por prioridade, barras horizontais empilhadas por espaço (cor do espaço no rótulo, prioridades como séries), linha/coluna de produtividade 8 semanas; listas Atrasadas e Próximos 7 dias (clique abre modal). Estado vazio útil quando não há tarefas ("Crie seu primeiro projeto"). Cores dos gráficos funcionam em tema claro e escuro. `data-testid="kpi-<chave>"`.

- [ ] **Step 1: e2e**: dashboard mostra total 0; criar 2 tarefas, uma atrasada; voltar ao dashboard → `kpi-total` 2, `kpi-overdue` 1; mover a atrasada para Concluído no modal → `kpi-overdue` 0 sem recarregar.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5:** Commit `feat(ui): dashboard`.

---

## Fase 8 — Calendário

### Task 18: Calendário (serviço + UI)

**Files:**
- Create: `src/main/services/calendar.ts`, `src/renderer/features/calendar/{CalendarPage.tsx,MonthView.tsx,WeekView.tsx,DayView.tsx,CalendarItem.tsx,layout.ts}`
- Modify: handlers/schemas/api
- Test: `tests/unit/calendar.test.ts`, `tests/e2e/calendar.spec.ts`

**Interfaces:**
- Produces:
  - `getCalendarItems(ctx, { from: string; to: string; filter: TaskFilter }): CalendarItem[]` — `CalendarItem = { kind: 'due' | 'start'; date: string /* YYYY-MM-DD */; time: string | null /* HH:mm */; task: TaskListItem }`; inclui `due` se `due_at` no intervalo e `start` se `start_at` no intervalo; respeita filtros e `effective_archived`.
  - `layout.ts`: `monthGrid(anchor: Date, weekStartsOn): string[][]` (6 semanas × 7 dias) · `groupItemsByDay(items): Record<string, CalendarItem[]>` (ordem: dia-inteiro primeiro, depois hora; dentro, prioridade) · `splitTimed(items): { allDay: CalendarItem[]; timed: CalendarItem[] }`.
  - API: `'calendar.items'`.
  - UI (§10.8): Mês/Semana/Dia (`?view=`, último salvo em `calendar.view`), ‹ › Hoje; mês: até 3 itens por dia + "+N"; semana/dia: faixa "dia inteiro" + grade de horas 07–22 com rolagem (itens fora do intervalo ficam acessíveis rolando 00–24); cor = cor do espaço (borda esquerda); atrasado: ícone/realce vermelho; concluído: riscado e esmaecido; marcador de início "▶" (oculto quando setting `showStartMarkers` = false; alternador na barra); filtros (espaço, projeto, prioridade, mostrar concluídas) reutilizando `TaskFilters`; clique no item → `?task=<id>`; clique em área vazia de um dia → `QuickCreateTask` com `dueAt` preenchido.

- [ ] **Step 1: Testes**: itens due e start no intervalo; tarefa sem datas não aparece; filtro por empresa; `monthGrid` de novembro/2026 começa em 26/10 (segunda) e tem 42 dias; `groupItemsByDay` ordena dia-inteiro antes de horários. e2e: tarefa com vencimento hoje aparece no mês; clicar abre o modal; mudar vencimento no modal move o item no calendário.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5:** Commit `feat(calendar): month, week and day views`.

---

## Fase 9 — Busca e arquivos

### Task 19: Serviço de busca (FTS5)

**Files:**
- Create: `src/main/services/search.ts`
- Modify: handlers/schemas/api
- Test: `tests/unit/search.test.ts`

**Interfaces:**
- Produces:
  - `buildFtsQuery(text: string): string | null` — separa em palavras por espaço/pontuação, descarta vazias, cada palavra vira `"<palavra com aspas duplas dobradas>"*`, unidas por espaço (AND implícito); sem palavras → null.
  - `search(ctx, { text: string; types?: ('task'|'comment'|'project'|'company'|'attachment')[]; filter?: TaskFilter & { createdFrom?: string; createdTo?: string }; limit?: number = 50 }): SearchResults` — `SearchResults = { tasks: (TaskListItem & { snippet: string })[]; comments: { id; taskId; taskTitle; snippet; companyColor }[]; projects: (Project & { companyName; companyColor })[]; companies: Company[]; attachments: AttachmentListItem[] }`; ranking por `bm25`; `snippet()` do FTS5 com `«»` como marcadores; comentário/anexo herdam filtros pela tarefa; `filter.includeArchived` default false.
  - API: `'search.query'`.

- [ ] **Step 1: Testes**: "orcamento" encontra tarefa com "Orçamento anual"; prefixo "relat" encontra "relatório"; palavra só em comentário retorna o comentário com `taskId`; filtro por prioridade e etiqueta; arquivados só com flag; **textos `'"foo* OR -bar'`, `'NEAR('`, `'a:b'`, `'***'` não lançam erro** (os dois últimos podem retornar vazio); desempenho: 5.000 tarefas geradas no teste, consulta de 1 palavra em < 100 ms (média de 5 execuções).
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5:** Commit `feat(search): full-text search service`.

### Task 20: UI de busca (Ctrl+K e página de resultados)

**Files:**
- Create: `src/renderer/features/search/{CommandPalette.tsx,SearchPage.tsx}`
- Modify: `src/renderer/app/Layout.tsx`
- Test: `tests/e2e/search.spec.ts`

**Interfaces:**
- Consumes: `search.query`, `TaskFilters`.
- Produces (§10.10): `Ctrl+K` (e o campo "Buscar" da sidebar) abre a paleta; consulta com debounce 120 ms; resultados agrupados (Tarefas, Comentários, Projetos, Empresas, Arquivos; até 5 por grupo); ↑/↓/Enter; Enter em tarefa/comentário abre `?task=`; projeto → `/projects/:id`; empresa → `/spaces/:id`; arquivo → abre a tarefa/projeto dono; última linha "Ver todos os resultados" → `/search?q=`. Página `/search`: campo, abas por tipo, filtros (espaço, projeto, status, prioridade, etiquetas, período de criação, vencimento, incluir arquivados), trechos com destaque.

- [ ] **Step 1: e2e**: criar tarefa "Revisar contrato" com comentário "assinatura pendente"; Ctrl+K → digitar "assin" → aparece o comentário; Enter abre o modal da tarefa; "Ver todos" abre a página com o filtro de prioridade funcionando.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5:** Commit `feat(ui): command palette and search page`.

### Task 21: Página de arquivos

**Files:**
- Create: `src/renderer/features/files/{FilesPage.tsx,FilesTable.tsx}`
- Modify: `src/renderer/features/projects/ProjectPage.tsx` (aba Arquivos usa `FilesTable` filtrado pelo projeto, com botão "Adicionar arquivo ao projeto" → `attachments.add({ projectId })`)
- Test: `tests/e2e/files.spec.ts`

**Interfaces:**
- Consumes: `attachments.list|open|reveal|delete|add|thumbnail`.
- Produces (§10.9): tabela com nome (ícone por tipo/miniatura), tipo, tamanho legível, data, origem (tarefa › projeto › espaço com cor); filtros espaço, projeto, tipo; busca por nome; ações abrir, mostrar na pasta, ir para a tarefa (`?task=`)/projeto, excluir (confirmação).

- [ ] **Step 1: e2e**: anexo adicionado no card aparece em `/files` e na aba Arquivos do projeto; filtro por espaço; arquivo de projeto adicionado pela aba aparece em `/files`; excluir remove da lista.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5:** Commit `feat(ui): files page`.

---

## Fase 10 — Configurações e backup

### Task 22: Serviço de backup e restauração

**Files:**
- Create: `src/main/services/backup.ts`
- Modify: `src/main/index.ts` (fluxo de restauração + relaunch), handlers/schemas/api
- Test: `tests/unit/backup.test.ts`, `tests/e2e/backup.spec.ts`

**Interfaces:**
- Produces:
  - `type BackupManifest = { app: 'personal-task-hub'; appVersion: string; schemaVersion: number; createdAt: string; kind: 'full' | 'db'; counts: { companies; projects; tasks; attachments: number } }`
  - `createFullBackup(ctx, destZip: string): Promise<BackupManifest>` — `vacuumInto` para `restore-staging/backup-<ts>/hub.db`, zip (archiver, streaming) com `hub.db`, `attachments/`, `logos/`, `manifest.json`; grava em `destZip + '.part'` e renomeia ao final; limpa staging.
  - `createDbBackup(ctx, destDb: string): BackupManifest` — `vacuumInto` direto.
  - `inspectBackup(ctx, file: string): Promise<{ manifest: BackupManifest; stagingDir: string }>` — `.zip`: extrai (extract-zip) para `restore-staging/<ts>/`; exige `manifest.json` com `app` correto; `.db`: copia para staging e monta manifest lendo o banco. Em ambos: abre o banco staged readonly, `PRAGMA integrity_check` = 'ok', `user_version <= LATEST_SCHEMA_VERSION`. Qualquer falha → `AppError('INVALID_BACKUP', <mensagem pt-BR>)` e staging removido.
  - `applyRestore(paths, stagingDir: string, now: Date): void` — **chamada com o banco fechado**: move `hub.db*`, `attachments/`, `logos/` atuais para `backups/pre-restore/<ts>/` (rename), move os do staging para o lugar (para `.db`: só o banco; mantém `attachments/` atual).
  - Startup (modificar a sequência da Task 4 em `index.ts`): após `runMigrations`, sempre chamar `restoreMissingAttachments(paths, db)` antes de `purgeDeletedAttachments` — assim anexos de um banco restaurado voltam de `attachments-deleted/` antes de qualquer limpeza.
  - Fluxo IPC: `'backup.createFull' {destPath}`, `'backup.createDb' {destPath}`, `'backup.inspect' {path}→{manifest, token}` (token = nome da pasta de staging), `'backup.restore' {token}` → responde ok, então o main fecha a janela, `closeDatabase`, `applyRestore`, `app.relaunch()`, `app.exit(0)`. `'backup.listAuto'`, `'backup.restoreAuto' {file}` (inspect + restore do `.db`).
  - Caminho padrão de destino: `join(app.getPath('documents'), 'PersonalTaskHub-backups', 'personal-task-hub-<YYYY-MM-DD-HHmm>.zip')`.

- [ ] **Step 1: Testes (unit)**: full backup roundtrip (criar dados + anexo, backup, inspect, applyRestore em outra pasta de dados, abrir → contagens iguais e anexo com mesmo conteúdo); destino com `"it's dir"` no caminho funciona; **zip corrompido, zip sem manifest, manifest de outro app, schema = LATEST+1, banco que falha integrity_check → INVALID_BACKUP e pasta de dados atual intocada (hash do hub.db igual)**; restore de `.db` mantém attachments atuais; estado anterior fica em `backups/pre-restore/<ts>/`. **e2e**: criar dados, backup completo via API para tmp, apagar uma empresa, restaurar → empresa de volta após relaunch (reconectar Playwright à nova janela relançando o app com mesmo dataDir).
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5:** Commit `feat(backup): full and database backups with safe restore`.

### Task 23: Página de configurações

**Files:**
- Create: `src/renderer/features/settings/{SettingsPage.tsx,AppearanceSection.tsx,PreferencesSection.tsx,LabelsSection.tsx,DataSection.tsx,BackupSection.tsx,AboutSection.tsx}`
- Modify: handlers/api (`'system.dataStats' {}→{ dataPath; dbBytes; attachmentsBytes; attachmentCount }`, `'system.appInfo' {}→{ version; schemaVersion; electron }`)
- Test: `tests/e2e/settings.spec.ts`

**Interfaces:**
- Consumes: settings, labels, backup, system APIs.
- Produces (§10.11): seções Aparência (tema), Preferências (`nearDueDays` 1–30, `weekStartsOn` seg/dom, `showStartMarkers`), Etiquetas (CRUD com cor e contagem de uso; excluir confirma), Dados (caminho, tamanhos, "Abrir pasta"), Backup ("Fazer backup completo" → `system.pickSavePath` → `backup.createFull` com progresso/estado e toast de sucesso com caminho; "Backup só do banco"; "Restaurar backup…" → `system.pickOpenPath(['zip','db'])` → `backup.inspect` → diálogo de resumo (data, versão, contagens) + ConfirmDialog danger "Restaurar e reiniciar"; lista de backups automáticos com "Restaurar este"), Sobre (versões).

- [ ] **Step 1: e2e**: mudar `nearDueDays` para 3 e ver KPI do dashboard mudar; criar/renomear/excluir etiqueta; seção Dados mostra o caminho do `PTH_DATA_DIR`; lista de backups automáticos mostra o de hoje.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5:** Commit `feat(ui): settings and backup page`.

---

## Fase 11 — Empacotamento e instalação

### Task 24: Build, instalação e atalho na área de trabalho

**Files:**
- Create: `electron-builder.yml`, `build/icon.png`, `scripts/install-linux.sh`, `README.md` (como instalar, atualizar, onde ficam os dados, como fazer backup)
- Modify: `package.json` (script `"dist": "electron-vite build && electron-builder --linux dir"`)

**Interfaces:**
- Produces:
  - `electron-builder.yml`: `appId: local.personal-task-hub`, `productName: Personal Task Hub`, `executableName: personal-task-hub`, `linux.target: dir`, `linux.icon: build/icon.png`, `asarUnpack: ['**/node_modules/better-sqlite3/**']`, `files: ['out/**', 'package.json']`.
  - `scripts/install-linux.sh` (bash, `set -euo pipefail`, aceita caminho com espaço):
    1. `cd` na raiz do projeto (relativo ao script); `npm ci`; `npm run dist`.
    2. `INSTALL_DIR="$HOME/.local/opt/personal-task-hub"`; copia `dist/linux-unpacked/` para `"$INSTALL_DIR.new"`, depois troca atômica (`rm -rf "$INSTALL_DIR.old"; mv "$INSTALL_DIR" "$INSTALL_DIR.old" 2>/dev/null || true; mv "$INSTALL_DIR.new" "$INSTALL_DIR"; rm -rf "$INSTALL_DIR.old"`). **Nunca toca `~/.local/share/personal-task-hub`.**
    3. Sandbox: se `sysctl -n kernel.unprivileged_userns_clone` ≠ 1, `sudo chown root:root "$INSTALL_DIR/chrome-sandbox" && sudo chmod 4755 "$INSTALL_DIR/chrome-sandbox"`; se sudo falhar, avisar e gravar `--no-sandbox` no `Exec` do atalho.
    4. Ícone em `~/.local/share/icons/hicolor/512x512/apps/personal-task-hub.png`; `.desktop` em `~/.local/share/applications/personal-task-hub.desktop` (`Name=Personal Task Hub`, `Exec="$INSTALL_DIR/personal-task-hub" %U`, `Icon=personal-task-hub`, `Type=Application`, `Categories=Office;ProjectManagement;`, `StartupWMClass=Personal Task Hub`); cópia em `$(xdg-user-dir DESKTOP)/` com `chmod +x` e `gio set <arquivo> metadata::trusted true`; `update-desktop-database ~/.local/share/applications` se existir.
    5. Mensagem final com local dos dados.

- [ ] **Step 1:** Rodar `bash scripts/install-linux.sh`. Esperado: termina com sucesso; existem `~/.local/opt/personal-task-hub/personal-task-hub` e o atalho na área de trabalho.
- [ ] **Step 2:** Abrir pelo `.desktop` (`gtk-launch personal-task-hub`). Esperado: janela abre sem terminal; pasta de dados criada em `~/.local/share/personal-task-hub/` com `hub.db` e `backups/auto/hub-<hoje>.db`.
- [ ] **Step 3: Teste de reinstalação**: no app instalado, criar empresa "Teste Reinstalação" e uma tarefa; fechar; `rm -rf ~/.local/opt/personal-task-hub`; rodar o script de novo; abrir → empresa e tarefa presentes. Depois excluir a empresa de teste pelo app.
- [ ] **Step 4:** Clicar no ícone com o app aberto → foca a janela existente (sem segundo processo: `pgrep -c -f personal-task-hub/personal-task-hub` não aumenta processos principais).
- [ ] **Step 5:** Commit `chore(dist): linux build, installer script and desktop shortcut`.

### Task 25: Verificação final dos critérios de aceitação

**Files:**
- Test: `tests/e2e/acceptance.spec.ts`

- [ ] **Step 1:** Escrever um e2e que percorre o objetivo do §16 do pedido em sequência: criar empresa → projeto → quadro → 5 tarefas com datas/prioridades/etiquetas/checklist/comentário/anexo → mover uma para Concluído → conferir dashboard, Minha semana, calendário e busca refletindo sem recarregar → fechar → reabrir → tudo idêntico.
- [ ] **Step 2:** Rodar a suíte completa: `npm run typecheck && npm test && npm run e2e`. Esperado: tudo PASS. Registrar a saída.
- [ ] **Step 3:** Revisar o §15 do spec item a item e marcar cada critério com o teste que o cobre (no PR/resumo final).
- [ ] **Step 4:** Commit `test: end-to-end acceptance suite`.
