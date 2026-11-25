# Personal Task Hub — Design

Data: 2026-11-25
Status: aprovado (2026-11-25), com revisão do usuário: sem tela "Minhas tarefas"; visual simples

> Convenção: itens marcados **[decisão do Claude]** foram preenchidos por mim, não pedidos explicitamente pelo usuário. Podem ser corrigidos.

---

## 1. Intenção e porquê

Uma central única, pessoal e local para organizar a vida profissional (várias empresas) e pessoal (estudos, finanças, casa, projetos próprios). O usuário quer abrir o app de manhã, ver tudo o que precisa fazer, entrar numa empresa, abrir um Kanban, gerenciar tarefas, anexar documentos e voltar ao dashboard geral — sem alternar entre ferramentas.

Uso exclusivo de uma pessoa, num único computador. Não é SaaS.

**Regra mais importante:** centenas de tarefas cadastradas, app fechado, computador desligado — ao reabrir, tudo exatamente como estava.

## 2. Objetivos

- Hierarquia: **Espaço** (Pessoal ou Empresa) → **Pastas** (opcionais, aninháveis) → **Projetos** → **Quadros** → **Colunas** → **Cards (tarefas)**.
- Kanban estilo Trello com colunas livres e drag and drop de cards e colunas.
- Card como tarefa completa, aberto em modal sem sair do quadro.
- Dashboard geral com indicadores e gráficos de toda a carga de trabalho.
- "Minha semana" com filtros por espaço/projeto.
- Calendário mensal/semanal/diário.
- Pesquisa global rápida com filtros.
- Área de arquivos/anexos.
- Backup manual, backup completo com anexos, restauração.
- App desktop aberto por ícone na área de trabalho, 100% offline.

## 3. Não-objetivos (v1)

- Login, autenticação, multiusuário, compartilhamento.
- Sincronização em nuvem, versão web, versão mobile.
- Notificações/lembretes do sistema operacional, tarefas recorrentes, controle de tempo **[decisão do Claude: não foram pedidos; ficam para depois]**.
- Arrastar tarefas dentro do calendário para mudar datas **[decisão do Claude]**.
- Empacotamento para Windows/macOS (o código fica portável, mas só Linux é empacotado agora).
- Tela "Minhas tarefas" (lista/Kanban agregados): removida pelo usuário. Ficam "Minha semana" e o dashboard, ambos filtráveis por espaço e projeto.
- Acabamento visual elaborado: o usuário pediu visual simples e funcional para ganhar tempo; ele ajusta depois.
- Importação de outras ferramentas (Trello, Notion, planilhas): o usuário confirmou que vai cadastrar tudo do zero.
- Lixeira com restauração de itens excluídos (excluir é permanente; arquivar é o caminho reversível) **[decisão do Claude]**.

## 4. Anti-objetivos (fracasso mesmo que "funcione")

- Qualquer perda de dado ao fechar, atualizar, reinstalar ou desligar.
- Banco ou anexos dentro da pasta de instalação ou de pasta temporária.
- localStorage como armazenamento principal; dados mockados como implementação.
- Botões, filtros ou modais apenas visuais, sem funcionar.
- Precisar abrir terminal para usar o app.
- Visual de "painel administrativo genérico".

## 5. Restrições do ambiente

- Máquina: Debian 12 (KeeP-OS), desktop Cinnamon, x86_64, Node 20.
- Pasta do projeto: `/home/guest/Desktop/PROJETOS PESSOAIS/hub_task_pessoal` (vazia; projeto do zero). Atenção: caminho com espaço.
- Interface em português do Brasil; datas no formato brasileiro; semana começa na segunda-feira **[decisão do Claude]**.
- Prioridade para uso em desktop (janela mínima ~1100×700), mas com layout que se adapta a janelas menores.

## 6. Abordagens consideradas

| Abordagem | Prós | Contras | Resultado |
|---|---|---|---|
| **1. Electron + React, acesso direto ao SQLite pelo processo principal (IPC)** | Menos peças; sem servidor, sem porta; inicialização rápida; offline total | App ~100 MB | **Escolhida pelo usuário** |
| 2. Electron + servidor local (Express) + React | Poderia abrir também no navegador | Duas partes; conflito de porta; problema de "subir o servidor" | Descartada |
| 3. Tauri (Rust) + SQLite | App ~10 MB | Toolchain Rust; manutenção mais difícil | Descartada |

