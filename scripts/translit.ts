/**
 * Ukrainian → Latin, following the official Ukrainian national
 * transliteration (Cabinet of Ministers resolution 55, 2010). Used for place
 * names that have no name:en tag in OpenStreetMap.
 */
const BASE: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "h", ґ: "g", д: "d", е: "e", ж: "zh", з: "z", и: "y", і: "i",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
  х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ь: "", "'": "", "’": "", ʼ: "",
  // Russian-only letters, in case a name is tagged in Russian.
  ы: "y", э: "e", ё: "io", ъ: "",
};
/** Letters spelled differently at the start of a word. */
const INITIAL: Record<string, [string, string]> = {
  є: ["ye", "ie"], ї: ["yi", "i"], й: ["y", "i"], ю: ["yu", "iu"], я: ["ya", "ia"],
};

export function transliterate(text: string): string {
  let out = "";
  const chars = [...text];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!;
    const lower = ch.toLowerCase();
    const upper = ch !== lower;
    const prev = i > 0 ? chars[i - 1]!.toLowerCase() : "";
    const atStart = i === 0 || !/[\p{L}'’ʼ]/u.test(prev);
    let latin: string;
    if (lower === "г" && prev === "з") latin = "gh"; // зг → zgh
    else if (INITIAL[lower]) latin = INITIAL[lower]![atStart ? 0 : 1];
    else if (BASE[lower] !== undefined) latin = BASE[lower]!;
    else latin = ch;
    out += upper && latin ? latin[0]!.toUpperCase() + latin.slice(1) : latin;
  }
  return out;
}
