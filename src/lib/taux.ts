import { invoke } from "@tauri-apps/api/core";
// Taux de change : franc CFA à parité fixe (toujours disponible), USD et CAD d'après la Banque centrale
// européenne (option). On ne télécharge que le fichier public des taux du jour : aucune donnée n'est envoyée.

/** 1 € = 655,957 F CFA (parité fixe garantie, ne change jamais) */
export const XOF_PAR_EUR = 655.957;

export interface Taux {
  /** Date de publication par la BCE */
  date: string;
  /** Jour où l'appli les a téléchargés (pour ne le faire qu'une fois par jour) */
  chargeLe: string;
  /** Unités de chaque devise pour 1 € */
  valeurs: Record<string, number>;
}

/** Lit le fichier XML de la BCE ; null s'il est illisible. */
export function lireBce(xml: string, chargeLe: string): Taux | null {
  const date = /time=['"](\d{4}-\d{2}-\d{2})['"]/.exec(xml)?.[1];
  const valeurs: Record<string, number> = {};
  for (const m of xml.matchAll(/currency=['"]([A-Z]{3})['"]\s+rate=['"]([\d.]+)['"]/g)) valeurs[m[1]] = parseFloat(m[2]);
  return date && Object.keys(valeurs).length ? { date, chargeLe, valeurs } : null;
}

/** Taux utilisables : ceux saisis à la main, ceux de la BCE s'ils ont été chargés, l'euro et les francs CFA (fixes). */
export const tauxConnus = (t?: Taux, manuels?: Record<string, number>): Record<string, number> => ({ ...(manuels ?? {}), ...(t?.valeurs ?? {}), EUR: 1, XOF: XOF_PAR_EUR, XAF: XOF_PAR_EUR });

/** Télécharge les taux du jour ; null en cas d'échec (pas de connexion…), on garde alors les derniers. */
export async function chargerTaux(aujourdhui: string): Promise<Taux | null> {
  try {
    // Téléchargé par le moteur : la BCE n'autorise pas l'appel direct depuis la page
    return lireBce(await invoke<string>("taux_bce"), aujourdhui);
  } catch {
    return null;
  }
}
