<script lang="ts">
  import { t } from "./i18n.svelte";
  // Cadre de l'appli une fois déverrouillée : menu latéral sur PC, barre en bas sur téléphone.
  import BarreMobile from "./BarreMobile.svelte";
  import { annoncer, app, sauverParametres, verrouiller, type Page } from "./etat.svelte";
  import Icone from "./Icone.svelte";
  import Accueil from "./pages/Accueil.svelte";
  import Analyse from "./pages/Analyse.svelte";
  import Budgets from "./pages/Budgets.svelte";
  import Import from "./pages/Import.svelte";
  import Operations from "./pages/Operations.svelte";
  import Regles from "./pages/Regles.svelte";
  import Epargne from "./pages/Epargne.svelte";
  import Prets from "./pages/Prets.svelte";
  import Banques from "./pages/Banques.svelte";
  import Parametres from "./pages/Parametres.svelte";
  import Plus from "./pages/Plus.svelte";
  import Guide from "./pages/Guide.svelte";
  import Bienvenue from "./Bienvenue.svelte";
  import CarteMaj from "./CarteMaj.svelte";
  import VisiteDemo from "./VisiteDemo.svelte";
  const visite = (import.meta.env.MODE === "demo" || new URLSearchParams(location.search).has("visite")) && !new URLSearchParams(location.search).has("capture");
  import { maj } from "./maj.svelte";
  import Saisie from "./Saisie.svelte";
  import Synchro from "./Synchro.svelte";
  import { donnees, premiereDate, soldes } from "./donnees.svelte";
  import { bornes } from "./stats";
  import { argent } from "./format";

  const PAGES: [Page, "accueil" | "operations" | "budgets" | "analyse" | "parametres" | "epargne" | "pret" | "aide", string][] = [
    ["accueil", "accueil", t("Accueil")],
    ["operations", "operations", t("Opérations")],
    ["epargne", "epargne", t("Épargne")],
    ["prets", "pret", t("Prêts")],
    ["budgets", "budgets", t("Budgets")],
    ["analyse", "analyse", t("Analyse")],
    ["parametres", "parametres", t("Paramètres")],
    ["aide", "aide", t("Aide")],
  ];
  const AUTRES: Partial<Record<Page, string>> = { import: t("Importer"), regles: t("Règles"), banques: t("Banques et imports"), plus: t("Plus") };
  const titre = $derived(AUTRES[app.page] ?? PAGES.find((p) => p[0] === app.page)![2]);

  // Menu de gauche (PC) : vos comptes et leur solde, un clic affiche le tableau de bord du compte
  const principaux = $derived(donnees.comptes.filter((c) => !c.parentId && c.type !== "epargne"));
  const parCompte = $derived(soldes());
  const COULEURS = ["#378ADD", "#639922", "#D85A30", "#7F77DD", "#1D9E75", "#D4537E", "#BA7517"];
  const libelleMois = $derived(bornes(app.periode, premiereDate()).libelle);

  let synchro = $state(false);

  // Chaque changement de page entre dans l'historique : la flèche ← et le bouton retour d'Android ramènent à la page d'avant
  let depuisHistorique = false;
  let profondeur = 0;
  $effect(() => {
    const p = app.page;
    if (depuisHistorique) depuisHistorique = false;
    // Première page : elle remplace l'entrée de départ (sinon il faudrait deux « retour » pour quitter)
    else if (!history.state?.page) history.replaceState({ page: p, n: 0 }, "");
    else if (history.state.page !== p) {
      history.pushState({ page: p, n: profondeur + 1 }, "");
      profondeur++;
    }
  });
  function surRetour(e: PopStateEvent) {
    profondeur = e.state?.n ?? 0;
    const p = e.state?.page ?? "accueil";
    // Retour qui a seulement fermé une fenêtre : la page ne change pas
    if (p !== app.page) {
      depuisHistorique = true;
      app.page = p;
    }
  }
  const retour = () => (profondeur > 0 ? history.back() : (app.page = "accueil"));
  // Pages sans onglet : flèche sur téléphone (barre réduite) ; sur PC seulement pour celles absentes du menu
  const BARRE: Page[] = ["accueil", "operations", "budgets", "plus"];

  // Thème réellement affiché (le réglage « auto » suit l'appareil), et bascule clair ⇄ sombre d'un appui
  let systemeSombre = $state(matchMedia(t("(prefers-color-scheme: dark)")).matches);
  matchMedia(t("(prefers-color-scheme: dark)")).addEventListener("change", (e) => (systemeSombre = e.matches));
  const sombre = $derived(app.params.theme === "sombre" || (app.params.theme === "auto" && systemeSombre));
  function basculerTheme() {
    app.params.theme = sombre ? "clair" : "sombre";
    void sauverParametres();
  }

  function basculerDiscret() {
    app.params.discret = !app.params.discret;
    sauverParametres();
  }
