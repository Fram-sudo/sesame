<script lang="ts">
  // Bilan d'un mois écoulé : revenus, dépenses, reste, plus grosses dépenses, budgets dépassés et une bonne nouvelle.
  // Sur l'accueil les premiers jours du mois (refermable) ; toujours visible dans Analyse.
  import { libelleLisible, VIREMENT } from "./categories";
  import { donnees } from "./donnees.svelte";
  import { app, deviseAffichee } from "./etat.svelte";
  import { argent } from "./format";
  import { locale, t } from "./i18n.svelte";
  import { bornes, cleMois, etatBudgets, flux, moyenne, type Contexte, type Mois } from "./stats";
  import { tauxConnus } from "./taux";

  let { mois, fermer }: { mois: Mois; fermer?: () => void } = $props();
  const devise = $derived(deviseAffichee());
  const ctx: Contexte = $derived({ ops: donnees.operations, comptes: donnees.comptes, categories: donnees.categories, taux: tauxConnus(app.params.taux, app.params.tauxManuels), devise });
  const f = $derived(flux(ctx, "", [cleMois(mois)]));
  const moy = $derived(moyenne(ctx, "", mois));
  const nom = $derived(new Date(mois.a, mois.m, 1).toLocaleDateString(locale(), { month: "long", year: "numeric" }));
  const reste = $derived(f.revenus - f.depenses);
  const ecart = $derived(moy.depenses ? Math.round(((f.depenses - moy.depenses) / moy.depenses) * 100) : undefined);
  const nomCat = (id: string) => donnees.categories.find((c) => c.id === id)?.nom ?? t("Sans catégorie");
  // Plus grosses dépenses du mois (hors virements entre vos comptes)
  const grosses = $derived(
    donnees.operations
      .filter((o) => o.date.startsWith(cleMois(mois)) && o.montant < 0 && !o.virementId && o.categorieId !== VIREMENT)
      .sort((a, b) => a.montant - b.montant)
      .slice(0, 3),
  );
  const depasses = $derived(
    etatBudgets(ctx, "", bornes({ mode: "mois", a: mois.a, m: mois.m, de: "", fin: "" }), donnees.budgets).filter((x) => x.frequence === "mois" && x.budget > 0 && x.depense > x.budget),
  );
  // Bonne nouvelle : la catégorie qui a le plus baissé par rapport à d'habitude (au moins 10 % et 5 €)
  const bonne = $derived.by(() => {
    let mieux: { id: string; baisse: number } | undefined;
    for (const [id, m] of moy.parCategorie) {
      if (!id || m <= 0) continue;
      const v = f.parCategorie.get(id) ?? 0;
      const baisse = (m - v) / m;
      if (m - v >= 500 && baisse >= 0.1 && (!mieux || baisse > mieux.baisse)) mieux = { id, baisse };
    }
    return mieux;
  });
</script>

<section class="carte pile bilan">
  <div class="titre">
    <h2>{t("Votre bilan de {0}", nom)}</h2>
    {#if fermer}<button class="lien" onclick={fermer}>{t("Fermer")}</button>{/if}
  </div>
  <div class="trois">
    <div><p class="sous">{t("Revenus")}</p><p class="montant chiffre">{argent(f.revenus, devise, true)}</p></div>
    <div>
      <p class="sous">{t("Dépenses")}</p><p class="montant chiffre">{argent(f.depenses, devise)}</p>
      {#if ecart !== undefined}<p class="sous">{ecart > 0 ? "+" : "−"}{Math.abs(ecart)} {t("% vs d'habitude")}</p>{/if}
    </div>
    <div><p class="sous">{t("Reste")}</p><p class="montant chiffre" class:positif={reste >= 0} class:negatif={reste < 0}>{argent(reste, devise, true)}</p></div>
  </div>
  <div class="trois">
    {#if grosses.length}
      <div>
        <p class="sous"><strong>{t("Plus grosses dépenses")}</strong></p>
        {#each grosses as o (o.id)}<p class="sous">{libelleLisible(o.libelle)} · <span class="montant">{argent(-o.montant, donnees.comptes.find((c) => c.id === o.compteId)?.devise ?? "EUR")}</span></p>{/each}
      </div>
    {/if}
    <div>
      <p class="sous"><strong>{t("Budgets dépassés")}</strong></p>
      {#each depasses as x (x.id)}<p class="sous">{x.id === "global" ? t("Plafond global") : nomCat(x.id)} (+<span class="montant">{argent(x.depense - x.budget, devise)}</span>)</p>{:else}<p class="sous">{t("Aucun : bravo !")}</p>{/each}
    </div>
    {#if bonne}
      <div>
        <p class="sous"><strong>{t("Bonne nouvelle")}</strong></p>
        <p class="sous">{t("{0} : −{1} % par rapport à d'habitude", nomCat(bonne.id), Math.round(bonne.baisse * 100))}</p>
      </div>
    {/if}
  </div>
</section>

<style>
  .titre {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .trois {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 10px 14px;
  }
  .trois p {
    margin: 0;
  }
  .chiffre {
    font-size: 22px;
    font-weight: 800;
  }
  .positif {
    color: var(--ok);
  }
  .negatif {
    color: var(--danger);
  }
</style>
