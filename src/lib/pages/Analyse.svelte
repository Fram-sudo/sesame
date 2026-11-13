<script lang="ts">
  import { t, locale } from "../i18n.svelte";
  import { tauxConnus } from "../taux";
  // Analyse : tendances sur plusieurs mois (solde, revenus et dépenses, moyennes par catégorie).
  import Aide from "../Aide.svelte";
  import FluxCourbes from "../FluxCourbes.svelte";
  import BilanMois from "../BilanMois.svelte";
  import Abonnements from "../Abonnements.svelte";
  import { libelleLisible } from "../categories";
  import Courbe from "../Courbe.svelte";
  import SoldesComptes from "../SoldesComptes.svelte";
  import { couleurCompte } from "../couleurs";
  import { donnees } from "../donnees.svelte";
  import { app, deviseAffichee } from "../etat.svelte";
  import { argent, dateCourte } from "../format";
  import Periode from "../Periode.svelte";
  import { prevoir } from "../prevision";
  import { bornes, cleMois, decaler, derniersMois, finDeMois, flux, moisCourant, moisPasses, perimetre, solde, variation, type Contexte } from "../stats";
  import { premiereDate } from "../donnees.svelte";

  const ctx: Contexte = $derived({ ops: donnees.operations, comptes: donnees.comptes, categories: donnees.categories, taux: tauxConnus(app.params.taux, app.params.tauxManuels), devise: deviseAffichee() });
  const filtre = $derived(app.filtreCompte);
  const p = $derived(perimetre(ctx, filtre));
  const devise = $derived(p.devise);
  const b = $derived(bornes(app.periode, premiereDate()));
  // Un seul mois choisi : on montre les 12 derniers mois pour voir la tendance
  const mois = $derived(b.mois.length > 1 ? moisPasses(b.mois) : derniersMois(b.mois[0], 12));
  const court = (m: { a: number; m: number }) => new Date(m.a, m.m, 1).toLocaleDateString(locale(), mois.length > 12 ? { month: "short", year: "2-digit" } : { month: "short" }).replace(".", "");
  const parMois = $derived(mois.map((m) => ({ m, f: flux(ctx, filtre, [cleMois(m)]) })));

  // Solde de chaque compte (poches comprises) à la fin de chaque mois, dans la devise affichée
  const comptesGraphe = $derived.by(() => {
    const ids = new Set([...p.courants, ...p.epargne, ...p.reserves]);
    return donnees.comptes.filter((c) => ids.has(c.id) && !c.parentId && !c.archive);
  });
  const seriesComptes = $derived(comptesGraphe.map((c) => ({ id: c.id, nom: c.nom, couleur: couleurCompte(c), valeurs: mois.map((m) => solde(ctx, c.id, finDeMois(m))) })));
  const totalSoldes = $derived(mois.map((m) => solde(ctx, filtre, finDeMois(m))));

  // Moyennes mensuelles sur la période (mois sans aucune opération exclus, pour ne pas fausser un historique récent)
  const actifs = $derived(parMois.filter(({ f }) => f.revenus || f.depenses || f.misDeCote));
  const nb = $derived(Math.max(1, actifs.length));
  const moyDepenses = $derived(actifs.reduce((a, { f }) => a + f.depenses, 0) / nb);
  const moyRevenus = $derived(actifs.reduce((a, { f }) => a + f.revenus, 0) / nb);
  const moyEpargne = $derived(actifs.reduce((a, { f }) => a + f.misDeCote - f.pioche, 0) / nb);

  const categories = $derived(new Map(donnees.categories.map((c) => [c.id, c])));
  const parCategorie = $derived.by(() => {
    const total = new Map<string, number>();
    for (const { f } of actifs) for (const [k, v] of f.parCategorie) total.set(k, (total.get(k) ?? 0) + v);
    const ceMois = parMois.at(-1)!.f.parCategorie;
    return [...total]
      .map(([id, v]) => ({ id, nom: categories.get(id)?.nom ?? t("Sans catégorie"), couleur: categories.get(id)?.couleur ?? "var(--pale)", moyenne: v / nb, ceMois: ceMois.get(id) ?? 0 }))
      .filter((x) => x.moyenne > 0)
      .sort((a, b) => b.moyenne - a.moyenne);
  });
  const maxCat = $derived(Math.max(1, ...parCategorie.map((x) => Math.max(x.moyenne, x.ceMois))));

  const prevision = $derived(donnees.operations.length ? prevoir({ ...ctx, ops: donnees.operations }, filtre, new Date().toISOString().slice(0, 10)) : undefined);
  const pointsPrevision = $derived((prevision?.points ?? []).map((x) => ({ libelle: dateCourte(x.date), valeur: x.solde })));

  const grosses = $derived(
    donnees.operations
      .filter((o) => p.courants.has(o.compteId) && o.date >= b.de && o.date <= b.fin && o.montant < 0 && !o.virementId && categories.get(o.categorieId ?? "")?.type !== "virement")
      .sort((a, b) => a.montant - b.montant)
      .slice(0, 5),
  );
