// Données de l'appli en mémoire (seulement tant que le coffre est ouvert).
// Chaque modification passe par ecrire() : écrite chiffrée sur le disque, puis appliquée ici.
import { api } from "./api";
import { changerLangue, langue, t, type Langue } from "./i18n.svelte";
import { cleOp } from "./import/doublons";
import { NOMS_CATEGORIES_EN } from "./i18n-en";
import { attentesRemplacees, CATEGORIES_DEFAUT, COULEURS_AVANT_REFONTE, categoriser, detecterVirements, estDepotEspeces, estRetraitEspeces, REGLES_DEFAUT, trierRegles, VIREMENT, type Categorie, type Regle, type Routage } from "./categories";
import type { Profil } from "./import/analyse";
import type { Pret } from "./prets";

/** Code ISO 4217 de la devise (EUR, XOF, GBP…) : toutes les devises sont possibles, voir devises.ts */
export type Devise = string;

export interface Compte {
  id: string;
  nom: string;
  banque: string;
  devise: Devise;
  /** Solde au départ, en centimes : corrigé lors du contrôle avec le solde de la banque. */
  soldeInitial: number;
  /** Épargne : poches, livrets… (affichés à part sur l'accueil) */
  type?: "courant" | "epargne";
  /** Poche (sous-compte) d'un autre compte, créée automatiquement à l'import */
  parentId?: string;
  /** Ce qui identifie les relevés de ce compte (voir import/fichier.ts) */
  empreinte?: string;
  /** Options d'import (par défaut : oui) */
  importAttente?: boolean;
  importPoches?: boolean;
  /** Objectif d'épargne en centimes (sinon lu dans le nom de la poche) */
  objectif?: number;
  /** Poche : son nom dans les relevés de la banque (le nom affiché peut être changé librement) */
  nomBanque?: string;
  /** Poche : autres noms reconnus (poche renommée côté banque puis fusionnée) */
  alias?: string[];
  /** Poche fermée côté banque : cachée de l'accueil, historique gardé */
  archive?: boolean;
  /** Poche ou épargne qui est en fait une réserve (argent bloqué pour une dépense prévue, ex. mensualité de prêt) :
   *  ni argent disponible, ni épargne */
  reserve?: boolean;
  /** Épargne : livret ou compte en banque, espèces (tirelire), ou projet (pour l'icône et les libellés).
   *  Compte courant « especes » : le portefeuille d'espèces */
  forme?: "livret" | "especes" | "projet";
  /** Porte-monnaie : retraits et dépôts d'espèces suivis à partir de cette date (AAAA-MM-JJ) ; absent = depuis toujours */
  especesDepuis?: string;
  /** Objectif d'épargne daté : pour quand, et d'où l'on partait le jour où il a été fixé (date, solde) */
  objectifDate?: string;
  objectifDepuis?: string;
  objectifDepart?: number;
  /** Couleur choisie (carte, menu, graphiques) ; absente = couleur par défaut (voir couleurs.ts) */
  couleur?: string;
  demo?: boolean;
}

export interface Operation {
  id: string;
  compteId: string;
  date: string;
  montant: number;
  libelle: string;
  detail?: string;
  categorieBanque?: string;
  importId?: string;
  /** Empreinte pour repérer les doublons (voir import/doublons.ts) */
  cle: string;
  demo?: boolean;
  categorieId?: string;
  /** Catégorie choisie (ou retirée) à la main : le classement automatique n'y touche plus */
  categorieManuelle?: boolean;
  /** Identifiant commun aux deux moitiés d'un virement entre vos comptes */
  virementId?: string;
  pasVirement?: boolean;
  /** Entrée du porte-monnaie créée par Sésame pour un retrait ou un dépôt d'espèces */
  especesAuto?: boolean;
  /** Saisie à la main (et non importée) */
  manuelle?: boolean;
  note?: string;
  /** Pas encore définitive à la date du relevé : remplacée automatiquement quand elle le devient */
  enAttente?: boolean;
  /** Était en attente, marquée effectuée à la main : la ligne définitive du prochain relevé la remplacera */
  etaitEnAttente?: boolean;
}

export interface Import {
  id: string;
  /** Premier compte concerné ; tous les comptes d'un import de plusieurs relevés sont dans `comptes` */
  compteId: string;
  comptes?: string[];
  /** Noms des relevés importés ensemble */
  fichiers?: string[];
  /** Saisies à la main et opérations en attente remplacées par les lignes de la banque : remises si on annule */
  remplacees?: Operation[];
  quand: number;
  fichier: string;
  banque: string;
  nb: number;
  doublons: number;
  de: string;
  a: string;
}

