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
