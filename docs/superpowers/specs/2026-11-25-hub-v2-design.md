# Personal Task Hub v2 — Design

Data: 2026-11-25 · Status: aprovado pelo usuário (2026-11-25)
Base: app v1 (branch `feat/personal-task-hub`, schema v2). Spec v1: `2026-11-25-personal-task-hub-design.md`.

> **[decisão do Claude]** = preenchido por mim, não pedido explicitamente.

## 1. Intenção

Evoluir o app existente para uma central completa (abas, dashboard personalizável, Meu Dia, Ideias, Compras, Todas as Tarefas), com visual mais refinado. **Regra principal do usuário:** não reconstruir, não remover funcionalidades, não mudar regras existentes; tudo integrado sobre os mesmos registros; nenhuma perda de dados.

## 2. Objetivos

1. Refinamento visual em todo o app + dropdowns próprios.
2. Minha semana redesenhada + alternância colunas/lista.
3. Abas superiores estilo navegador (opção A escolhida pelo usuário).
4. Dashboard personalizável por blocos, múltiplos dashboards.
5. Módulo Ideias (cards/lista, converter em tarefa/projeto).
6. Módulo Lista de Compras (total estimado dos pendentes).
7. Módulo Todas as Tarefas (lista/cards, filtros, edição em massa).
8. Módulo Meu Dia (agenda diária por blocos de horário alocando tarefas existentes).
9. Cores de quadros, colunas e cards.

## 3. Não-objetivos

- Módulo financeiro real (receitas/despesas). **Confirmado pelo usuário (opção A):** "Dashboard financeiro" = dashboard com os blocos de Compras (total pendente em R$, gasto por categoria, comprados no mês).
- Abas preservando posição de rolagem (preservam rota, filtros e quadro aberto, não o scroll) **[decisão do Claude]**.
- Recorrência de blocos no Meu Dia (ex.: "almoço todo dia") **[decisão do Claude]**; há "copiar dia anterior".
- Sincronização, multiusuário, notificações (seguem fora, como na v1).

## 4. Anti-objetivos

- Remover/alterar comportamento existente (scope do dashboard, filtros, atalhos, backup, etc.).
- Duplicar tarefas (Meu Dia, Todas as Tarefas e Ideias→tarefa nunca criam cópia de tarefa existente).
- Visual exagerado (sombras fortes, gradientes, cantos muito redondos, cores saturadas em áreas grandes).
- Migração que recrie o banco ou apague dados.

## 5. Abordagens consideradas

| Tema | Escolhida | Alternativa descartada |
|---|---|---|
| Abas | **A: navegador completo** — cada aba guarda qualquer tela; menu troca a aba atual; Ctrl/botão do meio/"Abrir em nova aba" cria aba; Dashboard fixa (escolha do usuário) | B: só projetos em abas |
| Dashboard | **react-grid-layout 2.x** (arrastar + redimensionar em grade, salva x/y/w/h) **[decisão do Claude]** | grade própria com dnd-kit (mais código) |
| Dropdowns | **Componente `Select` próprio** (botão + lista em popover, teclado, animação) substitui todos os `<select>` nativos **[decisão do Claude]** | estilizar `<select>` nativo (a lista aberta continua do sistema) |
| Meu Dia | **tabela `day_blocks`** referenciando `task_id` (sem cópia); arrastar move em passos de 15 min; formulário edita início/fim **[decisão do Claude]** | redimensionar arrastando borda (mais frágil) |
| Anexos de ideias | **mesma tabela `attachments`** com `idea_id` (reconstrução da tabela por migração, dados preservados) **[decisão do Claude]** | tabela separada (página Arquivos/busca teriam que unir duas fontes) |

## 6. Banco de dados (migrações 003–007)

Todas via `runMigrations` (backup pré-migração automático, uma transação por migração). Nada é apagado.

- **003_colors**: `ALTER TABLE boards ADD COLUMN color TEXT`; `columns ADD COLUMN color TEXT`; `tasks ADD COLUMN color TEXT` (todas nulas = visual atual).
- **004_day_blocks**:
  `day_blocks(id, date TEXT 'YYYY-MM-DD', start_time TEXT 'HH:mm', end_time TEXT 'HH:mm', task_id INTEGER NULL REFERENCES tasks ON DELETE SET NULL, title TEXT NULL, note TEXT NOT NULL DEFAULT '', done INTEGER 0/1, color TEXT NULL, created_at, updated_at)`; `CHECK(end_time > start_time)`; índice `(date, start_time)`, `(task_id)`. Bloco com `task_id` = alocação de tarefa (título/projeto/empresa vêm da tarefa; "concluído" = status da tarefa). Sem `task_id` = atividade livre (`title` obrigatório; `done` próprio). Tarefa excluída → bloco vira atividade livre com `title` = "<título da tarefa> (tarefa excluída)", gravado por trigger BEFORE DELETE em tasks **[decisão do Claude]**.
