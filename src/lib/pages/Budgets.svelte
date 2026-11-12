<script lang="ts">
  import { t } from "../i18n.svelte";
  import { tauxConnus } from "../taux";
  // Budgets : reste à dépenser, alerte avant dépassement, budgets mensuels et annuels, plafond global.
  // Toucher un budget (ou une catégorie) ouvre la modification rapide.
  import Aide from "../Aide.svelte";
  import BudgetEditeur from "../BudgetEditeur.svelte";
  import { donnees, ecrire, premiereDate } from "../donnees.svelte";
  import { annoncer, app, deviseAffichee } from "../etat.svelte";
  import { argent, dateCourte } from "../format";
  import Icone from "../Icone.svelte";
  import IconeCategorie from "../IconeCategorie.svelte";
  import Periode from "../Periode.svelte";
  import { bornes, estEnCours, etatBudgets, facteurBudget, flux, joursRestants, moyenne, perimetre, type Contexte, type EtatBudget } from "../stats";

  const ctx: Contexte = $derived({ ops: donnees.operations, comptes: donnees.comptes, categories: donnees.categories, taux: tauxConnus(app.params.taux), devise: deviseAffichee() });
  const devise = $derived(perimetre(ctx, app.filtreCompte).devise);
  const b = $derived(bornes(app.periode, premiereDate()));
  const enCours = $derived(estEnCours(b));
  const f = $derived(flux(ctx, app.filtreCompte, { de: b.de, fin: b.fin }));
  const etats = $derived(etatBudgets(ctx, app.filtreCompte, b, donnees.budgets));
  const categories = $derived(new Map(donnees.categories.map((c) => [c.id, c])));

  const global = $derived(etats.find((e) => e.id === "global"));
  const mensuels = $derived(etats.filter((e) => e.id !== "global" && e.frequence === "mois" && categories.has(e.id)).sort((a, z) => z.depense / z.budget - a.depense / a.budget));
  const annuels = $derived(etats.filter((e) => e.id !== "global" && e.frequence === "annee" && categories.has(e.id)));

  // Reste à dépenser : d'après le plafond global s'il existe, sinon la somme des budgets mensuels
  const plafond = $derived(global?.budget ?? mensuels.reduce((a, e) => a + e.budget, 0));
  const depenseSuivie = $derived(global ? global.depense : mensuels.reduce((a, e) => a + e.depense, 0));
  const reste = $derived(plafond - depenseSuivie);
  const jours = $derived(enCours ? joursRestants(b.fin) : 0);

  // Catégories sans budget, les plus dépensières d'abord ; les inutilisées repliées
  const moy = $derived(moyenne(ctx, app.filtreCompte, b.mois[0], 3));
  const avecBudget = $derived(new Set(donnees.budgets.map((x) => x.id)));
  const sansBudget = $derived(
    donnees.categories
      .filter((c) => c.type === "depense" && !avecBudget.has(c.id))
      .map((c) => ({ c, depense: Math.max(0, f.parCategorie.get(c.id) ?? 0), moyenne: Math.max(0, moy.parCategorie.get(c.id) ?? 0) }))
      .sort((a, z) => z.depense + z.moyenne - (a.depense + a.moyenne)),
  );
  const actives = $derived(sansBudget.filter((l) => l.depense || l.moyenne));
  let toutes = $state(false);
  let edition = $state<string | null>(null);
  let aSupprimer = $state("");

  async function supprimerBudget(id: string) {
    await ecrire([{ collection: "budgets", id, valeur: null }]);
    aSupprimer = "";
    annoncer(t("Budget supprimé."));
  }

  const etat = (e: EtatBudget) => {
    const taux = e.depense / e.budget;
    const depassera = e.projection !== undefined && e.projection > e.budget && e.depense <= e.budget;
    return { taux, classe: taux > 1 ? "trop" : depassera || taux > 0.85 ? "presque" : "bien", depassera };
  };

  async function toutProposer() {
    const ch = actives
      .filter((l) => l.moyenne > 0)
      .map((l) => ({ collection: "budgets" as const, id: l.c.id, valeur: { id: l.c.id, montant: Math.round((Math.ceil(l.moyenne / 1000) * 1000) / facteurBudget(ctx, devise)), frequence: "mois" as const } }));
    await ecrire(ch);
    annoncer(t("{0} budget{1} proposé{2} d'après vos 3 derniers mois. Touchez-en un pour l'ajuster.", ch.length, ch.length > 1 ? "s" : "", ch.length > 1 ? "s" : ""));
  }
