<script lang="ts">
  // Aide : les questions pratiques, une réponse courte et un bouton qui mène au bon endroit.
  import { app, type Page } from "../etat.svelte";
  import { locale, t } from "../i18n.svelte";
  import { HISTORIQUE, notesDansLaLangue } from "../maj.svelte";
  import Icone from "../Icone.svelte";
  import { normaliser } from "../import/analyse";

  let { synchro }: { synchro: () => void } = $props();

  type Question = { q: string; r: string; aller?: [string, Page | "synchro"] };
  const QUESTIONS: Question[] = $derived([
    {
      q: t("Comment importer un relevé ?"),
      r: t("Téléchargez le relevé depuis le site ou l'appli de votre banque (PDF, CSV ou Excel), puis touchez Importer. Sésame reconnaît la banque et le compte, ignore les opérations déjà présentes et range tout dans les bonnes catégories. Vous pouvez importer plusieurs fichiers d'un coup ; sur PC, glissez-les simplement sur la fenêtre."),
      aller: [t("Importer un relevé"), "import"],
    },
    {
      q: t("Comment classer une opération dans une catégorie ?"),
      r: t("Touchez l'opération, puis la catégorie voulue. Cochez « Classer ainsi les prochaines opérations » pour que l'appli s'en souvienne, et « Classer aussi les opérations semblables » pour ranger celles déjà là."),
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
      q: t("Comment changer de devise ou de langue ?"),
      r: t("La devise se choisit sur l'accueil, à côté d'« Argent disponible » (en euros ▾). Les dollars demandent d'activer les taux de change dans Paramètres → Devises. La langue se change dans Paramètres → Affichage."),
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
  <label class="recherche">
    <Icone nom="recherche" taille={18} />
    <input type="search" bind:value={recherche} placeholder={t("Chercher dans l'aide")} aria-label={t("Chercher dans l'aide")} />
  </label>

  <button class="revoir" onclick={() => (app.revoirGuide = true)}>
    <Icone nom="serrure" taille={20} />{t("Revoir la prise en main")}
  </button>

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
