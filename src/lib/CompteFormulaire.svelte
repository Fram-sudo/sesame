<script lang="ts">
  import Choix from "./Choix.svelte";
  import { t } from "./i18n.svelte";
  // Fiche d'un compte : création ou modification, contrôle du solde, suppression.
  // Pour une poche : nom affiché libre (le nom dans les relevés est gardé à part), objectif, archiver, fusionner.
  // Pour un compte qui a des poches : leur liste.
  import CompteFormulaire from "./CompteFormulaire.svelte";
  import ControleSolde from "./ControleSolde.svelte";
  import { classerEtLier, DEVISES, donnees, ecrire, nouvelId, soldes, supprimerCompte, type Changement, type Compte, type Devise } from "./donnees.svelte";
  import { annoncer } from "./etat.svelte";
  import Feuille from "./Feuille.svelte";
  import { argent } from "./format";
  import { lireMontant } from "./import/analyse";
  import { objectifPoche } from "./stats";

  let { compte, fermer, cree }: { compte?: Compte; fermer: () => void; cree?: (id: string) => void } = $props();

  const NOMS_DEVISES: Record<Devise, string> = { EUR: t("Euro (€)"), XOF: t("Franc CFA (XOF)"), USD: t("Dollar US ($)"), CAD: t("Dollar canadien (CA$)") };

  /* svelte-ignore state_referenced_locally */
  const estPoche = !!compte?.parentId;
  /* svelte-ignore state_referenced_locally */
  let nom = $state(compte?.nom ?? "");
  /* svelte-ignore state_referenced_locally */
  let banque = $state(compte?.banque ?? "");
  /* svelte-ignore state_referenced_locally */
  let devise = $state<Devise>(compte?.devise ?? "EUR");
  /* svelte-ignore state_referenced_locally */
  let type = $state(compte?.type ?? "courant");
  /* svelte-ignore state_referenced_locally */
  let objectif = $state(compte?.objectif ? String(compte.objectif / 100).replace(".", ",") : "");
  let confirmer = $state(false);
  let fusionVers = $state("");
  let pocheOuverte = $state<Compte | null>(null);

  const nbOps = $derived(compte ? donnees.operations.filter((o) => o.compteId === compte.id).length : 0);
  const parCompte = $derived(soldes());
  const poches = $derived(compte && !estPoche ? donnees.comptes.filter((c) => c.parentId === compte.id) : []);
  const soeurs = $derived(compte && estPoche ? donnees.comptes.filter((c) => c.parentId === compte.parentId && c.id !== compte.id) : []);
  const nomBanque = $derived(compte?.nomBanque ?? compte?.nom);
  const objectifLu = $derived(objectifPoche({ nom: nomBanque ?? nom }) ?? objectifPoche({ nom }));

  async function enregistrer(e: SubmitEvent) {
    e.preventDefault();
    const id = compte?.id ?? nouvelId();
    const valeur: Compte = {
      ...compte,
      id,
      nom: nom.trim(),
      banque: banque.trim(),
      devise,
      soldeInitial: compte?.soldeInitial ?? 0,
      type,
      objectif: lireMontant(objectif) ?? undefined,
      // Une poche garde le nom qu'elle a dans les relevés : la renommer ici ne casse pas le lien avec la banque
      ...(estPoche ? { nomBanque: compte!.nomBanque ?? compte!.nom } : {}),
    };
    await ecrire([{ collection: "comptes", id, valeur }]);
    annoncer(compte ? t("Enregistré.") : t("Compte créé."));
    cree?.(id);
    fermer();
  }

  async function archiver(oui: boolean) {
    await ecrire([{ collection: "comptes", id: compte!.id, valeur: { ...compte!, nomBanque: nomBanque, archive: oui } }]);
    annoncer(oui ? t("Poche archivée : elle n'apparaît plus sur l'accueil.") : t("Poche réaffichée."));
    fermer();
  }

  // Fusion : toutes les opérations de cette poche passent dans l'autre, qui reconnaîtra aussi son nom aux prochains imports
  async function fusionner() {
    const cible = soeurs.find((c) => c.id === fusionVers);
    if (!cible || !compte) return;
    const ch: Changement[] = donnees.operations
      .filter((o) => o.compteId === compte.id)
      .map((o) => ({ collection: "operations", id: o.id, valeur: { ...o, compteId: cible.id } }));
    const alias = [...new Set([...(cible.alias ?? []), nomBanque!, ...(compte.alias ?? [])])].filter((a) => a && a !== (cible.nomBanque ?? cible.nom));
    ch.push(
      { collection: "comptes", id: cible.id, valeur: { ...cible, nomBanque: cible.nomBanque ?? cible.nom, alias, soldeInitial: cible.soldeInitial + compte.soldeInitial } },
      { collection: "comptes", id: compte.id, valeur: null },
    );
    await ecrire(ch);
    await classerEtLier();
    annoncer(t("« {0} » fusionnée dans « {1} ».", compte.nom, cible.nom));
    fermer();
  }

  async function effacer() {
    await supprimerCompte(compte!);
    annoncer(t("Supprimé."));
    fermer();
  }
</script>

