<script lang="ts">
  // Revenus (vert) et dépenses (orange) en courbes douces ; l'écart entre les deux est vert quand il reste de l'argent,
  // rouge quand on a dépensé plus que gagné. Aucun chiffre sur le dessin : glisser dessus affiche ceux de la période.
  // Plus de 24 mois : un point par trimestre (moyenne par mois), seules les années sont écrites sous le graphique.
  import { argent } from "./format";
  import { locale, t } from "./i18n.svelte";
  import { etiquettesAxe, hauteurSurChemin, lisse } from "./lissage";

  type Mois = { a: number; m: number; revenus: number; depenses: number };
  let { mois, devise = "EUR", hauteur = 170 }: { mois: Mois[]; devise?: string; hauteur?: number } = $props();

  let L = $state(600);
  const H = $derived(L < 520 ? hauteur + 30 : hauteur);
  const BAS = 24;
  const HAUT = 12;
  const nomMois = (a: number, m: number, f: Intl.DateTimeFormatOptions) => new Date(a, m, 1).toLocaleDateString(locale(), f).replace(".", "");

  // Pas de mois vides avant les premières données ; au-delà de 24 mois, des trimestres
  const points = $derived.by(() => {
    const debut = mois.findIndex((d) => d.revenus || d.depenses);
    const utiles = debut < 0 ? mois : mois.slice(debut);
    if (utiles.length <= 24) return utiles.map((d) => ({ ...d, libelle: nomMois(d.a, d.m, { month: "long", year: "numeric" }), axe: nomMois(d.a, d.m, { month: "short" }), annee: false }));
    const res: (Mois & { libelle: string; axe: string; annee: boolean; n: number })[] = [];
    for (const d of utiles) {
      const q = Math.floor(d.m / 3);
      const der = res.at(-1);
      if (der && der.a === d.a && Math.floor(der.m / 3) === q) (der.revenus += d.revenus), (der.depenses += d.depenses), (der.n += 1);
      else res.push({ ...d, n: 1, libelle: t("T{0} {1}", q + 1, d.a), axe: String(d.a), annee: q === 0 });
    }
    return res.map((d) => ({ ...d, revenus: d.revenus / d.n, depenses: d.depenses / d.n }));
  });
  // Trimestres : leur repère d'axe est l'année (4 chiffres), celui d'un mois est son nom
  const trimestres = $derived(points.length > 0 && /^\d{4}$/.test(points[0].axe));
  const vals = $derived(points.flatMap((p) => [p.revenus, p.depenses]));
  const max = $derived(Math.max(1, ...vals) * 1.08);
  const min = $derived(Math.max(0, Math.min(...vals) * 0.8));
  const x = (i: number) => (points.length < 2 ? L / 2 : 10 + ((L - 20) * i) / (points.length - 1));
  const y = (v: number) => HAUT + (H - BAS - HAUT) * (1 - (v - min) / (max - min || 1));
  const rev = $derived(lisse(points.map((p, i) => [x(i), y(p.revenus)])));
  const dep = $derived(lisse(points.map((p, i) => [x(i), y(p.depenses)])));
  // Zones : sous la courbe des revenus et au-dessus de celle des dépenses = vert ; l'inverse = rouge (découpes exactes)
  const sous = (d: string) => (points.length ? `${d} L${x(points.length - 1)},${H} L${x(0)},${H} Z` : "");
  const dessus = (d: string) => (points.length ? `${d} L${x(points.length - 1)},0 L${x(0)},0 Z` : "");
  // Étiquettes de l'axe : les années (trimestres) ou les mois, jamais superposées, la dernière toujours
  const axe = $derived(
    etiquettesAxe(
      points.map((_, i) => x(i)),
      points.map((p) => p.axe),
      L,
      trimestres ? points.flatMap((p, i) => (i === 0 || p.annee ? [i] : [])) : undefined,
    ),
  );
  const id = Math.random().toString(36).slice(2, 8);

  // Le repère suit le doigt sans à-coup, le long des deux courbes ; les chiffres sont ceux de la période la plus proche
  let survol = $state(-1);
  let fx = $state(0);
  let yRev = $state(0);
  let yDep = $state(0);
  let cheminRev = $state<SVGPathElement>();
  let cheminDep = $state<SVGPathElement>();
  function bouger(e: PointerEvent) {
    if (!points.length) return;
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * L;
    survol = Math.max(0, Math.min(points.length - 1, Math.round(((px - 10) / (L - 20)) * (points.length - 1))));
    fx = Math.max(x(0), Math.min(x(points.length - 1), px));
    yRev = hauteurSurChemin(cheminRev, fx, y(points[survol].revenus));
    yDep = hauteurSurChemin(cheminDep, fx, y(points[survol].depenses));
  }
