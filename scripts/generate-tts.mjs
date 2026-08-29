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
const vocabulary = [...(await source("vocabulary.json")), ...advanced.vocabulary];
const phrases = [...(await source("meeting_phrases.json")), ...advanced.phrases];
const listening = [...(await source("listening_items.json")), ...advanced.listening];
const meetings = await source("meeting_listening.json");
const jobs = [];

for (const item of vocabulary) jobs.push({ key: `vocabulary:${item.id}`, text: `${item.term_en}. ${item.example_en}`, voice: voices.primary, file: `vocabulary/${item.id}.mp3` });
for (const item of phrases) jobs.push({ key: `phrase:${item.id}`, text: item.sentence_en, voice: voices.primary, file: `phrase/${item.id}.mp3` });
for (const item of listening) jobs.push({ key: `listening:${item.id}`, text: item.sentence_en, voice: voices.primary, file: `listening/${item.id}.mp3` });
for (const meeting of meetings) {
  const speakers = [...new Set(meeting.dialogue.map(line => line.speaker))];
  for (const [lineIndex, line] of meeting.dialogue.entries()) {
    const voice = [voices.primary, voices.secondary, voices.tertiary][speakers.indexOf(line.speaker) % 3];
    jobs.push({ key: `meeting:${meeting.id}:${lineIndex}`, text: line.sentence_en, voice, file: `meeting/${meeting.id}-${lineIndex}.mp3` });
  }
}

await mkdir(publicAudio, { recursive: true });
const manifest = { version: 1, generatedAt: new Date().toISOString(), provider: "Azure Speech neural TTS", items: {} };
if (!key || !region) {
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
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await fetch(endpoint, { method: "POST", headers: { "Ocp-Apim-Subscription-Key": key, "Content-Type": "application/ssml+xml", "X-Microsoft-OutputFormat": "audio-24khz-160kbitrate-mono-mp3" }, body: ssml });
    if (response.ok) {
      await mkdir(path.dirname(output), { recursive: true });
      await writeFile(output, Buffer.from(await response.arrayBuffer()));
      return;
    }
    if (attempt === 3) throw new Error(`${response.status} ${await response.text()}`);
    await new Promise(resolve => setTimeout(resolve, attempt * 1000));
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
await Promise.all([worker(), worker(), worker(), worker()]);
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(`Generated ${Object.keys(manifest.items).length} natural MP3 files${failed ? `; skipped ${failed} items` : ""}.`);
