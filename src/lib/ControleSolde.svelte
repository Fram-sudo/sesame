<script lang="ts">
  import { t } from "./i18n.svelte";
  // Rapprochement : compare le solde calculé par l'appli à celui indiqué par la banque.
  import { annoncer } from "./etat.svelte";
  import { donnees, ecrire, soldes, type Compte } from "./donnees.svelte";
  import { argent, dateCourte } from "./format";
  import { lireMontant } from "./import/analyse";

  let { compte, date = new Date().toISOString().slice(0, 10), soldeBanque }: { compte: Compte; date?: string; soldeBanque?: number } = $props();

  let saisie = $state("");
  let jour = $state(date);
  const banque = $derived(soldeBanque ?? lireMontant(saisie));
  const appli = $derived(soldes(jour).get(compte.id) ?? 0);
  const ecart = $derived(banque === null ? 0 : banque - appli);

  async function corriger() {
    const c = donnees.comptes.find((x) => x.id === compte.id)!;
    await ecrire([{ collection: "comptes", id: c.id, valeur: { ...c, soldeInitial: c.soldeInitial + ecart } }]);
    annoncer(t("Solde de départ corrigé : les soldes correspondent."));
  }
</script>

<div class="pile">
  {#if soldeBanque === undefined}
    <div class="deux">
      <label>{t("Solde indiqué par la banque")}<input inputmode="decimal" placeholder={t("ex. 1 234,56")} bind:value={saisie} /></label>
      <label>{t("À la date du")}<input type="date" bind:value={jour} /></label>
    </div>
  {/if}
  {#if banque !== null}
    <p class="sous">
      {t("Au")} {dateCourte(jour)} {t(": banque")} <strong class="montant">{argent(banque, compte.devise)}</strong>{t(", appli")}
      <strong class="montant">{argent(appli, compte.devise)}</strong>.
    </p>
    {#if ecart === 0}
      <p class="ok">{t("✓ Les soldes correspondent.")}</p>
    {:else}
      <p class="info">
        {t("Écart de")} <strong class="montant">{argent(ecart, compte.devise, true)}</strong>{t(". Il manque peut-être des opérations plus anciennes : vous pouvez importer un relevé plus ancien, ou corriger le solde de départ du compte.")}
      </p>
      <button onclick={corriger}>{t("Corriger le solde de départ")}</button>
    {/if}
  {/if}
</div>

<style>
  .deux {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .ok {
    background: var(--ok-fond);
    color: var(--ok);
    border-radius: 14px;
    padding: 10px 14px;
    font-size: 14px;
  }
</style>
