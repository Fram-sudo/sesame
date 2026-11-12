import { locale } from "./i18n.svelte";

const formats = new Map<string, Intl.NumberFormat>();

/** Centimes → « 1 234,56 € » (XOF sans décimales). */
export function argent(cts: number, devise: string, signe = false): string {
  const cle = locale() + devise + signe;
  if (!formats.has(cle)) formats.set(cle, new Intl.NumberFormat(locale(), { style: "currency", currency: devise, signDisplay: signe ? "exceptZero" : "auto" }));
  // Espace insécable normale (et non l'espace fine de l'usage français, trop étroite dans la police) :
  // les milliers et les millions se repèrent d'un coup d'œil (« 1 453 543 F CFA »)
  return formats.get(cle)!.format(cts / 100).replace(/ /g, " ");
}

// Dates dans la langue choisie
export const dateLongue = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString(locale(), { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
export const dateCourte = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString(locale(), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
