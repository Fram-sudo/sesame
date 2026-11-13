import { locale, t as tr } from "./i18n.svelte";
// Calculs du tableau de bord, du budget et de l'analyse. Fonctions pures (testées dans stats.test.ts).
//
// Règles (affichées aussi dans l'aide « ? ») :
// - Dépenses : opérations des comptes courants classées dans une catégorie de dépense (un remboursement
//   classé dans la même catégorie la diminue) ; sans catégorie, toute sortie d'argent.
// - Revenus : opérations classées dans une catégorie de revenu ; sans catégorie, toute entrée d'argent.
// - Les virements entre vos comptes ne sont ni des dépenses ni des revenus.
// - Mis de côté / pioché : entrées et sorties des comptes d'épargne et des poches.
import type { Categorie } from "./categories";

export interface Mois {
  a: number;
  /** 0 = janvier */
  m: number;
}

interface CompteS {
  id: string;
  banque?: string;
  devise: string;
  soldeInitial: number;
  type?: "courant" | "epargne";
  parentId?: string;
  reserve?: boolean;
}
interface OpS {
  id: string;
  compteId: string;
  date: string;
  montant: number;
  categorieId?: string;
  virementId?: string;
}
export interface Contexte {
  ops: OpS[];
  comptes: CompteS[];
  categories: Categorie[];
  /** Unités de chaque devise pour 1 € (voir taux.ts) ; sans taux, seules les devises identiques s'additionnent */
  taux?: Record<string, number>;
  /** Devise d'affichage choisie ; sinon celle du compte regardé (euros pour « Tous les comptes ») */
  devise?: string;
}

/** Les budgets sont enregistrés en euros : multiplicateur vers la devise affichée. */
export const facteurBudget = (ctx: Contexte, devise: string) => (devise === "EUR" || !ctx.taux?.[devise] ? 1 : ctx.taux[devise] / (ctx.taux.EUR ?? 1));

export const cleMois = (p: Mois) => `${p.a}-${String(p.m + 1).padStart(2, "0")}`;
export const decaler = (p: Mois, n: number): Mois => {
  const t = p.a * 12 + p.m + n;
  return { a: Math.floor(t / 12), m: ((t % 12) + 12) % 12 };
};
export const moisCourant = (d = new Date()): Mois => ({ a: d.getFullYear(), m: d.getMonth() });
/** Dernier jour du mois au format AAAA-MM-JJ */
export const finDeMois = (p: Mois) => new Date(Date.UTC(p.a, p.m + 1, 0)).toISOString().slice(0, 10);

