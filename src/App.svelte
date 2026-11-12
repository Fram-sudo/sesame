<script lang="ts">
  import { t } from "./lib/i18n.svelte";
  import Coquille from "./lib/Coquille.svelte";
  import Creation from "./lib/Creation.svelte";
  import { app, demarrer } from "./lib/etat.svelte";
  import Verrou from "./lib/Verrou.svelte";
  import { langue } from "./lib/i18n.svelte";

  let erreur = $state("");
  demarrer().catch((e) => (erreur = String(e)));
</script>

{#key langue.code}
{#if erreur}
  <p class="erreur" style="margin:24px">{t("Démarrage impossible :")} {erreur}</p>
{:else if app.ecran === "creation"}
  <Creation />
{:else if app.ecran === "verrou"}
  <Verrou />
{:else if app.ecran === "app"}
  <Coquille />
{/if}
{/key}