<Feuille titre={compte ? compte.nom : t("Nouveau compte")} {fermer}>
  <form class="pile" onsubmit={enregistrer}>
    <label>{estPoche ? t("Nom de la poche") : t("Nom du compte")}<input bind:value={nom} placeholder={t("ex. Compte courant")} required /></label>
    {#if estPoche}
      {#if nomBanque && nomBanque !== nom.trim()}<p class="sous aide">{t("Sur vos relevés : «")} {nomBanque} {t("». Le lien est gardé même si vous la renommez.")}</p>{/if}
      <label>{t("Objectif d'épargne (facultatif)")}
        <input inputmode="decimal" bind:value={objectif} placeholder={objectifLu ? t("lu dans le nom : {0} €", objectifLu / 100) : t("ex. 5000")} />
      </label>
    {:else}
      <label>{t("Banque")}<input bind:value={banque} placeholder={t("ex. Société Générale")} list="banques" /></label>
      <datalist id="banques"><option value="Société Générale"></option><option value="Revolut"></option><option value="Boursobank"></option></datalist>
      <label>{t("Devise")}
        <Choix bind:valeur={devise} titre={t("Devise")} desactive={nbOps > 0} options={DEVISES.map((d) => ({ v: d, l: NOMS_DEVISES[d] }))} />
      </label>
      <label>{t("Type")}
        <Choix bind:valeur={type} titre={t("Type")} options={[{ v: "courant", l: t("Compte courant") }, { v: "epargne", l: t("Épargne (livret…)") }]} />
      </label>
      {#if type === "epargne"}
        <label>{t("Objectif d'épargne (facultatif)")}<input inputmode="decimal" bind:value={objectif} placeholder={t("ex. 5000")} /></label>
      {/if}
    {/if}
    {#if !compte}
      <p class="sous">{t("Après le premier import, l'appli vous proposera de vérifier le solde avec celui de votre banque.")}</p>
    {/if}
    <button class="principal" type="submit" disabled={!nom.trim()}>{compte ? t("Enregistrer") : t("Créer le compte")}</button>
  </form>

  {#if poches.length}
    <h3>{t("Poches")}</h3>
    <p class="sous aide">{t("Créées et mises à jour automatiquement à chaque import. Touchez une poche pour la renommer, lui fixer un objectif, l'archiver ou la fusionner.")}</p>
    {#each poches as p (p.id)}
      <button class="poche" onclick={() => (pocheOuverte = p)}>
        <span>{p.nom}{#if p.archive}<span class="badge">{t("archivée")}</span>{/if}</span>
        <span class="montant">{argent(parCompte.get(p.id) ?? 0, p.devise)}</span>
      </button>
    {/each}
  {/if}

  {#if compte}
    <h3>{t("Contrôler le solde")}</h3>
    <ControleSolde {compte} />

    {#if estPoche}
      <h3>{t("Gérer la poche")}</h3>
      {#if compte.archive}
        <button onclick={() => archiver(false)}>{t("Réafficher sur l'accueil")}</button>
      {:else}
        <button onclick={() => archiver(true)}>{t("Archiver (poche fermée sur la banque)")}</button>
      {/if}
      {#if soeurs.length}
        <div class="fusion">
          <label>{t("Fusionner avec une autre poche")}
            <Choix bind:valeur={fusionVers} titre={t("Fusionner avec une autre poche")} vide={t("Choisir…")} options={[{ v: "", l: t("Choisir…") }, ...soeurs.map((s) => ({ v: s.id, l: s.nom }))]} />
          </label>
          {#if fusionVers}
            <p class="sous">{t("Les")} {nbOps} {t("opérations de «")} {compte.nom} {t("» rejoindront l'autre poche, qui reconnaîtra aussi le nom «")} {nomBanque} {t("» aux prochains imports. Utile si vous l'avez renommée sur la banque.")}</p>
            <button onclick={fusionner}>{t("Fusionner")}</button>
          {/if}
        </div>
      {/if}
    {/if}

    {#if confirmer}
      <p class="erreur">{t("Supprimer")} {estPoche ? t("cette poche") : t("ce compte")} {t("et ses")} {nbOps} {t("opérations ? C'est définitif (sauf sauvegarde).")}</p>
      <div class="ligne">
        <button onclick={() => (confirmer = false)}>{t("Garder")}</button>
        <button class="danger" onclick={effacer}>{t("Supprimer")}</button>
      </div>
    {:else}
      <button class="lien rouge" onclick={() => (confirmer = true)}>{t("Supprimer")} {estPoche ? t("cette poche") : t("ce compte")}</button>
    {/if}
  {/if}
</Feuille>

{#if pocheOuverte}
  <CompteFormulaire compte={pocheOuverte} fermer={() => (pocheOuverte = null)} />
{/if}

<style>
  h3 {
    font-size: 15px;
    margin: 8px 0 0;
  }
  .aide {
    margin-top: -4px;
  }
  .poche {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    border-radius: 14px;
    padding: 10px 14px;
    text-align: left;
  }
  .badge {
    font-size: 11px;
    background: var(--surface-2);
    color: var(--doux);
    border-radius: 999px;
    padding: 1px 8px;
    margin-left: 8px;
  }
  .fusion {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .ligne {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }
  .rouge {
    color: var(--danger);
    align-self: flex-start;
  }
</style>