</script>

<svelte:window onpopstate={surRetour} />

<div class="cadre">
  <aside class="lateral">
    <div class="marque">
      <span class="logo"><Icone nom="serrure" taille={18} /></span>
      <strong>{t("Sésame")}</strong>
    </div>
    {#each PAGES as [p, i, l] (p)}
      <button class="entree" class:actif={app.page === p} aria-current={app.page === p ? "page" : undefined} onclick={() => (app.page = p)}>
        <Icone nom={i} taille={19} />{l}
      </button>
    {/each}
    {#if principaux.length}
      <p class="rubrique">{t("Mes comptes")}</p>
      {#each principaux as c, k (c.id)}
        <button
          class="compte"
          class:choisi={app.page === "accueil" && app.filtreCompte === c.id}
          onclick={() => ((app.filtreCompte = app.filtreCompte === c.id ? "" : c.id), (app.page = "accueil"))}
        >
          <i style:background={COULEURS[k % COULEURS.length]}></i><span class="nom">{c.nom}</span><span class="montant">{argent(parCompte.get(c.id) ?? 0, c.devise)}</span>
        </button>
      {/each}
    {/if}
  </aside>

  <div class="contenu">
    <header>
      {#if !BARRE.includes(app.page)}
        <button class="rond fleche" class:partout={!!AUTRES[app.page]} aria-label={t("Retour")} onclick={retour}><Icone nom="retour" taille={20} /></button>
      {/if}
      <div>
        {#if app.page === "accueil" || app.page === "budgets" || app.page === "analyse"}<p class="mois">{libelleMois}</p>{/if}
        <h1>{titre}</h1>
      </div>
      <div class="outils">
        <button class="ajout-pc" onclick={() => (app.saisie = "depense")}>
          <Icone nom="plus" taille={18} />{t("Ajouter")}
        </button>
        <button class="rond" aria-label={app.params.discret ? t("Afficher les montants") : t("Masquer les montants")} aria-pressed={app.params.discret} onclick={basculerDiscret}>
          <Icone nom={app.params.discret ? "oeilBarre" : "oeil"} taille={20} />
        </button>
        <button class="rond" aria-label={sombre ? t("Passer en mode clair") : t("Passer en mode sombre")} title={sombre ? t("Mode clair") : t("Mode sombre")} onclick={basculerTheme}>
          <Icone nom={sombre ? "soleil" : "lune"} taille={20} />
        </button>
        <button class="rond pastille" class:active={app.params.aEnvoyer} aria-label={app.params.aEnvoyer ? t("Synchroniser : changements à envoyer") : t("Synchroniser mes appareils")} onclick={() => (synchro = true)}>
          <Icone nom="synchro" taille={20} />
        </button>
        <button class="rond" aria-label={t("Verrouiller")} onclick={verrouiller}><Icone nom="cadenas" taille={20} /></button>
      </div>
    </header>

    <main>
      {#if maj.dispo && maj.dispo.version !== app.params.majIgnoree}<CarteMaj fiche={maj.dispo} />{/if}
      {#if app.page === "accueil"}
        <Accueil />
      {:else if app.page === "parametres"}
        <Parametres />
      {:else if app.page === "operations"}
        <Operations />
      {:else if app.page === "import"}
        <Import />
      {:else if app.page === "prets"}
        <Prets />
      {:else if app.page === "epargne"}
        <Epargne />
      {:else if app.page === "regles"}
        <Regles />
      {:else if app.page === "banques"}
        <Banques />
      {:else if app.page === "budgets"}
        <Budgets />
      {:else if app.page === "aide"}
        <Guide synchro={() => (synchro = true)} />
      {:else if app.page === "plus"}
        <Plus synchro={() => (synchro = true)} />
      {:else if app.page === "analyse"}
        <Analyse />
      {/if}
    </main>
  </div>
</div>

<div class="mobile"><BarreMobile /></div>

<!-- Démo du site : visite guidée -->
{#if visite}<VisiteDemo />{/if}

<!-- Premier lancement : guide, seulement tant que le coffre est vide -->
{#if app.revoirGuide || (!app.params.guideVu && !donnees.comptes.length && !donnees.operations.length)}<Bienvenue />{/if}

{#if synchro}<Synchro fermer={() => (synchro = false)} />{/if}

{#if app.saisie}<Saisie type={app.saisie} fermer={() => (app.saisie = "")} />{/if}

{#if app.message}<div class="toast" role="status">{app.message}</div>{/if}

<style>
  .cadre {
    display: flex;
    min-height: 100vh;
  }
  .lateral {
    width: 248px;
    flex: none;
    background: var(--fond);
    border-right: 1px solid var(--bord);
    padding: 22px 14px;
    position: sticky;
    top: 0;
    height: 100vh;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .marque {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 10px 22px;
    font-size: 17px;
    font-weight: 800;
  }
  .logo {
    width: 32px;
    height: 32px;
    border-radius: 11px;
    background: var(--accent);
    color: var(--sur-accent);
    display: grid;
    place-items: center;
  }
  .entree {
    justify-content: flex-start;
    gap: 12px;
    background: transparent;
    color: var(--doux);
    border-radius: 12px;
    padding: 10px 12px;
  }
  .entree:hover {
    color: var(--texte);
  }
  .entree.actif {
    background: var(--surface);
    color: var(--texte);
  }
  .contenu {
    flex: 1;
    min-width: 0;
  }
  header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: max(16px, env(safe-area-inset-top)) 20px 8px;
  }
  .outils {
    margin-left: auto;
    display: flex;
    gap: 6px;
  }
  .rond {
    width: 40px;
    height: 40px;
    padding: 0;
    border-radius: 50%;
    background: var(--surface);
  }
  .fleche {
    display: none;
    flex: none;
  }
  .fleche.partout {
    display: inline-flex;
  }
  .ajout-pc {
    background: var(--accent);
    color: var(--sur-accent);
    padding: 9px 18px;
  }
  main {
    padding: 8px 24px 32px;
  }
  .mois {
    font-size: 12px;
    color: var(--doux);
  }
  .mois::first-letter {
    text-transform: uppercase;
  }
  .rubrique {
    font-size: 12px;
    color: var(--doux);
    margin: 18px 12px 6px;
  }
  .compte {
    justify-content: flex-start;
    border: none;
    background: transparent;
    border-radius: 12px;
    padding: 7px 12px;
    font-size: 13px;
    gap: 8px;
  }
  .compte.choisi {
    background: var(--accent-fond);
  }
  .compte i {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex: none;
  }
  .compte .nom {
    flex: 1;
    text-align: left;
    color: var(--doux);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .toast {
    position: fixed;
    left: 50%;
    transform: translateX(-50%);
    top: max(16px, env(safe-area-inset-top));
    background: var(--texte);
    color: var(--fond);
    padding: 10px 18px;
    border-radius: 999px;
    font-size: 14px;
    z-index: 20;
    max-width: calc(100% - 32px);
  }
  .mobile {
    display: none;
  }
  @media (max-width: 899px) {
    .lateral,
    .ajout-pc {
      display: none;
    }
    .mobile {
      display: contents;
    }
    .fleche {
      display: inline-flex;
    }
    /* Titre sur une ligne, même à côté de la flèche et des boutons */
    h1 {
      font-size: 24px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    header > div:not(.outils) {
      min-width: 0;
    }
    /* La période est déjà rappelée par le sélecteur compact */
    .mois {
      display: none;
    }
    header {
      padding: max(14px, env(safe-area-inset-top)) 16px 6px;
    }
    main {
      padding: 6px 14px calc(110px + env(safe-area-inset-bottom));
    }
  }
  /* Pastille orange : des changements attendent d'être envoyés à l'autre appareil */
  .pastille {
    position: relative;
  }
  .pastille.active::after {
    content: "";
    position: absolute;
    top: 6px;
    right: 6px;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: #d85a30;
    box-shadow: 0 0 0 2px var(--surface);
  }
</style>
