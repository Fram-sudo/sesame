<script lang="ts">
  // Démo du site : visite guidée sur des données fictives (voir Visite.svelte pour le moteur).
  import { onMount } from "svelte";
  import { t } from "./i18n.svelte";
  import Visite, { type Etape } from "./Visite.svelte";

  // Démo affichée dans la page du site (et non ouverte en plein écran)
  const dansLeSite = (() => {
    try {
      return window.top !== window;
    } catch {
      return true;
    }
  })();
  const ETAPES: Etape[] = $derived([
    { page: "accueil", titre: t("Bienvenue dans la démo de Sésame"), texte: t("Tout est fictif et rien n'est enregistré : touchez ce que vous voulez. La visite dure une minute.") + (dansLeSite ? " " + t("Au-dessus de la démo, les boutons « Téléphone » et « Ordinateur » vous montrent les deux versions.") : "") },
    { page: "accueil", cible: "solde", titre: t("Votre argent vraiment disponible"), texte: t("Le chiffre du haut, c'est ce que vous pouvez dépenser : l'épargne est mise à part. Touchez « en euros » pour tout afficher en francs CFA ou en dollars.") },
    { page: "import", cible: "import", titre: t("Importez un relevé"), texte: t("Touchez « Choisir des fichiers » : un relevé d'exemple est chargé. Sésame reconnaît la banque et le compte tout seul."), suite: "verifier" },
    { page: "import", cible: "verifier", titre: t("Une vérification, une seule fois"), texte: t("Pour un format jamais vu, Sésame montre ce qu'il a compris : dates, libellés, montants. Touchez « C'est bon » : les relevés suivants seront reconnus tout seuls, quelle que soit la banque ou la langue.") },
    { page: "import", cible: "fichier importer", titre: t("Les doublons sont écartés"), texte: t("Seules les nouvelles opérations sont gardées. Touchez « Tout importer » : elles sont rangées dans leurs catégories automatiquement."), suite: "importe" },
    { page: "operations", cible: "operation", titre: t("Classez en un geste"), texte: t("Touchez une opération pour changer sa catégorie. Sésame retient votre choix pour les prochaines fois.") },
    { page: "budgets", cible: "budgets", titre: t("Des budgets qui préviennent"), texte: t("Ce qu'il vous reste pour le mois, et par jour. L'appli vous alerte quand le rythme de dépense dérape.") },
    { page: "analyse", cible: "prevision", titre: t("Pas de mauvaise surprise"), texte: t("Salaire, loyer et abonnements à leur date : la prévision montre votre argent sur les 3 prochains mois.") },
    { page: "epargne", cible: "epargne", titre: t("Épargne et poches"), texte: t("Livrets, poches Revolut, tirelire : votre épargne est suivie à part, avec des objectifs.") },
    { titre: t("PC et téléphone, sans cloud"), texte: t("Vos appareils s'échangent leurs changements par un simple fichier. Tout reste chiffré chez vous : aucun compte, aucun serveur.") },
  ]);

  let n = $state(-1);
  let visite = $state<Visite>();
  onMount(() => {
    const depart = setTimeout(() => visite?.aller(0), 1800); // après le chargement des données fictives
    return () => clearTimeout(depart);
  });
</script>

<Visite bind:this={visite} bind:n etapes={ETAPES} relancer quitter={() => {}}>
  {#snippet premiere()}
    <button onclick={() => (n = -1)}>{t("Explorer seul")}</button>
    <button class="principal" onclick={() => visite?.aller(1)}>{t("Commencer la visite")}</button>
  {/snippet}
  {#snippet derniereActions()}
    <button onclick={() => (n = -1)}>{t("Continuer à explorer")}</button>
    <a class="bouton-lien principal" href="../#installer" target="_top">{t("Télécharger Sésame")}</a>
  {/snippet}
</Visite>

<style>
  .bouton-lien {
    text-decoration: none;
    padding: 10px 16px;
    border-radius: 999px;
    font-weight: 700;
    background: var(--accent);
    color: var(--sur-accent);
  }
</style>