Também descartado: navegador + serviço do sistema (mantém o servidor sem ganho).

Hierarquia: o usuário escolheu **Espaço como nível principal** (Pessoal fixo + uma por empresa, com pastas dentro) em vez de pastas livres com empresa como atributo.

## 7. Arquitetura

### 7.1 Stack

- **Electron** (versão estável atual) com **electron-vite** para dev/build.
- **React + TypeScript** no renderer.
- **better-sqlite3** no processo principal (síncrono, rápido, transações simples).
- **Tailwind CSS** + componentes acessíveis (Radix UI primitives) + **lucide-react** para ícones.
- **dnd-kit** para drag and drop.
- **Recharts** para gráficos.
- **date-fns** (locale pt-BR).
- Fonte **Inter** empacotada localmente (sem Google Fonts; offline).
- Validação dos payloads de IPC com **zod**.
- Testes: **Vitest** (camada de dados/serviços) e **Playwright para Electron** (fluxos ponta a ponta, incluindo persistência após reiniciar).

O builder pode trocar bibliotecas equivalentes desde que respeite as restrições (offline, sem localStorage como banco).

### 7.2 Processos

```
┌──────────────────────── Electron ────────────────────────┐
│ Main process                                              │
│  - abre/migra o SQLite (better-sqlite3)                   │
│  - serviços: empresas, pastas, projetos, quadros, tarefas,│
│    comentários, checklists, etiquetas, anexos, histórico, │
│    busca, dashboard, backup                               │
│  - copia arquivos anexados para a pasta de dados          │
│  - handlers IPC (ipcMain.handle) com validação zod        │
│                                                           │
│ Preload (contextBridge)                                   │
│  - expõe window.api tipado (sem acesso direto a Node)     │
│                                                           │
│ Renderer (React)                                          │
│  - UI; estado de servidor via TanStack Query              │
│  - após cada mutação, invalida consultas afetadas         │
│    (dashboard, calendário, listas atualizam sozinhos)     │
└───────────────────────────────────────────────────────────┘
```

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` no renderer.
- **Instância única** (`app.requestSingleInstanceLock`): abrir o ícone de novo foca a janela existente, nunca abre dois processos escrevendo no banco.
- Tipos compartilhados entre main e renderer numa pasta `shared/`.

### 7.3 Pasta de dados (persistência permanente)

```
~/.local/share/personal-task-hub/
├── hub.db              # banco SQLite (+ hub.db-wal, hub.db-shm)
├── attachments/        # anexos: attachments/AAAA/MM/<uuid>-<nome-original>
├── attachments-deleted/ # anexos excluídos, mantidos 30 dias (ver §9.1)
├── logos/              # logotipos de empresas
├── backups/
│   ├── auto/           # backups automáticos (ver §11)
│   └── pre-migration/  # cópia antes de cada migração de schema
└── logs/
```

- Nunca dentro da pasta de instalação nem em `/tmp`.
- Caminhos de arquivos gravados no banco **relativos** à pasta de dados (o backup/restauração fica portável).
- Configurações exibem o caminho da pasta de dados e um botão "Abrir pasta".
- Pasta configurável pelo usuário: **não** na v1 **[decisão do Claude]**.

### 7.4 Integridade do banco

- `PRAGMA journal_mode = WAL`, `synchronous = FULL`, `foreign_keys = ON`.
- Toda operação composta (mover card, reordenar, duplicar, excluir em cascata, restaurar) roda em **transação**.
- Na inicialização: `PRAGMA quick_check`; se falhar, o app avisa e oferece restaurar o backup automático mais recente (não continua gravando num banco corrompido).
- Ao fechar: `wal_checkpoint(TRUNCATE)` e fechamento limpo da conexão.
- Migrações versionadas (`PRAGMA user_version`), cada uma em transação, precedidas de cópia do banco para `backups/pre-migration/`.

## 8. Modelo de dados (SQLite)

IDs inteiros autoincrementais. Datas em texto ISO 8601 (horário local). `position` é `REAL` (índice fracionário: inserir entre dois itens = média; renormalizar quando o intervalo ficar pequeno demais) **[decisão do Claude]**.

```
companies          -- "Espaços"
  id, name, description, color, logo_path (rel.),
  is_personal (0/1)  -- exatamente uma linha =1: "Pessoal", não pode ser excluída
  status ('active'|'archived'), position,
  created_at, updated_at, archived_at

