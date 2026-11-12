// Prévision de l'argent disponible (comptes courants, sans l'épargne) sur les prochaines semaines :
// les opérations qui reviennent (salaire, loyer, abonnements…) à leur date, plus le reste des dépenses
// habituelles des 90 derniers jours, réparti jour par jour.
import { detecterRecurrences, motif, type Op } from "./categories";
import { perimetre, solde, type Contexte } from "./stats";

export interface Prevision {
  /** Un point par semaine, aujourd'hui compris */
  points: { date: string; solde: number }[];
  /** Point le plus bas sur l'horizon */
  plusBas: { date: string; solde: number };
  /** Premier jour où le solde passerait sous le seuil, s'il y en a un */
  sousSeuil?: string;
}

const jour = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);
function suivante(d: string, frequence: string) {
  const x = new Date(d + "T00:00:00Z");
  if (frequence === "chaque mois") x.setUTCMonth(x.getUTCMonth() + 1);
  else if (frequence === "chaque trimestre") x.setUTCMonth(x.getUTCMonth() + 3);
  else if (frequence === "chaque année") x.setUTCFullYear(x.getUTCFullYear() + 1);
  else x.setUTCDate(x.getUTCDate() + (frequence === "chaque semaine" ? 7 : 14));
  return x.toISOString().slice(0, 10);
}

export function prevoir(ctx: Omit<Contexte, "ops"> & { ops: (Op & { enAttente?: boolean })[] }, compteId: string, auj: string, jours = 91, seuil = 0): Prevision {
  const p = perimetre(ctx, compteId);
  const ops = ctx.ops.filter((o) => p.courants.has(o.compteId));
  const recurrences = detecterRecurrences(ops);
  const cle = (c: string, m: string, positif: boolean) => `${c}|${m}|${positif}`;
  const reguliers = new Set(recurrences.map((r) => cle(r.compteId, r.motif, r.montant > 0)));

  // Le reste : tout ce qui bouge sur les comptes courants (dépenses courantes, virements vers les poches…), en moyenne par jour
  const debut = jour(auj, -90);
  let reste = 0;
  for (const o of ops) {
    if (o.date <= debut || o.date > auj || o.enAttente) continue;
    if (reguliers.has(cle(o.compteId, motif(o.libelle), o.montant > 0))) continue;
    reste += o.montant * p.facteur.get(o.compteId)!;
  }
  // shortcut: moyenne sur 90 jours même si l'historique est plus court ; à affiner si l'appli sert à de nouveaux comptes
  const parJour = reste / 90;

  const mouvements = new Map<string, number>();
  const fin = jour(auj, jours);
  for (const r of recurrences) {
    let d = r.prochaine;
    // Échéance un peu en retard (moins d'une semaine) : on l'attend demain ; plus ancienne : elle s'est sans doute arrêtée
    if (d <= auj) d = d >= jour(auj, -7) ? jour(auj, 1) : "";
    const montant = r.montant * p.facteur.get(r.compteId)!;
    for (; d && d <= fin; d = suivante(d, r.frequence)) mouvements.set(d, (mouvements.get(d) ?? 0) + montant);
  }

  let s = solde(ctx, compteId, auj, false);
  const points = [{ date: auj, solde: s }];
  let plusBas = points[0];
  let sousSeuil: string | undefined = s < seuil ? auj : undefined;
  for (let i = 1; i <= jours; i++) {
    const d = jour(auj, i);
    s += parJour + (mouvements.get(d) ?? 0);
    const v = Math.round(s);
    if (v < plusBas.solde) plusBas = { date: d, solde: v };
    if (!sousSeuil && v < seuil) sousSeuil = d;
    if (i % 7 === 0 || i === jours) points.push({ date: d, solde: v });
  }
  return { points, plusBas, sousSeuil };
}
