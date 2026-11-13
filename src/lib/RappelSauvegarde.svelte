<script lang="ts">
  // Rappel de sauvegarde sur l'Accueil : sans sauvegarde, un téléphone perdu, c'est tout perdu.
  // Il apparaît quelques jours après le premier import, puis un mois après chaque sauvegarde.
  import { donnees } from "./donnees.svelte";
  import { annoncer, app, exporterSauvegarde, sauverParametres } from "./etat.svelte";
  import { t } from "./i18n.svelte";
  import IconeCategorie from "./IconeCategorie.svelte";

  const JOUR = 86_400_000;
  const maintenant = Date.now();
  const premierImport = $derived(donnees.imports.reduce((m, i) => Math.min(m, i.quand), Infinity));
  const derniere = $derived(app.params.derniereSauvegarde);
  const jours = $derived(derniere ? Math.floor((maintenant - derniere) / JOUR) : 0);
  const visible = $derived(
    donnees.operations.some((o) => !o.demo) &&
      maintenant > (app.params.rappelSauvegardeApres ?? 0) &&
      (derniere ? jours >= 30 : maintenant - premierImport >= 3 * JOUR),
  );
  let enCours = $state(false);

  async function sauvegarder() {
    enCours = true;
    try {
      if (await exporterSauvegarde()) annoncer(t("Sauvegarde chiffrée enregistrée."));
    } finally {
      enCours = false;
    }
  }
  async function plusTard() {
    app.params.rappelSauvegardeApres = Date.now() + 7 * JOUR;
    await sauverParametres();
  }
</script>

{#if visible}
  <div class="rappel" role="status">
    <IconeCategorie icone="shield-check" teinte="#3B5BFD" taille={32} />
    <span class="texte">
      <strong>{derniere ? t("Dernière sauvegarde il y a {0} jours.", jours) : t("Vous n'avez pas encore de sauvegarde.")}</strong>
      {t("Si cet appareil est perdu ou cassé, c'est elle qui vous permet de tout retrouver. Gardez-la sur un autre appareil.")}
    </span>
    <span class="actions">
      <button class="principal" onclick={sauvegarder} disabled={enCours}>{t("Sauvegarder")}</button>
      <button class="lien" onclick={plusTard}>{t("Plus tard")}</button>
    </span>
  </div>
{/if}

<style>
  .rappel {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px 14px;
    background: var(--accent-fond);
    color: var(--texte);
    border-radius: 16px;
    padding: 12px 16px;
    font-size: 14px;
  }
  .texte {
    flex: 1 1 260px;
  }
  .texte strong {
    display: block;
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-left: auto;
  }
</style>
