import { useState } from "react";
import { labels, listening, meetings, phrases, questionTypeLabels, vocabulary } from "./content";
import type { Level, Listening, MeetingListening, Phrase, Vocabulary } from "./content";
import { dueReviews, prioritizedItems, shuffle } from "./learning";
import type { ItemKind, Progress, SessionSummary } from "./learning";

type Stage = "intro" | "vocabulary" | "phrase" | "listening" | "meeting" | "summary";
type Stats = { correct: number; attempts: number; known: string[]; difficult: string[] };

type Props = {
  progress: Progress;
  read: (text: string) => void;
  readMeeting: (dialogue: MeetingListening["dialogue"]) => void;
  onVocabulary: (id: string, remembered: boolean) => void;
  onAnswer: (kind: ItemKind, id: string, correct: boolean) => void;
  onLevel: (level: Level) => void;
  onFinish: (summary: SessionSummary) => void;
  onHome: () => void;
};

function buildQueue<T extends { id: string; level: Level }>(items: T[], progress: Progress, kind: ItemKind, level: Level, count: number) {
  const prioritized = prioritizedItems(items, progress, kind);
  const dueKeys = new Set(dueReviews(progress, kind).map(review => review.itemId.split(":")[0]));
  const due = prioritized.filter(item => dueKeys.has(item.id));
  const levelItems = shuffle(prioritized.filter(item => item.level === level && !dueKeys.has(item.id)));
  const fallback = shuffle(prioritized.filter(item => item.level !== level && !dueKeys.has(item.id)));
  return [...due, ...levelItems, ...fallback].slice(0, count);
}

function choicesForPhrase(item: Phrase) {
  const alternatives = shuffle(phrases.filter(other => other.id !== item.id).map(other => other.meaning_ja));
  return shuffle([item.meaning_ja, ...alternatives.slice(0, 2)]);
}

