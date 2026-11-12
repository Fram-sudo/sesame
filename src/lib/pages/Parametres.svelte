<script lang="ts">
  import { t, locale, langue, type Langue } from "../i18n.svelte";
  import { changerLangueEtCategories } from "../donnees.svelte";
  import { api, estAndroid } from "../api";
  import ChampMotDePasse from "../ChampMotDePasse.svelte";
  import CleRecuperation from "../CleRecuperation.svelte";
  import { annoncer, app, mettreAJourTaux, sauverParametres } from "../etat.svelte";
  import { aDesDonneesDemo, chargerDemo, retirerDemo } from "../demo";
  import { charger, vider } from "../donnees.svelte";
  import GestionCategories from "../GestionCategories.svelte";
  import RemiseAZero from "../RemiseAZero.svelte";
  import Icone from "../Icone.svelte";

  type Panneau = "" | "mdp" | "cle" | "restaurer" | "effacer";
  let ouvert = $state<Panneau>("");
  let ancien = $state("");
  let nouveau = $state("");
  let valide = $state(false);
  let mdp = $state("");
  let nouvelleCle = $state("");
  let confirmation = $state("");
  let enCours = $state(false);
  let erreur = $state("");
  let categories = $state(false);
  let remise = $state(false);

  function basculer(p: Panneau) {
    ouvert = ouvert === p ? "" : p;
    ancien = nouveau = mdp = nouvelleCle = confirmation = erreur = "";
  }

  async function agir(f: () => Promise<void>) {
    enCours = true;
    erreur = "";
    try {
      await f();
    } catch (e) {
      erreur = String(e);
    } finally {
      enCours = false;
    }
  }

  const changerMdp = () =>
    agir(async () => {
      await api.changerMdp(ancien, nouveau);
      basculer("");
      annoncer(t("Mot de passe changé."));
    });

  const genererCle = () =>
    agir(async () => {
      nouvelleCle = await api.nouvelleCle(mdp);
      mdp = "";
    });

  const exporter = () =>
    agir(async () => {
      if (await api.exporter()) annoncer(t("Sauvegarde chiffrée enregistrée."));
    });

  const restaurer = () =>
    agir(async () => {
      if (await api.importer(mdp)) {
        basculer("");
        app.params = await api.lireParametres();
        await charger();
        await sauverParametres();
        annoncer(t("Sauvegarde restaurée. Son mot de passe est désormais celui de cet appareil."));
      }
    });

  const effacer = () =>
    agir(async () => {
      await api.toutEffacer();
      vider();
      app.ecran = "creation";
    });
  // Empreinte (téléphone seulement, si le téléphone en a une enregistrée)
  const empreinte = $state({ possible: false, active: false, enCours: false });
  if (estAndroid)
    void (async () => {
      empreinte.possible = await api.empreinteDisponible().catch(() => false);
      empreinte.active = (await api.etat()).empreinte;
    })();
  async function basculerEmpreinte(oui: boolean) {
    empreinte.enCours = true;
    try {
      if (oui) await api.activerEmpreinte(t("Activer l'empreinte"), t("Annuler"));
      else await api.desactiverEmpreinte();
      empreinte.active = oui;
      annoncer(oui ? t("Empreinte activée.") : t("Empreinte désactivée."));
    } catch {
      // Annulée ou refusée : on affiche l'état réel
      empreinte.active = (await api.etat()).empreinte;
      annoncer(oui ? t("Empreinte non activée.") : t("Empreinte toujours active."));
    } finally {
      empreinte.enCours = false;
    }
  }
</script>