folders
  id, company_id → companies, parent_id → folders (NULL = raiz do espaço),
  name, color, position, archived_at, created_at, updated_at

projects
  id, company_id → companies, folder_id → folders (NULL = raiz do espaço),
  name, description, color, start_date, due_date,
  status ('planned'|'active'|'paused'|'completed'),
  position, archived_at, created_at, updated_at

boards
  id, project_id → projects, name, position, archived_at, created_at, updated_at

columns
  id, board_id → boards, name, position,
  category ('todo'|'in_progress'|'done'),   -- ver §9.2
  created_at, updated_at

tasks              -- cards
  id, board_id → boards, column_id → columns,
  title, description (Markdown),
  priority ('low'|'medium'|'high'|'urgent'),
  start_at, due_at,           -- 'AAAA-MM-DD' ou 'AAAA-MM-DDTHH:mm' (hora opcional)
  completed_at,               -- preenchido ao entrar em coluna 'done'
  archived_at, position, created_at, updated_at

labels             -- etiquetas globais, reutilizáveis em qualquer espaço
  id, name, color
task_labels        (task_id, label_id)

comments
  id, task_id, body, created_at, updated_at

checklists
  id, task_id, title, position
checklist_items
  id, checklist_id, text, done (0/1), position, created_at, completed_at

attachments
  id, task_id (NULL se for do projeto), project_id (NULL se for da tarefa),
  original_name, stored_path (rel.), mime_type, size_bytes, created_at

activity_log       -- histórico do card (e eventos de projeto/empresa)
  id, entity_type, entity_id, task_id (NULL se não for de card),
  action ('created'|'updated'|'moved'|'archived'|'restored'|'commented'|
          'attachment_added'|'attachment_removed'|'checklist_item_done'|...),
  field, old_value, new_value, created_at

settings           -- preferências (tema, última visualização, filtros salvos, etc.)
  key PRIMARY KEY, value (JSON)

search_index       -- FTS5 (tokenizer unicode61 remove_diacritics 2)
  entity_type, entity_id, title, body
