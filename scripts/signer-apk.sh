#!/usr/bin/env bash
# Signe l'APK Android avec la clé rangée hors du dépôt (dossier DOSSIER_CLES : keystore.properties + portefeuille-release.jks).
# Toujours la même clé : sinon Android refuse d'installer la mise à jour par-dessus.
set -euo pipefail
DOSSIER_CLES=${DOSSIER_CLES:-/c/Projets/Portefeuille-cles}
CLES=$DOSSIER_CLES/keystore.properties
BT="$LOCALAPPDATA/Android/Sdk/build-tools/36.0.0"
SRC=src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk
OUT=Sesame.apk
PASS=$(grep '^storePassword=' "$CLES" | cut -d= -f2)
"$BT/zipalign.exe" -f -p 4 "$SRC" aligne.tmp.apk
"$BT/apksigner.bat" sign --ks "$DOSSIER_CLES/portefeuille-release.jks" \
  --ks-key-alias portefeuille --ks-pass "pass:$PASS" --out "$OUT" aligne.tmp.apk
rm -f aligne.tmp.apk "$OUT.idsig"
"$BT/apksigner.bat" verify "$OUT" && echo "APK signé : $OUT"
