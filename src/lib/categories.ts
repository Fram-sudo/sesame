// Catégories, règles de classement (fournies + apprises), virements entre comptes, opérations récurrentes.
// Fonctions pures : testées dans categories.test.ts.
import { normaliser } from "./import/analyse";

export interface Categorie {
  id: string;
  nom: string;
  couleur: string;
  /** Icône choisie (banque d'icônes) ; sinon devinée d'après le nom */
  icone?: string;
  type: "depense" | "revenu" | "virement";
}

export interface Regle {
  id: string;
  /** Mots à trouver dans le libellé ; plusieurs possibles, séparés par des virgules */
  motif: string;
  categorieId: string;
  /** true = règle à vous (créée, modifiée ou apprise) : passe avant les règles fournies */
  appris: boolean;
  /** Seulement pour les dépenses ou les revenus (par défaut : selon le type de la catégorie) */
  sens?: "tous" | "depense" | "revenu";
  /** Règle fournie que vous avez supprimée */
  masquee?: boolean;
}

/** Mots-clés d'une règle, normalisés. */
export const motsDe = (r: Pick<Regle, "motif">) => r.motif.split(",").map(normaliser).filter(Boolean);

/** La règle s'applique-t-elle à ce libellé et ce montant ? */
export function regleTouche(r: Regle, o: Pick<Op, "libelle" | "montant">, categories: Categorie[]): boolean {
  if (r.masquee || !motsDe(r).some((m) => contient(o.libelle, m))) return false;
  if (r.sens === "depense") return o.montant < 0;
  if (r.sens === "revenu") return o.montant > 0;
  // Par défaut, une règle vers une catégorie de dépense ne touche pas un remboursement (montant positif), et inversement
  const t = categories.find((c) => c.id === r.categorieId)?.type;
  return t === "virement" || (t !== undefined && (t === "revenu") === o.montant > 0);
}

/** Opération vue par ce module (sous-ensemble de donnees.Operation). */
export interface Op {
  id: string;
  compteId: string;
  date: string;
  montant: number;
  libelle: string;
  categorieId?: string;
  categorieBanque?: string;
  virementId?: string;
  /** « Ce n'est pas un virement » : ne plus proposer d'association */
  pasVirement?: boolean;
}

export const VIREMENT = "cat-virement";

const c = (id: string, nom: string, couleur: string, type: Categorie["type"] = "depense"): Categorie => ({ id: `cat-${id}`, nom, couleur, type });
/** Couleurs par défaut d'avant la refonte (2026-11-12) : remplacées au chargement si l'utilisateur ne les a pas changées */
export const COULEURS_AVANT_REFONTE: Record<string, string> = { "cat-alimentation": "#639922", "cat-restaurants": "#D85A30", "cat-logement": "#7F77DD", "cat-energie": "#EF9F27", "cat-telephone": "#378ADD", "cat-transports": "#1D9E75", "cat-sante": "#E24B4A", "cat-shopping": "#D4537E", "cat-loisirs": "#BA7517", "cat-abonnements": "#534AB7", "cat-voyages": "#0F6E56", "cat-education": "#185FA5", "cat-frais": "#5F5E5A", "cat-cadeaux": "#993556", "cat-divers": "#888780", "cat-salaire": "#3B6D11", "cat-aides": "#0C447C", "cat-remboursements": "#085041", "cat-autres-revenus": "#27500A", [VIREMENT]: "#B4B2A9" };
export const CATEGORIES_DEFAUT: Categorie[] = [
  c("alimentation", "Alimentation", "#F59E0B"),
  c("restaurants", "Restaurants", "#F97316"),
  c("logement", "Logement", "#6366F1"),
  c("energie", "Énergie", "#84CC16"),
  c("telephone", "Téléphone et internet", "#14B8A6"),
  c("transports", "Transports", "#0EA5E9"),
  c("sante", "Santé", "#EF4444"),
  c("shopping", "Shopping", "#EC4899"),
  c("loisirs", "Loisirs", "#C026D3"),
  c("abonnements", "Abonnements", "#7C3AED"),
  c("voyages", "Voyages", "#06B6D4"),
  c("education", "Éducation", "#2563EB"),
  c("frais", "Impôts et frais", "#64748B"),
  c("cadeaux", "Cadeaux et dons", "#F43F5E"),
  c("divers", "Divers", "#94A3B8"),
  c("salaire", "Salaire", "#16A34A", "revenu"),
  c("aides", "Aides et bourses", "#059669", "revenu"),
  c("remboursements", "Remboursements", "#10B981", "revenu"),
  c("autres-revenus", "Autres revenus", "#22C55E", "revenu"),
  { id: VIREMENT, nom: "Virement entre mes comptes", couleur: "#A1A1AA", type: "virement" },
];

