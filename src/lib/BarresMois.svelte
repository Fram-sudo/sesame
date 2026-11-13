<script lang="ts">
  import { locale, t } from "./i18n.svelte";
  // Revenus et dépenses par mois : barres groupées, une seule échelle, survol pour le détail.
  import { argent } from "./format";

  let {
    donnees: tous,
    devise = "EUR",
    hauteur = 180,
    reste = false,
  }: {
    donnees: { libelle: string; revenus: number; depenses: number }[];
    devise?: string;
    hauteur?: number;
    /** Afficher au-dessus de chaque mois ce qui reste (revenus − dépenses), en rouge si négatif */
    reste?: boolean;
  } = $props();

  // Largeur réelle du graphique (mesurée) : le texte garde sa taille sur grand écran
  let L = $state(600);
  const telephone = $derived(L < 520);
  // Pas de mois vides avant les premières données ; sur téléphone, les 6 derniers mois seulement (barres lisibles)
  const donnees = $derived.by(() => {
    const debut = tous.findIndex((d) => d.revenus || d.depenses);
    const utiles = debut < 0 ? tous : tous.slice(debut);
    return telephone ? utiles.slice(-6) : utiles;
  });
  const H = $derived(telephone ? hauteur + 30 : hauteur);
  const BAS = 22;
  // Échelle en montants ronds (1, 2 ou 5 × 10ⁿ) : 0 €, 1 000 €, 2 000 €…
  const brut = $derived(Math.max(1, ...donnees.flatMap((d) => [d.revenus, d.depenses])));
  const pasEchelle = $derived.by(() => {
    const cible = brut / 3;
    const p = 10 ** Math.floor(Math.log10(cible));
    return [1, 2, 5, 10].map((k) => k * p).find((v) => v >= cible) ?? 10 * p;
  });
  const max = $derived(Math.ceil(brut / pasEchelle) * pasEchelle);
  const graduations = $derived(Array.from({ length: Math.round(max / pasEchelle) }, (_, k) => (k + 1) * pasEchelle));
  const pas = $derived(L / Math.max(1, donnees.length));
  const larg = $derived(Math.max(3, Math.min(26, pas * 0.32)));
  const HAUT = $derived(reste ? 30 : 14);
  const y = (v: number) => HAUT + (H - BAS - HAUT) * (1 - v / max);
  let survol = $state(-1);
  // Mois sous le doigt, d'après sa position sur tout le graphique (au doigt, le pointeur reste accroché au premier élément touché)
  function bouger(e: PointerEvent) {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    survol = Math.max(0, Math.min(donnees.length - 1, Math.floor(((e.clientX - r.left) / r.width) * donnees.length)));
  }
  // Barre au sommet arrondi (4 px), posée sur la ligne de base
  function barre(x0: number, v: number) {
    const h = H - BAS - y(v);
    if (h < 0.5) return "";
    const r = Math.min(4, h, larg / 2);
    return `M${x0},${H - BAS} V${H - BAS - h + r} q0,-${r} ${r},-${r} h${larg - 2 * r} q${r},0 ${r},${r} V${H - BAS} Z`;
  }
  const court = (v: number) => new Intl.NumberFormat(locale(), { style: "currency", currency: devise, maximumFractionDigits: 0 }).format(v / 100);
</script>

<div class="graphique" bind:clientWidth={L}>
  <div class="legende">
    <span><i style:background="var(--serie-revenus)"></i>{t("Revenus")}</span>
    <span><i style:background="var(--serie-depenses)"></i>{t("Dépenses")}</span>
  </div>
  <svg viewBox="0 0 {L} {H}" role="img" aria-label={t("Revenus et dépenses par mois")} onpointermove={bouger} onpointerdown={bouger} onpointerleave={() => (survol = -1)}>
    {#each graduations as v (v)}<line x1="0" x2={L} y1={y(v)} y2={y(v)} class="grille" />{/each}
    <line x1="0" x2={L} y1={H - BAS} y2={H - BAS} class="base" />
    {#if survol >= 0}<rect x="0" y="0" width={pas} height={H - BAS} rx="8" class="surligne" style:transform="translateX({pas * survol}px)" />{/if}
    {#each donnees as d, i (d.libelle)}
      {@const cx = pas * i + pas / 2}
      <path d={barre(cx - larg - 1, d.revenus)} fill="var(--serie-revenus)" pointer-events="none" />
      <path d={barre(cx + 1, d.depenses)} fill="var(--serie-depenses)" pointer-events="none" />
      <text x={cx} y={H - 6} class="axe" text-anchor="middle">{d.libelle}</text>
      {#if reste && (d.revenus || d.depenses)}
        {@const r = d.revenus - d.depenses}
        <text x={cx} y={y(Math.max(d.revenus, d.depenses)) - 7} class="reste" class:negatif={r < 0} text-anchor="middle">{r < 0 ? "−" : "+"}{court(Math.abs(r))}</text>
      {/if}
    {/each}
    <!-- Montants de l'échelle par-dessus les barres, détourés pour rester lisibles -->
    {#each graduations as v (v)}<text x="2" y={y(v) - 4} class="axe echelle">{court(v)}</text>{/each}
  </svg>
  {#if survol >= 0}
    {@const d = donnees[survol]}
    <div class="detail">
      <strong>{d.libelle}</strong> {t("· revenus")} <span class="montant">{argent(d.revenus, devise)}</span> {t("· dépenses")} <span class="montant">{argent(d.depenses, devise)}</span>
      {t("· solde")} <span class="montant">{argent(d.revenus - d.depenses, devise, true)}</span>
    </div>
  {:else}
    <div class="detail sous">{t("Touchez un mois pour le détail.")}</div>
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
    /* Glisser à l'horizontale parcourt les mois ; à la verticale, la page défile toujours */
    touch-action: pan-y;
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
  .reste {
    font-size: 12px;
    font-weight: 700;
    fill: var(--ok);
    font-variant-numeric: tabular-nums;
  }
  .reste.negatif {
    fill: var(--danger);
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
  .echelle {
    paint-order: stroke;
    stroke: var(--surface);
    stroke-width: 4px;
    stroke-linejoin: round;
    pointer-events: none;
  }
  .surligne {
    fill: var(--surface-2);
    pointer-events: none;
    transition: transform 0.18s cubic-bezier(0.2, 0.9, 0.2, 1);
  }
  .detail {
    font-size: 13px;
    min-height: 20px;
  }
</style>
