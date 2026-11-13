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
    // ?ancienbudget : coffre abîmé par une ancienne version (le budget a écrasé sa catégorie), pour tester la réparation
    if (new URLSearchParams(location.search).has("ancienbudget")) {
      memoire.delete("budget:cat-alimentation");
      memoire.set("cat-alimentation", { collection: "budgets", valeur: { id: "cat-alimentation", montant: 40000 } });
    }
    if (new URLSearchParams(location.search).has("rappel")) {
      await ecrire([{ collection: "operations", id: "op-rappel", valeur: { id: "op-rappel", compteId: "x", date: "2026-01-01", montant: -100, libelle: "Test", cle: "t" } as never }]);
      const { app } = await import("./etat.svelte");
      app.params.derniereSauvegarde = Date.now() - 45 * 86_400_000;
    }
    // ?attente : deux opérations en attente sur le premier compte (essai de l'écran « Opérations en attente »)
    if (new URLSearchParams(location.search).has("attente")) {
      const { donnees } = await import("./donnees.svelte");
      const c = donnees.comptes[0].id;
      const auj = new Date().toISOString().slice(0, 10);
      await ecrire([
        { collection: "operations", id: "att-1", valeur: { id: "att-1", compteId: c, date: auj, montant: -24990, libelle: "CARTE FNAC", cle: "att1", enAttente: true, demo: true } as never },
        { collection: "operations", id: "att-2", valeur: { id: "att-2", compteId: c, date: auj, montant: -5010, libelle: "CARTE SNCF CONNECT", cle: "att2", enAttente: true, demo: true } as never },
      ]);
    }
    // ?especes : porte-monnaie + retrait au distributeur sur le compte courant ; ?reserve : le Livret A devient une réserve
    const q = new URLSearchParams(location.search);
    if (q.has("especes") || q.has("reserve")) {
      const { donnees, classerEtLier } = await import("./donnees.svelte");
      const cc = donnees.comptes.find((c) => c.type !== "epargne" && !c.parentId)!;
      if (q.has("especes")) {
        await ecrire([
          { collection: "comptes", id: "pm", valeur: { id: "pm", nom: "Porte-monnaie", banque: "", devise: "EUR", soldeInitial: 0, type: "courant", forme: "especes", demo: true } as never },
          { collection: "operations", id: "dab", valeur: { id: "dab", compteId: cc.id, date: new Date().toISOString().slice(0, 10), montant: -6000, libelle: "RETRAIT DAB PARIS 12", cle: "dab", demo: true } as never },
          { collection: "operations", id: "pain", valeur: { id: "pain", compteId: "pm", date: new Date().toISOString().slice(0, 10), montant: -450, libelle: "Boulangerie", cle: "pain", manuelle: true, demo: true } as never },
        ]);
      }
      if (q.has("reserve")) {
        const l = donnees.comptes.find((c) => c.nom.startsWith("Livret A"))!;
        await ecrire([{ collection: "comptes", id: l.id, valeur: { ...l, nom: "Repayment of the loan (démo)", reserve: true } as never }]);
      }
      await classerEtLier();
    }
    // ?etape=1 : relevés choisis ; 2 : et validés ; 3 : et importés (captures de l'import groupé)
    const etape = +(q.get("etape") ?? 0);
    if (etape) {
      const { app } = await import("./etat.svelte");
      app.page = "import";
      const clic = async (texte: string) => {
        await new Promise((r) => setTimeout(r, 700));
        [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === texte)?.click();
      };
      await clic("Choisir des fichiers");
      if (etape >= 2) await clic("C'est bon pour tous");
      if (etape >= 3) await clic("Importer tout");
    }
    // ?menudevise : menu « en euros ▾ » ouvert (captures)
    if (q.has("menudevise")) setTimeout(() => (document.querySelector(".choix .declencheur") as HTMLElement | null)?.click(), 700);
    // ?survol=0.4 : doigt posé à 40 % de la largeur du premier graphique (captures)
    if (q.has("survol"))
      setTimeout(() => {
        const svg = document.querySelector(".graphique svg")!;
        const r = svg.getBoundingClientRect();
        svg.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: r.left + r.width * +q.get("survol")!, clientY: r.top + r.height / 2 }));
      }, 900);
    const page = new URLSearchParams(location.search).get("page");
    const { app } = await import("./etat.svelte");
    if (page) app.page = page as never;
    // ?tour=3 : visite guidée de l'appli ouverte à l'étape 3 (captures)
    if (q.has("tour")) app.visite = +q.get("tour")!;
    const mode = new URLSearchParams(location.search).get("mode");
    if (mode) app.periode = { ...app.periode, mode: mode as never };
    // Captures du site : seule la section voulue reste sous l'en-tête (repère data-visite)
    const cible = new URLSearchParams(location.search).get("cible");
    if (cible) document.head.append(Object.assign(document.createElement("style"), { textContent: `main section.carte:not([data-visite="${cible}"]), main .carte.resume:not([data-visite="${cible}"]) { display: none !important; }` }));
  }, 1500);
}

// ?gros : coffre verrouillé avec ~4 000 opérations fictives (mesure du temps d'ouverture ; mot de passe « test test test »)
if (new URLSearchParams(location.search).has("gros")) {
  parametres = { guideVu: true };
  for (const c of ["ga", "gb"]) memoire.set(c, { collection: "comptes", valeur: { id: c, nom: c === "ga" ? "Courant" : "Revolut", banque: "", devise: "EUR", soldeInitial: 100000 } });
  for (let i = 0; i < (+new URLSearchParams(location.search).get("gros")! || 4000); i++) {
    const date = new Date(Date.UTC(2019, 6, 1) + i * 0.65 * 86_400_000).toISOString().slice(0, 10);
    const montant = (i % 6 ? -1 : 1) * (500 + ((i * 37) % 9000));
    const libelle = ["CARTE X1167 BOULANGERIE", "PRELEVEMENT EUROPEEN ENERGIE", "VIR INSTANTANE EMIS", "CARTE X1167 SUPERMARCHE", "VIR RECU EMPLOYEUR"][i % 5];
    memoire.set("g" + i, { collection: "operations", valeur: { id: "g" + i, compteId: i % 3 ? "ga" : "gb", date, montant, libelle, cle: "g" + i, importId: "imp" } });
  }
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
    case "enregistrer_export":
      console.log("EXPORT", args.nom, String(args.contenu).length);
      return true;
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
      // ?deux : deux relevés de la même banque qui se chevauchent (essai de l'import groupé)
      if (new URLSearchParams(location.search).has("deux")) return [releveExemple(0, 6, "releve-octobre.csv"), releveExemple(4, 9, "releve-novembre.csv")];
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
function releveExemple(de = 0, a = 99, nom = "releve-boursobank-demo.csv") {
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
    lignes.slice(de, a).map(([n, l, m]) => `${jour(n)};${jour(n)};"${l}";;;;"${m}";;00000000000;"COMPTE BOURSOBANK (DÉMO)";`).join("\n");
  return { nom, lignes: null, texte, pdf: null, erreur: null };
}
