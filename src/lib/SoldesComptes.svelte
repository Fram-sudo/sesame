<script lang="ts">
  // Solde de chaque compte, dans sa couleur, et le total en pointillés ; sous 0 € la zone est teintée de rouge.
  // Toucher un compte dans la légende le masque ou l'affiche ; toucher le graphique donne les valeurs du mois.
  import { argent } from "./format";
  import { locale, t } from "./i18n.svelte";
  import { hauteurSurChemin, lisse } from "./lissage";

  let {
    mois,
    series: toutes,
    total: totalBrut,
    devise = "EUR",
    hauteur = 190,
  }: {
    /** Fin de chaque mois affiché */
    mois: { a: number; m: number }[];
    series: { id: string; nom: string; couleur: string; valeurs: number[] }[];
    /** Total de tous les comptes (absent quand un seul compte est affiché) */
    total?: number[];
    devise?: string;
    hauteur?: number;
  } = $props();

  // Plus de 24 mois : le solde en fin de trimestre (un point sur trois, le dernier mois toujours gardé)
  const garde = $derived(mois.map((_, i) => mois.length <= 24 || (mois.length - 1 - i) % 3 === 0));
  const trimestres = $derived(mois.length > 24);
  const choisir = <T,>(v: T[]) => v.filter((_, i) => garde[i]);
  const moisVus = $derived(choisir(mois));
  const libelles = $derived(moisVus.map((m) => new Date(m.a, m.m, 1).toLocaleDateString(locale(), { month: "short", year: "2-digit" }).replace(".", "")));
  const series = $derived(toutes.map((s) => ({ ...s, valeurs: choisir(s.valeurs) })));
  const total = $derived(totalBrut ? choisir(totalBrut) : undefined);
  let L = $state(600);
  const H = $derived(L < 520 ? hauteur + 30 : hauteur);
  const BAS = 22;
  const HAUT = 14;
  let caches = $state<string[]>([]);
  const visibles = $derived(series.filter((s) => !caches.includes(s.id)));
  const tout = $derived([...visibles.flatMap((s) => s.valeurs), ...(total ?? [])]);
  const min = $derived(Math.min(0, ...tout));
  const max = $derived(Math.max(1, ...tout));
  const n = $derived(Math.max(1, libelles.length));
  const pas = $derived(L / n);
  const x = (i: number) => pas * i + pas / 2;
  // Mois de l'axe : un sur deux (ou trois) quand ils n'ont pas la place, le dernier toujours affiché
  const saut = $derived(Math.max(1, Math.ceil(48 / pas)));
  const y = (v: number) => HAUT + (H - BAS - HAUT) * (1 - (v - min) / (max - min || 1));
  const ligne = (v: number[]) => lisse(v.map((val, i) => [x(i), y(val)]));
  // Point le plus bas sous 0 € de chaque compte visible : signalé en rouge
  const plusBas = $derived(
    visibles.flatMap((s) => {
      const v = Math.min(...s.valeurs);
      return v < 0 ? [{ s, i: s.valeurs.indexOf(v), v }] : [];
    }),
  );
  // Le repère suit le doigt sans à-coup, un point sur chaque courbe ; les montants sont ceux du mois le plus proche
  let survol = $state(-1);
  let fx = $state(0);
  let hauteurs = $state<Record<string, number>>({});
  const chemins: Record<string, SVGPathElement> = {};
  function bouger(e: PointerEvent) {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * L;
    fx = Math.max(x(0), Math.min(x(n - 1), px));
    survol = Math.max(0, Math.min(n - 1, Math.round((fx - pas / 2) / pas)));
    const h: Record<string, number> = {};
    for (const s of visibles) h[s.id] = hauteurSurChemin(chemins[s.id], fx, y(s.valeurs[survol]));
    hauteurs = h;
  }
  const basculer = (id: string) => (caches = caches.includes(id) ? caches.filter((c) => c !== id) : [...caches, id]);
  const court = (v: number) => new Intl.NumberFormat(locale(), { style: "currency", currency: devise, maximumFractionDigits: 0 }).format(v / 100);
</script>

