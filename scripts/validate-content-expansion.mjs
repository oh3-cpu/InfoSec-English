import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async name => JSON.parse(await readFile(new URL(`../content/infosec_english_content_pack/${name}`, import.meta.url), "utf8"));
const expansion = await source("content_expansion_202609.json");
const advanced = await source("advanced_waf_ndr.json");
const baseline = {
  vocabulary: [...await source("vocabulary.json"), ...advanced.vocabulary],
  phrases: [...await source("meeting_phrases.json"), ...advanced.phrases],
  listening: [...await source("listening_items.json"), ...advanced.listening],
  scenarios: [...await source("roleplay_scenarios.json"), ...advanced.scenarios],
  meetings: await source("meeting_listening.json"),
  commutingCourses: await source("commuting_listening_courses.json"),
  commutingNarrations: await source("commuting_narrations.json"),
};
const levels = new Set(["beginner", "lower_intermediate", "intermediate", "advanced"]);
const text = value => assert.ok(typeof value === "string" && value.trim(), "Expected nonempty text");
const normalize = value => value.toLowerCase().trim().replace(/\s+/g, " ");
const fields = {
  vocabulary: ["category_ja", "term_en", "meaning_ja", "example_en"],
  phrases: ["function", "sentence_en", "meaning_ja"],
  listening: ["category", "sentence_en", "correct_ja", "chatgpt_prompt"],
  scenarios: ["title_ja", "context_en", "role_ai", "role_user", "chatgpt_prompt"],
  meetings: ["title_ja", "context_ja"],
  commutingCourses: ["title_ja", "description_ja"],
  commutingNarrations: ["title_ja", "narration_en", "summary_ja", "course_id"],
};
function choices(item) {
  assert.equal(item.choices_ja.length, 3, `${item.id}: three choices required`);
  item.choices_ja.forEach(text);
  assert.equal(new Set(item.choices_ja).size, 3, `${item.id}: duplicate choices`);
  assert.equal(item.choices_ja.filter(c => c === item.correct_ja).length, 1, `${item.id}: correct answer missing or repeated`);
}

const counts = {};
const allIds = new Set();
function register(item) {
  text(item.id);
  assert.ok(!allIds.has(item.id), `Duplicate ID: ${item.id}`);
  allIds.add(item.id);
}
for (const kind of Object.keys(baseline)) {
  const old = baseline[kind], added = expansion[kind];
  assert.equal(added.length, old.length, `${kind} must double`);
  counts[kind] = { before: old.length, after: old.length + added.length };
  [...old, ...added].forEach(register);
  for (const item of added) {
    for (const field of fields[kind]) text(item[field]);
    if (!["commutingNarrations", "commutingCourses"].includes(kind)) assert.ok(levels.has(item.level), `${item.id}: invalid level`);
  }
  const key = ({ vocabulary: "term_en", phrases: "sentence_en", listening: "sentence_en", scenarios: "context_en", commutingNarrations: "narration_en" })[kind];
  if (key) {
    const seen = new Set(old.map(item => normalize(item[key])));
    for (const item of added) {
      assert.ok(!seen.has(normalize(item[key])), `${kind}: repeated content: ${item[key]}`);
      seen.add(normalize(item[key]));
    }
  }
}

const courses = [...baseline.commutingCourses, ...expansion.commutingCourses];
const narrations = [...baseline.commutingNarrations, ...expansion.commutingNarrations];
for (const course of courses) {
  assert.equal(narrations.filter(n => n.course_id === course.id).length, 1, `${course.id}: expected one narration`);
  for (const item of course.items) { register(item); assert.equal(item.course_id, course.id); }
}
for (const course of expansion.commutingCourses) {
  assert.ok(levels.has(course.recommended_level));
  assert.ok(course.duration_min > 0);
  assert.equal(course.items.length, 8);
  for (const item of course.items) {
    assert.ok(levels.has(item.level));
    for (const field of fields.listening) text(item[field]);
  }
}
const oldListening = [...baseline.listening, ...baseline.commutingCourses.flatMap(c => c.items)];
const newListening = [...expansion.listening, ...expansion.commutingCourses.flatMap(c => c.items)];
assert.equal(newListening.length, oldListening.length);
const sentences = new Set(oldListening.map(item => normalize(item.sentence_en)));
for (const item of newListening) {
  choices(item);
  assert.ok(!sentences.has(normalize(item.sentence_en)), `Repeated listening: ${item.id}`);
  sentences.add(normalize(item.sentence_en));
}
counts.listening = { before: oldListening.length, after: oldListening.length + newListening.length };

for (const meeting of expansion.meetings) {
  assert.ok(meeting.dialogue.length >= 8);
  meeting.dialogue.forEach(line => { text(line.speaker); text(line.sentence_en); });
  assert.deepEqual(meeting.questions.map(q => q.question_type), ["status", "decision", "owner_deadline"]);
  meeting.questions.forEach(q => { text(q.question_ja); choices(q); });
}
for (const scenario of expansion.scenarios) {
  assert.ok(scenario.turns.length >= 3);
  scenario.turns.forEach(turn => { text(turn.speaker); text(turn.goal); });
}
for (const narration of expansion.commutingNarrations) {
  assert.ok(courses.some(c => c.id === narration.course_id));
  assert.ok(narration.narration_en.split(/\s+/).length >= 300, `${narration.id}: narration too short`);
  assert.ok(narration.duration_min > 0);
  assert.ok(narration.key_points_ja.length >= 3);
  narration.key_points_ja.forEach(text);
}
const words = items => items.reduce((n, item) => n + item.narration_en.split(/\s+/).length, 0);
assert.ok(words(expansion.commutingNarrations) >= words(baseline.commutingNarrations), "New long-form content must at least match the original word count");
console.log(JSON.stringify({ counts, newNarrationWords: words(expansion.commutingNarrations), result: "passed" }, null, 2));
