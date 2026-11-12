<script lang="ts">
  import { t, locale } from "../i18n.svelte";
  // Import de relevés, quelle que soit la banque : un ou plusieurs fichiers (sélecteur ou glisser-déposer sur PC),
  // banque et compte reconnus automatiquement, vérification fichier par fichier, puis un seul bouton.
  import { onMount } from "svelte";
  import { api, estAndroid, type Releve } from "../api";
  import { classerEtLier, donnees, ecrire, supprimer, type Import } from "../donnees.svelte";
  import { annoncer } from "../etat.svelte";
  import FichierImport from "../FichierImport.svelte";
  import { dateCourte } from "../format";
  import Icone from "../Icone.svelte";
  import { preparer, type Preparation } from "../import/fichier";

  let fichiers = $state.raw<{ cle: number; prep: Preparation }[]>([]);
  let cartes = $state<FichierImport[]>([]);
  let erreurs = $state<string[]>([]);
  let enCours = $state(false);
  let survol = $state(false);
  let aAnnuler = $state("");
  let n = 0;
  const historique = $derived([...donnees.imports].sort((a, b) => b.quand - a.quand));
  // Où en est chaque compte : date de sa dernière opération, pour savoir quel relevé importer
  const aJour = $derived.by(() => {
    const der = new Map<string, string>();
    for (const o of donnees.operations) if (!o.enAttente && o.date > (der.get(o.compteId) ?? "")) der.set(o.compteId, o.date);
    const auj = Date.now();
    return donnees.comptes
      // Comptes courants, et épargne seulement si elle s'importe (une tirelire se tient à la main)
      .filter((c) => !c.parentId && !c.archive && (c.type !== "epargne" || donnees.imports.some((i) => i.compteId === c.id)))
      .map((c) => {
        const d = der.get(c.id);
        return { c, d, jours: d ? Math.floor((auj - Date.parse(d + t("T12:00:00"))) / 86_400_000) : undefined };
      })
      .sort((a, b) => (b.jours ?? 1e9) - (a.jours ?? 1e9));
  });

  async function ajouter(releves: Releve[]) {
    enCours = true;
    for (const r of releves) {
      try {
        fichiers = [...fichiers, { cle: n++, prep: await preparer(r, donnees.profils) }];
      } catch (e) {
        erreurs = [...erreurs, `${r.nom} : ${e}`];
      }
    }
    enCours = false;
  }

  async function choisir() {
    erreurs = [];
    try {
      await ajouter(await api.lireReleves());
    } catch (e) {
      erreurs = [String(e)];
    }
  }

  async function toutImporter() {
    enCours = true;
    // Un fichier après l'autre : les doublons entre deux relevés qui se chevauchent sont ainsi écartés
    for (const c of cartes) if (c?.estPret()) await c.importer();
    enCours = false;
    annoncer(t("Import terminé."));
  }

  async function annulerImport(imp: Import) {
    await ecrire([...supprimer("operations", donnees.operations.filter((o) => o.importId === imp.id)), { collection: "imports", id: imp.id, valeur: null }]);
    await classerEtLier();
    aAnnuler = "";
    annoncer(t("Import annulé : {0} opérations retirées.", imp.nb));
  }

  // Glisser-déposer des relevés sur la fenêtre (PC)
  onMount(() => {
    if (estAndroid) return;
    let fin: (() => void) | undefined;
    import("@tauri-apps/api/webview")
      .then(({ getCurrentWebview }) =>
        getCurrentWebview().onDragDropEvent(async (e) => {
          if (e.payload.type === "over" || e.payload.type === "enter") survol = true;
          else survol = false;
          if (e.payload.type === "drop" && e.payload.paths.length) {
            erreurs = [];
            await ajouter(await api.lireRelevesChemins(e.payload.paths));
          }
        }),
      )
      .then((f) => (fin = f))
      .catch(() => {}); // hors de l'appli (navigateur de développement)
    return () => fin?.();
  });

  const nbPrets = $derived(fichiers.length);
  // Un relevé d'un format jamais vu attend qu'on vérifie son aperçu
  const aVerifier = $derived(cartes.some((c) => c?.attendValidation()));
