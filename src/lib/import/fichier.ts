import { t } from "../i18n.svelte";
// Préparation d'un relevé avant import : lecture (PDF, tableur, CSV), colonnes devinées,
// banque reconnue et compte de destination choisi automatiquement.
import type { Releve } from "../api";
import { completerParContenu, detecterEntete, detecterFormatDate, devinerColonnes, enteteDe, formatNonGere, lire, normaliser, reconnaitreBanque, sensInverse, type Profil } from "./analyse";
import { lireCsv } from "./csv";
import { lireStructure, type Structure } from "./formats";

export interface Preparation {
  nom: string;
  lignes: string[][];
  idx: number;
  profil: Profil;
  /** Profil deviné (à mémoriser) plutôt que retrouvé */
  profilNouveau: boolean;
  estPdf: boolean;
  sections: { nom: string; nb: number }[];
  choisies: string[];
  enAttente: string[];
  /** Tableaux de poches : chaque poche devient un sous-compte du compte principal */
  poches: string[];
  /** Ce qui identifie ce relevé pour retrouver son compte : titres des colonnes (CSV) ou 1re ligne du document (PDF) */
  empreinte: string;
  banque?: string;
  devise?: string;
}

// Nom de la banque cherché dans l'en-tête du document ; la mention la plus haute l'emporte
// (un relevé Société Générale peut contenir « VIR VERS REVOLUT » plus bas).
const BANQUES_TEXTE: [string, RegExp][] = [
  ["Revolut", /revolut/i],
  ["Société Générale", /soci[eé]t[eé] g[eé]n[eé]rale/i],
  ["Boursobank", /boursobank|boursorama/i],
  ["BNP Paribas", /bnp paribas/i],
  ["Crédit Agricole", /cr[eé]dit agricole/i],
  ["LCL", /\bLCL\b|cr[eé]dit lyonnais/i],
  ["Caisse d'Épargne", /caisse d.[eé]pargne/i],
  ["Banque Populaire", /banque populaire/i],
  ["La Banque Postale", /banque postale/i],
  ["Crédit Mutuel", /cr[eé]dit mutuel/i],
  ["CIC", /\bCIC\b/],
  ["HSBC", /\bHSBC\b/],
  ["Fortuneo", /fortuneo/i],
  ["Hello bank!", /hello ?bank/i],
  ["N26", /\bN26\b/],
  ["Wise", /\bwise\b/i],
  ["Nickel", /\bcompte[- ]nickel\b/i],
  ["Qonto", /qonto/i],
  ["Monabanq", /monabanq/i],
  ["BforBank", /bforbank/i],
  ["Ecobank", /ecobank/i],
  ["Orabank", /orabank/i],
];

export function banqueDansTexte(texte: string): string | undefined {
  let meilleur: [string, number] | undefined;
  for (const [nom, re] of BANQUES_TEXTE) {
    const i = texte.search(re);
    if (i >= 0 && (!meilleur || i < meilleur[1])) meilleur = [nom, i];
  }
  return meilleur?.[0];
}

export function deviseDansTexte(texte: string): string | undefined {
  // « EUR Statement » (anglais) ou « Relevé EUR » (français)
  const m = /\b(EUR|USD|CAD|XOF)\b\s+(statement|relev)/i.exec(texte) ?? /\b(?:statement|relev[ée])\s+(?:en\s+)?(EUR|USD|CAD|XOF)\b/i.exec(texte);
  return m?.[1].toUpperCase();
}

/** Colonnes et format de date devinés pour une ligne de titres donnée. */
export function deviner(lignes: string[][], idx: number, base: Profil): Profil {
  const entete = enteteDe(lignes, idx);
  // Les titres donnent un premier avis ; le contenu des colonnes complète et corrige (toutes langues)
  const colonnes = completerParContenu(lignes, idx, entete, devinerColonnes(entete));
  const k = entete.indexOf(colonnes.date ?? "");
  const p: Profil = { ...base, entete, colonnes, formatDate: detecterFormatDate(lignes.slice(idx + 1, idx + 200).map((l) => l[k] ?? "")) };
  delete p.inverser;
  // Dépenses écrites en positif dans ce format ? Le solde du relevé le révèle
  if (sensInverse(lire(lignes.slice(0, idx + 401), idx, { ...p, colonnes: { ...colonnes, devise: undefined } }, "").ops)) p.inverser = true;
  return p;
}

