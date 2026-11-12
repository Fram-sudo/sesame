<script lang="ts">
  import { t } from "./i18n.svelte";
  // Choix de ce qu'on regarde (tous les comptes, une banque, un compte) et de la période
  // (mois, trimestre, année, tout, personnalisée), partagé par le tableau de bord, les budgets et l'analyse.
  import { donnees, premiereDate, soldes } from "./donnees.svelte";
  import { app } from "./etat.svelte";
  import { argent } from "./format";
  import Feuille from "./Feuille.svelte";
  import Icone from "./Icone.svelte";
  import { bornes, deplacer, estEnCours, filtreBanque, moisCourant, type Mode } from "./stats";

  let { sansComptes = false }: { sansComptes?: boolean } = $props();
  const courants = $derived(donnees.comptes.filter((c) => !c.parentId && c.type !== "epargne"));
  // Banques ayant plusieurs comptes : on peut les regarder ensemble
  const banques = $derived.by(() => {
    const g = new Map<string, typeof courants>();
    for (const c of courants) {
      const b = c.banque.trim() || t("Autres");
      g.set(b, [...(g.get(b) ?? []), c]);
    }
    return [...g];
  });
  const b = $derived(bornes(app.periode, premiereDate()));
  const enCours = $derived(estEnCours(b));
  const MODES: [Mode, string][] = [
    ["mois", t("Mois")],
    ["trimestre", t("Trimestre")],
    ["annee", t("Année")],
    ["tout", t("Tout")],
    ["perso", t("Dates…")],
  ];

  function choisirMode(mode: Mode) {
    // En passant à « Dates… », on part de la période affichée
    if (mode === "perso" && app.periode.mode !== "perso") app.periode = { ...app.periode, mode, de: b.de, fin: b.fin > new Date().toISOString().slice(0, 10) ? new Date().toISOString().slice(0, 10) : b.fin };
    else app.periode = { ...app.periode, mode };
  }
  const parCompte = $derived(soldes());
  let ouvert = $state(false);
  const nomPerimetre = $derived.by(() => {
    const f = app.filtreCompte;
    if (!f) return t("Tous les comptes");
    if (f.startsWith("banque:")) return f.slice(7);
    return donnees.comptes.find((c) => c.id === f)?.nom ?? t("Tous les comptes");
  });
  const revenir = () => (app.periode = { ...app.periode, ...moisCourant() });
</script>