- **005_ideas**:
  `ideas(id, title, description, category TEXT NOT NULL DEFAULT '', priority (low|medium|high|urgent), status (new|analysis|developing|implemented|archived), company_id NULL → companies ON DELETE SET NULL, project_id NULL → projects ON DELETE SET NULL, converted_task_id NULL → tasks ON DELETE SET NULL, converted_project_id NULL → projects ON DELETE SET NULL, position REAL, created_at, updated_at)`; `idea_labels(idea_id, label_id)` (etiquetas globais existentes reaproveitadas).
  Reconstrução de `attachments` adicionando `idea_id → ideas ON DELETE CASCADE` e `CHECK` = exatamente um de task/project/idea; copia todas as linhas com os mesmos ids; recria índices e triggers FTS. Ideias entram no `search_index` (código 6).
- **006_shopping**: `shopping_items(id, name, notes, quantity REAL DEFAULT 1, unit TEXT DEFAULT '', category TEXT DEFAULT '', price_cents INTEGER NULL (preço unitário), url TEXT NULL, priority, status (pending|bought), bought_at, position, created_at, updated_at)`.
- **007_dashboards**: `dashboards(id, name, scope TEXT JSON (mesmo formato do seletor atual), position, created_at)`, `dashboard_widgets(id, dashboard_id → dashboards CASCADE, type, title, config TEXT JSON, x, y, w, h)`. Seed: dashboard **"Geral"** com widgets que reproduzem exatamente o dashboard atual (8 KPIs, Atrasadas, Próximos, Carga por espaço, Prioridade, Produtividade, Resumo por espaço).
- Preferências novas em `settings`: `tabs.state`, `week.mode`, `allTasks.view`, `allTasks.filters`, `ideas.view`, `shopping.filter`, `myDay.workday` (`{start:'08:00', end:'18:00'}`), `dashboard.active`.

## 7. Módulos

### 7.1 Visual (todo o app)
Ajuste dos tokens da v1 (mantém Inter, índigo, raios 5–6 px — o usuário pediu antes "sem bordas muito redondas"):
- Borda sutil 1px `--line` em todas as superfícies + sombra discreta; superfícies com leve transparência (`rgba(255,255,255,.88)` + `backdrop-filter: blur(8px)`) em barra de abas, cabeçalhos fixos, menus e popovers.
- Melhor separação de seções (títulos de seção 12px caixa-alta, espaçamento 24px), contraste fundo/cartão, estados hover/selecionado consistentes (fundo índigo 8% + texto índigo 700).
- Aplicar em todas as telas existentes e novas. Nenhuma estrutura de tela existente é removida.

### 7.2 Dropdowns e menus
- `Select<T>` próprio: props `value`, `onChange(value)`, `options: {value,label,icon?,color?,group?}[]`, `placeholder`, `data-testid`; lista em popover (portal) com sombra, borda, translucidez, ícone ✓ no selecionado, hover, navegação ↑↓ Enter Esc, digitação para pular, animação de abrir/fechar (120 ms fade+translate). Substitui todos os `<select>` nativos.
- `Menu` existente ganha a mesma aparência, ícones e animação.
- Testes e2e passam a usar helper `pick(page, testId, label|value)`.

### 7.3 Abas (estilo navegador)
- Barra fixa no topo da área principal (à direita da sidebar). Aba = `{ id, path (rota+query), title, icon }`. Aba **Dashboard** fixa (sem ×, sempre a primeira).
- Clicar no menu lateral/árvore/links = navega **a aba ativa**, exceto quando a ativa é a aba fixa Dashboard: aí o destino abre em uma **nova aba** (ou ativa uma aba já aberta exatamente nessa rota), como uma aba fixada do Chrome **[decisão do Claude]**.
- Ir para o Dashboard (item do menu, `/?space=` vindo da página do espaço) sempre **ativa a aba fixa** (aplicando o escopo pedido); o dashboard nunca é carregado em outra aba **[decisão do Claude]**. Ctrl+clique, botão do meio, ou item "Abrir em nova aba" (menu ⋯ dos projetos e quadros) = nova aba. "+" abre nova aba em **Todas as Tarefas** **[decisão do Claude]**.
- Contexto da aba = rota completa (projeto, quadro, `?view=`, `?task=` não é salvo). Filtros continuam nos settings de cada tela (compartilhados entre abas da mesma tela) **[decisão do Claude]**.
- Título da aba derivado da rota (nome do projeto/quadro, nome do módulo); atualiza se renomear.
- Fechar aba ativa → ativa a vizinha da direita (ou esquerda). Arrastar para reordenar. Atalhos: Ctrl+T (nova), Ctrl+W (fechar), Ctrl+Tab / Ctrl+Shift+Tab, Ctrl+1..9.
- Persistidas em `settings.tabs.state` e restauradas ao abrir (substitui a "última rota" da v1, que vira a rota da aba ativa). Aba que aponta para projeto excluído mostra "não encontrado" e pode ser fechada.
- Limite de 20 abas (a 21ª fecha a mais antiga não fixa) **[decisão do Claude]**.

