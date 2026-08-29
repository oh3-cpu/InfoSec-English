import baseVocabulary from "../content/infosec_english_content_pack/vocabulary.json";
import basePhrases from "../content/infosec_english_content_pack/meeting_phrases.json";
import baseListening from "../content/infosec_english_content_pack/listening_items.json";
import baseScenarios from "../content/infosec_english_content_pack/roleplay_scenarios.json";
import meetingListening from "../content/infosec_english_content_pack/meeting_listening.json";
import advancedContent from "../content/infosec_english_content_pack/advanced_waf_ndr.json";

export type Level = "beginner" | "lower_intermediate" | "intermediate" | "advanced";
export type Vocabulary = { id: string; category_ja: string; level: Level; term_en: string; meaning_ja: string; example_en: string };
export type Phrase = { id: string; function: string; level: Level; sentence_en: string; meaning_ja: string };
export type Listening = { id: string; category: string; level: Level; sentence_en: string; correct_ja: string; choices_ja: string[]; chatgpt_prompt: string };
export type Scenario = { id: string; title_ja: string; context_en: string; role_ai: string; role_user: string; level: Level; turns: { speaker: string; goal: string }[]; chatgpt_prompt: string };
export type MeetingQuestion = { question_type: "status" | "decision" | "owner_deadline"; question_ja: string; correct_ja: string; choices_ja: string[] };
export type MeetingListening = { id: string; title_ja: string; context_ja: string; level: Level; dialogue: { speaker: string; sentence_en: string }[]; questions: MeetingQuestion[] };

export const labels: Record<Level, string> = {
  beginner: "初級",
  lower_intermediate: "初中級",
  intermediate: "中級",
  advanced: "上級",
};

const advanced = advancedContent as { vocabulary: Vocabulary[]; phrases: Phrase[]; listening: Listening[]; scenarios: Scenario[] };
export const vocabulary = [...(baseVocabulary as Vocabulary[]), ...advanced.vocabulary];
export const phrases = [...(basePhrases as Phrase[]), ...advanced.phrases];
export const listening = [...(baseListening as Listening[]), ...advanced.listening];
export const scenarios = [...(baseScenarios as Scenario[]), ...advanced.scenarios];
export const meetings = meetingListening as MeetingListening[];

export const questionTypeLabels: Record<MeetingQuestion["question_type"], string> = {
  status: "現在の状況",
  decision: "決定事項",
  owner_deadline: "担当者・期限",
};
