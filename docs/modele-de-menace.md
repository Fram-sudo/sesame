# Modèle de menace (version simple)

Ce document dit, en langage courant, contre quoi l'application vous protège et contre quoi elle ne peut rien.

## Ce qu'on protège

Vos données financières : comptes, opérations, prêts, budgets, profils de banque, réglages, aperçus d'import.

## Les risques couverts

| Situation | Ce qui se passe |
|---|---|
| On vole votre téléphone ou votre PC éteint ou verrouillé | Les données sont chiffrées (AES-256-GCM). Sans votre mot de passe (ou votre clé de récupération), elles sont illisibles. |
| On copie le dossier de l'appli ou un fichier de sauvegarde | Même chiffrement, même résultat : illisible. Le calcul de la clé à partir du mot de passe est volontairement lent (Argon2id) pour rendre très coûteux l'essai de millions de mots de passe. |
| Avec le second facteur activé (jalon 8) | Il faut en plus le fichier-clé ou votre empreinte liée à la puce du téléphone. Le mot de passe seul ne suffit plus. |
| Quelqu'un intercepte un paquet de synchronisation (Quick Share, câble, clé USB) | Le paquet est chiffré avec la clé du coffre, que seuls vos appareils appairés possèdent. Il est illisible et toute modification est détectée et refusée. |
| Un appareil inconnu tente de se faire passer pour le vôtre | L'appairage affiche un code court identique sur les deux appareils : vous vérifiez à l'œil. Un paquet venant d'un appareil non appairé est rejeté. |
| Quelqu'un regarde par-dessus votre épaule | Mode discret (montants masqués), verrouillage automatique après inactivité. |
| Capture d'écran ou aperçu dans le sélecteur d'applis Android | Bloqué par Android à la demande de l'appli. |
| Fuite vers Internet | Aucune donnée financière n'est jamais envoyée. Seule exception, et désactivable : la récupération des taux de change (voir plus bas). |

## Les risques NON couverts (honnêtement)

- **Un appareil déjà piraté** (logiciel espion, enregistreur de frappes) pendant que l'appli est ouverte : il peut voir ce que vous voyez. Aucune appli ne peut se protéger de ça.
- **Vous déverrouillez l'appli et quelqu'un prend l'appareil** avant le verrouillage automatique.
- **Un mot de passe faible** : le chiffrement ne vaut que ce que vaut le mot de passe. La jauge de robustesse est là pour vous aider.
- **Perte du mot de passe ET de la clé de récupération** : les données sont perdues définitivement. C'est le prix d'un vrai chiffrement : personne, pas même nous, ne peut les rouvrir.
- **Les fichiers de relevés que vous téléchargez depuis votre banque** : ils sont en clair sur votre disque tant que vous ne les supprimez pas. L'appli ne les garde pas, mais elle ne peut pas effacer l'original à votre place.
- **Un faux fichier d'installation** : installez uniquement les fichiers que je vous fournis.

## Connexion Internet pour les taux de change (votre choix du 2026-11-09)

- Option **activée au choix** dans les paramètres. Désactivée, l'appli ne se connecte jamais à rien.
- Activée, l'appli télécharge uniquement le fichier public des taux de référence de la Banque centrale européenne (`www.ecb.europa.eu`). Elle **n'envoie aucune donnée** : c'est une simple lecture, comme ouvrir une page web.
- Ce que la BCE peut voir : votre adresse IP et le fait qu'un appareil a demandé les taux. Rien d'autre.
- Le dernier taux chargé est gardé (chiffré) avec sa date. Hors ligne, l'appli utilise ce dernier taux et affiche sa date.
- Le franc CFA (XOF) n'a pas besoin d'Internet : il est lié à l'euro par un taux fixe (1 € = 655,957 F CFA).
- Techniquement, l'appli est configurée pour refuser toute connexion vers une autre adresse que celle de la BCE.
