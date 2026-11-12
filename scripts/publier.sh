#!/usr/bin/env bash
# Publie l'état validé du projet sur GitHub (Fram-sudo/sesame) : GitHub construit alors la nouvelle version.
# Le dépôt de travail n'est jamais envoyé : on copie son dernier commit dans une copie séparée,
# sans les fichiers de travail (PRODUCT.md, .impeccable, .claude), signé avec l'adresse anonyme GitHub.
# Usage : bash scripts/publier.sh "Message du changement"   (avant : NOUVEAUTES.md à jour et commit local fait)
set -euo pipefail
SOURCE="$(cd "$(dirname "$0")/.." && pwd)"
COPIE=${COPIE:-/c/Projets/sesame-publication}
MESSAGE=${1:-$(git -C "$SOURCE" log -1 --format=%s)}

if [ -n "$(git -C "$SOURCE" status --porcelain -- . ':!.claude' ':!.impeccable')" ]; then
  echo "Attention : les changements pas encore enregistrés (commit) ne sont pas publiés." >&2
fi

cd "$COPIE"
git pull --ff-only --quiet
git ls-files -z | xargs -0 rm -f            # repart de zéro : les fichiers supprimés disparaissent aussi
git -C "$SOURCE" archive HEAD | tar -x
rm -rf PRODUCT.md .impeccable .claude
git add -A
if git diff --cached --quiet; then echo "Rien de nouveau à publier."; exit 0; fi
git -c user.name=Fram-sudo -c user.email=262650571+Fram-sudo@users.noreply.github.com commit -q -m "$MESSAGE"
git push -q origin main
echo "Publié. Suivi de la construction : https://github.com/Fram-sudo/sesame/actions"