// Mots-clés fournis (modifiables par l'apprentissage : vos règles passent devant)
const MOTS: Record<string, string> = {
  alimentation: "carrefour|leclerc|auchan|lidl|aldi|intermarche|monoprix|franprix|super u|hyper u|casino|picard|netto|boulangerie|supermarche|epicerie|marche|grand frais|biocoop|grocery|groceries|supermarket|bakery",
  restaurants: "restaurant|resto|mcdonald|mcdo|burger king|kfc|uber eats|deliveroo|just eat|brasserie|pizzeria|cafe|starbucks|sushi|coffee|takeaway",
  logement: "loyer|bailleur|agence immobiliere|syndic|assurance habitation|crous logement|rent|landlord|home insurance",
  energie: "edf|engie|total energies|totalenergies|electricite|gaz|eau|veolia|suez|electricity|water|energy",
  telephone: "free mobile|free telecom|orange|sfr|bouygues|sosh|red by sfr|operateur|internet|box|mobile|phone",
  transports: "sncf|ratp|navigo|transports|uber|bolt|blablacar|essence|carburant|station|peage|parking|tcl|tisseo|ouigo|train|taxi|metro|bus|fuel|petrol|toll",
  sante: "pharmacie|medecin|docteur|dentiste|hopital|clinique|ameli|cpam|mutuelle|opticien|laboratoire|pharmacy|doctor|dentist|hospital|optician",
  shopping: "amazon|fnac|darty|zara|h m|decathlon|ikea|boutique|primark|cdiscount|shein|zalando|vinted|leboncoin|temu|aliexpress|shop|store",
  loisirs: "cinema|ugc|pathe|concert|spectacle|musee|steam|playstation|nintendo|salle de sport|basic fit|fitness|gym|museum",
  abonnements: "netflix|spotify|deezer|disney|canal|prime video|youtube premium|apple com bill|google play|icloud|abonnement|streaming|subscription",
  voyages: "airbnb|booking|hotel|air france|easyjet|ryanair|transavia|air senegal|expedia|flight|airline|hostel",
  education: "universite|ecole|frais de scolarite|librairie|cours|formation|university|school|tuition|bookshop",
  frais: "impot|dgfip|tresor public|frais|commission|cotisation|agios|amende|fee|fees|tax|charge|charges|fine",
  cadeaux: "don|cadeau|leetchi|cagnotte|gift|donation",
  salaire: "salaire|paie|remuneration|employeur|salary|payroll|wages|payslip",
  aides: "caf|bourse|crous|pole emploi|france travail|apl|prime d activite|allowance|benefit|grant|scholarship",
  remboursements: "remboursement|rembt|avoir|refund|reimbursement|cashback",
  "autres-revenus": "vinted|leboncoin",
  // Rechargement d'un compte depuis un autre de vos comptes (ex. Revolut alimenté depuis votre banque)
  virement: "open banking deposit|top up|topup|rechargement|approvisionnement",
};
export const REGLES_DEFAUT: Regle[] = Object.entries(MOTS).flatMap(([cat, mots]) =>
  mots.split("|").map((m) => ({ id: `regle-${cat}-${m.replace(/ /g, "-")}`, motif: m, categorieId: `cat-${cat}`, appris: false })),
);

