import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async name => JSON.parse(await readFile(new URL(`../content/infosec_english_content_pack/${name}`, import.meta.url), "utf8"));
const words = [
  ...await source("vocabulary.json"),
  ...(await source("advanced_waf_ndr.json")).vocabulary,
  ...(await source("content_expansion_202609.json")).vocabulary,
];
const translations = await source("vocabulary_example_translations.json");
const ids = new Set(words.map(word => word.id));
assert.equal(ids.size, words.length, "Vocabulary IDs must be unique");
assert.deepEqual(Object.keys(translations).sort(), [...ids].sort(), "Every vocabulary example must have exactly one translation");
for (const word of words) {
  const translation = translations[word.id];
  assert.equal(translation.example_en, word.example_en, `${word.id}: English changed; review the Japanese translation`);
  assert.ok(typeof translation.example_ja === "string" && translation.example_ja.trim().length > 5, `${word.id}: missing Japanese translation`);
  assert.match(translation.example_ja, /[\u3040-\u30ff\u3400-\u9fff]/u, `${word.id}: translation must include Japanese`);
  assert.ok(!translation.example_ja.includes("TODO"), `${word.id}: unfinished translation`);
}
console.log(`Validated ${words.length} Japanese example translations, matching every source sentence.`);
