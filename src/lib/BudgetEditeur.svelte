<script lang="ts">
  import Choix from "./Choix.svelte";
  import { t, locale } from "./i18n.svelte";
  import { app, deviseAffichee } from "./etat.svelte";
  import { tauxConnus } from "./taux";
  // Modification rapide d'un budget (une catégorie, ou le plafond global) : mensuel ou annuel,
  // −/+ pour ajuster, votre moyenne en un geste, supprimer. Ouverte depuis la page Budgets, l'accueil ou une opération.
  // id vide = nouveau budget : on choisit la catégorie, ou on en crée une.
  import { donnees, ecrire, nouvelId, SYMBOLES, type Changement } from "./donnees.svelte";
  import { annoncer } from "./etat.svelte";
  import Feuille from "./Feuille.svelte";
  import { argent } from "./format";
  import IconeCategorie from "./IconeCategorie.svelte";
  import { lireMontant } from "./import/analyse";
  import { facteurBudget, moisCourant, moyenne, type Contexte } from "./stats";

  let { id, fermer }: { id: string; fermer: () => void } = $props();

  /* svelte-ignore state_referenced_locally */
  const nouveau = !id;
  // Catégories de dépense qui n'ont pas encore de budget (pour un nouveau budget)
  const libres = $derived(donnees.categories.filter((c) => c.type === "depense" && !donnees.budgets.some((b) => b.id === c.id)));
  /* svelte-ignore state_referenced_locally */
  let choix = $state(id);
  let nomNouvelle = $state("");
  const cible = $derived(choix === "__nouvelle" ? "" : choix);
  /* svelte-ignore state_referenced_locally */
  const existant = donnees.budgets.find((b) => b.id === id);
  /* svelte-ignore state_referenced_locally */
  let frequence = $state<"mois" | "annee">(existant?.frequence ?? "mois");
  /* svelte-ignore state_referenced_locally */
  const devise = deviseAffichee();
  const fb = facteurBudget({ ops: [], comptes: [], categories: [], taux: tauxConnus(app.params.taux) }, devise);
  /* svelte-ignore state_referenced_locally */
  let montant = $state(existant ? Math.round(existant.montant * fb) / 100 : 0);
  let saisie = $state("");
  $effect(() => {
    saisie = montant ? String(Math.round(montant * 100) / 100).replace(".", ",") : "";
  });

  const categorie = $derived(donnees.categories.find((c) => c.id === cible));
  const titre = $derived(cible === "global" ? t("Plafond global") : (categorie?.nom ?? (nomNouvelle.trim() || t("Budget"))));
  const ctx: Contexte = $derived({ ops: donnees.operations, comptes: donnees.comptes, categories: donnees.categories, taux: tauxConnus(app.params.taux), devise: deviseAffichee() });
  // Moyenne mensuelle des 3 derniers mois complets, arrondie à l'euro supérieur
  const moy = $derived.by(() => {
    const m = moyenne(ctx, "", moisCourant(), 3);
    const v = cible === "global" ? m.depenses : cible ? (m.parCategorie.get(cible) ?? 0) : 0;
    return Math.ceil(Math.max(0, v) / 100);
  });
  const suggestion = $derived(frequence === "annee" ? moy * 12 : moy);
  // Pas du −/+ : 10 € par mois, 50 € par an (5 000 F CFA / 25 000 F CFA)
  const pas = $derived((frequence === "annee" ? 50 : 10) * (fb > 100 ? 500 : 1));
  const symbole = SYMBOLES[devise] ?? devise;

  function changer(delta: number) {
    montant = Math.max(0, Math.round((lireMontant(saisie) ?? 0) / 100) + delta);
  }

  const COULEURS = ["#639922", "#D85A30", "#7F77DD", "#EF9F27", "#378ADD", "#1D9E75", "#E24B4A", "#D4537E", "#BA7517", "#534AB7"];
  const pret = $derived(choix === "__nouvelle" ? !!nomNouvelle.trim() : !!cible);

  async function enregistrer(e: SubmitEvent) {
    e.preventDefault();
    if (!pret) return;
    const cts = Math.abs(lireMontant(saisie) ?? 0);
    const ch: Changement[] = [];
    let bid = cible;
    if (choix === "__nouvelle") {
      // Nouvelle catégorie de dépense, créée avec son budget
      bid = nouvelId();
      ch.push({ collection: "categories", id: bid, valeur: { id: bid, nom: nomNouvelle.trim(), type: "depense", couleur: COULEURS[donnees.categories.length % COULEURS.length] } });
    }
    ch.push({ collection: "budgets", id: bid, valeur: cts > 0 ? { id: bid, montant: Math.round(cts / fb), frequence } : null });
    await ecrire(ch);
    annoncer(cts > 0 ? t("{0} : {1} par {2}.", titre, argent(cts, devise), frequence === "annee" ? "an" : "mois") : t("Budget retiré."));
    fermer();
  }

  async function supprimer() {
    await ecrire([{ collection: "budgets", id, valeur: null }]);
    annoncer(t("Budget supprimé."));
    fermer();
  }
