import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { EN, IDENTIQUES } from "./i18n-en";

// Tous les textes passés à t("…") dans l'interface doivent avoir leur traduction anglaise
function fichiers(dossier: string): string[] {
  return readdirSync(dossier).flatMap((n) => {
    const p = join(dossier, n);
    if (statSync(p).isDirectory()) return fichiers(p);
    return /\.(svelte|ts)$/.test(n) && !n.endsWith(".test.ts") ? [p] : [];
  });
}

describe("traduction anglaise", () => {
  it("aucun texte de l'interface n'est oublié", () => {
    const manquants: string[] = [];
    for (const f of fichiers("src")) {
      for (const m of readFileSync(f, "utf8").matchAll(/\b(?:t|tr)\(\s*"((?:[^"\\]|\\.)*)"/g)) {
        const cle = JSON.parse(`"${m[1]}"`) as string;
        if (!(cle in EN) && !IDENTIQUES.has(cle)) manquants.push(`${cle}  (${f})`);
      }
    }
    expect(manquants).toEqual([]);
  });
  it("la première valeur {0} est toujours reprise en anglais", () => {
    const oublis = Object.entries(EN).filter(([fr, en]) => fr.includes("{0}") && !en.includes("{0}"));
    expect(oublis).toEqual([]);
  });
});