/** Budget d'une catégorie, en centimes */
export interface Budget {
  /** Id de la catégorie, ou "global" pour le plafond de toutes les dépenses */
  id: string;
  montant: number;
  /** Mensuel (par défaut) ou annuel */
  frequence?: "mois" | "annee";
}

type Collections = { comptes: Compte; operations: Operation; imports: Import; profils: Profil; categories: Categorie; regles: Regle; routages: Routage; budgets: Budget; prets: Pret };
const NOMS: Nom[] = ["comptes", "operations", "imports", "profils", "categories", "regles", "routages", "budgets", "prets"];
type Nom = keyof Collections;

// Listes « brutes » (pas de suivi objet par objet) : ecrire() remplace toujours la liste entière, jamais un
// élément sur place. Lire des milliers d'opérations reste ainsi rapide (ouverture, statistiques).
class Donnees {
  comptes = $state.raw<Compte[]>([]);
  operations = $state.raw<Operation[]>([]);
  imports = $state.raw<Import[]>([]);
  profils = $state.raw<Profil[]>([]);
  categories = $state.raw<Categorie[]>([]);
  /** Seulement vos règles apprises ; les règles fournies sont dans categories.ts */
  regles = $state.raw<Regle[]>([]);
  /** Règles de compte appliquées à l'import (voir categories.router) */
  routages = $state.raw<Routage[]>([]);
  budgets = $state.raw<Budget[]>([]);
  prets = $state.raw<Pret[]>([]);
}
export const donnees = new Donnees();

export const nouvelId = () => crypto.randomUUID();

/** classer : ranger et relier tout de suite (sinon l'appelant le fait plus tard, après l'affichage) */
export async function charger(classer = true) {
  const tout = await api.lireTout();
  for (const nom of NOMS) (donnees[nom] as unknown[]) = tout.filter((l) => l.collection === nom).map((l) => l.valeur);
  await reparerBudgets(tout);
  // Première ouverture : catégories fournies, nommées dans la langue de l'appli
  if (!donnees.categories.length)
    await ecrire(CATEGORIES_DEFAUT.map((c) => ({ collection: "categories", id: c.id, valeur: langue.code === "en" ? { ...c, nom: NOMS_CATEGORIES_EN[c.id] ?? c.nom } : c })));
  // Refonte : les catégories fournies passent aux nouvelles couleurs, sauf si vous les avez changées
  const aRecolorer = donnees.categories.filter((c) => COULEURS_AVANT_REFONTE[c.id] === c.couleur);
  if (aRecolorer.length)
    await ecrire(aRecolorer.map((c) => ({ collection: "categories", id: c.id, valeur: { ...c, couleur: CATEGORIES_DEFAUT.find((d) => d.id === c.id)!.couleur } })));
  if (classer) await classerEtLier();
}

/**
 * Réparation : jusqu'à la version 0.1.33, un budget était rangé dans le coffre sous l'identifiant de sa catégorie
 * et l'effaçait (à la réouverture, la catégorie disparaissait et ses opérations passaient « Sans catégorie »).
 * Les budgets ont maintenant leur propre clé ; les catégories effacées sont recréées (nom d'origine pour les
 * catégories fournies, « Catégorie à renommer » pour les vôtres, encore utilisées par vos opérations).
 */
async function reparerBudgets(tout: { id: string; collection: string; valeur: unknown }[]) {
  const anciens = tout.filter((l) => l.collection === "budgets" && !l.id.startsWith("budget:"));
  if (!anciens.length) return;
  const utilisees = new Set([...donnees.operations.map((o) => o.categorieId), ...donnees.regles.map((r) => r.categorieId)]);
  const ch: { collection: string; id: string; valeur: unknown }[] = [];
  const recreees: Categorie[] = [];
  for (const l of anciens) {
    ch.push({ collection: "budgets", id: `budget:${l.id}`, valeur: l.valeur });
    const fournie = CATEGORIES_DEFAUT.find((c) => c.id === l.id);
    const cat = fournie
      ? langue.code === "en" ? { ...fournie, nom: NOMS_CATEGORIES_EN[fournie.id] ?? fournie.nom } : fournie
      : utilisees.has(l.id) ? ({ id: l.id, nom: t("Catégorie à renommer"), type: "depense", couleur: "#888780" } as Categorie) : undefined;
    // La clé d'origine reprend la catégorie (ou est libérée s'il n'y en avait pas, comme le plafond global)
    ch.push(cat ? { collection: "categories", id: l.id, valeur: cat } : { collection: "budgets", id: l.id, valeur: null });
    if (cat && !donnees.categories.some((c) => c.id === cat.id)) recreees.push(cat);
  }
  await api.ecrireLot(ch as never);
  donnees.categories = [...donnees.categories, ...recreees];
}

