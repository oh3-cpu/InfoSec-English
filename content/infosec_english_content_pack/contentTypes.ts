export type Level = "beginner" | "lower_intermediate" | "intermediate" | "advanced";

export type VocabularyItem = {
  id: string;
  type: "vocabulary";
  category: string;
  category_ja: string;
  level: Level;
  term_en: string;
  meaning_ja: string;
  example_en: string;
  tags: string[];
};

export type MeetingPhrase = {
  id: string;
  type: "meeting_phrase";
  function: string;
  level: Level;
  sentence_en: string;
  meaning_ja: string;
  tags: string[];
};

export type ListeningItem = {
  id: string;
  type: "listening";
  category: string;
  level: Level;
  sentence_en: string;
  correct_ja: string;
  choices_ja: string[];
  chatgpt_prompt: string;
};

export type MeetingListeningItem = {
  id: string;
  title_ja: string;
  context_ja: string;
  level: Level;
  dialogue: { speaker: string; sentence_en: string }[];
  question_ja: string;
  correct_ja: string;
  choices_ja: string[];
};

export type RoleplayScenario = {
  id: string;
  type: "roleplay_scenario";
  title_ja: string;
  context_en: string;
  role_ai: string;
  role_user: string;
  level: Level;
  turns: { speaker: string; goal: string }[];
  chatgpt_prompt: string;
};

export function levelLabel(level: Level): string {
  return {
    beginner: "初級",
    lower_intermediate: "初中級",
    intermediate: "中級",
    advanced: "上級",
  }[level];
}

export function buildPronunciationPrompt(item: VocabularyItem): string {
  return `You are my English pronunciation coach for information security.
Target term: ${item.term_en}
Meaning in Japanese: ${item.meaning_ja}
Example: ${item.example_en}

In voice mode:
1. Pronounce the term slowly three times.
2. Break it into easy sound units.
3. Read the example sentence very slowly, then at normal meeting speed.
4. Ask me to repeat each item.
5. Give one simple correction in Japanese.`;
}

export function buildMeetingPhrasePrompt(item: MeetingPhrase): string {
  return `Act as a patient English speaking coach for information-security meetings.
Practice sentence: ${item.sentence_en}
Japanese meaning: ${item.meaning_ja}
Communication function: ${item.function}

In voice mode:
1. Read it very slowly with natural intonation.
2. Read it in short chunks and let me repeat each chunk.
3. Read the whole sentence at normal meeting speed.
4. Correct only the most important issue in Japanese.`;
}
