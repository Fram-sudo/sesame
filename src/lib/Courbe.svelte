<script lang="ts">
  import { t } from "./i18n.svelte";
  // Évolution d'un montant dans le temps : une ligne (aire légère), une moyenne en pointillés si fournie,
  // réticule et valeur au survol (maquette validée v6).
  import { argent } from "./format";

  let {
    points,
    devise = "EUR",
    couleur = "var(--serie-revenus)",
    reference,
    hauteur = 170,
    remplir = true,
  }: {
    points: { libelle: string; valeur: number }[];
    devise?: string;
    couleur?: string;
    reference?: { valeur: number; libelle: string };
    hauteur?: number;
    remplir?: boolean;
  } = $props();

  // Largeur réelle du graphique (mesurée) : le texte garde sa taille sur grand écran
  let L = $state(600);
  const H = $derived(hauteur);
  const BAS = 22;
  const HAUT = 12;
  const valeurs = $derived([...points.map((p) => p.valeur), ...(reference ? [reference.valeur] : [])]);
  const min = $derived(Math.min(0, ...valeurs));
  const max = $derived(Math.max(1, ...valeurs) * 1.05);
  const x = (i: number) => (points.length < 2 ? L / 2 : (i * (L - 16)) / (points.length - 1) + 8);
  const y = (v: number) => HAUT + (H - BAS - HAUT) * (1 - (v - min) / (max - min || 1));
  // Courbe arrondie (cubique monotone) : douce, sans bosse au-delà des vraies valeurs
  function lisse(pts: [number, number][]) {
    const n = pts.length;
    if (n < 3) return pts.map(([px, py], i) => `${i ? "L" : "M"}${px},${py}`).join(" ");
    const m = pts.slice(0, -1).map(([x0, y0], i) => (pts[i + 1][1] - y0) / (pts[i + 1][0] - x0));
    const t = pts.map((_, i) => (i === 0 ? m[0] : i === n - 1 ? m[n - 2] : m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2));
    for (let i = 0; i < n - 1; i++) {
      if (m[i] === 0) {
        t[i] = t[i + 1] = 0;
        continue;
      }
      const a = t[i] / m[i];
      const b = t[i + 1] / m[i];
      const s = a * a + b * b;
      if (s > 9) (t[i] = (3 / Math.sqrt(s)) * a * m[i]), (t[i + 1] = (3 / Math.sqrt(s)) * b * m[i]);
    }
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 0; i < n - 1; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[i + 1];
      const h = (x1 - x0) / 3;
      d += ` C${x0 + h},${y0 + t[i] * h} ${x1 - h},${y1 - t[i + 1] * h} ${x1},${y1}`;
    }
    return d;
  }
  const trace = $derived(lisse(points.map((p, i) => [x(i), y(p.valeur)])));
  const aire = $derived(points.length ? `${trace} L${x(points.length - 1)},${y(min)} L${x(0)},${y(min)} Z` : "");
  let survol = $state(-1);

  function bouger(e: PointerEvent) {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * L;
    survol = Math.max(0, Math.min(points.length - 1, Math.round(((px - 8) / (L - 16)) * (points.length - 1))));
  }
  const pas = $derived(Math.ceil(points.length / 6));
</script>

<div class="graphique" bind:clientWidth={L}>
  <svg viewBox="0 0 {L} {H}" role="img" aria-label="Évolution sur {points.length} mois" onpointermove={bouger} onpointerdown={bouger} onpointerleave={() => (survol = -1)} style:--couleur={couleur}>
    {#if min < 0}<line x1="0" x2={L} y1={y(0)} y2={y(0)} class="zero" />{/if}
    <line x1="0" x2={L} y1={H - BAS} y2={H - BAS} class="base" />
    {#if remplir}<path d={aire} class="aire" />{/if}
    {#if reference}<line x1="0" x2={L} y1={y(reference.valeur)} y2={y(reference.valeur)} class="moyenne" />{/if}
    <path d={trace} class="ligne" />
    {#if points.length}<circle cx={x(points.length - 1)} cy={y(points[points.length - 1].valeur)} r="4" class="dernier" />{/if}
    {#each points as p, i (p.libelle)}
      {#if i % pas === 0 || i === points.length - 1}<text x={x(i)} y={H - 6} class="axe" text-anchor={i === 0 && points.length > 1 ? "start" : i === points.length - 1 && points.length > 1 ? "end" : "middle"}>{p.libelle}</text>{/if}
    {/each}
    {#if survol >= 0}
      <line x1={x(survol)} x2={x(survol)} y1={HAUT} y2={H - BAS} class="reticule" />
      <circle cx={x(survol)} cy={y(points[survol].valeur)} r="5" class="point" />
    {/if}
  </svg>
  <div class="detail">
    {#if survol >= 0}
      <strong>{points[survol].libelle}</strong> · <span class="montant">{argent(points[survol].valeur, devise)}</span>
    {:else if reference}
      <span class="sous"><span class="trait" style:background={couleur}></span>{t("par mois")} <span class="pointilles"></span>{t("{0} :", reference.libelle)} <span class="montant">{argent(reference.valeur, devise)}</span></span>
    {:else}
      <span class="sous">{t("Survolez ou touchez la courbe pour le détail.")}</span>
    {/if}
  </div>
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
    touch-action: pan-y;
  }
  .ligne {
    fill: none;
    stroke: var(--couleur);
    stroke-width: 2;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
  .aire {
    fill: var(--couleur);
    opacity: 0.12;
  }
  .moyenne {
    stroke: var(--doux);
    stroke-width: 1.2;
    stroke-dasharray: 4 4;
  }
  .base,
  .zero {
    stroke: var(--bord);
  }
  .zero {
    stroke-dasharray: 3 4;
  }
  .reticule {
    stroke: var(--pale);
    stroke-width: 1;
  }
  .point,
  .dernier {
    fill: var(--couleur);
    stroke: var(--surface);
    stroke-width: 2;
  }
  .axe {
    font-size: 11px;
    fill: var(--pale);
  }
  .detail {
    font-size: 13px;
    min-height: 20px;
  }
  .trait {
    display: inline-block;
    width: 14px;
    height: 2px;
    vertical-align: middle;
    margin-right: 6px;
    border-radius: 1px;
  }
  .pointilles {
    display: inline-block;
    width: 14px;
    border-top: 1.5px dashed var(--doux);
    vertical-align: middle;
    margin: 0 6px 0 12px;
  }
</style>
