// Banque d'icônes de catégorie (Tabler, embarquées) et icône devinée d'après le nom d'une catégorie.

/** Toutes les icônes proposées, rangées par thème pour le sélecteur. */
export const BANQUE_ICONES: [string, string[]][] = [
  ["Courses et repas", ["shopping-cart", "basket", "bread", "apple", "meat", "fish", "egg", "cookie", "candy", "cake", "pizza", "burger", "tools-kitchen-2", "coffee", "cup", "beer", "glass-cocktail", "glass-full", "ice-cream-2"]],
  ["Maison", ["home", "building", "bed", "bath", "armchair", "bolt", "flame", "droplet", "plug", "bulb", "wifi", "wash-machine", "tool", "hammer", "plant", "tree", "trash", "recycle"]],
  ["Transports", ["car", "gas-station", "parking", "road", "bus", "bus-stop", "train", "plane", "bike", "motorbike", "scooter", "truck-delivery"]],
  ["Santé et soin", ["heart", "pill", "first-aid-kit", "stethoscope", "ambulance", "dental", "scissors", "brush", "barbell", "ball-football"]],
  ["Loisirs et sorties", ["ticket", "movie", "music", "headphones", "guitar-pick", "microphone", "device-gamepad-2", "book", "camera", "palette", "beach", "mountain", "tent", "luggage", "hotel-service", "world", "map-pin", "sun", "snowflake", "umbrella"]],
  ["Shopping", ["shopping-bag", "shirt", "gift", "gift-card", "diamond", "crown", "star", "sparkles", "package", "building-store"]],
  ["Abonnements et appareils", ["repeat", "device-mobile", "phone", "device-tv", "device-laptop", "device-desktop", "apps", "cloud", "code", "printer", "mail"]],
  ["Famille et proches", ["users", "baby-carriage", "baby-bottle", "paw", "dog", "cat", "heart-handshake"]],
  ["Argent et papiers", ["cash", "cash-banknote", "coin", "wallet", "credit-card", "pig-money", "building-bank", "receipt", "receipt-tax", "file-invoice", "calculator", "chart-line", "currency-euro", "currency-bitcoin", "briefcase", "certificate", "gavel", "shield-check", "key", "lock", "arrows-exchange", "arrow-back-up"]],
  ["Études et travail", ["school", "notebook", "pencil", "target", "database"]],
  ["Autres", ["tag", "dots", "alert-triangle", "smoking", "leaf"]],
];
export const TOUTES_ICONES = BANQUE_ICONES.flatMap(([, l]) => l);

