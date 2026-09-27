import type { AudioManifest } from "./audio";
export const offlineCacheName = "infosec-commute-audio-v1";
export const audioUrl = (path: string) => new URL(path, document.baseURI).href;
export async function downloadedSize(paths: string[]): Promise<number | null> {
  if (!("caches" in window) || !paths.length) return null;
  const cache = await caches.open(offlineCacheName);
  let total = 0;
  for (const path of paths) {
    const response = await cache.match(audioUrl(path));
    if (!response?.ok) return null;
    total += (await response.blob()).size;
  }
  return total;
}
export async function downloadAudio(paths: string[], manifest: AudioManifest, signal: AbortSignal, progress: (done: number, total: number) => void) {
  if (!("caches" in window)) throw new Error("このブラウザーではオフライン保存を利用できません。");
  if (!navigator.serviceWorker?.controller) throw new Error("オフライン機能を準備中です。少し待ってから保存を押してください。");
  if (!paths.length) throw new Error("保存対象の音声がありません。");
  const cache = await caches.open(offlineCacheName);
  const added: string[] = [];
  try {
    for (const [index, path] of paths.entries()) {
      signal.throwIfAborted();
      const url = audioUrl(path);
      if (!await cache.match(url)) {
        const response = await fetch(url, { signal, cache: "no-store" });
        if (!response.ok || response.status !== 200) throw new Error("音声を保存できませんでした。通信を確認して再試行してください。");
        const blob = await response.blob();
        if (blob.size < 100 || !/audio|octet-stream/i.test(blob.type)) throw new Error("音声ファイルを確認できませんでした。");
        await cache.put(url, new Response(blob, { headers: { "Content-Type": "audio/mpeg", "Content-Length": String(blob.size) } }));
        added.push(url);
      }
      progress(index + 1, paths.length);
    }
    signal.throwIfAborted();
    await cache.put(audioUrl("./audio/manifest.json"), new Response(JSON.stringify(manifest), { headers: { "Content-Type": "application/json" } }));
  } catch (error) {
    await Promise.all(added.map(url => cache.delete(url)));
    throw error;
  }
}
export async function removeAudio(paths: string[]) {
  const cache = await caches.open(offlineCacheName);
  await Promise.all(paths.map(path => cache.delete(audioUrl(path))));
}
