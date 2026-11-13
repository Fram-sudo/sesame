import { describe, expect, it } from "vitest";
import { aHeure, alertesAPlanifier, REGLAGES_DEFAUT, type Situation } from "./alertes";

const t = (s: string, ...v: (string | number)[]) => s.replace(/\{(\d)\}/g, (_, i) => String(v[+i]));
const JOUR = 86_400_000;
const midi = new Date(2026, 10, 13, 12).getTime(); // 13 novembre 2026, 12 h
const heure = (ms: number) => new Date(ms).getHours();
const jour = (ms: number) => new Date(ms).getDate();

describe("alertes du téléphone", () => {
  it("heure du jour, ou le lendemain si elle est passée", () => {
    expect(jour(aHeure(midi, 9, midi))).toBe(14);
    expect(jour(aHeure(midi, 18, midi))).toBe(13);
  });

  it("découvert : 3 jours avant, à 9 h, sans montant par défaut", () => {
    const s: Situation = { maintenant: midi, decouvert: { date: "2026-11-25", plusBas: "-120,00 €" } };
    const [a] = alertesAPlanifier(s, REGLAGES_DEFAUT, {}, t);
    expect(a.id).toBe(1);
    expect([jour(a.quand), heure(a.quand)]).toEqual([22, 9]);
    expect(a.texte).not.toMatch(/€/);
    const [avec] = alertesAPlanifier(s, { ...REGLAGES_DEFAUT, montants: true }, {}, t);
    expect(avec.texte).toMatch(/25\/11\/2026.*-120,00 €/);
  });

  it("une alerte déjà passée n'est pas renvoyée ; une alerte à venir garde son heure", () => {
    const s: Situation = { maintenant: midi, budget: { cle: "2026-11|cat-x", nom: "Courses", depense: "380 €", plafond: "400 €", part: 0.95 } };
    expect(alertesAPlanifier(s, REGLAGES_DEFAUT, { "budget|2026-11|cat-x": midi - 1000 }, t)).toEqual([]);
    const futur = midi + 5 * JOUR;
    expect(alertesAPlanifier(s, REGLAGES_DEFAUT, { "budget|2026-11|cat-x": futur }, t)[0].quand).toBe(futur);
    expect(alertesAPlanifier({ ...s, budget: { ...s.budget!, part: 0.5 } }, REGLAGES_DEFAUT, {}, t)).toEqual([]);
  });

  it("rappels d'import (14 jours) et de sauvegarde (3 jours après le premier import, puis 30 jours)", () => {
    const s: Situation = { maintenant: midi, dernierImport: midi - 2 * JOUR, premierImport: midi - 2 * JOUR };
    const a = alertesAPlanifier(s, REGLAGES_DEFAUT, {}, t);
    expect(a.map((x) => x.id)).toEqual([3, 4]);
    expect(jour(a[0].quand)).toBe(25);
    expect([jour(a[1].quand), heure(a[1].quand)]).toEqual([14, 18]);
    expect(alertesAPlanifier({ ...s, derniereSauvegarde: midi }, REGLAGES_DEFAUT, {}, t).find((x) => x.id === 4)!.quand).toBeGreaterThan(midi + 29 * JOUR);
    expect(alertesAPlanifier(s, { ...REGLAGES_DEFAUT, import: false, sauvegarde: false }, {}, t)).toEqual([]);
  });
});
