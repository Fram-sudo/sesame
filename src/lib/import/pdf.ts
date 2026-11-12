import { t } from "../i18n.svelte";
// Relevés PDF : on récupère chaque morceau de texte avec sa position (pdf.js), on refait les lignes,
// puis on range chaque morceau sous le bon titre de colonne. Le résultat (string[][]) passe ensuite
// dans le même moteur que les CSV.
import { dateEnLettres, detecterEntete, devinerColonnes, lireMontant, normaliser, type Role } from "./analyse";

export interface Morceau {
  s: string;
  x: number;
  y: number;
  l: number;
  h: number;
  page: number;
}

interface Ligne {
  page: number;
  y: number;
  h: number;
  m: Morceau[];
}

/** Morceaux alignés horizontalement → lignes, de haut en bas et de gauche à droite. */
export function grouperLignes(morceaux: Morceau[]): Ligne[] {
  const tri = morceaux.filter((m) => m.s.trim()).sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);
  const lignes: Ligne[] = [];
  for (const m of tri) {
    const l = lignes.at(-1);
    if (l && l.page === m.page && Math.abs(l.y - m.y) <= Math.max(2, m.h * 0.4)) l.m.push(m);
    else lignes.push({ page: m.page, y: m.y, h: m.h || 10, m: [m] });
  }
  for (const l of lignes) l.m.sort((a, b) => a.x - b.x);
  return lignes;
}

/** Découpe une ligne en cellules là où l'espace entre deux morceaux est large. */
function cellules(l: Ligne): { s: string; x0: number; x1: number }[] {
  const c: { s: string; x0: number; x1: number }[] = [];
  for (const m of l.m) {
    const d = c.at(-1);
    // Proches mais de nature différente (montant / texte) : deux cellules, pour ne pas coller une référence à un montant
    if (d && m.x - d.x1 < Math.max(6, l.h) && estMontant(m.s) === estMontant(d.s)) (d.s += (m.x - d.x1 > l.h * 0.15 ? " " : "") + m.s.trim()), (d.x1 = m.x + m.l);
    else c.push({ s: m.s.trim(), x0: m.x, x1: m.x + m.l });
  }
  return c;
}

