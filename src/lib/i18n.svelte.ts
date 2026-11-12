// Langue de l'interface (français ou anglais). Le texte français sert de clé : t("Accueil") rend « Home » en anglais.
// Les valeurs variables se placent avec {0}, {1}… : t("Catégorie « {0} » supprimée.", nom).
import { EN } from "./i18n-en";

export type Langue = "fr" | "en";
const CLE = "sesame-langue"; // pas une donnée personnelle : gardée hors du coffre pour l'écran de verrouillage

function depart(): Langue {
  try {
    const l = localStorage.getItem(CLE);
    if (l === "fr" || l === "en") return l;
  } catch {
    // stockage indisponible : langue de l'appareil
  }
  if (typeof navigator === "undefined" || import.meta.env?.MODE === "test") return "fr"; // tests : français
  return navigator.language?.toLowerCase().startsWith("fr") ? "fr" : "en";
}

export const langue = $state({ code: depart() as Langue });

export function changerLangue(l: Langue) {
  langue.code = l;
  if (typeof document !== "undefined") document.documentElement.lang = l;
  try {
    localStorage.setItem(CLE, l);
  } catch {
    // sans stockage, la langue vaut pour cette session
  }
}
if (typeof document !== "undefined") document.documentElement.lang = langue.code;

export function t(fr: string, ...vars: unknown[]): string {
  const s = langue.code === "en" ? (EN[fr] ?? fr) : fr;
  return vars.length ? s.replace(/\{(\d+)\}/g, (_, i) => String(vars[Number(i)] ?? "")) : s;
}

/** Locale pour les nombres et les dates */
export const locale = () => (langue.code === "en" ? "en-GB" : "fr-FR");