export async function preparer(r: Releve, profils: Profil[]): Promise<Preparation> {
  if (r.erreur) throw r.erreur;
  let lignes: string[][];
  let texte: string;
  let estPdf = false;
  let sections: Preparation["sections"] = [];
  let choisies: string[] = [];
  let enAttente: string[] = [];
  let poches: string[] = [];
  let structure: Structure | null = null;
  if (r.pdf) {
    const pdf = await import("./pdf");
    ({ lignes, texte } = await pdf.lirePdf(Uint8Array.from(atob(r.pdf), (c) => c.charCodeAt(0))));
    estPdf = true;
    const i = lignes[0]?.indexOf("Section") ?? -1;
    if (i >= 0) {
      const nb = new Map<string, number>();
      for (const x of lignes.slice(1)) nb.set(x[i], (nb.get(x[i]) ?? 0) + 1);
      sections = [...nb].map(([nom, n]) => ({ nom, nb: n }));
      // Par défaut : le premier tableau d'opérations abouties (le compte principal) et les opérations en attente
      enAttente = sections.filter((x) => pdf.sectionEnAttente(x.nom)).map((x) => x.nom);
      poches = sections.filter((x) => pdf.sectionPoches(x.nom)).map((x) => x.nom);
      const premier = sections.find((x) => !pdf.sectionExclue(x.nom) && !poches.includes(x.nom));
      choisies = [...(premier ? [premier.nom] : []), ...enAttente, ...poches];
    }
  } else if (r.lignes) {
    lignes = r.lignes.map((x) => x.map((c) => c.trim())).filter((x) => x.some((c) => c));
    texte = "";
  } else if ((structure = lireStructure(r.texte ?? ""))) {
    // OFX, QIF, CAMT : déjà ramenés à un tableau Date / Libellé / Détail / Montant / État
    ({ lignes, texte } = structure);
  } else {
    const pb = formatNonGere(r.texte ?? "");
    if (pb) throw t(pb);
    lignes = lireCsv(r.texte ?? "");
    texte = "";
  }
  if (lignes.length < 2) throw t("Aucune opération trouvée dans ce fichier.");

  const idx = detecterEntete(lignes);
  const entete = enteteDe(lignes, idx);
  // CSV et tableurs : seules les lignes avant les titres décrivent le relevé (le reste, ce sont des libellés)
  if (!estPdf && !structure) texte = lignes.slice(0, Math.max(idx, 0)).map((l) => l.join(" ")).join("\n");
  const empreinte = structure?.empreinte ?? (estPdf ? (texte.split("\n").find((l) => l.trim().length >= 4 && !/\d/.test(l))?.trim() ?? "") : entete.join("|"));
  const banqueTexte = banqueDansTexte(texte);
  // Format déjà vu et validé : CSV/tableur par ses titres, PDF par sa banque, son en-tête et ses colonnes
  const cle = structure ? structure.format : estPdf ? `pdf|${banqueTexte ?? ""}|${empreinte}|${entete.join("|")}` : entete.join("|");
  const connu = profils.find((p) => (p.cle ?? p.entete.join("|")) === cle);
  const banque = (estPdf ? banqueTexte : (reconnaitreBanque(entete) ?? banqueTexte)) ?? connu?.nom;
  // Copie simple (JSON) : le profil retenu vient des données de l'appli, que structuredClone ne sait pas copier
  const profil = connu ? (JSON.parse(JSON.stringify(connu)) as Profil) : deviner(lignes, idx, { id: crypto.randomUUID(), nom: banque ?? "", entete: [], colonnes: {}, formatDate: "JJ/MM/AAAA", cle });
  return { nom: r.nom, lignes, idx, profil, profilNouveau: !connu, estPdf, sections, choisies, enAttente, poches, empreinte, banque, devise: structure?.devise ?? deviseDansTexte(texte) };
}

interface CompteRef {
  id: string;
  banque: string;
  devise: string;
  empreinte?: string;
}

/**
 * Compte de destination : celui déjà associé à ce type de relevé, sinon celui de la même banque
 * (et même devise), sinon le dernier utilisé parmi plusieurs. "" = créer un nouveau compte.
 */
export function choisirCompte(p: Preparation, comptes: CompteRef[], imports: { compteId: string; comptes?: string[]; quand: number }[]): string {
  const dernier = (ids: string[]) =>
    ids.length < 2 ? (ids[0] ?? "") : ([...imports].sort((a, b) => b.quand - a.quand).map((i) => (i.comptes ?? [i.compteId]).find((id) => ids.includes(id))).find(Boolean) ?? ids[0]);
  const parEmpreinte = comptes.filter((c) => c.empreinte && (p.estPdf ? p.empreinte === c.empreinte : c.empreinte === p.empreinte));
  if (parEmpreinte.length) return dernier(parEmpreinte.map((c) => c.id));
  if (!p.banque) return "";
  const b = normaliser(p.banque);
  const memeBanque = comptes.filter((c) => normaliser(c.banque) === b && (!p.devise || c.devise === p.devise));
  return dernier(memeBanque.map((c) => c.id));
}
