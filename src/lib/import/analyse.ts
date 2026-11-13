// Moteur d'import universel : retrouve la ligne des titres, devine le rôle de chaque colonne,
// lit dates et montants quel que soit le format de la banque. Les montants sont en centimes (entiers).

export type Role = "date" | "libelle" | "detail" | "montant" | "debit" | "credit" | "devise" | "solde" | "frais" | "etat" | "categorie";
export type FormatDate = "JJ/MM/AAAA" | "MM/JJ/AAAA" | "AAAA-MM-JJ";

export interface Profil {
  id: string;
  nom: string;
  /** Titres normalisés du fichier : c'est ainsi qu'on reconnaît la banque la fois suivante. */
  entete: string[];
  colonnes: Partial<Record<Role, string>>;
  formatDate: FormatDate;
  /** Ce qui identifie ce format de relevé (titres des colonnes, et pour un PDF la banque et l'en-tête) */
  cle?: string;
  /** Montants à l'envers dans ce format (dépenses en positif) : on les retourne à la lecture */
  inverser?: boolean;
}

export interface OpLue {
  ligne: number;
  date: string;
  montant: number;
  libelle: string;
  detail?: string;
  categorieBanque?: string;
  solde?: number;
  /** Pas encore définitive à la date du relevé (paiement par carte en cours…) */
  enAttente?: boolean;
}

export interface Lecture {
  ops: OpLue[];
  erreurs: { ligne: number; raison: string }[];
  autreDevise: number;
  nonAbouties: number;
}

export const normaliser = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Titres connus, du plus précis au plus général (Société Générale, Revolut FR/EN, Boursobank, et usages courants).
const SYNONYMES: Record<Role, string[]> = {
  date: ["date de l operation", "date operation", "dateop", "date op", "completed date", "date de fin", "date comptable", "booking date", "posting date", "posted date", "transaction date", "date transaction", "date d operation", "date", "jour", "day"],
  libelle: ["libelle", "libelle operation", "libelle simplifie", "label", "description", "intitule", "nature de l operation", "merchant", "beneficiaire", "payee", "counterparty", "contrepartie", "narrative", "details", "operation", "operations"],
  detail: ["detail de l ecriture", "detail", "libelle complet", "informations complementaires", "comment", "commentaire", "communication", "memo", "note", "notes", "reference", "additional information"],
  montant: ["montant de l operation", "montant", "amount", "montant eur", "amount eur", "transaction amount", "somme", "sum"],
  debit: ["debit", "debit eur", "debits", "sortie", "sorties", "argent sortant", "montant sortant", "sortant", "paid out", "money out", "debit amount", "outgoing", "withdrawal", "withdrawals", "depense", "depenses", "expense", "expenses"],
  credit: ["credit", "credit eur", "credits", "entree", "entrees", "argent entrant", "montant entrant", "entrant", "paid in", "money in", "credit amount", "incoming", "deposit", "deposits", "recette", "recettes", "income"],
  devise: ["devise", "currency", "monnaie", "ccy"],
  solde: ["solde", "balance", "accountbalance", "solde apres operation", "nouveau solde", "running balance", "balance after"],
  frais: ["frais", "fee", "fees", "commission", "charges"],
  etat: ["etat", "state", "status", "statut"],
  categorie: ["categorie", "category"],
};

// Si aucun titre exact : recherche d'un mot dans le titre
const PARTIEL: Partial<Record<Role, (t: string) => boolean>> = {
  date: (t) => /\bdate/.test(t) && !/valeur|value|val\b|started|debut/.test(t),
  libelle: (t) => /libelle|description|label/.test(t),
  montant: (t) => /montant|amount/.test(t),
  debit: (t) => t.startsWith("debit") || /\b(sortant|money out|paid out)\b/.test(t),
  credit: (t) => t.startsWith("credit") || /\b(entrant|money in|paid in)\b/.test(t),
  solde: (t) => /solde|balance/.test(t),
};