</script>

<div class="pile">
  <Periode />
  {#if !donnees.operations.length}
    <div class="carte pile vide-guide">
      <h2>{t("Pas encore de données à analyser")}</h2>
      <p class="sous">{t("Importez un relevé pour voir l'évolution de votre solde, vos revenus et dépenses mois par mois, et la prévision sur 3 mois.")}</p>
      <button class="principal" onclick={() => (app.page = "import")}>{t("Importer un relevé")}</button>
    </div>
  {/if}

  <div class="indicateurs">
    <div class="carte indicateur">
      <p class="sous">{t("Dépenses moyennes")}<Aide texte={t("Moyenne mensuelle des dépenses sur la période choisie, sans compter les mois où aucune opération n'est enregistrée.")} /></p>
      <p class="montant chiffre">{argent(moyDepenses, devise)}</p><p class="sous">{t("par mois")}</p>
    </div>
    <div class="carte indicateur">
      <p class="sous">{t("Revenus moyens")}</p>
      <p class="montant chiffre">{argent(moyRevenus, devise)}</p><p class="sous">{t("par mois")}</p>
    </div>
    <div class="carte indicateur">
      <p class="sous">{t("Épargne nette")}<Aide texte={t("Moyenne mensuelle de ce que vous mettez de côté, moins ce que vous en reprenez.")} /></p>
      <p class="montant chiffre">{argent(moyEpargne, devise, true)}</p><p class="sous">{t("par mois")}</p>
    </div>
  </div>

  <section class="carte pile">
    <h2>{t("Revenus et dépenses")}<Aide texte={t("Revenus en vert, dépenses en orange. L'écart entre les deux est vert quand il vous reste de l'argent, rouge quand vous avez dépensé plus que gagné. Sur plus de 2 ans, un point par trimestre (moyenne par mois).")} /></h2>
    <FluxCourbes mois={parMois.map(({ m, f }) => ({ a: m.a, m: m.m, revenus: Math.max(0, f.revenus), depenses: Math.max(0, f.depenses) }))} {devise} hauteur={190} />
  </section>

  <div class="duo">
  <section class="carte pile">
    <h2>{t("Mes comptes, mois par mois")}<Aide texte={t("Solde de chaque compte à la fin de chaque mois, épargne et poches comprises, dans sa couleur. Le total est en pointillés. Sous 0 €, la zone est rouge.")} /></h2>
    <SoldesComptes {mois} series={seriesComptes} total={comptesGraphe.length > 1 ? totalSoldes : undefined} {devise} />
  </section>

  <section class="carte pile" data-visite="categories">
    <h2>{t("Dépenses par catégorie")}<Aide texte={t("Barre pleine : moyenne mensuelle sur la période. Trait : le mois choisi. La flèche compare le mois choisi à la moyenne.")} /></h2>
    {#each parCategorie as x (x.id)}
      {@const v = variation(x.ceMois, x.moyenne)}
      <div class="cat">
        <div class="tete">
          <span class="nom"><i class="point" style:background={x.couleur}></i>{x.nom}</span>
          <span class="montant moyenne">{t("{0}/mois", argent(x.moyenne, devise))}</span>
        </div>
        <p class="sous detail-cat">
          {t("Dernier mois : {0}", argent(x.ceMois, devise))}
          {#if v !== undefined && v !== 0}<span class:hausse={v > 0} class:baisse={v < 0}>{v > 0 ? "▲" : "▼"} {Math.abs(v)} %</span>{/if}
        </p>
        <div class="jauge">
          <span style:width="{(x.moyenne / maxCat) * 100}%" style:background={x.couleur}></span>
          <i class="repere" style:left="{(x.ceMois / maxCat) * 100}%"></i>
        </div>
      </div>
    {:else}
      <p class="sous">{t("Pas encore de dépenses sur cette période.")}</p>
    {/each}
  </section>
  </div>

  <BilanMois mois={decaler(moisCourant(), -1)} />

  <Abonnements />

  {#if prevision}
    <section class="carte pile" data-visite="prevision">
      <h2>{t("Prévision sur 3 mois")}<Aide texte={t("Argent disponible (sans l'épargne) semaine par semaine : les opérations qui reviennent (salaire, loyer, abonnements…) à leur date, plus vos autres dépenses habituelles des 3 derniers mois. C'est une estimation, pas une certitude.")} /></h2>
      <p>
        {#if prevision.sousSeuil}
          {t("Attention : à ce rythme, votre argent disponible passerait sous 0 € vers le")} <strong>{dateCourte(prevision.sousSeuil)}</strong>.
        {:else}
          {t("À ce rythme, vous resterez au-dessus de 0 €. Au plus bas :")} <strong class="montant">{argent(prevision.plusBas.solde, devise)}</strong> {t("vers le")} {dateCourte(prevision.plusBas.date)}.
        {/if}
        {t("Dans 3 mois : environ")} <strong class="montant">{argent(prevision.points.at(-1)!.solde, devise)}</strong>.
      </p>
      <Courbe points={pointsPrevision} {devise} couleur={prevision.sousSeuil ? "var(--serie-depenses)" : "var(--serie-revenus)"} reference={prevision.plusBas.solde < 0 ? { valeur: 0, libelle: "0 €" } : undefined} />
    </section>
  {/if}

  <section class="carte pile">
    <h2>{t("Plus grosses dépenses ·")} {b.libelle}</h2>
    {#each grosses as o (o.id)}
      <div class="op">
        <span class="libelle">{libelleLisible(o.libelle)}<span class="sous"> · {dateCourte(o.date)} · {categories.get(o.categorieId ?? "")?.nom ?? t("Sans catégorie")}</span></span>
        <span class="montant fort">{argent(o.montant, devise, true)}</span>
      </div>
    {:else}
      <p class="sous">{t("Aucune dépense ce mois-ci.")}</p>
    {/each}
  </section>
</div>

<style>
  .vide-guide {
    align-items: flex-start;
  }
  .indicateurs {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }
  .indicateur {
    padding: 12px 14px;
  }
  .chiffre {
    font-size: 20px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  h2 {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
  }
  .cat {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .tete {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 10px;
    font-size: 15px;
  }
  .nom {
    font-weight: 700;
    min-width: 0;
  }
  .moyenne {
    font-weight: 700;
    white-space: nowrap;
  }
  .detail-cat {
    margin: -2px 0 0;
    font-size: 13px;
    display: flex;
    gap: 8px;
  }
  .hausse {
    color: var(--danger);
    font-weight: 700;
  }
  .baisse {
    color: var(--ok);
    font-weight: 700;
  }
  .point {
    display: inline-block;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    margin-right: 8px;
  }
  .jauge {
    position: relative;
    height: 8px;
    border-radius: 999px;
    background: var(--surface-2);
  }
  .jauge > span {
    display: block;
    height: 100%;
    border-radius: 999px;
  }
  .repere {
    position: absolute;
    top: -3px;
    width: 2px;
    height: 14px;
    background: var(--texte);
    border-radius: 1px;
  }
  .op {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: 14px;
  }
  .libelle {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .fort {
    flex: none;
    font-weight: 600;
  }
  /* Téléphone : les trois moyennes côte à côte, en compact */
  @media (max-width: 599px) {
    .indicateurs {
      gap: 6px;
    }
    .indicateur {
      padding: 10px;
    }
    .indicateur .sous {
      font-size: 12px;
      line-height: 1.25;
    }
    .chiffre {
      font-size: 15px;
      font-weight: 800;
      margin: 4px 0 2px;
    }
  }
  /* Grand écran : les comptes et les catégories côte à côte */
  .duo {
    display: grid;
    gap: 14px;
    align-items: start;
  }
  @media (min-width: 1100px) {
    .duo {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    }
  }
</style>