</script>

<div class="graphique" bind:clientWidth={L}>
  <svg viewBox="0 0 {L} {H}" role="img" aria-label={t("Revenus et dépenses : l'écart est vert quand il reste de l'argent, rouge sinon")} onpointermove={bouger} onpointerdown={bouger} onpointerleave={() => (survol = -1)}>
    <defs>
      <clipPath id="sousRev{id}"><path d={sous(rev)} /></clipPath>
      <clipPath id="sousDep{id}"><path d={sous(dep)} /></clipPath>
    </defs>
    <line x1="0" x2={L} y1={H - BAS} y2={H - BAS} class="base" />
    <path d={dessus(dep)} clip-path="url(#sousRev{id})" class="zone positif" />
    <path d={dessus(rev)} clip-path="url(#sousDep{id})" class="zone negatif" />
    <path d={dep} class="courbe" stroke="var(--serie-depenses)" bind:this={cheminDep} />
    <path d={rev} class="courbe" stroke="var(--serie-revenus)" bind:this={cheminRev} />
    {#if survol >= 0}
      <line x1={fx} x2={fx} y1={HAUT} y2={H - BAS} class="curseur" />
      <circle cx={fx} cy={yRev} r="4.5" fill="var(--serie-revenus)" class="point" />
      <circle cx={fx} cy={yDep} r="4.5" fill="var(--serie-depenses)" class="point" />
    {:else if points.length}
      <circle cx={x(points.length - 1)} cy={y(points.at(-1)!.revenus)} r="4.5" fill="var(--serie-revenus)" class="point" />
      <circle cx={x(points.length - 1)} cy={y(points.at(-1)!.depenses)} r="4.5" fill="var(--serie-depenses)" class="point" />
    {/if}
    {#each [...axe] as [i, ancre] (i)}<text x={x(i)} y={H - 7} class="axe" text-anchor={ancre}>{points[i].axe}</text>{/each}
  </svg>
  {#if survol >= 0}
    {@const p = points[survol]}
    {@const r = p.revenus - p.depenses}
    <div class="detail">
      <strong>{p.libelle}</strong>{#if trimestres}<span class="sous">{t("(moyenne par mois)")}</span>{/if}
      <span><i style:background="var(--serie-revenus)"></i>{t("revenus")} <span class="montant">{argent(p.revenus, devise)}</span></span>
      <span><i style:background="var(--serie-depenses)"></i>{t("dépenses")} <span class="montant">{argent(p.depenses, devise)}</span></span>
      <span>{t("reste")} <span class="montant" class:vert={r >= 0} class:rouge={r < 0}>{argent(r, devise, true)}</span></span>
    </div>
  {:else}
    <div class="detail sous">{trimestres ? t("Un point par trimestre (moyenne par mois). ") : ""}{t("Glissez sur le graphique pour lire chaque période. Vert : il reste de l'argent ; rouge : plus dépensé que gagné.")}</div>
  {/if}
</div>

<style>
  .graphique {
    display: flex;
    flex-direction: column;
    gap: 6px;
    /* La largeur vient de la page, jamais du dessin : sinon mesure → dessin → largeur → mesure tourne en boucle */
    contain: inline-size;
    width: 100%;
    min-width: 0;
  }
  /* Bloc de largeur imposée : la largeur mesurée ne dépend pas du dessin (pas de boucle de mesure) */
  svg {
    display: block;
    width: 100%;
    max-width: 100%;
    height: auto;
    overflow: visible;
    touch-action: pan-y;
  }
  .courbe {
    fill: none;
    stroke-width: 2.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .zone {
    opacity: 0.16;
  }
  .zone.positif {
    fill: var(--serie-revenus);
  }
  .zone.negatif {
    fill: var(--danger);
    opacity: 0.2;
  }
  .base {
    stroke: var(--bord);
  }
  .curseur {
    stroke: var(--doux);
    stroke-dasharray: 3 3;
  }
  .point {
    stroke: var(--fond);
    stroke-width: 2;
  }
  .axe {
    font-size: 12px;
    fill: var(--doux);
  }
  .detail {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 12px;
    font-size: 13px;
    min-height: 20px;
  }
  .detail i {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 2px;
    margin-right: 4px;
  }
  .vert {
    color: var(--ok);
  }
  .rouge {
    color: var(--danger);
  }
</style>