export const BANQUES: { nom: string; indices: string[] }[] = [
  { nom: "Société Générale", indices: ["date de l operation", "detail de l ecriture", "montant de l operation"] },
  { nom: "Revolut", indices: ["product", "completed date", "state"] },
  { nom: "Revolut", indices: ["produit", "date de fin", "etat"] },
  { nom: "Boursobank", indices: ["dateop", "dateval", "supplierfound"] },
];

export function reconnaitreBanque(entete: string[]): string | undefined {
  return BANQUES.find((b) => b.indices.every((i) => entete.includes(i)))?.nom;
}

export function devinerColonnes(entete: string[]): Partial<Record<Role, string>> {
  const pris = new Set<number>();
  const res: Partial<Record<Role, string>> = {};
  const roles = Object.keys(SYNONYMES) as Role[];
  for (const passe of [0, 1])
    for (const role of roles) {
      if (res[role]) continue;
      let i = -1;
      if (passe === 0) {
        for (const s of SYNONYMES[role]) if ((i = entete.findIndex((t, k) => t === s && !pris.has(k))) >= 0) break;
      } else if (PARTIEL[role]) i = entete.findIndex((t, k) => !pris.has(k) && PARTIEL[role]!(t));
      if (i >= 0) pris.add(i), (res[role] = entete[i]);
    }
  if (res.montant) delete res.debit, delete res.credit;
  return res;
}

/** Index de la ligne des titres (les banques ajoutent souvent des lignes d'introduction), ou -1. */
export function detecterEntete(lignes: string[][]): number {
  const utiles: Role[] = ["date", "libelle", "montant", "debit", "credit"];
  for (let i = 0; i < Math.min(lignes.length, 30); i++) {
    const roles = new Set(Object.keys(devinerColonnes(lignes[i].map(normaliser))).filter((r) => utiles.includes(r as Role)));
    if (roles.has("date") && roles.size >= 2) return i;
  }
  // Titres inconnus : la ligne juste avant la première ligne qui ressemble à une opération (une date et un montant)
  const op = (l: string[]) => l.some((c) => RE_DATE.test(c)) && l.some((c) => !RE_DATE.test(c) && lireMontant(c) !== null);
  const i = lignes.slice(0, 40).findIndex(op);
  return i > 0 && !lignes[i - 1].some((c) => RE_DATE.test(c)) && lignes[i - 1].filter((c) => c.trim()).length >= 2 ? i - 1 : -1;
}

export function enteteDe(lignes: string[][], idx: number): string[] {
  const n = Math.max(...lignes.slice(0, 50).map((l) => l.length));
  return idx >= 0 ? lignes[idx].map(normaliser) : Array.from({ length: n }, (_, k) => `colonne ${k + 1}`);
}

const RE_DATE = /(\d{1,4})[/.\- ](\d{1,2})[/.\- ](\d{2,4})/;

export function detecterFormatDate(valeurs: string[]): FormatDate {
  const m = valeurs.map((v) => RE_DATE.exec(v)).filter((x) => x !== null);
  if (m.some((x) => x[1].length === 4)) return "AAAA-MM-JJ";
  if (m.some((x) => +x[2] > 12)) return "MM/JJ/AAAA";
  return "JJ/MM/AAAA";
}

const MOIS: [string, number][] = [
  ["janv", 1], ["jan", 1], ["fev", 2], ["feb", 2], ["mars", 3], ["mar", 3], ["avr", 4], ["apr", 4], ["mai", 5], ["may", 5],
  ["juin", 6], ["jun", 6], ["juil", 7], ["jul", 7], ["aou", 8], ["aug", 8], ["sep", 9], ["oct", 10], ["nov", 11], ["dec", 12],
];
const numMois = (m: string) => MOIS.find(([p]) => m.startsWith(p))?.[1];

