// Toutes les devises du monde : noms et symboles fournis par le navigateur (Intl), dans la langue de l'appli.
import { locale, t } from "./i18n.svelte";

// Au cas où le navigateur ne fournit pas la liste : les devises suivies par la BCE, plus les francs CFA
const SECOURS = "EUR XOF XAF USD CAD GBP CHF JPY CNY AUD NZD SEK NOK DKK PLN CZK HUF RON BGN TRY ILS INR IDR KRW MXN BRL ZAR SGD HKD THB PHP MYR ISK".split(" ");

/** Codes de toutes les devises connues (ISO 4217). */
export function toutesDevises(): string[] {
  try {
    const l = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("currency");
    if (l?.length) return l;
  } catch {
    // liste de secours
  }
  return SECOURS;
}

/** « Livre sterling », « franc CFA (BCEAO) »… dans la langue de l'appli ; le code s'il est inconnu. */
export function nomDevise(code: string): string {
  try {
    const n = new Intl.DisplayNames([locale()], { type: "currency" }).of(code);
    return n ? n.charAt(0).toUpperCase() + n.slice(1) : code;
  } catch {
    return code;
  }
}

/** Symbole court (€, $, £, F CFA…) pour les champs de saisie et les mentions. */
export function symboleDevise(code: string): string {
  if (code === "XOF" || code === "XAF") return "F CFA";
  try {
    return new Intl.NumberFormat(locale(), { style: "currency", currency: code, currencyDisplay: "narrowSymbol" }).formatToParts(0).find((p) => p.type === "currency")?.value ?? code;
  } catch {
    return code;
  }
}

/** Options d'une liste de choix : vos devises d'abord (celles de vos comptes, et l'euro), puis toutes les autres. */
export function optionsDevises(utilisees: string[]) {
  const vos = [...new Set(["EUR", ...utilisees])];
  const libelle = (d: string) => `${nomDevise(d)} (${d})`;
  const autres = toutesDevises().filter((d) => !vos.includes(d)).map((d) => ({ v: d, l: libelle(d), groupe: t("Toutes les devises") }));
  autres.sort((a, b) => a.l.localeCompare(b.l, locale()));
  return [...vos.map((d) => ({ v: d, l: libelle(d), groupe: t("Vos devises") })), ...autres];
}
