/**
 * Theme templates for the Brand page, in categories: Everyday (Dark / Mid /
 * Light), Holidays, Countries (by region), Provinces and Sports (NHL, NBA,
 * MLB, NFL, and city tabs for Toronto, Ottawa and Chicago). Every one passes
 * the readability checks (text
 * 4.5:1, accent and highlight 3:1 and support 4.5:1 on the background, button
 * text 4.5:1) and keeps its colours clearly apart. The app's own default is
 * added at the front unless it is already one of them.
 *
 * A template sets two to four colours: accent and background always; leave
 * out highlight (`null`) or support and the engine infers them. Team, country
 * and province themes are made from real colours with
 * scripts/template-from-colours.mjs.
 *
 * Part of jimbo-ui (foundation — don't edit here; change jimbo-ui and update).
 */

import { BRAND } from "./brand.config";
import { fullTheme, THEME_KEYS, type Theme } from "./theme";

export type Template = { name: string; vibe: string; theme: Theme };
export type TemplateGroup = { label: string; templates: Template[] };
/** A category. `tabs`: show its groups as sub-tabs (one at a time) instead of stacked. */
export type TemplateSet = { label: string; groups: TemplateGroup[]; tabs?: boolean };

/** name, vibe, then accent, highlight (null = inferred), background and (optional) support. */
const t = (name: string, vibe: string, accent: string, highlight: string | null, background: string, support?: string): Template =>
  ({ name, vibe, theme: { accent, background, ...(highlight ? { highlight } : {}), ...(support ? { support } : {}) } });


