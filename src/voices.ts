export type VoicePreference = "auto" | "Ava" | "Alex" | "Alison";

export const voiceOptions: { value: VoicePreference; label: string }[] = [
  { value: "Ava", label: "Ava（プレミアム）" },
  { value: "Alex", label: "Alex" },
  { value: "Alison", label: "Alison（拡張）" },
  { value: "auto", label: "端末の自動音声" },
];

const isEnglish = (voice: SpeechSynthesisVoice) => voice.lang.toLowerCase().startsWith("en");
const normalizedName = (voice: SpeechSynthesisVoice) => voice.name.toLowerCase();

export function findVoice(voices: SpeechSynthesisVoice[], preference: VoicePreference): SpeechSynthesisVoice | undefined {
  const english = voices.filter(isEnglish);
  if (preference === "auto") return english.find(voice => voice.default) ?? english[0];
  const target = preference.toLowerCase();
  const matches = english.filter(voice => normalizedName(voice).includes(target));
  if (preference === "Ava") {
    return matches.find(voice => normalizedName(voice).includes("premium"))
      ?? matches.find(voice => normalizedName(voice).includes("enhanced"))
      ?? matches[0];
  }
  if (preference === "Alison") {
    return matches.find(voice => normalizedName(voice).includes("enhanced")) ?? matches[0];
  }
  return matches[0];
}

export function meetingVoicePool(voices: SpeechSynthesisVoice[], preference: VoicePreference): SpeechSynthesisVoice[] {
  const order: VoicePreference[] = [preference, "Alex", "Alison", "Ava"];
  const selected = order
    .map(item => findVoice(voices, item))
    .filter((voice): voice is SpeechSynthesisVoice => Boolean(voice));
  const unique = [...new Map(selected.map(voice => [voice.voiceURI || `${voice.name}:${voice.lang}`, voice])).values()];
  if (unique.length) return unique;
  const fallback = voices.filter(isEnglish);
  return fallback.length ? fallback : voices;
}

export function voiceStatus(voices: SpeechSynthesisVoice[], preference: VoicePreference): string {
  const voice = findVoice(voices, preference);
  return voice ? `使用中：${voice.name}（${voice.lang}）` : `${preference === "auto" ? "英語音声" : preference}をSafariで検出できないため、自動音声を使用します`;
}
