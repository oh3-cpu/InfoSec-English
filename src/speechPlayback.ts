export type SpeechSegment = { text: string; voice?: SpeechSynthesisVoice; pitch?: number };
export type SpeechPlayback = { stop: () => void; pause: () => void; resume: () => void; setRate: (rate: number) => void };

// Web Speech cannot change an utterance's rate reliably after speak().
// Replay only the current sentence on a rate change, preserving the remaining queue.
export function createSpeechPlayback(
  segments: SpeechSegment[],
  initialRate: number,
  events: {
    status: (status: "playing" | "paused" | "completed" | "idle") => void;
    progress?: (value: { currentTime: number; duration: number }) => void;
    ended?: () => void;
  },
  engine: SpeechSynthesis = window.speechSynthesis,
): SpeechPlayback {
  const queue = segments.flatMap(segment => (segment.text.match(/[^.!?]+(?:[.!?]+|$)/g) ?? [])
    .filter(text => text.trim()).map(text => ({ ...segment, text: text.trim() })));
  const durations = queue.map(segment => Math.max(1, segment.text.split(/\s+/).length) * 60 / 145);
  const duration = durations.reduce((sum, value) => sum + value, 0);
  let index = 0, rate = initialRate, active = true, paused = false;
  let utterance: SpeechSynthesisUtterance | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;
  const clear = () => { clearInterval(timer); timer = undefined; };
  const detach = () => {
    clear();
    if (utterance) { utterance.onstart = null; utterance.onend = null; utterance.onerror = null; }
    utterance = null;
  };
  const start = () => {
    if (!active || paused) return;
    const segment = queue[index];
    if (!segment) {
      active = false;
      events.progress?.({ currentTime: duration, duration });
      events.status("completed");
      events.ended?.();
      return;
    }
    const current = new SpeechSynthesisUtterance(segment.text);
    utterance = current;
    current.rate = rate;
    current.lang = segment.voice?.lang || "en-US";
    if (segment.voice) current.voice = segment.voice;
    current.pitch = segment.pitch ?? 1;
    const offset = durations.slice(0, index).reduce((sum, value) => sum + value, 0);
    let elapsed = 0, previous = performance.now();
    const report = () => events.progress?.({ currentTime: offset + Math.min(elapsed, durations[index]), duration });
    current.onstart = () => {
      if (!active || utterance !== current) return;
      events.status(paused ? "paused" : "playing");
      previous = performance.now(); report();
      timer = setInterval(() => {
        const now = performance.now();
        if (!paused) elapsed += (now - previous) / 1000 * rate;
        previous = now; report();
      }, 300);
    };
    current.onend = () => {
      if (!active || utterance !== current) return;
      detach(); index += 1; start();
    };
    current.onerror = () => {
      if (!active || utterance !== current) return;
      detach(); active = false; events.status("idle");
    };
    engine.speak(current);
  };
  const player: SpeechPlayback = {
    stop: () => { active = false; detach(); engine.cancel(); },
    pause: () => { if (active) { paused = true; engine.pause(); events.status("paused"); } },
    resume: () => { if (active && paused) { paused = false; if (utterance) engine.resume(); else { engine.resume(); start(); } events.status("playing"); } },
    setRate: next => {
      if (next === rate || !active) return;
      rate = next; detach(); engine.cancel();
      if (!paused) { engine.resume(); start(); }
    },
  };
  start();
  return player;
}
