<script lang="ts">
  // Icône d'une catégorie : pastille ronde pleine de sa couleur, pictogramme blanc (une couleur par catégorie, partout la même).
  import { ICONES } from "./categories";
  import { devinerIcone } from "./icones";
  import { donnees } from "./donnees.svelte";

  // Icônes intégrées à l'appli au moment de la construction (aucun chargement réseau)
  const svgs = import.meta.glob(
    "/node_modules/@tabler/icons/icons/outline/{alert-triangle,ambulance,apple,apps,armchair,arrow-back-up,arrows-exchange,baby-bottle,baby-carriage,ball-football,barbell,basket,bath,beach,bed,beer,bike,bolt,book,bread,briefcase,brush,building,building-bank,building-store,bulb,burger,bus,bus-stop,cake,calculator,camera,candy,car,cash,cash-banknote,cat,certificate,chart-line,cloud,code,coffee,coin,cookie,credit-card,crown,cup,currency-bitcoin,currency-euro,database,dental,device-desktop,device-gamepad-2,device-laptop,device-mobile,device-tv,diamond,dog,dots,droplet,egg,file-invoice,first-aid-kit,fish,flame,gas-station,gavel,gift,gift-card,glass-cocktail,glass-full,guitar-pick,hammer,headphones,heart,heart-handshake,help,home,hotel-service,ice-cream-2,key,leaf,lock,luggage,mail,map-pin,meat,microphone,motorbike,mountain,movie,music,notebook,package,palette,parking,paw,pencil,phone,pig-money,pill,pizza,plane,plant,plug,printer,receipt,receipt-tax,recycle,repeat,road,school,scissors,scooter,shield-check,shirt,shopping-bag,shopping-cart,smoking,snowflake,sparkles,star,stethoscope,sun,tag,target,tent,ticket,tool,tools-kitchen-2,train,trash,tree,truck-delivery,umbrella,users,wallet,wash-machine,wifi,world}.svg",
    { query: "?raw", import: "default", eager: true },
  ) as Record<string, string>;
  const svg = (nom: string) => svgs[`/node_modules/@tabler/icons/icons/outline/${nom}.svg`] ?? "";

  let { id, taille = 34, icone, teinte }: { id?: string; taille?: number; icone?: string; teinte?: string } = $props();
  const c = $derived(id ? donnees.categories.find((x) => x.id === id) : undefined);
  const couleur = $derived(teinte ?? c?.couleur ?? "#888780");
  // Icône choisie, sinon celle des catégories fournies, sinon devinée d'après le nom
  const nom = $derived(icone ?? (id ? (c?.icone ?? ICONES[id] ?? (c ? (devinerIcone(c.nom) ?? "tag") : "help")) : "help"));
</script>

<span class="icone" style:width="{taille}px" style:height="{taille}px" style:background={couleur} aria-hidden="true">
  {@html svg(nom)}
</span>

<style>
  .icone {
    display: inline-grid;
    place-items: center;
    border-radius: 50%;
    flex: none;
    color: #fff;
  }
  .icone :global(svg) {
    width: 52%;
    height: 52%;
    stroke-width: 2.2;
  }
</style>
