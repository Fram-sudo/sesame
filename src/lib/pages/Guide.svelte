<script lang="ts">
  // Aide : les questions pratiques, une réponse courte et un bouton qui mène au bon endroit.
  import { app, type Page } from "../etat.svelte";
  import { locale, t } from "../i18n.svelte";
  import { HISTORIQUE, notesDansLaLangue } from "../maj.svelte";
  import Icone from "../Icone.svelte";
  import { estAndroid } from "../api";
  import { normaliser } from "../import/analyse";

  let { synchro }: { synchro: () => void } = $props();

  type Question = { q: string; r: string; aller?: [string, Page | "synchro"] };
  const QUESTIONS: Question[] = $derived([
    {
      q: t("Comment importer un relevé ?"),
      r: t("Téléchargez le relevé depuis le site ou l'appli de votre banque (PDF, CSV, Excel, OFX, QIF ou CAMT), puis touchez Importer. Sésame reconnaît la banque et le compte, ignore les opérations déjà présentes et range tout dans les bonnes catégories. Vous pouvez importer plusieurs fichiers d'un coup ; sur PC, glissez-les simplement sur la fenêtre."),
      aller: [t("Importer un relevé"), "import"],
    },
    {
      q: t("Comment importer beaucoup de relevés d'un coup ?"),
      r: t("Choisissez-les tous ensemble (même plusieurs dizaines). Sésame les regroupe par compte : vous confirmez le compte une fois par groupe, vous vérifiez une seule fois chaque format jamais vu, puis un écran montre tout ce qui va entrer (nouvelles opérations, vos saisies retrouvées, paiements en attente, poches). Un seul bouton importe le tout, les doublons entre relevés sont ignorés."),
      aller: [t("Importer des relevés"), "import"],
    },
    {
      q: t("J'ai noté une dépense à la main : fera-t-elle doublon à l'import ?"),
      r: t("Non. Quand le relevé arrive, Sésame retrouve votre saisie (même montant, date proche) et la remplace par la ligne de la banque. Dans l'onglet « Vos saisies retrouvées », décochez une saisie pour la garder telle quelle."),
      aller: [t("Importer un relevé"), "import"],
    },
    {
      q: t("Que veut dire « en attente » ?"),
      r: t("C'est un paiement par carte que la banque n'a pas encore débité. Il compte déjà dans vos dépenses et votre argent disponible ; quand il arrive sur un relevé, il est remplacé par la ligne définitive, sans doublon."),
      aller: [t("Voir mes opérations"), "operations"],
    },
    {
      q: t("À quoi sert la liste des imports précédents ?"),
      r: t("Elle garde une ligne par import : date, comptes, nombre d'opérations. « Retirer de la liste » efface seulement la ligne, vos opérations restent. Pour annuler vraiment un import, le bouton rouge supprime ses opérations après confirmation, et remet les saisies qu'il avait remplacées."),
      aller: [t("Importer un relevé"), "import"],
    },
    {
      q: t("Comment classer une opération dans une catégorie ?"),
      r: t("Touchez l'opération, puis la catégorie voulue. Cochez « Classer ainsi les prochaines opérations » pour que l'appli s'en souvienne, et « Classer aussi les opérations semblables » pour ranger celles déjà là."),
      aller: [t("Voir mes opérations"), "operations"],
    },
    {
      q: t("Comment classer beaucoup d'opérations d'un coup ?"),
      r: t("Ouvrez « À classer » (depuis Plus, ou le bandeau de l'accueil). Les opérations sans catégorie y sont regroupées par commerçant, les plus gros montants d'abord, avec une catégorie proposée. Un appui classe tout le groupe et crée une règle : les prochaines opérations de ce commerçant seront classées toutes seules."),
      aller: [t("Classer en lot"), "classer"],
    },
    {
      q: t("Comment me fixer une date pour un objectif d'épargne ?"),
      r: t("Touchez votre compte d'épargne, entrez un objectif puis une date dans « Pour le ». Sésame calcule ce qu'il faut mettre de côté chaque mois et vous dit si vous êtes en avance ou en retard ; un trait sur la jauge montre où vous devriez en être."),
      aller: [t("Voir mon épargne"), "epargne"],
    },
    {
      q: t("Qu'est-ce que le bilan du mois ?"),
      r: t("Au début de chaque mois, l'accueil résume le mois écoulé : revenus, dépenses comparées à d'habitude, ce qui vous reste, les trois plus grosses dépenses, les budgets dépassés et une bonne nouvelle. Il reste consultable dans Analyse, et une alerte peut vous le rappeler."),
      aller: [t("Voir le bilan"), "analyse"],
    },
    {
      q: t("Comment suivre mes abonnements ?"),
      r: t("Dans Analyse, « Mes prélèvements réguliers » liste ce qui revient à date fixe, avec le coût par mois et par an. Sésame signale un prix en hausse, un prélèvement en double ou un nouveau prélèvement."),
      aller: [t("Voir mes prélèvements"), "analyse"],
    },
    {
      q: t("Comment exporter mes opérations vers Excel ou en PDF ?"),
      r: t("Dans Opérations, choisissez ce que vous voulez (période, compte, catégorie, recherche, filtres) puis touchez « Exporter » : tableur CSV pour Excel, ou document à imprimer en PDF. Le fichier est créé sur votre appareil, rien n'est envoyé."),
      aller: [t("Voir mes opérations"), "operations"],
    },
    {
      q: t("Comment chercher par montant ou seulement les dépenses ?"),
      r: t("Dans Opérations, touchez « Filtres » : dépenses ou revenus, montant entre deux valeurs, et, pendant une recherche, limitation à la période choisie en haut. « Effacer les filtres » remet tout à zéro."),
      aller: [t("Voir mes opérations"), "operations"],
    },
    {
      q: t("Comment créer une catégorie et choisir son icône ?"),
      r: t("Depuis une opération, touchez « + Nouvelle catégorie » au bout de la liste. L'icône est devinée d'après le nom ; pour en choisir une autre, ou changer la couleur, allez dans Paramètres → Catégories et touchez l'icône de la catégorie."),
      aller: [t("Ouvrir les paramètres"), "parametres"],
    },
    {
      q: t("Comment fixer un budget ?"),
      r: t("Dans Budgets, touchez « Nouveau budget » ou « Tout proposer d'après mes moyennes » : l'appli propose un montant d'après vos 3 derniers mois. Un budget peut être mensuel ou annuel (vacances, cadeaux…). Un plafond global limite toutes vos dépenses du mois."),
      aller: [t("Voir mes budgets"), "budgets"],
    },
    {
      q: t("Que sont les poches, et comment les gérer ?"),
      r: t("Les poches (comme chez Revolut) sont de l'argent mis de côté dans votre banque. Elles sont créées toutes seules à l'import et ne comptent pas dans votre argent disponible. Dans Épargne, touchez une poche pour la renommer, lui fixer un objectif, l'archiver ou la fusionner."),
      aller: [t("Voir mon épargne"), "epargne"],
    },
    {
      q: t("Comment ajouter une tirelire ou un livret ?"),
      r: t("Dans Épargne, touchez « + Nouvelle épargne » et choisissez Tirelire, Livret ou Projet. Ensuite, « Mettre de côté » et « Retirer » suivent ce que vous y mettez ; « Ajuster le montant » corrige d'après ce que vous comptez réellement."),
      aller: [t("Voir mon épargne"), "epargne"],
    },
    {
      q: t("Comment suivre mon argent liquide ?"),
      r: t("Ajoutez un compte « Espèces » (le « + » des cartes de comptes sur l'accueil) et choisissez à partir de quelle date le suivre. Ensuite, vos retraits au distributeur y sont versés tout seuls (et vos dépôts au guichet en sortent) ; vos dépenses en liquide se notent avec « Ajouter ». Les retraits d'avant cette date restent de simples dépenses."),
      aller: [t("Aller à l'accueil"), "accueil"],
    },
    {
      q: t("À quoi sert « Réservé » ?"),
      r: t("Pour de l'argent mis de côté dans un but précis, comme une poche qui paie votre mensualité de prêt. Une poche ou un compte « Réservé » ne compte ni dans votre épargne ni dans votre argent disponible. Choisissez-le en touchant la poche, dans Épargne."),
      aller: [t("Voir mon épargne"), "epargne"],
    },
    {
      q: t("Comment suivre un prêt ?"),
      r: t("Dans Prêts, ajoutez le montant emprunté, le taux, la durée et la date de la première échéance. L'appli calcule l'échéancier, le capital restant dû, et peut simuler un remboursement anticipé avant que vous l'enregistriez."),
      aller: [t("Voir mes prêts"), "prets"],
    },
    {
      q: t("Comment retrouver mes données sur mon autre appareil ?"),
      r: t("La première fois, exportez une sauvegarde sur un appareil et restaurez-la sur l'autre. Ensuite, utilisez « Synchroniser mes appareils » : envoyez vos changements par Quick Share, Bluetooth ou e-mail, l'autre appareil les ajoute sans rien écraser."),
      aller: [t("Synchroniser"), "synchro"],
    },
    {
      q: t("Comment faire une sauvegarde et la restaurer ?"),
      r: t("Dans Paramètres → Sauvegarde, exportez une sauvegarde chiffrée : elle ne s'ouvre qu'avec votre mot de passe. Pour la restaurer, choisissez « Restaurer une sauvegarde » : elle remplace les données de l'appareil."),
      aller: [t("Ouvrir les paramètres"), "parametres"],
    },
    {
      q: t("Comment être prévenu (budget, prélèvement, sauvegarde) ?"),
      r: estAndroid
        ? t("Dans Paramètres → Alertes, choisissez ce qui vous intéresse : le téléphone vous prévient même appli fermée. Les montants peuvent être masqués dans les alertes.")
        : t("Dans Paramètres → Alertes, choisissez ce qui vous intéresse : l'ordinateur vous prévient pendant que Sésame est ouvert, et les rappels s'affichent aussi sur l'accueil. Sur téléphone, les alertes arrivent même appli fermée."),
      aller: [t("Ouvrir les paramètres"), "parametres"],
    },
    {
      q: t("Comment actualiser l'appli ?"),
      r: t("Dans Paramètres, touchez « Actualiser maintenant » : l'appli relit vos données, refait le classement et les virements, et cherche les changements de vos autres appareils et les mises à jour."),
      aller: [t("Ouvrir les paramètres"), "parametres"],
    },
    {
      q: t("Comment cacher mes montants ?"),
      r: t("Touchez l'œil en haut de l'écran : tous les montants sont masqués, jusqu'à ce que vous le touchiez à nouveau."),
    },
    {
      q: t("Comment mettre Sésame à jour ?"),
      r: t("Sésame vérifie au démarrage s'il existe une nouvelle version et affiche une petite carte : touchez-la pour l'installer. Vos données sont conservées. Vous pouvez aussi chercher vous-même dans Paramètres → Mises à jour."),
      aller: [t("Ouvrir les paramètres"), "parametres"],
    },
    {
      q: t("Comment changer de devise ou de langue ?"),
      r: t("La devise d'affichage se choisit sur l'accueil, à côté d'« Argent disponible » (en euros ▾) ; « Autre devise… » en ajoute une. Les conversions demandent d'activer les taux de change dans Paramètres → Devises ; pour une devise non suivie par la Banque centrale européenne, saisissez son taux vous-même. Un compte dans une autre devise se crée avec le « + » des cartes de comptes ; la devise d'un compte qui a déjà des opérations ne change plus. La langue se change dans Paramètres → Affichage."),
      aller: [t("Ouvrir les paramètres"), "parametres"],
    },
    {
      q: t("J'ai oublié mon mot de passe, que faire ?"),
      r: t("Sur l'écran de verrouillage, touchez « Mot de passe oublié ? » et saisissez votre clé de récupération (les 13 groupes de lettres reçus à la création). Vous choisissez alors un nouveau mot de passe. Sans mot de passe ni clé, personne ne peut rouvrir vos données."),
    },
    {
      q: t("Comment mes données sont-elles protégées ?"),
      r: t("Tout est chiffré sur l'appareil avec votre mot de passe (le même niveau que les gestionnaires de mots de passe), et chaque essai de mot de passe est volontairement lent pour décourager les tentatives en série. L'appli se verrouille seule après quelques minutes, et sur Android elle est masquée dans les applis récentes et bloque les captures d'écran. Elle n'est jamais sauvegardée dans le cloud. Sur téléphone, vous pouvez l'ouvrir avec votre empreinte. Le plus important : un bon mot de passe (4 ou 5 mots sans lien, utilisé nulle part ailleurs) et votre clé de récupération rangée sur papier."),
      aller: [t("Ouvrir les paramètres"), "parametres"],
    },
    {
      q: t("J'ai perdu mon téléphone ou mon PC, que faire ?"),
      r: t("Personne ne peut lire vos données sans votre mot de passe (ni votre empreinte, qui ne s'utilise que sur votre propre téléphone). Pour les retrouver, installez Sésame sur un nouvel appareil et restaurez votre dernière sauvegarde, ou synchronisez depuis votre autre appareil. Si vous pensez que quelqu'un connaît votre mot de passe, changez-le dans Paramètres → Sécurité."),
      aller: [t("Ouvrir les paramètres"), "parametres"],
    },
    {
      q: t("Où sont mes données, et qui peut les voir ?"),
      r: t("Uniquement sur vos appareils, chiffrées avec votre mot de passe. Il n'y a ni serveur ni compte en ligne, et rien n'est envoyé nulle part (sauf le téléchargement des taux de change, si vous l'activez, qui n'envoie aucune donnée)."),
    },
  ]);

  let recherche = $state("");
  let ouverte = $state(-1);
  const visibles = $derived(QUESTIONS.map((x, i) => ({ ...x, i })).filter((x) => !recherche.trim() || normaliser(`${x.q} ${x.r}`).includes(normaliser(recherche))));

  function aller(cible: Page | "synchro") {
    if (cible === "synchro") synchro();
    else app.page = cible;
  }