// Catégories données par certaines banques (Boursobank…) → nos catégories
const BANQUE: [RegExp, string][] = [
  [/aliment|course|supermarche|grocer|food/, "alimentation"],
  [/restau|bar|sortie|eating out|dining/, "restaurants"],
  [/logement|loyer|habitation|housing|rent/, "logement"],
  [/energie|electricite|gaz|eau|utilit|energy/, "energie"],
  [/telephon|internet|mobile|phone/, "telephone"],
  [/transport|carburant|vehicule|auto/, "transports"],
  [/sante|medical|pharmacie/, "sante"],
  [/shopping|achat|vetement|habillement|cloth/, "shopping"],
  [/loisir|culture|sport|entertainment|leisure/, "loisirs"],
  [/abonnement|subscription/, "abonnements"],
  [/voyage|vacance|hotel|travel|holiday/, "voyages"],
  [/education|scolar|etude/, "education"],
  [/impot|taxe|frais|banque|tax|fee|bank/, "frais"],
  [/cadeau|don|gift/, "cadeaux"],
  [/salaire|paie|salary|payroll|wage/, "salaire"],
  [/aide|allocation|bourse|benefit|allowance/, "aides"],
  [/rembours|refund/, "remboursements"],
  [/virement|transfer/, "virement"],
  [/revenu|income/, "autres-revenus"],
];

const MOTS_VIDES = new Set(
  "carte cb prlv prelevement sepa vir virement recu recue emis emise de du des la le les a au par pour paiement achat retrait dab facture fact ref inst instantane web www com fr sas sarl eur".split(" "),
);

/** Partie stable d'un libellé : « CARTE X1234 30/01 BOULANGERIE DUPONT » → « boulangerie dupont ». */
export function motif(libelle: string): string {
  return normaliser(libelle)
    .split(" ")
    .filter((m) => m.length > 1 && !/\d/.test(m) && !MOTS_VIDES.has(m))
    .slice(0, 4)
    .join(" ");
}

const contient = (libelle: string, m: string) => ` ${normaliser(libelle)} `.includes(` ${m} `);

/** Vos règles d'abord, puis les plus précises (motif le plus long). */
export const trierRegles = (r: Regle[]) => [...r].sort((a, b) => Number(b.appris) - Number(a.appris) || b.motif.length - a.motif.length);

/** Catégorie proposée pour une opération, ou undefined. `regles` doit être triée (trierRegles). */
export function categoriser(o: Op, regles: Regle[], categories: Categorie[]): string | undefined {
  const ok = (id?: string) => (id && categories.some((c) => c.id === id) ? id : undefined);
  const r = regles.find((x) => ok(x.categorieId) && regleTouche(x, o, categories));
  if (r) return r.categorieId;
  if (o.categorieBanque) {
    const b = normaliser(o.categorieBanque);
    const t = BANQUE.find(([re]) => re.test(b));
    if (t) return ok(t[1] === "virement" ? VIREMENT : `cat-${t[1]}`);
  }
  return undefined;
}

/**
 * Repère les virements entre vos comptes : une sortie et une entrée du même montant,
 * sur deux comptes de même devise, à 4 jours d'écart au plus.
 * shortcut: virements entre devises différentes (EUR → XOF) non détectés, à revoir avec les taux de change (jalon 7).
 */
export function detecterVirements<T extends Op>(ops: T[], deviseDe: (compteId: string) => string): [T, T][] {
  const jours = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;
  const libres = ops.filter((o) => !o.virementId && !o.pasVirement && o.montant !== 0);
  const entrees = libres.filter((o) => o.montant > 0);
  const pris = new Set<string>();
  const paires: [T, T][] = [];
  for (const s of libres.filter((o) => o.montant < 0).sort((a, b) => a.date.localeCompare(b.date))) {
    let meilleur: T | undefined;
    for (const e of entrees) {
      if (pris.has(e.id) || e.compteId === s.compteId || e.montant !== -s.montant || deviseDe(e.compteId) !== deviseDe(s.compteId)) continue;
      const d = jours(e.date, s.date);
      if (d <= 4 && (!meilleur || d < jours(meilleur.date, s.date))) meilleur = e;
    }
    if (meilleur) pris.add(meilleur.id), paires.push([s, meilleur]);
  }
  return paires;
}

export interface Recurrence {
  motif: string;
  libelle: string;
  compteId: string;
  montant: number;
  variable: boolean;
  frequence: string;
  prochaine: string;
  categorieId?: string;
  nb: number;
}

const FREQUENCES: [string, number, number][] = [
  ["chaque semaine", 6, 8],
  ["toutes les 2 semaines", 13, 16],
  ["chaque mois", 26, 35],
  ["chaque trimestre", 85, 97],
  ["chaque année", 350, 380],
];

