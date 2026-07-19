// Country name -> ISO code for flag images (emoji flags don't render on Windows, so we use
// <img> flags from flagcdn keyed by these codes). England/Scotland/Wales use GB subdivisions.
const CODES: Record<string, string> = {
  argentina: "ar", brazil: "br", france: "fr", spain: "es", england: "gb-eng", germany: "de",
  portugal: "pt", netherlands: "nl", belgium: "be", croatia: "hr", italy: "it", uruguay: "uy",
  japan: "jp", "south korea": "kr", "korea republic": "kr", mexico: "mx", morocco: "ma",
  switzerland: "ch", norway: "no", denmark: "dk", poland: "pl", senegal: "sn",
  "united states": "us", usa: "us", usmnt: "us", canada: "ca", australia: "au", ecuador: "ec",
  "cape verde": "cv", austria: "at", jordan: "jo", algeria: "dz", "south africa": "za",
  "new zealand": "nz", india: "in", liechtenstein: "li", gibraltar: "gi",
  scotland: "gb-sct", wales: "gb-wls", colombia: "co", nigeria: "ng", ghana: "gh",
  "ivory coast": "ci", "cote d'ivoire": "ci", cameroon: "cm", tunisia: "tn", egypt: "eg",
  "saudi arabia": "sa", qatar: "qa", iran: "ir", iraq: "iq", serbia: "rs", sweden: "se",
  turkey: "tr", "türkiye": "tr", ukraine: "ua", greece: "gr", peru: "pe", chile: "cl",
  paraguay: "py", venezuela: "ve", bolivia: "bo", panama: "pa", "costa rica": "cr",
  honduras: "hn", jamaica: "jm", "czech republic": "cz", czechia: "cz", hungary: "hu",
  romania: "ro", "republic of ireland": "ie", ireland: "ie", "northern ireland": "gb-nir",
  russia: "ru", slovenia: "si", slovakia: "sk", finland: "fi", iceland: "is",
  "north macedonia": "mk", albania: "al", georgia: "ge", israel: "il",
  "united arab emirates": "ae", uae: "ae", oman: "om", china: "cn", "china pr": "cn",
  uzbekistan: "uz", "burkina faso": "bf", mali: "ml", "dr congo": "cd",
  "democratic republic of congo": "cd", angola: "ao", zambia: "zm", kenya: "ke",
  bulgaria: "bg", "bosnia and herzegovina": "ba", montenegro: "me", luxembourg: "lu",
  malta: "mt", "faroe islands": "fo", andorra: "ad", "san marino": "sm", kosovo: "xk",
};

export function countryCode(team?: string): string | null {
  if (!team) return null;
  return CODES[team.trim().toLowerCase()] ?? null;
}
