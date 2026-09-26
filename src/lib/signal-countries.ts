/**
 * Curated country → keyword map for the Signal Map.
 *
 * Each entry carries the world-atlas numeric id, a map centroid (computed
 * from the baked dot grid), and lowercase keywords matched against
 * raw_news_data.relevant_keywords / titles. Keep this list tight: every
 * country here must earn its place on the map.
 */
export interface SignalCountry {
  /** world-atlas numeric id, as stored in world-dots.json */
  id: string;
  alpha2: string;
  name: string;
  /** normalized centroid in 0..1 map space, for labels */
  cx: number;
  cy: number;
  keywords: string[];
}

export const SIGNAL_COUNTRIES: SignalCountry[] = [
  {
    id: "404",
    alpha2: "KE",
    name: "Kenya",
    cx: 0.605,
    cy: 0.495,
    keywords: ["kenya", "nairobi", "ruto", "m-pesa", "mpesa", "epra"],
  },
  {
    id: "800",
    alpha2: "UG",
    name: "Uganda",
    cx: 0.589,
    cy: 0.496,
    keywords: ["uganda", "kampala", "museveni"],
  },
  {
    id: "834",
    alpha2: "TZ",
    name: "Tanzania",
    cx: 0.596,
    cy: 0.534,
    keywords: ["tanzania", "dar es salaam", "samia"],
  },
  {
    id: "646",
    alpha2: "RW",
    name: "Rwanda",
    cx: 0.583,
    cy: 0.515,
    keywords: ["rwanda", "kigali", "kagame"],
  },
  {
    id: "231",
    alpha2: "ET",
    name: "Ethiopia",
    cx: 0.609,
    cy: 0.453,
    keywords: ["ethiopia", "addis"],
  },
  {
    id: "706",
    alpha2: "SO",
    name: "Somalia",
    cx: 0.627,
    cy: 0.474,
    keywords: ["somalia", "mogadishu"],
  },
  { id: "729", alpha2: "SD", name: "Sudan", cx: 0.583, cy: 0.411, keywords: ["sudan", "khartoum"] },
  {
    id: "180",
    alpha2: "CD",
    name: "DR Congo",
    cx: 0.566,
    cy: 0.515,
    keywords: ["congo", "kinshasa"],
  },
  {
    id: "566",
    alpha2: "NG",
    name: "Nigeria",
    cx: 0.521,
    cy: 0.448,
    keywords: ["nigeria", "lagos", "abuja", "tinubu"],
  },
  { id: "288", alpha2: "GH", name: "Ghana", cx: 0.495, cy: 0.455, keywords: ["ghana", "accra"] },
  {
    id: "710",
    alpha2: "ZA",
    name: "South Africa",
    cx: 0.569,
    cy: 0.66,
    keywords: ["south africa", "johannesburg", "ramaphosa"],
  },
  { id: "818", alpha2: "EG", name: "Egypt", cx: 0.583, cy: 0.355, keywords: ["egypt", "cairo"] },
  {
    id: "840",
    alpha2: "US",
    name: "United States",
    cx: 0.186,
    cy: 0.245,
    keywords: ["united states", "america", "washington", "trump", "white house"],
  },
  {
    id: "826",
    alpha2: "GB",
    name: "United Kingdom",
    cx: 0.492,
    cy: 0.199,
    keywords: ["britain", "united kingdom", "london"],
  },
  {
    id: "804",
    alpha2: "UA",
    name: "Ukraine",
    cx: 0.586,
    cy: 0.225,
    keywords: ["ukraine", "kyiv", "kiev", "zelensky"],
  },
  {
    id: "643",
    alpha2: "RU",
    name: "Russia",
    cx: 0.669,
    cy: 0.152,
    keywords: ["russia", "moscow", "putin", "kremlin"],
  },
  {
    id: "156",
    alpha2: "CN",
    name: "China",
    cx: 0.79,
    cy: 0.297,
    keywords: ["china", "beijing", "xi jinping"],
  },
  {
    id: "356",
    alpha2: "IN",
    name: "India",
    cx: 0.721,
    cy: 0.372,
    keywords: ["india", "delhi", "modi"],
  },
  { id: "392", alpha2: "JP", name: "Japan", cx: 0.883, cy: 0.292, keywords: ["japan", "tokyo"] },
  {
    id: "376",
    alpha2: "IL",
    name: "Israel",
    cx: 0.652,
    cy: 0.365,
    keywords: ["israel", "tel aviv", "netanyahu", "gaza"],
  },
  { id: "364", alpha2: "IR", name: "Iran", cx: 0.652, cy: 0.319, keywords: ["iran", "tehran"] },
  {
    id: "682",
    alpha2: "SA",
    name: "Saudi Arabia",
    cx: 0.624,
    cy: 0.365,
    keywords: ["saudi", "riyadh"],
  },
  {
    id: "784",
    alpha2: "AE",
    name: "UAE",
    cx: 0.652,
    cy: 0.365,
    keywords: ["uae", "dubai", "emirates"],
  },
  { id: "076", alpha2: "BR", name: "Brazil", cx: 0.35, cy: 0.62, keywords: ["brazil", "brasilia"] },
];

export const SIGNAL_COUNTRY_BY_ID: Record<string, SignalCountry> = Object.fromEntries(
  SIGNAL_COUNTRIES.map((c) => [c.id, c]),
);
