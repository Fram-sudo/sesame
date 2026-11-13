<script lang="ts">
  import Choix from "../Choix.svelte";
  import { t } from "../i18n.svelte";
  import { detecterRecurrences, libelleLisible } from "../categories";
  import { donnees, type Operation } from "../donnees.svelte";
  import DeplacerOps from "../DeplacerOps.svelte";
  import Feuille from "../Feuille.svelte";
  import IconeCategorie from "../IconeCategorie.svelte";
  import OperationFiche from "../OperationFiche.svelte";
  import { app } from "../etat.svelte";
  import { argent, dateCourte, dateLongue } from "../format";
  import Icone from "../Icone.svelte";
  import { normaliser } from "../import/analyse";
  import Periode from "../Periode.svelte";
  import { premiereDate } from "../donnees.svelte";
  import { bornes } from "../stats";
  import { tauxConnus } from "../taux";
  import { deviseAffichee } from "../etat.svelte";

  let recherche = $state("");
  // Compte choisi sur le tableau de bord : on le reprend
  let compteId = $state(app.filtreCompte.startsWith("banque:") ? "" : app.filtreCompte);
  const b = $derived(bornes(app.periode, premiereDate()));
  let limite = $state(150);
  // Filtre éventuellement demandé depuis le tableau de bord (« Les classer »)
  let categorieId = $state(app.filtreCategorie);
  app.filtreCategorie = "";
  let fiche = $state<Operation | null>(null);
  let voirRecurrentes = $state(false);
  let deplacer = $state(false);

  const categories = $derived(new Map(donnees.categories.map((c) => [c.id, c])));
  const recurrentes = $derived(voirRecurrentes ? detecterRecurrences(donnees.operations) : []);

  const comptes = $derived(new Map(donnees.comptes.map((c) => [c.id, c])));
  const filtrees = $derived.by(() => {
    const q = normaliser(recherche);
    return donnees.operations
      .filter(
        (o) =>
          (!compteId || o.compteId === compteId) &&
          // Une recherche porte sur toutes les dates ; sinon, la période choisie en haut
          (!!q || (o.date >= b.de && o.date <= b.fin)) &&
          (!categorieId || (categorieId === "aucune" ? !o.categorieId : o.categorieId === categorieId)) &&
          (!q || normaliser(`${o.libelle} ${o.detail ?? ""} ${o.note ?? ""}`).includes(q)),
      )
      .sort((a, b) => b.date.localeCompare(a.date));
  });
  // Totaux de ce qui est affiché (virements entre vos comptes exclus), dans la devise d'affichage
  const totaux = $derived.by(() => {
    const taux = tauxConnus(app.params.taux, app.params.tauxManuels);
    const dev = deviseAffichee();
    let depenses = 0;
    let revenus = 0;
    for (const o of filtrees) {
      const c = comptes.get(o.compteId);
      if (!c || o.virementId || categories.get(o.categorieId ?? "")?.type === "virement" || !taux[c.devise]) continue;
      const v = Math.round((o.montant * taux[dev]) / taux[c.devise]);
      if (v < 0) depenses -= v;
      else revenus += v;
    }
    return { depenses, revenus, dev };
  });
  // Regroupement par jour pour l'affichage
  const jours = $derived.by(() => {
    const g: [string, typeof filtrees][] = [];
    for (const o of filtrees.slice(0, limite)) {
      if (g.at(-1)?.[0] !== o.date) g.push([o.date, []]);
      g.at(-1)![1].push(o);
    }
    return g;
  });
</script>

