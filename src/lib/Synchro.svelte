<script lang="ts">
  import { t, locale } from "./i18n.svelte";
  // Synchronisation sans réseau : on envoie un fichier à l'autre appareil (Quick Share, Bluetooth, câble, e-mail…),
  // qui l'ajoute à ses données sans rien écraser (la modification la plus récente gagne).
  import { api, estAndroid } from "./api";
  import { app, apresReception, appareil, sauverParametres } from "./etat.svelte";
  import Feuille from "./Feuille.svelte";
  import Icone from "./Icone.svelte";

  let { fermer }: { fermer: () => void } = $props();
  let enCours = $state(false);
  let info = $state("");

  const quand = (iso?: string) =>
    iso ? new Date(iso).toLocaleString(locale(), { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "jamais";

  async function agir(f: () => Promise<void>) {
    enCours = true;
    try {
      await f();
    } catch (e) {
      info = String(e);
    } finally {
      enCours = false;
    }
  }

  const envoyer = () =>
    agir(async () => {
      if (!(await api.envoyerChangements(await appareil()))) return;
      app.params.aEnvoyer = false;
      app.params.dernierEnvoi = new Date().toISOString();
      await sauverParametres();
      info = estAndroid
        ? t("Choisissez Quick Share (ou Bluetooth, e-mail…) puis votre PC. Sur le PC, le fichier est ajouté tout seul quand il arrive dans Téléchargements.")
        : t("Fichier enregistré. Envoyez-le à votre téléphone : clic droit sur le fichier → Partager → Quick Share (ou Bluetooth, e-mail…). Sur le téléphone, appuyez sur le fichier reçu puis « Ouvrir avec Sésame ».");
    });

  const recevoir = () =>
    agir(async () => {
      const n = await api.recevoirChangements();
      if (n === null) return;
      await apresReception({ fichiers: 1, changements: n, erreurs: [] });
      info = n ? t("{0} changement{1} ajouté{2}.", n, n > 1 ? "s" : "", n > 1 ? "s" : "") : t("Vous étiez déjà à jour.");
    });
</script>

<Feuille titre={t("Synchroniser mes appareils")} {fermer}>
  <p class="sous">
    {t("Chaque appareil garde ses données. Pour mettre l'autre à jour, envoyez-lui vos changements : il les ajoute sans rien écraser. Si un même élément a été modifié des deux côtés, la modification la plus récente gagne.")}
  </p>

  <p class="etat" class:attente={app.params.aEnvoyer}>
    {app.params.aEnvoyer ? t("Vous avez des changements que l'autre appareil n'a pas encore.") : t("Rien de nouveau à envoyer.")}
    <span class="sous">{t("Dernier envoi :")} {quand(app.params.dernierEnvoi)} {t("· dernière réception :")} {quand(app.params.dernierRecu)}</span>
  </p>

  <button class="principal" onclick={envoyer} disabled={enCours}><Icone nom="envoyer" taille={18} />{t("Envoyer mes changements")}</button>
  <button onclick={recevoir} disabled={enCours}><Icone nom="telecharger" taille={18} />{t("Recevoir des changements (choisir le fichier)")}</button>

  {#if info}<p class="info" role="status">{info}</p>{/if}

  <p class="sous">
    {estAndroid
      ? t("Fichier reçu d'un autre appareil : appuyez dessus (notification Quick Share, appli Fichiers…) puis « Ouvrir avec Sésame ».")
      : t("Les fichiers reçus dans votre dossier Téléchargements sont ajoutés automatiquement, puis supprimés.")}
    {t("Les deux appareils doivent avoir démarré avec les mêmes données (une sauvegarde de l'un restaurée sur l'autre).")}
  </p>
</Feuille>

<style>
  button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }
  .etat {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px 14px;
    border-radius: 14px;
    background: var(--surface-2);
  }
  .etat.attente {
    font-weight: 600;
  }
  .info {
    padding: 12px 14px;
    border-radius: 14px;
    background: var(--surface-2);
    border-left: 4px solid var(--accent);
  }
</style>
