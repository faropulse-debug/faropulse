#!/usr/bin/env bash
# scripts/setup-worktree.sh
# Crea un git worktree aislado para que cada agente trabaje sin colisionar con otros procesos.

set -euo pipefail

if [ -z "${1:-}" ]; then
  echo "❌ Error: Debes especificar el nombre de la rama."
  echo "Uso: ./scripts/setup-worktree.sh <nombre-de-rama> [rama-base]"
  echo "Ejemplo: ./scripts/setup-worktree.sh feature/qa-lint-assertions origin/develop"
  exit 1
fi

BRANCH="$1"
BASE_REF="${2:-origin/develop}"

# Normalizar nombre para directorio (reemplazar / por -)
SAFE_DIR_NAME=$(echo "$BRANCH" | tr '/' '-')
REPO_ROOT="$(git rev-parse --show-toplevel)"
WORKTREE_BASE="$(dirname "$REPO_ROOT")/faro-app-worktrees"
WORKTREE_PATH="$WORKTREE_BASE/$SAFE_DIR_NAME"

echo "🔄 Verificando estado del repositorio..."
git fetch --all --prune > /dev/null 2>&1 || true

# Verificar si el worktree ya existe
if [ -d "$WORKTREE_PATH" ]; then
  echo "❌ Error: El worktree ya existe en: $WORKTREE_PATH"
  echo "Si deseas eliminarlo, ejecuta: git worktree remove $WORKTREE_PATH"
  exit 1
fi

mkdir -p "$WORKTREE_BASE"

echo "🌱 Creando worktree en: $WORKTREE_PATH ..."

# Verificar si la rama ya existe local o remotamente
if git rev-parse --verify "$BRANCH" >/dev/null 2>&1; then
  git worktree add "$WORKTREE_PATH" "$BRANCH"
elif git rev-parse --verify "origin/$BRANCH" >/dev/null 2>&1; then
  git worktree add --track -b "$BRANCH" "$WORKTREE_PATH" "origin/$BRANCH"
else
  git worktree add -b "$BRANCH" "$WORKTREE_PATH" "$BASE_REF"
fi

# Copiar archivos .env si existen en la raíz para que el worktree tenga entorno listo
for env_file in .env.staging .env.stg-test-users .env.local; do
  if [ -f "$REPO_ROOT/$env_file" ]; then
    cp "$REPO_ROOT/$env_file" "$WORKTREE_PATH/$env_file"
  fi
done

# Crear symlink de node_modules si existe en la raíz para no requerir npm install
if [ -d "$REPO_ROOT/node_modules" ] && [ ! -d "$WORKTREE_PATH/node_modules" ]; then
  ln -s "$REPO_ROOT/node_modules" "$WORKTREE_PATH/node_modules" 2>/dev/null || true
fi

echo ""
echo "✅ Worktree creado con éxito en:"
echo "📂 $WORKTREE_PATH"
echo ""
echo "Para comenzar a trabajar:"
echo "  cd \"$WORKTREE_PATH\""
echo "  git branch --show-current"
