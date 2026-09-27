// Ignore suspended timer gaps. Audio may continue while the screen is locked;
// its media-time events are accounted for separately by the player.
export function activeStudySeconds(elapsed: number, visible: boolean, studying: boolean, idleSeconds: number, playing: boolean) {
  if (playing) return Math.max(0, Math.min(2, elapsed));
  return visible && studying && idleSeconds < 60 ? Math.max(0, Math.min(2, elapsed)) : 0;
}

export function studyStreak(stats: { date: string; attempts: number; minutes: number }[], now = new Date()) {
  const active = new Set(stats.filter(s => s.attempts > 0 || s.minutes > 0).map(s => s.date));
  const date = new Date(now); date.setHours(12, 0, 0, 0);
  const key = () => localDate(date);
  if (!active.has(key())) date.setDate(date.getDate() - 1);
  let count = 0;
  while (active.has(key())) { count++; date.setDate(date.getDate() - 1); }
  return count;
}
export function localDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