</script>

<Feuille titre={nouveau ? t("Nouveau budget") : existant ? t("Budget · {0}", titre) : t("Nouveau budget · {0}", titre)} {fermer}>
  <form class="pile" onsubmit={enregistrer}>
    {#if nouveau}
      <label>{t("Pour quelle catégorie ?")}
        <Choix bind:valeur={choix} titre={t("Pour quelle catégorie ?")} vide={t("Choisir…")} options={[
          ...libres.map((c) => ({ v: c.id, l: c.nom, cat: c.id })),
          { v: "__nouvelle", l: t("+ Nouvelle catégorie…") },
          ...(donnees.budgets.some((b) => b.id === "global") ? [] : [{ v: "global", l: t("Toutes les dépenses (plafond global)") }]),
        ]} />
      </label>
      {#if choix === "__nouvelle"}
        <!-- svelte-ignore a11y_autofocus -->
        <label>{t("Nom de la catégorie")}<input bind:value={nomNouvelle} placeholder={t("ex. Sorties, Animaux…")} autofocus /></label>
        <p class="sous">{t("Classez-y ensuite vos opérations (fiche d'une opération) ou créez une règle (Paramètres → Règles de classement).")}</p>
      {/if}
    {/if}
    <div class="tete">
      {#if categorie}<IconeCategorie id={categorie.id} taille={40} />{/if}
      <p class="sous">
        {cible === "global"
          ? t("Un plafond pour toutes vos dépenses, toutes catégories confondues.")
          : frequence === "annee"
            ? t("Pour une dépense irrégulière (vacances, cadeaux…) : suivie sur l'année civile.")
            : t("Plafond de dépenses chaque mois pour cette catégorie.")}
      </p>
    </div>

    <div class="mode" role="radiogroup" aria-label={t("Fréquence")}>
      <button type="button" role="radio" aria-checked={frequence === "mois"} class:actif={frequence === "mois"} onclick={() => (frequence = "mois")}>{t("Par mois")}</button>
      <button type="button" role="radio" aria-checked={frequence === "annee"} class:actif={frequence === "annee"} onclick={() => (frequence = "annee")}>{t("Par an")}</button>
    </div>

    <div class="montant-ligne">
      <button type="button" class="rond" aria-label={t("Moins {0} {1}", pas, symbole)} onclick={() => changer(-pas)}>−</button>
      <label class="champ">
        <span class="sr">{t("Montant")}</span>
        <!-- svelte-ignore a11y_autofocus -->
        <input inputmode="decimal" bind:value={saisie} placeholder="0" autofocus />
        <span class="unite">{symbole} / {frequence === "annee" ? "an" : "mois"}</span>
      </label>
      <button type="button" class="rond" aria-label={t("Plus {0} {1}", pas, symbole)} onclick={() => changer(pas)}>+</button>
    </div>

    {#if suggestion}
      <button type="button" class="suggestion" onclick={() => (montant = suggestion)}>
        {t("Votre moyenne :")} <strong>{suggestion.toLocaleString(locale())} {symbole}</strong> {frequence === "annee" ? t("par an (d'après vos 3 derniers mois)") : t("par mois (3 derniers mois)")} {t("· Utiliser")}
      </button>
    {/if}

    <button class="principal" type="submit" disabled={!pret}>{nouveau ? t("Créer le budget") : t("Enregistrer")}</button>
    {#if existant}<button type="button" class="lien rouge" onclick={supprimer}>{t("Supprimer ce budget")}</button>{/if}
  </form>
</Feuille>

<style>
  .tete {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .mode {
    display: flex;
    gap: 4px;
    background: var(--surface-2);
    padding: 4px;
    border-radius: 999px;
  }
  .mode button {
    flex: 1;
    border: none;
    background: transparent;
    padding: 8px;
  }
  .mode .actif {
    background: var(--surface);
    font-weight: 600;
  }
  .montant-ligne {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .rond {
    width: 46px;
    height: 46px;
    padding: 0;
    border-radius: 50%;
    font-size: 22px;
    flex: none;
  }
  .champ {
    flex: 1;
    flex-direction: row;
    align-items: baseline;
    gap: 6px;
    background: var(--fond);
    border: 1px solid var(--bord);
    border-radius: 16px;
    padding: 6px 14px;
  }
  .champ input {
    border: none;
    background: transparent;
    padding: 4px 0;
    font-size: 26px;
    font-weight: 600;
    text-align: right;
    min-width: 0;
  }
  .champ input:focus-visible {
    outline: none;
  }
  .unite {
    color: var(--doux);
    white-space: nowrap;
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
  .suggestion {
    justify-content: flex-start;
    text-align: left;
    background: var(--accent-fond);
    color: var(--accent-texte);
    border: none;
    border-radius: 14px;
    font-size: 14px;
  }
  .rouge {
    color: var(--danger);
    align-self: center;
  }
</style>
