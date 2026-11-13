<script lang="ts" module>
  import type { Page } from "./etat.svelte";
  // cible : un ou plusieurs repères data-visite (séparés par une espace), encadrés ensemble.
  // suite : repère qui apparaît quand l'utilisateur a fait l'action ; l'étape avance alors toute seule.
  export type Etape = { page?: Page; cible?: string; titre: string; texte: string; suite?: string; chapitre?: string };
</script>

<script lang="ts">
  // Moteur des visites guidées (démo du site, visite complète de l'appli) : une bulle montre où toucher,
  // la page change toute seule ; le visiteur peut faire l'action lui-même (l'étape avance) ou lire et passer.
  import { onMount, type Snippet } from "svelte";
  import { app } from "./etat.svelte";
  import { t } from "./i18n.svelte";

  let {
    etapes,
    n = $bindable(-1),
    quitter,
    premiere,
    derniereActions,
    relancer = false,
  }: {
    etapes: Etape[];
    /** Étape affichée (-1 : visite fermée) */
    n?: number;
    /** Visite quittée ou terminée (n : étape où l'on s'est arrêté) */
    quitter: (n: number, terminee: boolean) => void;
    /** Boutons de la première étape (sinon Précédent / Quitter / Suivant) */
    premiere?: Snippet;
    /** Boutons de la dernière étape */
    derniereActions?: Snippet;
    /** Bouton flottant pour relancer la visite une fois fermée (démo du site) */
    relancer?: boolean;
  } = $props();

  let boite = $state<{ top: number; left: number; width: number; height: number; bottom: number } | null>(null);
  let bulle = $state<HTMLElement>();
  let haut = $state(0);
  let gauche = $state(0);
  let vueCible: Element | null = null;
  let attente = 0;
  const etape = $derived(n >= 0 ? etapes[n] : undefined);
  const derniere = $derived(n === etapes.length - 1);
  // Chapitres : pour se repérer (« Budgets · 4 sur 11 »)
  const chapitres = $derived([...new Set(etapes.map((e) => e.chapitre).filter(Boolean))] as string[]);

  export function aller(i: number) {
    n = i;
    vueCible = null;
    boite = null;
    const e = etapes[i];
    if (e?.page && app.page !== e.page) app.page = e.page;
  }
  function fermer(terminee = false) {
    const ou = n;
    n = -1;
    boite = null;
    quitter(ou, terminee);
  }

  // Suit la cible à chaque image : elle peut apparaître plus tard, défiler ou changer de taille
  function suivre() {
    const e = etape;
    // L'action attendue est faite : on laisse voir le résultat un instant, puis étape suivante
    if (e?.suite && !attente && document.querySelector(`[data-visite="${e.suite}"]`)) {
      const i = n;
      attente = setTimeout(() => ((attente = 0), n === i && aller(i + 1)), 1200);
    }
    const els = (e?.cible ?? "").split(" ").filter(Boolean).flatMap((c) => document.querySelector(`[data-visite="${c}"]`) ?? []);
    // L'élément montré a disparu après l'action (import terminé) : étape suivante
    if (!els.length && vueCible && !derniere) return aller(n + 1);
    const r = els.map((x) => x.getBoundingClientRect());
    boite = r.length ? union(r) : null;
    const h = bulle?.offsetHeight ?? 0, vh = innerHeight, marge = 14;
    if (els.length && els[0] !== vueCible && boite) {
      // Défile pour que l'élément et la bulle (dessous) tiennent ensemble à l'écran
      vueCible = els[0];
      const voulu = Math.max(70, (vh - boite.height - h - marge) / 2);
      scroller(els[0], boite.top - voulu);
    }
    const w = bulle?.offsetWidth ?? 0, vw = document.documentElement.clientWidth;
    gauche = boite ? Math.min(Math.max(marge, boite.left + boite.width / 2 - w / 2), vw - w - marge) : (vw - w) / 2;
    if (!boite) haut = Math.max(marge, (vh - h) / 2);
    else if (vh - boite.bottom - marge >= h + marge) haut = boite.bottom + marge;
    else if (boite.top - marge >= h + marge) haut = boite.top - h - marge;
    else haut = boite.top > vh - boite.bottom ? marge : vh - h - marge; // pas la place : le côté le plus grand
  }

  function union(r: DOMRect[]) {
    const top = Math.min(...r.map((x) => x.top)), left = Math.min(...r.map((x) => x.left));
    const bottom = Math.max(...r.map((x) => x.bottom)), right = Math.max(...r.map((x) => x.right));
    return { top, left, bottom, width: right - left, height: bottom - top };
  }

  // Fait défiler le premier parent défilable (la page ou la colonne de contenu)
  function scroller(el: Element, dy: number) {
    let p = el.parentElement;
    while (p && !(p.scrollHeight > p.clientHeight && /auto|scroll/.test(getComputedStyle(p).overflowY))) p = p.parentElement;
    (p ?? document.scrollingElement ?? document.documentElement).scrollBy({ top: dy, behavior: "smooth" });
  }

  onMount(() => {
    let id = 0;
    const boucle = () => (n >= 0 && suivre(), (id = requestAnimationFrame(boucle)));
    boucle();
    return () => cancelAnimationFrame(id);
  });