const mediane = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];

/** Opérations qui reviennent régulièrement (même libellé, même compte, au moins 3 fois à intervalle régulier). */
export function detecterRecurrences(ops: Op[]): Recurrence[] {
  const groupes = new Map<string, Op[]>();
  for (const o of ops) {
    if (o.virementId) continue;
    const m = motif(o.libelle);
    if (!m) continue;
    const cle = `${o.compteId}|${m}|${o.montant > 0}`;
    groupes.set(cle, [...(groupes.get(cle) ?? []), o]);
  }
  const res: Recurrence[] = [];
  for (const [cle, g] of groupes) {
    if (g.length < 3) continue;
    g.sort((a, b) => a.date.localeCompare(b.date));
    const ecarts = g.slice(1).map((o, i) => (Date.parse(o.date) - Date.parse(g[i].date)) / 86_400_000);
    const m = mediane(ecarts);
    const f = FREQUENCES.find(([, min, max]) => m >= min && m <= max);
    if (!f || ecarts.filter((e) => e >= f[1] && e <= f[2]).length < Math.ceil((ecarts.length * 2) / 3)) continue;
    const montants = g.map((o) => o.montant);
    const med = mediane(montants);
    if (montants.some((x) => Math.abs(x - med) > Math.abs(med) * 0.5)) continue;
    const dernier = g[g.length - 1];
    const d = new Date(dernier.date + "T00:00:00Z");
    if (f[0] === "chaque mois") d.setUTCMonth(d.getUTCMonth() + 1);
    else if (f[0] === "chaque année") d.setUTCFullYear(d.getUTCFullYear() + 1);
    else d.setUTCDate(d.getUTCDate() + Math.round(m));
    res.push({
      motif: cle.split("|")[1],
      libelle: dernier.libelle,
      compteId: dernier.compteId,
      montant: med,
      variable: montants.some((x) => Math.abs(x - med) > Math.abs(med) * 0.1),
      frequence: f[0],
      prochaine: d.toISOString().slice(0, 10),
      categorieId: dernier.categorieId,
      nb: g.length,
    });
  }
  return res.sort((a, b) => a.prochaine.localeCompare(b.prochaine));
}

/**
 * Opérations « en attente » devenues définitives : même compte, même montant, libellé semblable,
 * et l'opération définitive datée de 0 à 10 jours après. Renvoie les opérations en attente à retirer.
 */
export function attentesRemplacees<T extends Op & { enAttente?: boolean }>(ops: T[]): T[] {
  const jours = (a: string, b: string) => (Date.parse(a) - Date.parse(b)) / 86_400_000;
  const prises = new Set<string>();
  return ops.filter((a) => {
    if (!a.enAttente) return false;
    const m = motif(a.libelle);
    const d = ops.find(
      (o) =>
        !o.enAttente &&
        !prises.has(o.id) &&
        o.compteId === a.compteId &&
        o.montant === a.montant &&
        jours(o.date, a.date) >= 0 &&
        jours(o.date, a.date) <= 10 &&
        (motif(o.libelle).includes(m) || m.includes(motif(o.libelle))),
    );
    if (d) prises.add(d.id);
    return !!d;
  });
}

/** Règle de compte : à l'import, les opérations dont le libellé contient `motif` vont dans un autre compte. */
export interface Routage {
  id: string;
  motif: string;
  source: string;
  cible: string;
  /** Seulement si le montant (en sortie) est égal à un versement reçu par le compte cible dans les 60 jours avant */
  memeMontant?: boolean;
}

/**
 * Applique les règles de compte aux nouvelles opérations (modifiées en place, dans l'ordre des dates).
 * `existantes` : opérations déjà en base, pour la condition « même montant qu'un versement récent ».
 */
