// Formats bancaires structurés : OFX/QFX (Money, Quicken), QIF et CAMT.053/054 (norme ISO 20022, XML).
// Chacun est ramené au même tableau que les CSV (Date, Libellé, Détail, Montant, État), puis passe dans
// le moteur habituel. Pas de lecteur XML : de simples expressions suffisent pour ces balises fixes.

export interface Structure {
  format: "OFX" | "QIF" | "CAMT";
  lignes: string[][];
  /** Texte qui décrit le relevé (nom de la banque…), pour la reconnaître */
  texte: string;
  devise?: string;
  /** Identifie le compte (numéro, IBAN) pour retrouver le bon compte à l'import suivant */
  empreinte?: string;
}

const ENTETE = ["Date", "Libellé", "Détail", "Montant", "État"];

const ENTITES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decoder = (s: string) =>
  s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e: string) => (e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ENTITES[e.toLowerCase()] ?? m))).replace(/\s+/g, " ").trim();
const iso = (d: string) => (/^\d{8}/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : d.slice(0, 10));

/** OFX 1 (SGML, balises sans fermeture) et OFX 2 (XML). */
function ofx(t: string): Structure | null {
  if (!/<OFX>/i.test(t) || !/<STMTTRN>/i.test(t)) return null;
  const champ = (bloc: string, nom: string) => {
    const m = new RegExp(`<${nom}>([^<\\r\\n]*)`, "i").exec(bloc);
    return m ? decoder(m[1]) : "";
  };
  const lignes = [ENTETE];
  for (const m of t.matchAll(/<STMTTRN>([\s\S]*?)(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>|$)/gi)) {
    const b = m[1];
    const nom = champ(b, "NAME") || champ(b, "PAYEE");
    const memo = champ(b, "MEMO");
    lignes.push([iso(champ(b, "DTPOSTED")), nom || memo, nom && memo !== nom ? memo : "", champ(b, "TRNAMT"), ""]);
  }
  const compte = champ(t, "ACCTID");
  return { format: "OFX", lignes, texte: [champ(t, "ORG"), champ(t, "BANKID")].filter(Boolean).join("\n"), devise: champ(t, "CURDEF") || undefined, empreinte: compte ? `ofx|${compte}` : undefined };
}

/** QIF : une opération par bloc terminé par « ^ » ; D = date, T/U = montant, P = tiers, M = note. */
function qif(t: string): Structure | null {
  if (!/^\s*!(Type|Account|Option)/im.test(t)) return null;
  const lignes = [ENTETE];
  for (const bloc of t.split(/^\^\s*$/m)) {
    const c: Record<string, string> = {};
    for (const l of bloc.split(/\r?\n/)) if (l && !l.startsWith("!") && !(l[0] in c)) c[l[0]] = l.slice(1).trim();
    if (!c.D || !(c.T ?? c.U)) continue;
    // Dates QIF : « 1/31'26 » ou « 31/01/2026 » ; l'apostrophe sépare l'année
    const date = c.D.replace(/'\s*/, "/").replace(/\s+/g, "");
    lignes.push([date, c.P || c.M || "", c.P && c.M ? c.M : "", c.T ?? c.U, ""]);
  }
  return { format: "QIF", lignes, texte: "" };
}

/** CAMT.053 (relevé) et CAMT.054 (avis) : chaque <Ntry> est une opération. */
function camt(t: string): Structure | null {
  if (!/<(\w+:)?Ntry>/.test(t) || !/camt\.05[234]/i.test(t)) return null;
  const tous = (bloc: string, nom: string) => [...bloc.matchAll(new RegExp(`<(?:\\w+:)?${nom}(?:\\s[^>]*)?>([^<]*)</(?:\\w+:)?${nom}>`, "g"))].map((m) => decoder(m[1])).filter(Boolean);
  const un = (bloc: string, nom: string) => tous(bloc, nom)[0] ?? "";
  const sous = (bloc: string, nom: string) => new RegExp(`<(?:\\w+:)?${nom}>([\\s\\S]*?)</(?:\\w+:)?${nom}>`).exec(bloc)?.[1] ?? "";
  const lignes = [ENTETE];
  for (const m of t.matchAll(/<(?:\w+:)?Ntry>([\s\S]*?)<\/(?:\w+:)?Ntry>/g)) {
    const b = m[1];
    const montant = un(b, "Amt").replace(",", ".");
    const signe = un(b, "CdtDbtInd").toUpperCase() === "DBIT" ? "-" : "";
    const date = un(sous(b, "BookgDt"), "Dt") || un(sous(b, "BookgDt"), "DtTm") || un(sous(b, "ValDt"), "Dt");
    // Libellé : le tiers (créancier si on paie, débiteur si on reçoit), sinon le motif
    const tiers = un(sous(sous(b, "RltdPties"), signe ? "Cdtr" : "Dbtr"), "Nm");
    const motif = [...tous(b, "Ustrd"), ...tous(b, "AddtlNtryInf")].join(" ");
    const statut = un(b, "Sts") || un(sous(b, "Sts"), "Cd");
    lignes.push([iso(date), tiers || motif, tiers ? motif : "", signe + montant, /pdng|pending/i.test(statut) ? "pending" : ""]);
  }
  const compte = sous(t, "Acct");
  const iban = un(compte, "IBAN") || un(compte, "Id");
  const devise = /<(?:\w+:)?Ccy>([A-Z]{3})</.exec(compte)?.[1] ?? /Ccy="([A-Z]{3})"/.exec(t)?.[1];
  return { format: "CAMT", lignes, texte: [un(sous(t, "Svcr"), "Nm"), un(sous(t, "FinInstnId"), "Nm"), un(t, "BICFI") || un(t, "BIC")].filter(Boolean).join("\n"), devise, empreinte: iban ? `camt|${iban}` : undefined };
}

/** Relevé OFX, QIF ou CAMT reconnu dans le texte du fichier, sinon null. */
export function lireStructure(texte: string): Structure | null {
  return ofx(texte) ?? camt(texte) ?? qif(texte);
}