</script>

<div class="pile">
  <label class="recherche" data-visite="aide">
    <Icone nom="recherche" taille={18} />
    <input type="search" bind:value={recherche} placeholder={t("Chercher dans l'aide")} aria-label={t("Chercher dans l'aide")} />
  </label>

  <div class="visite">
    {#if app.params.visiteEtape !== undefined}
      <button class="revoir" onclick={() => (app.visite = app.params.visiteEtape!)}><Icone nom="serrure" taille={20} />{t("Reprendre la visite guidée")}</button>
      <button class="lien" onclick={() => (app.visite = 0)}>{t("Recommencer depuis le début")}</button>
    {:else}
      <button class="revoir" onclick={() => (app.visite = 0)}><Icone nom="serrure" taille={20} />{t("Faire la visite guidée (3 min)")}</button>
    {/if}
  </div>

  <div class="liste">
    {#each visibles as x (x.i)}
      <div class="question" class:ouverte={ouverte === x.i}>
        <button class="titre" aria-expanded={ouverte === x.i} onclick={() => (ouverte = ouverte === x.i ? -1 : x.i)}>
          <span>{x.q}</span><span class="chevron"><Icone nom="retour" taille={18} /></span>
        </button>
        {#if ouverte === x.i}
          <div class="reponse">
            <p>{x.r}</p>
            {#if x.aller}<button class="principal" onclick={() => aller(x.aller![1])}>{x.aller[0]}</button>{/if}
          </div>
        {/if}
      </div>
    {:else}
      <p class="sous vide">{t("Aucune réponse ne correspond. Essayez un autre mot.")}</p>
    {/each}
  </div>

  {#if !recherche}
    <section class="nouveautes">
      <h2>{t("Nouveautés")}</h2>
      {#each HISTORIQUE as v (v.version)}
        <div class="version">
          <p><strong>{t("Version {0}", v.version)}</strong> <span class="sous">· {new Date(v.date + "T12:00:00").toLocaleDateString(locale(), { day: "numeric", month: "long", year: "numeric" })}</span></p>
          <ul>{#each notesDansLaLangue(v.notes) as n}<li>{n}</li>{/each}</ul>
        </div>
      {/each}
    </section>
  {/if}
</div>

<style>
  .nouveautes {
    margin-top: 12px;
  }
  .nouveautes h2 {
    font-size: 1.1rem;
    margin: 0 0 8px;
  }
  .version {
    background: var(--surface);
    border-radius: 14px;
    padding: 12px 16px;
    margin-bottom: 8px;
  }
  .version p {
    margin: 0;
  }
  .version ul {
    margin: 6px 0 0;
    padding-left: 18px;
    color: var(--doux);
  }
  /* Largeur de lecture confortable sur grand écran */
  .pile {
    max-width: 820px;
  }
  .recherche {
    flex-direction: row;
    align-items: center;
    gap: 8px;
    background: var(--surface);
    border-radius: 14px;
    padding: 0 14px;
  }
  .recherche input {
    border: none;
    background: transparent;
    padding: 12px 0;
  }
  .recherche input:focus-visible {
    outline: none;
  }
  .visite {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 14px;
  }
  .revoir {
    align-self: flex-start;
    background: var(--accent-fond);
    color: var(--accent-texte);
    padding: 10px 18px;
  }
  .liste {
    background: var(--surface);
    border-radius: var(--rayon);
    overflow: hidden;
  }
  .question + .question {
    border-top: 1px solid var(--bord);
  }
  .titre {
    width: 100%;
    justify-content: space-between;
    gap: 12px;
    background: none;
    border-radius: 0;
    padding: 15px 16px;
    text-align: left;
    font-size: 15px;
  }
  .chevron {
    display: flex;
    color: var(--pale);
    transform: rotate(-90deg);
    transition: transform 0.2s;
    flex: none;
  }
  .ouverte .chevron {
    transform: rotate(90deg);
  }
  .reponse {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
    padding: 0 16px 16px;
    max-width: 70ch;
  }
  .reponse p {
    color: var(--doux);
    line-height: 1.55;
  }
  .reponse .principal {
    padding: 9px 16px;
    font-size: 14px;
  }
  .vide {
    padding: 20px 16px;
  }
</style>
