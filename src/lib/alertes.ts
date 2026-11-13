// Alertes du téléphone. Les données sont chiffrées et illisibles quand Sésame est verrouillé : on ne peut
// rien surveiller en arrière-plan. Chaque fois que l'appli est ouverte (et quand on la quitte), on calcule
// donc ce qui s'annonce et on programme les notifications d'avance ; le téléphone les affiche à l'heure dite.

export interface Reglages {
  decouvert: boolean;
  budget: boolean;
  import: boolean;
  sauvegarde: boolean;
  /** Bilan du mois écoulé, le 1er du mois */
  bilan: boolean;
  /** Montants dans le texte (visible sur l'écran verrouillé) : non par défaut */
  montants: boolean;
}
export const REGLAGES_DEFAUT: Reglages = { decouvert: true, budget: true, import: true, sauvegarde: true, bilan: true, montants: false };

export interface Situation {
  maintenant: number;
  /** Date (AAAA-MM-JJ) où l'argent disponible passerait sous 0, et le point le plus bas */
  decouvert?: { date: string; plusBas: string };
  /** Budget du mois le plus entamé */
  budget?: { cle: string; nom: string; depense: string; plafond: string; part: number };
  dernierImport?: number;
  premierImport?: number;
  derniereSauvegarde?: number;
  rappelSauvegardeApres?: number;
  /** Bilan à annoncer le 1er du mois prochain : mois concerné (clé AAAA-MM et nom lisible) */
  bilan?: { cle: string; mois: string; quand: number };
}

export interface Alerte {
  /** Identifiant fixe par type : reprogrammer remplace l'ancienne */
  id: 1 | 2 | 3 | 4 | 5;
  /** Ce qui rend l'alerte unique : une même alerte n'est pas renvoyée une fois passée */
  cle: string;
  quand: number;
  texte: string;
}

const JOUR = 86_400_000;
/** Le jour donné à l'heure dite (heure locale) ; si c'est déjà passé, le lendemain à la même heure */
export function aHeure(jour: number, heure: number, apres: number): number {
  const d = new Date(jour);
  d.setHours(heure, 0, 0, 0);
  while (d.getTime() <= apres) d.setDate(d.getDate() + 1);
  return d.getTime();
}

type Tr = (s: string, ...v: (string | number)[]) => string;

/**
 * Notifications à programmer. `vues` : alertes déjà programmées dont l'heure est passée
 * (clé → heure), pour ne pas répéter la même chaque jour.
 */
export function alertesAPlanifier(s: Situation, r: Reglages, vues: Record<string, number>, t: Tr): Alerte[] {
  const res: Alerte[] = [];
  const ajouter = (id: Alerte["id"], cle: string, quand: number, texte: string) => {
    if (vues[cle] !== undefined && vues[cle] <= s.maintenant) return;
    res.push({ id, cle, quand: vues[cle] ?? quand, texte });
  };
  if (r.decouvert && s.decouvert) {
    const jour = Date.parse(s.decouvert.date + "T00:00:00");
    if (jour > s.maintenant)
      ajouter(1, `decouvert|${s.decouvert.date}`, aHeure(Math.max(jour - 3 * JOUR, s.maintenant), 9, s.maintenant),
        r.montants ? t("Votre argent disponible pourrait passer sous zéro vers le {0} (au plus bas : {1}).", s.decouvert.date.split("-").reverse().join("/"), s.decouvert.plusBas)
          : t("Votre argent disponible risque de passer sous zéro dans quelques jours. Ouvrez Sésame pour voir la prévision."));
  }
  if (r.budget && s.budget && s.budget.part >= 0.9)
    ajouter(2, `budget|${s.budget.cle}`, aHeure(s.maintenant, 10, s.maintenant),
      r.montants ? t("Budget « {0} » : {1} dépensés sur {2}.", s.budget.nom, s.budget.depense, s.budget.plafond) : t("Un de vos budgets est presque atteint ce mois-ci."));
  if (r.import && s.dernierImport)
    ajouter(3, `import|${s.dernierImport}`, aHeure(s.dernierImport + 14 * JOUR, 18, s.maintenant), t("Pensez à importer vos derniers relevés pour garder vos comptes à jour."));
  if (r.sauvegarde && (s.derniereSauvegarde || s.premierImport)) {
    const due = Math.max(s.derniereSauvegarde ? s.derniereSauvegarde + 30 * JOUR : s.premierImport! + 3 * JOUR, s.rappelSauvegardeApres ?? 0);
    ajouter(4, `sauvegarde|${due}`, aHeure(due, 18, s.maintenant), t("Pensez à exporter une sauvegarde de Sésame : c'est elle qui vous permet de tout retrouver si vous perdez cet appareil."));
  }
  if (r.bilan !== false && s.bilan) ajouter(5, `bilan|${s.bilan.cle}`, s.bilan.quand, t("Votre bilan de {0} est prêt : ouvrez Sésame pour le voir.", s.bilan.mois));
  return res;
}