{#snippet reglages()}
<div class="periode">
  {#if courants.length > 1 && !sansComptes}
    <div class="comptes" role="radiogroup" aria-label={t("Comptes affichés")}>
      <button role="radio" aria-checked={!app.filtreCompte} class:actif={!app.filtreCompte} onclick={() => (app.filtreCompte = "")}>{t("Tous les comptes")}</button>
      {#each banques as [banque, liste] (banque)}
        {#if liste.length > 1}
          {@const f = filtreBanque(banque)}
          <button role="radio" aria-checked={app.filtreCompte === f} class:actif={app.filtreCompte === f} class="banque" onclick={() => (app.filtreCompte = f)}>
            {banque} <span class="nb">{liste.length}</span>
          </button>
        {/if}
        {#each liste as c (c.id)}
          <button role="radio" aria-checked={app.filtreCompte === c.id} class:actif={app.filtreCompte === c.id} onclick={() => (app.filtreCompte = c.id)}>{c.nom}</button>
        {/each}
      {/each}
    </div>
  {/if}

  <div class="temps">
    <div class="modes" role="radiogroup" aria-label={t("Période")}>
      {#each MODES as [m, nom] (m)}
        <button role="radio" aria-checked={app.periode.mode === m} class:actif={app.periode.mode === m} onclick={() => choisirMode(m)}>{nom}</button>
      {/each}
    </div>
    {#if app.periode.mode === "perso"}
      <div class="dates">
        <label><span class="sous">{t("Du")}</span><input type="date" bind:value={app.periode.de} max={app.periode.fin} /></label>
        <label><span class="sous">{t("au")}</span><input type="date" bind:value={app.periode.fin} min={app.periode.de} /></label>
      </div>
    {:else if app.periode.mode === "tout"}
      <span class="libelle">{b.libelle}</span>
    {:else}
      <div class="nav">
        <button class="rond" aria-label={t("Période précédente")} onclick={() => (app.periode = deplacer(app.periode, -1))}><Icone nom="retour" taille={18} /></button>
        <span class="libelle">{b.libelle}</span>
        <button class="rond suivant" aria-label={t("Période suivante")} onclick={() => (app.periode = deplacer(app.periode, 1))} disabled={enCours}><Icone nom="retour" taille={18} /></button>
        {#if !enCours}<button class="lien" onclick={revenir}>{t("Aujourd'hui")}</button>{/if}
      </div>
    {/if}
  </div>
</div>
{/snippet}

<!-- PC : tous les réglages visibles. Téléphone : une ligne résumée, un appui ouvre les réglages. -->
<div class="large">{@render reglages()}</div>

<div class="compact">
  {#if app.periode.mode === "mois" || app.periode.mode === "trimestre" || app.periode.mode === "annee"}
    <button class="rond" aria-label={t("Période précédente")} onclick={() => (app.periode = deplacer(app.periode, -1))}><Icone nom="retour" taille={18} /></button>
  {/if}
  <button class="resume" aria-haspopup="dialog" onclick={() => (ouvert = true)}>
    <strong>{b.libelle.charAt(0).toUpperCase() + b.libelle.slice(1)}</strong>
    <span class="sous">{sansComptes ? t("Changer de période") : nomPerimetre} ▾</span>
  </button>
  {#if app.periode.mode === "mois" || app.periode.mode === "trimestre" || app.periode.mode === "annee"}
    <button class="rond suivant" aria-label={t("Période suivante")} onclick={() => (app.periode = deplacer(app.periode, 1))} disabled={enCours}><Icone nom="retour" taille={18} /></button>
  {/if}
</div>

<!-- Panneau du téléphone : la période d'abord, puis les comptes en liste, une ligne par choix -->
{#if ouvert}
  <Feuille titre={t("Ce que vous regardez")} fermer={() => (ouvert = false)}>
    <section class="bloc">
      <h3>{t("Période")}</h3>
      <div class="segments" role="radiogroup" aria-label={t("Durée")}>
        {#each MODES.slice(0, 4) as [m, nom] (m)}
          <button role="radio" aria-checked={app.periode.mode === m} class:actif={app.periode.mode === m} onclick={() => choisirMode(m)}>{nom}</button>
        {/each}
      </div>
      {#if app.periode.mode === "perso"}
        <div class="dates-panneau">
          <label>{t("Du")}<input type="date" bind:value={app.periode.de} max={app.periode.fin} /></label>
          <label>{t("Au")}<input type="date" bind:value={app.periode.fin} min={app.periode.de} /></label>
        </div>
      {:else if app.periode.mode !== "tout"}
        <div class="nav-panneau">
          <button class="rond" aria-label={t("Période précédente")} onclick={() => (app.periode = deplacer(app.periode, -1))}><Icone nom="retour" taille={18} /></button>
          <strong class="libelle">{b.libelle}</strong>
          <button class="rond suivant" aria-label={t("Période suivante")} onclick={() => (app.periode = deplacer(app.periode, 1))} disabled={enCours}><Icone nom="retour" taille={18} /></button>
        </div>
      {/if}
      <div class="liens">
        {#if app.periode.mode !== "perso"}<button class="lien" onclick={() => choisirMode("perso")}>{t("Choisir des dates précises")}</button>{/if}
        {#if !enCours && app.periode.mode !== "tout"}<button class="lien" onclick={revenir}>{t("Revenir à aujourd'hui")}</button>{/if}
      </div>
    </section>

    {#if courants.length > 1 && !sansComptes}
      <section class="bloc">
        <h3>{t("Comptes")}</h3>
        <div class="liste" role="radiogroup" aria-label={t("Comptes affichés")}>
          <button role="radio" aria-checked={!app.filtreCompte} class:actif={!app.filtreCompte} onclick={() => (app.filtreCompte = "")}>
            <span>{t("Tous les comptes")}<small>{courants.length} {t("comptes")}</small></span>{#if !app.filtreCompte}<span class="coche"><Icone nom="coche" taille={20} /></span>{/if}
          </button>
          {#each banques as [banque, liste] (banque)}
            {#if liste.length > 1}
              {@const f = filtreBanque(banque)}
              <button role="radio" aria-checked={app.filtreCompte === f} class:actif={app.filtreCompte === f} onclick={() => (app.filtreCompte = f)}>
                <span>{t("Toute la banque")} {banque}<small>{liste.length} {t("comptes")}</small></span>{#if app.filtreCompte === f}<span class="coche"><Icone nom="coche" taille={20} /></span>{/if}
              </button>
            {/if}
            {#each liste as c (c.id)}
              <button role="radio" aria-checked={app.filtreCompte === c.id} class:actif={app.filtreCompte === c.id} class:retrait={liste.length > 1} onclick={() => (app.filtreCompte = c.id)}>
                <span>{c.nom}<small>{banque}</small></span><span class="montant">{argent(parCompte.get(c.id) ?? 0, c.devise)}</span>
              </button>
            {/each}
          {/each}
        </div>
      </section>
    {/if}
    <button class="principal" onclick={() => (ouvert = false)}>{t("Voir")}</button>
  </Feuille>
{/if}

<style>
  .periode {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .comptes {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    max-width: 100%;
    scrollbar-width: none;
  }
  .comptes button {
    padding: 7px 14px;
    font-size: 14px;
    white-space: nowrap;
    flex: none;
  }
  .comptes .banque {
    font-weight: 600;
  }
  .nb {
    font-size: 11px;
    background: var(--surface-2);
    border-radius: 999px;
    padding: 0 7px;
    margin-left: 4px;
  }
  .comptes .actif {
    background: var(--accent);
    color: var(--sur-accent);
    border-color: var(--accent);
  }
  .comptes .actif .nb {
    background: rgba(255, 255, 255, 0.25);
  }
  .temps {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .modes {
    display: flex;
    gap: 4px;
    background: var(--surface-2);
    padding: 4px;
    border-radius: 999px;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .modes button {
    border: none;
    background: transparent;
    padding: 6px 13px;
    font-size: 14px;
    white-space: nowrap;
  }
  .modes .actif {
    background: var(--surface);
    font-weight: 600;
  }
  .nav,
  .dates {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .dates label {
    flex-direction: row;
    align-items: center;
    gap: 6px;
  }
  .dates input {
    padding: 7px 10px;
    width: auto;
  }
  .libelle {
    min-width: 130px;
    text-align: center;
    font-weight: 600;
  }
  .libelle::first-letter {
    text-transform: uppercase;
  }
  .rond {
    width: 36px;
    height: 36px;
    padding: 0;
    border-radius: 50%;
  }
  .suivant :global(svg) {
    transform: scaleX(-1);
  }
  .compact {
    display: none;
  }
  @media (max-width: 899px) {
    .large {
      display: none;
    }
    .compact {
      display: flex;
      align-items: center;
      gap: 8px;
    }
  }
  .bloc {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  h3 {
    font-size: 16px;
    font-weight: 800;
  }
  .bloc + .bloc {
    margin-top: 8px;
  }
  .segments {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    background: var(--surface);
    border-radius: 999px;
    padding: 4px;
  }
  .segments button {
    background: none;
    padding: 9px 4px;
    font-size: 14px;
  }
  .segments .actif {
    background: var(--fond);
    box-shadow: 0 1px 3px rgba(10, 12, 20, 0.12);
  }
  .nav-panneau {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--surface);
    border-radius: 16px;
    padding: 6px;
  }
  .nav-panneau .rond {
    background: var(--fond);
  }
  .dates-panneau {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .liens {
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }
  .liens .lien {
    font-size: 14px;
  }
  .liste {
    display: flex;
    flex-direction: column;
    background: var(--surface);
    border-radius: 18px;
    overflow: hidden;
  }
  .liste button {
    justify-content: space-between;
    background: none;
    border-radius: 0;
    padding: 12px 16px;
    text-align: left;
    border-bottom: 1px solid var(--bord);
    font-weight: 700;
  }
  .liste button:last-child {
    border-bottom: none;
  }
  .liste button > span:first-child {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .liste small {
    font-size: 12px;
    font-weight: 600;
    color: var(--doux);
  }
  .liste .retrait {
    padding-left: 30px;
  }
  .liste .actif {
    background: var(--accent-fond);
    color: var(--accent-texte);
  }
  .coche {
    display: flex;
    color: var(--accent);
  }
  .resume {
    flex: 1;
    min-width: 0;
    flex-direction: column;
    align-items: center;
    gap: 1px;
    padding: 8px 14px;
    border-radius: 18px;
  }
  .resume .sous {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }
</style>
