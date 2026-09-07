import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import path from "node:path";
import { stripTypeScriptTypes } from "node:module";

const speechSource = await readFile(new URL("../src/speechPlayback.ts", import.meta.url), "utf8");
function speechFixture() {
  const spoken = [], timers = new Set();
  const exports = {};
  vm.runInNewContext(stripTypeScriptTypes(speechSource).replace("export function createSpeechPlayback", "exports.createSpeechPlayback = function createSpeechPlayback"), {
    exports, SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
    performance: { now: () => 0 },
    setInterval: fn => { timers.add(fn); return fn; }, clearInterval: fn => timers.delete(fn),
  });
  const engine = { speak: u => { spoken.push(u); u.onstart?.(); }, cancel() {}, pause() {}, resume() {} };
  return { create: exports.createSpeechPlayback, engine, spoken, timers };
}

test("Changing browser rate replays only the current sentence, then continues once", () => {
  const f = speechFixture(); let completed = 0;
  const player = f.create([{ text: "First sentence. Second sentence." }], 1, { status() {}, ended: () => completed++ }, f.engine);
  f.spoken[0].onend();
  const oldEnd = f.spoken[1].onend;
  player.setRate(0.7);
  assert.equal(f.spoken[2].text, "Second sentence.");
  assert.equal(f.spoken[2].rate, 0.7);
  oldEnd(); // An already queued old callback must not advance the queue.
  assert.equal(completed, 0);
  f.spoken[2].onend();
  assert.equal(completed, 1);
  assert.equal(f.timers.size, 0);
});

test("Paused rate changes stay paused and preserve meeting speaker voices", () => {
  const f = speechFixture();
  const voiceA = { lang: "en-US" }, voiceB = { lang: "en-AU" };
  const player = f.create([{ text: "Status report.", voice: voiceA }, { text: "Next action.", voice: voiceB }], 1, { status() {} }, f.engine);
  player.pause(); player.setRate(0.85);
  assert.equal(f.spoken.length, 1);
  player.resume();
  assert.equal(f.spoken[1].rate, 0.85);
  assert.equal(f.spoken[1].voice, voiceA);
  f.spoken[1].onend();
  assert.equal(f.spoken[2].rate, 0.85);
  assert.equal(f.spoken[2].voice, voiceB);
  const staleEnd = f.spoken[2].onend;
  player.stop(); staleEnd();
  assert.equal(f.spoken.length, 3);
  assert.equal(f.timers.size, 0);
});

const workerSource = await readFile(new URL("../public/service-worker.js", import.meta.url), "utf8");
async function inventoryRequest(networkResponse, cached) {
  const listeners = {}; let saved;
  const request = new Request("https://example.test/InfoSec-English/audio/manifest.json");
  vm.runInNewContext(workerSource, {
    URL, Response,
    self: { location: { pathname: "/InfoSec-English/service-worker.js", origin: "https://example.test" }, addEventListener: (name, fn) => listeners[name] = fn },
    caches: { match: async () => cached, open: async () => ({ put: async (_request, response) => { saved = response; } }) },
    fetch: async (_request, options) => { assert.equal(options.cache, "no-store"); if (networkResponse instanceof Error) throw networkResponse; return networkResponse; },
  });
  let result;
  listeners.fetch({ request, respondWith: promise => { result = promise; } });
  return { response: await result, saved };
}
test("Online inventory bypasses the stale cache and retains the new MP3 mapping", async () => {
  const old = Response.json({ version: 1, items: {} });
  const latest = { version: 1, items: { "vocabulary:expanded_vocab_0001": "./audio/new.mp3" } };
  const result = await inventoryRequest(Response.json(latest), old);
  assert.deepEqual(await result.response.json(), latest);
  assert.deepEqual(await result.saved.json(), latest);
});
test("Offline inventory uses last valid cache; missing cache never returns app HTML", async () => {
  const old = { version: 1, items: { existing: "./audio/old.mp3" } };
  const offline = await inventoryRequest(new Error("offline"), Response.json(old));
  assert.deepEqual(await offline.response.json(), old);
  const missing = await inventoryRequest(new Response("not found", { status: 404 }));
  assert.equal(missing.response.status, 503);
});

const generatorSource = (await readFile(new URL("./generate-tts.mjs", import.meta.url), "utf8"))
  .replace(/^import .*;\n/gm, "");
async function generate(fetcher, configured = true) {
  const files = new Map(), delays = [];
  const sources = {
    "advanced_waf_ndr.json": { vocabulary: [], phrases: [], listening: [] },
    "content_expansion_202609.json": { vocabulary: [], phrases: [], listening: [], commutingCourses: [], commutingNarrations: [], meetings: [] },
    "vocabulary.json": [{ id: "test", term_en: "asset", example_en: "Protect the asset." }],
  };
  const promise = vm.runInNewContext(`(async () => { ${generatorSource} })()`, {
    path, Buffer, AbortSignal, Date, console: { log() {}, warn() {} },
    process: { cwd: () => "/fixture", argv: ["node", "script", "--require-complete"], env: configured ? { AZURE_SPEECH_KEY: "dummy", AZURE_SPEECH_REGION: "test" } : {} },
    readFile: async file => JSON.stringify(sources[path.basename(file)] ?? []),
    mkdir: async () => {}, stat: async () => { throw new Error("not found"); },
    writeFile: async (file, data) => files.set(file, data),
    fetch: fetcher, setTimeout: (fn, delay) => { delays.push(delay); fn(); },
  });
  await promise;
  return { files, delays };
}
test("429 generation retries and includes the recovered file", async () => {
  let attempts = 0;
  const result = await generate(async () => ++attempts === 1 ? new Response("busy", { status: 429, headers: { "retry-after": "3" } }) : new Response(new Uint8Array(200)));
  assert.equal(attempts, 2);
  assert.equal(result.delays[0], 3000);
  const manifest = JSON.parse(result.files.get("/fixture/public/audio/manifest.json"));
  assert.ok(manifest.items["vocabulary:test"]);
});
test("Persistent generation errors and missing credentials block deployment", async () => {
  let attempts = 0;
  await assert.rejects(generate(async () => { attempts++; return new Response("busy", { status: 503 }); }), /refusing to deploy/);
  assert.equal(attempts, 8);
  await assert.rejects(generate(async () => { throw new Error("must not call network"); }, false), /configuration missing/);
});
