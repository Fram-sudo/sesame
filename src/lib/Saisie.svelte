<script lang="ts">
  import Choix from "./Choix.svelte";
  import { t } from "./i18n.svelte";
  // Saisie à la main : dépense, revenu ou virement entre deux de vos comptes.
  import { categoriser, VIREMENT } from "./categories";
  import ChoixCategorie from "./ChoixCategorie.svelte";
  import CompteFormulaire from "./CompteFormulaire.svelte";
  import { donnees, ecrire, nouvelId, reglesActives, type Operation } from "./donnees.svelte";
  import { annoncer, app } from "./etat.svelte";
  import Feuille from "./Feuille.svelte";
  import { lireMontant, normaliser } from "./import/analyse";
  import { cleOp } from "./import/doublons";

  type Type = "depense" | "revenu" | "virement";
  let { type: initial, fermer }: { type: Type; fermer: () => void } = $props();

  let type = $state<Type>(initial);
  let montant = $state("");
  let libelle = $state("");
  let date = $state(new Date().toISOString().slice(0, 10));
  let compteId = $state(app.dernierCompte || donnees.comptes[0]?.id || "");
  let versId = $state(donnees.comptes.find((c) => c.id !== compteId)?.id ?? "");
  let categorieId = $state("");
  let categorieTouchee = $state(false);
  let creerCompte = $state(false);

  const cts = $derived(lireMontant(montant));
  const de = $derived(donnees.comptes.find((c) => c.id === compteId));
  const vers = $derived(donnees.comptes.find((c) => c.id === versId));
  const devisesDifferentes = $derived(type === "virement" && !!de && !!vers && de.devise !== vers.devise);
  const valide = $derived(!!cts && !!de && (type !== "virement" || (!!vers && vers.id !== de.id && !devisesDifferentes)));

  // Catégorie proposée d'après le libellé, tant que vous ne l'avez pas choisie vous-même
  $effect(() => {
    if (categorieTouchee || type === "virement") return;
    const signe = type === "revenu" ? 1 : -1;
    categorieId = categoriser({ id: "", compteId, date, montant: signe, libelle }, reglesActives(), donnees.categories) ?? dejaVue(libelle, signe) ?? "";
  });

  // Sinon, la catégorie de la dernière opération du même sens dont le libellé contient ce que vous tapez
  function dejaVue(texte: string, signe: number) {
    const q = normaliser(texte);
    if (q.length < 3) return undefined;
    let meilleure: Operation | undefined;
    for (const o of donnees.operations)
      if (o.categorieId && Math.sign(o.montant) === signe && !o.virementId && (!meilleure || o.date > meilleure.date) && normaliser(o.libelle).includes(q)) meilleure = o;
    return meilleure?.categorieId;
  }

  const TITRES: Record<Type, string> = { depense: t("Dépense"), revenu: t("Revenu"), virement: t("Virement") };

  async function enregistrer(e: SubmitEvent) {
    e.preventDefault();
    if (!valide || !cts) return;
    const v = Math.abs(cts);
    const op = (compte: string, m: number, lib: string, extra: Partial<Operation>): Operation => ({
      id: nouvelId(),
      compteId: compte,
      date,
      montant: m,
      libelle: lib,
      cle: cleOp({ date, montant: m, libelle: lib }),
      manuelle: true,
      ...extra,
    });
    let ops: Operation[];
    if (type === "virement") {
      const virementId = nouvelId();
      const lib = libelle.trim();
      ops = [
        op(de!.id, -v, lib || t("Virement vers {0}", vers!.nom), { virementId, categorieId: VIREMENT }),
        op(vers!.id, v, lib || t("Virement depuis {0}", de!.nom), { virementId, categorieId: VIREMENT }),
      ];
    } else {
      const m = type === "revenu" ? v : -v;
      ops = [op(de!.id, m, libelle.trim() || TITRES[type], { categorieId: categorieId || undefined, categorieManuelle: categorieTouchee })];
    }
    await ecrire(ops.map((o) => ({ collection: "operations", id: o.id, valeur: o })));
    app.dernierCompte = de!.id;
    annoncer(type === "depense" ? t("Dépense enregistrée.") : type === "revenu" ? t("Revenu enregistré.") : t("Virement enregistré."));
    fermer();
  }
</script>

<Feuille titre={t("Nouvelle opération")} {fermer}>
  {#if donnees.comptes.length === 0}
    <p>{t("Créez d'abord un compte pour y ranger vos opérations.")}</p>
    <button class="principal" onclick={() => (creerCompte = true)}>{t("Créer un compte")}</button>
  {:else}
    <form class="pile" onsubmit={enregistrer}>
      <div class="types" role="radiogroup" aria-label={t("Type d'opération")}>
        {#each Object.entries(TITRES) as [ty, l] (ty)}
          <button type="button" role="radio" aria-checked={type === ty} class:actif={type === ty} class={ty} onclick={() => ((type = ty as Type), (categorieTouchee = false))}>{l}</button>
        {/each}
      </div>
      <label>{t("Montant")}{de ? ` (${de.devise})` : ""}
        <!-- svelte-ignore a11y_autofocus -->
        <input class="somme" inputmode="decimal" placeholder="0,00" bind:value={montant} autofocus required />
      </label>
      <label>{t("Libellé")}<input bind:value={libelle} placeholder={type === "virement" ? "facultatif" : t("ex. Boulangerie")} /></label>
      <div class="deux">
        <label>{type === "virement" ? t("Depuis") : t("Compte")}
          <Choix bind:valeur={compteId} titre={t("Compte")} options={donnees.comptes.map((c) => ({ v: c.id, l: c.nom }))} />
        </label>
        {#if type === "virement"}
          <label>{t("Vers")}
            <Choix bind:valeur={versId} titre={t("Vers")} options={donnees.comptes.filter((c) => c.id !== compteId).map((c) => ({ v: c.id, l: c.nom }))} />
          </label>
        {:else}
          <label>{t("Date")}<input type="date" bind:value={date} required /></label>
        {/if}
      </div>
      {#if type === "virement"}
        <label>{t("Date")}<input type="date" bind:value={date} required /></label>
        {#if donnees.comptes.length < 2}<p class="info">{t("Il faut au moins deux comptes pour un virement.")}</p>{/if}
        {#if devisesDifferentes}<p class="info">{t("Les virements entre devises différentes (")}{de?.devise} → {vers?.devise}{t(") arriveront avec les taux de change (jalon 7). En attendant, saisissez une dépense et un revenu.")}</p>{/if}
      {:else}
        <span class="sous">{t("Catégorie")}</span>
        <ChoixCategorie bind:valeur={() => categorieId, (v) => ((categorieId = v), (categorieTouchee = true))} sens={type} avecVirement={false} />
      {/if}
      <button class="principal" type="submit" disabled={!valide}>{t("Enregistrer")}</button>
    </form>
  {/if}
</Feuille>

{#if creerCompte}
  <CompteFormulaire fermer={() => (creerCompte = false)} cree={(id) => (compteId = id)} />
{/if}

<style>
  .types {
    display: flex;
    gap: 6px;
    background: var(--surface-2);
    padding: 4px;
    border-radius: 999px;
  }
  .types button {
    flex: 1;
    border: none;
    background: transparent;
    padding: 9px 8px;
  }
  .types button.actif {
    color: #fff;
  }
  .types .depense.actif {
    background: #e24b4a;
  }
  .types .revenu.actif {
    background: #639922;
  }
  .types .virement.actif {
    background: #378add;
  }
  .somme {
    font-size: 26px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .deux {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
</style>
