<script lang="ts">
  import Choix from "./Choix.svelte";
  import { t } from "./i18n.svelte";
  // Catégories (renommer, ajouter, supprimer) et règles apprises (supprimer).
  import { type Categorie } from "./categories";
  import { classerEtLier, donnees, ecrire, nouvelId, supprimer, type Changement } from "./donnees.svelte";
  import { annoncer } from "./etat.svelte";
  import Feuille from "./Feuille.svelte";
  import Icone from "./Icone.svelte";
  import IconeCategorie from "./IconeCategorie.svelte";
  import { BANQUE_ICONES } from "./icones";

  let { fermer }: { fermer: () => void } = $props();

  const COULEURS = ["#F59E0B", "#F97316", "#EF4444", "#F43F5E", "#EC4899", "#C026D3", "#7C3AED", "#6366F1", "#2563EB", "#0EA5E9", "#06B6D4", "#14B8A6", "#10B981", "#16A34A", "#84CC16", "#64748B"];
  // Catégorie dont on choisit l'icône et la couleur
  let edition = $state("");
  const modifier = (c: Categorie, champs: Partial<Categorie>) => ecrire([{ collection: "categories", id: c.id, valeur: { ...c, ...champs } }]);
  let nom = $state("");
  let type = $state<"depense" | "revenu">("depense");
  let aSupprimer = $state("");

  async function ajouter(e: SubmitEvent) {
    e.preventDefault();
    const id = nouvelId();
    await ecrire([{ collection: "categories", id, valeur: { id, nom: nom.trim(), type, couleur: COULEURS[donnees.categories.length % COULEURS.length] } }]);
    nom = "";
  }

  const renommer = (c: Categorie, n: string) => n.trim() && n.trim() !== c.nom && ecrire([{ collection: "categories", id: c.id, valeur: { ...c, nom: n.trim() } }]);

  async function effacer(c: Categorie) {
    // Les opérations de cette catégorie redeviennent « sans catégorie » et peuvent être reclassées
    const ch: Changement[] = donnees.operations
      .filter((o) => o.categorieId === c.id)
      .map((o) => ({ collection: "operations", id: o.id, valeur: { ...o, categorieId: undefined, categorieManuelle: false } }));
    ch.push(...supprimer("regles", donnees.regles.filter((r) => r.categorieId === c.id)), { collection: "categories", id: c.id, valeur: null });
    await ecrire(ch);
    await classerEtLier();
    aSupprimer = "";
    annoncer(t("Catégorie « {0} » supprimée.", c.nom));
  }
</script>

<Feuille titre={t("Catégories")} {fermer}>
  {#each [["depense", "Dépenses"], ["revenu", "Revenus"]] as [ty, titre] (ty)}
    <h3>{titre}</h3>
    {#each donnees.categories.filter((c) => c.type === ty) as c (c.id)}
      <div class="ligne">
        <button class="choix-icone" aria-label={t("Icône et couleur de {0}", c.nom)} aria-expanded={edition === c.id} onclick={() => (edition = edition === c.id ? "" : c.id)}>
          <IconeCategorie id={c.id} taille={36} />
        </button>
        <input value={c.nom} aria-label={t("Nom de la catégorie")} onchange={(e) => renommer(c, e.currentTarget.value)} />
        {#if aSupprimer === c.id}
          <button class="danger petit" onclick={() => effacer(c)}>{t("Supprimer")}</button>
        {:else}
          <button class="icone" aria-label={t("Supprimer {0}", c.nom)} onclick={() => (aSupprimer = c.id)}><Icone nom="poubelle" taille={17} /></button>
        {/if}
      </div>
      {#if edition === c.id}
        <div class="atelier">
          <p class="sous">{t("Couleur")}</p>
          <div class="couleurs">
            {#each COULEURS as k (k)}
              <button class="pastille-couleur" class:on={c.couleur === k} style:background={k} aria-label={t("Couleur {0}", k)} onclick={() => modifier(c, { couleur: k })}></button>
            {/each}
          </div>
          <p class="sous">{t("Icône")}{c.icone ? "" : t(" (devinée d'après le nom tant que vous n'en choisissez pas)")}</p>
          {#each BANQUE_ICONES as [theme, icones] (theme)}
            <p class="theme">{theme}</p>
            <div class="icones">
              {#each icones as i (i)}
                <button class="pastille-icone" class:on={c.icone === i} aria-label={i} title={i} onclick={() => modifier(c, { icone: i })}>
                  <IconeCategorie icone={i} teinte={c.couleur} taille={36} />
                </button>
              {/each}
            </div>
          {/each}
          {#if c.icone}<button class="lien" onclick={() => modifier(c, { icone: undefined })}>{t("Revenir à l'icône automatique")}</button>{/if}
        </div>
      {/if}
    {/each}
  {/each}

  <form class="ajout" onsubmit={ajouter}>
    <input bind:value={nom} placeholder={t("Nouvelle catégorie")} aria-label={t("Nouvelle catégorie")} />
    <Choix bind:valeur={type} titre={t("Type")} classe="pastille" options={[{ v: "depense", l: t("Dépense") }, { v: "revenu", l: t("Revenu") }]} />
    <button type="submit" disabled={!nom.trim()}>{t("Ajouter")}</button>
  </form>

</Feuille>

<style>
  h3 {
    font-size: 15px;
    margin-top: 6px;
  }
  .ligne {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .ligne input {
    padding: 8px 12px;
  }
  .choix-icone {
    padding: 0;
    background: none;
    flex: none;
  }
  .atelier {
    display: flex;
    flex-direction: column;
    gap: 8px;
    background: var(--surface);
    border-radius: 18px;
    padding: 14px;
  }
  .couleurs,
  .icones {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .pastille-couleur {
    width: 30px;
    height: 30px;
    padding: 0;
  }
  .pastille-icone {
    padding: 0;
    background: none;
    border-radius: 50%;
  }
  .pastille-couleur.on,
  .pastille-icone.on {
    box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--accent);
  }
  .theme {
    font-size: 12px;
    font-weight: 700;
    color: var(--doux);
    margin-top: 4px;
  }
  .icone {
    width: 38px;
    height: 38px;
    padding: 0;
    flex: none;
  }
  .petit {
    padding: 8px 12px;
    flex: none;
  }
  .ajout {
    display: flex;
    gap: 8px;
  }
</style>