### 7.4 Todas as Tarefas (`/all`)
- Reutiliza `tasks.query` (filtros: empresa, projeto, status, prioridade, etiqueta, período de vencimento, período de criação, escopo, atrasadas, sem prazo, incluir concluídas/arquivadas, texto no título). Ordenação: vencimento, prioridade, status, criação.
- Lista (tabela densa: seleção, título, espaço, projeto, status, prioridade, vencimento) e Cards (grade). Paginação virtual não necessária até ~5.000 (renderiza 200 por vez com "carregar mais") **[decisão do Claude]**.
- Seleção múltipla (checkbox, Shift+clique para intervalo, "selecionar todos os filtrados"). Barra de ações em massa: alterar status, prioridade, vencimento (definir/limpar), mover para projeto (vai para a primeira coluna da mesma categoria do quadro principal do destino, senão primeira coluna), arquivar/restaurar, excluir (confirmação com contagem).
- Serviço `tasks.bulk({ ids, action })` em **uma transação**, registrando histórico por tarefa.
- Clique abre o modal existente.

### 7.5 Minha semana (redesign)
- Alternador **Colunas | Lista** (`week.mode`).
- Colunas: grade de 7 dias + "Atrasadas" ocupando a largura disponível (`minmax(180px,1fr)`, rolagem horizontal só quando estreito); cabeçalho do dia com nome, data, contagem e destaque de hoje; coluna "Sem prazo" opcional (toggle).
- Cartões: título, ponto da empresa + projeto, selo de prioridade, chip de status com cor (A fazer cinza, Em andamento azul, Concluído verde), marcador "Atrasada" (vermelho) e "Vence hoje/amanhã" (âmbar), horário se houver, ícone se alocada no Meu Dia.
- Lista: cronológica agrupada por dia (Atrasadas, Hoje, Amanhã, dias seguintes da semana), mesmos cartões em linha.
- Mantém filtros, navegação de semana, nova tarefa e checkbox de concluir.

### 7.6 Cores dos quadros, colunas e cards
- Quadro: cor no menu da aba do quadro → ponto colorido na aba e faixa sutil no topo do quadro.
- Coluna: cor no menu da coluna → fundo da coluna = cor com ~7% de opacidade (modo escuro ~12%), cabeçalho com ponto da cor. Sem cor = visual atual.
- Cartão: cor opcional no modal (painel lateral) → faixa de 3px no topo do cartão.
- Paleta de 12 cores suaves + cor personalizada. Persistido nas colunas `color`.

### 7.7 Meu Dia (`/day`)
- Data selecionada (← hoje →, seletor de data). Linha do tempo de 00:00–24:00 com rolagem iniciando no início do expediente; marcação "agora".
- Blocos posicionados por horário (altura proporcional; sobreposições lado a lado). Bloco de tarefa mostra título, ponto da empresa, projeto, prioridade, checkbox (concluir tarefa = `tasks.setStatus done`); bloco livre mostra título/observação e checkbox próprio.
- Criar: clicar num horário livre (abre formulário com início/fim pré-preenchidos, 1h) ou botão "Adicionar bloco". Formulário: início, fim, tipo (tarefa existente | atividade livre), busca de tarefa (por título, filtros empresa/projeto; mostra vencimento), título/observação, cor.
- Painel lateral "Tarefas para alocar": busca + filtros; seções "Vencem hoje", "Atrasadas", "Esta semana", "Todas abertas"; arrastar uma tarefa para a linha do tempo cria o bloco (1h no horário solto, arredondado a 15 min).
- Arrastar bloco = move (mantém duração, passo de 15 min). Editar/excluir pelo bloco. "Copiar blocos do dia anterior" (só atividades livres e tarefas ainda abertas).
- Resumo do dia: atividades planejadas × concluídas (barra de progresso), horas planejadas, horas livres no expediente (`myDay.workday`, configurável), lista de intervalos livres.
- Alocação independente do vencimento. Integração: o modal da tarefa mostra "Programada: qua 26/11 09:00–10:30" (lista de alocações futuras) e Minha semana mostra ícone de relógio.