export function router<T extends Op & { detail?: string }>(nouvelles: T[], routages: Routage[], existantes: Op[]): void {
  // Chaque versement ne justifie qu'un seul retrait : on « consomme » les versements déjà associés.
  const vus: Op[] = [...existantes].sort((a, b) => a.date.localeCompare(b.date));
  const utilises = new Set<string>();
  const versementLibre = (compteId: string, sortie: Op) =>
    vus.find(
      (v) =>
        !utilises.has(v.id) &&
        v.compteId === compteId &&
        v.montant > 0 &&
        v.montant === -sortie.montant &&
        v.date <= sortie.date &&
        Date.parse(sortie.date) - Date.parse(v.date) <= 60 * 86_400_000,
    );
  for (const o of vus) if (o.montant < 0) { const v = versementLibre(o.compteId, o); if (v) utilises.add(v.id); }

  for (const o of [...nouvelles].sort((a, b) => a.date.localeCompare(b.date))) {
    const texte = ` ${normaliser(`${o.libelle} ${o.detail ?? ""}`)} `;
    let versement: Op | undefined;
    const r = routages.find(
      (x) => x.source === o.compteId && texte.includes(` ${x.motif} `) && (!x.memeMontant || (o.montant < 0 && (versement = versementLibre(x.cible, o)))),
    );
    if (r) o.compteId = r.cible;
    if (versement) utilises.add(versement.id);
    vus.push(o);
  }
}

// Poches (Revolut et apps semblables) : de l'argent mis de côté depuis le compte, suivi à part.
// Revolut EN « To pocket EUR X from EUR », FR « Sur la Pocket EUR X depuis EUR » (ou « Vers la poche … »)
const RE_VERS_POCHE = [/\bto pocket (?:[a-z]{3} )?(.+?)(?: from [a-z]{3})?$/i, /\b(?:vers|sur) (?:la )?(?:poche|pocket) (?:[a-z]{3} )?(.+?)(?: depuis [a-z]{3})?$/i];
const RE_RETRAIT_POCHE = /\bpocket withdrawal\b|\bretrait (?:de (?:la )?|depuis (?:une |la )?)?(?:poche|pocket)\b/i;

/** Nom de la poche visée par un versement, "?" pour un retrait sans nom, undefined sinon. */
export function mouvementPoche(libelle: string): string | undefined {
  for (const re of RE_VERS_POCHE) {
    const m = re.exec(libelle.trim());
    if (m) return m[1].trim();
  }
  return RE_RETRAIT_POCHE.test(libelle) ? "?" : undefined;
}

/**
 * Poche de chaque mouvement (opId → nom de poche).
 * - `tableDesPoches = false` : opérations du compte principal ; seuls les mouvements de poche comptent
 *   (versement = sortie du compte, retrait = entrée).
 * - `tableDesPoches = true` : tableau des poches du relevé ; chaque ligne appartient à une poche
 *   (versement = entrée dans la poche).
 * Versement nommé : cette poche. Retrait sans nom : la poche ayant reçu un versement du même montant dans les
 * 60 jours (chaque versement ne sert qu'une fois, ex. poche de remboursement de prêt), sinon la poche où l'on
 * épargne au fil de l'eau (le plus de versements) si elle couvre le retrait, sinon la mieux garnie.
 */
export function attribuerPoches(ops: Op[], tableDesPoches = false): Map<string, string> {
  const res = new Map<string, string>();
  const solde = new Map<string, number>();
  const versements: { id: string; poche: string; montant: number; date: string }[] = [];
  const utilises = new Set<string>();
  const nbVersements = new Map<string, number>();
  for (const o of ops) {
    const p = mouvementPoche(o.libelle);
    if (p && p !== "?") nbVersements.set(p, (nbVersements.get(p) ?? 0) + 1);
  }
  const parDefaut = (montant: number) => {
    const nb = (x: string) => nbVersements.get(x) ?? 0;
    const noms = new Set([...solde.keys(), ...nbVersements.keys()]);
    const tri = [...noms].sort((a, b) => {
      const sa = solde.get(a) ?? 0, sb = solde.get(b) ?? 0;
      return Number(sb >= montant) - Number(sa >= montant) || nb(b) - nb(a) || sb - sa;
    });
    return tri[0] ?? "Poche";
  };
  for (const o of [...ops].sort((a, b) => a.date.localeCompare(b.date))) {
    const p = mouvementPoche(o.libelle);
    if (!p && !tableDesPoches) continue;
    const vu = tableDesPoches ? o.montant : -o.montant; // > 0 : l'argent entre dans la poche
    let poche: string;
    if (p && p !== "?") {
      poche = p;
      if (vu > 0) versements.push({ id: o.id, poche, montant: vu, date: o.date });
    } else if (vu < 0) {
      const v = versements.find(
        (x) => !utilises.has(x.id) && x.montant === -vu && Date.parse(o.date) - Date.parse(x.date) <= 60 * 86_400_000 && (solde.get(x.poche) ?? 0) >= -vu,
      );
      if (v) utilises.add(v.id), (poche = v.poche);
      else poche = parDefaut(-vu);
    } else poche = parDefaut(0);
    solde.set(poche, (solde.get(poche) ?? 0) + vu);
    res.set(o.id, poche);
  }
  return res;
}

