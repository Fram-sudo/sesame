import { t } from "./i18n.svelte";
// État global de l'interface : quel écran afficher, réglages, verrouillage automatique.
import { api, PARAMETRES_DEFAUT, type Parametres, type Recus } from "./api";
import { apresEcriture, charger, classerEtLier, vider } from "./donnees.svelte";
import type { Periode } from "./stats";
import { chargerTaux, tauxConnus } from "./taux";

export type Ecran = "chargement" | "creation" | "verrou" | "app";
export type Page = "accueil" | "operations" | "budgets" | "analyse" | "parametres" | "import" | "regles" | "banques" | "epargne" | "prets" | "plus" | "aide";

export const app = $state({
  ecran: "chargement" as Ecran,
  page: "accueil" as Page,
  params: { ...PARAMETRES_DEFAUT } as Parametres,
  message: "",
  /** Saisie d'opération ouverte (bouton +) */
  saisie: "" as "" | "depense" | "revenu" | "virement",
  dernierCompte: "",
  /** Tableau de bord, budgets, analyse : mois affiché et compte choisi ("" = tous) */
  periode: { mode: "mois", a: new Date().getFullYear(), m: new Date().getMonth(), de: "", fin: "" } as Periode,
  filtreCompte: "",
  /** Filtre de catégorie à appliquer en ouvrant la page Opérations ("aucune" = sans catégorie) */
  filtreCategorie: "",
  /** Prise en main relancée depuis la page Aide */
  revoirGuide: false,
  /** Visite guidée de l'appli : étape de départ (-1 : fermée) */
  visite: -1,
});

let minuteur: ReturnType<typeof setTimeout> | undefined;
let cacheDepuis = 0;
let messageMinuteur: ReturnType<typeof setTimeout> | undefined;

export function annoncer(texte: string) {
  app.message = texte;
  clearTimeout(messageMinuteur);
  messageMinuteur = setTimeout(() => (app.message = ""), 3000);
}

export function appliquerTheme() {
  const t = app.params.theme;
  if (t === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  document.documentElement.classList.toggle("discret", app.params.discret);
}

export async function demarrer() {
  const e = await api.etat();
  app.ecran = !e.existe ? "creation" : e.ouvert ? "app" : "verrou";
  if (app.ecran === "app") await apresOuverture();
}

export async function apresOuverture() {
  app.params = await api.lireParametres();
  await charger(false);
  // Visite interrompue (appli fermée) : ses données fictives ne doivent pas rester
  if (app.params.visiteDemo) {
    const demo = await import("./demo");
    if (demo.aDesDonneesDemo()) await demo.retirerDemo();
    app.params.visiteDemo = undefined;
    await sauverParametres();
  }
  appliquerTheme();
  void mettreAJourTaux();
  void import("./maj.svelte").then((m) => m.verifierMaj());
  void import("./notifications").then((m) => m.programmerAlertes());
  app.page = "accueil";
  app.ecran = "app";
  // Classement et virements après le premier affichage : l'appli s'ouvre sans attendre
  setTimeout(() => void classerEtLier(), 50);
  relancerMinuteur();
  void synchroAuto();
}

// ---------- Synchronisation ----------
apresEcriture.rappel = () => {
  if (app.ecran !== "app" || app.params.aEnvoyer) return;
  app.params.aEnvoyer = true;
  void sauverParametres();
};

/** Identifiant de cet appareil (créé une fois), pour ne jamais relire ses propres envois */
export async function appareil() {
  if (!app.params.appareil) {
    app.params.appareil = crypto.randomUUID().slice(0, 8);
    await sauverParametres();
  }
  return app.params.appareil;
}

const dejaSignales = new Set<string>();
export async function apresReception(r: Recus) {
  if (r.fichiers && !r.erreurs.length) {
    app.params.dernierRecu = new Date().toISOString();
    await sauverParametres();
  }
  if (r.changements) {
    await charger();
    annoncer(r.changements > 1 ? t("{0} changements reçus de votre autre appareil.", r.changements) : t("1 changement reçu de votre autre appareil."));
  } else if (r.fichiers && !r.erreurs.length) annoncer(t("Changements reçus : vous étiez déjà à jour."));
  // Un fichier refusé reste dans Téléchargements : on ne le signale qu'une fois
  const nouvelles = r.erreurs.filter((e) => !dejaSignales.has(e));
  nouvelles.forEach((e) => dejaSignales.add(e));
  if (nouvelles.length) annoncer(nouvelles[0]);
}

let synchroEnCours = false;
/** Réception automatique : à l'ouverture, au retour sur l'appli et toutes les 30 secondes */
export async function synchroAuto() {
  if (app.ecran !== "app" || synchroEnCours) return;
  synchroEnCours = true;
  try {
    await apresReception(await api.chercherChangements(await appareil()));
  } catch {
    // shortcut: erreur silencieuse en tâche de fond ; le bouton « Recevoir » affiche les erreurs
  } finally {
    synchroEnCours = false;
  }
}
setInterval(synchroAuto, 30_000);

/** Devise choisie pour l'affichage, si son taux est connu (sinon euros) */
export function deviseAffichee() {
  const d = app.params.devise ?? "EUR";
  return tauxConnus(app.params.taux, app.params.tauxManuels)[d] ? d : "EUR";
}

/** Taux BCE : une fois par jour au plus, et seulement si l'option est activée. */
export async function mettreAJourTaux(forcer = false) {
  const auj = new Date().toISOString().slice(0, 10);
  if (!app.params.tauxActifs || (!forcer && app.params.taux?.chargeLe === auj)) return false;
  const t = await chargerTaux(auj);
  if (!t) return false;
  app.params.taux = t;
  await sauverParametres();
  return true;
}

/** Exporte une sauvegarde chiffrée et retient la date (pour le rappel). false si annulé. */
export async function exporterSauvegarde() {
  if (!(await api.exporter())) return false;
  app.params.derniereSauvegarde = Date.now();
  await sauverParametres();
  return true;
}

export async function sauverParametres() {
  appliquerTheme();
  await api.ecrireParametres($state.snapshot(app.params));
  relancerMinuteur();
}

export async function verrouiller() {
  clearTimeout(minuteur);
  // Dernières données connues avant de tout effacer de la mémoire : les alertes partent de là
  await import("./notifications").then((m) => m.programmerAlertes());
  await api.verrouiller();
  vider();
  app.params.discret = false;
  appliquerTheme();
  app.ecran = "verrou";
}

function relancerMinuteur() {
  clearTimeout(minuteur);
  if (app.ecran !== "app") return;
  minuteur = setTimeout(verrouiller, app.params.verrouMinutes * 60_000);
}

// Toute activité repousse le verrouillage ; une absence trop longue le déclenche au retour.
for (const ev of ["pointerdown", "keydown", "wheel", "touchstart"]) {
  addEventListener(ev, relancerMinuteur, { passive: true });
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) (cacheDepuis = Date.now()), void import("./notifications").then((m) => m.programmerAlertes());
  else if (app.ecran === "app" && Date.now() - cacheDepuis > app.params.verrouMinutes * 60_000) verrouiller();
  else void synchroAuto();
});