export default function DailyCourse({ progress, read, readMeeting, onVocabulary, onAnswer, onLevel, onFinish, onHome }: Props) {
  const [stage, setStage] = useState<Stage>("intro");
  const [level, setLevel] = useState<Level>(progress.courseLevel);
  const [wordQueue, setWordQueue] = useState<Vocabulary[]>([]);
  const [phraseQueue, setPhraseQueue] = useState<Phrase[]>([]);
  const [listeningQueue, setListeningQueue] = useState<Listening[]>([]);
  const [meetingQueue, setMeetingQueue] = useState<MeetingListening[]>([]);
  const [position, setPosition] = useState(0);
  const [answer, setAnswer] = useState<string | null>(null);
  const [choices, setChoices] = useState<string[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [showTranscript, setShowTranscript] = useState(false);
  const [startedAt, setStartedAt] = useState(0);
  const [stats, setStats] = useState<Stats>({ correct: 0, attempts: 0, known: [], difficult: [] });
  const [summary, setSummary] = useState<SessionSummary | null>(null);

  const begin = () => {
    const words = buildQueue(vocabulary, progress, "vocabulary", level, 15);
    const phraseItems = buildQueue(phrases, progress, "phrase", level, 5);
    const listeningItems = buildQueue(listening, progress, "listening", level, 3);
    const meetingItems = buildQueue(meetings, progress, "meeting", level, 1);
    setWordQueue(words);
    setPhraseQueue(phraseItems);
    setListeningQueue(listeningItems);
    setMeetingQueue(meetingItems);
    setPosition(0);
    setStats({ correct: 0, attempts: 0, known: [], difficult: [] });
    setStartedAt(Date.now());
    setStage("vocabulary");
    onLevel(level);
    if (words[0]) read(`${words[0].term_en}. ${words[0].example_en}`);
  };

  const recordLocal = (correct: boolean, id?: string, vocabularyResult = false) => {
    setStats(current => ({
      correct: current.correct + (correct ? 1 : 0),
      attempts: current.attempts + 1,
      known: vocabularyResult && correct && id ? [...new Set([...current.known, id])] : current.known,
      difficult: !correct && id ? [...new Set([...current.difficult, id])] : current.difficult,
    }));
  };

  const startPhrase = () => {
    const item = phraseQueue[0];
    setStage("phrase");
    setPosition(0);
    setAnswer(null);
    if (item) {
      setChoices(choicesForPhrase(item));
      read(item.sentence_en);
    }
  };

  const wordResult = (remembered: boolean) => {
    const item = wordQueue[position];
    if (!item) return;
    onVocabulary(item.id, remembered);
    recordLocal(remembered, item.id, true);
    if (position + 1 < wordQueue.length) {
      const next = wordQueue[position + 1];
      setPosition(position + 1);
      read(`${next.term_en}. ${next.example_en}`);
    } else startPhrase();
  };

  const answerItem = (kind: "phrase" | "listening", item: Phrase | Listening, selected: string, correctText: string) => {
    if (answer) return;
    const correct = selected === correctText;
    setAnswer(selected);
    onAnswer(kind, item.id, correct);
    recordLocal(correct, item.id);
  };

  const nextPhrase = () => {
    if (position + 1 < phraseQueue.length) {
      const next = phraseQueue[position + 1];
      setPosition(position + 1);
      setAnswer(null);
      setChoices(choicesForPhrase(next));
      read(next.sentence_en);
      return;
    }
    const first = listeningQueue[0];
    setStage("listening");
    setPosition(0);
    setAnswer(null);
    if (first) {
      setChoices(shuffle(first.choices_ja));
      read(first.sentence_en);
    }
  };

  const nextListening = () => {
    if (position + 1 < listeningQueue.length) {
      const next = listeningQueue[position + 1];
      setPosition(position + 1);
      setAnswer(null);
      setChoices(shuffle(next.choices_ja));
      read(next.sentence_en);
      return;
    }
    const first = meetingQueue[0];
    setStage("meeting");
    setPosition(0);
    setQuestionIndex(0);
    setAnswer(null);
    setShowTranscript(false);
    if (first) {
      setChoices(shuffle(first.questions[0].choices_ja));
      readMeeting(first.dialogue);
    }
  };

  const answerMeeting = (selected: string) => {
    const meeting = meetingQueue[0];
    const question = meeting?.questions[questionIndex];
    if (!question || answer) return;
    const correct = selected === question.correct_ja;
    setAnswer(selected);
    onAnswer("meeting", `${meeting.id}:${question.question_type}`, correct);
    recordLocal(correct, `${meeting.id}:${question.question_type}`);
  };

  const nextMeetingQuestion = () => {
    const meeting = meetingQueue[0];
    if (!meeting) return;
    if (questionIndex + 1 < meeting.questions.length) {
      const nextIndex = questionIndex + 1;
      setQuestionIndex(nextIndex);
      setAnswer(null);
      setChoices(shuffle(meeting.questions[nextIndex].choices_ja));
      return;
    }
    const elapsedMinutes = Math.max(1, Math.ceil((Date.now() - startedAt) / 60000));
    const accuracy = stats.attempts ? Math.round(stats.correct / stats.attempts * 100) : 0;
    const recommendation = accuracy >= 85
      ? "次回は1つ上の難易度、または会議全体リスニングを重点的に進めましょう。"
      : stats.difficult.length
        ? `次回は期限が来た苦手項目${stats.difficult.length}件から復習しましょう。`
        : "次回も同じ難易度で、音声を0.85倍から1.0倍へ上げてみましょう。";
    const result: SessionSummary = {
      completedAt: new Date().toISOString(),
      elapsedMinutes,
      correct: stats.correct,
      attempts: stats.attempts,
      knownWords: stats.known.length,
      difficultItems: stats.difficult.length,
      recommendation,
    };
    setSummary(result);
    setStage("summary");
    onFinish(result);
  };

  if (stage === "intro") return <>
    <section className="dailyHero">
      <p className="eyebrow">TODAY'S 30-MINUTE COURSE</p>
      <h2>今日の30分コース</h2>
      <p>順番を考えず、音声に沿って最後まで進めます。復習期限の来た問題は各パートで先に出題されます。</p>
    </section>
    <section className="card courseIntro">
      <ol className="coursePlan">
        <li><b>単語 15語</b><span>覚えた／苦手を判断</span></li>
        <li><b>短文 5問</b><span>会議表現の意味を確認</span></li>
        <li><b>Listening 3問</b><span>英文を見ずに聞き取り</span></li>
        <li><b>会議 1本</b><span>状況・決定・担当者／期限の3問</span></li>
      </ol>
      <label className="fieldLabel">今日の難易度
        <select value={level} onChange={event => setLevel(event.target.value as Level)}>
          {Object.entries(labels).map(([key, value]) => <option key={key} value={key}>{value}</option>)}
        </select>
      </label>
      <p className="reviewHint">今日が期限の復習：<b>{dueReviews(progress).length}件</b></p>
      <button className="primaryButton" onClick={begin}>▶ 30分コースを始める</button>
    </section>
  </>;

  if (stage === "summary" && summary) return <CourseSummary summary={summary} onHome={onHome} onRestart={() => setStage("intro")} />;

  if (stage === "vocabulary") {
    const item = wordQueue[position];
    return <><CourseProgress stage="単語" current={position + 1} total={15} section={0} />
      {item && <article className="card focusCard">
        <span className="tag">{item.category_ja} · {labels[item.level]}</span>
        <h2 className="focusWord">{item.term_en}</h2>
        <p className="meaning">{item.meaning_ja}</p>
        <p className="example">{item.example_en}</p>
        <button onClick={() => read(`${item.term_en}. ${item.example_en}`)}>🔊 もう一度聞く</button>
        <div className="courseDecision">
          <button className="warning" onClick={() => wordResult(false)}>まだ苦手</button>
          <button className="successButton" onClick={() => wordResult(true)}>✓ 覚えた</button>
        </div>
        <p className="small">選ぶと次の単語をすぐ読み上げます。</p>
      </article>}
    </>;
  }

  if (stage === "phrase") {
    const item = phraseQueue[position];
    return <><CourseProgress stage="短文" current={position + 1} total={5} section={1} />
      {item && <QuestionCard key={item.id} title="音声を聞いて意味を選んでください" tag={`${item.function} · ${labels[item.level]}`} choices={choices} answer={answer} correct={item.meaning_ja} onChoose={choice => answerItem("phrase", item, choice, item.meaning_ja)} onReplay={() => read(item.sentence_en)} onNext={nextPhrase} nextLabel={position + 1 === phraseQueue.length ? "Listeningへ" : "次の短文へ"} english={item.sentence_en} />}
    </>;
  }

  if (stage === "listening") {
    const item = listeningQueue[position];
    return <><CourseProgress stage="Listening" current={position + 1} total={3} section={2} />
      {item && <QuestionCard key={item.id} title="英文を見ずに意味を選んでください" tag={`${item.category} · ${labels[item.level]}`} choices={choices} answer={answer} correct={item.correct_ja} onChoose={choice => answerItem("listening", item, choice, item.correct_ja)} onReplay={() => read(item.sentence_en)} onNext={nextListening} nextLabel={position + 1 === listeningQueue.length ? "会議リスニングへ" : "次の問題へ"} english={item.sentence_en} />}
    </>;
  }

  const meeting = meetingQueue[0];
  const question = meeting?.questions[questionIndex];
  return <><CourseProgress stage="会議" current={questionIndex + 1} total={3} section={3} />
    {meeting && question && <article className="card meetingCard">
      <span className="tag">{labels[meeting.level]} · 会議1本</span>
      <h2>{meeting.title_ja}</h2>
      <p className="meaning">{meeting.context_ja}</p>
      <div className="actions"><button onClick={() => readMeeting(meeting.dialogue)}>🔊 会議をもう一度</button><button onClick={() => setShowTranscript(value => !value)}>{showTranscript ? "英文を隠す" : "英文を表示"}</button></div>
      {showTranscript ? <div className="transcript">{meeting.dialogue.map((line, index) => <div className="dialogueLine" key={`${line.speaker}-${index}`}><b>{line.speaker}</b><p>{line.sentence_en}</p></div>)}</div> : <div className="audioOnly"><span>🎧</span><p>会議全体から、状況・決定・担当者と期限を聞き取ります。</p></div>}
      <section className="meetingQuestion">
        <span className="questionType">{questionTypeLabels[question.question_type]} · {questionIndex + 1}/3</span>
        <h3>{question.question_ja}</h3>
        <div className="choices">{choices.map(choice => <button key={choice} disabled={!!answer} className={answer ? (choice === question.correct_ja ? "correct" : choice === answer ? "incorrect" : "") : ""} onClick={() => answerMeeting(choice)}>{choice}</button>)}</div>
        {answer && <div className="answer"><b>{answer === question.correct_ja ? "正解！" : "もう一度、会議の要点を確認しましょう。"}</b><p>正解：{question.correct_ja}</p></div>}
      </section>
      {answer && <button className="nextButton" onClick={nextMeetingQuestion}>{questionIndex === 2 ? "学習結果を見る →" : "次の確認問題へ →"}</button>}
    </article>}
  </>;
}

function CourseProgress({ stage, current, total, section }: { stage: string; current: number; total: number; section: number }) {
  return <section className="courseProgress">
    <div><b>{stage}</b><span>{current} / {total}</span></div>
    <div className="courseDots">{[0, 1, 2, 3].map(index => <i key={index} className={index <= section ? "done" : ""} />)}</div>
  </section>;
}

function QuestionCard({ title, tag, choices, answer, correct, onChoose, onReplay, onNext, nextLabel, english }: { title: string; tag: string; choices: string[]; answer: string | null; correct: string; onChoose: (choice: string) => void; onReplay: () => void; onNext: () => void; nextLabel: string; english: string }) {
  const [showEnglish, setShowEnglish] = useState(false);
  return <article className="card focusCard">
    <span className="tag">{tag}</span>
    <div className={showEnglish ? "shownSentence" : "hiddenSentence"}><h2>{showEnglish ? english : "Listen without reading"}</h2><p>{title}</p></div>
    <div className="actions"><button onClick={onReplay}>🔊 もう一度</button><button onClick={() => setShowEnglish(value => !value)}>{showEnglish ? "英文を隠す" : "英文を表示"}</button></div>
    <div className="choices">{choices.map(choice => <button key={choice} disabled={!!answer} className={answer ? (choice === correct ? "correct" : choice === answer ? "incorrect" : "") : ""} onClick={() => onChoose(choice)}>{choice}</button>)}</div>
    {answer && <div className="answer"><b>{answer === correct ? "正解！" : "もう一度確認しましょう。"}</b><p>正解：{correct}</p></div>}
    {answer && <button className="nextButton" onClick={onNext}>{nextLabel} → <small>次の音声をすぐ読み上げます</small></button>}
  </article>;
}

function CourseSummary({ summary, onHome, onRestart }: { summary: SessionSummary; onHome: () => void; onRestart: () => void }) {
  const accuracy = summary.attempts ? Math.round(summary.correct / summary.attempts * 100) : 0;
  return <section className="card completionCard">
    <div className="completionMark">✓</div>
    <p className="eyebrow">COURSE COMPLETE</p>
    <h2>今日の学習、おつかれさまでした</h2>
    <div className="summaryGrid">
      <Stat label="正解率" value={`${accuracy}%`} />
      <Stat label="覚えた単語" value={`${summary.knownWords}語`} />
      <Stat label="苦手項目" value={`${summary.difficultItems}件`} />
      <Stat label="学習時間" value={`${summary.elapsedMinutes}分`} />
    </div>
    <div className="recommendation"><b>次回のおすすめ</b><p>{summary.recommendation}</p></div>
    <button className="primaryButton" onClick={onHome}>ホームへ戻る</button>
    <button className="textButton" onClick={onRestart}>もう一度コースを選ぶ</button>
  </section>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="stat"><strong>{value}</strong><span>{label}</span></div>;
}
