import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { devinerIcone, TOUTES_ICONES } from "./icones";

describe("icônes de catégorie", () => {
  it("devine l'icône d'après le nom, en français ou en anglais", () => {
    expect(devinerIcone("Pâtisseries")).toBe("bread");
    expect(devinerIcone("Essence")).toBe("gas-station");
    expect(devinerIcone("Groceries")).toBe("shopping-cart");
    expect(devinerIcone("Abonnement Netflix")).toBe("device-tv");
    expect(devinerIcone("Salle de sport")).toBe("barbell");
    expect(devinerIcone("Vétérinaire du chat")).toBe("paw");
    expect(devinerIcone("Truc bizarre")).toBeUndefined();
  });
  it("toutes les icônes de la banque existent", () => {
    for (const n of TOUTES_ICONES) expect(existsSync(`node_modules/@tabler/icons/icons/outline/${n}.svg`), n).toBe(true);
  });
});
