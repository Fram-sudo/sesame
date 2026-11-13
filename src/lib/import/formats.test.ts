// Relevés inventés aux formats OFX, QIF et CAMT : mêmes opérations attendues qu'avec un CSV.
import { describe, expect, it } from "vitest";
import { lire } from "./analyse";
import { preparer } from "./fichier";

const releve = (texte: string, nom: string) => ({ nom, lignes: null, texte, pdf: null, erreur: null });
const lues = async (texte: string, nom: string) => {
  const p = await preparer(releve(texte, nom), []);
  const r = lire(p.lignes, p.idx, p.profil, p.devise ?? "EUR");
  return { p, r, ops: r.ops.map((o) => [o.date, o.montant, o.libelle]) };
};
const ATTENDU = [
  ["2026-03-02", -2350, "Supermarché & Co"],
  ["2026-03-05", 180000, "Employeur Fictif"],
];

describe("formats bancaires structurés", () => {
  it("OFX 1 (SGML, sans balises fermantes)", async () => {
    const texte = `OFXHEADER:100
DATA:OFXSGML
<OFX><SIGNONMSGSRSV1><SONRS><FI><ORG>SOCIETE GENERALE</FI></SONRS></SIGNONMSGSRSV1>
<BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>EUR
<BANKACCTFROM><BANKID>30003<ACCTID>00012345678<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST><DTSTART>20260301
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260302120000<TRNAMT>-23.50<FITID>A1<NAME>Supermarché &amp; Co<MEMO>CARTE 1234
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260305<TRNAMT>1800.00<FITID>A2<NAME>Employeur Fictif
</BANKTRANLIST><LEDGERBAL><BALAMT>1776.50</LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
    const { p, r, ops } = await lues(texte, "releve.ofx");
    expect(ops).toEqual(ATTENDU);
    expect(r.ops[0].detail).toBe("CARTE 1234");
    expect(p.banque).toBe("Société Générale");
    expect(p.devise).toBe("EUR");
    expect(p.empreinte).toBe("ofx|00012345678");
  });

  it("OFX 2 (XML, balises fermantes, montant à virgule)", async () => {
    const texte = `<?xml version="1.0"?><?OFX OFXHEADER="200"?><OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>EUR</CURDEF><BANKTRANLIST>
<STMTTRN><DTPOSTED>20260302</DTPOSTED><TRNAMT>-23,50</TRNAMT><NAME>Supermarché &amp; Co</NAME></STMTTRN>
<STMTTRN><DTPOSTED>20260305</DTPOSTED><TRNAMT>1800,00</TRNAMT><NAME>Employeur Fictif</NAME></STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
    expect((await lues(texte, "releve.qfx")).ops).toEqual(ATTENDU);
  });

  it("QIF (date à l'apostrophe, tiers et note)", async () => {
    const texte = "!Type:Bank\nD02/03'26\nT-23.50\nPSupermarché & Co\nMCarte 1234\n^\nD05/03/2026\nT1,800.00\nPEmployeur Fictif\n^\n";
    const { r, ops } = await lues(texte, "releve.qif");
    expect(ops).toEqual(ATTENDU);
    expect(r.ops[0].detail).toBe("Carte 1234");
  });

  it("CAMT.053 (ISO 20022) : sens par CdtDbtInd, tiers, opérations en attente écartées", async () => {
    const texte = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02"><BkToCstmrStmt><Stmt>
<Acct><Id><IBAN>FR7600000000000000000000000</IBAN></Id><Ccy>EUR</Ccy><Svcr><FinInstnId><Nm>Boursobank</Nm></FinInstnId></Svcr></Acct>
<Ntry><Amt Ccy="EUR">23.50</Amt><CdtDbtInd>DBIT</CdtDbtInd><Sts>BOOK</Sts><BookgDt><Dt>2026-03-02</Dt></BookgDt>
  <NtryDtls><TxDtls><RltdPties><Cdtr><Nm>Supermarché &amp; Co</Nm></Cdtr></RltdPties><RmtInf><Ustrd>CARTE 1234</Ustrd></RmtInf></TxDtls></NtryDtls></Ntry>
<Ntry><Amt Ccy="EUR">1800.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><Sts>BOOK</Sts><BookgDt><Dt>2026-03-05</Dt></BookgDt>
  <NtryDtls><TxDtls><RltdPties><Dbtr><Nm>Employeur Fictif</Nm></Dbtr></RltdPties></TxDtls></NtryDtls></Ntry>
<Ntry><Amt Ccy="EUR">9.99</Amt><CdtDbtInd>DBIT</CdtDbtInd><Sts>PDNG</Sts><BookgDt><Dt>2026-03-06</Dt></BookgDt><AddtlNtryInf>EN ATTENTE</AddtlNtryInf></Ntry>
</Stmt></BkToCstmrStmt></Document>`;
    const { p, r, ops } = await lues(texte, "releve.xml");
    expect(ops).toEqual(ATTENDU);
    expect(r.nonAbouties).toBe(1);
    expect(p.banque).toBe("Boursobank");
    expect(p.empreinte).toBe("camt|FR7600000000000000000000000");
  });

  it("XML inconnu et MT940 : message clair au lieu d'un import raté", async () => {
    await expect(preparer(releve('<?xml version="1.0"?><autre/>', "x.xml"), [])).rejects.toMatch(/XML/);
    await expect(preparer(releve(":20:STARTUMS\n:25:123\n", "x.sta"), [])).rejects.toMatch(/MT940/);
  });
});