</script>

<svelte:window onkeydown={(e) => n >= 0 && e.key === "Escape" && fermer()} />

{#if etape}
  {#if boite}
    <div class="projecteur" style:top="{boite.top - 6}px" style:left="{boite.left - 6}px" style:width="{boite.width + 12}px" style:height="{boite.height + 12}px"></div>
  {:else}
    <div class="voile"></div>
  {/if}
  <div class="bulle" bind:this={bulle} style:top="{haut}px" style:left="{gauche}px" role="dialog" aria-live="polite" aria-label={etape.titre}>
    <p class="compte">
      {#if etape.chapitre}{etape.chapitre} · {t("chapitre {0} sur {1}", chapitres.indexOf(etape.chapitre) + 1, chapitres.length)}{:else}{t("Étape {0} sur {1}", n + 1, etapes.length)}{/if}
    </p>
    <h2>{etape.titre}</h2>
    <p>{etape.texte}</p>
    <div class="actions">
      {#if n === 0 && premiere}
        {@render premiere()}
      {:else if derniere}
        {#if derniereActions}{@render derniereActions()}{:else}<button class="principal" onclick={() => fermer(true)}>{t("Terminer")}</button>{/if}
      {:else}
        <button onclick={() => aller(n - 1)} disabled={n <= (premiere ? 1 : 0)}>{t("Précédent")}</button>
        <button class="lien" onclick={() => fermer()}>{t("Quitter")}</button>
        <button class="principal" onclick={() => aller(n + 1)}>{t("Suivant")}</button>
      {/if}
    </div>
  </div>
{:else if relancer}
  <button class="relancer principal" onclick={() => aller(1)}>{t("Visite guidée")}</button>
{/if}

<style>
  .projecteur,
  .voile {
    position: fixed;
    z-index: 90;
    pointer-events: none; /* on peut toucher ce qui est montré */
  }
  .projecteur {
    border-radius: 18px;
    box-shadow:
      0 0 0 3px var(--accent),
      0 0 0 100vmax rgb(0 0 0 / 0.45);
    transition: all 0.25s ease;
  }
  .voile {
    inset: 0;
    background: rgb(0 0 0 / 0.45);
  }
  .bulle {
    position: fixed;
    z-index: 91;
    width: min(380px, calc(100vw - 28px));
    background: var(--fond);
    color: var(--texte);
    border-radius: 20px;
    padding: 18px 18px 14px;
    box-shadow: 0 20px 50px -12px rgb(0 0 0 / 0.5);
    transition:
      top 0.25s ease,
      left 0.25s ease;
  }
  .compte {
    margin: 0;
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--accent-texte);
  }
  h2 {
    margin: 4px 0 6px;
    font-size: 1.15rem;
  }
  p {
    margin: 0;
    color: var(--doux);
    line-height: 1.45;
  }
  .actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    align-items: center;
    margin-top: 14px;
    flex-wrap: wrap;
  }
  .actions .lien {
    margin-right: auto;
  }
  .relancer {
    position: fixed;
    z-index: 80;
    left: 14px;
    bottom: calc(84px + env(safe-area-inset-bottom));
    border-radius: 999px;
    box-shadow: 0 10px 24px -8px rgb(0 0 0 / 0.45);
  }
  @media (max-width: 600px) {
    .bulle {
      padding: 14px 14px 12px;
    }
    .bulle h2 {
      font-size: 1.05rem;
    }
    .bulle p {
      font-size: 0.92rem;
    }
  }
  @media (min-width: 900px) {
    .relancer {
      bottom: 18px;
    }
  }
</style>