// Sports: team colours, not team artwork — each theme is inspired by a team's colours.
// Vibes start with the team's city ("Toronto · …"), which builds the city tabs.
const NHL: Template[] = [
  t("Ducks", "Anaheim · orange, gold, black", "#F5874B", "#B9975B", "#1C1411"),
  t("Bruins", "Boston · gold and black", "#FFB81C", "#FFE4A9", "#1D180F"),
  t("Sabres", "Buffalo · navy and gold", "#FFB81C", "#1568FF", "#091B3C", "#5893FF"),
  t("Flames", "Calgary · red, yellow, black", "#C8102E", "#F1BE48", "#190C10"),
  t("Hurricanes", "Carolina · red, black, silver", "#CE1126", "#ECA5AD", "#1A0C10"),
  t("Blackhawks", "Chicago · red, black, orange, green", "#CF0A2C", "#FF671B", "#1A0C10", "#00A24C"),
  t("Avalanche", "Colorado · burgundy, blue, silver", "#6DABDC", "#C1496E", "#32111C"),
  t("Blue Jackets", "Columbus · navy and red", "#F58390", "#006EF3", "#081E38", "#4498FF"),
  t("Stars", "Dallas · victory green, silver, black", "#00BF82", "#9EC6B9", "#0B1212"),
  t("Red Wings", "Detroit · red and white", "#CE1126", "#670913", "#FAF3F2"),
  t("Oilers", "Edmonton · navy and orange", "#FF824D", "#1370F1", "#081D39", "#5296F5"),
  t("Panthers", "Florida · red, navy, gold", "#F58194", "#B9975B", "#081D39", "#5296F5"),
  t("Kings", "Los Angeles · black and silver", "#F2F2F2", "#98A0A4", "#0C0C0E", "#7FB0E8"),
  t("Wild", "Minnesota · forest green, red, gold", "#ED8998", "#EAAA00", "#092017", "#DDCBA4"),
  t("Canadiens", "Montréal · red, blue, white", "#EB8A94", "#606CD9", "#12184B"),
  t("Predators", "Nashville · gold and navy", "#FFB81C", "#1370F1", "#081D39", "#5296F5"),
  t("Devils", "New Jersey · red and black", "#CE1126", "#ECA5AD", "#1A0C10"),
  t("Islanders", "New York · blue and orange", "#49ABFF", "#F47D30", "#0B1118"),
  t("Rangers", "New York · blue and red", "#F58390", "#1D69FF", "#091B3E", "#6195FF"),
  t("Senators", "Ottawa · red, black, gold", "#C52032", "#C2912C", "#190D11"),
  t("Flyers", "Philadelphia · orange and black", "#FE804D", "#FCBA9F", "#1C100D"),
  t("Penguins", "Pittsburgh · black and gold", "#FCB514", "#FEE3A6", "#1D180E"),
  t("Sharks", "San Jose · teal, orange, black", "#00B9C7", "#EA7200", "#0B1315"),
  t("Kraken", "Seattle · deep sea, ice blue, red", "#99D9D9", "#E9072B", "#051523", "#FA526D"),
  t("Blues", "St. Louis · blue, gold, navy", "#73A3FF", "#FCB514", "#081D39"),
  t("Lightning", "Tampa Bay · blue and white", "#002868", "#667EA4", "#F3F4F4"),
  t("Maple Leafs", "Toronto · blue and white", "#00205B", "#66799D", "#F3F3F3"),
  t("Mammoth", "Utah · mountain blue and black", "#6CACE4", "#C7DFF5", "#13171D"),
  t("Canucks", "Vancouver · blue, green, navy", "#75A5FF", "#00843D", "#061C2A"),
  t("Golden Knights", "Vegas · gold, steel, red", "#BCA26C", "#DF1233", "#181613", "#F26078"),
  t("Capitals", "Washington · red and navy", "#F58194", "#1370F1", "#081D39", "#5296F5"),
  t("Jets", "Winnipeg · navy, blue, red", "#55AAFF", "#E3233F", "#081D39", "#ED6E81"),
];
const NBA: Template[] = [
  t("Hawks", "Atlanta · red, volt, charcoal", "#EC898C", "#C1D32F", "#1B0F11"),
  t("Celtics", "Boston · green and gold", "#007A33", "#BA9653", "#0B1411"),
  t("Nets", "Brooklyn · black and white", "#111111", "#5F6368", "#FAFAFA", "#2F5D9A"),
  t("Hornets", "Charlotte · purple and teal", "#00788C", "#7764E3", "#1A0F57"),
  t("Bulls", "Chicago · red and black", "#CE1141", "#ECA5B7", "#1A0C12"),
  t("Cavaliers", "Cleveland · wine, gold, navy", "#FF77B0", "#FDBB30", "#081D39", "#5296F5"),
  t("Mavericks", "Dallas · blue, navy, silver", "#35ADFF", "#0071F7", "#081E37"),
  t("Nuggets", "Denver · gold, navy, red", "#FEC524", "#D24258", "#0C1E38", "#7197E1"),
  t("Pistons", "Detroit · red and blue", "#C8102E", "#3A61E0", "#190C10", "#6A87E8"),
  t("Warriors", "Golden State · blue and gold", "#FFC72C", "#3F72D7", "#0C1C3A"),
  t("Rockets", "Houston · red and black", "#CE1141", "#ECA5B7", "#1A0C12"),
  t("Pacers", "Indiana · navy and gold", "#FDBB30", "#006EEF", "#081D37"),
  t("Clippers", "LA · red, blue, black", "#F58194", "#3F72D7", "#0C1C3A"),
  t("Lakers", "Los Angeles · purple and gold", "#FDB927", "#9659D0", "#29123F"),
  t("Grizzlies", "Memphis · beale blue, navy, gold", "#96A6C7", "#F5B112", "#12173F", "#8891DD"),
  t("Heat", "Miami · red, yellow, black", "#F9A01B", "#EE0048", "#3E0919", "#FF5D8E"),
  t("Bucks", "Milwaukee · green, cream, blue", "#EEE1C6", "#007BC6", "#052311", "#00AF43"),
  t("Timberwolves", "Minnesota · navy, blue, green", "#6DABDC", "#78BE20", "#0A1E37"),
  t("Pelicans", "New Orleans · navy, red, gold", "#F58194", "#89744F", "#0A1E37", "#6099E1"),
  t("Knicks", "New York · blue and orange", "#006BB6", "#F58426", "#0B131A"),
  t("Thunder", "Oklahoma City · blue, orange, yellow", "#007AC1", "#EF3B24", "#081D37", "#F36957"),
  t("Magic", "Orlando · blue, silver, black", "#0077C0", "#9ECBE7", "#0B131A"),
  t("76ers", "Philadelphia · blue, red, navy", "#37ACFF", "#ED174C", "#081D36", "#F36789"),
  t("Suns", "Phoenix · purple, orange, gold", "#EC8E60", "#F9AD1B", "#1A0F57", "#9788EA"),
  t("Trail Blazers", "Portland · red and black", "#EC898C", null, "#1B0F11"),
  t("Kings", "Sacramento · purple and grey", "#BA96DA", null, "#281439"),
  t("Spurs", "San Antonio · silver, black, fiesta teal", "#00BCB3", "#EF426F", "#0B1819"),
  t("Raptors", "Toronto · red, black, gold", "#CE1141", "#B4975A", "#1A0C12"),
  t("Jazz", "Utah · purple and black", "#B199DD", null, "#24153E"),
  t("Wizards", "Washington · navy, red, silver", "#E31837", "#0070EF", "#081D36"),
];
const MLB: Template[] = [
  t("Diamondbacks", "Arizona · sedona red, sand, teal", "#ED8696", "#E3D4AD", "#170D10", "#30CED8"),
  t("Braves", "Atlanta · red, navy, gold", "#F583A0", "#EAAA00", "#0E1D3A", "#7397DD"),
  t("Orioles", "Baltimore · orange and black", "#FE8148", "#F3B99E", "#1B100D"),
  t("Red Sox", "Boston · red and navy", "#E38F94", "#2875D5", "#0A1E37"),
  t("Cubs", "Chicago · blue and red", "#CC3433", "#376EEA", "#0A1B43", "#6E96F0"),
  t("White Sox", "Chicago · black and silver", "#F2F2F2", "#ADB5BB", "#0C0C0E", "#7FB0E8"),
  t("Reds", "Cincinnati · red and black", "#C6011F", "#E99EAA", "#190B0F"),
  t("Guardians", "Cleveland · navy and red", "#E50022", "#0077C5", "#071E2E"),
  t("Rockies", "Colorado · purple, silver, black", "#A0A0CF", null, "#1B1B36"),
  t("Tigers", "Detroit · navy and orange", "#FC8161", "#2875D5", "#0A1E37"),
  t("Astros", "Houston · navy and orange", "#EF8C4E", "#006EEF", "#081D37"),
  t("Royals", "Kansas City · royal blue and gold", "#BD9B60", "#0076E3", "#071E33"),
  t("Angels", "Los Angeles · red, navy, silver", "#FF7D94", "#0073E4", "#071D33"),
  t("Dodgers", "Los Angeles · blue and red", "#3BACFF", "#EF3E42", "#0B1118"),
  t("Marlins", "Miami · blue, red, slate", "#00B2F4", "#EF3340", "#0B171D", "#5D98B4"),
  t("Brewers", "Milwaukee · navy and gold", "#FFC52F", "#3973CF", "#0D1D36"),
  t("Twins", "Minnesota · navy, red, gold", "#D31145", "#B9975B", "#081D36", "#3996FF"),
  t("Mets", "New York · blue and orange", "#FF8048", "#0C6CFF", "#091D3C", "#4F95FF"),
  t("Yankees", "New York · navy and grey", "#E4002C", "#1568FF", "#091B3C", "#5893FF"),
  t("Athletics", "Sacramento · green and gold", "#EFB21E", "#008877", "#041F1C"),
  t("Phillies", "Philadelphia · red and blue", "#F3838B", "#0C6CFF", "#091D3C", "#4F95FF"),
  t("Pirates", "Pittsburgh · black and gold", "#FDB827", "#FEE4AD", "#1D1810"),
  t("Padres", "San Diego · brown and gold", "#FFC425", "#8E6C57", "#221A15"),
  t("Giants", "San Francisco · orange, black, cream", "#FD8356", "#EFD19F", "#1D110F"),
  t("Mariners", "Seattle · navy, teal, silver", "#00B8B8", "#2174E0", "#081E3B"),
  t("Cardinals", "St. Louis · red, navy, yellow", "#ED899A", "#FEDB00", "#0A1E37", "#6099E1"),
  t("Rays", "Tampa Bay · navy, columbia blue, yellow", "#8FBCE6", "#F5D130", "#081D39", "#5998EF"),
  t("Rangers", "Texas · blue and red", "#F4858E", "#006AFF", "#081C38", "#4995FF"),
  t("Blue Jays", "Toronto · blue, navy, red", "#72A8EC", "#E8291C", "#121C39", "#EF6D64"),
  t("Nationals", "Washington · red and navy", "#FF7D7F", "#536ED9", "#0F1A45"),
];
const NFL: Template[] = [
  t("Cardinals", "Arizona · red, black, yellow", "#E58DA2", "#FFB612", "#160E11"),
  t("Falcons", "Atlanta · red, black, silver", "#ED8696", null, "#170D10"),
  t("Ravens", "Baltimore · purple, black, gold", "#CDA110", "#7462E0", "#1B1155", "#988BE8"),
  t("Bills", "Buffalo · blue and red", "#F78399", "#1569FF", "#091C3D", "#5894FF"),
  t("Panthers", "Carolina · panther blue, black, silver", "#12AEFF", "#4D749A", "#101820"),
  t("Bears", "Chicago · navy and orange", "#C83803", "#3A6DCB", "#0B162A"),
  t("Bengals", "Cincinnati · orange and black", "#FC845A", "#FDBCA6", "#1D110E"),
  t("Browns", "Cleveland · brown and orange", "#FF825C", "#AB6500", "#261905"),
  t("Cowboys", "Dallas · blue, navy, silver", "#75A7FF", "#1370F1", "#081D39"),
  t("Broncos", "Denver · orange and navy", "#FC845A", "#0072E3", "#071D33"),
  t("Lions", "Detroit · honolulu blue and silver", "#0076B6", "#9ECBE3", "#0B131A"),
  t("Packers", "Green Bay · green and gold", "#FFB612", "#4B8172", "#13201D"),
  t("Texans", "Houston · deep steel blue and red", "#ED8696", "#0C7EB9", "#061F2C"),
  t("Colts", "Indianapolis · speed blue and white", "#5FA9FF", "#9EAFC2", "#081E38"),
  t("Jaguars", "Jacksonville · black, gold, teal", "#D7A22A", "#007C90", "#101820"),
  t("Chiefs", "Kansas City · red and gold", "#E31837", "#FFB81C", "#1B0D11"),
  t("Raiders", "Las Vegas · silver and black", "#F2F2F2", "#9AA1A5", "#0C0C0E", "#7FB0E8"),
  t("Chargers", "Los Angeles · powder blue, gold, navy", "#19AEFF", "#FFC20E", "#081D37"),
  t("Rams", "Los Angeles · royal blue and sol", "#FFA300", "#1669FF", "#091C3F", "#5994FF"),
  t("Dolphins", "Miami · aqua and orange", "#00B9C5", "#FC4C02", "#0B1518", "#009AD4"),
  t("Vikings", "Minnesota · purple and gold", "#FFC62F", "#8E5ACF", "#261340"),
  t("Patriots", "New England · navy, red, silver", "#F78399", "#0072E3", "#071D33"),
  t("Saints", "New Orleans · old gold and black", "#D3BC8D", "#4D749A", "#101820"),
  t("Giants", "New York · blue, red, grey", "#ED8696", "#436EEB", "#0A1A47", "#7594F0"),
  t("Jets", "New York · green and white", "#27BC8B", "#A5BFB6", "#0C1112"),
  t("Eagles", "Philadelphia · midnight green and silver", "#00B6C9", "#9EBBBE", "#051F21"),
  t("Steelers", "Pittsburgh · gold and black", "#FFB612", "#4D749A", "#101820"),
  t("49ers", "San Francisco · red and gold", "#FF7C7C", "#B3995D", "#170B0D"),
  t("Seahawks", "Seattle · navy, action green, grey", "#69BE28", "#0072E3", "#071D33"),
  t("Buccaneers", "Tampa Bay · red, orange, pewter", "#D50A0A", "#FF7900", "#1A0C0E"),
  t("Titans", "Tennessee · navy, titans blue, red", "#71A9E3", "#EA1336", "#0A1E37", "#F36B82"),
  t("Commanders", "Washington · burgundy and gold", "#FFB612", "#D43F3F", "#390D0D", "#E17676"),
];
/** Teams in other leagues (MLS, CFL, WNBA, PWHL, NWSL, CPL, NLL, AHL, OHL), for the city tabs. */
const OTHER: Template[] = [
  t("Toronto FC", "Toronto · MLS · red and grey", "#F4839D", "#5C7180", "#180C11"),
  t("Argonauts", "Toronto · CFL · oxford and cambridge blue", "#6CACE4", "#0070F5", "#081D36", "#3F97FF"),
  t("Sceptres", "Toronto · PWHL · blue and gold", "#73A8EB", "#C5A05A", "#091C42"),
  t("Tempo", "Toronto · WNBA · blue and red", "#6CB4EE", "#D9353F", "#0A1D37", "#E5737A"),
  t("Rock", "Toronto · NLL · black and orange", "#F58948", "#FAC9AB", "#1C130F"),
  t("Marlies", "Toronto · AHL · blue and white", "#00205B", "#66799D", "#F3F3F3"),
  t("Redblacks", "Ottawa · CFL · red and black", "#C8102E", "#EAA4B0", "#190C10"),
  t("Charge", "Ottawa · PWHL · red, black, gold", "#ED8998", "#C7A35A", "#170D10"),
  t("Atlético Ottawa", "Ottawa · CPL · red and navy", "#E4002B", "#2E73DC", "#091C38"),
  t("67's", "Ottawa · OHL · red and black", "#D11F2F", "#EEAAB0", "#1A0D10"),
  t("Black Bears", "Ottawa · NLL · black and gold", "#F2A900", "#FADE9E", "#1C170D"),
  t("Fire", "Chicago · MLS · red, navy, sky", "#EA8897", "#7CCDEF", "#0B174A", "#7A92ED"),
  t("Sky", "Chicago · WNBA · sky blue and yellow", "#6CA9E6", "#FFCD00", "#0A1E37"),
  t("Stars FC", "Chicago · NWSL · sky blue and red", "#51AEDF", "#E71A3A", "#0A1E37", "#F06D81"),
  t("Wolves", "Chicago · AHL · silver, black, red", "#C8102E", "#EAA4B0", "#190C10"),
];
/** Every team from a city, across all leagues. */
const city = (name: string): TemplateGroup =>
  ({ label: name, templates: [...NHL, ...NBA, ...MLB, ...NFL, ...OTHER].filter((x) => x.vibe.startsWith(`${name} ·`)) });