```

Regras de relacionamento:

- **Empresa e projeto de uma tarefa são derivados** (tarefa → quadro → projeto → espaço). Não são duplicados na tabela `tasks`, então nunca ficam inconsistentes. Mover um projeto de espaço move junto tudo dentro dele.
- "Projeto pessoal sem empresa" = projeto no espaço **Pessoal**. Pessoal vs. profissional = `companies.is_personal`.
- Uma pasta só contém pastas e projetos do mesmo espaço.
- Índices: `tasks(column_id, position)`, `tasks(board_id)`, `tasks(due_at)`, `tasks(archived_at)`, `projects(company_id)`, `activity_log(task_id, created_at)`.
- `search_index` mantido por triggers em tasks, comments, projects, companies e attachments.

## 9. Regras de comportamento

### 9.1 Ciclo de vida (arquivar × excluir)

- **Arquivar** (empresa, pasta, projeto, quadro, card): some das visões ativas, continua nos registros, na busca (com filtro "incluir arquivados") e no histórico; pode ser restaurado. Arquivar empresa ou projeto **não** arquiva automaticamente as tarefas, mas elas deixam de contar nos indicadores ativos **[decisão do Claude]**.
- **Arquivamento herdado**: uma tarefa cujo quadro, projeto ou espaço esteja arquivado é tratada como arquivada em todas as visões (Minha semana, calendário, listas do dashboard, busca), aparecendo só com "incluir arquivadas" ligado **[decisão do Claude]**. As consultas calculam isso pela cadeia tarefa → quadro → projeto → espaço (de preferência numa view SQL `v_tasks` reutilizada por todas as telas).
- **Excluir**: permanente, sempre com confirmação. Para empresa ou projeto, a confirmação mostra o que será apagado ("3 projetos, 41 tarefas, 12 anexos") e exige digitar o nome. Arquivos de anexos excluídos (individualmente ou em cascata) **não são apagados na hora**: vão para `attachments-deleted/` e só são removidos do disco após 30 dias. Assim, restaurar um backup automático (que contém só o banco) recupera também os anexos daquele período **[decisão do Claude]**. Excluir pasta move seu conteúdo para o nível acima (não apaga projetos) **[decisão do Claude]**.
- Espaço **Pessoal** não pode ser excluído nem arquivado.
- Tarefas concluídas continuam visíveis (coluna de concluídas, filtros, histórico).

### 9.2 Status da tarefa vem da coluna

As colunas são livres, mas cada uma tem uma **categoria**: *A fazer*, *Em andamento* ou *Concluído* **[decisão do Claude]**. O status da tarefa é a categoria da coluna onde ela está. Assim os indicadores (pendentes/em andamento/concluídas) funcionam com qualquer nome de coluna.

- Colunas novas recebem categoria pela posição/nome sugerido; o usuário pode mudar no menu da coluna.
- Entrar numa coluna *Concluído* preenche `completed_at`; sair dela limpa.
- O campo "Status" no modal é um seletor que move o card para a primeira coluna daquela categoria no mesmo quadro.
- Quadro novo nasce com: Backlog (A fazer), A fazer (A fazer), Em andamento (Em andamento), Em revisão (Em andamento), Concluído (Concluído). Editável. Não é dado fictício, é um modelo inicial.

### 9.3 Derivações

- **Atrasada**: `due_at` < agora, não concluída, não arquivada. Data sem hora vence no fim do dia.
- **Vencimento próximo**: vence nos próximos 7 dias **[decisão do Claude]**; configurável em Configurações.
- **Sem prazo**: `due_at` nulo.

### 9.4 Histórico do card

Registrar em `activity_log`: criação, mudança de cada campo (com valor antigo e novo), movimentações entre colunas/quadros, arquivamento/restauração, comentários, anexos, itens de checklist marcados. Mostrado em ordem cronológica no modal.

### 9.5 Duplicar card

Copia título (+ " (cópia)"), descrição, prioridade, datas, etiquetas e checklists (itens desmarcados). Não copia comentários, histórico nem anexos **[decisão do Claude]**. Inserido logo abaixo do original.

## 10. Telas

Layout geral: sidebar fixa à esquerda + área principal. Tema claro e escuro (padrão: segue o sistema). Referências: Linear, Notion, Trello, ClickUp. Densidade moderada, tipografia Inter, cores das empresas como acento (bolinha/borda), não como fundo pesado.

```
┌─────────────┬───────────────────────────────────────────────┐
│ 🔍 Buscar ⌘K │  Cabeçalho: breadcrumb · ações               │
│             │                                               │
│ ▣ Dashboard │                                               │
│ ☑ Minhas    │            conteúdo da área                   │
│   tarefas   │                                               │
│ 📅 Calendário│                                               │
│ 📎 Arquivos  │                                               │
│ 🏢 Empresas  │                                               │
│ ─────────── │                                               │
│ ESPAÇOS     │                                               │
│ ● Pessoal   │                                               │
│   ▸ Estudos │                                               │
│ ● Empresa A │                                               │
│   ▸ CRM     │                                               │
│ ● Empresa B │                                               │
│ ─────────── │                                               │
│ ⚙ Configur. │                                               │
└─────────────┴───────────────────────────────────────────────┘
```

### 10.1 Sidebar

- Navegação principal + árvore de espaços (expansível, lembra o estado).
- Árvore: espaço → pastas → projetos. Arrastar para reordenar e mover projetos/pastas entre pastas e espaços. Menu de contexto (renomear, cor, arquivar, excluir, novo projeto/pasta).
- Itens arquivados escondidos (acessíveis via página do espaço, aba "Arquivados").

### 10.2 Empresas

- Lista de empresas em cards (logo, cor, nº de projetos ativos, tarefas abertas, atrasadas). Filtro ativas/arquivadas.
- Formulário: nome, logo (upload de imagem, copiada para `logos/`), descrição, cor, status. Data de cadastro automática.
- **Página do espaço**: resumo (mini-indicadores do espaço), projetos agrupados por pasta, atalho para Minha semana e Dashboard já filtrados pelo espaço, aba Arquivados.

### 10.3 Projeto

- Cabeçalho: nome, cor, espaço, status, datas, progresso (% concluídas).
- Abas: **Quadros** (lista/abas de quadros do projeto; criar, renomear, reordenar, arquivar, excluir), **Arquivos** (anexos do projeto e de suas tarefas), **Sobre** (descrição e campos editáveis).

### 10.4 Quadro Kanban

- Colunas horizontais com rolagem; criar coluna no fim; renomear inline; menu da coluna: categoria, mover, excluir (se tiver cards: pede para escolher coluna de destino ou confirma exclusão dos cards).
- Drag and drop de colunas e de cards (dentro e entre colunas), com ordem persistida imediatamente.
- Card no quadro mostra: etiquetas, título, prioridade, data (vermelho se atrasado), progresso do checklist, ícones de comentário/anexo.
- Adicionar card rápido no rodapé da coluna (só título; Enter cria e mantém o campo aberto).
- Filtro local do quadro (etiqueta, prioridade, texto) e "mostrar arquivados".

### 10.5 Modal do card

```
┌──────────────────────────────────────────────────────────────┐
│ Empresa A › Projeto CRM › Quadro Sprint › [Em andamento ▾] ✕ │
│ Título editável                                              │
├───────────────────────────────────────┬──────────────────────┤
│ Descrição (Markdown, editar/prever)   │ Status               │
│                                       │ Prioridade           │
│ Checklists                            │ Início / Vencimento  │
│  ☑ item  ☐ item   [+ item]  ▓▓▓░ 60%  │ Etiquetas            │
│                                       │ Projeto (mover)      │
│ Anexos  [+ Adicionar] (arrastar aqui) │ Criado em …          │
│  📄 contrato.pdf  🖼 print.png         │ ──────────────────   │
│                                       │ Duplicar             │
│ Atividade  [Comentários | Histórico]  │ Arquivar             │
│  [escrever comentário…]               │ Excluir              │
└───────────────────────────────────────┴──────────────────────┘
```

- Salva cada campo ao sair dele/ao mudar (sem botão "Salvar" global); feedback discreto "Salvo".
- "Mover" permite trocar de projeto/quadro/coluna (inclusive entre espaços).
- Anexos: escolher arquivo ou arrastar para o modal; o arquivo é **copiado** para a pasta de dados. Clique abre no aplicativo padrão do sistema; "Mostrar na pasta"; remover (com confirmação). Imagens mostram miniatura.
- Abrir o modal atualiza a URL interna (rota) para que voltar/fechar funcione e o calendário/lista consigam abrir o mesmo modal.

### 10.6 Minha semana

- Página própria na sidebar. Uma coluna por dia (seg–dom) da semana selecionada + coluna "Atrasadas" à esquerda. Dentro do dia: prioridade (urgente → baixa) e depois hora. Navegar semanas.
- Filtros: espaço, projeto, prioridade, pessoal/profissional, mostrar concluídas. Lembrados entre sessões.
- Marcar como concluída direto no item; clique abre o modal.
- "Nova tarefa": pede projeto (padrão: último usado), cria na primeira coluna *A fazer* do primeiro quadro.

### 10.7 Dashboard

Indicadores (todos calculados por consultas SQL; atualizam ao voltar para a tela e após qualquer mutação, via invalidação de cache):

- Cartões: total de tarefas, pendentes, em andamento, concluídas, atrasadas, vencendo em 7 dias, projetos ativos, empresas cadastradas (ativas).
- Gráficos: tarefas abertas por prioridade; tarefas abertas por espaço (barra empilhada por prioridade, cor do espaço) — "carga de trabalho"; produtividade: concluídas por semana nas últimas 8 semanas e criadas × concluídas.
- Listas: "Atrasadas" e "Próximos 7 dias" (clicáveis, abrem o modal).
- Filtro do dashboard: Tudo / Pessoal / Profissional / um espaço / um projeto.

### 10.8 Calendário

- Visões mês, semana, dia; navegação e botão "Hoje".
- Exibe tarefas no **vencimento**; **início** aparece como marcador separado ("▶ início: …"), com opção para ocultar inícios **[decisão do Claude]**.
- Tarefas com hora ocupam o horário nas visões semana/dia; sem hora vão para a faixa "dia inteiro".
- Cor = cor do espaço; atrasadas com indicação vermelha; concluídas riscadas/esmaecidas.
- Filtros: espaço, projeto, prioridade, mostrar concluídas.
- Clique abre o modal do card. Clique num dia vazio: criar tarefa com aquela data de vencimento.

### 10.9 Arquivos

- Lista de todos os anexos (tarefas e projetos), com nome, tipo, tamanho, data, tarefa/projeto/espaço de origem.
- Filtros por espaço, projeto, tipo; busca por nome. Abrir, mostrar na pasta, ir para a tarefa.

### 10.10 Pesquisa global

- **Ctrl+K** de qualquer lugar abre a paleta: resultados instantâneos agrupados (tarefas, projetos, empresas, comentários, arquivos), navegação por teclado.
- "Ver todos os resultados" abre a página de busca com filtros: espaço, projeto, status, prioridade, etiquetas, período de criação, vencimento, incluir arquivados.
- FTS5 com busca por prefixo e sem diferenciar acentos ("orcamento" encontra "orçamento").

### 10.11 Configurações

- Aparência: tema (sistema/claro/escuro).
- Preferências: janela de "vencimento próximo" (dias), primeiro dia da semana.
- Etiquetas: criar, renomear, recolorir, excluir.
- Dados: caminho da pasta de dados ("Abrir pasta"), tamanho do banco e anexos.
- Backup: ver §11.
- Sobre: versão do app e do schema.

### 10.12 Atalhos de teclado

Ctrl+K busca; N novo card (no quadro); Esc fecha modal; Ctrl+Enter envia comentário.

## 11. Backup e restauração

- **Backup manual ("Fazer backup agora")**: gera um `.zip` com `hub.db` (cópia consistente via `VACUUM INTO`/API de backup do SQLite, nunca copiando o arquivo em uso), `attachments/`, `logos/` e `manifest.json` (versão do app, versão do schema, data, contagens). O usuário escolhe onde salvar (padrão: `<pasta Documentos do sistema>/PersonalTaskHub-backups/`, via `app.getPath('documents')`; nesta máquina é `~/Documents`).
- Ao restaurar um backup só de banco, anexos referenciados que estejam em `attachments-deleted/` voltam para `attachments/`; os que não existirem mais aparecem no card como "arquivo indisponível" (sem erro).
- **Backup somente do banco**: opção rápida (arquivo `.db`).
- **Backups automáticos** **[decisão do Claude]**: um por dia, na primeira abertura do dia, só do banco, em `backups/auto/`, mantendo os últimos 14. Mais a cópia pré-migração.
- **Restaurar**: escolher `.zip` ou `.db` → validar (manifest, `integrity_check`, versão de schema ≤ atual) → mostrar resumo (data, contagens) → confirmação → **backup automático do estado atual** → substituir → reiniciar o app (aplicando migrações se o backup for mais antigo).
- Lista de backups automáticos em Configurações com "Restaurar este".

## 12. Instalação e abertura

- Build com **electron-builder**, alvo Linux **pasta descompactada (`dir`)** **[decisão do Claude]**: evita depender de `libfuse2` (exigido por AppImage no Debian 12). O `better-sqlite3` é recompilado para o Electron no build.
- Script `scripts/install-linux.sh` (rodado uma vez, e de novo a cada atualização):
  1. `npm ci && npm run build:dist`;
  2. copia o build para `~/.local/opt/personal-task-hub/` (substitui a versão anterior; a pasta de dados não é tocada);
  3. instala ícone e cria `~/.local/share/applications/personal-task-hub.desktop` e um atalho em `~/Desktop` (marcado como confiável no Cinnamon via `gio set ... metadata::trusted true` e `chmod +x`);
  4. verifica se o sandbox do Chromium funciona; se não, orienta/ajusta (`chrome-sandbox` com SUID, ou fallback documentado).
- Depois disso, o uso diário é só clicar no ícone: o app abre direto na última tela usada (ou no Dashboard).
- Atualização: puxar o código novo e rodar o script de novo. A pasta de dados continua intacta; migrações rodam com backup prévio.

## 13. Estrutura do código (proposta)

```
hub_task_pessoal/
├── package.json, electron.vite.config.ts, electron-builder.yml, tsconfig*.json
├── src/
│   ├── main/
│   │   ├── index.ts           # ciclo de vida, janela, single-instance
│   │   ├── paths.ts           # pasta de dados
│   │   ├── db/                # conexão, pragmas, migrations/
│   │   ├── services/          # um por domínio (companies, tasks, ...)
│   │   ├── ipc/               # handlers + schemas zod
│   │   └── backup/
│   ├── preload/index.ts       # window.api
│   ├── shared/                # tipos e contratos IPC
│   └── renderer/
│       ├── app/ (rotas, layout, sidebar)
│       ├── features/ (dashboard, companies, projects, board, task-modal,
│       │             my-tasks, calendar, files, search, settings)
│       ├── components/ui/
│       └── lib/ (api client, query keys, formatação de datas)
├── tests/ (unit + e2e)
├── scripts/install-linux.sh
└── docs/
```

## 14. Plano de módulos (ordem de entrega)

1. **Fundação**: projeto Electron + React + TS, pasta de dados, conexão SQLite com pragmas, migrações, backup pré-migração, instância única, layout com sidebar vazia, tema.
2. **Espaços, pastas e projetos**: CRUD completo, arquivar/excluir com confirmação, árvore da sidebar com drag and drop, página da empresa, página do projeto.
3. **Quadros Kanban**: quadros, colunas (categoria), cards, drag and drop persistido.
4. **Modal do card**: todos os campos, etiquetas, checklists, comentários, anexos, histórico, duplicar/arquivar/excluir/mover.
5. **Minha semana**: visão semanal com filtros.
6. **Dashboard**: indicadores e gráficos.
7. **Calendário**: mês/semana/dia, filtros, abrir modal.
8. **Pesquisa global**: FTS5, Ctrl+K, página de resultados com filtros.
9. **Arquivos**: página global de anexos.
10. **Configurações e backup**: preferências, etiquetas, backup manual/completo, automáticos, restauração.
11. **Empacotamento**: electron-builder, script de instalação, atalho na área de trabalho, teste de persistência após reinstalação.

Cada módulo termina funcional e persistido (sem telas só visuais), com testes da camada de dados e um teste e2e do fluxo principal.

## 15. Critérios de aceitação principais

- Criar empresa, projeto, quadro, 3 colunas e 200 cards; reordenar; fechar o app; reabrir: tudo idêntico (teste e2e automatizado).
- Matar o processo à força durante uso e reabrir: banco íntegro, última mudança confirmada presente.
- Reinstalar o app (apagar `~/.local/opt/personal-task-hub` e rodar o script): dados intactos.
- Backup completo → apagar pasta de dados → restaurar: tudo de volta, incluindo anexos que abrem.
- Mover card para coluna *Concluído* atualiza dashboard, calendário e Minha semana sem recarregar.
- Busca encontra tarefa por palavra da descrição, sem acento, em < 100 ms com 5.000 tarefas.

## 16. Deixado para o builder

- Escolha exata de versões das bibliotecas e de componentes de UI equivalentes.
- Implementação do calendário (próprio ou biblioteca), desde que cumpra §10.8 e funcione offline.
- Editor de Markdown (textarea com prévia é suficiente).
- Paleta de cores padrão das empresas e design visual detalhado dentro das diretrizes do §10.
- Estratégia de renormalização de `position`.
- Ícone do aplicativo.