<div class="pile">
  <section class="carte pile">
    <h2>{t("Affichage")}</h2>
    <!-- Boutons plutôt que listes déroulantes : pas de fenêtre système carrée sur Android -->
    {#snippet choix<V>(nom: string, valeur: V, options: [V, string][], changer: (v: V) => void)}
      <div class="reglage">
        <span class="sous">{nom}</span>
        <div class="segments" role="radiogroup" aria-label={nom}>
          {#each options as [v, l] (v)}
            <button role="radio" aria-checked={valeur === v} class:on={valeur === v} onclick={() => changer(v)}>{l}</button>
          {/each}
        </div>
      </div>
    {/snippet}
    {@render choix(t("Langue"), langue.code, [["fr", "Français"], ["en", "English"]] as [Langue, string][], (v) => changerLangueEtCategories(v))}
    {@render choix(t("Thème"), app.params.theme, [["auto", t("Auto")], ["clair", t("Clair")], ["sombre", t("Sombre")]] as [typeof app.params.theme, string][], (v) => ((app.params.theme = v), sauverParametres()))}
    <label class="interrupteur">
      <input type="checkbox" bind:checked={app.params.discret} onchange={sauverParametres} />
      <span>{t("Mode discret : masquer les montants")}</span>
    </label>
  </section>

  <section class="carte pile">
    <h2>{t("Classement et imports")}</h2>
    <p class="sous">{t("Les opérations sont classées et rangées automatiquement. Tout se règle ici.")}</p>
    <button onclick={() => (app.page = "regles")}>{t("Règles de classement")}</button>
    <button onclick={() => (categories = true)}>{t("Catégories")}</button>
    <button onclick={() => (app.page = "banques")}>{t("Banques et imports")}</button>
  </section>

  <section class="carte pile">
    <h2>{t("Sécurité")}</h2>
    {#if empreinte.possible}
      <label class="interrupteur">
        <input type="checkbox" checked={empreinte.active} disabled={empreinte.enCours} onchange={(e) => basculerEmpreinte(e.currentTarget.checked)} />
        <span>{t("Ouvrir avec l'empreinte")}</span>
      </label>
      <p class="sous">{t("Posez le doigt au lieu de taper le mot de passe. Le mot de passe reste toujours possible, et redevient nécessaire si vous ajoutez une empreinte dans le téléphone.")}</p>
    {/if}
    <div class="reglage">
      <span class="sous">{t("Verrouillage automatique après (minutes sans activité)")}</span>
      <div class="segments" role="radiogroup" aria-label={t("Verrouillage automatique après (minutes sans activité)")}>
        {#each [1, 2, 5, 10, 15, 30] as m (m)}
          <button role="radio" aria-checked={app.params.verrouMinutes === m} class:on={app.params.verrouMinutes === m} onclick={() => ((app.params.verrouMinutes = m), sauverParametres())}>{m}</button>
        {/each}
      </div>
    </div>

    <button onclick={() => basculer("mdp")}><Icone nom="cadenas" taille={18} />{t("Changer le mot de passe maître")}</button>
    {#if ouvert === "mdp"}
      <form class="pile sous-panneau" onsubmit={(e) => (e.preventDefault(), changerMdp())}>
        <label>{t("Mot de passe actuel")}<input type="password" bind:value={ancien} autocomplete="current-password" required /></label>
        <ChampMotDePasse bind:valeur={nouveau} bind:valide libelle={t("Nouveau mot de passe")} />
        {#if erreur}<p class="erreur">{erreur}</p>{/if}
        <button class="principal" type="submit" disabled={!ancien || !valide || enCours}>{enCours ? t("Changement…") : t("Changer")}</button>
      </form>
    {/if}

    <button onclick={() => basculer("cle")}><Icone nom="cle" taille={18} />{t("Créer une nouvelle clé de récupération")}</button>
    {#if ouvert === "cle"}
      <div class="pile sous-panneau">
        {#if nouvelleCle}
          <CleRecuperation cle={nouvelleCle} termine={() => (basculer(""), annoncer(t("Nouvelle clé enregistrée. L'ancienne ne fonctionne plus.")))} />
        {:else}
          <p class="sous">{t("L'ancienne clé cessera immédiatement de fonctionner.")}</p>
          <form class="pile" onsubmit={(e) => (e.preventDefault(), genererCle())}>
            <label>{t("Mot de passe maître")}<input type="password" bind:value={mdp} autocomplete="current-password" required /></label>
            {#if erreur}<p class="erreur">{erreur}</p>{/if}
            <button class="principal" type="submit" disabled={!mdp || enCours}>{t("Créer la nouvelle clé")}</button>
          </form>
        {/if}
      </div>
    {/if}
  </section>

  <section class="carte pile">
    <h2>{t("Sauvegarde")}</h2>
    <p class="sous">{t("Le fichier de sauvegarde est chiffré comme le coffre : il ne s'ouvre qu'avec votre mot de passe.")}</p>
    <button onclick={exporter} disabled={enCours}><Icone nom="telecharger" taille={18} />{t("Exporter une sauvegarde chiffrée")}</button>
    <button onclick={() => basculer("restaurer")}><Icone nom="envoyer" taille={18} />{t("Restaurer une sauvegarde")}</button>
    {#if ouvert === "restaurer"}
      <form class="pile sous-panneau" onsubmit={(e) => (e.preventDefault(), restaurer())}>
        <p class="info">{t("La sauvegarde remplacera toutes les données actuelles de cet appareil.")}</p>
        <label>{t("Mot de passe de la sauvegarde")}<input type="password" bind:value={mdp} autocomplete="off" required /></label>
        {#if erreur}<p class="erreur">{erreur}</p>{/if}
        <button class="principal" type="submit" disabled={!mdp || enCours}>{enCours ? t("Vérification…") : t("Choisir le fichier et restaurer")}</button>
      </form>
    {/if}
  </section>

  <section class="carte pile">
    <h2>{t("Données de démonstration")}</h2>
    <p class="sous">{t("Des comptes et opérations fictifs pour découvrir l'appli. Ils se retirent d'un coup, sans toucher à vos vraies données.")}</p>
    {#if aDesDonneesDemo()}
      <button onclick={() => agir(async () => (await retirerDemo(), annoncer(t("Données de démo retirées."))))} disabled={enCours}>{t("Retirer les données de démo")}</button>
    {:else}
      <button onclick={() => agir(async () => (await chargerDemo(), annoncer(t("Données de démo ajoutées."))))} disabled={enCours}>{t("Ajouter les données de démo")}</button>
    {/if}
  </section>

  <section class="carte pile">
    <h2>{t("Devises")}</h2>
    <p class="sous">{t("Le franc CFA est toujours converti au taux fixe : 1 € = 655,957 F CFA. Pour le dollar US et le dollar canadien, l'appli peut télécharger les taux officiels de la Banque centrale européenne.")}</p>
    <label class="interrupteur">
      <input type="checkbox" bind:checked={app.params.tauxActifs} onchange={async () => (await sauverParametres(), app.params.tauxActifs && (await mettreAJourTaux(true)))} />
      <span>{t("Mettre à jour les taux de change une fois par jour")}</span>
    </label>
    <p class="sous">{t("L'appli télécharge seulement le fichier public des taux du jour sur ecb.europa.eu : rien de vos données n'est envoyé. Les derniers taux sont gardés pour fonctionner hors connexion.")}</p>
    {#if app.params.taux}
      <p class="sous">
        {t("Taux du")} {new Date(app.params.taux.date + "T00:00:00Z").toLocaleDateString(locale(), { timeZone: "UTC" })} : 1 € =
        {(app.params.taux.valeurs.USD ?? 0).toLocaleString(locale())} {t("$ US ·")} {(app.params.taux.valeurs.CAD ?? 0).toLocaleString(locale())} {t("$ CA")}
      </p>
      {#if app.params.tauxActifs}<button onclick={() => agir(async () => annoncer((await mettreAJourTaux(true)) ? t("Taux mis à jour.") : t("Pas de connexion : les derniers taux sont gardés.")))} disabled={enCours}>{t("Mettre à jour maintenant")}</button>{/if}
    {/if}
  </section>

  <section class="carte pile">
    <h2>{t("Zone sensible")}</h2>
    <button class="danger" onclick={() => (remise = true)}><Icone nom="poubelle" taille={18} />{t("Remettre des comptes à zéro")}</button>
    <button class="danger" onclick={() => basculer("effacer")}><Icone nom="poubelle" taille={18} />{t("Tout effacer sur cet appareil")}</button>
    {#if ouvert === "effacer"}
      <form class="pile sous-panneau" onsubmit={(e) => (e.preventDefault(), effacer())}>
        <p class="erreur">
          {t("Toutes les données de cet appareil seront supprimées définitivement. Vos sauvegardes exportées ne sont pas touchées. Pour confirmer, tapez EFFACER.")}
        </p>
        <input bind:value={confirmation} autocomplete="off" aria-label={t("Tapez EFFACER pour confirmer")} />
        {#if erreur}<p class="erreur">{erreur}</p>{/if}
        <button class="danger" type="submit" disabled={confirmation !== "EFFACER" || enCours}>{t("Effacer définitivement")}</button>
      </form>
    {/if}
  </section>

  <p class="sous centre">{t("Sésame 0.1 · données chiffrées sur cet appareil, aucun envoi.")}</p>
</div>

{#if remise}<RemiseAZero fermer={() => (remise = false)} />{/if}
{#if categories}<GestionCategories fermer={() => (categories = false)} />{/if}

<style>
  .reglage {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .segments {
    display: flex;
    gap: 4px;
    padding: 4px;
    border-radius: 999px;
    background: var(--fond);
  }
  .segments button {
    flex: 1;
    min-width: 0;
    padding: 9px 6px;
    font-size: 14px;
    background: none;
    color: var(--doux);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .segments .on {
    background: var(--accent);
    color: var(--sur-accent);
  }
  section > button {
    justify-content: flex-start;
  }
  .sous-panneau {
    border-left: 3px solid var(--accent-fond);
    padding-left: 12px;
  }
  .interrupteur {
    flex-direction: row;
    align-items: center;
    gap: 10px;
    color: var(--texte);
    font-size: 15px;
  }
  .interrupteur input {
    width: 20px;
    height: 20px;
    accent-color: var(--accent);
  }
  .centre {
    text-align: center;
  }
</style>
