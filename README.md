# Personal Task Hub

Central pessoal de tarefas, empresas e projetos. Aplicativo desktop local (Electron + SQLite), sem login, 100% offline.

## Instalar / atualizar

```bash
bash scripts/install-linux.sh
```

O script compila o app, instala em `~/.local/opt/personal-task-hub` e cria o ícone **Personal Task Hub** na área de trabalho e no menu de aplicativos. Para atualizar depois de mudar o código, rode o mesmo comando (feche o app antes).

## Onde ficam os dados

`~/.local/share/personal-task-hub/`

| Pasta/arquivo | Conteúdo |
|---|---|
| `hub.db` | banco SQLite com tudo (empresas, projetos, quadros, tarefas, comentários, histórico, preferências) |
| `attachments/` | arquivos anexados (cópias) |
| `attachments-deleted/` | anexos excluídos, mantidos por 30 dias |
| `logos/` | logotipos das empresas |
| `backups/auto/` | cópia diária automática do banco (últimos 14 dias) |
| `backups/pre-migration/` | cópia feita antes de qualquer atualização de estrutura do banco |
| `backups/pre-restore/` | estado anterior guardado sempre que um backup é restaurado |

Essa pasta **não** faz parte da instalação: atualizar, reinstalar ou apagar `~/.local/opt/personal-task-hub` não a afeta.

## Módulos

- **Abas** no topo (como no navegador): Ctrl+clique ou botão do meio abre em nova aba; Ctrl+T nova aba, Ctrl+W fecha, Ctrl+Tab alterna. As abas abertas voltam quando você reabre o app.
- **Dashboard personalizável**: vários dashboards (Geral, Profissional, Pessoal, Financeiro…), blocos de indicadores, gráficos (barras, linhas, pizza, rosca, tabela), listas e projetos. Use "Editar layout" para arrastar, redimensionar, adicionar e configurar blocos.
- **Meu Dia**: agenda diária em blocos de horário. Aloque tarefas existentes (sem copiar) ou atividades livres; acompanhe concluídas, horas planejadas e intervalos livres.
- **Minha semana**: colunas por dia ou lista cronológica.
- **Todas as Tarefas**: lista ou cards com filtros e edição em massa (status, prioridade, vencimento, mover, arquivar, excluir).
- **Ideias**: registre ideias e transforme-as em tarefa ou projeto.
- **Lista de Compras**: itens com quantidade, preço e categoria; total estimado dos pendentes.
- **Kanban** com cores por quadro, coluna e cartão.

## Backup

Em **Configurações → Backup e restauração**:

- **Fazer backup completo** → um `.zip` com banco + anexos + logotipos (guarde em outro disco/nuvem).
- **Backup só do banco** → um `.db`.
- **Restaurar backup…** → escolhe `.zip` ou `.db`, mostra o resumo, guarda o estado atual em `backups/pre-restore` e reinicia.
- Lista dos backups automáticos diários com "Restaurar este".

## Desenvolvimento

```bash
npm install
npm run dev        # app em modo desenvolvimento (usa ~/.local/share/personal-task-hub-dev)
npm test           # testes unitários (rodam no Node do Electron)
npm run e2e        # testes ponta a ponta (Playwright + Electron)
npm run typecheck
npm run dist       # gera dist/linux-unpacked
```

Atalhos: `Ctrl+K` busca global · `N` novo cartão no quadro · `Esc` fecha o modal · `Ctrl+Enter` envia comentário.