// Mots du nom (français et anglais) → icône. Le premier qui correspond gagne : du plus précis au plus général.
const MOTS: [RegExp, string][] = [
  [/boulang|patiss|p[aâ]tisserie|pain|bakery|bread/, "bread"],
  [/caf[eé]|coffee|th[eé]\b|starbucks/, "coffee"],
  [/pizza/, "pizza"],
  [/burger|fast.?food|mcdo|kfc/, "burger"],
  [/bar\b|bi[eè]re|beer|alcool|alcohol|ap[eé]ro|vin\b|wine/, "beer"],
  [/resto|restaurant|repas|d[iî]ner|d[eé]jeuner|cantine|food|meal|lunch|dinner|livraison repas|uber ?eats|deliveroo/, "tools-kitchen-2"],
  [/course|supermarch|alimentation|[eé]picerie|march[eé]|grocer|supermarket/, "shopping-cart"],
  [/essence|carburant|gasoil|fuel|gas\b|petrol/, "gas-station"],
  [/parking|stationnement/, "parking"],
  [/p[eé]age|autoroute|toll/, "road"],
  [/voiture|auto\b|automobile|garage|car\b|vehicle/, "car"],
  [/train|sncf|ouigo|tgv|rail/, "train"],
  [/avion|vol\b|flight|a[eé]roport|airport|airline/, "plane"],
  [/v[eé]lo|bike|cycl/, "bike"],
  [/moto|scooter/, "motorbike"],
  [/bus|m[eé]tro|navigo|tram|transport|commute|ratp|taxi|uber|vtc/, "bus"],
  [/h[oô]tel|airbnb|h[eé]bergement|accommodation/, "hotel-service"],
  [/voyage|vacance|travel|holiday|trip|s[eé]jour/, "luggage"],
  [/loyer|logement|maison|appart|rent|housing|home|colocation/, "home"],
  [/[eé]lectricit|[eé]nergie|edf|engie|electric|power|energy/, "bolt"],
  [/gaz\b|chauffage|heating/, "flame"],
  [/\beau\b|water/, "droplet"],
  [/internet|wifi|box\b|fibre|broadband/, "wifi"],
  [/t[eé]l[eé]phone|mobile|forfait|phone|sfr|orange|bouygues|free\b/, "device-mobile"],
  [/netflix|streaming|t[eé]l[eé]|disney|canal|tv\b|video/, "device-tv"],
  [/musique|spotify|deezer|music|concert/, "music"],
  [/jeu|gaming|game|playstation|xbox|nintendo|steam/, "device-gamepad-2"],
  [/abonnement|subscription|cotisation|membership/, "repeat"],
  [/livre|lecture|book|librairie|kindle/, "book"],
  [/[eé]cole|[eé]tude|universit|fac\b|scolarit|education|school|tuition|formation|course fees/, "school"],
  [/pharma|m[eé]dicament|medicine|pharmacy/, "pill"],
  [/dentist|dentaire|dental/, "dental"],
  [/m[eé]decin|docteur|sant[eé]|mutuelle|h[oô]pital|health|doctor|hospital|medical/, "stethoscope"],
  [/sport|gym|fitness|salle de sport|musculation|basic.?fit/, "barbell"],
  [/foot|ballon|football|soccer/, "ball-football"],
  [/coiff|barbier|hair|beaut[eé]|beauty|cosm[eé]ti|esth[eé]ti/, "scissors"],
  [/v[eê]tement|habit|mode\b|fashion|clothes|clothing|chaussure|shoes|zara|h&m/, "shirt"],
  [/cadeau|gift|anniversaire|birthday|no[eë]l|christmas/, "gift"],
  [/don\b|dons\b|charit|association|donation/, "heart-handshake"],
  [/animal|animaux|v[eé]t[eé]rinaire|chien|chat|pet\b|vet\b|dog|cat\b/, "paw"],
  [/enfant|b[eé]b[eé]|cr[eè]che|nounou|baby|child|kid|garde/, "baby-carriage"],
  [/famille|family|parent|ami|friend/, "users"],
  [/assurance|insurance/, "shield-check"],
  [/imp[oô]t|taxe|tax|urssaf|tr[eé]sor/, "receipt-tax"],
  [/frais bancaire|banque|bank|agios|commission|fee/, "building-bank"],
  [/[eé]pargne|livret|savings|tirelire|piggy/, "pig-money"],
  [/investiss|bourse|action|placement|invest|stock|pea\b|etf/, "chart-line"],
  [/crypto|bitcoin|ethereum/, "currency-bitcoin"],
  [/salaire|paie|paye|salary|wage|payroll|job|travail|freelance/, "briefcase"],
  [/aide|bourse|caf\b|allocation|apl\b|grant|benefit|scholarship/, "heart-handshake"],
  [/rembours|refund|reimburs/, "arrow-back-up"],
  [/retrait|esp[eè]ce|liquide|cash|atm/, "cash"],
  [/virement|transfer/, "arrows-exchange"],
  [/cin[eé]ma|film|movie|th[eé][aâ]tre|spectacle|show/, "movie"],
  [/sortie|loisir|leisure|fun|entertainment|soir[eé]e|party|f[eê]te/, "ticket"],
  [/photo|camera/, "camera"],
  [/jardin|garden|plante|plant|fleur|flower/, "plant"],
  [/bricolage|diy|outil|tool|leroy|castorama/, "tool"],
  [/meuble|furniture|ikea|d[eé]co/, "armchair"],
  [/ordinateur|informatique|[eé]lectronique|laptop|computer|tech|apple\b/, "device-laptop"],
  [/appli|logiciel|software|app\b|apps/, "apps"],
  [/laverie|pressing|laundry/, "wash-machine"],
  [/tabac|cigarette|smoking|vape/, "smoking"],
  [/amende|pv\b|contravention|fine|penalty/, "alert-triangle"],
  [/colis|livraison|delivery|amazon|package|poste/, "package"],
  [/shopping|achat|purchase|boutique|store/, "shopping-bag"],
  [/divers|autre|other|misc/, "dots"],
];

const sansAccents = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Icône la plus probable pour un nom de catégorie, ou undefined. */
export function devinerIcone(nom: string): string | undefined {
  const n = nom.toLowerCase();
  const sa = sansAccents(nom);
  return MOTS.find(([re]) => re.test(n) || re.test(sa))?.[1];
}