/** Libellé affiché : les mouvements de poche sont reformulés en français clair, et les libellés bancaires en
 * majuscules sont débarrassés du jargon (PRLV SEPA, CARTE X1234 12/11…). Le libellé d'origine reste stocké. */
export function libelleLisible(libelle: string): string {
  const p = mouvementPoche(libelle);
  if (p) return p === "?" ? "Repris d'une poche" : `Mis de côté · ${p}`;
  // Déjà écrit pour des humains (minuscules) : on n'y touche pas
  if (/[a-zà-ÿ]/.test(libelle)) return libelle;
  let t = ` ${libelle.replace(/\s+/g, " ").trim()} `;
  const retrait = /^ (RETRAIT|RET DAB|DAB)\b/.test(t);
  t = t
    .replace(/^ (PRLV|PRELEVEMENT|PRELEVMT)( SEPA)?( EUROPEEN)?\b/, " ")
    .replace(/^ (PAIEMENT (PAR )?CARTE|ACHAT CB|FACTURE CARTE|AVOIR CARTE|CARTE|CB|PAIEMENT CB)\b/, " ")
    .replace(/^ (RETRAIT( DAB)?|RET DAB|DAB)\b/, " ")
    .replace(/^ (VIR(EMENT)?( SEPA)?( INST(ANTANE)?)?( RECU| EMIS| PERMANENT)?( DE| VERS| POUR)?)\b/, " ")
    .replace(/ (REF|REFERENCE|MOTIF|ID|MANDAT|RUM|ICS|NUM)\b.*$/, " ") // références techniques en fin de libellé
    .replace(/ X\d{3,}\b/g, " ") // numéro de carte
    .replace(/ \d{1,2}[/.]\d{1,2}([/.]\d{2,4})?\b/g, " ") // dates
    .replace(/ (DE|DU|LE)?:? ?\d{4,}\b/g, " ") // références numériques
    .replace(/ (DE|POUR):/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return libelle;
  const PETITS = new Set(["DE", "DU", "DES", "LA", "LE", "LES", "ET", "EN", "AU", "AUX", "A", "D", "L", "SUR", "PAR", "POUR"]);
  const mots = t.split(" ").map((m, i) => {
    if (PETITS.has(m) && i > 0) return m.toLowerCase();
    if (m.length <= 3 && !PETITS.has(m)) return m; // sigles : EDF, SFR, RATP reste lisible aussi
    return m.charAt(0) + m.slice(1).toLowerCase();
  });
  const propre = mots.join(" ");
  return retrait ? `Retrait · ${propre}` : propre;
}

/** Icône (Tabler) de chaque catégorie fournie ; les catégories que vous créez ont une étiquette. */
export const ICONES: Record<string, string> = {
  "cat-alimentation": "shopping-cart",
  "cat-restaurants": "tools-kitchen-2",
  "cat-logement": "home",
  "cat-energie": "bolt",
  "cat-telephone": "device-mobile",
  "cat-transports": "car",
  "cat-sante": "heart",
  "cat-shopping": "shopping-bag",
  "cat-loisirs": "ticket",
  "cat-abonnements": "repeat",
  "cat-voyages": "plane",
  "cat-education": "school",
  "cat-frais": "receipt-tax",
  "cat-cadeaux": "gift",
  "cat-divers": "dots",
  "cat-salaire": "briefcase",
  "cat-aides": "building-bank",
  "cat-remboursements": "arrow-back-up",
  "cat-autres-revenus": "coin",
  [VIREMENT]: "arrows-exchange",
};
