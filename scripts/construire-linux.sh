#!/usr/bin/env bash
# Construit Sésame pour Linux (AppImage + .deb) depuis WSL (Ubuntu) ou une vraie machine Linux.
# Prérequis système (une fois, en administrateur) :
#   apt install build-essential curl wget file libwebkit2gtk-4.1-dev libxdo-dev libssl-dev \
#     libayatana-appindicator3-dev librsvg2-dev patchelf nodejs npm rsync
# Usage depuis Windows : wsl -d Ubuntu -e bash /mnt/c/Projets/Portefeuille/scripts/construire-linux.sh
set -euo pipefail

SOURCE="$(cd "$(dirname "$0")/.." && pwd)"
TRAVAIL="$HOME/sesame"        # construire hors de /mnt/c : beaucoup plus rapide
SORTIE="$SOURCE/linux"

# Rust (dans le compte de l'utilisateur, sans mot de passe)
if [ ! -x "$HOME/.cargo/bin/cargo" ]; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
fi
export PATH="$HOME/.cargo/bin:$PATH"

echo "== Copie du projet"
rsync -a --delete \
  --exclude node_modules --exclude .git --exclude 'src-tauri/target' --exclude 'src-tauri/gen/android/app/build' \
  --exclude '*.apk' --exclude linux --exclude .impeccable \
  "$SOURCE/" "$TRAVAIL/"

cd "$TRAVAIL"
echo "== Dépendances JavaScript"
npm ci --no-audit --no-fund

echo "== Construction (AppImage et .deb)"
rm -rf src-tauri/target/release/bundle   # pas de vieux paquets mélangés aux nouveaux
npx tauri build --bundles appimage,deb

mkdir -p "$SORTIE"
# Noms sans accent : plus simples à taper dans un terminal Linux
cp -f src-tauri/target/release/bundle/appimage/*.AppImage "$SORTIE/Sesame.AppImage"
cp -f src-tauri/target/release/bundle/deb/*.deb "$SORTIE/sesame.deb"
echo "== Terminé :"
ls -la "$SORTIE"
