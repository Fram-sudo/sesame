import { describe, expect, it } from "vitest";
import { couleursDe, PALETTE_COMPTES } from "./couleurs";

describe("couleurs des comptes", () => {
  it("couleur choisie d'abord, puis celle de la banque, puis une couleur libre : jamais deux fois la même", () => {
    const m = couleursDe([
      { id: "sg", banque: "Société Générale", nom: "SG" },
      { id: "rev", banque: "Revolut", nom: "Revolut" },
      { id: "a", nom: "Compte Dakar" },
      { id: "b", nom: "Tirelire", forme: "especes" },
      { id: "c", nom: "Livret A" },
      { id: "choisi", nom: "Perso", couleur: "#123456" },
      { id: "poche", nom: "Poche", parentId: "rev" },
    ]);
    expect(m.get("sg")).toBe(PALETTE_COMPTES[0]);
    expect(m.get("rev")).toBe(PALETTE_COMPTES[1]);
    expect(m.get("choisi")).toBe("#123456");
    expect(m.has("poche")).toBe(false);
    const valeurs = [...m.values()];
    expect(new Set(valeurs).size).toBe(valeurs.length);
  });
});
