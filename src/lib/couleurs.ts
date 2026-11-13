// Couleur de chaque compte : choisie dans sa fiche, sinon une couleur proche de sa banque, sinon la première couleur
// de la palette encore libre. La même partout (carte de l'accueil, menu, graphiques).
// Pas de vert vif, d'orange ni de rouge : ils disent déjà revenus, dépenses et « dans le rouge ».
import { donnees } from "./donnees.svelte";

export const PALETTE_COMPTES = ["#1F63B0", "#5A50C8", "#A63E6A", "#93600F", "#11735C", "#3F3699", "#2D7FA6", "#5F5E5A"];

type C = { id: string; couleur?: string; banque?: string; nom?: string; forme?: string; parentId?: string };

function preferee(c: C): string | undefined {
  const b = `${c.banque ?? ""} ${c.nom ?? ""}`.toLowerCase();
  if (/soci[eé]t[eé] g[eé]n[eé]rale|\bsg\b/.test(b)) return PALETTE_COMPTES[0];
  if (/revolut/.test(b)) return PALETTE_COMPTES[1];
  if (/bourso/.test(b)) return PALETTE_COMPTES[2];
  if (c.forme === "especes") return PALETTE_COMPTES[3];
}

/** Couleurs de tous les comptes principaux : sans doublon tant que la palette suffit */
export function couleursDe(comptes: C[]): Map<string, string> {
  const res = new Map<string, string>();
  const principaux = comptes.filter((c) => !c.parentId);
  for (const c of principaux) if (c.couleur) res.set(c.id, c.couleur);
  const prises = () => new Set(res.values());
  for (const c of principaux) {
    const p = preferee(c);
    if (!res.has(c.id) && p && !prises().has(p)) res.set(c.id, p);
  }
  for (const [k, c] of principaux.entries()) {
    if (res.has(c.id)) continue;
    const libre = PALETTE_COMPTES.find((x) => !prises().has(x));
    res.set(c.id, libre ?? PALETTE_COMPTES[k % PALETTE_COMPTES.length]);
  }
  return res;
}

/** Couleur d'un compte (un compte pas encore enregistré prend la couleur qu'il aurait une fois créé) */
export function couleurCompte(c: C): string {
  const tous = donnees.comptes.some((x) => x.id === c.id) ? donnees.comptes : [...donnees.comptes, c];
  return couleursDe(tous).get(c.id) ?? PALETTE_COMPTES[0];
}