</script>

<div class="pile">
  <section class="carte depot pile" class:survol>
    <Icone nom="importer" taille={28} />
    <p><strong>{estAndroid ? t("Choisissez vos relevés") : t("Déposez vos relevés ici")}</strong></p>
    <p class="sous">{t("PDF, CSV, Excel, de n'importe quelle banque, un ou plusieurs à la fois. La banque et le compte sont reconnus automatiquement.")}</p>
    <button class="principal" data-visite="import" onclick={choisir} disabled={enCours}>{enCours ? t("Lecture…") : t("Choisir des fichiers")}</button>
  </section>

  {#each erreurs as e, i (i)}<p class="erreur">{e}</p>{/each}

  {#each fichiers as f, i (f.cle)}
    <FichierImport bind:this={cartes[i]} prep={f.prep} retirer={() => (fichiers = fichiers.filter((x) => x.cle !== f.cle))} />
  {/each}

  {#if nbPrets}
    {#if aVerifier}<p class="sous">{t("Vérifiez d'abord l'aperçu du relevé ci-dessus, puis touchez « C'est bon ».")}</p>{/if}
    <div class="actions">
      <button onclick={() => (fichiers = [])}>{t("Tout effacer")}</button>
      <button class="principal" data-visite="importer" onclick={toutImporter} disabled={enCours || aVerifier}>{enCours ? t("Import en cours…") : t("Tout importer")}</button>
    </div>
  {/if}

  {#if aJour.length && !nbPrets}
    <section class="carte pile">
      <h2>{t("Où en sont vos comptes")}</h2>
      {#each aJour as { c, d, jours } (c.id)}
        <div class="histo">
          <div>
            <strong>{c.nom}</strong>
            <p class="sous">{d ? (jours ? t("Dernière opération le {0} (il y a {1} j)", dateCourte(d), jours) : t("Dernière opération le {0} (aujourd'hui)", dateCourte(d))) : t("Aucune opération pour l'instant")}</p>
          </div>
          {#if jours === undefined || jours > 30}<span class="a-faire">{t("Relevé à importer")}</span>{/if}
        </div>
      {/each}
    </section>
  {/if}

  {#if historique.length}
    <section class="carte pile">
      <h2>{t("Imports précédents")}</h2>
      {#each historique as imp (imp.id)}
        {@const c = donnees.comptes.find((x) => x.id === imp.compteId)}
        <div class="histo">
          <div>
            <strong>{imp.fichier}</strong>
            <p class="sous">
              {c?.nom} · {imp.nb} {t("opération")}{imp.nb > 1 ? "s" : ""}{imp.nb ? " " + t("du {0} au {1}", dateCourte(imp.de), dateCourte(imp.a)) : ""}
              {t("· importé le")} {new Date(imp.quand).toLocaleDateString(locale())}
            </p>
          </div>
          {#if aAnnuler === imp.id}
            <div class="ligne">
              <button onclick={() => (aAnnuler = "")}>{t("Garder")}</button>
              <button class="danger" onclick={() => annulerImport(imp)}>{t("Retirer")}</button>
            </div>
          {:else}
            <button class="lien" onclick={() => (aAnnuler = imp.id)}>{t("Annuler")}</button>
          {/if}
        </div>
      {/each}
    </section>
  {/if}
</div>

<style>
  .a-faire {
    flex: none;
    font-size: 12px;
    padding: 4px 10px;
    border-radius: 999px;
    background: var(--orange-fond, rgba(216, 90, 48, 0.15));
    color: var(--orange, #d85a30);
  }
  .depot {
    align-items: center;
    text-align: center;
    border: 2px dashed var(--bord);
    padding: 28px 18px;
    color: var(--doux);
  }
  .depot strong {
    color: var(--texte);
  }
  .survol {
    border-color: var(--accent);
    background: var(--accent-fond);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  .histo {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    border-top: 1px solid var(--bord);
    padding-top: 10px;
  }
  .histo strong {
    word-break: break-all;
  }
  .ligne {
    display: flex;
    gap: 6px;
    flex: none;
  }
</style>
