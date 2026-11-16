import { describe, expect, it } from "vitest";
import { transliterate } from "../scripts/translit";

describe("Ukrainian transliteration (2010 national system)", () => {
  it.each([
    ["Покровськ", "Pokrovsk"],
    ["Мирноград", "Myrnohrad"],
    ["Козацьке", "Kozatske"],
    ["Відродження", "Vidrodzhennia"],
    ["Бажане", "Bazhane"],
    ["Чумацьке", "Chumatske"],
    ["Східне", "Skhidne"],
    ["Ясногородка", "Yasnohorodka"],
    ["Згурівка", "Zghurivka"],
    ["Їжакевич", "Yizhakevych"],
    ["Юрківка", "Yurkivka"],
  ])("%s → %s", (uk, en) => {
    expect(transliterate(uk)).toBe(en);
  });
});
