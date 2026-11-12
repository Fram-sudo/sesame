<script lang="ts">
  import { t } from "./i18n.svelte";
  // Revenus et dépenses par mois : barres groupées, une seule échelle, survol pour le détail.
  import { argent } from "./format";

  let { donnees, devise = "EUR", hauteur = 180 }: { donnees: { libelle: string; revenus: number; depenses: number }[]; devise?: string; hauteur?: number } = $props();

  // Largeur réelle du graphique (mesurée) : le texte garde sa taille sur grand écran
  let L = $state(600);
  const H = $derived(hauteur);
  const BAS = 22;
  const max = $derived(Math.max(1, ...donnees.flatMap((d) => [d.revenus, d.depenses])));
  const pas = $derived(L / Math.max(1, donnees.length));
  const larg = $derived(Math.max(3, Math.min(18, pas * 0.3)));
  const HAUT = 14;
  const y = (v: number) => HAUT + (H - BAS - HAUT) * (1 - v / max);
  let survol = $state(-1);
  // Barre au sommet arrondi (4 px), posée sur la ligne de base
  function barre(x0: number, v: number) {
    const h = H - BAS - y(v);
    if (h < 0.5) return "";
    const r = Math.min(4, h, larg / 2);
    return `M${x0},${H - BAS} V${H - BAS - h + r} q0,-${r} ${r},-${r} h${larg - 2 * r} q${r},0 ${r},${r} V${H - BAS} Z`;
  }
  const court = (v: number) => (Math.abs(v) >= 100000 ? `${Math.round(v / 100000)} k` : `${Math.round(v / 100)}`);
</script>

<div class="graphique" bind:clientWidth={L}>
  <div class="legende">
    <span><i style:background="var(--serie-revenus)"></i>{t("Revenus")}</span>
    <span><i style:background="var(--serie-depenses)"></i>{t("Dépenses")}</span>
  </div>
  <svg viewBox="0 0 {L} {H}" role="img" aria-label={t("Revenus et dépenses par mois")} onpointerleave={() => (survol = -1)}>
    {#each [0.5, 1] as f (f)}
      <line x1="0" x2={L} y1={y(max * f)} y2={y(max * f)} class="grille" />
      <text x="2" y={y(max * f) - 4} class="axe">{court(max * f)}</text>
    {/each}
    <line x1="0" x2={L} y1={H - BAS} y2={H - BAS} class="base" />
    {#each donnees as d, i (d.libelle)}
      {@const cx = pas * i + pas / 2}
      <rect x={pas * i} y="0" width={pas} height={H} class="zone" class:active={survol === i} onpointerenter={() => (survol = i)} role="presentation" />
      <path d={barre(cx - larg - 1, d.revenus)} fill="var(--serie-revenus)" pointer-events="none" />
      <path d={barre(cx + 1, d.depenses)} fill="var(--serie-depenses)" pointer-events="none" />
      <text x={cx} y={H - 6} class="axe" text-anchor="middle">{d.libelle}</text>
    {/each}
  </svg>
  {#if survol >= 0}
    {@const d = donnees[survol]}
    <div class="detail">
      <strong>{d.libelle}</strong> {t("· revenus")} <span class="montant">{argent(d.revenus, devise)}</span> {t("· dépenses")} <span class="montant">{argent(d.depenses, devise)}</span>
      {t("· solde")} <span class="montant">{argent(d.revenus - d.depenses, devise, true)}</span>
    </div>
  {:else}
    <div class="detail sous">{t("Survolez ou touchez un mois pour le détail.")}</div>
  {/if}
</div>

<style>
  .graphique {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  svg {
    width: 100%;
    height: auto;
    overflow: visible;
  }
  .legende {
    display: flex;
    gap: 14px;
    font-size: 13px;
    color: var(--doux);
  }
  .legende i {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 3px;
    margin-right: 6px;
    vertical-align: -1px;
  }
  .grille {
    stroke: var(--bord);
    stroke-dasharray: 3 4;
  }
  .base {
    stroke: var(--bord);
  }
  .axe {
    font-size: 11px;
    fill: var(--pale);
  }
  .zone {
    fill: transparent;
  }
  .zone.active {
    fill: var(--surface-2);
  }
  .detail {
    font-size: 13px;
    min-height: 20px;
  }
</style>
