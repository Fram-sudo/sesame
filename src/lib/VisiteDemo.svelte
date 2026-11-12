<script lang="ts">
  // Démo du site : visite guidée. Une bulle montre où toucher, la page change toute seule ;
  // le visiteur peut faire l'action lui-même (l'étape avance) ou lire et passer.
  import { onMount } from "svelte";
  import { app, type Page } from "./etat.svelte";
  import { t } from "./i18n.svelte";

  // cible : un ou plusieurs repères data-visite (séparés par une espace), encadrés ensemble
  // Démo affichée dans la page du site (et non ouverte en plein écran)
  const dansLeSite = (() => {
    try {
      return window.top !== window;
    } catch {
      return true;
    }
  })();
  type Etape = { page?: Page; cible?: string; titre: string; texte: string; suite?: string };
  const ETAPES: Etape[] = $derived([
    { page: "accueil", titre: t("Bienvenue dans la démo de Sésame"), texte: t("Tout est fictif et rien n'est enregistré : touchez ce que vous voulez. La visite dure une minute.") + (dansLeSite ? " " + t("Au-dessus de la démo, les boutons « Téléphone » et « Ordinateur » vous montrent les deux versions.") : "") },
    { page: "accueil", cible: "solde", titre: t("Votre argent vraiment disponible"), texte: t("Le chiffre du haut, c'est ce que vous pouvez dépenser : l'épargne est mise à part. Touchez « en euros » pour tout afficher en francs CFA ou en dollars.") },
    { page: "import", cible: "import", titre: t("Importez un relevé"), texte: t("Touchez « Choisir des fichiers » : un relevé d'exemple est chargé. Sésame reconnaît la banque et le compte tout seul."), suite: "verifier" },
    { page: "import", cible: "verifier", titre: t("Une vérification, une seule fois"), texte: t("Pour un format jamais vu, Sésame montre ce qu'il a compris : dates, libellés, montants. Touchez « C'est bon » : les relevés suivants seront reconnus tout seuls, quelle que soit la banque ou la langue.") },
    { page: "import", cible: "fichier importer", titre: t("Les doublons sont écartés"), texte: t("Seules les nouvelles opérations sont gardées. Touchez « Tout importer » : elles sont rangées dans leurs catégories automatiquement."), suite: "importe" },
    { page: "operations", cible: "operation", titre: t("Classez en un geste"), texte: t("Touchez une opération pour changer sa catégorie. Sésame retient votre choix pour les prochaines fois.") },
    { page: "budgets", cible: "budgets", titre: t("Des budgets qui préviennent"), texte: t("Ce qu'il vous reste pour le mois, et par jour. L'appli vous alerte quand le rythme de dépense dérape.") },
    { page: "analyse", cible: "prevision", titre: t("Pas de mauvaise surprise"), texte: t("Salaire, loyer et abonnements à leur date : la prévision montre votre argent sur les 3 prochains mois.") },
    { page: "epargne", cible: "epargne", titre: t("Épargne et poches"), texte: t("Livrets, poches Revolut, tirelire : votre épargne est suivie à part, avec des objectifs.") },
    { titre: t("PC et téléphone, sans cloud"), texte: t("Vos appareils s'échangent leurs changements par un simple fichier. Tout reste chiffré chez vous : aucun compte, aucun serveur.") },
  ]);

  let n = $state(-1);
  let boite = $state<{ top: number; left: number; width: number; height: number; bottom: number } | null>(null);
  let bulle = $state<HTMLElement>();
  let haut = $state(0);
  let gauche = $state(0);
  let vueCible: Element | null = null;
  let attente = 0;
  const etape = $derived(n >= 0 ? ETAPES[n] : undefined);
  const derniere = $derived(n === ETAPES.length - 1);

  function aller(i: number) {
    n = i;
    vueCible = null;
    boite = null;
    const e = ETAPES[i];
    if (e?.page && app.page !== e.page) app.page = e.page;
  }
  const fermer = () => ((n = -1), (boite = null));

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
    const depart = setTimeout(() => aller(0), 1800); // après le chargement des données fictives
    return () => (cancelAnimationFrame(id), clearTimeout(depart));
  });
</script>

{#if etape}
  {#if boite}
    <div class="projecteur" style:top="{boite.top - 6}px" style:left="{boite.left - 6}px" style:width="{boite.width + 12}px" style:height="{boite.height + 12}px"></div>
  {:else}
    <div class="voile"></div>
  {/if}
  <div class="bulle" bind:this={bulle} style:top="{haut}px" style:left="{gauche}px" role="dialog" aria-live="polite" aria-label={etape.titre}>
    <p class="compte">{t("Étape {0} sur {1}", n + 1, ETAPES.length)}</p>
    <h2>{etape.titre}</h2>
    <p>{etape.texte}</p>
    <div class="actions">
      {#if n === 0}
        <button onclick={fermer}>{t("Explorer seul")}</button>
        <button class="principal" onclick={() => aller(1)}>{t("Commencer la visite")}</button>
      {:else if derniere}
        <button onclick={fermer}>{t("Continuer à explorer")}</button>
        <a class="bouton-lien principal" href="../#installer" target="_top">{t("Télécharger Sésame")}</a>
      {:else}
        <button onclick={() => aller(n - 1)} disabled={n <= 1}>{t("Précédent")}</button>
        <button class="lien" onclick={fermer}>{t("Quitter")}</button>
        <button class="principal" onclick={() => aller(n + 1)}>{t("Suivant")}</button>
      {/if}
    </div>
  </div>
{:else}
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
  .bouton-lien {
    text-decoration: none;
    padding: 10px 16px;
    border-radius: 999px;
    font-weight: 700;
    background: var(--accent);
    color: var(--sur-accent);
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
