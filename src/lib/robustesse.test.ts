import { describe, expect, it } from "vitest";
import { evaluer } from "./robustesse";

describe("robustesse du mot de passe", () => {
  it("refuse les mots de passe courts ou connus", () => {
    expect(evaluer("").suffisant).toBe(false);
    expect(evaluer("azerty123").suffisant).toBe(false);
    expect(evaluer("Motdepasse2024!").suffisant).toBe(false);
    expect(evaluer("aaaaaaaaaaaaaaaa").suffisant).toBe(false);
    expect(evaluer("1234567890123").suffisant).toBe(false);
  });

  it("accepte une phrase de passe ou un mot de passe varié", () => {
    expect(evaluer("velo rouge sous la pluie").suffisant).toBe(true);
    expect(evaluer("Tg7#qL2!xP9w").suffisant).toBe(true);
  });

  it("monte de niveau avec la longueur", () => {
    expect(evaluer("chat").niveau).toBe(0);
    expect(evaluer("cheval agrafe batterie correcte").niveau).toBe(3);
  });
});
