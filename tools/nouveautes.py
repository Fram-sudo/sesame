#!/usr/bin/env python3
"""Prépare une version de Sésame à partir de NOUVEAUTES.md.

  python3 tools/nouveautes.py --version 0.1.12 [--precedent latest-precedent.json] [--sortie dossier]

Écrit dans le dossier de sortie :
  - latest.json        lu par l'appli et le site (dernière version, liens, nouveautés, historique)
  - release-body.md    texte de la version sur GitHub
et met à jour src/lib/nouveautes.json (historique embarqué dans l'appli, lisible hors ligne).
"""
import argparse
import datetime
import json
import os
import re

DEPOT = "https://github.com/Fram-sudo/sesame"
FICHIERS = {
    "windows": "Sesame-Windows-Setup.exe",
    "android": "Sesame-Android.apk",
    "deb": "sesame-linux.deb",
    "appimage": "Sesame-Linux.AppImage",
}
PAR_DEFAUT = {"fr": ["Corrections et petites améliorations."], "en": ["Fixes and small improvements."]}
MAX_HISTORIQUE = 60


def lire_notes(chemin="NOUVEAUTES.md"):
    """Puces des sections « ## FR » et « ## EN » (commentaires HTML ignorés)."""
    texte = re.sub(r"<!--.*?-->", "", open(chemin, encoding="utf-8").read(), flags=re.S)
    notes, langue = {"fr": [], "en": []}, None
    for ligne in texte.splitlines():
        titre = re.match(r"^##\s+(FR|EN)\b", ligne.strip(), re.I)
        if titre:
            langue = titre.group(1).lower()
        elif langue and ligne.strip().startswith("- "):
            notes[langue].append(ligne.strip()[2:].strip())
    return notes


def preparer(version, precedent, sortie, notes=None, aujourd_hui=None):
    notes = notes if notes is not None else lire_notes()
    avant = json.load(open(precedent, encoding="utf-8")) if precedent and os.path.exists(precedent) else {}
    # Texte inchangé depuis la version publiée précédente : rien de nouveau à raconter
    if not notes["fr"] or notes == avant.get("notes"):
        notes = PAR_DEFAUT
    if not notes["en"]:
        notes = {"fr": notes["fr"], "en": PAR_DEFAUT["en"]}
    date = aujourd_hui or datetime.date.today().isoformat()
    entree = {"version": version, "date": date, "notes": notes}
    # Sans version précédente publiée (première fois), on repart de l'historique embarqué dans l'appli
    passe = avant.get("history") or json.load(open("src/lib/nouveautes.json", encoding="utf-8"))
    historique = [entree] + [h for h in passe if h.get("version") != version]
    dernier = {
        "version": version,
        "date": date,
        "page": f"{DEPOT}/releases/tag/v{version}",
        "fichiers": {k: f"{DEPOT}/releases/download/v{version}/{v}" for k, v in FICHIERS.items()},
        "notes": notes,
        "history": historique[:MAX_HISTORIQUE],
    }
    os.makedirs(sortie, exist_ok=True)
    json.dump(dernier, open(os.path.join(sortie, "latest.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    json.dump(historique[:MAX_HISTORIQUE], open("src/lib/nouveautes.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    corps = ["## FR", ""] + [f"- {n}" for n in notes["fr"]] + ["", "## EN", ""] + [f"- {n}" for n in notes["en"]]
    corps += [
        "",
        "---",
        "",
        "| Plateforme / Platform | Fichier / File |",
        "|---|---|",
        f"| Windows 10/11 | [{FICHIERS['windows']}]({dernier['fichiers']['windows']}) |",
        f"| Android 7+ | [{FICHIERS['android']}]({dernier['fichiers']['android']}) |",
        f"| Ubuntu, Debian | [{FICHIERS['deb']}]({dernier['fichiers']['deb']}) |",
        f"| Autres Linux / Other Linux | [{FICHIERS['appimage']}]({dernier['fichiers']['appimage']}) |",
        "",
        "Installation pas à pas / Step-by-step install: https://fram-sudo.github.io/sesame/#installer",
    ]
    open(os.path.join(sortie, "release-body.md"), "w", encoding="utf-8").write("\n".join(corps) + "\n")
    return dernier


if __name__ == "__main__":
    a = argparse.ArgumentParser()
    a.add_argument("--version", required=True)
    a.add_argument("--precedent")
    a.add_argument("--sortie", default="publication")
    args = a.parse_args()
    d = preparer(args.version, args.precedent, args.sortie)
    print(f"Version {d['version']} : {len(d['history'])} entrée(s) d'historique")