<div class="graphique" bind:clientWidth={L}>
  <div class="legende">
    {#each series as s (s.id)}
      <button type="button" class:cache={caches.includes(s.id)} aria-pressed={!caches.includes(s.id)} onclick={() => basculer(s.id)}>
        <i style:background={s.couleur}></i>{s.nom}
      </button>
    {/each}
    {#if total && series.length > 1}<span class="total"><i></i>{t("Total")}</span>{/if}
  </div>
  <svg viewBox="0 0 {L} {H}" role="img" aria-label={t("Solde de chaque compte, mois par mois")} onpointermove={bouger} onpointerdown={bouger} onpointerleave={() => (survol = -1)}>
    {#if min < 0}
      <rect x="0" y={y(0)} width={L} height={H - BAS - y(0)} class="zone-rouge" />
      <line x1="0" x2={L} y1={y(0)} y2={y(0)} class="zero" />
      <text x="4" y={y(0) + 14} class="axe rouge">{t("sous 0")}</text>
    {:else}
      <line x1="0" x2={L} y1={H - BAS} y2={H - BAS} class="base" />
    {/if}
    {#if survol >= 0}<line x1={fx} x2={fx} y1={HAUT} y2={H - BAS} class="curseur" />{/if}
    {#if total && series.length > 1}<path d={ligne(total)} class="courbe-total" />{/if}
    {#each visibles as s (s.id)}<path d={ligne(s.valeurs)} stroke={s.couleur} class="courbe" bind:this={chemins[s.id]} />{/each}
    {#if survol >= 0}
      {#each visibles as s (s.id)}{#if hauteurs[s.id] !== undefined}<circle cx={fx} cy={hauteurs[s.id]} r="4.5" fill={s.couleur} class="point" />{/if}{/each}
    {/if}
    {#each plusBas as b (b.s.id)}
      <circle cx={x(b.i)} cy={y(b.v)} r="5" class="point-rouge" />
    {/each}
    {#each libelles as l, i (i)}
      {#if trimestres ? i === 0 || moisVus[i].a !== moisVus[i - 1].a : (n - 1 - i) % saut === 0}
        <text x={x(i)} y={H - 6} class="axe" text-anchor="middle">{trimestres ? moisVus[i].a : l.split(" ")[0]}</text>
      {/if}
    {/each}
    <text x="2" y={HAUT + 4} class="axe">{court(max)}</text>
  </svg>
  {#if survol >= 0}
    <div class="detail">
      <strong>{libelles[survol]}</strong>
      {#each visibles as s (s.id)}<span><i style:background={s.couleur}></i>{s.nom} <span class="montant" class:rouge={s.valeurs[survol] < 0}>{argent(s.valeurs[survol], devise)}</span></span>{/each}
      {#if total && series.length > 1}<span>{t("Total")} <span class="montant" class:rouge={total[survol] < 0}>{argent(total[survol], devise)}</span></span>{/if}
    </div>
  {:else if plusBas.length}
    <div class="detail rouge">
      {#each plusBas as b (b.s.id)}<span>{t("{0} sous 0 € en {1} : {2}", b.s.nom, libelles[b.i], argent(b.v, devise))}</span>{/each}
    </div>
  {:else}
    <div class="detail sous">{t("Touchez un mois pour le détail, ou un compte pour le masquer.")}</div>
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
    max-width: 100%;
    width: 100%;
    height: auto;
    overflow: visible;
    touch-action: pan-y;
  }
  .legende {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
    font-size: 13px;
    color: var(--doux);
  }
  .legende button,
  .legende span {
    background: none;
    padding: 0;
    min-height: 0;
    font: inherit;
    color: inherit;
    display: inline-flex;
    align-items: center;
  }
  .legende button.cache {
    opacity: 0.45;
    text-decoration: line-through;
  }
  .legende i {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 3px;
    margin-right: 6px;
  }
  .legende .total i {
    width: 14px;
    height: 0;
    border-radius: 0;
    border-top: 2px dashed var(--doux);
  }
  .courbe {
    fill: none;
    stroke-width: 2.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .courbe-total {
    fill: none;
    stroke: var(--doux);
    stroke-width: 2;
    stroke-dasharray: 6 4;
  }
  .zone-rouge {
    fill: var(--danger);
    opacity: 0.08;
  }
  .zero {
    stroke: var(--danger);
    stroke-dasharray: 3 3;
  }
  .base {
    stroke: var(--bord);
  }
  .point-rouge {
    fill: var(--danger);
    stroke: var(--fond);
    stroke-width: 2;
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
  .axe.rouge {
    fill: var(--danger);
  }
  .detail {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    font-size: 13px;
  }
  .detail i {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 2px;
    margin-right: 4px;
  }
  .rouge {
    color: var(--danger);
  }
</style>
