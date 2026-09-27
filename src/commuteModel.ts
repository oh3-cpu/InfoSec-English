export type CaptionMode = "hidden" | "focus" | "full";
export type CommuteMode = "once" | "repeat" | "continuous" | "staged" | "timed" | "bookmarks";
export type SentenceRef = { narrationId: string; index: number };
export type CommuteSession = {
  queue: SentenceRef[]; position: number; offset: number; mode: CommuteMode;
  phase: number; targetSeconds: number; listenedSeconds: number; completed: boolean;
};
export type CommuteProgress = {
  resume: CommuteSession | null; bookmarks: SentenceRef[]; captions: CaptionMode;
  quizResults: Record<string, { correct: number; total: number; completedAt: string }>;
};
export type SentenceAudio = { key: string; text: string; duration: number };
export const emptyCommute = (): CommuteProgress => ({ resume: null, bookmarks: [], captions: "focus", quizResults: {} });
export const splitSentences = (text: string) => text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map(s => s.trim()).filter(Boolean) ?? [];
export const sentenceKey = (ref: SentenceRef) => `${ref.narrationId}:${ref.index}`;
const finite = (value: unknown, fallback = 0) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
const reference = (value: unknown): value is SentenceRef => Boolean(value && typeof value === "object" && typeof (value as SentenceRef).narrationId === "string" && Number.isInteger((value as SentenceRef).index) && (value as SentenceRef).index >= 0);
export function normalizeCommute(value: unknown): CommuteProgress {
  const result = emptyCommute();
  if (!value || typeof value !== "object") return result;
  const input = value as Partial<CommuteProgress>;
  if (["hidden", "focus", "full"].includes(input.captions ?? "")) result.captions = input.captions!;
  if (Array.isArray(input.bookmarks)) result.bookmarks = [...new Map(input.bookmarks.filter(reference).slice(0, 2000).map(ref => [sentenceKey(ref), { narrationId: ref.narrationId, index: ref.index }])).values()];
  const saved = input.resume;
  if (saved && typeof saved === "object" && Array.isArray(saved.queue) && saved.queue.length && saved.queue.every(reference) && ["once", "repeat", "continuous", "staged", "timed", "bookmarks"].includes(saved.mode)) {
    const queue = saved.queue.slice(0, 10000);
    result.resume = { queue, position: Math.min(queue.length - 1, Math.floor(finite(saved.position))), offset: finite(saved.offset), mode: saved.mode, phase: Math.min(3, Math.floor(finite(saved.phase))), targetSeconds: Math.min(2700, finite(saved.targetSeconds)), listenedSeconds: finite(saved.listenedSeconds), completed: saved.completed === true };
  }
  if (input.quizResults && typeof input.quizResults === "object") {
    for (const [id, quiz] of Object.entries(input.quizResults)) {
      if (quiz && quiz.total === 3 && Number.isInteger(quiz.correct) && quiz.correct >= 0 && quiz.correct <= 3 && typeof quiz.completedAt === "string" && /^\d{4}-\d\d-\d\dT/.test(quiz.completedAt)) result.quizResults[id] = quiz;
    }
  }
  return result;
}
export function courseQueue(narrations: { id: string; narration_en: string }[]): SentenceRef[] {
  return narrations.flatMap(n => splitSentences(n.narration_en).map((_, index) => ({ narrationId: n.id, index })));
}
export function seekQueue(queue: SentenceRef[], position: number, offset: number, delta: number, duration: (ref: SentenceRef) => number) {
  const durations = queue.map(ref => Math.max(0.01, duration(ref)));
  const total = durations.reduce((a, b) => a + b, 0);
  let target = Math.max(0, Math.min(total - 0.01, durations.slice(0, position).reduce((a, b) => a + b, 0) + offset + delta));
  for (let i = 0; i < durations.length; i++) {
    if (target < durations[i] || i === durations.length - 1) return { position: i, offset: Math.max(0, target) };
    target -= durations[i];
  }
  return { position: 0, offset: 0 };
}
export function nextSentence(session: CommuteSession): CommuteSession {
  if (session.targetSeconds > 0 && session.listenedSeconds >= session.targetSeconds) return { ...session, completed: true, offset: 0 };
  if (session.position + 1 < session.queue.length) return { ...session, position: session.position + 1, offset: 0 };
  if (session.mode === "staged") return session.phase < 3 ? { ...session, position: 0, offset: 0, phase: session.phase + 1 } : { ...session, completed: true, offset: 0 };
  if (["repeat", "continuous", "timed", "bookmarks"].includes(session.mode)) return { ...session, position: 0, offset: 0 };
  return { ...session, completed: true, offset: 0 };
}
export function timedQueue<T extends { id: string; narration_en: string }>(courses: T[], minutes: number, rate: number, seconds: (course: T) => number): SentenceRef[] {
  if (!courses.length) return [];
  const selected: T[] = []; let elapsed = 0;
  for (let i = 0; elapsed < minutes * 60 && i < 100; i++) {
    const course = courses[i % courses.length]; selected.push(course);
    elapsed += Math.max(1, seconds(course)) / rate;
  }
  return courseQueue(selected);
}
export const phaseLabels = ["① 字幕なし", "② 英文付き", "③ 日本語訳を確認", "④ 字幕なしで再確認"];
export const formatTime = (seconds: number) => `${Math.floor(Math.max(0, seconds) / 60)}:${String(Math.floor(Math.max(0, seconds) % 60)).padStart(2, "0")}`;
