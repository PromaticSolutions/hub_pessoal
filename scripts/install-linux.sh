#!/usr/bin/env bash
# Personal Task Hub — instala/atualiza o app neste computador (Linux).
# Uso: bash scripts/install-linux.sh            (compila e instala)
#      bash scripts/install-linux.sh --no-build (instala o build já existente em dist/)
# Seus dados ficam em ~/.local/share/personal-task-hub e NUNCA são tocados por este script.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL_DIR="$HOME/.local/opt/personal-task-hub"
APPS_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
ICON_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor/512x512/apps"
DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/personal-task-hub"
DESKTOP_DIR="$(xdg-user-dir DESKTOP 2>/dev/null || echo "$HOME/Desktop")"

cd "$ROOT"

if [[ "${1:-}" != "--no-build" ]]; then
  echo "==> Instalando dependências"
  npm ci
  [[ -x node_modules/electron/dist/electron ]] || node node_modules/electron/install.js
  npx electron-builder install-app-deps
  echo "==> Gerando o aplicativo"
  npm run dist
fi

[[ -x dist/linux-unpacked/personal-task-hub ]] || { echo "Build não encontrado em dist/linux-unpacked"; exit 1; }

if pgrep -f "$INSTALL_DIR/personal-task-hub" >/dev/null 2>&1; then
  echo "O Personal Task Hub está aberto. Feche o app e rode o script novamente."
  exit 1
fi

echo "==> Copiando para $INSTALL_DIR"
mkdir -p "$(dirname "$INSTALL_DIR")"
rm -rf "$INSTALL_DIR.new" "$INSTALL_DIR.old"
cp -a dist/linux-unpacked "$INSTALL_DIR.new"
[[ -d "$INSTALL_DIR" ]] && mv "$INSTALL_DIR" "$INSTALL_DIR.old"
mv "$INSTALL_DIR.new" "$INSTALL_DIR"
rm -rf "$INSTALL_DIR.old"

EXEC_FLAGS=""
if unshare --user true >/dev/null 2>&1; then
  echo "==> Sandbox do Chromium: namespaces de usuário disponíveis (ok)"
else
  echo "==> Sandbox do Chromium: configurando chrome-sandbox (pede senha de administrador)"
  if sudo chown root:root "$INSTALL_DIR/chrome-sandbox" && sudo chmod 4755 "$INSTALL_DIR/chrome-sandbox"; then
    echo "    ok"
  else
    echo "    Não foi possível ajustar o sandbox; o atalho usará --no-sandbox."
    EXEC_FLAGS=" --no-sandbox"
  fi
fi

echo "==> Criando atalhos"
mkdir -p "$APPS_DIR" "$ICON_DIR"
cp build/icon.png "$ICON_DIR/personal-task-hub.png"
DESKTOP_FILE="$APPS_DIR/personal-task-hub.desktop"
cat > "$DESKTOP_FILE" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Personal Task Hub
Comment=Central pessoal de tarefas, empresas e projetos
Exec="$INSTALL_DIR/personal-task-hub"$EXEC_FLAGS %U
Icon=$ICON_DIR/personal-task-hub.png
Terminal=false
Categories=Office;ProjectManagement;
StartupWMClass=Personal Task Hub
DESKTOP
chmod +x "$DESKTOP_FILE"
command -v update-desktop-database >/dev/null && update-desktop-database "$APPS_DIR" >/dev/null 2>&1 || true

if [[ -d "$DESKTOP_DIR" ]]; then
  cp "$DESKTOP_FILE" "$DESKTOP_DIR/personal-task-hub.desktop"
  chmod +x "$DESKTOP_DIR/personal-task-hub.desktop"
  gio set "$DESKTOP_DIR/personal-task-hub.desktop" metadata::trusted true >/dev/null 2>&1 || true
fi

echo
echo "Pronto! Abra pelo ícone \"Personal Task Hub\" na área de trabalho ou no menu de aplicativos."
echo "Seus dados ficam em: $DATA_DIR"
echo "(atualizar ou reinstalar o app não apaga essa pasta)"
