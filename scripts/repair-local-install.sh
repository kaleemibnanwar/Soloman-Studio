#!/usr/bin/env bash
set -euo pipefail

# Applies the local-machine parts of the Soloman Studio repair that cannot be
# done from a sandboxed coding session:
#   - backs up and resets only database files (project folders are untouched)
#   - installs the freshly packaged build over the launcher target
#   - makes local Linux desktop entries launch with --no-sandbox

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="$ROOT/out/Soloman Studio-linux-x64"
APP_DIR="${SOLOMAN_APP_DIR:-$HOME/apps/soloman-studio}"
USER_DATA="$HOME/.config/Soloman Studio"
LEGACY_USER_DATA="$HOME/.config/Octopus Studio"
LEGACY_USER_DATA_LOWERCASE="$HOME/.config/octopus-studio"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$USER_DATA/db-backups/$STAMP"

if [[ ! -x "$BUILD_DIR/soloman-studio" ]]; then
  echo "Build not found at $BUILD_DIR. Run 'npm run package' first." >&2
  exit 1
fi

echo "Stopping running Soloman Studio instances..."
pkill -f "$APP_DIR/soloman-studio" 2>/dev/null || true

mkdir -p "$BACKUP/current" "$BACKUP/legacy" "$BACKUP/legacy-lowercase" "$BACKUP/repo-dev"

move_cache_dir() {
  local source_dir="$1"
  local destination_dir="$2"
  [[ -d "$source_dir" ]] || return 0
  mkdir -p "$destination_dir"
  mv "$source_dir" "$destination_dir/"
}

move_database_files() {
  local source_dir="$1"
  local destination_dir="$2"
  [[ -d "$source_dir" ]] || return 0

  shopt -s nullglob
  local files=(
    "$source_dir"/soloman.db*
    "$source_dir"/sqlite.db*
    "$source_dir"/database.sqlite*
    "$source_dir"/main.db*
  )
  shopt -u nullglob

  for file in "${files[@]}"; do
    mv "$file" "$destination_dir/"
  done
}

echo "Backing up databases to $BACKUP"
move_database_files "$USER_DATA" "$BACKUP/current"
move_database_files "$LEGACY_USER_DATA" "$BACKUP/legacy"
move_database_files "$LEGACY_USER_DATA_LOWERCASE" "$BACKUP/legacy-lowercase"
move_database_files "$ROOT/userData" "$BACKUP/repo-dev"

# Code-index databases are derived caches. Back them up with the main databases
# so a fresh launch rebuilds them from the preserved project folders.
move_cache_dir "$USER_DATA/code-index-cache" "$BACKUP/current"
move_cache_dir "$LEGACY_USER_DATA/code-index-cache" "$BACKUP/legacy"
move_cache_dir "$LEGACY_USER_DATA_LOWERCASE/code-index-cache" "$BACKUP/legacy-lowercase"

# Prevent the first-launch legacy import dialog from restoring the old database.
mkdir -p "$USER_DATA"
printf '%s\n' "$(date -Iseconds)" > "$USER_DATA/.legacy-octopus-studio-import-checked"

echo "Creating home project roots..."
mkdir -p "$HOME/Soloman Studio/Projects/Apps" "$HOME/Soloman Studio/Projects/Workspaces"

echo "Installing packaged build to $APP_DIR"
mkdir -p "$APP_DIR"
cp -a "$BUILD_DIR/." "$APP_DIR/"

echo "Updating local desktop entries..."
for desktop_file in \
  "$HOME/.local/share/applications/soloman-studio.desktop" \
  "$HOME/.local/share/applications/octopusStudio-url-handler.desktop" \
  "$HOME/.local/share/applications/octopus-studio-url-handler.desktop"; do
  [[ -f "$desktop_file" ]] || continue
  if grep -q '^Exec=' "$desktop_file"; then
    sed -i "s|^Exec=.*|Exec=\"$APP_DIR/soloman-studio\" --no-sandbox %U|" "$desktop_file"
  fi
done
update-desktop-database "$HOME/.local/share/applications" >/dev/null 2>&1 || true

# The existing ~/.local/bin entry is a symlink to the raw binary, which still
# needs --no-sandbox on this machine. Replace it with a tiny wrapper.
LOCAL_BIN="$HOME/.local/bin"
mkdir -p "$LOCAL_BIN"
if [[ -e "$LOCAL_BIN/soloman-studio" || -L "$LOCAL_BIN/soloman-studio" ]]; then
  mv "$LOCAL_BIN/soloman-studio" "$LOCAL_BIN/soloman-studio.bak-$STAMP"
fi
cat > "$LOCAL_BIN/soloman-studio" <<EOF
#!/usr/bin/env bash
exec "$APP_DIR/soloman-studio" --no-sandbox "\$@"
EOF
chmod +x "$LOCAL_BIN/soloman-studio"

cat <<EOF
Repair complete.

Database backup: $BACKUP
Installed binary: $APP_DIR/soloman-studio
Launch command: $APP_DIR/soloman-studio --no-sandbox
Terminal command: soloman-studio

Project folders under ~/Documents/Soloman Studio were left untouched. New apps
and workspaces will be created under ~/Soloman Studio/Projects.

Optional secure sandbox setup (instead of --no-sandbox):
  sudo chown root:root "$APP_DIR/chrome-sandbox"
  sudo chmod 4755 "$APP_DIR/chrome-sandbox"
EOF