export function vider() {
  for (const nom of NOMS) (donnees[nom] as unknown[]) = [];
}

export type Changement = { [N in Nom]: { collection: N; id: string; valeur: Collections[N] | null } }[Nom];

/** Écrit un lot de changements (ajout, modification, suppression avec valeur null). */
/** Prévenu à chaque écriture (pastille « changements à envoyer », voir etat.svelte.ts) */
export const apresEcriture: { rappel?: () => void } = {};

export async function ecrire(changements: Changement[]) {
  if (!changements.length) return;
  // Dans le coffre, un budget a sa propre clé : il porte l'identifiant de sa catégorie et ne doit pas l'écraser
  const cle = (c: Changement) => (c.collection === "budgets" && !c.id.startsWith("budget:") ? `budget:${c.id}` : c.id);
  await api.ecrireLot(changements.map((c) => ({ ...c, id: cle(c), valeur: c.valeur && $state.snapshot(c.valeur) })));
  apresEcriture.rappel?.();
  for (const nom of NOMS) {
    const ici = changements.filter((c) => c.collection === nom);
    if (!ici.length) continue;
    const parId = new Map(ici.map((c) => [c.id, c.valeur]));
    const liste = (donnees[nom] as { id: string }[]).filter((x) => !parId.has(x.id));
    for (const v of parId.values()) if (v) liste.push(v);
    (donnees[nom] as unknown[]) = liste;
  }
}

export const supprimer = <N extends Nom>(collection: N, liste: { id: string }[]) =>
  liste.map((x) => ({ collection, id: x.id, valeur: null }) as Changement);

/** Solde de chaque compte, éventuellement jusqu'à une date (incluse). */
export function soldes(jusquAu?: string): Map<string, number> {
  const m = new Map(donnees.comptes.map((c) => [c.id, c.soldeInitial]));
  for (const o of donnees.operations) if (!jusquAu || o.date <= jusquAu) m.set(o.compteId, (m.get(o.compteId) ?? 0) + o.montant);
  return m;
}

/** Supprime un compte avec ses opérations et l'historique de ses imports. */
/** Comptes concernés par un import (un seul pour les imports d'avant le regroupement). */
export const comptesImport = (i: Import) => i.comptes ?? [i.compteId];

export async function supprimerCompte(c: Compte) {
  const poches = donnees.comptes.filter((x) => x.parentId === c.id);
  for (const p of poches) await supprimerCompte(p);
  await ecrire([
    ...supprimer("routages", donnees.routages.filter((r) => r.source === c.id || r.cible === c.id)),
    ...supprimer("operations", donnees.operations.filter((o) => o.compteId === c.id)),
    // L'historique d'un import n'est retiré que s'il ne concerne plus aucun autre compte
    ...supprimer("imports", donnees.imports.filter((i) => comptesImport(i).every((id) => id === c.id))),
    { collection: "comptes", id: c.id, valeur: null },
  ]);
  await classerEtLier();
}

/** Date de la plus ancienne opération (pour la période « Tout »). */
export const premiereDate = () => donnees.operations.reduce((m, o) => (!m || o.date < m ? o.date : m), "");

/** Vos règles (dont les règles fournies que vous avez modifiées ou supprimées), puis les règles fournies. */
export function reglesActives() {
  const vos = new Set(donnees.regles.map((r) => r.id));
  return trierRegles([...donnees.regles.filter((r) => !r.masquee), ...REGLES_DEFAUT.filter((r) => !vos.has(r.id))]);
}

/**
 * Classe les opérations sans catégorie (vos règles, puis les mots-clés fournis) et associe
 * les virements entre vos comptes. Ne touche jamais une catégorie choisie à la main.
 * Renvoie le nombre d'opérations modifiées.
 */
