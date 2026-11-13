// Programme les alertes d'après les données ouvertes. Voir alertes.ts.
// Téléphone : programmées dans Android, elles arrivent même appli fermée. PC : affichées tant que Sésame reste ouvert.
import { alertesAPlanifier, REGLAGES_DEFAUT, type Situation } from "./alertes";
import { estAndroid } from "./api";
import { donnees } from "./donnees.svelte";
import { app, deviseAffichee, sauverParametres } from "./etat.svelte";
import { argent } from "./format";
import { locale, t } from "./i18n.svelte";
import { prevoir } from "./prevision";
import { bornes, etatBudgets, type Contexte } from "./stats";
import { tauxConnus } from "./taux";

const JOUR = 86_400_000;

/** Autorisation d'afficher des notifications (Android 13+ la demande une fois). */
export async function autoriser(): Promise<boolean> {
  const n = await import("@tauri-apps/plugin-notification");
  return (await n.isPermissionGranted()) || (await n.requestPermission()) === "granted";
}

let minuteursPC: ReturnType<typeof setTimeout>[] = [];

export async function programmerAlertes() {
  if (app.ecran !== "app") return;
  try {
    const n = await import("@tauri-apps/plugin-notification");
    const r = { ...REGLAGES_DEFAUT, ...app.params.alertes };
    const maintenant = Date.now();
    const auj = new Date().toISOString().slice(0, 10);
    const devise = deviseAffichee();
    const ctx: Contexte = { ops: donnees.operations, comptes: donnees.comptes, categories: donnees.categories, taux: tauxConnus(app.params.taux, app.params.tauxManuels), devise };
    const reels = donnees.operations.some((o) => !o.demo);
    const s: Situation = { maintenant, derniereSauvegarde: app.params.derniereSauvegarde, rappelSauvegardeApres: app.params.rappelSauvegardeApres };
    if (reels) {
      const p = prevoir({ ...ctx, ops: donnees.operations }, "", auj);
      if (p.sousSeuil) s.decouvert = { date: p.sousSeuil, plusBas: argent(p.plusBas.solde, devise) };
      const d = new Date();
      const b = etatBudgets(ctx, "", bornes({ mode: "mois", a: d.getFullYear(), m: d.getMonth(), de: "", fin: "" }), donnees.budgets)
        .filter((x) => x.frequence === "mois" && x.budget > 0)
        .sort((x, y) => y.depense / y.budget - x.depense / x.budget)[0];
      if (b) {
        const nom = b.id === "global" ? t("Plafond global") : (donnees.categories.find((c) => c.id === b.id)?.nom ?? "");
        s.budget = { cle: `${auj.slice(0, 7)}|${b.id}`, nom, depense: argent(b.depense, devise), plafond: argent(b.budget, devise), part: b.depense / b.budget };
      }
      // Bilan du mois en cours, annoncé le 1er du mois prochain à 9 h
      const d1 = new Date(d.getFullYear(), d.getMonth() + 1, 1, 9);
      s.bilan = { cle: auj.slice(0, 7), mois: d.toLocaleDateString(locale(), { month: "long" }), quand: d1.getTime() };
      const quand = donnees.imports.map((i) => i.quand);
      if (quand.length) (s.dernierImport = Math.max(...quand)), (s.premierImport = Math.min(...quand));
    }
    const vues = app.params.alertesVues ?? {};
    const alertes = alertesAPlanifier(s, r, vues, t);
    // Première alerte à programmer : on demande l'autorisation, une seule fois
    if (alertes.length && !(await n.isPermissionGranted())) {
      if (app.params.alertesDemandees) return;
      app.params.alertesDemandees = true;
      await sauverParametres();
      if (!(await autoriser())) return;
    }
    const garder = Object.entries(vues).filter(([, q]) => q > maintenant - 60 * JOUR);
    if (!estAndroid) {
      // PC : pas de programmation possible appli fermée ; une alerte n'est retenue qu'une fois affichée
      minuteursPC.forEach(clearTimeout);
      minuteursPC = alertes
        .filter((a) => a.quand - maintenant < JOUR)
        .map((a) =>
          setTimeout(async () => {
            n.sendNotification({ title: "Sésame", body: a.texte });
            app.params.alertesVues = { ...app.params.alertesVues, [a.cle]: a.quand };
            await sauverParametres();
          }, Math.max(0, a.quand - Date.now())),
        );
      return;
    }
    await n.cancel([1, 2, 3, 4, 5]);
    for (const a of alertes) n.sendNotification({ id: a.id, title: "Sésame", body: a.texte, schedule: n.Schedule.at(new Date(a.quand), false, true) });
    // Mémoire des alertes programmées (deux mois), pour ne pas répéter celles déjà passées
    app.params.alertesVues = Object.fromEntries([...garder, ...alertes.map((a) => [a.cle, a.quand] as [string, number])]);
    await sauverParametres();
  } catch {
    // Pas de notification possible : l'appli fonctionne normalement
  }
}
