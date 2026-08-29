import type { VoicePreference } from "./voices";

export type ItemKind = "vocabulary" | "phrase" | "listening" | "meeting";
export type PlaybackRate = 0.7 | 0.85 | 1;

export type ReviewRecord = {
  key: string;
  itemId: string;
  kind: ItemKind;
  stage: 0 | 1 | 2;
  dueDate: string;
  lastResult: "correct" | "incorrect";
};

export type SessionSummary = {
  completedAt: string;
  elapsedMinutes: number;
  correct: number;
  attempts: number;
  knownWords: number;
  difficultItems: number;
  recommendation: string;
};

export type Progress = {
  version: 3;
  known: string[];
  difficult: string[];
  correct: number;
  attempts: number;
  minutes: number;
  lastDate: string;
  reviews: ReviewRecord[];
  playbackRate: PlaybackRate;
  preferredVoice: VoicePreference;
  courseLevel: "beginner" | "lower_intermediate" | "intermediate" | "advanced";
  lastSession: SessionSummary | null;
};

export const storeKey = "infosec-english-progress-v1";
export const emptyProgress: Progress = {
  version: 3,
  known: [],
  difficult: [],
  correct: 0,
  attempts: 0,
  minutes: 0,
  lastDate: "",
  reviews: [],
  playbackRate: 0.85,
  preferredVoice: "Ava",
  courseLevel: "beginner",
  lastSession: null,
};

const dateText = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
export const todayText = () => dateText(new Date());
const addDays = (days: number) => {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return dateText(date);
};
const strings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
const numberOr = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) ? value : fallback;

export function normalizeProgress(value: unknown): Progress {
  if (!value || typeof value !== "object") return { ...emptyProgress };
  const source = value as Partial<Progress>;
  const rates: PlaybackRate[] = [0.7, 0.85, 1];
  const voicePreferences: VoicePreference[] = ["auto", "Ava", "Alex", "Alison"];
  const levels = ["beginner", "lower_intermediate", "intermediate", "advanced"] as const;
  const reviews = Array.isArray(source.reviews) ? source.reviews.filter((review): review is ReviewRecord => {
    if (!review || typeof review !== "object") return false;
    const item = review as ReviewRecord;
    return typeof item.key === "string" && typeof item.itemId === "string" && ["vocabulary", "phrase", "listening", "meeting"].includes(item.kind) && [0, 1, 2].includes(item.stage) && /^\d{4}-\d{2}-\d{2}$/.test(item.dueDate);
  }) : [];
  return {
    version: 3,
    known: strings(source.known),
    difficult: strings(source.difficult),
    correct: numberOr(source.correct, 0),
    attempts: numberOr(source.attempts, 0),
    minutes: numberOr(source.minutes, 0),
    lastDate: typeof source.lastDate === "string" ? source.lastDate : "",
    reviews,
    playbackRate: rates.includes(source.playbackRate as PlaybackRate) ? source.playbackRate as PlaybackRate : 0.85,
    preferredVoice: voicePreferences.includes(source.preferredVoice as VoicePreference) ? source.preferredVoice as VoicePreference : "Ava",
    courseLevel: levels.includes(source.courseLevel as typeof levels[number]) ? source.courseLevel as Progress["courseLevel"] : "beginner",
    lastSession: source.lastSession && typeof source.lastSession === "object" ? source.lastSession as SessionSummary : null,
  };
}

export function loadProgress(): Progress {
  try {
    return normalizeProgress(JSON.parse(localStorage.getItem(storeKey) || "{}"));
  } catch {
    return { ...emptyProgress };
  }
}

export const reviewKey = (kind: ItemKind, itemId: string) => `${kind}:${itemId}`;

export function dueReviews(progress: Progress, kind?: ItemKind): ReviewRecord[] {
  const today = todayText();
  return progress.reviews
    .filter(review => review.dueDate <= today && (!kind || review.kind === kind))
    .sort((left, right) => left.dueDate.localeCompare(right.dueDate));
}

export function recordResult(progress: Progress, kind: ItemKind, itemId: string, isCorrect: boolean): Progress {
  const key = reviewKey(kind, itemId);
  const existing = progress.reviews.find(review => review.key === key);
  let reviews = progress.reviews.filter(review => review.key !== key);
  let difficult = progress.difficult;

  if (!isCorrect) {
    reviews = [...reviews, { key, itemId, kind, stage: 0, dueDate: addDays(1), lastResult: "incorrect" }];
    if (!difficult.includes(itemId)) difficult = [...difficult, itemId];
  } else if (existing && existing.dueDate <= todayText()) {
    if (existing.stage === 0) reviews = [...reviews, { ...existing, stage: 1, dueDate: addDays(3), lastResult: "correct" }];
    if (existing.stage === 1) reviews = [...reviews, { ...existing, stage: 2, dueDate: addDays(7), lastResult: "correct" }];
    if (existing.stage === 2) difficult = difficult.filter(id => id !== itemId);
  } else if (existing) {
    reviews = [...reviews, existing];
  }

  return {
    ...progress,
    difficult,
    reviews,
    attempts: progress.attempts + 1,
    correct: progress.correct + (isCorrect ? 1 : 0),
    lastDate: todayText(),
  };
}

export function recordVocabulary(progress: Progress, itemId: string, remembered: boolean): Progress {
  const updated = recordResult(progress, "vocabulary", itemId, remembered);
  return {
    ...updated,
    known: remembered
      ? [...new Set([...updated.known, itemId])]
      : updated.known.filter(id => id !== itemId),
  };
}

export function prioritizedItems<T extends { id: string }>(items: T[], progress: Progress, kind: ItemKind, count?: number): T[] {
  const byId = new Map(items.map(item => [item.id, item]));
  const due = dueReviews(progress, kind)
    .map(review => byId.get(review.itemId) ?? (kind === "meeting" ? byId.get(review.itemId.split(":")[0]) : undefined))
    .filter((item): item is T => Boolean(item));
  const uniqueDue = [...new Map(due.map(item => [item.id, item])).values()];
  const dueIds = new Set(uniqueDue.map(item => item.id));
  const remaining = shuffle(items.filter(item => !dueIds.has(item.id)));
  const result = [...uniqueDue, ...remaining];
  return typeof count === "number" ? result.slice(0, count) : result;
}

export function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[randomIndex]] = [result[randomIndex], result[index]];
  }
  return result;
}
