// Données de l'appli en mémoire (seulement tant que le coffre est ouvert).
// Chaque modification passe par ecrire() : écrite chiffrée sur le disque, puis appliquée ici.
import { api } from "./api";
import { changerLangue, langue, type Langue } from "./i18n.svelte";
import { NOMS_CATEGORIES_EN } from "./i18n-en";
import { attentesRemplacees, CATEGORIES_DEFAUT, COULEURS_AVANT_REFONTE, categoriser, detecterVirements, REGLES_DEFAUT, trierRegles, VIREMENT, type Categorie, type Regle, type Routage } from "./categories";
import type { Profil } from "./import/analyse";
import type { Pret } from "./prets";

export const DEVISES = ["EUR", "XOF", "USD", "CAD"] as const;
export type Devise = (typeof DEVISES)[number];
/** Symbole court affiché sur les boutons et à côté des montants saisis */
export const SYMBOLES: Record<string, string> = { EUR: "€", XOF: "F CFA", USD: "$ US", CAD: "$ CA" };

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
  /** Épargne : livret ou compte en banque, espèces (tirelire), ou projet (pour l'icône et les libellés) */
  forme?: "livret" | "especes" | "projet";
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
  /** Saisie à la main (et non importée) */
  manuelle?: boolean;
  note?: string;
  /** Pas encore définitive à la date du relevé : remplacée automatiquement quand elle le devient */
  enAttente?: boolean;
}

export interface Import {
  id: string;
  compteId: string;
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

export const donnees = $state({
  comptes: [] as Compte[],
  operations: [] as Operation[],
  imports: [] as Import[],
  profils: [] as Profil[],
  categories: [] as Categorie[],
  /** Seulement vos règles apprises ; les règles fournies sont dans categories.ts */
  regles: [] as Regle[],
  /** Règles de compte appliquées à l'import (voir categories.router) */
  routages: [] as Routage[],
  budgets: [] as Budget[],
  prets: [] as Pret[],
});

export const nouvelId = () => crypto.randomUUID();

export async function charger() {
  const tout = await api.lireTout();
  for (const nom of NOMS) (donnees[nom] as unknown[]) = tout.filter((l) => l.collection === nom).map((l) => l.valeur);
  // Première ouverture : catégories fournies, nommées dans la langue de l'appli
  if (!donnees.categories.length)
    await ecrire(CATEGORIES_DEFAUT.map((c) => ({ collection: "categories", id: c.id, valeur: langue.code === "en" ? { ...c, nom: NOMS_CATEGORIES_EN[c.id] ?? c.nom } : c })));
  // Refonte : les catégories fournies passent aux nouvelles couleurs, sauf si vous les avez changées
  const aRecolorer = donnees.categories.filter((c) => COULEURS_AVANT_REFONTE[c.id] === c.couleur);
  if (aRecolorer.length)
    await ecrire(aRecolorer.map((c) => ({ collection: "categories", id: c.id, valeur: { ...c, couleur: CATEGORIES_DEFAUT.find((d) => d.id === c.id)!.couleur } })));
  await classerEtLier();
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
  await api.ecrireLot(changements.map((c) => ({ ...c, valeur: c.valeur && $state.snapshot(c.valeur) })));
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
export async function supprimerCompte(c: Compte) {
  const poches = donnees.comptes.filter((x) => x.parentId === c.id);
  for (const p of poches) await supprimerCompte(p);
  await ecrire([
    ...supprimer("routages", donnees.routages.filter((r) => r.source === c.id || r.cible === c.id)),
    ...supprimer("operations", donnees.operations.filter((o) => o.compteId === c.id)),
    ...supprimer("imports", donnees.imports.filter((i) => i.compteId === c.id)),
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
  const remplacees = attentesRemplacees(donnees.operations);
  await ecrire([
    ...[...maj.values()].map((o) => ({ collection: "operations", id: o.id, valeur: o }) as Changement),
    ...supprimer("operations", remplacees),
  ]);
  return maj.size + remplacees.length;
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
