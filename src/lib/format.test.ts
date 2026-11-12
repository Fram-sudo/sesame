import { describe, expect, it } from "vitest";
import { argent } from "./format";

describe("montants", () => {
  it("sépare nettement les milliers et les millions", () => {
    expect(argent(145354300, "XOF")).toBe("1 453 543 F CFA");
    expect(argent(285956, "EUR")).toBe("2 859,56 €");
    expect(argent(-1999, "EUR", true)).toBe("-19,99 €");
  });
});
