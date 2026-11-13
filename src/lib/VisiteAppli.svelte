<script lang="ts">
  // Visite complète de l'appli, chapitre par chapitre, sur les vrais écrans (moteur : Visite.svelte).
  // Coffre vide : des données fictives sont ajoutées le temps de la visite, puis retirées.
  import { onMount } from "svelte";
  import { estAndroid } from "./api";
  import { aDesDonneesDemo, chargerDemo, retirerDemo } from "./demo";
  import { donnees } from "./donnees.svelte";
  import { app, sauverParametres } from "./etat.svelte";
  import { t } from "./i18n.svelte";
  import Visite, { type Etape } from "./Visite.svelte";

  const ch = {
    accueil: t("Accueil"),
    import: t("Import"),
    ops: t("Opérations"),
    budgets: t("Budgets"),
    analyse: t("Analyse et prévision"),
    epargne: t("Épargne"),
    prets: t("Prêts"),
    synchro: t("Synchronisation"),
    sauvegarde: t("Sauvegarde et alertes"),
    params: t("Paramètres"),
    aide: t("Aide"),
  };
  const etapesVisite = (): Etape[] => [
    { page: "accueil", chapitre: ch.accueil, titre: t("Visite de Sésame"), texte: t("En 3 minutes, l'essentiel de l'appli, écran par écran. Vous pouvez quitter à tout moment et reprendre plus tard depuis la page Aide.") + (demoAjoutee ? " " + t("Des données fictives sont affichées pendant la visite : elles disparaîtront à la fin.") : "") },
    { page: "accueil", chapitre: ch.accueil, cible: "solde", titre: t("Votre argent vraiment disponible"), texte: t("Le grand chiffre, c'est ce que vous pouvez dépenser : l'épargne et l'argent réservé sont mis à part. Touchez « en euros ▾ » pour tout afficher dans une autre devise, ou « Autre devise… » pour en ajouter une.") },
    { page: "accueil", chapitre: ch.accueil, cible: "comptes", titre: t("Vos comptes"), texte: t("Une carte par compte, avec son solde. Touchez-en une pour n'afficher que ce compte. Le « + » ajoute un compte, un porte-monnaie d'espèces ou une épargne, dans la devise de votre choix.") },
    { page: "accueil", chapitre: ch.accueil, cible: "actions", titre: t("Les raccourcis"), texte: t("« Ajouter » pour noter une dépense ou un revenu à la main (un paiement en espèces, par exemple), « Importer » pour vos relevés, et un accès direct aux budgets et à l'épargne.") },
    { page: "accueil", chapitre: ch.accueil, cible: "mois", titre: t("Le mois en un coup d'œil"), texte: t("Ce que vous avez dépensé, comparé à d'habitude, et la courbe du mois : faites glisser le doigt ou la souris dessus pour lire chaque jour. Les flèches en haut changent de mois.") },
    { page: "accueil", chapitre: ch.accueil, cible: "discret", titre: t("Mode discret"), texte: t("L'œil masque tous les montants, pratique dans les transports ou au bureau. Touchez-le à nouveau pour les revoir.") },
    { page: "import", chapitre: ch.import, cible: "import", titre: t("Importez vos relevés"), texte: estAndroid ? t("Téléchargez vos relevés depuis l'appli de votre banque (PDF, CSV, Excel, OFX…), puis choisissez-les ici : un seul ou des dizaines d'un coup. La banque, le compte, les poches et les catégories sont reconnus tout seuls.") : t("Téléchargez vos relevés depuis le site de votre banque (PDF, CSV, Excel, OFX…), puis choisissez-les ici ou glissez-les sur la fenêtre : un seul ou des dizaines d'un coup. La banque, le compte, les poches et les catégories sont reconnus tout seuls.") },
    { page: "import", chapitre: ch.import, titre: t("Un seul écran pour tout vérifier"), texte: t("Les relevés sont regroupés par compte. Un format jamais vu se vérifie une seule fois, pour tous ses relevés. Les onglets montrent les nouvelles opérations, vos saisies à la main retrouvées (à garder ou remplacer), les paiements en attente et les poches. Les doublons sont ignorés, puis un seul bouton importe tout.") },
    { page: "import", chapitre: ch.import, cible: "historique", titre: t("Imports précédents"), texte: t("Chaque import y laisse une ligne. « Retirer de la liste » garde les opérations dans l'appli ; pour supprimer les opérations d'un import, un bouton à part demande confirmation.") },
    { page: "operations", chapitre: ch.ops, cible: "recherche", titre: t("Retrouver une opération"), texte: t("Tapez un mot du libellé : la recherche porte sur toutes les dates. Sans recherche, la liste suit la période choisie en haut.") },
    { page: "operations", chapitre: ch.ops, cible: "operation", titre: t("Classez en un geste"), texte: t("Touchez une opération pour changer sa catégorie, la déplacer vers un autre compte ou la supprimer. Sésame retient votre choix pour les prochaines fois. Un paiement « en attente » est compté dans vos dépenses jusqu'à son arrivée sur le relevé.") },
    { page: "budgets", chapitre: ch.budgets, cible: "budgets", titre: t("Des budgets qui préviennent"), texte: t("Ce qu'il vous reste pour le mois, et par jour. « Tout proposer d'après mes moyennes » crée vos budgets en un appui ; un budget peut aussi être annuel (vacances, cadeaux…).") },
    { page: "analyse", chapitre: ch.analyse, cible: "prevision", titre: t("Pas de mauvaise surprise"), texte: t("Salaire, loyer et abonnements à leur date : la prévision montre votre argent sur les 3 prochains mois.") },
    { page: "analyse", chapitre: ch.analyse, cible: "categories", titre: t("Où part votre argent"), texte: t("Vos dépenses par catégorie : la moyenne par mois, et le mois choisi comparé à cette moyenne (▲ plus, ▼ moins).") },
    { page: "epargne", chapitre: ch.epargne, cible: "epargne", titre: t("Épargne, poches et réserve"), texte: t("Livrets, poches de votre banque, tirelire en espèces : votre épargne est suivie à part, avec des objectifs. Une poche « Réservé » (pour payer une mensualité, par exemple) ne compte ni dans l'épargne ni dans l'argent disponible.") },
    { page: "prets", chapitre: ch.prets, cible: "prets", titre: t("Vos prêts"), texte: t("Montant, taux et durée suffisent : l'échéancier, le capital restant dû et l'effet d'un remboursement anticipé sont calculés pour vous.") },
    { page: "accueil", chapitre: ch.synchro, cible: "synchro", titre: t("Vos autres appareils"), texte: t("Le bouton aux deux flèches échange vos changements avec votre téléphone ou votre PC par un simple fichier (Quick Share, Bluetooth, e-mail). Un point s'allume quand vous avez des changements à envoyer. Aucun compte, aucun serveur.") },
    { page: "parametres", chapitre: ch.sauvegarde, cible: "sauvegarde", titre: t("Votre sauvegarde"), texte: t("Exportez de temps en temps une sauvegarde chiffrée et rangez-la hors de l'appareil. Si vous oubliez, un rappel apparaît sur l'accueil.") },
    { page: "parametres", chapitre: ch.sauvegarde, cible: "alertes", titre: t("Les alertes"), texte: estAndroid ? t("Budget presque atteint, prélèvement à venir, sauvegarde à faire : le téléphone vous prévient, même appli fermée. Choisissez ici celles que vous voulez.") : t("Budget presque atteint, prélèvement à venir, sauvegarde à faire : l'ordinateur vous prévient pendant que Sésame est ouvert, et les rappels s'affichent sur l'accueil. Choisissez ici celles que vous voulez.") },
    { page: "parametres", chapitre: ch.params, cible: "devises", titre: t("Devises"), texte: t("Chaque compte garde sa devise. Activez les taux de change pour tout additionner ; pour une devise que la Banque centrale européenne ne suit pas, saisissez son taux vous-même.") },
    { page: "parametres", chapitre: ch.params, cible: "securite", titre: t("Sécurité"), texte: estAndroid ? t("Changez votre mot de passe, revoyez votre clé de récupération et ouvrez Sésame avec votre empreinte. L'appli se verrouille seule après quelques minutes.") : t("Changez votre mot de passe et revoyez votre clé de récupération. L'appli se verrouille seule après quelques minutes ; l'empreinte, elle, se règle sur le téléphone.") },
    { page: "aide", chapitre: ch.aide, cible: "aide", titre: t("Toutes les réponses"), texte: t("Cherchez un mot (import, budget, devise…) : chaque question a sa réponse et un bouton qui mène au bon endroit. Vous pouvez relancer cette visite ici quand vous voulez.") },
  ];

  let demoAjoutee = $state(false);
  let pret = $state(false);
  let n = $state(-1);
  let visite = $state<Visite>();
  const etapes = $derived(etapesVisite());

  onMount(() => {
    void (async () => {
      // Coffre vide : de quoi voir chaque écran rempli
      if (!donnees.comptes.length && !donnees.operations.length) {
        await chargerDemo();
        demoAjoutee = true;
        app.params.visiteDemo = true;
        await sauverParametres();
      }
      pret = true;
      setTimeout(() => visite?.aller(Math.min(Math.max(app.visite, 0), etapes.length - 1)), 300);
    })();
  });

  async function quitter(ou: number, terminee: boolean) {
    app.visite = -1;
    // Terminée : on repart du début la prochaine fois ; quittée : on reprend au chapitre en cours
    app.params.visiteEtape = terminee ? undefined : debutChapitre(ou);
    if (app.params.visiteDemo) {
      if (aDesDonneesDemo()) await retirerDemo();
      app.params.visiteDemo = undefined;
    }
    await sauverParametres();
    app.page = terminee ? "accueil" : app.page;
  }
  const debutChapitre = (i: number) => etapes.findIndex((e) => e.chapitre === etapes[i]?.chapitre);
</script>

{#if pret}
  <Visite bind:this={visite} bind:n {etapes} {quitter}>
    {#snippet premiere()}
      <button onclick={() => (n = -1, quitter(0, false))}>{t("Plus tard")}</button>
      <button class="principal" onclick={() => visite?.aller(1)}>{t("Commencer")}</button>
    {/snippet}
  </Visite>
{/if}