/** Filtre « une banque » : "banque:<nom de la banque>" (sinon "" = tous, ou l'id d'un compte). */
export const filtreBanque = (nom: string) => `banque:${nom}`;
const memeBanque = (a?: string, b?: string) => (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

/**
 * Comptes pris en compte. Tous : tous les comptes. Une banque : ses comptes et leurs poches. Un compte : lui et ses poches.
 */
export function perimetre(ctx: Contexte, compteId: string) {
  const banque = compteId.startsWith("banque:") ? compteId.slice(7) : undefined;
  const choisis = banque !== undefined ? ctx.comptes.filter((c) => !c.parentId && memeBanque(c.banque, banque)) : ctx.comptes.filter((c) => c.id === compteId);
  const ids = new Set(choisis.map((c) => c.id));
  const devise = ctx.devise ?? choisis[0]?.devise ?? "EUR";
  // Les comptes dans une autre devise sont convertis quand le taux est connu (franc CFA : toujours), ignorés sinon
  const taux = ctx.taux ?? { [devise]: 1 };
  const convertible = (d: string) => d === devise || (taux[d] !== undefined && taux[devise] !== undefined);
  const dedans = ctx.comptes.filter((c) => convertible(c.devise) && (!compteId || ids.has(c.id) || (!!c.parentId && ids.has(c.parentId))));
  // Réserve : argent bloqué pour une dépense prévue, ni disponible ni épargne (sauf si on regarde ce compte lui-même)
  const estReserve = (c: CompteS) => !!c.reserve && c.id !== compteId;
  const estEpargne = (c: CompteS) => !estReserve(c) && (!!c.parentId || (c.type === "epargne" && c.id !== compteId));
  const facteur = new Map(dedans.map((c) => [c.id, c.devise === devise ? 1 : taux[devise] / taux[c.devise]]));
  return {
    devise,
    /** Multiplicateur vers la devise du périmètre, par compte */
    facteur,
    courants: new Set(dedans.filter((c) => !estEpargne(c) && !estReserve(c)).map((c) => c.id)),
    epargne: new Set(dedans.filter(estEpargne).map((c) => c.id)),
    reserves: new Set(dedans.filter(estReserve).map((c) => c.id)),
  };
}

export interface Flux {
  depenses: number;
  revenus: number;
  misDeCote: number;
  pioche: number;
  /** Dépenses nettes par catégorie ("" = sans catégorie) */
  parCategorie: Map<string, number>;
}

/** Flux sur le périmètre : des mois (clés AAAA-MM) ou un intervalle de dates (inclus). */
export function flux(ctx: Contexte, compteId: string, quand: string[] | { de: string; fin: string }): Flux {
  const p = perimetre(ctx, compteId);
  const types = new Map(ctx.categories.map((c) => [c.id, c.type]));
  const f: Flux = { depenses: 0, revenus: 0, misDeCote: 0, pioche: 0, parCategorie: new Map() };
  const mois = Array.isArray(quand) ? new Set(quand) : undefined;
  const intervalle = Array.isArray(quand) ? undefined : quand;
  for (const o of ctx.ops) {
    if (mois ? !mois.has(o.date.slice(0, 7)) : o.date < intervalle!.de || o.date > intervalle!.fin) continue;
    const fac = p.facteur.get(o.compteId);
    if (fac === undefined) continue;
    const montant = fac === 1 ? o.montant : Math.round(o.montant * fac);
    if (p.epargne.has(o.compteId)) {
      if (montant > 0) f.misDeCote += montant;
      else f.pioche -= montant;
      continue;
    }
    if (o.virementId) continue;
    const t = o.categorieId ? types.get(o.categorieId) : undefined;
    if (t === "virement") continue;
    // Réserve : y verser n'est ni un revenu ni de l'épargne ; seul ce qui en sort pour payer (la mensualité) est une dépense
    if (p.reserves.has(o.compteId) && montant > 0) continue;
    if (t === "depense" || (!t && montant < 0)) {
      f.depenses -= montant;
      const k = t ? o.categorieId! : "";
      f.parCategorie.set(k, (f.parCategorie.get(k) ?? 0) - montant);
    } else f.revenus += montant;
  }
  return f;
}

/** Les n mois se terminant par `fin`, du plus ancien au plus récent. */
export const derniersMois = (fin: Mois, n: number) => Array.from({ length: n }, (_, i) => decaler(fin, i - n + 1));

/** Moyenne mensuelle sur les n mois précédant `p` (le mois en cours n'est pas compté). */
export function moyenne(ctx: Contexte, compteId: string, p: Mois, n = 3): Flux {
  const f = flux(ctx, compteId, derniersMois(decaler(p, -1), n).map(cleMois));
  const div = (x: number) => Math.round(x / n);
  return {
    depenses: div(f.depenses),
    revenus: div(f.revenus),
    misDeCote: div(f.misDeCote),
    pioche: div(f.pioche),
    parCategorie: new Map([...f.parCategorie].map(([k, v]) => [k, div(v)])),
  };
}

/** Solde du périmètre (comptes courants + épargne) à une date incluse. */
export function solde(ctx: Contexte, compteId: string, jusquAu: string, avecEpargne = true): number {
  const p = perimetre(ctx, compteId);
  const ids = new Set([...p.courants, ...(avecEpargne ? [...p.epargne, ...p.reserves] : [])]);
  // Chaque compte dans sa devise, puis converti une seule fois (pas d'arrondi opération par opération)
  const parCompte = new Map(ctx.comptes.filter((c) => ids.has(c.id)).map((c) => [c.id, c.soldeInitial]));
  for (const o of ctx.ops) if (parCompte.has(o.compteId) && o.date <= jusquAu) parCompte.set(o.compteId, parCompte.get(o.compteId)! + o.montant);
  let s = 0;
  for (const [id, v] of parCompte) s += Math.round(v * p.facteur.get(id)!);
  return s;
}

/** Objectif d'une poche : saisi dans sa fiche, sinon lu dans son nom (« Objectif : 5000€ »). */
export function objectifPoche(c: { nom: string; objectif?: number; nomBanque?: string }): number | undefined {
  if (c.objectif) return c.objectif;
  // Le nom affiché d'abord, puis le nom d'origine dans les relevés (poche renommée dans l'appli)
  for (const n of [c.nom, c.nomBanque ?? ""]) {
    const m = /(\d[\d\s.,]*)\s*(€|eur\b)/i.exec(n);
    if (m) return Math.round(parseFloat(m[1].replace(/[\s.]/g, "").replace(",", ".")) * 100);
  }
  return undefined;
}

/** Variation en % (arrondie) par rapport à une référence, ou undefined si la référence est nulle. */
export const variation = (x: number, ref: number) => (ref ? Math.round(((x - ref) / ref) * 100) : undefined);

// ——— Périodes : mois, trimestre, année, tout, personnalisée ———

export type Mode = "mois" | "trimestre" | "annee" | "tout" | "perso";
export interface Periode {
  mode: Mode;
  /** Année et mois de référence (mois, trimestre, année) */
  a: number;
  m: number;
  /** Période personnalisée : dates AAAA-MM-JJ incluses */
  de: string;
  fin: string;
}
export interface Bornes {
  de: string;
  fin: string;
  /** Mois couverts, du plus ancien au plus récent */
  mois: Mois[];
  libelle: string;
}

const aujourdhui = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10);
};
const moisDe = (date: string): Mois => ({ a: +date.slice(0, 4), m: +date.slice(5, 7) - 1 });
const moisEntre = (de: string, fin: string) => {
  const res: Mois[] = [];
  for (let m = moisDe(de); cleMois(m) <= fin.slice(0, 7); m = decaler(m, 1)) res.push(m);
  return res;
};
const nomMois = (m: Mois, opts: Intl.DateTimeFormatOptions) => new Date(m.a, m.m, 1).toLocaleDateString(locale(), opts);
const jourCourt = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString(locale(), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** Dates de début et de fin d'une période ; `premiere` = date de la plus ancienne opération (pour « Tout »). */
export function bornes(p: Periode, premiere?: string): Bornes {
  const auj = aujourdhui();
  switch (p.mode) {
    case "mois": {
      const m = { a: p.a, m: p.m };
      return { de: `${cleMois(m)}-01`, fin: finDeMois(m), mois: [m], libelle: nomMois(m, { month: "long", year: "numeric" }) };
    }
    case "trimestre": {
      const debut = { a: p.a, m: Math.floor(p.m / 3) * 3 };
      const mois = [0, 1, 2].map((i) => decaler(debut, i));
      const t = Math.floor(p.m / 3) + 1;
      return { de: `${cleMois(debut)}-01`, fin: finDeMois(mois[2]), mois, libelle: tr("{0}{1} trimestre {2}", t, t === 1 ? tr("er") : tr("e"), p.a) };
    }
    case "annee": {
      const mois = Array.from({ length: 12 }, (_, i) => ({ a: p.a, m: i }));
      return { de: `${p.a}-01-01`, fin: `${p.a}-12-31`, mois, libelle: tr("Année {0}", p.a) };
    }
    case "tout": {
      const de = premiere && premiere < auj ? premiere : auj;
      return { de, fin: auj, mois: moisEntre(de, auj), libelle: tr("Depuis le début ({0})", nomMois(moisDe(de), { month: "short", year: "numeric" })) };
    }
    case "perso": {
      const [de, fin] = p.de <= p.fin ? [p.de, p.fin] : [p.fin, p.de];
      return { de, fin, mois: moisEntre(de, fin), libelle: tr("Du {0} au {1}", jourCourt(de), jourCourt(fin)) };
    }
  }
}

/** Période précédente (n = -1) ou suivante (n = 1) ; « Tout » et « personnalisée » ne bougent pas. */
export function deplacer(p: Periode, n: number): Periode {
  const pas = p.mode === "mois" ? 1 : p.mode === "trimestre" ? 3 : p.mode === "annee" ? 12 : 0;
  return pas ? { ...p, ...decaler({ a: p.a, m: p.m }, n * pas) } : p;
}

/** Mois déjà commencés (sans les mois à venir). */
export const moisPasses = (mois: Mois[]) => mois.filter((m) => cleMois(m) <= cleMois(moisCourant()));

/** La période contient-elle aujourd'hui (ou est-elle dans le futur) ? */
export const estEnCours = (b: Bornes) => b.fin >= aujourdhui();

/**
 * Moyenne des 3 périodes équivalentes précédentes (mois, trimestre) ou de l'année précédente,
 * pour comparer. undefined pour « Tout » et les périodes personnalisées.
 */
export function moyennePeriode(ctx: Contexte, compteId: string, p: Periode, premiere = ""): Flux | undefined {
  if (p.mode === "tout" || p.mode === "perso") return undefined;
  // Un trimestre ou une année entamés ne se comparent pas à des périodes complètes
  if (p.mode !== "mois" && estEnCours(bornes(p))) return undefined;
  // Seulement les périodes précédentes entièrement couvertes par vos relevés
  const precedentes = Array.from({ length: p.mode === "annee" ? 1 : 3 }, (_, i) => bornes(deplacer(p, -(i + 1)))).filter((b) => !premiere || b.de >= premiere.slice(0, 7) + "-01");
  const n = precedentes.length;
  if (!n) return undefined;
  const mois = precedentes.flatMap((b) => b.mois).map(cleMois);
  const f = flux(ctx, compteId, mois);
  const div = (x: number) => Math.round(x / n);
  return { depenses: div(f.depenses), revenus: div(f.revenus), misDeCote: div(f.misDeCote), pioche: div(f.pioche), parCategorie: new Map([...f.parCategorie].map(([k, v]) => [k, div(v)])) };
}

// ——— Budgets ———

export interface BudgetS {
  /** Id de la catégorie, ou "global" pour le plafond de toutes les dépenses */
  id: string;
  montant: number;
  /** Mensuel (par défaut) ou annuel (dépenses irrégulières : vacances, cadeaux…) */
  frequence?: "mois" | "annee";
}
export interface EtatBudget {
  id: string;
  frequence: "mois" | "annee";
  /** Plafond sur la fenêtre suivie (mensuel × nombre de mois, ou annuel) */
  budget: number;
  depense: number;
  de: string;
  fin: string;
  /** Part de la fenêtre déjà écoulée (0 à 1) */
  avancement: number;
  /**
   * Dépense prévue en fin de fenêtre (fenêtre en cours seulement) : déjà dépensé + ce que vous dépensez
   * d'habitude sur le temps restant (moyenne des 3 mois précédents). Un loyer payé en début de mois
   * n'est donc pas extrapolé comme s'il revenait chaque semaine.
   */
  projection?: number;
}

const ajouterJour = (d: string) => new Date(Date.parse(d) + 86_400_000).toISOString().slice(0, 10);
const jours = (de: string, fin: string) => Math.round((Date.parse(fin) - Date.parse(de)) / 86_400_000) + 1;

/**
 * État de chaque budget sur la période affichée. Mensuels : sur la période (× nombre de mois).
 * Annuels : sur l'année civile de la période, du 1er janvier à aujourd'hui.
 */
export function etatBudgets(ctx: Contexte, compteId: string, b: Bornes, budgets: BudgetS[], auj = aujourdhui()): EtatBudget[] {
  const cache = new Map<string, Flux>();
  const moyennes = new Map<string, Flux>();
  const moyenneAvant = (de: string) => {
    if (!moyennes.has(de)) moyennes.set(de, moyenne(ctx, compteId, moisDe(de), 3));
    return moyennes.get(de)!;
  };
  const fluxSur = (de: string, fin: string) => {
    const k = `${de}|${fin}`;
    if (!cache.has(k)) cache.set(k, flux(ctx, compteId, { de, fin }));
    return cache.get(k)!;
  };
  const fb = facteurBudget(ctx, perimetre(ctx, compteId).devise);
  return budgets
    .filter((x) => x.montant > 0)
    .map((x) => {
      const frequence = x.frequence ?? "mois";
      const annee = (b.fin < auj ? b.fin : auj).slice(0, 4);
      const [de, fin] = frequence === "annee" ? [`${annee}-01-01`, `${annee}-12-31`] : [b.de, b.fin];
      const budget = Math.round((frequence === "annee" ? x.montant : x.montant * Math.max(1, b.mois.length)) * fb);
      const f = fluxSur(de, fin);
      const depense = Math.max(0, x.id === "global" ? f.depenses : (f.parCategorie.get(x.id) ?? 0));
      const avancement = auj < de ? 0 : auj > fin ? 1 : jours(de, auj) / jours(de, fin);
      const part = (f: Flux) => Math.max(0, x.id === "global" ? f.depenses : (f.parCategorie.get(x.id) ?? 0));
      let projection: number | undefined;
      if (avancement > 0 && avancement < 1) {
        if (frequence === "mois" && b.mois.length === 1) {
          // Mois en cours : ce que vous avez dépensé d'habitude entre ce jour-ci et la fin du mois (3 mois précédents).
          // Un loyer payé le 5 n'est donc pas ajouté une seconde fois le 10.
          const jour = +auj.slice(8, 10);
          const reste = [1, 2, 3].map((k) => {
            const mo = decaler(b.mois[0], -k);
            const finMo = finDeMois(mo);
            const coupe = `${cleMois(mo)}-${String(Math.min(jour, +finMo.slice(8))).padStart(2, "0")}`;
            return coupe >= finMo ? 0 : part(fluxSur(ajouterJour(coupe), finMo));
          });
          projection = Math.round(depense + reste.reduce((s, v) => s + v, 0) / 3);
        } else {
          // Plusieurs mois ou une année : moyenne mensuelle × temps restant
          const nbMoisFenetre = frequence === "annee" ? 12 : b.mois.length;
          projection = Math.round(depense + part(moyenneAvant(de)) * nbMoisFenetre * (1 - avancement));
        }
      }
      return { id: x.id, frequence, budget, depense, de, fin, avancement, projection };
    });
}

/** Jours restants dans une fenêtre en cours (0 si terminée). */
export const joursRestants = (fin: string, auj = aujourdhui()) => (auj > fin ? 0 : jours(auj, fin));

export interface SuiviObjectif {
  /** Mois entiers restants avant la date (au moins 1) */
  moisRestants: number;
  /** À mettre de côté chaque mois pour y arriver */
  parMois: number;
  /** Où l'on devrait en être aujourd'hui, en ligne droite depuis le jour où l'objectif a été fixé */
  attendu: number;
  /** Solde − attendu : positif = en avance, négatif = en retard */
  ecart: number;
  atteint: boolean;
  depasse: boolean;
}

/** Objectif daté : effort mensuel et avance ou retard, d'après le solde au jour où l'objectif a été fixé. */
export function suiviObjectif(objectif: number, pour: string, depuis: string, depart: number, solde: number, auj: string): SuiviObjectif {
  const j = (d: string) => Date.parse(d + "T00:00:00Z");
  const [a1, m1, d1] = auj.split("-").map(Number);
  const [a2, m2, d2] = pour.split("-").map(Number);
  const moisRestants = Math.max(1, (a2 - a1) * 12 + (m2 - m1) + (d2 >= d1 ? 0 : -1) + 1);
  const part = j(pour) > j(depuis) ? Math.min(1, Math.max(0, (j(auj) - j(depuis)) / (j(pour) - j(depuis)))) : 1;
  const attendu = Math.round(depart + (objectif - depart) * part);
  return {
    moisRestants,
    parMois: Math.max(0, Math.ceil((objectif - solde) / moisRestants)),
    attendu,
    ecart: solde - attendu,
    atteint: solde >= objectif,
    depasse: j(auj) > j(pour),
  };
}
