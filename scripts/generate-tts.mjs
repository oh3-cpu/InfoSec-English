import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const publicAudio = path.join(root, "public", "audio");
const manifestPath = path.join(publicAudio, "manifest.json");
const key = process.env.AZURE_SPEECH_KEY;
const region = process.env.AZURE_SPEECH_REGION;
const voices = {
  primary: process.env.AZURE_VOICE_PRIMARY || "en-US-AvaMultilingualNeural",
  secondary: process.env.AZURE_VOICE_SECONDARY || "en-US-GuyNeural",
  tertiary: process.env.AZURE_VOICE_TERTIARY || "en-AU-NatashaNeural",
};

const source = async name => JSON.parse(await readFile(path.join(root, "content", "infosec_english_content_pack", name), "utf8"));
const advanced = await source("advanced_waf_ndr.json");
const expansion = await source("content_expansion_202609.json");
const commutingCourses = [...(await source("commuting_listening_courses.json")), ...expansion.commutingCourses];
const commutingNarrations = [...(await source("commuting_narrations.json")), ...expansion.commutingNarrations];
const vocabulary = [...(await source("vocabulary.json")), ...advanced.vocabulary, ...expansion.vocabulary];
const phrases = [...(await source("meeting_phrases.json")), ...advanced.phrases, ...expansion.phrases];
const listening = [...(await source("listening_items.json")), ...advanced.listening, ...expansion.listening, ...commutingCourses.flatMap(course => course.items)];
const meetings = [...(await source("meeting_listening.json")), ...expansion.meetings];
const jobs = [];

for (const item of vocabulary) jobs.push({ key: `vocabulary:${item.id}`, text: `${item.term_en}. ${item.example_en}`, voice: voices.primary, file: `vocabulary/${item.id}.mp3` });
for (const item of phrases) jobs.push({ key: `phrase:${item.id}`, text: item.sentence_en, voice: voices.primary, file: `phrase/${item.id}.mp3` });
for (const item of listening) jobs.push({ key: `listening:${item.id}`, text: item.sentence_en, voice: voices.primary, file: `listening/${item.id}.mp3` });
for (const item of commutingNarrations) jobs.push({ key: `commuting:${item.id}`, text: item.narration_en, voice: voices.primary, file: `commuting/${item.id}.mp3` });
for (const meeting of meetings) {
  const speakers = [...new Set(meeting.dialogue.map(line => line.speaker))];
  for (const [lineIndex, line] of meeting.dialogue.entries()) {
    const voice = [voices.primary, voices.secondary, voices.tertiary][speakers.indexOf(line.speaker) % 3];
    jobs.push({ key: `meeting:${meeting.id}:${lineIndex}`, text: line.sentence_en, voice, file: `meeting/${meeting.id}-${lineIndex}.mp3` });
  }
}

// Validate the complete audio inventory without credentials, network calls or file writes.
if (process.argv.includes("--dry-run")) {
  if (new Set(jobs.map(job => job.key)).size !== jobs.length) throw new Error("Duplicate audio key");
  if (new Set(jobs.map(job => job.file)).size !== jobs.length) throw new Error("Duplicate audio file");
  if (jobs.some(job => !job.text.trim())) throw new Error("Empty audio text");
  const counts = {};
  for (const job of jobs) { const kind = job.key.split(":")[0]; counts[kind] = (counts[kind] || 0) + 1; }
  console.log(JSON.stringify({ total: jobs.length, counts }, null, 2));
  process.exit(0);
}

await mkdir(publicAudio, { recursive: true });
const manifest = { version: 1, generatedAt: new Date().toISOString(), provider: "Azure Speech neural TTS", items: {} };
if (!key || !region) {
  if (process.argv.includes("--require-complete")) throw new Error("Azure Speech configuration missing; refusing to deploy without natural audio.");
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.warn("Natural audio skipped: set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION to generate MP3 files.");
  process.exit(0);
}

const escapeXml = text => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
const locale = voice => voice.slice(0, 5);
const endpoint = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
const synthesize = async job => {
  const output = path.join(publicAudio, job.file);
  try { if ((await stat(output)).size > 100) return; } catch { /* create it */ }
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${locale(job.voice)}"><voice name="${job.voice}">${escapeXml(job.text)}</voice></speak>`;
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    let response;
    try {
      response = await fetch(endpoint, { method: "POST", signal: AbortSignal.timeout(30000), headers: { "Ocp-Apim-Subscription-Key": key, "Content-Type": "application/ssml+xml", "X-Microsoft-OutputFormat": "audio-24khz-160kbitrate-mono-mp3" }, body: ssml });
    } catch (error) {
      if (attempt === 8) throw error;
      await new Promise(resolve => setTimeout(resolve, Math.min(60000, 2000 * 2 ** (attempt - 1))));
      continue;
    }
    if (response.ok) {
      await mkdir(path.dirname(output), { recursive: true });
      await writeFile(output, Buffer.from(await response.arrayBuffer()));
      return;
    }
    if (attempt === 8 || (response.status !== 429 && response.status < 500)) throw new Error(`Azure Speech HTTP ${response.status}`);
    const retryAfter = response.headers.get("retry-after");
    const serverDelay = retryAfter ? (/^\d+(\.\d+)?$/.test(retryAfter) ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - Date.now()) : 0;
    await response.arrayBuffer();
    const delay = Math.max(Number.isFinite(serverDelay) ? serverDelay : 0, Math.min(60000, 2000 * 2 ** (attempt - 1)));
    await new Promise(resolve => setTimeout(resolve, delay));
  }
};

let next = 0;
let failed = 0;
const worker = async () => {
  while (next < jobs.length) {
    const job = jobs[next++];
    try {
      await synthesize(job);
      manifest.items[job.key] = `./audio/${job.file}`;
    } catch (error) {
      failed += 1;
      console.warn(`Natural audio skipped for ${job.key}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
};
await Promise.all([worker(), worker()]);
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(`Generated ${Object.keys(manifest.items).length} natural MP3 files${failed ? `; skipped ${failed} items` : ""}.`);
if (failed && process.argv.includes("--require-complete")) {
  throw new Error(`${failed} MP3 files are missing; refusing to deploy incomplete natural audio. Retry after checking Azure Speech availability and quota.`);
}