const SETS: TemplateSet[] = [
  { label: "Everyday", groups: [
    { label: "Dark", templates: [
      t("Volt", "Lime, hot pink, sky", "#A8FF3E", "#FF3D6E", "#141416", "#2EC5FF"),
      t("Neon night", "Cyan, magenta, lemon", "#2EF2FF", "#FF2ED1", "#0A0A12", "#FFE53D"),
      t("Acid", "Yellow, orange, violet", "#F5FF2E", "#FF5A1F", "#0D0D0B", "#B98CFF"),
      t("Sunset strip", "Orange, pink, teal", "#FF8A3D", "#FF3D7F", "#1A0F1F", "#3DDCC8"),
      t("Deep sea", "Teal, coral, periwinkle", "#3DFFC5", "#FF7A59", "#071A1F", "#9BB0FF"),
      t("Ultraviolet", "Purple, pink, mint", "#B48CFF", "#FF5FA2", "#120F1C", "#5CF2B8"),
      t("Ember", "Gold, fire, ice", "#FFB23D", "#FF3D3D", "#17110D", "#7FD4FF"),
      t("Blackout", "White, red, blue", "#F2F2F2", "#FF3D3D", "#000000", "#4D94FF"),
      t("Two-tone", "Periwinkle; the rest inferred", "#9DB2FF", null, "#101418"),
    ] },
    { label: "Mid", templates: [
      t("Slate", "Frost, sand, heather", "#88C0D0", "#EBCB8B", "#2E3440", "#D3AECB"),
      t("Denim", "Yellow, coral, aqua", "#FFD23F", "#EE6C4D", "#23395B", "#8EE6DC"),
      t("Forest", "Gold, clay, sky", "#E9C46A", "#F4A261", "#1F3A2E", "#AEDBF5"),
      t("Burgundy", "Rosé, butter, mint", "#F7B2BD", "#FFD166", "#4A1C2B", "#A6EBCF"),
      t("Dusk", "Peach, mint, butter", "#FFB4A2", "#9DE0AD", "#3D3B6B", "#FFE38A"),
      t("Concrete", "Lemon, pink, sky", "#FFE066", "#FF8FA3", "#45484D", "#9AD8FF"),
      t("Fog", "Navy, red, pine", "#1E3A8A", "#B91C1C", "#C8CDD4", "#14532D"),
      t("Sage", "Pine, wine, navy", "#1F3D2B", "#8B1E3F", "#B7C9B0", "#1E2F6B"),
      t("Clay", "Plum, teal, rust", "#3B1F5C", "#0F4C5C", "#D9B8A0", "#6B260B"),
    ] },
    { label: "Light", templates: [
      t("Daylight", "Green, pink, violet", "#1F7A4D", "#D6336C", "#F6F4EF", "#5B3FD1"),
      t("Gig poster", "Red, blue, green", "#D7261E", "#1E4FD7", "#F3EAD6", "#0F6B4F"),
      t("Newsprint", "Black, red, blue", "#111111", "#E11D48", "#FFFFFF", "#1D4ED8"),
      t("Mint", "Teal, rust, purple", "#0F766E", "#C2410C", "#E6F4EE", "#6D28D9"),
      t("Blush", "Raspberry, violet, teal", "#BE185D", "#6D28D9", "#FCE8EE", "#0B5E57"),
      t("Sky", "Cobalt, pink, green", "#1D4ED8", "#DB2777", "#E8F0FB", "#116632"),
      t("Lemonade", "Violet, red, teal", "#7C3AED", "#DC2626", "#FFF7CC", "#0B5C73"),
      t("Peach", "Rust, teal, plum", "#C2410C", "#0E7490", "#FFE8D6", "#86198F"),
    ] },
  ] },
  { label: "Holidays", groups: [
    { label: "Through the year", templates: [
      t("Lunar new year", "Gold and jade on red", "#FFD24A", "#FF9A7A", "#5A0A0A", "#5FE0B4"),
      t("Valentine's", "Red, pink and purple", "#C9184A", "#D63384", "#FFF0F3", "#6A23B0"),
      t("St Patrick's", "Shamrock, gold and sky", "#4ADE80", "#FFD54A", "#0B2016", "#8CC4FF"),
      t("Easter", "Violet, pink and green", "#6D28D9", "#BE185D", "#F4EEFF", "#0F6630"),
      t("Pride", "Yellow, red and blue", "#FFD93D", "#FF4D6D", "#121212", "#4DA3FF"),
      t("Halloween", "Pumpkin, purple and slime", "#FF7A1A", "#B266FF", "#120D17", "#8CFF4F"),
      t("Diwali", "Marigold, magenta and teal", "#FFB020", "#FF3DA5", "#1A0B2E", "#2DD4BF"),
      t("Harvest", "Pumpkin, mustard and sage", "#FF9A3C", "#E8C04A", "#1E140C", "#A7CC94"),
      t("Hanukkah", "Blue, silver and gold", "#5AA9FF", "#B9D3F5", "#0A1838", "#FFC94D"),
      t("Christmas", "Red, gold and green", "#DC1F2A", "#FFC94D", "#0B1A12", "#3FBF6F"),
      t("Christmas morning", "Red and green on snow", "#C8102E", "#146B3A", "#FFF9F5", "#6F5000"),
      t("New year's eve", "Champagne, fuchsia and ice", "#F2C14E", "#FF3DA5", "#0A0A0F", "#5BC0FF"),
    ] },
  ] },
  { label: "Countries", groups: [
    { label: "Americas", templates: [
      t("Canada", "Red, white and pine", "#D52B1E", "#8E1B14", "#FFFFFF", "#1F5E3A"),
      t("USA", "Red, white and blue", "#E0283F", "#7DB4FF", "#0B1B3D", "#F2F2F2"),
      t("Mexico", "Green, white and red", "#006847", "#CE1126", "#FFFFFF", "#7A4A12"),
      t("Brazil", "Green, yellow and blue", "#FFDF00", "#9DBBFF", "#004D26", "#FFFFFF"),
      t("Jamaica", "Black, gold and green", "#FED100", "#2BB24C", "#0A0A0A", "#FF7A45"),
      t("Argentina", "Sky blue, white, sun gold", "#74ACDF", "#F6B40E", "#13171D"),
    ] },
    { label: "Europe", templates: [
      t("Italy", "Green, white and red", "#007A3D", "#CD212A", "#FAFAF5", "#1F4E8C"),
      t("Germany", "Black, red and gold", "#FFCE00", "#FF4B3E", "#0E0E0E", "#F2F2F2"),
      t("Ireland", "Green, white and orange", "#3DDC84", "#FF9F43", "#0C2418", "#F5F5F0"),
      t("Sweden", "Yellow and amber on blue", "#FECC02", "#FF9F1C", "#004B87", "#A8DCFF"),
      t("United Kingdom", "Blue, red, white", "#F58194", "#2B6BFD", "#091B42", "#6796FE"),
      t("France", "Blue, white, red", "#F5828C", "#3B69FF", "#0A1948", "#6C8FFF"),
      t("Spain", "Red and gold", "#F0868B", "#F1BF00", "#170D0F"),
      t("Portugal", "Green, red, gold", "#00C200", "#FF0000", "#0B120D", "#FF4949"),
      t("Netherlands", "Red, white, blue, orange", "#FF7F00", "#DE303E", "#0D1C39", "#E86F79"),
      t("Greece", "Blue and white", "#0D5EAF", "#072F58", "#F4F6F6"),
      t("Norway", "Red, white, blue", "#F78299", "#1A6AFF", "#091B3E", "#5792FF"),
      t("Ukraine", "Blue and yellow", "#5BA9FF", "#FFD700", "#0B111A"),
    ] },
    { label: "Asia and Pacific", templates: [
      t("India", "Saffron, white and green", "#FF9933", "#46C35A", "#0A0F3D", "#F2F2F2"),
      t("Japan", "Red and white", "#BC002D", "#5E0017", "#FAF2F2"),
      t("South Korea", "Red, blue, black", "#CD2E3A", "#0068E9", "#1A0E11"),
      t("Australia", "Green, gold, blue", "#00843D", "#FFCD00", "#0E0E5F", "#8D8DFF"),
      t("New Zealand", "Black, silver fern, red", "#F38694", "#2F6BFF", "#0A1B45", "#6792FF"),
    ] },
    { label: "Africa", templates: [
      t("South Africa", "Green, gold, red and blue", "#1FC77A", "#FFB612", "#0B0B0B", "#6E9BFF"),
      t("Nigeria", "Green and white", "#00824E", "#004429", "#F3F7F3"),
      t("Kenya", "Red, green, black", "#FF7E7E", "#007E00", "#180B0D"),
      t("Ghana", "Red, gold, green", "#CE1126", "#FCD116", "#1A0C10", "#00A25F"),
      t("Morocco", "Red and green", "#C1272D", "#008143", "#190E10"),
    ] },
  ] },
  { label: "Provinces", groups: [
    { label: "Provinces and territories", templates: [
      t("British Columbia", "Blue, gold, red", "#FFC72C", "#EA1336", "#0E1A3F", "#F3667D"),
      t("Alberta", "Blue, gold, red", "#F2C200", "#EA1336", "#0A1948", "#F3667D"),
      t("Saskatchewan", "Green, gold, red", "#00BC8A", "#FDB813", "#0B1312", "#E8655B"),
      t("Manitoba", "Red, blue, buffalo brown", "#F38491", "#B35C32", "#091B42", "#6796FE"),
      t("Ontario", "Red, blue, gold", "#D52B1E", "#F2C200", "#091B42", "#6796FE"),
      t("Québec", "Blue and white", "#003DA5", "#001F53", "#F3F4F6"),
      t("New Brunswick", "Gold, red, blue", "#FFD100", "#EA1336", "#091B40", "#F3667D"),
      t("Nova Scotia", "Blue, white, gold", "#F2C200", "#EA1336", "#091C41", "#F36B82"),
      t("Prince Edward Island", "Red, gold, green", "#D52B1E", "#F2C200", "#1A0E0F", "#3BA140"),
      t("Newfoundland and Labrador", "Blue, red, gold", "#F58194", "#FFC72C", "#091B3C", "#5795FF"),
      t("Yukon", "Green, blue, fireweed", "#00843D", "#006DCC", "#0B1411", "#EB54A4"),
      t("Northwest Territories", "Blue and white", "#0067B9", "#C8102E", "#F3F6F7"),
      t("Nunavut", "Gold, red, blue", "#F2BF00", "#E03C31", "#1C190D", "#E86E66"),
    ] },
  ] },
  { label: "Sports", tabs: true, groups: [
    { label: "NHL", templates: NHL },
    { label: "NBA", templates: NBA },
    { label: "MLB", templates: MLB },
    { label: "NFL", templates: NFL },
    city("Toronto"),
    city("Ottawa"),
    city("Chicago"),
  ] },
];

