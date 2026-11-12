<script lang="ts">
  import { t, locale } from "../i18n.svelte";
  // « Plus » (téléphone) : tout ce qui n'a pas d'onglet, avec un résumé sur chaque ligne.
  import { donnees, soldes } from "../donnees.svelte";
  import { app, type Page } from "../etat.svelte";
  import { argent } from "../format";
  import Icone from "../Icone.svelte";
  import { resume } from "../prets";

  let { synchro }: { synchro: () => void } = $props();

  const parCompte = $derived(soldes());
  const epargne = $derived(donnees.comptes.filter((c) => c.parentId || c.type === "epargne"));
  const totalEpargne = $derived(epargne.filter((c) => c.devise === "EUR").reduce((a, c) => a + (parCompte.get(c.id) ?? 0), 0));
  const restantDu = $derived(donnees.prets.reduce((a, p) => a + resume(p, new Date().toISOString().slice(0, 10)).restantDu, 0));
  const dernierImport = $derived(Math.max(0, ...donnees.imports.map((i) => i.quand)));

  type Ligne = [Page | "synchro", "epargne" | "pret" | "analyse" | "importer" | "synchro" | "parametres" | "operations" | "portefeuille" | "aide", string, string];
  const LIGNES = $derived<Ligne[]>([
    ["epargne", "epargne", t("Épargne"), epargne.length ? t("{0} dans {1} poche{2} et livret{3}", argent(totalEpargne, "EUR"), epargne.length, epargne.length > 1 ? "s" : "", epargne.length > 1 ? "s" : "") : t("Livrets, poches, tirelire")],
    ["prets", "pret", t("Prêts"), restantDu ? t("{0} restant dû", argent(restantDu, "EUR")) : t("Suivre un prêt et son échéancier")],
    ["analyse", "analyse", t("Analyse"), t("Tendances et prévision sur 3 mois")],
    ["import", "importer", t("Importer des relevés"), dernierImport ? t("Dernier import le {0}", new Date(dernierImport).toLocaleDateString(locale())) : t("PDF, CSV ou Excel, toutes banques")],
    ["synchro", "synchro", t("Synchroniser mes appareils"), app.params.aEnvoyer ? t("Changements à envoyer") : t("À jour")],
    ["regles", "operations", t("Règles de classement"), t("Comment vos opérations sont rangées")],
    ["banques", "portefeuille", t("Banques et imports"), t("Ce que l'appli a retenu de chaque banque")],
    ["parametres", "parametres", t("Paramètres"), t("Thème, devises, sauvegarde, sécurité")],
    ["aide", "aide", t("Aide"), t("Les réponses aux questions pratiques")],
  ]);
</script>

<div class="menu">
  {#each LIGNES as [p, i, titre, detail] (p)}
    <button onclick={() => (p === "synchro" ? synchro() : (app.page = p))}>
      <span class="ic"><Icone nom={i} taille={20} /></span>
      <span class="txt"><strong>{titre}</strong><small class:alerte={p === "synchro" && app.params.aEnvoyer}>{detail}</small></span>
      <span class="fl"><Icone nom="retour" taille={18} /></span>
    </button>
  {/each}
</div>

<style>
  .menu {
    background: var(--surface);
    border-radius: var(--rayon);
    overflow: hidden;
  }
  button {
    width: 100%;
    justify-content: flex-start;
    gap: 14px;
    padding: 14px 16px;
    border-radius: 0;
    background: none;
    text-align: left;
    border-bottom: 1px solid var(--bord);
  }
  button:last-child {
    border-bottom: none;
  }
  .ic {
    width: 40px;
    height: 40px;
    border-radius: 12px;
    background: var(--surface-2);
    display: grid;
    place-items: center;
    flex: none;
  }
  .txt {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  small {
    font-size: 13px;
    font-weight: 600;
    color: var(--doux);
  }
  small.alerte {
    color: var(--accent);
  }
  .fl {
    color: var(--pale);
    transform: rotate(180deg);
    display: flex;
  }
</style>