export async function classerEtLier(): Promise<number> {
  const regles = reglesActives();
  const maj = new Map<string, Operation>();
  for (const o of donnees.operations) {
    if (o.categorieId || o.categorieManuelle) continue;
    const id = categoriser(o, regles, donnees.categories);
    if (id) maj.set(o.id, { ...o, categorieId: id });
  }
  // Virement dont l'autre moitié a disparu (import annulé, opération supprimée) : on défait l'association
  const moities = new Map<string, number>();
  for (const o of donnees.operations) if (o.virementId) moities.set(o.virementId, (moities.get(o.virementId) ?? 0) + 1);
  for (const o of donnees.operations) {
    if (!o.virementId || moities.get(o.virementId)! > 1) continue;
    const { virementId: _, ...reste } = maj.get(o.id) ?? o;
    maj.set(o.id, o.categorieManuelle || o.categorieId !== VIREMENT ? reste : { ...reste, categorieId: categoriser(reste, regles, donnees.categories) });
  }
  // Les comptes de démo ne s'associent jamais avec les vrais
  const devise = (id: string) => {
    const c = donnees.comptes.find((x) => x.id === id);
    return `${c?.devise}|${!!c?.demo}`;
  };
  for (const paire of detecterVirements(donnees.operations, devise)) {
    const v = nouvelId();
    for (const o of paire) {
      const base = maj.get(o.id) ?? o;
      maj.set(o.id, { ...base, virementId: v, ...(base.categorieManuelle ? {} : { categorieId: VIREMENT }) });
    }
  }
  // Espèces : un retrait au distributeur fait passer l'argent du compte au porte-monnaie (un virement, pas une dépense),
  // un dépôt au guichet l'inverse ; les achats en espèces, saisis dans le porte-monnaie, sont les vraies dépenses.
  // Seulement à partir de la date de suivi du porte-monnaie : avant, le retrait reste une dépense du compte.
  const LIB_RETRAIT = [t("Retrait au distributeur"), "Retrait au distributeur", "ATM withdrawal"];
  const LIB_DEPOT = [t("Dépôt d'espèces"), "Dépôt d'espèces", "Cash deposit"];
  const compteDe = (id: string) => donnees.comptes.find((x) => x.id === id);
  const retirees: Operation[] = [];
  for (const o of donnees.operations) {
    const pm = compteDe(o.compteId);
    if (!pm?.especesDepuis || pm.forme !== "especes" || o.date >= pm.especesDepuis || !o.virementId || o.manuelle) continue;
    if (!o.especesAuto && !LIB_RETRAIT.includes(o.libelle) && !LIB_DEPOT.includes(o.libelle)) continue;
    // Entrée automatique d'avant la date de suivi : retirée, et l'opération du compte redevient une dépense (ou un revenu)
    retirees.push(o);
    maj.delete(o.id);
    for (const x of donnees.operations)
      if (x.id !== o.id && x.virementId === o.virementId) {
        const { virementId: _, ...reste } = maj.get(x.id) ?? x;
        maj.set(x.id, x.categorieManuelle || x.categorieId !== VIREMENT ? reste : { ...reste, categorieId: categoriser(reste, regles, donnees.categories) });
      }
  }
  for (const o of donnees.operations) {
    if (retirees.includes(o)) continue;
    const base = maj.get(o.id) ?? o;
    if (base.virementId || base.pasVirement || base.enAttente) continue;
    const retrait = base.montant < 0 && estRetraitEspeces(base.libelle);
    const depot = base.montant > 0 && estDepotEspeces(base.libelle);
    if (!retrait && !depot) continue;
    const c = compteDe(base.compteId);
    if (!c || c.forme === "especes" || c.type === "epargne" || c.parentId) continue;
    const pm = donnees.comptes.find((x) => x.type !== "epargne" && x.forme === "especes" && x.devise === c.devise && !!x.demo === !!c.demo && !x.archive);
    if (!pm || (pm.especesDepuis && base.date < pm.especesDepuis)) continue;
    const v = nouvelId();
    const id = nouvelId();
    const libelle = retrait ? LIB_RETRAIT[0] : LIB_DEPOT[0];
    maj.set(base.id, { ...base, virementId: v, ...(base.categorieManuelle ? {} : { categorieId: VIREMENT }) });
    maj.set(id, { id, compteId: pm.id, date: base.date, montant: -base.montant, libelle, cle: cleOp({ date: base.date, montant: -base.montant, libelle }), virementId: v, categorieId: VIREMENT, especesAuto: true, ...(c.demo ? { demo: true } : {}) });
  }
  const remplacees = attentesRemplacees(donnees.operations);
  await ecrire([
    ...[...maj.values()].map((o) => ({ collection: "operations", id: o.id, valeur: o }) as Changement),
    ...supprimer("operations", [...remplacees, ...retirees]),
  ]);
  return maj.size + remplacees.length + retirees.length;
}

/** Change la langue et renomme les catégories fournies qui portent encore leur nom d'origine. */
export async function changerLangueEtCategories(l: Langue) {
  const avant = langue.code;
  changerLangue(l);
  const nomDans = (id: string, code: Langue) => (code === "en" ? NOMS_CATEGORIES_EN[id] : CATEGORIES_DEFAUT.find((c) => c.id === id)?.nom);
  const ch = donnees.categories
    .filter((c) => nomDans(c.id, avant) === c.nom && nomDans(c.id, l))
    .map((c) => ({ collection: "categories" as const, id: c.id, valeur: { ...c, nom: nomDans(c.id, l)! } }));
  if (ch.length) await ecrire(ch);
}
