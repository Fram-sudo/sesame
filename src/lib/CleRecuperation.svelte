<script lang="ts">
  import { t } from "./i18n.svelte";
  // Remise de la clé de récupération : affichage, enregistrement en fichier, impression,
  // puis vérification que l'utilisateur l'a bien notée.
  import { api, estAndroid } from "./api";
  import Icone from "./Icone.svelte";

  let { cle, termine }: { cle: string; termine: () => void } = $props();

  const groupes = $derived(cle.split("-"));
  // Deux groupes tirés au hasard à retaper (numérotés à partir de 1)
  const a = 1 + Math.floor(Math.random() * 6);
  const b = 7 + Math.floor(Math.random() * 6);
  let etape = $state<"montrer" | "verifier">("montrer");
  let saisieA = $state("");
  let saisieB = $state("");
  let erreur = $state("");
  let enregistree = $state(false);

  const norm = (s: string) => s.trim().toUpperCase();

  async function enregistrer() {
    erreur = "";
    try {
      enregistree = (await api.enregistrerCle(cle)) || enregistree;
    } catch (e) {
      erreur = String(e);
    }
  }

  function verifier() {
    if (norm(saisieA) === groupes[a - 1] && norm(saisieB) === groupes[b - 1]) termine();
    else erreur = t("Ces groupes ne correspondent pas. Vérifiez votre clé notée et réessayez.");
  }
</script>

{#if etape === "montrer"}
  <div class="pile">
    <div class="info">
      <strong>{t("Notez cette clé maintenant.")}</strong> {t("Si vous oubliez votre mot de passe, c'est le")}
      <strong>{t("seul")}</strong> {t("moyen de rouvrir vos données. Personne d'autre ne peut les récupérer.")}
    </div>
    <div class="carte a-imprimer">
      <p class="sous">{t("Clé de récupération Sésame")}</p>
      <div class="grille">
        {#each groupes as g, i (i)}
          <span class="groupe"><small>{i + 1}</small>{g}</span>
        {/each}
      </div>
      <p class="sous">{t("Rangez-la hors de vos appareils et ne la donnez à personne.")}</p>
    </div>
    <div class="actions">
      <button onclick={enregistrer}><Icone nom="telecharger" taille={18} />{t("Enregistrer dans un fichier")}</button>
      {#if !estAndroid}
        <button onclick={() => window.print()}><Icone nom="imprimer" taille={18} />{t("Imprimer")}</button>
      {/if}
    </div>
    {#if enregistree}
      <p class="sous">{t("Fichier enregistré. Copiez-le ensuite hors de cet appareil (clé USB, papier).")}</p>
    {/if}
    {#if erreur}<p class="erreur">{erreur}</p>{/if}
    <button class="principal" onclick={() => ((etape = "verifier"), (erreur = ""))}>{t("Je l'ai notée")}</button>
  </div>
{:else}
  <form class="pile" onsubmit={(e) => (e.preventDefault(), verifier())}>
    <p>{t("Pour vérifier, retapez deux groupes de votre clé.")}</p>
    <label>{t("Groupe n°")} {a}<input bind:value={saisieA} autocomplete="off" autocapitalize="characters" maxlength="4" required /></label>
    <label>{t("Groupe n°")} {b}<input bind:value={saisieB} autocomplete="off" autocapitalize="characters" maxlength="4" required /></label>
    {#if erreur}<p class="erreur">{erreur}</p>{/if}
    <button class="principal" type="submit">{t("Vérifier")}</button>
    <button type="button" class="lien" onclick={() => ((etape = "montrer"), (erreur = ""))}>{t("Revoir la clé")}</button>
  </form>
{/if}

<style>
  .grille {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
    gap: 8px;
    margin: 12px 0;
  }
  .groupe {
    font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
    font-size: 17px;
    letter-spacing: 1px;
    background: var(--surface-2);
    border-radius: 12px;
    padding: 6px 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .groupe small {
    font-size: 11px;
    color: var(--pale);
    letter-spacing: 0;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .actions button {
    flex: 1 1 200px;
  }
</style>