<div class="pile">
  {#if !recherche}<Periode sansComptes />{/if}
  <label class="recherche">
    <Icone nom="recherche" taille={18} />
    <input type="search" placeholder={t("Rechercher un libellé (toutes dates)")} aria-label={t("Rechercher")} bind:value={recherche} />
  </label>
  <div class="filtres">
    {#if donnees.comptes.length > 1}
      <Choix bind:valeur={compteId} titre={t("Compte")} classe="pastille" actif={!!compteId} options={[{ v: "", l: t("Tous les comptes") }, ...donnees.comptes.map((c) => ({ v: c.id, l: c.nom }))]} />
    {/if}
    <Choix bind:valeur={categorieId} titre={t("Catégorie")} classe="pastille" actif={!!categorieId} options={[{ v: "", l: t("Toutes catégories") }, { v: "aucune", l: t("Sans catégorie") }, ...donnees.categories.map((c) => ({ v: c.id, l: c.nom, cat: c.id }))]} />
    <button class="pastille" onclick={() => (voirRecurrentes = true)}>{t("Récurrentes")}</button>
    <button class="pastille" onclick={() => (app.page = "import")}><Icone nom="importer" taille={16} />{t("Importer")}</button>
  </div>

  {#if filtrees.length}
    <div class="totaux">
      <span class="sous">{filtrees.length} {t("opération")}{filtrees.length > 1 ? "s" : ""}{recherche ? t(" (toutes dates)") : ""}</span>
      <span>
        {#if totaux.depenses}<span class="montant">−{argent(totaux.depenses, totaux.dev)}</span>{/if}
        {#if totaux.revenus}<span class="montant positif">+{argent(totaux.revenus, totaux.dev)}</span>{/if}
      </span>
    </div>
  {/if}

  {#if donnees.operations.length === 0}
    <div class="carte pile vide">
      <h2>{t("Aucune opération")}</h2>
      <p class="sous">{t("Importez un relevé de votre banque pour voir vos opérations ici.")}</p>
      <button class="principal" onclick={() => (app.page = "import")}>{t("Importer un relevé")}</button>
    </div>
  {:else if filtrees.length === 0}
    <p class="sous">{t("Aucune opération")} {recherche ? t("ne correspond") : t("sur cette période")}.</p>
  {:else}
    {#if recherche || compteId || categorieId}
      <div class="resultat">
        <button class="lien" onclick={() => (deplacer = true)}>{t("Déplacer ces opérations vers un autre compte…")}</button>
      </div>
    {/if}
    {#each jours as [date, ops] (date)}
      <section class="jour">
        <h3>{dateLongue(date)}</h3>
        {#each ops as o (o.id)}
          {@const c = comptes.get(o.compteId)}
          {@const cat = o.categorieId ? categories.get(o.categorieId) : undefined}
          <button class="op" data-visite="operation" onclick={() => (fiche = o)}>
            <IconeCategorie id={o.categorieId} taille={40} />
            <span class="texte">
              <span class="libelle">{#if o.enAttente}<span class="attente">{t("en attente")}</span> {/if}{libelleLisible(o.libelle)}</span>
              <span class="sous">{cat?.nom ?? t("Sans catégorie")} · {c?.nom}{o.note ? ` · ${o.note}` : ""}</span>
            </span>
            <span class="montant" class:positif={o.montant > 0} class:neutre={!!o.virementId}>{argent(o.montant, c?.devise ?? "EUR", true)}</span>
          </button>
        {/each}
      </section>
    {/each}
    {#if filtrees.length > limite}
      <button onclick={() => (limite += 300)}>{t("Afficher plus (")}{filtrees.length - limite} {t("restantes)")}</button>
    {/if}
  {/if}
</div>

{#if deplacer}<DeplacerOps ops={filtrees} {recherche} fermer={() => (deplacer = false)} />{/if}

{#if fiche}<OperationFiche op={fiche} fermer={() => (fiche = null)} />{/if}

{#if voirRecurrentes}
  <Feuille titre={t("Opérations récurrentes")} fermer={() => (voirRecurrentes = false)}>
    <p class="sous">{t("Repérées automatiquement : même libellé, au moins 3 fois, à intervalle régulier.")}</p>
    {#each recurrentes as r (r.compteId + r.motif)}
      {@const c = comptes.get(r.compteId)}
      <div class="rec">
        <span class="texte">
          <span class="libelle">{r.libelle}</span>
          <span class="sous">{r.frequence} {t("· prochaine vers le")} {dateCourte(r.prochaine)} · {c?.nom}</span>
        </span>
        <span class="montant" class:positif={r.montant > 0}>{r.variable ? "≈ " : ""}{argent(r.montant, c?.devise ?? "EUR", true)}</span>
      </div>
    {:else}
      <p>{t("Aucune pour l'instant : il faut au moins 3 occurrences d'une même opération.")}</p>
    {/each}
  </Feuille>
{/if}

<style>
  /* Filtres en petites pastilles sur une ligne (défilement horizontal si besoin) */
  .filtres {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .pastille {
    flex: none;
    width: auto;
    padding: 7px 14px;
    border-radius: 999px;
    font-size: 14px;
    gap: 6px;
  }
  .totaux {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 10px;
    padding: 0 4px;
  }
  .totaux .montant {
    font-weight: 600;
    margin-left: 10px;
  }
  .recherche {
    flex-direction: row;
    align-items: center;
    gap: 8px;
    background: var(--surface);
    border: 1px solid var(--bord);
    border-radius: 999px;
    padding: 0 14px;
  }
  .recherche input {
    border: none;
    background: transparent;
    padding: 11px 0;
  }
  .recherche input:focus-visible {
    outline: none;
  }
  .resultat {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .vide {
    text-align: center;
    padding: 32px 20px;
    align-items: center;
  }
  /* Liste à plat, groupée par jour, comme dans les applis de banque */
  .jour {
    padding: 0;
  }
  h3 {
    font-size: 13px;
    font-weight: 700;
    color: var(--doux);
    margin: 8px 0 2px;
  }
  h3::first-letter {
    text-transform: uppercase;
  }
  .op,
  .rec {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 0;
    width: 100%;
    text-align: left;
  }
  .op {
    border-radius: 14px;
    background: transparent;
    padding: 10px 8px;
    margin: 0 -8px;
    width: calc(100% + 16px);
    font-weight: 500;
  }
  .op:hover {
    background: var(--surface);
  }
  .op .libelle {
    font-weight: 700;
  }
  .op .texte,
  .rec .texte {
    flex: 1;
  }
  .rec + .rec {
    border-top: 1px solid var(--bord);
  }
  .attente {
    font-size: 11px;
    background: var(--alerte-fond);
    color: var(--alerte);
    border-radius: 999px;
    padding: 1px 8px;
    margin-right: 4px;
  }
  .neutre {
    color: var(--doux);
  }
  .texte {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .libelle {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .montant {
    flex: none;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }
  .positif {
    color: var(--ok);
  }
</style>
