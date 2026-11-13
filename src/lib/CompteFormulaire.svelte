<script lang="ts">
  import Choix from "./Choix.svelte";
  import { t } from "./i18n.svelte";
  // Fiche d'un compte : création ou modification, contrôle du solde, suppression.
  // Pour une poche : nom affiché libre (le nom dans les relevés est gardé à part), objectif, archiver, fusionner.
  // Pour un compte qui a des poches : leur liste.
  import CompteFormulaire from "./CompteFormulaire.svelte";
  import ControleSolde from "./ControleSolde.svelte";
  import { couleurCompte, PALETTE_COMPTES } from "./couleurs";
  import { optionsDevises } from "./devises";
  import { classerEtLier, donnees, ecrire, nouvelId, soldes, supprimerCompte, type Changement, type Compte, type Devise } from "./donnees.svelte";
  import { annoncer } from "./etat.svelte";
  import Feuille from "./Feuille.svelte";
  import { argent } from "./format";
  import { lireMontant } from "./import/analyse";
  import { objectifPoche } from "./stats";

  let { compte, fermer, cree }: { compte?: Compte; fermer: () => void; cree?: (id: string) => void } = $props();


  /* svelte-ignore state_referenced_locally */
  const estPoche = !!compte?.parentId;
  /* svelte-ignore state_referenced_locally */
  let nom = $state(compte?.nom ?? "");
  /* svelte-ignore state_referenced_locally */
  let banque = $state(compte?.banque ?? "");
  /* svelte-ignore state_referenced_locally */
  let devise = $state<Devise>(compte?.devise ?? "EUR");
  /* svelte-ignore state_referenced_locally */
  // « especes » : compte courant sans banque, le portefeuille d'espèces
  let type = $state<"courant" | "epargne" | "especes">(compte?.type !== "epargne" && compte?.forme === "especes" ? "especes" : (compte?.type ?? "courant"));
  /* svelte-ignore state_referenced_locally */
  let reserve = $state(!!compte?.reserve);
  /* svelte-ignore state_referenced_locally */
  let couleur = $state(compte?.couleur ?? "");
  // Porte-monnaie : suivi des espèces à partir d'une date (nouveau porte-monnaie : aujourd'hui, pour ne pas rattraper des années de retraits)
  /* svelte-ignore state_referenced_locally */
  let especesDepuis = $state(compte ? (compte.especesDepuis ?? "") : new Date().toISOString().slice(0, 10));
  /* svelte-ignore state_referenced_locally */
  let objectif = $state(compte?.objectif ? String(compte.objectif / 100).replace(".", ",") : "");
  /* svelte-ignore state_referenced_locally */
  let objectifDate = $state(compte?.objectifDate ?? "");
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
      type: type === "especes" ? "courant" : type,
      ...(type === "especes" ? { forme: "especes" as const } : compte?.type !== "epargne" && compte?.forme === "especes" ? { forme: undefined } : {}),
      especesDepuis: type === "especes" && especesDepuis ? especesDepuis : undefined,
      couleur: couleur || undefined,
      reserve: (estPoche || type === "epargne") && reserve ? true : undefined,
      objectif: lireMontant(objectif) ?? undefined,
      // Objectif daté : on retient d'où l'on part le jour où il est fixé ou changé (pour « où vous devriez en être »)
      ...(objectifDate && (objectifDate !== compte?.objectifDate || lireMontant(objectif) !== compte?.objectif)
        ? { objectifDate, objectifDepuis: new Date().toISOString().slice(0, 10), objectifDepart: compte ? (parCompte.get(compte.id) ?? 0) : 0 }
        : objectifDate
          ? {}
          : { objectifDate: undefined, objectifDepuis: undefined, objectifDepart: undefined }),
      // Une poche garde le nom qu'elle a dans les relevés : la renommer ici ne casse pas le lien avec la banque
      ...(estPoche ? { nomBanque: compte!.nomBanque ?? compte!.nom } : {}),
    };
    await ecrire([{ collection: "comptes", id, valeur }]);
    // Date de suivi des espèces changée : retraits et dépôts reliés (ou déliés) en conséquence
    if (type === "especes" && valeur.especesDepuis !== compte?.especesDepuis) await classerEtLier();
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

