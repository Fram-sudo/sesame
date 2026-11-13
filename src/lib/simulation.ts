// DÃ©veloppement uniquement : simule le moteur Rust (coffre en mÃ©moire, rien d'Ã©crit) pour essayer
// l'interface dans un navigateur ordinaire. Jamais inclus dans l'appli construite.
import { mockIPC } from "@tauri-apps/api/mocks";

const memoire = new Map<string, { collection: string; valeur: unknown }>();
let parametres: unknown = null;
let ouvert = false;
let existe = true; // mot de passe simulÃ© : Â« test test test Â»

// ?demo : coffre dÃ©jÃ  ouvert avec les donnÃ©es de dÃ©mo (captures d'Ã©cran automatiques)
// Démo du site (vite build --mode demo) : toujours ouverte avec les données fictives
if (import.meta.env.MODE === "demo" || new URLSearchParams(location.search).has("demo")) {
  ouvert = true;
  parametres = { guideVu: true }; // pas de guide de premier lancement par-dessus la démo
  setTimeout(async () => {
    await (await import("./demo")).chargerDemo();
    // Budgets d'exemple (simulateur seulement)
    const { ecrire } = await import("./donnees.svelte");
    await ecrire([
      { collection: "budgets", id: "cat-alimentation", valeur: { id: "cat-alimentation", montant: 40000 } },
      { collection: "budgets", id: "cat-shopping", valeur: { id: "cat-shopping", montant: 10000 } },
      { collection: "budgets", id: "cat-restaurants", valeur: { id: "cat-restaurants", montant: 5000 } },
      { collection: "budgets", id: "cat-voyages", valeur: { id: "cat-voyages", montant: 60000, frequence: "annee" } },
      { collection: "budgets", id: "global", valeur: { id: "global", montant: 140000 } },
      { collection: "prets", id: "pret-demo", valeur: { id: "pret-demo", nom: "Prêt étudiant (démo)", organisme: "Banque fictive", capital: 800000, taux: 1.2, duree: 72, premiere: "2025-06-05", assurance: 350 } },
    ]);
    if (new URLSearchParams(location.search).has("rappel")) {
      await ecrire([{ collection: "operations", id: "op-rappel", valeur: { id: "op-rappel", compteId: "x", date: "2026-01-01", montant: -100, libelle: "Test", cle: "t" } as never }]);
      const { app } = await import("./etat.svelte");
      app.params.derniereSauvegarde = Date.now() - 45 * 86_400_000;
    }
    const page = new URLSearchParams(location.search).get("page");
    const { app } = await import("./etat.svelte");
    if (page) app.page = page as never;
    const mode = new URLSearchParams(location.search).get("mode");
    if (mode) app.periode = { ...app.periode, mode: mode as never };
    // Captures du site : seule la section voulue reste sous l'en-tête (repère data-visite)
    const cible = new URLSearchParams(location.search).get("cible");
    if (cible) document.head.append(Object.assign(document.createElement("style"), { textContent: `main section.carte:not([data-visite="${cible}"]), main .carte.resume:not([data-visite="${cible}"]) { display: none !important; }` }));
  }, 1500);
}

// ?vide : coffre ouvert mais vide (premier lancement, guide de prise en main)
if (new URLSearchParams(location.search).has("vide")) ouvert = true;

mockIPC(async (cmd, a) => {
  const args = (a ?? {}) as Record<string, any>;
  switch (cmd) {
    case "etat_coffre":
      return { existe, ouvert };
    case "creer_coffre":
      existe = ouvert = true;
      return "ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567-ABCD-EFGH-IJKL-MNOP-QRST";
    case "deverrouiller":
      if (args.mdp !== "test test test") throw "Mot de passe incorrect.";
      ouvert = true;
      return;
    case "verrouiller":
      ouvert = false;
      return;
    case "lire_parametres":
      return parametres;
    case "ecrire_parametres":
      parametres = args.valeur;
      return;
    case "lire_tout":
      return [...memoire].map(([id, e]) => ({ id, ...e }));
    case "ecrire_lot":
      for (const c of args.changements) c.valeur === null ? memoire.delete(c.id) : memoire.set(c.id, c);
      return;
    case "lire_releves": {
      if (import.meta.env.MODE === "demo" || new URLSearchParams(location.search).has("visite")) return [releveExemple()];
      // Choix du fichier d'exemple : localStorage.fichier = "boursobank.csv" par exemple
      const nom = localStorage.getItem("fichier") ?? "revolut.csv";
      const octets = await (await fetch(`/tests/fixtures/${nom}`)).arrayBuffer();
      if (nom.endsWith(".pdf")) return [{ nom, lignes: null, texte: null, pdf: btoa(String.fromCharCode(...new Uint8Array(octets))), erreur: null }];
      const latin = nom.includes("societe");
      return [{ nom, lignes: null, texte: new TextDecoder(latin ? "windows-1252" : "utf-8").decode(octets), pdf: null, erreur: null }];
    }
    case "tout_effacer":
      memoire.clear();
      parametres = null;
      existe = ouvert = false;
      return;
    case "plugin:app|version":
      return "0.1.0";
    case "derniere_version": {
      // ?maj : fait apparaître la carte « Nouvelle version »
      if (!new URLSearchParams(location.search).has("maj")) throw "Pas de connexion";
      const f = (n: string) => `https://github.com/Fram-sudo/sesame/releases/download/v0.1.9/${n}`;
      return JSON.stringify({ version: "0.1.9", date: "2026-11-20", page: "https://github.com/Fram-sudo/sesame/releases/tag/v0.1.9",
        fichiers: { windows: f("Sesame-Windows-Setup.exe"), android: f("Sesame-Android.apk"), deb: f("sesame-linux.deb"), appimage: f("Sesame-Linux.AppImage") },
        notes: { fr: ["Mises à jour automatiques.", "Historique des versions dans l'Aide."], en: ["Automatic updates.", "Version history in Help."] } });
    }
    case "ouvrir_lien":
      return;
    default:
      throw `Simulation : commande ${cmd} non simulÃ©e.`;
  }
});

/** Démo du site : relevé Boursobank fictif des derniers jours (aucun fichier à télécharger) */
function releveExemple() {
  const jour = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
  const lignes: [number, string, string][] = [
    [1, "CARTE PHARMACIE DU CENTRE", "-12,90"],
    [2, "CARTE CARREFOUR MARKET", "-46,35"],
    [3, "PRLV SEPA FREE MOBILE", "-15,99"],
    [4, "CARTE SNCF CONNECT", "-38,00"],
    [5, "VIR SEPA REMBOURSEMENT AMELI", "23,10"],
    [6, "CARTE BOULANGERIE PAUL", "-6,80"],
    [8, "PRLV SEPA NETFLIX", "-13,49"],
    [9, "CARTE CINEMA PATHE", "-11,50"],
  ];
  const texte =
    "dateOp;dateVal;label;category;categoryParent;supplierFound;amount;comment;accountNum;accountLabel;accountbalance\n" +
    lignes.map(([n, l, m]) => `${jour(n)};${jour(n)};"${l}";;;;"${m}";;00000000000;"COMPTE BOURSOBANK (DÉMO)";`).join("\n");
  return { nom: "releve-boursobank-demo.csv", lignes: null, texte, pdf: null, erreur: null };
}
