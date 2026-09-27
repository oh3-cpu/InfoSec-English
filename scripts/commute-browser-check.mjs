// Run after npm run build. Synthetic silent MP3s test playback mechanics only;
// they are written to dist, never committed or used by the deployment workflow.
import { chromium } from "playwright";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import path from "node:path";
import assert from "node:assert/strict";
const root = process.cwd(), dist = path.join(root, "dist");
const json = async name => JSON.parse(await readFile(path.join(root, "content/infosec_english_content_pack", name + ".json"), "utf8"));
const narrations = [...await json("commuting_narrations"), ...(await json("content_expansion_202609")).commutingNarrations];
const studies = await json("commute_study");
const bytes = execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", "3", "-b:a", "160k", "-f", "mp3", "pipe:1"]);
const manifest = { version: 1, items: {}, commutingSegments: {} };
await mkdir(path.join(dist, "audio/commuting-segments"), { recursive: true });
for (const n of narrations) {
  manifest.commutingSegments[n.id] = [];
  for (const [i, text] of (n.narration_en.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? []).entries()) {
    const key = `commuting-segment:${n.id}:${i}`, file = `audio/commuting-segments/${n.id}-${i}-fixture.mp3`;
    manifest.items[key] = `./${file}`;
    manifest.commutingSegments[n.id].push({ key, text: text.trim(), duration: 3.072 });
    await writeFile(path.join(dist, file), bytes);
  }
}
await writeFile(path.join(dist, "audio/manifest.json"), JSON.stringify(manifest));
const mime = { ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".mp3": "audio/mpeg", ".html": "text/html" };
const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost");
  const pathname = url.pathname.replace(/^\/InfoSec-English/, "");
  const file = path.join(dist, pathname === "/" ? "index.html" : pathname);
  try { const data = await readFile(file); response.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream" }); response.end(data); }
  catch { response.writeHead(404); response.end(); }
});
await new Promise(resolve => server.listen(4179, "127.0.0.1", resolve));
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const errors = []; page.on("pageerror", error => errors.push(error.message));
await page.addInitScript(() => {
  const NativeAudio = window.Audio; window.__audios = [];
  window.Audio = function(src) { const player = new NativeAudio(src); window.__audios.push(player); return player; };
});
const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem("infosec-english-progress-v1")));
const listening = () => page.getByRole("button", { name: "◉ 聞き取り" }).click();
try {
  await page.goto("http://127.0.0.1:4179/InfoSec-English/");
  await page.waitForFunction(() => navigator.serviceWorker.controller);
  await page.waitForTimeout(1200);
  assert.equal((await saved()).minutes, 0, "home screen does not count as study");
  await listening();
  await page.getByLabel("再生方法", { exact: true }).selectOption("once");
  await page.getByRole("button", { name: "▶ 選んだ内容で開始" }).click();
  await page.waitForFunction(() => window.__audios.some(a => !a.paused && a.currentTime > .2));
  await page.getByRole("button", { name: "☆ この文を保存" }).click();
  await page.waitForFunction(() => document.querySelector(".commuteNow [role=status]")?.textContent.includes("文2/"));
  await page.getByRole("button", { name: "⏸ 一時停止", exact: true }).click();
  await page.getByRole("button", { name: "0.7倍", exact: true }).click();
  assert.equal(await page.evaluate(() => window.__audios[0].playbackRate), .7);
  assert.equal(await page.evaluate(() => window.__audios[0].paused), true);
  assert.equal(await page.locator(".transcriptReel .current").textContent(), manifest.commutingSegments[narrations[0].id][1].text);
  await page.getByRole("button", { name: "↶ 10秒戻す" }).click();
  await page.waitForFunction(() => document.querySelector(".commuteNow [role=status]")?.textContent.includes("文1/"));
  await page.getByRole("button", { name: "日本語訳を表示" }).click();
  assert.ok((await page.locator(".commuteTranslation").textContent()).length > 600);
  await page.getByRole("button", { name: "↻ この文をもう一度" }).click();
  await page.waitForFunction(() => window.__audios[0].currentTime > .4);
  await page.getByRole("button", { name: "■ 停止・位置を保存" }).click();
  const before = await saved(); assert.ok(before.commute.resume.offset > .2); assert.equal(before.commute.bookmarks.length, 1);
  await page.reload(); await listening();
  await page.getByRole("button", { name: "▶ 前回の続きから再生" }).click();
  await page.waitForFunction(() => window.__audios[0]?.currentTime > .2 && !window.__audios[0].paused);
  await page.getByRole("button", { name: "■ 停止・位置を保存" }).click();
  await page.getByLabel("再生方法", { exact: true }).selectOption("staged");
  await page.getByRole("button", { name: "▶ 選んだ内容で開始" }).click();
  assert.equal(await page.locator(".syncedTranscript").count(), 0);
  await page.getByRole("button", { name: "次の段階へ" }).click();
  assert.equal(await page.locator(".syncedTranscript").count(), 1);
  await page.getByRole("button", { name: "次の段階へ" }).click();
  assert.equal(await page.locator(".commuteTranslation").count(), 1);
  assert.equal(await page.evaluate(() => window.__audios[0].paused), true);
  await page.getByRole("button", { name: "次の段階へ" }).click();
  assert.equal(await page.locator(".syncedTranscript").count(), 0);
  await page.getByRole("button", { name: "■ 停止・位置を保存" }).click();
  await page.locator(".commuteDownloads summary").click();
  await page.locator(".downloadRow").first().getByRole("button", { name: "↓ 保存", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".downloadRow")?.textContent.includes("保存済み"));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "390px layout fits screen");
  await page.screenshot({ path: "/tmp/commute-mobile.png", fullPage: true });
  await context.setOffline(true);
  await page.reload(); await listening();
  await page.getByRole("button", { name: "▶ 前回の続きから再生" }).click();
  await page.waitForFunction(() => window.__audios[0]?.currentTime > .2 && !window.__audios[0].paused);
  await page.getByRole("button", { name: "内容を3問で確認する（任意）" }).click();
  for (const question of studies[narrations[0].id].questions) {
    await page.locator(".commuteQuiz").getByRole("button", { name: question.correct_ja, exact: true }).click();
    await page.locator(".commuteQuiz").getByRole("button", { name: "次へ", exact: true }).click();
  }
  assert.ok((await page.locator(".commuteQuiz").textContent()).includes("3/3問正解"));
  assert.equal((await saved()).commute.quizResults[narrations[0].id].correct, 3);
  await page.locator(".commuteDownloads summary").click();
  await page.locator(".downloadRow").first().getByRole("button", { name: "保存音声を削除", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".downloadRow")?.textContent.includes("未保存"));
  assert.deepEqual(errors, []);
  console.log("PASS: mobile layout, real MP3 playback/sync, paused speed, resume, stages, bookmarks, offline reload/playback, quiz, deletion");
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