const same = (a: Theme, b: Theme) => {
  const [x, y] = [fullTheme(a), fullTheme(b)];
  return THEME_KEYS.every((k) => x[k].toUpperCase() === y[k].toUpperCase());
};
const isTemplate = (theme: Theme) => SETS.some((s) => s.groups.some((g) => g.templates.some((x) => same(x.theme, theme))));

/** The categories the Brand page shows; the app's default leads Everyday when it isn't a template. */
export const TEMPLATE_SETS: TemplateSet[] = isTemplate(BRAND.defaultTheme)
  ? SETS
  : SETS.map((s, i) => i > 0 ? s : { ...s, groups: [{ label: "Yours", templates: [{ name: BRAND.name, vibe: "Default", theme: BRAND.defaultTheme }] }, ...s.groups] });

/** Every group in one list (for apps whose Brand page predates categories, and the contrast report). City groups repeat league teams. */
export const TEMPLATE_GROUPS: TemplateGroup[] = TEMPLATE_SETS.flatMap((s) => s.groups);

/** True when two themes have the same colours (a missing support counts as its derived one). */
export const sameTheme = same;


/** Every template once (city tabs repeat league teams), for search and checks. */
export const ALL_TEMPLATES: Template[] = [...new Map(TEMPLATE_GROUPS.flatMap((g) => g.templates).map((x) => [`${x.name}|${x.vibe}`, x])).values()];
