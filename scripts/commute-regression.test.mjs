import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import { mp3Duration } from "./mp3-duration.mjs";

const ts = async name => stripTypeScriptTypes(await readFile(new URL(`../src/${name}.ts`, import.meta.url), "utf8"));
const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const modelUrl = moduleUrl(await ts("commuteModel"));
const model = await import(modelUrl);
const learning = await import(moduleUrl((await ts("learning")).replace('"./commuteModel"', JSON.stringify(modelUrl))));
const time = await import(moduleUrl(await ts("studyTime")));
const queue = [{ narrationId: "one", index: 0 }, { narrationId: "one", index: 1 }, { narrationId: "two", index: 0 }];
const session = { queue, position: 0, offset: 0, mode: "once", phase: 0, targetSeconds: 0, listenedSeconds: 0, completed: false };

test("Seeking crosses sentences in both directions and clamps to recording bounds", () => {
  assert.deepEqual(model.seekQueue(queue, 1, 3, -10, () => 8), { position: 0, offset: 1 });
  assert.deepEqual(model.seekQueue(queue, 0, 3, 10, () => 8), { position: 1, offset: 5 });
  assert.deepEqual(model.seekQueue(queue, 0, 1, -10, () => 8), { position: 0, offset: 0 });
  assert.equal(model.seekQueue(queue, 2, 7, 10, () => 8).position, 2);
});
test("Completion, looping, staged captions and time budget have distinct transitions", () => {
  assert.equal(model.nextSentence({ ...session, position: 2 }).completed, true);
  assert.equal(model.nextSentence({ ...session, position: 2, mode: "repeat" }).position, 0);
  assert.equal(model.nextSentence({ ...session, position: 2, mode: "staged", phase: 1 }).phase, 2);
  assert.equal(model.nextSentence({ ...session, position: 2, mode: "staged", phase: 3 }).completed, true);
  assert.equal(model.nextSentence({ ...session, mode: "timed", targetSeconds: 900, listenedSeconds: 900 }).completed, true);
  assert.equal(model.nextSentence({ ...session, mode: "bookmarks", targetSeconds: 300, listenedSeconds: 299 }).completed, false);
});
test("Playlists account for playback speed and repeat short theme pools", () => {
  const courses = [{ id: "a", narration_en: "First. Second." }];
  assert.equal(model.timedQueue(courses, 15, 1, () => 300).length, 6);
  assert.equal(model.timedQueue(courses, 15, .7, () => 300).length, 6);
  assert.equal(model.timedQueue(courses, 30, .7, () => 300).length, 10);
  assert.deepEqual(model.timedQueue([], 30, 1, () => 300), []);
});
test("Backups retain position, bookmarks and quiz results; old backups and malformed fields are safe", () => {
  const commute = { resume: { ...session, position: 1, offset: 2.25 }, bookmarks: [queue[0], queue[0]], captions: "full", quizResults: { one: { correct: 2, total: 3, completedAt: "2026-09-27T12:00:00Z" } } };
  const restored = learning.normalizeProgress(JSON.parse(JSON.stringify({ commute, minutes: 2.5 })));
  assert.equal(restored.commute.resume.offset, 2.25);
  assert.equal(restored.commute.bookmarks.length, 1);
  assert.equal(restored.commute.quizResults.one.correct, 2);
  assert.equal(learning.normalizeProgress({ minutes: 20 }).commute.resume, null);
  assert.deepEqual(model.normalizeCommute({ resume: { queue: [null] }, bookmarks: [null, {}, { index: -1 }] }).bookmarks, []);
});
test("Active minutes exclude idle/home/hidden reading; streaks exceed seven days", () => {
  assert.equal(time.activeStudySeconds(1, true, true, 10, false), 1);
  assert.equal(time.activeStudySeconds(1, true, true, 90, false), 0);
  assert.equal(time.activeStudySeconds(1, true, false, 0, false), 0);
  assert.equal(time.activeStudySeconds(1, false, true, 0, false), 0);
  assert.equal(time.activeStudySeconds(120, true, true, 0, false), 2);
  const dates = Array.from({ length: 12 }, (_, i) => ({ date: `2026-09-${String(15 + i).padStart(2, "0")}`, attempts: 1, minutes: 0 }));
  assert.equal(time.studyStreak(dates, new Date(2026, 8, 27)), 12); // Today not started yet.
  assert.equal(time.studyStreak(dates, new Date(2026, 8, 28)), 0);
});
test("MP3 durations come from MPEG-2 frames and reject incomplete audio", () => {
  const frame = Buffer.alloc(480); frame.set([0xff, 0xf3, 0xe4, 0xc0]);
  const mp3 = Buffer.concat(Array.from({ length: 100 }, () => frame));
  assert.equal(mp3Duration(mp3), 2.4);
  assert.throws(() => mp3Duration(Buffer.from("not audio")), /no audio/);
  assert.throws(() => mp3Duration(mp3.subarray(0, mp3.length - 1)), /Truncated/);
});

const workerSource = await readFile(new URL("../public/service-worker.js", import.meta.url), "utf8");
async function offlineRequest(range, present = true) {
  const handlers = {};
  vm.runInNewContext(workerSource, {
    URL, Response, self: { location: { pathname: "/InfoSec-English/service-worker.js", origin: "https://example.test" }, addEventListener: (name, fn) => handlers[name] = fn },
    caches: { open: async () => ({ match: async () => present ? new Response(Uint8Array.from({ length: 100 }, (_, i) => i)) : undefined }) },
    fetch: async () => { throw new Error("offline"); },
  });
  let response;
  handlers.fetch({ request: new Request("https://example.test/InfoSec-English/audio/commuting-segments/one.mp3", { headers: range ? { range } : {} }), respondWith: result => response = result });
  return response;
}
test("Offline Safari byte ranges support partial, suffix and invalid requests", async () => {
  const partial = await offlineRequest("bytes=10-19");
  assert.equal(partial.status, 206); assert.equal(partial.headers.get("content-range"), "bytes 10-19/100");
  assert.deepEqual([...new Uint8Array(await partial.arrayBuffer())], [10,11,12,13,14,15,16,17,18,19]);
  assert.equal((await offlineRequest("bytes=-5")).headers.get("content-length"), "5");
  assert.equal((await offlineRequest("bytes=100-")).status, 416);
  assert.equal((await offlineRequest("bytes=0-1,3-4")).status, 416);
  assert.equal((await offlineRequest(null)).status, 200);
  assert.equal((await offlineRequest(null, false)).status, 503);
});
test("All ten long narrations have full translations and three explained questions", async () => {
  const json = async name => JSON.parse(await readFile(new URL(`../content/infosec_english_content_pack/${name}.json`, import.meta.url), "utf8"));
  const narrations = [...await json("commuting_narrations"), ...(await json("content_expansion_202609")).commutingNarrations];
  const studies = await json("commute_study");
  assert.equal(narrations.length, 10);
  assert.deepEqual(Object.keys(studies).sort(), narrations.map(n => n.id).sort());
  for (const n of narrations) {
    const study = studies[n.id]; assert.ok(study.translation_ja.length > 600, n.id);
    assert.ok(study.theme); assert.equal(study.questions.length, 3);
    for (const question of study.questions) {
      assert.equal(new Set(question.choices_ja).size, 3); assert.ok(question.choices_ja.includes(question.correct_ja));
      assert.ok(question.question_ja && question.explanation_ja.length > 20);
    }
  }
});