</script>

{#snippet ligne(e: EtatBudget)}
  {@const c = categories.get(e.id)!}
  {@const s = etat(e)}
  <div class="rangee">
  <button class="budget" onclick={() => (edition = e.id)}>
    <IconeCategorie id={e.id} taille={38} />
    <span class="corps">
      <span class="haut"><span class="nom">{c.nom}</span><span><span class="montant">{argent(e.depense, devise)}</span> <span class="sous">/ <span class="montant">{argent(e.budget, devise)}</span></span></span></span>
      <span class="jauge">
        <span class={s.classe} style:width="{Math.min(100, s.taux * 100)}%"></span>
        {#if e.avancement > 0 && e.avancement < 1}<i class="repere" style:left="{e.avancement * 100}%" title={t("Où vous devriez en être aujourd'hui")}></i>{/if}
      </span>
      <span class="bas">
        {#if s.taux > 1}
          <span class="pastille trop">{t("Dépassé de")} <span class="montant">{argent(e.depense - e.budget, devise)}</span></span>
        {:else if s.depassera}
          <span class="pastille presque">{t("À ce rythme : +")}<span class="montant">{argent(e.projection! - e.budget, devise)}</span> {t("de dépassement")}</span>
        {:else}
          <span class="sous">{t("Reste")} <span class="montant">{argent(e.budget - e.depense, devise)}</span></span>
        {/if}
        {#if e.frequence === "annee"}<span class="sous">{t("sur")} {e.de.slice(0, 4)}</span>{/if}
      </span>
    </span>
  </button>
  {#if aSupprimer === e.id}
    <span class="confirme">
      <button class="danger petit" onclick={() => supprimerBudget(e.id)}>{t("Supprimer")}</button>
      <button class="petit" onclick={() => (aSupprimer = "")}>{t("Garder")}</button>
    </span>
  {:else}
    <button class="corbeille" aria-label={t("Supprimer le budget {0}", c.nom)} title={t("Supprimer ce budget")} onclick={() => (aSupprimer = e.id)}><Icone nom="poubelle" taille={17} /></button>
  {/if}
  </div>
{/snippet}

<div class="pile">
  <Periode />
  {#if !donnees.operations.length}
    <div class="carte pile vide-guide">
      <h2>{t("Pas encore de dépenses à suivre")}</h2>
      <p class="sous">{t("Importez un relevé : l'appli proposera des budgets d'après vos dépenses habituelles, à accepter en un appui.")}</p>
      <button class="principal" onclick={() => (app.page = "import")}>{t("Importer un relevé")}</button>
    </div>
  {/if}

  <div class="carte resume" data-visite="budgets">
    <div>
      <p class="sous">{t("Reste à dépenser")}<Aide texte={t("Plafond global s'il existe (sinon la somme de vos budgets mensuels de la période), moins ce que vous avez déjà dépensé. Le trait vertical sur chaque barre montre où vous devriez en être aujourd'hui si vous dépensiez régulièrement.")} /></p>
      {#if plafond}
        <p class="montant enorme" class:negatif={reste < 0}>{argent(reste, devise)}</p>
        <p class="sous">
          {#if enCours && jours > 0 && reste > 0}
            {t("jusqu'au")} {dateCourte(b.fin)}{t(", soit")} <strong class="montant">{argent(Math.floor(reste / jours), devise)}</strong> {t("par jour pendant")} {jours} {t("jour")}{jours > 1 ? "s" : ""}
          {:else if reste < 0}
            {t("dépassement sur la période")}
          {:else}
            {t("dépensé")} <span class="montant">{argent(depenseSuivie, devise)}</span> {t("sur")} <span class="montant">{argent(plafond, devise)}</span>
          {/if}
        </p>
      {:else}
        <p class="sous">{t("Fixez un plafond global ou des budgets par catégorie pour savoir ce qu'il vous reste.")}</p>
      {/if}
    </div>
    <div class="actions-haut">
    <button class="principal" onclick={() => (edition = "")}><Icone nom="plus" taille={18} />{t("Nouveau budget")}</button>
    <button class="global" onclick={() => (edition = "global")}>
      {#if global}
        {t("Plafond global :")} <strong class="montant">{argent(global.budget, devise)}</strong>{#if b.mois.length > 1}<span class="sous"> ({b.mois.length} {t("mois)")}</span>{/if} {t("· Modifier")}
      {:else}
        {t("+ Fixer un plafond global")}
      {/if}
    </button>
    </div>
  </div>

  {#if mensuels.length}
    <section class="carte pile">
      <h2>{t("Budgets mensuels")}{#if b.mois.length > 1}<span class="sous"> {t("×")} {b.mois.length} {t("mois")}</span>{/if}</h2>
      {#each mensuels as e (e.id)}{@render ligne(e)}{/each}
    </section>
  {/if}

  {#if annuels.length}
    <section class="carte pile">
      <h2>{t("Budgets annuels")}<Aide texte={t("Pour les dépenses irrégulières (vacances, cadeaux…) : suivies du 1er janvier au 31 décembre, quelle que soit la période affichée.")} /></h2>
      {#each annuels as e (e.id)}{@render ligne(e)}{/each}
    </section>
  {/if}

  <section class="carte pile">
    <div class="titre">
      <h2>{t("Sans budget")}</h2>
      {#if actives.some((l) => l.moyenne > 0)}<button class="lien" onclick={toutProposer}>{t("Tout proposer d'après mes moyennes")}</button>{/if}
    </div>
    <p class="sous">{t("Touchez une catégorie pour lui fixer un budget mensuel ou annuel.")}</p>
    {#each toutes ? sansBudget : actives as l (l.c.id)}
      <button class="budget" onclick={() => (edition = l.c.id)}>
        <IconeCategorie id={l.c.id} taille={38} />
        <span class="corps">
          <span class="haut"><span class="nom">{l.c.nom}</span><span class="montant">{argent(l.depense, devise)}</span></span>
          <span class="sous">{l.moyenne ? t("d'habitude {0} par mois", argent(l.moyenne, devise)) : t("aucune dépense récente")} {t("· Fixer un budget")}</span>
        </span>
      </button>
    {/each}
    {#if sansBudget.length > actives.length && !toutes}
      <button class="lien gauche" onclick={() => (toutes = true)}>{t("Afficher les autres catégories (")}{sansBudget.length - actives.length})</button>
    {/if}
  </section>
</div>

{#if edition !== null}<BudgetEditeur id={edition} fermer={() => (edition = null)} />{/if}

<style>
  .vide-guide {
    align-items: flex-start;
  }
  .resume {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
  }
  .enorme {
    font-size: 32px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .negatif {
    color: var(--danger);
  }
  .global {
    font-size: 14px;
  }
  h2 {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  .titre {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .actions-haut {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .rangee {
    display: flex;
    align-items: center;
    gap: 8px;
    border-top: 1px solid var(--bord);
    padding-top: 12px;
  }
  .rangee:first-of-type {
    border-top: none;
    padding-top: 0;
  }
  .rangee .budget {
    border-top: none;
    padding-top: 0;
  }
  .corbeille {
    width: 36px;
    height: 36px;
    padding: 0;
    flex: none;
    color: var(--doux);
  }
  .confirme {
    display: flex;
    gap: 6px;
    flex: none;
  }
  .petit {
    padding: 7px 12px;
    font-size: 13px;
  }
  .budget {
    display: flex;
    align-items: center;
    gap: 12px;
    border: none;
    border-top: 1px solid var(--bord);
    border-radius: 0;
    background: none;
    padding: 12px 0 0;
    text-align: left;
    color: inherit;
    width: 100%;
  }
  .budget:first-of-type {
    border-top: none;
    padding-top: 0;
  }
  .corps {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .haut {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    font-size: 14px;
  }
  .nom {
    font-weight: 600;
  }
  .jauge {
    position: relative;
    display: block;
    height: 8px;
    border-radius: 999px;
    background: var(--surface-2);
  }
  .jauge > span {
    display: block;
    height: 100%;
    border-radius: 999px;
  }
  .bien {
    background: var(--ok);
  }
  .presque {
    background: var(--alerte);
  }
  .trop {
    background: var(--danger);
  }
  .repere {
    position: absolute;
    top: -3px;
    width: 2px;
    height: 14px;
    border-radius: 1px;
    background: var(--texte);
    opacity: 0.6;
  }
  .bas {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    font-size: 13px;
  }
  .pastille {
    font-size: 12px;
    border-radius: 999px;
    padding: 1px 9px;
  }
  .pastille.trop {
    background: var(--danger-fond);
    color: var(--danger);
  }
  .pastille.presque {
    background: var(--alerte-fond);
    color: var(--alerte);
  }
  .gauche {
    align-self: flex-start;
  }
</style>
