import { describe, expect, it } from "vitest";
import { lireBce, tauxConnus } from "./taux";

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope><Cube><Cube time='2026-11-11'>
<Cube currency='USD' rate='1.0812'/><Cube currency='CAD' rate='1.5123'/>
</Cube></Cube></gesmes:Envelope>`;

describe("taux de change", () => {
  it("lit le fichier de la BCE", () => {
    expect(lireBce(XML, "2026-11-12")).toEqual({ date: "2026-11-11", chargeLe: "2026-11-12", valeurs: { USD: 1.0812, CAD: 1.5123 } });
    expect(lireBce("<html>erreur</html>", "2026-11-12")).toBeNull();
  });
  it("franc CFA toujours connu, même sans BCE", () => {
    expect(tauxConnus()).toEqual({ EUR: 1, XOF: 655.957, XAF: 655.957 });
    // Taux saisi à la main pour une devise que la BCE ne suit pas ; celui de la BCE l'emporte s'il existe
    expect(tauxConnus(lireBce(XML, "x")!, { MAD: 10.9, USD: 2 })).toMatchObject({ MAD: 10.9, USD: 1.0812 });
    expect(tauxConnus(lireBce(XML, "x")!).USD).toBe(1.0812);
  });
});
