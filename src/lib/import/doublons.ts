import { normaliser } from "./analyse";

/** Empreinte d'une opération : même jour, même montant, même libellé. */
export const cleOp = (o: { date: string; montant: number; libelle: string }) => `${o.date}|${o.montant}|${normaliser(o.libelle)}`;

/**
 * Sépare les nouvelles opérations des doublons déjà présents dans le compte.
 * Deux cafés identiques le même jour restent deux opérations : on compare le nombre d'occurrences.
 */
export function separerDoublons<T extends { date: string; montant: number; libelle: string }>(lues: T[], existantes: { cle: string }[]) {
  const deja = new Map<string, number>();
  for (const e of existantes) deja.set(e.cle, (deja.get(e.cle) ?? 0) + 1);
  const vues = new Map<string, number>();
  const nouvelles: (T & { cle: string })[] = [];
  const doublons: T[] = [];
  for (const o of lues) {
    const cle = cleOp(o);
    const n = vues.get(cle) ?? 0;
    vues.set(cle, n + 1);
    if (n < (deja.get(cle) ?? 0)) doublons.push(o);
    else nouvelles.push({ ...o, cle });
  }
  return { nouvelles, doublons };
}

/**
 * Saisies faites à la main retrouvées dans un relevé importé ensuite : même montant, à 7 jours près
 * (la banque enregistre souvent un paiement un à trois jours après). Le libellé n'est pas comparé :
 * « Courses » saisi à la main devient « CARTE CARREFOUR 1234 » chez la banque.
 * Renvoie, pour chaque opération du relevé reconnue, la saisie qu'elle remplace (la plus proche en date).
 */
export function rapprocherSaisies<N extends { date: string; montant: number }, S extends { id: string; date: string; montant: number }>(nouvelles: N[], saisies: S[]) {
  const jours = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;
  const paires: { nouvelle: N; saisie: S; ecart: number }[] = [];
  for (const n of nouvelles) for (const s of saisies) if (s.montant === n.montant && jours(s.date, n.date) <= 7) paires.push({ nouvelle: n, saisie: s, ecart: jours(s.date, n.date) });
  // Les plus proches en date d'abord ; chaque saisie et chaque ligne du relevé ne servent qu'une fois
  paires.sort((a, b) => a.ecart - b.ecart);
  const res = new Map<N, S>();
  const prises = new Set<string>();
  for (const p of paires) if (!res.has(p.nouvelle) && !prises.has(p.saisie.id)) res.set(p.nouvelle, p.saisie), prises.add(p.saisie.id);
  return res;
}