/** « 2 janv. 2026 », « 2 January 2026 », « Jan 2, 2026 » → « 2/1/2026 » (sinon null). */
export function dateEnLettres(s: string): string | null {
  const t = normaliser(s);
  let m = /\b(\d{1,2})(?:er|st|nd|rd|th)? ([a-z]{3,9}) (\d{4})\b/.exec(t);
  if (m && numMois(m[2])) return `${m[1]}/${numMois(m[2])}/${m[3]}`;
  m = /\b([a-z]{3,9}) (\d{1,2})(?:st|nd|rd|th)? (\d{4})\b/.exec(t);
  if (m && numMois(m[1])) return `${m[2]}/${numMois(m[1])}/${m[3]}`;
  return null;
}

/** Date au format AAAA-MM-JJ, ou null si illisible. */
export function lireDate(s: string, f: FormatDate): string | null {
  // Une case qui commence par une date chiffrée la garde, même si le libellé collé derrière contient « 12 dec 1927 »
  const lettres = RE_DATE.exec(s)?.index === s.search(/\S/) ? null : dateEnLettres(s);
  if (lettres) (s = lettres), (f = "JJ/MM/AAAA");
  const m = RE_DATE.exec(s);
  if (!m) return null;
  let [a, mo, j] = f === "AAAA-MM-JJ" ? [m[1], m[2], m[3]] : f === "JJ/MM/AAAA" ? [m[3], m[2], m[1]] : [m[3], m[1], m[2]];
  if (a.length === 2) a = (+a < 70 ? "20" : "19") + a;
  if (a.length !== 4) return null;
  const d = new Date(Date.UTC(+a, +mo - 1, +j));
  if (d.getUTCMonth() !== +mo - 1 || d.getUTCDate() !== +j) return null;
  return d.toISOString().slice(0, 10);
}