{#snippet role()}
  <label>{t("C'est de l'argent…")}
    <Choix bind:valeur={reserve} titre={t("C'est de l'argent…")} options={[{ v: false, l: t("Épargné (compté dans votre épargne)") }, { v: true, l: t("Réservé (pour une dépense prévue, ex. mensualité de prêt)") }]} />
  </label>
{/snippet}

<Feuille titre={compte ? compte.nom : t("Nouveau compte")} {fermer}>
  <form class="pile" onsubmit={enregistrer}>
    <label>{estPoche ? t("Nom de la poche") : t("Nom du compte")}<input bind:value={nom} placeholder={t("ex. Compte courant")} required /></label>
    {#if estPoche}
      {#if nomBanque && nomBanque !== nom.trim()}<p class="sous aide">{t("Sur vos relevés : «")} {nomBanque} {t("». Le lien est gardé même si vous la renommez.")}</p>{/if}
      {@render role()}
      {#if !reserve}
        <label>{t("Objectif d'épargne (facultatif)")}
          <input inputmode="decimal" bind:value={objectif} placeholder={objectifLu ? t("lu dans le nom : {0} €", objectifLu / 100) : t("ex. 5000")} />
        </label>
        {#if lireMontant(objectif)}<label>{t("Pour le (facultatif)")}<input type="date" bind:value={objectifDate} /></label><p class="sous aide">{t("Avec une date, Sésame calcule combien mettre de côté chaque mois et vous dit si vous êtes dans les temps.")}</p>{/if}
      {/if}
    {:else}
      <label>{t("Banque")}<input bind:value={banque} placeholder={t("ex. Société Générale")} list="banques" /></label>
      <datalist id="banques"><option value="Société Générale"></option><option value="Revolut"></option><option value="Boursobank"></option></datalist>
      <label>{t("Devise")}
        <Choix bind:valeur={devise} titre={t("Devise")} desactive={nbOps > 0} options={optionsDevises(donnees.comptes.map((c) => c.devise))} />
      </label>
      {#if nbOps > 0}<p class="sous aide">{t("Ce compte a déjà des opérations : sa devise ne peut plus changer (les montants sont enregistrés dans cette devise). Pour un compte dans une autre devise, créez-en un nouveau.")}</p>{/if}
      {#if !estPoche}
        {@const actuelle = couleur || couleurCompte({ id: compte?.id ?? "nouveau", banque, nom, forme: type === "especes" ? "especes" : undefined })}
        <div class="couleurs" role="radiogroup" aria-label={t("Couleur du compte")}>
          <span class="sous">{t("Couleur du compte")}</span>
          <div class="pastilles">
            {#each PALETTE_COMPTES as c (c)}
              <button type="button" role="radio" aria-checked={actuelle === c} aria-label={c} class:on={actuelle === c} style:background={c} onclick={() => (couleur = c)}></button>
            {/each}
          </div>
          <div class="apercu" style:background={actuelle}><small>{banque || t("Mon compte")}</small><strong>{nom || t("Compte")}</strong></div>
        </div>
      {/if}
      <label>{t("Type")}
        <Choix bind:valeur={type} titre={t("Type")} options={[{ v: "courant", l: t("Compte courant") }, { v: "especes", l: t("Espèces (porte-monnaie)") }, { v: "epargne", l: t("Épargne (livret…)") }]} />
      </label>
      {#if type === "especes"}
        <p class="sous aide">{t("Votre argent liquide, compté dans votre argent disponible. Les retraits au distributeur l'alimentent tout seuls ; saisissez vos achats en espèces avec le bouton +.")}</p>
        <label>{t("Suivre mes espèces à partir du")}<input type="date" bind:value={especesDepuis} /></label>
        <p class="sous aide">{t("Les retraits et dépôts d'espèces faits avant cette date restent de simples dépenses (ou revenus) sur votre compte bancaire. Laissez vide pour tout reprendre depuis le début.")}</p>
      {/if}
      {#if type === "epargne"}
        {@render role()}
        {#if !reserve}<label>{t("Objectif d'épargne (facultatif)")}<input inputmode="decimal" bind:value={objectif} placeholder={t("ex. 5000")} /></label>{#if lireMontant(objectif)}<label>{t("Pour le (facultatif)")}<input type="date" bind:value={objectifDate} /></label><p class="sous aide">{t("Avec une date, Sésame calcule combien mettre de côté chaque mois et vous dit si vous êtes dans les temps.")}</p>{/if}{/if}
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
  .couleurs {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .pastilles {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .pastilles button {
    width: 32px;
    height: 32px;
    min-height: 0;
    padding: 0;
    border-radius: 50%;
  }
  .pastilles button.on {
    box-shadow:
      0 0 0 2px var(--fond),
      0 0 0 4px var(--texte);
  }
  .apercu {
    color: #fff;
    border-radius: 14px;
    padding: 10px 14px;
    display: flex;
    flex-direction: column;
    max-width: 220px;
  }
  .apercu small {
    font-size: 12px;
    opacity: 0.85;
  }
</style>
