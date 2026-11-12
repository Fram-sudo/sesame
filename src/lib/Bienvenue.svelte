<script lang="ts">
  // Premier lancement : 4 écrans courts (langue, relevés, budgets, autres appareils). Chaque écran se passe.
  import { app, sauverParametres, type Page } from "./etat.svelte";
  import { changerLangueEtCategories } from "./donnees.svelte";
  import Feuille from "./Feuille.svelte";
  import { langue, t, type Langue } from "./i18n.svelte";
  import Icone from "./Icone.svelte";

  let etape = $state(0);
  const ETAPES = $derived([
    {
      icone: "serrure" as const,
      titre: t("Bienvenue dans Sésame"),
      texte: t("Vos comptes, vos dépenses et votre épargne au même endroit, sur vos appareils uniquement. Rien n'est envoyé en ligne : vos données sont chiffrées avec votre mot de passe."),
    },
    {
      icone: "importer" as const,
      titre: t("Importez vos relevés"),
      texte: t("Téléchargez un relevé PDF, CSV ou Excel depuis le site de votre banque, puis importez-le : la banque, le compte, les poches et les catégories sont reconnus tout seuls."),
      action: [t("Importer maintenant"), "import"] as [string, Page],
    },
    {
      icone: "budgets" as const,
      titre: t("Fixez vos budgets"),
      texte: t("Après votre premier import, la page Budgets propose des plafonds d'après vos dépenses habituelles. Un appui suffit pour les accepter, et vous les ajustez quand vous voulez."),
    },
    {
      icone: "synchro" as const,
      titre: t("Sur vos autres appareils"),
      texte: t("Pour retrouver vos données sur votre téléphone ou votre PC : exportez une sauvegarde (Paramètres), restaurez-la sur l'autre appareil, puis synchronisez vos changements avec le bouton aux deux flèches. Toutes les réponses sont dans la page Aide."),
    },
  ]);
  const e = $derived(ETAPES[etape]);

  async function terminer(vers?: Page) {
    app.revoirGuide = false;
    app.params.guideVu = true;
    await sauverParametres();
    if (vers) app.page = vers;
  }
</script>

<Feuille titre={t("Prise en main")} fermer={() => terminer()}>
  <div class="ecran">
    <span class="pastille"><Icone nom={e.icone} taille={30} /></span>
    <h3>{e.titre}</h3>
    <p>{e.texte}</p>
    {#if etape === 0}
      <div class="langues" role="radiogroup" aria-label="Langue / Language">
        {#each [["fr", "Français"], ["en", "English"]] as [code, nom] (code)}
          <button role="radio" aria-checked={langue.code === code} class:on={langue.code === code} onclick={() => changerLangueEtCategories(code as Langue)}>{nom}</button>
        {/each}
      </div>
    {/if}
  </div>

  <div class="points" aria-hidden="true">
    {#each ETAPES as _, i (i)}<i class:on={i === etape}></i>{/each}
  </div>

  {#if e.action}
    <button class="principal" onclick={() => terminer(e.action![1])}>{e.action[0]}</button>
    <button onclick={() => (etape += 1)}>{t("Plus tard")}</button>
  {:else if etape < ETAPES.length - 1}
    <button class="principal" onclick={() => (etape += 1)}>{t("Suivant")}</button>
  {:else}
    <button class="principal" onclick={() => terminer()}>{t("C'est parti")}</button>
  {/if}
  {#if etape < ETAPES.length - 1}<button class="lien" onclick={() => terminer()}>{t("Passer le guide")}</button>{/if}
</Feuille>

<style>
  .ecran {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 12px;
    padding: 8px 4px 4px;
  }
  .pastille {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: var(--accent);
    color: var(--sur-accent);
    display: grid;
    place-items: center;
  }
  h3 {
    font-size: 22px;
    font-weight: 800;
    letter-spacing: -0.01em;
  }
  p {
    color: var(--doux);
    line-height: 1.55;
    max-width: 42ch;
  }
  .langues {
    display: flex;
    gap: 4px;
    padding: 4px;
    border-radius: 999px;
    background: var(--surface);
  }
  .langues button {
    background: none;
    padding: 8px 16px;
    font-size: 14px;
  }
  .langues .on {
    background: var(--fond);
    box-shadow: 0 1px 3px rgba(10, 12, 20, 0.12);
  }
  .points {
    display: flex;
    justify-content: center;
    gap: 6px;
  }
  .points i {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--surface-2);
  }
  .points i.on {
    background: var(--accent);
    width: 20px;
    border-radius: 4px;
  }
</style>
