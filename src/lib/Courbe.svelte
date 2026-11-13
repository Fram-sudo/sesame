<script lang="ts">
  import { t } from "./i18n.svelte";
  // Évolution d'un montant dans le temps : une ligne (aire légère), une moyenne en pointillés si fournie,
  // réticule et valeur au survol (maquette validée v6).
  import { argent } from "./format";
  import { etiquettesAxe, lisse } from "./lissage";

  let {
    points,
    devise = "EUR",
    couleur = "var(--accent)",
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
  // Un peu plus haute sur téléphone : les variations se voient mieux
  const H = $derived(L < 520 ? hauteur + 40 : hauteur);
  const BAS = 22;
  const HAUT = 22;
  const valeurs = $derived([...points.map((p) => p.valeur), ...(reference ? [reference.valeur] : [])]);
  const min = $derived(Math.min(0, ...valeurs));
  const max = $derived(Math.max(1, ...valeurs) * 1.05);
  const x = (i: number) => (points.length < 2 ? L / 2 : (i * (L - 16)) / (points.length - 1) + 8);
  const y = (v: number) => HAUT + (H - BAS - HAUT) * (1 - (v - min) / (max - min || 1));
  const trace = $derived(lisse(points.map((p, i) => [x(i), y(p.valeur)])));
  const aire = $derived(points.length ? `${trace} L${x(points.length - 1)},${y(min)} L${x(0)},${y(min)} Z` : "");
  let survol = $state(-1);
  // Position exacte du doigt (pas seulement le point le plus proche) : le repère suit sans à-coup
  let fx = $state(0);
  let fy = $state(0);
  let tracePath = $state<SVGPathElement>();
  // Hauteur de la courbe dessinée à l'abscisse donnée (la courbe avance toujours vers la droite : recherche par dichotomie)
  function hauteurA(px: number): number {
    const p = tracePath;
    if (!p || points.length < 2) return points.length ? y(points[0].valeur) : 0;
    let a = 0, b = p.getTotalLength();
    for (let k = 0; k < 22; k++) {
      const m = (a + b) / 2;
      if (p.getPointAtLength(m).x < px) a = m;
      else b = m;
    }
    return p.getPointAtLength((a + b) / 2).y;
  }

  function bouger(e: PointerEvent) {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * L;
    survol = Math.max(0, Math.min(points.length - 1, Math.round(((px - 8) / (L - 16)) * (points.length - 1))));
    fx = Math.max(x(0), Math.min(x(points.length - 1), px));
    fy = hauteurA(fx);
  }
  // Dates sous la courbe : jamais superposées, la première et la dernière collées aux bords, la dernière toujours
  const reperes = $derived(etiquettesAxe(points.map((_, i) => x(i)), points.map((p) => p.libelle), L));
  // Plus haut et plus bas, écrits sur la courbe : on lit les montants sans toucher
  const extremes = $derived.by(() => {
    if (points.length < 3) return [];
    let hi = 0, lo = 0;
    points.forEach((p, i) => ((p.valeur > points[hi].valeur && (hi = i)), p.valeur < points[lo].valeur && (lo = i)));
    if (points[hi].valeur === points[lo].valeur) return [];
    // Les deux montants ne doivent pas se toucher : sinon on ne garde que le plus haut
    const w = (i: number) => argent(points[i].valeur, devise).length * 6.6 + 8;
    const proches = Math.abs(x(hi) - x(lo)) < (w(hi) + w(lo)) / 2 && Math.abs(y(points[hi].valeur) - y(points[lo].valeur)) < 30;
    return proches ? [{ i: hi, haut: true }] : [{ i: hi, haut: true }, { i: lo, haut: false }];
  });
  const ancre = (i: number) => (x(i) < 60 ? "start" : x(i) > L - 60 ? "end" : "middle");
  // Bulle de lecture au doigt : au-dessus du point, sans sortir du graphique
  const bulle = $derived.by(() => {
    if (survol < 0) return null;
    const texte = `${points[survol].libelle} · ${argent(points[survol].valeur, devise)}`;
    const w = texte.length * 6.6 + 16;
    return { texte, w, x: Math.min(Math.max(fx - w / 2, 2), L - w - 2) };
  });
</script>

<div class="graphique" bind:clientWidth={L}>
  <svg viewBox="0 0 {L} {H}" role="img" aria-label="Évolution sur {points.length} mois" onpointermove={bouger} onpointerdown={bouger} onpointerleave={() => (survol = -1)} style:--couleur={couleur}>
    {#if min < 0}<line x1="0" x2={L} y1={y(0)} y2={y(0)} class="zero" />{/if}
    <line x1="0" x2={L} y1={H - BAS} y2={H - BAS} class="base" />
    {#if remplir}<path d={aire} class="aire" />{/if}
    {#if reference}<line x1="0" x2={L} y1={y(reference.valeur)} y2={y(reference.valeur)} class="moyenne" />{/if}
    <path d={trace} class="ligne" bind:this={tracePath} />
    {#if points.length}<circle cx={x(points.length - 1)} cy={y(points[points.length - 1].valeur)} r="4" class="dernier" />{/if}
    {#each [...reperes] as [i, ancre] (i)}<text x={x(i)} y={H - 6} class="axe" text-anchor={ancre}>{points[i].libelle}</text>{/each}
    {#if survol < 0}
      {#each extremes as e (e.haut)}
        <!-- Le plus bas s'écrit sous le point, sauf s'il touche le bas (il cacherait les dates) -->
        <text x={x(e.i)} y={y(points[e.i].valeur) + (e.haut || y(points[e.i].valeur) + 16 > H - BAS - 2 ? -8 : 16)} class="valeur" text-anchor={ancre(e.i)}>{argent(points[e.i].valeur, devise)}</text>
      {/each}
    {/if}
    {#if survol >= 0 && bulle}
      <line x1={fx} x2={fx} y1={HAUT} y2={H - BAS} class="reticule" />
      <circle cx={fx} cy={fy} r="5" class="point" />
      <rect x={bulle.x} y="0" width={bulle.w} height="20" rx="10" class="bulle" />
      <text x={bulle.x + bulle.w / 2} y="14" class="bulle-texte" text-anchor="middle">{bulle.texte}</text>
    {/if}
  </svg>
  <div class="detail">
    {#if survol >= 0}
      <span class="sous">{t("Glissez le doigt pour parcourir la courbe.")}</span>
    {:else if reference}
      <span class="sous"><span class="trait" style:background={couleur}></span>{t("par mois")} <span class="pointilles"></span>{t("{0} :", reference.libelle)} <span class="montant">{argent(reference.valeur, devise)}</span></span>
    {:else}
      <span class="sous">{t("Touchez ou glissez sur la courbe pour le détail.")}</span>
    {/if}
  </div>
</div>

<style>
  .graphique {
    display: flex;
    flex-direction: column;
    gap: 6px;
    /* La largeur vient de la page, jamais du dessin : sinon mesure → dessin → largeur → mesure tourne en boucle */
    contain: inline-size;
    width: 100%;
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
  .valeur {
    font-size: 11px;
    font-weight: 700;
    fill: var(--doux);
    font-variant-numeric: tabular-nums;
  }
  .bulle {
    fill: var(--texte);
  }
  .bulle-texte {
    font-size: 11px;
    font-weight: 700;
    fill: var(--fond);
    font-variant-numeric: tabular-nums;
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