/** Montant en centimes : « 1 234,56 », « -1,234.56 », « 12.5 », « (12,00) », « 12,00- », « 15.000 F CFA »… */
export function lireMontant(s: string): number | null {
  const n = lireMontantSeul(s);
  if (n !== null) return n;
  // Texte du PDF débordant dans la case (« 1.443,43 N° de référence… ») : le montant en tête, avec ses centimes
  const tete = /^\s*[-+]?\d[\d  .,']*[.,]\d{2}(?![\d.,])/.exec(s);
  return tete ? lireMontantSeul(tete[0]) : null;
}

function lireMontantSeul(s: string): number | null {
  let t = s.replace(/[\s  ']/g, "").replace(/€|\$|£|eur|usd|cad|xof|fcfa|cfa|f(?=$)/gi, "");
  // Renvoi en bas de page après le montant (« 9,60 * » sur les relevés Société Générale)
  t = t.replace(/\*+$/, "");
  let neg = false;
  if (/^\(.*\)$/.test(t)) (neg = true), (t = t.slice(1, -1));
  if (t.endsWith("-")) (neg = !neg), (t = t.slice(0, -1));
  if (t.startsWith("+")) t = t.slice(1);
  else if (t.startsWith("-")) (neg = !neg), (t = t.slice(1));
  if (!/^[\d.,]*\d[\d.,]*$/.test(t)) return null;
  const pos = Math.max(t.lastIndexOf("."), t.lastIndexOf(","));
  let entier = t;
  let dec = "";
  if (pos >= 0) {
    const sep = t[pos];
    const deuxSortes = t.includes(".") && t.includes(",");
    const apres = t.slice(pos + 1);
    // Un seul type de séparateur, répété ou suivi de 3 chiffres : ce sont des milliers (1.234 ou 15,000)
    const milliers = !deuxSortes && (t.split(sep).length > 2 || apres.length === 3);
    if (!milliers) (entier = t.slice(0, pos)), (dec = apres);
  }
  entier = entier.replace(/[.,]/g, "") || "0";
  const cts = +entier * 100 + +(dec + "00").slice(0, 2) + (+(dec[2] ?? 0) >= 5 ? 1 : 0);
  return neg ? -cts : cts;
}

// États d'opérations pas définitives, en français et en anglais (Revolut, N26, Wise…)
// En attente : comptées comme dans l'appli de la banque, puis remplacées par la version définitive
const EN_ATTENTE = ["pending", "en attente", "en cours"];
const NON_ABOUTI = ["reverted", "restaure", "restauree", "annule", "annulee", "cancelled", "canceled", "declined", "refuse", "refusee", "rejected", "rejete", "rejetee", "failed", "echoue", "echouee"];
const DEVISES: Record<string, string> = { "€": "EUR", "$": "USD", "fcfa": "XOF", "cfa": "XOF" };

export function lire(lignes: string[][], idxEntete: number, profil: Profil, devise: string): Lecture {
  const entete = enteteDe(lignes, idxEntete);
  const col = (r: Role) => (profil.colonnes[r] ? entete.indexOf(profil.colonnes[r]!) : -1);
  const c = Object.fromEntries((Object.keys(SYNONYMES) as Role[]).map((r) => [r, col(r)])) as Record<Role, number>;
  const res: Lecture = { ops: [], erreurs: [], autreDevise: 0, nonAbouties: 0 };
  const val = (l: string[], i: number) => (i >= 0 ? (l[i] ?? "").trim() : "");

  lignes.slice(idxEntete + 1).forEach((l, k) => {
    const ligne = idxEntete + 2 + k;
    // Lignes de pied de page (« Solde au… », totaux) : bien plus courtes que les opérations
    const courte = l.filter((x) => x.trim()).length < Math.min(3, entete.length);
    const etat = normaliser(val(l, c.etat));
    if (NON_ABOUTI.includes(etat)) return void res.nonAbouties++;
    const enAttente = EN_ATTENTE.includes(etat);
    // Une opération en attente n'a souvent pas encore de date de fin : on prend l'autre date de la ligne
    const date = lireDate(val(l, c.date), profil.formatDate) ?? (enAttente ? (l.map((x) => lireDate(x, profil.formatDate)).find(Boolean) ?? null) : null);
    if (!date) {
      if (!courte) res.erreurs.push({ ligne, raison: `date illisible « ${val(l, c.date)} »` });
      return;
    }
    let montant: number | null;
    if (c.montant >= 0) montant = lireMontant(val(l, c.montant));
    else {
      const d = lireMontant(val(l, c.debit));
      const cr = lireMontant(val(l, c.credit));
      montant = d === null && cr === null ? null : Math.abs(cr ?? 0) - Math.abs(d ?? 0);
    }
    if (montant === null) {
      res.erreurs.push({ ligne, raison: "montant illisible" });
      return;
    }
    const dv = val(l, c.devise).toUpperCase();
    if (dv && (DEVISES[dv.toLowerCase()] ?? dv) !== devise) return void res.autreDevise++;
    const frais = lireMontant(val(l, c.frais));
    if (profil.inverser) montant = -montant;
    if (frais) montant -= Math.abs(frais);
    const detail = val(l, c.detail);
    const solde = lireMontant(val(l, c.solde));
    res.ops.push({
      ligne,
      date,
      montant,
      libelle: val(l, c.libelle) || detail || "(sans libellé)",
      ...(detail && val(l, c.libelle) ? { detail } : {}),
      ...(val(l, c.categorie) ? { categorieBanque: val(l, c.categorie) } : {}),
      ...(solde !== null ? { solde } : {}),
      ...(enAttente ? { enAttente } : {}),
    });
  });
  return res;
}

// ---------- Reconnaissance par le contenu (quelle que soit la langue des titres) ----------

/**
 * Part des lignes où le solde suit les montants (« solde précédent + opération = nouveau solde »),
 * relevé du plus ancien au plus récent ou l'inverse. `n` = paires vérifiables.
 * Une colonne de solde qui ne bouge pas (solde du jour répété sur chaque ligne) ne compte pas.
 */
export function coherenceSoldes(mouvements: (number | null)[], soldes: (number | null)[]): { n: number; ok: number } {
  let n = 0, ok = 0;
  for (let i = 1; i < soldes.length; i++) {
    const a = soldes[i - 1], b = soldes[i];
    if (a === null || b === null || a === b) continue;
    n++;
    if (b - a === mouvements[i] || a - b === mouvements[i - 1]) ok++;
  }
  return { n, ok: n ? ok / n : 0 };
}

/**
 * Complète (et corrige) les colonnes devinées par les titres en regardant les valeurs :
 * la colonne pleine de dates est la date, les colonnes de nombres sont montant, débit/crédit ou solde
 * (le solde est celle qui suit les montants), le texte le plus varié est le libellé.
 * Marche avec des titres inconnus, dans n'importe quelle langue, ou sans titres du tout.
 */
export function completerParContenu(lignes: string[][], idx: number, entete: string[], titres: Partial<Record<Role, string>>): Partial<Record<Role, string>> {
  const corps = lignes.slice(idx + 1, idx + 401).filter((l) => l.filter((c) => c.trim()).length >= 2);
  if (corps.length < 2) return titres;
  const res = { ...titres };
  const brut = (k: number) => corps.map((l) => (l[k] ?? "").trim());
  const nombres = (k: number) => brut(k).map((x) => (x && !RE_DATE.test(x) && /\d/.test(x) ? lireMontant(x) : null));
  const stats = entete.map((_, k) => {
    const v = brut(k).filter(Boolean);
    const part = (f: (x: string) => boolean) => (v.length ? v.filter(f).length / v.length : 0);
    return {
      k,
      rempli: v.length / corps.length,
      date: part((x) => RE_DATE.test(x) || !!dateEnLettres(x)),
      nombre: part((x) => !RE_DATE.test(x) && /\d/.test(x) && lireMontant(x) !== null),
      texte: new Set(v).size * (v.reduce((a, x) => a + x.length, 0) / (v.length || 1)),
    };
  });
  const k = (nom?: string) => (nom === undefined ? -1 : entete.indexOf(nom));
  // Titres trompeurs : une « date » sans dates, un « montant » sans nombres.
  // Une colonne vide ne prouve rien (un relevé sans aucune dépense garde sa colonne Débit pour les suivants).
  if (res.date && stats[k(res.date)].date < 0.5) delete res.date;
  for (const r of ["montant", "debit", "credit", "solde"] as Role[]) if (res[r] && stats[k(res[r])].rempli > 0 && stats[k(res[r])].nombre < 0.5) delete res[r];
  const pris = () => new Set(Object.values(res).map(k));

  if (!res.date) {
    const d = stats.find((s) => !pris().has(s.k) && s.date >= 0.8 && s.rempli >= 0.8);
    if (d) res.date = entete[d.k];
  }

  const libres = () => stats.filter((s) => !pris().has(s.k) && s.nombre >= 0.9 && s.date < 0.5 && s.rempli > 0);
  if (!res.montant && !res.debit && !res.credit) {
    const cands = libres();
    const solde = (mouv: (number | null)[], exclus: number[]) =>
      cands.filter((s) => !exclus.includes(s.k) && s.rempli >= 0.8).map((s) => ({ s, c: coherenceSoldes(mouv, nombres(s.k)) })).sort((a, b) => b.c.ok - a.c.ok)[0];
    // Deux colonnes jamais remplies sur la même ligne : sorties et entrées
    let choix: { debit?: number; credit?: number; montant?: number; solde?: number; score: number } = { score: -1 };
    for (const a of cands)
      for (const b of cands) {
        if (a.k >= b.k) continue;
        const na = nombres(a.k), nb = nombres(b.k);
        const ensemble = na.filter((x, i) => x !== null && nb[i] !== null).length;
        const union = na.filter((x, i) => x !== null || nb[i] !== null).length;
        if (ensemble > corps.length * 0.02 || union < corps.length * 0.6 || a.rempli < 0.03 || b.rempli < 0.03) continue;
        for (const [d, c] of [[a.k, b.k], [b.k, a.k]]) {
          const nd = nombres(d), nc = nombres(c);
          const mouv = nd.map((x, i) => (x === null && nc[i] === null ? null : Math.abs(nc[i] ?? 0) - Math.abs(x ?? 0)));
          const s = solde(mouv, [d, c]);
          // Sans solde pour trancher : des montants négatifs, sinon la colonne la plus remplie, sont les dépenses
          const indice = s && s.c.n >= 3 ? s.c.ok : nd.some((x) => x !== null && x < 0) ? 0.5 : stats[d].rempli >= stats[c].rempli ? 0.4 : 0.3;
          if (indice > choix.score) choix = { debit: d, credit: c, solde: s && s.c.n >= 3 && s.c.ok >= 0.6 ? s.s.k : undefined, score: indice };
        }
      }
    // Sinon une seule colonne de montants signés (et peut-être un solde à côté)
    if (choix.score < 0)
      for (const m of cands.filter((s) => s.rempli >= 0.8)) {
        const s = solde(nombres(m.k), [m.k]);
        const indice = s && s.c.n >= 3 ? s.c.ok : 0.1;
        if (indice > choix.score) choix = { montant: m.k, solde: s && s.c.n >= 3 && s.c.ok >= 0.6 ? s.s.k : undefined, score: indice };
      }
    if (choix.debit !== undefined) (res.debit = entete[choix.debit]), (res.credit = entete[choix.credit!]);
    if (choix.montant !== undefined) res.montant = entete[choix.montant];
    if (choix.solde !== undefined && !res.solde) res.solde = entete[choix.solde];
  }

  if (!res.libelle && !res.detail) {
    const l = stats.filter((s) => !pris().has(s.k) && s.nombre < 0.5 && s.date < 0.5 && s.rempli >= 0.5).sort((a, b) => b.texte - a.texte)[0];
    if (l) res.libelle = entete[l.k];
  }
  return res;
}

/**
 * Montants à l'envers ? Si le relevé donne un solde qui suit les montants une fois retournés
 * (et pas tels quels), le format écrit les dépenses en positif.
 */
export function sensInverse(ops: OpLue[]): boolean {
  const avec = ops.filter((o) => o.solde !== undefined);
  const soldes = avec.map((o) => o.solde!);
  const droit = coherenceSoldes(avec.map((o) => o.montant), soldes);
  const envers = coherenceSoldes(avec.map((o) => -o.montant), soldes);
  return droit.n >= 3 && envers.ok >= 0.8 && droit.ok < 0.5;
}

/** Ce qu'il manque pour pouvoir importer (vide = c'est bon). */
export function manques(p: Profil): string[] {
  const m: string[] = [];
  if (!p.colonnes.date) m.push("la date");
  if (!p.colonnes.libelle && !p.colonnes.detail) m.push("le libellé");
  if (!p.colonnes.montant && !p.colonnes.debit && !p.colonnes.credit) m.push("le montant");
  return m;
}

/** Formats pas encore pris en charge : message clair plutôt qu'un import raté. */
export function formatNonGere(texte: string): string | null {
  const debut = texte.trimStart().slice(0, 400);
  // OFX, QIF et CAMT sont lus avant d'arriver ici : un XML qui reste n'est pas un relevé connu
  if (/^<\?xml/i.test(debut)) return "Ce fichier XML n'est pas un relevé reconnu. Exportez plutôt le relevé en CSV, Excel, PDF, OFX ou CAMT.";
  if (/^:20:/m.test(debut)) return "Les fichiers MT940 ne sont pas encore pris en charge. Exportez plutôt le relevé en CSV, Excel, PDF, OFX ou CAMT.";
  return null;
}
