import { describe, expect, it } from "vitest";
import { etiquettesAxe } from "./lissage";

describe("étiquettes d'axe", () => {
  it("jamais deux étiquettes qui se touchent, la dernière toujours là, rien qui dépasse", () => {
    for (const largeur of [280, 400, 900]) {
      const n = 84;
      const xs = Array.from({ length: n }, (_, i) => 10 + ((largeur - 20) * i) / (n - 1));
      const textes = xs.map((_, i) => ["janv. 20", "févr. 20", "sept. 26"][i % 3]);
      const e = etiquettesAxe(xs, textes, largeur);
      expect(e.has(n - 1)).toBe(true);
      const boites = [...e].map(([i, a]) => {
        const w = textes[i].length * 6.6;
        const g = a === "start" ? xs[i] : a === "end" ? xs[i] - w : xs[i] - w / 2;
        return [g, g + w];
      });
      for (const [g, d] of boites) (expect(g).toBeGreaterThanOrEqual(0), expect(d).toBeLessThanOrEqual(largeur + 0.01));
      for (let k = 1; k < boites.length; k++) expect(boites[k][0]).toBeGreaterThanOrEqual(boites[k - 1][1]);
    }
  });
  it("seulement parmi les candidats (débuts d'année)", () => {
    const xs = [0, 50, 100, 150, 200];
    const e = etiquettesAxe(xs, ["2020", "x", "2021", "x", "2022"], 210, [0, 2, 4]);
    expect([...e.keys()]).toEqual([0, 2, 4]);
  });
});
