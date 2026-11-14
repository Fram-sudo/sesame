<p align="center"><img src="design/icone-sesame.svg" width="96" alt="Sésame"></p>

<h1 align="center">Sésame</h1>

<p align="center">
  <b>Vos finances, chez vous.</b> Suivi de budget 100 % local et chiffré, pour Windows, Android et Linux.<br>
  <i>Your finances, at home. A 100% local, encrypted budget tracker for Windows, Android and Linux.</i>
</p>

<p align="center">
  <a href="https://fram-sudo.github.io/sesame/">Site et démo interactive</a> ·
  <a href="https://github.com/Fram-sudo/sesame/releases/latest">Télécharger</a>
</p>

---

## Ce que fait Sésame

- **Import de relevés de n'importe quelle banque** (PDF, CSV, Excel) : banque, compte, poches et catégories reconnus automatiquement, doublons ignorés.
- **Argent réellement disponible**, épargne et poches à part, plusieurs devises (euro, franc CFA, dollars).
- **Budgets** mensuels et annuels proposés d'après vos habitudes, avec alertes de rythme.
- **Épargne** (livrets, poches, tirelire), **prêts** (échéancier, remboursement anticipé simulé), **prévision sur 3 mois**.
- **Synchronisation PC ↔ téléphone sans cloud**, par un simple fichier (Quick Share, Bluetooth, e-mail).
- **Français et anglais**, thème clair ou sombre, aide intégrée.

## Vie privée et sécurité

- Aucun serveur, aucun compte en ligne, aucune connexion à la banque, aucun pistage.
- Tout est chiffré sur l'appareil : AES-256-GCM, clé dérivée du mot de passe par Argon2id, clé de récupération en secours.
- Sur Android : ouverture par empreinte (clé gardée par le coffre-fort matériel), captures d'écran bloquées, aucune sauvegarde cloud.
- Détails : [docs/modele-de-menace.md](docs/modele-de-menace.md).

## Vidéos

- [Bande-annonce (35 s)](videos/sesame-trailer.mp4)
- [Présentation (1 min 20)](videos/sesame-pub.mp4)

## Installer

Les fichiers sont dans la [dernière version](https://github.com/Fram-sudo/sesame/releases/latest) ; le [site](https://fram-sudo.github.io/sesame/#installer) explique chaque étape.

| Plateforme | Fichier |
|---|---|
| Windows 10/11 | `Sesame-Windows-Setup.exe` |
| Android 7+ | `Sesame-Android.apk` |
| Ubuntu, Debian | `sesame-linux.deb` |
| Autres Linux (CachyOS, Arch, Fedora…) | `Sesame-Linux.AppImage` |

## Construire depuis les sources

Interface : Svelte 5 + TypeScript (`src/`). Moteur : Rust + Tauri 2 (`src-tauri/`).

```bash
npm ci
npm test            # tests
npm run check       # vérification des types
npm run dev         # interface dans le navigateur, moteur simulé et données fictives (?demo)
```

| Cible | Commande | Résultat |
|---|---|---|
| Windows | `npx tauri build --bundles nsis` | installeur dans `src-tauri/target/release/bundle/nsis/` |
| Android | `bash scripts/construire-android.sh` | APK signé (clé de signature à fournir hors du dépôt) |
| Linux | `bash scripts/construire-linux.sh` (Linux ou WSL) | `linux/Sesame.AppImage` et `linux/sesame.deb` |
| Démo web | `npm run build:demo` | `site/demo/` |

Le site (`site/`) et la démo sont publiés automatiquement sur GitHub Pages à chaque envoi sur `main`.

## Licence

[MIT](LICENSE).