// Un montant : chiffres groupés par 3 ou 7 chiffres au plus, centimes facultatifs, signe et devise possibles
// (« 1 234,56 », « €1,234.56 », « -12,90 € »). Une suite de 8 chiffres ou plus (référence, mandat, carte…) n'en est pas un.
const RE_MONTANT = /^[-+(]?\s*(€|\$|£|ca\$|us\$)?\s*[-+]?(\d{1,3}([ .,  ']\d{3})+|\d{1,7})([.,]\d{1,2})?\s*[-)]?\s*(€|eur|usd|cad|xof|f ?cfa|\$)?$/i;
export const estMontant = (s: string) => RE_MONTANT.test(s.trim()) && lireMontant(s) !== null;

/** Année la plus citée dans le document, pour les dates écrites sans année (« 02/01 »). */
function anneeProbable(lignes: Ligne[]): string | undefined {
  const n = new Map<string, number>();
  for (const l of lignes) for (const m of l.m) for (const a of m.s.match(/\b20\d\d\b/g) ?? []) n.set(a, (n.get(a) ?? 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1])[0]?.[0];
}

/** Colonnes du tableau rendu, identiques pour tous les PDF : chaque tableau du document y est ramené. */
export const COLONNES_PDF = ["Date", "Libellé", "Détail", "Débit", "Crédit", "Solde", "Devise", "Section"];
const [C_DATE, C_LIB, C_DETAIL, C_DEBIT, C_CREDIT, C_SOLDE, C_DEVISE, C_SECTION] = COLONNES_PDF.keys();
const VERS: Partial<Record<Role, number>> = { date: C_DATE, libelle: C_LIB, detail: C_DETAIL, debit: C_DEBIT, credit: C_CREDIT, montant: C_DEBIT, solde: C_SOLDE, devise: C_DEVISE };

interface Tableau {
  titres: { s: string; x0: number; x1: number }[];
  roles: (Role | undefined)[];
  montants: number[];
  cle: string;
  section: string;
}

function nouveauTableau(titres: Tableau["titres"], section: string): Tableau | null {
  const noms = titres.map((t) => normaliser(t.s));
  const r = devinerColonnes(noms);
  if (!r.date || !(r.libelle || r.detail)) return null;
  const roles = noms.map((n) => (Object.keys(r) as Role[]).find((k) => r[k] === n));
  const montants = roles.flatMap((x, j) => (x === "montant" || x === "debit" || x === "credit" || x === "solde" ? [j] : []));
  return { titres, roles, montants, cle: noms.join("|"), section };
}

/**
 * Un relevé peut contenir plusieurs tableaux (Revolut : en attente, compte, annulées, poches, épargne…),
 * chacun avec ses colonnes. On suit les titres de colonnes de chaque tableau et on ramène toutes les
 * opérations vers COLONNES_PDF ; la colonne Section dit de quel tableau vient chaque ligne.
 */
export function tableauDepuisPdf(morceaux: Morceau[]): string[][] {
  const lignes = grouperLignes(morceaux);
  const annee = anneeProbable(lignes);
  const res: string[][] = [COLONNES_PDF];
  let t: Tableau | null = null;
  let precedente: { cases: string[]; ligne: Ligne } | null = null;

  lignes.forEach((l, k) => {
    const cells = cellules(l);
    // Nouvelle ligne de titres ? Même titres qu'avant = simple répétition en haut de page.
    const cle = cells.map((c) => normaliser(c.s)).join("|");
    if (t && cle === t.cle) return;
    if (detecterEntete([cells.map((c) => c.s)]) === 0) {
      const avant = lignes[k - 1];
      const titre = avant && avant.page === l.page ? avant.m.map((m) => m.s).join(" ").trim() : "";
      const nt = nouveauTableau(cells, titre || t?.section || "Relevé");
      if (nt) {
        t = nt;
        precedente = null;
        return;
      }
    }
    if (!t) return;
    const tab: Tableau = t;

    const brut: string[] = Array(tab.titres.length).fill("");
    for (const c of cells) {
      // Montants alignés à droite : colonne de montants dont le bord droit est le plus proche.
      // Texte et dates alignés à gauche : dernière colonne qui commence avant lui.
      // Un nombre qui n'est pas aligné sous une colonne de montants reste du texte (référence dans le libellé).
      let i = -1;
      if (estMontant(c.s)) {
        const ecart = (j: number) => Math.abs(tab.titres[j].x1 - c.x1);
        const proche = tab.montants.reduce((b, j) => (b < 0 || ecart(j) < ecart(b) ? j : b), -1);
        if (proche >= 0 && ecart(proche) <= Math.max(l.h * 4, tab.titres[proche].x1 - tab.titres[proche].x0)) i = proche;
      }
      if (i < 0) {
        i = 0;
        tab.titres.forEach((ti, j) => c.x0 >= ti.x0 - l.h && (i = j));
      }
      brut[i] = brut[i] ? `${brut[i]} ${c.s}` : c.s;
    }

    const cases: string[] = Array(COLONNES_PDF.length).fill("");
    cases[C_SECTION] = tab.section;
    brut.forEach((v, j) => {
      const r = tab.roles[j];
      if (!v || !r) return;
      if (r === "montant") cases[(lireMontant(v) ?? 0) < 0 ? C_DEBIT : C_CREDIT] = v;
      else if (VERS[r] !== undefined) cases[VERS[r]!] = cases[VERS[r]!] ? `${cases[VERS[r]!]} ${v}` : v;
    });
    // Texte hors des colonnes reconnues (ex. « Valeur ») : ignoré

    // Pas une date (bas de page, mentions légales…) : la ligne n'est pas une opération
    const sansDate = !/\d{1,2}[/.-]\d{1,2}/.test(cases[C_DATE]) && !dateEnLettres(cases[C_DATE]);
    const avecMontant = cases[C_DEBIT] || cases[C_CREDIT] || cases[C_SOLDE];
    if (sansDate && !avecMontant) {
      // Suite de l'opération juste au-dessus (référence, carte, bénéficiaire…) : rangée dans le détail
      const texte = brut.filter((v) => v).join(" ");
      if (texte && precedente && precedente.ligne.page === l.page && precedente.ligne.y - l.y < l.h * 2.2) {
        precedente.cases[C_DETAIL] = `${precedente.cases[C_DETAIL]} ${texte}`.trim();
        precedente.ligne = l;
      }
      return;
    }
    // Soldes, totaux, reports (montant sans date) et titres de tableaux (date sans montant) : pas des opérations
    if (sansDate || !avecMontant) return;
    // shortcut: l'année est celle la plus citée dans le document ; un relevé à cheval sur décembre/janvier peut se tromper d'un an.
    if (annee && /^\d{1,2}[/.-]\d{1,2}$/.test(cases[C_DATE])) cases[C_DATE] += `/${annee}`;
    res.push(cases);
    precedente = { cases, ligne: l };
  });
  return res.length > 1 ? res : lignes.map((l) => cellules(l).map((c) => c.s));
}

/** Tableau d'opérations pas encore définitives. */
export const sectionEnAttente = (s: string) => /pending|en attente|en cours/i.test(s);
/** Tableau des poches (Revolut « Personal and Group Pockets »…) : réparti automatiquement en sous-comptes. */
export const sectionPoches = (s: string) => /pocket|poche/i.test(s) && !/pending|en attente|reverted|annul/i.test(s);
/** Tableaux à ne pas importer par défaut : opérations en attente, annulées, refusées. */
export const sectionExclue = (s: string) => sectionEnAttente(s) || /reverted|annul|declin|refus|rejet/i.test(s);

/** Lit un PDF (octets) : tableau d'opérations, et texte du haut de la 1re page (pour reconnaître la banque). */
export async function lirePdf(octets: Uint8Array): Promise<{ lignes: string[][]; texte: string }> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  const tache = pdfjs.getDocument({ data: octets, verbosity: 0 });
  let doc;
  try {
    doc = await tache.promise;
  } catch (e) {
    if ((e as Error)?.name === "PasswordException") throw t("Ce PDF est protégé par un mot de passe : enregistrez-en une copie sans mot de passe, ou téléchargez le relevé en CSV.");
    throw t("Ce PDF n'a pas pu être lu.");
  }
  const morceaux: Morceau[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const contenu = await (await doc.getPage(p)).getTextContent();
    for (const it of contenu.items) {
      if (!("str" in it)) continue;
      morceaux.push({ s: it.str, x: it.transform[4], y: it.transform[5], l: it.width, h: it.height, page: p });
    }
  }
  await tache.destroy();
  if (!morceaux.some((m) => m.s.trim()))
    throw t("Ce PDF ne contient pas de texte (c'est sans doute un document scanné). Téléchargez plutôt le relevé depuis le site de votre banque.");
  const entete = grouperLignes(morceaux.filter((m) => m.page === 1)).slice(0, 25);
  return { lignes: tableauDepuisPdf(morceaux), texte: entete.map((l) => l.m.map((m) => m.s).join(" ")).join("\n") };
}
