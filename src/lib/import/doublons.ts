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