### 7.8 Ideias (`/ideas`)
- Campos do §6. Categoria = texto livre com sugestões das já usadas. Etiquetas = as etiquetas globais.
- Visualização **Cards** (agrupáveis por status, como colunas simples sem arrastar) e **Lista**; filtros por status, categoria, prioridade, empresa, etiqueta; busca.
- Criação rápida (só título + Enter) e modal de detalhe (todos os campos, anexos, data de criação).
- **Converter em tarefa**: escolhe projeto → cria tarefa via `tasks.quickCreate` com título, descrição, prioridade, etiquetas, e **copia** os anexos para a tarefa; ideia recebe `converted_task_id`, status vira "Em desenvolvimento" e mostra link "Abrir tarefa". **Converter em projeto**: escolhe espaço/pasta → `projects.create` com nome e descrição; `converted_project_id`. A ideia não é apagada.
- Ideias entram na busca global.

### 7.9 Lista de Compras (`/shopping`)
- Adição rápida em uma linha ("Café 2" → nome + quantidade; campos extras no detalhe) **[decisão do Claude]**.
- Campos do §6. Preço em R$ (unitário × quantidade). Link abre no navegador.
- Filtros: Pendentes (padrão) | Comprados | Todos; categoria; agrupar por categoria. Marcar comprado (checkbox; registra `bought_at`), desfazer.
- Visualização lista (padrão) e cards. Cabeçalho: **total estimado dos pendentes** (só itens com preço; mostra "N itens sem preço").
- Editar e excluir (confirmação).

### 7.10 Dashboard personalizável
- Seletor de dashboards (abas internas ou dropdown) + "Novo dashboard" (vazio | duplicar atual | modelos Geral, Profissional, Pessoal, Financeiro (Compras)) + renomear/excluir (não exclui o último).
- **Seletor de escopo atual preservado** (Tudo/Pessoal/Profissional/espaço/projeto) como escopo padrão do dashboard; cada widget pode sobrescrever a fonte.
- Modo **Editar layout**: arrastar e redimensionar blocos (react-grid-layout, 12 colunas, linha 40 px), botão "+ Adicionar bloco", ⚙ editar, × remover. Fora do modo edição o layout é fixo (evita arrastar sem querer).
- Tipos de bloco: Indicador numérico (métrica: total, pendentes, em andamento, concluídas, atrasadas, vencendo, projetos ativos, empresas, compras pendentes R$, comprado no mês R$, ideias novas, blocos do dia), Card de resumo (vários indicadores), Gráfico (tipo: barras, barras empilhadas, linhas, pizza, rosca; dados: por prioridade, por status, por empresa, por projeto, produtividade semanal, criadas×concluídas), Lista de tarefas (atrasadas | próximas | filtro livre), Projetos ativos (com % de conclusão), Compras pendentes, Gráfico de compras por categoria (R$; pendentes ou comprados no mês).
- Configuração do bloco: título, tipo, dados, fonte (herdar escopo | espaço | projeto | pessoal/profissional), cor (paleta) e tamanho.
- Dados reais via `dashboard.widgetData({ widget, scope })` no processo principal, reaproveitando `queryTasks`/serviços existentes. Atualiza após mutações (invalidação já existente).
- Tudo persistido (layout salvo ao soltar/redimensionar, com debounce).

### 7.11 Integração (regras)
- Uma única tabela de tarefas; todas as telas leem `v_tasks`. Mudanças invalidam todas as consultas (mecanismo atual).
- Tarefa concluída em qualquer tela reflete em dashboard, semana, Meu Dia, calendário e Todas as Tarefas.
- Arquivamento herdado (v1) vale também para Meu Dia (bloco de tarefa arquivada aparece esmaecido) e Todas as Tarefas (oculta por padrão).

## 8. Navegação (sidebar)
Dashboard · Meu Dia · Minha semana · Todas as Tarefas · Calendário · Ideias · Lista de Compras · Arquivos · Empresas · (Espaços) · Configurações.

## 9. Qualidade e entrega
- Cada migração com teste unitário (dados existentes preservados, inclusive reconstrução de `attachments` com anexos e FTS).
- Serviços novos com testes unitários (TDD); fluxos principais com e2e: abas (abrir, trocar, fechar, persistir), Todas as Tarefas (edição em massa), Meu Dia (alocar tarefa existente sem cópia + concluir reflete no dashboard), Ideia → tarefa, Compras (total), dashboard (adicionar/mover bloco e persistir), cores.
- Suíte v1 continua passando (testes ajustados apenas onde `<select>` vira `Select`).
- Ordem de entrega: visual+dropdowns → abas → Todas as Tarefas → Minha semana → cores → Meu Dia → Ideias → Compras → dashboard personalizável → revisão final → reinstalação.

## 10. Deixado para o builder
- Detalhes finos de paleta/espaçamento dentro do §7.1.
- Ícones de cada módulo (lucide).
- Estrutura interna dos componentes React.
