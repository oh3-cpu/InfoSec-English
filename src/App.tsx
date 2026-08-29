import { useEffect, useMemo, useState } from "react";
import baseVocabulary from "../content/infosec_english_content_pack/vocabulary.json";
import basePhrases from "../content/infosec_english_content_pack/meeting_phrases.json";
import baseListening from "../content/infosec_english_content_pack/listening_items.json";
import baseScenarios from "../content/infosec_english_content_pack/roleplay_scenarios.json";
import meetingListening from "../content/infosec_english_content_pack/meeting_listening.json";
import promptTemplates from "../content/infosec_english_content_pack/chatgpt_prompt_templates.json";
import advancedContent from "../content/infosec_english_content_pack/advanced_waf_ndr.json";

type Level = "beginner" | "lower_intermediate" | "intermediate" | "advanced";
type Vocabulary = { id: string; category_ja: string; level: Level; term_en: string; meaning_ja: string; example_en: string };
type Phrase = { id: string; function: string; level: Level; sentence_en: string; meaning_ja: string };
type Listening = { id: string; category: string; level: Level; sentence_en: string; correct_ja: string; choices_ja: string[]; chatgpt_prompt: string };
type Scenario = { id: string; title_ja: string; context_en: string; role_ai: string; role_user: string; level: Level; turns: { speaker: string; goal: string }[]; chatgpt_prompt: string };
type MeetingListening = { id: string; title_ja: string; context_ja: string; level: Level; dialogue: { speaker: string; sentence_en: string }[]; question_ja: string; correct_ja: string; choices_ja: string[] };
type Progress = { known: string[]; difficult: string[]; correct: number; attempts: number; minutes: number; lastDate: string };

const labels: Record<Level, string> = { beginner: "初級", lower_intermediate: "初中級", intermediate: "中級", advanced: "上級" };
const advanced = advancedContent as { vocabulary: Vocabulary[]; phrases: Phrase[]; listening: Listening[]; scenarios: Scenario[] };
const vocabulary = [...(baseVocabulary as Vocabulary[]), ...advanced.vocabulary];
const phrases = [...(basePhrases as Phrase[]), ...advanced.phrases];
const listening = [...(baseListening as Listening[]), ...advanced.listening];
const scenarios = [...(baseScenarios as Scenario[]), ...advanced.scenarios];
const meetings = meetingListening as MeetingListening[];
const emptyProgress: Progress = { known: [], difficult: [], correct: 0, attempts: 0, minutes: 0, lastDate: "" };
const storeKey = "infosec-english-progress-v1";
const getProgress = (): Progress => { try { return { ...emptyProgress, ...JSON.parse(localStorage.getItem(storeKey) || "{}") }; } catch { return emptyProgress; } };
const shuffle = <T,>(items: T[]) => {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[randomIndex]] = [result[randomIndex], result[index]];
  }
  return result;
};

export default function App() {
  const [tab, setTab] = useState("home");
  const [progress, setProgress] = useState<Progress>(getProgress);
  const [notice, setNotice] = useState("");
  useEffect(() => { localStorage.setItem(storeKey, JSON.stringify(progress)); }, [progress]);
  useEffect(() => { const timer = window.setInterval(() => setProgress(p => ({ ...p, minutes: p.minutes + 1, lastDate: new Date().toISOString().slice(0, 10) })), 60000); return () => clearInterval(timer); }, []);
  const toggle = (id: string, field: "known" | "difficult") => setProgress(p => ({ ...p, [field]: p[field].includes(id) ? p[field].filter(x => x !== id) : [...p[field], id] }));
  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); setNotice("ChatGPT用プロンプトをコピーしました"); } catch { setNotice("コピーできませんでした。文章を長押ししてコピーしてください。"); } setTimeout(() => setNotice(""), 2800); };
  const read = (text: string, slow = false) => {
    if (!("speechSynthesis" in window)) { setNotice("このブラウザでは読み上げを利用できません。"); return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = slow ? 0.72 : 0.9;
    window.speechSynthesis.speak(utterance);
    setNotice(slow ? "ゆっくり読み上げています" : "英語を読み上げています");
    window.setTimeout(() => setNotice(""), 1800);
  };
  const readMeeting = (dialogue: MeetingListening["dialogue"], slow = false) => {
    if (!("speechSynthesis" in window)) { setNotice("このブラウザでは読み上げを利用できません。"); return; }
    window.speechSynthesis.cancel();
    const speakerOrder = [...new Set(dialogue.map(line => line.speaker))];
    dialogue.forEach((line, index) => {
      const utterance = new SpeechSynthesisUtterance(line.sentence_en);
      utterance.lang = "en-US";
      utterance.rate = slow ? 0.7 : 0.9;
      utterance.pitch = speakerOrder.indexOf(line.speaker) % 2 === 0 ? 1.03 : 0.94;
      if (index === dialogue.length - 1) utterance.onend = () => setNotice("");
      window.speechSynthesis.speak(utterance);
    });
    setNotice(slow ? "会議全体をゆっくり読み上げています" : "会議全体を読み上げています");
  };
  const stopReading = () => {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setNotice("読み上げを停止しました");
    window.setTimeout(() => setNotice(""), 1400);
  };
  const navigate = (nextTab: string) => {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setTab(nextTab);
  };
  const content = tab === "home" ? <Dashboard progress={progress} onNavigate={navigate} copy={copy} />
    : tab === "vocabulary" ? <VocabularyView progress={progress} toggle={toggle} copy={copy} read={read} />
    : tab === "phrases" ? <PhrasesView copy={copy} read={read} readMeeting={readMeeting} stopReading={stopReading} />
    : tab === "listening" ? <ListeningView progress={progress} setProgress={setProgress} toggle={toggle} copy={copy} read={read} />
    : <RoleplayView copy={copy} read={read} />;
  return <main className="app"><header><div><p className="eyebrow">3か月の情報セキュリティ英語</p><h1>InfoSec English Trainer</h1></div><span className="shield">✦</span></header>{notice && <div className="toast" role="status">{notice}</div>}<section className="content">{content}</section><nav aria-label="メインメニュー">{[["home","ホーム","⌂"],["vocabulary","単語","Aa"],["phrases","会議文","☷"],["listening","聞き取り","◉"],["roleplay","会議練習","♧"]].map(([id,label,icon]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => navigate(id)}><b>{icon}</b><span>{label}</span></button>)}</nav></main>;
}

function Dashboard({ progress, onNavigate, copy }: { progress: Progress; onNavigate: (tab: string) => void; copy: (s: string) => void }) {
  const review = progress.difficult.length || Math.max(0, 10 - progress.known.length);
  const dailyPrompt = (promptTemplates as { id: string; prompt_en: string }[]).find(x => x.id === "prompt_daily_drill")?.prompt_en || "";
  return <><section className="hero"><p>今日の学習</p><h2>小さく続けて、会議で使える英語へ。</h2><button onClick={() => onNavigate("vocabulary")}>今日の単語を始める →</button></section><div className="stats"><Stat label="学習時間" value={`${progress.minutes}分`} /><Stat label="覚えた単語" value={`${progress.known.length}語`} /><Stat label="苦手項目" value={`${progress.difficult.length}件`} /><Stat label="復習候補" value={`${review}件`} /></div><section className="card"><h2>3か月の目安</h2><div className="progress"><i style={{ width: `${Math.min(100, Math.round(progress.known.length / (vocabulary as Vocabulary[]).length * 100))}%` }} /></div><p>{progress.known.length} / {(vocabulary as Vocabulary[]).length} 語を記録済み。まずは毎日10分、単語・会議文・聞き取りを1つずつ。</p></section><section className="card"><h2>今日のおすすめ</h2><div className="quick"><button onClick={() => onNavigate("phrases")}>会議で聞き返す表現</button><button onClick={() => onNavigate("listening")}>短い聞き取り問題</button><button onClick={() => onNavigate("roleplay")}>ChatGPTで模擬会議</button><button onClick={() => copy(dailyPrompt)}>🎙 30分練習をコピー</button></div></section></>;
}
function Stat({ label, value }: { label: string; value: string }) { return <div className="stat"><strong>{value}</strong><span>{label}</span></div>; }

function VocabularyView({ progress, toggle, copy, read }: { progress: Progress; toggle: (id: string, field: "known" | "difficult") => void; copy: (s: string) => void; read: (s: string, slow?: boolean) => void }) {
  const [view, setView] = useState<"study" | "list">("study");
  const [started, setStarted] = useState(false);
  const [studyLevel, setStudyLevel] = useState<"all" | Level>("all");
  const [queue, setQueue] = useState<Vocabulary[]>([]);
  const [position, setPosition] = useState(0);
  const [query, setQuery] = useState("");
  const [listLevel, setListLevel] = useState<"all" | Level>("all");
  const listItems = useMemo(() => (vocabulary as Vocabulary[]).filter(x => (!query || `${x.term_en} ${x.meaning_ja} ${x.category_ja}`.toLowerCase().includes(query.toLowerCase())) && (listLevel === "all" || x.level === listLevel)), [query, listLevel]);
  const studyItems = (vocabulary as Vocabulary[]).filter(item => studyLevel === "all" || item.level === studyLevel);
  const item = queue[position];

  const speakItem = (target: Vocabulary) => read(`${target.term_en}. ${target.example_en}`);
  const start = () => {
    const nextQueue = shuffle(studyItems);
    if (!nextQueue.length) return;
    setQueue(nextQueue);
    setPosition(0);
    setStarted(true);
    speakItem(nextQueue[0]);
  };
  const next = () => {
    if (!queue.length) return;
    if (position + 1 < queue.length) {
      const nextItem = queue[position + 1];
      setPosition(position + 1);
      speakItem(nextItem);
      return;
    }
    const nextQueue = shuffle(studyItems);
    setQueue(nextQueue);
    setPosition(0);
    speakItem(nextQueue[0]);
  };

  return <>
    <ViewTitle title="専門用語" text={`${(vocabulary as Vocabulary[]).length}語。ランダムに1語ずつ学習し、「次の単語」で自動的に読み上げます。`} />
    <div className="modeSwitch" role="tablist" aria-label="単語の表示方法">
      <button className={view === "study" ? "selected" : ""} onClick={() => setView("study")}>1語ずつ学習</button>
      <button className={view === "list" ? "selected" : ""} onClick={() => setView("list")}>一覧・検索</button>
    </div>
    {view === "study" ? <>
      {!started || !item ? <section className="card sessionStart">
        <span className="tag">ランダム学習</span>
        <h2>1語ずつ、音声と例文で覚える</h2>
        <p className="meaning">開始すると最初の単語を読み上げます。その後は「次の単語」を押すたびに、次の単語と例文をすぐ読み上げます。</p>
        <label className="fieldLabel">難易度
          <select value={studyLevel} onChange={event => setStudyLevel(event.target.value as "all" | Level)}>
            <option value="all">すべての難易度</option>
            {Object.entries(labels).map(([key, value]) => <option key={key} value={key}>{value}</option>)}
          </select>
        </label>
        <button className="primaryButton" onClick={start}>▶ ランダム学習を開始</button>
      </section> : <article className="card item focusCard">
        <div className="row"><span className="tag">{item.category_ja} · {labels[item.level]}</span><span className="counter">{position + 1} / {queue.length}</span></div>
        <h2 className="focusWord">{item.term_en}</h2>
        <p className="meaning">{item.meaning_ja}</p>
        <p className="example">{item.example_en}</p>
        <div className="actions">
          <button onClick={() => read(`${item.term_en}. ${item.example_en}`, true)}>🔊 ゆっくり</button>
          <button onClick={() => read(`${item.term_en}. ${item.example_en}`)}>🔊 もう一度</button>
          <button className={progress.known.includes(item.id) ? "selected" : ""} onClick={() => toggle(item.id, "known")}>✓ 覚えた</button>
          <button className={progress.difficult.includes(item.id) ? "warning selected" : "warning"} onClick={() => toggle(item.id, "difficult")}>苦手</button>
          <button onClick={() => copy(pronunciationPrompt(item))}>🎙 ChatGPTで練習</button>
        </div>
        <button className="nextButton" onClick={next}>次の単語へ → <small>すぐ読み上げます</small></button>
        <button className="textButton" onClick={() => setStarted(false)}>難易度を変更する</button>
      </article>}
    </> : <>
      <div className="filters"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="単語・意味・分野を検索" /><select value={listLevel} onChange={event => setListLevel(event.target.value as "all" | Level)}><option value="all">すべての難易度</option>{Object.entries(labels).map(([key,value]) => <option key={key} value={key}>{value}</option>)}</select></div>
      <p className="result">{listItems.length}件</p>
      {listItems.map(listItem => <article className="card item" key={listItem.id}><div className="row"><div><span className="tag">{listItem.category_ja} · {labels[listItem.level]}</span><h2>{listItem.term_en}</h2><p className="meaning">{listItem.meaning_ja}</p></div><button className="iconButton" aria-label="ChatGPTで練習" onClick={() => copy(pronunciationPrompt(listItem))}>🎙</button></div><p className="example">{listItem.example_en}</p><div className="actions"><button onClick={() => read(`${listItem.term_en}. ${listItem.example_en}`, true)}>🔊 ゆっくり</button><button onClick={() => read(`${listItem.term_en}. ${listItem.example_en}`)}>🔊 通常速度</button><button className={progress.known.includes(listItem.id) ? "selected" : ""} onClick={() => toggle(listItem.id, "known")}>✓ 覚えた</button><button className={progress.difficult.includes(listItem.id) ? "warning selected" : "warning"} onClick={() => toggle(listItem.id, "difficult")}>苦手</button></div></article>)}
    </>}
  </>;
}
function PhrasesView({ copy, read, readMeeting, stopReading }: { copy: (s: string) => void; read: (s: string, slow?: boolean) => void; readMeeting: (dialogue: MeetingListening["dialogue"], slow?: boolean) => void; stopReading: () => void }) {
  const [view, setView] = useState<"phrases" | "meeting">("phrases");
  const [group, setGroup] = useState("all");
  const groups = [...new Set((phrases as Phrase[]).map(item => item.function))];
  const items = (phrases as Phrase[]).filter(item => group === "all" || item.function === group);
  return <>
    <ViewTitle title="会議フレーズ" text="場面別の短文と、会議全体を通して聞く模擬リスニングを練習できます。" />
    <div className="modeSwitch" role="tablist" aria-label="会議フレーズの練習方法">
      <button className={view === "phrases" ? "selected" : ""} onClick={() => setView("phrases")}>場面別フレーズ</button>
      <button className={view === "meeting" ? "selected" : ""} onClick={() => setView("meeting")}>会議全体リスニング</button>
    </div>
    {view === "phrases" ? <>
      <div className="chips"><button className={group === "all" ? "selected" : ""} onClick={() => setGroup("all")}>すべて</button>{groups.map(groupName => <button key={groupName} className={group === groupName ? "selected" : ""} onClick={() => setGroup(groupName)}>{groupName}</button>)}</div>
      {items.map(item => <article className="card item" key={item.id}><span className="tag">{item.function} · {labels[item.level]}</span><h2>{item.sentence_en}</h2><p className="meaning">{item.meaning_ja}</p><p className="small">使用場面：情報セキュリティ会議での「{item.function}」</p><div className="actions"><button onClick={() => read(item.sentence_en, true)}>🔊 ゆっくり</button><button onClick={() => read(item.sentence_en)}>🔊 通常速度</button><button onClick={() => copy(phrasePrompt(item))}>🎙 ChatGPTで練習</button></div></article>)}
    </> : <MeetingListeningView readMeeting={readMeeting} stopReading={stopReading} />}
  </>;
}

function MeetingListeningView({ readMeeting, stopReading }: { readMeeting: (dialogue: MeetingListening["dialogue"], slow?: boolean) => void; stopReading: () => void }) {
  const [started, setStarted] = useState(false);
  const [level, setLevel] = useState<"all" | Level>("all");
  const [queue, setQueue] = useState<MeetingListening[]>([]);
  const [position, setPosition] = useState(0);
  const [showTranscript, setShowTranscript] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [choiceOrder, setChoiceOrder] = useState<string[]>([]);
  const available = meetings.filter(meeting => level === "all" || meeting.level === level);
  const meeting = queue[position];
  const start = () => {
    const nextQueue = shuffle(available);
    if (!nextQueue.length) return;
    setQueue(nextQueue);
    setPosition(0);
    setShowTranscript(false);
    setAnswer(null);
    setChoiceOrder(shuffle(nextQueue[0].choices_ja));
    setStarted(true);
    readMeeting(nextQueue[0].dialogue);
  };
  const next = () => {
    if (!queue.length) return;
    let nextQueue = queue;
    let nextPosition = position + 1;
    if (nextPosition >= queue.length) {
      nextQueue = shuffle(available);
      nextPosition = 0;
      setQueue(nextQueue);
    }
    setPosition(nextPosition);
    setShowTranscript(false);
    setAnswer(null);
    setChoiceOrder(shuffle(nextQueue[nextPosition].choices_ja));
    readMeeting(nextQueue[nextPosition].dialogue);
  };
  if (!started || !meeting) return <section className="card sessionStart">
    <span className="tag">会議全体リスニング</span>
    <h2>複数人の会議を最後まで聞く</h2>
    <p className="meaning">6〜8発言のセキュリティ会議を通して聞き、最後に会議の結論を選びます。英文は最初は隠れています。</p>
    <label className="fieldLabel">難易度
      <select value={level} onChange={event => setLevel(event.target.value as "all" | Level)}>
        <option value="all">すべての難易度</option>
        {Object.entries(labels).map(([key, value]) => <option key={key} value={key}>{value}</option>)}
      </select>
    </label>
    <button className="primaryButton" onClick={start}>▶ ランダムな会議を開始</button>
  </section>;
  return <article className="card meetingCard">
    <div className="row"><span className="tag">{labels[meeting.level]} · 会議全体</span><span className="counter">{position + 1} / {queue.length}</span></div>
    <h2>{meeting.title_ja}</h2>
    <p className="meaning">{meeting.context_ja}</p>
    <div className="actions">
      <button onClick={() => readMeeting(meeting.dialogue, true)}>🔊 全体をゆっくり</button>
      <button onClick={() => readMeeting(meeting.dialogue)}>🔊 会議速度でもう一度</button>
      <button className="warning" onClick={stopReading}>■ 停止</button>
      <button onClick={() => setShowTranscript(!showTranscript)}>{showTranscript ? "英文を隠す" : "英文を表示"}</button>
    </div>
    {showTranscript ? <div className="transcript">{meeting.dialogue.map((line, index) => <div className="dialogueLine" key={`${line.speaker}-${index}`}><b>{line.speaker}</b><p>{line.sentence_en}</p></div>)}</div> : <div className="audioOnly"><span>🎧</span><p>英文を見ずに、会議の状況・対応・担当・期限を聞き取ってください。</p></div>}
    <section className="meetingQuestion">
      <h3>{meeting.question_ja}</h3>
      <div className="choices">{choiceOrder.map(choice => <button key={choice} disabled={!!answer} className={answer ? (choice === meeting.correct_ja ? "correct" : choice === answer ? "incorrect" : "") : ""} onClick={() => setAnswer(choice)}>{choice}</button>)}</div>
      {answer && <div className="answer"><b>{answer === meeting.correct_ja ? "正解！会議の要点を聞き取れました。" : "会議の結論をもう一度確認しましょう。"}</b><p>正解：{meeting.correct_ja}</p></div>}
    </section>
    <button className="nextButton" onClick={next}>次の会議へ → <small>すぐ読み上げます</small></button>
    <button className="textButton" onClick={() => { stopReading(); setStarted(false); }}>難易度を変更する</button>
  </article>;
}
function ListeningView({ progress, setProgress, toggle, copy, read }: { progress: Progress; setProgress: React.Dispatch<React.SetStateAction<Progress>>; toggle: (id: string, field: "known" | "difficult") => void; copy: (s: string) => void; read: (s: string, slow?: boolean) => void }) {
  const [started, setStarted] = useState(false);
  const [level, setLevel] = useState<"all" | Level>("all");
  const [queue, setQueue] = useState<Listening[]>([]);
  const [position, setPosition] = useState(0);
  const [hidden, setHidden] = useState(true);
  const [answer, setAnswer] = useState<string | null>(null);
  const [choiceOrder, setChoiceOrder] = useState<string[]>([]);
  const available = (listening as Listening[]).filter(listeningItem => level === "all" || listeningItem.level === level);
  const item = queue[position];
  const start = () => {
    const nextQueue = shuffle(available);
    if (!nextQueue.length) return;
    setQueue(nextQueue);
    setPosition(0);
    setHidden(true);
    setAnswer(null);
    setChoiceOrder(shuffle(nextQueue[0].choices_ja));
    setStarted(true);
    read(nextQueue[0].sentence_en);
  };
  const choose = (choice: string) => {
    if (answer || !item) return;
    setAnswer(choice);
    setProgress(current => ({ ...current, attempts: current.attempts + 1, correct: current.correct + (choice === item.correct_ja ? 1 : 0) }));
    if (choice !== item.correct_ja && !progress.difficult.includes(item.id)) toggle(item.id, "difficult");
  };
  const next = () => {
    if (!queue.length) return;
    let nextQueue = queue;
    let nextPosition = position + 1;
    if (nextPosition >= queue.length) {
      nextQueue = shuffle(available);
      nextPosition = 0;
      setQueue(nextQueue);
    }
    const nextItem = nextQueue[nextPosition];
    setPosition(nextPosition);
    setAnswer(null);
    setHidden(true);
    setChoiceOrder(shuffle(nextItem.choices_ja));
    read(nextItem.sentence_en);
  };
  return <>
    <ViewTitle title="Listening" text={`${(listening as Listening[]).length}問。ランダムに1問ずつ聞き、「次の問題」で自動的に読み上げます。`} />
    {!started || !item ? <section className="card sessionStart">
      <span className="tag">ランダムListening</span>
      <h2>英文を見ずに、1問ずつ聞く</h2>
      <p className="meaning">開始すると最初の英文を読み上げます。「次の問題」を押すと、次の問題をすぐ読み上げます。</p>
      <label className="fieldLabel">難易度
        <select value={level} onChange={event => setLevel(event.target.value as "all" | Level)}>
          <option value="all">すべての難易度</option>
          {Object.entries(labels).map(([key, value]) => <option key={key} value={key}>{value}</option>)}
        </select>
      </label>
      <button className="primaryButton" onClick={start}>▶ ランダムListeningを開始</button>
    </section> : <article className="card listening focusCard">
      <div className="row"><span className="tag">{labels[item.level]} · {item.category}</span><span className="counter">{position + 1} / {queue.length}</span></div>
      <div className={hidden ? "hiddenSentence" : "shownSentence"}><h2>{hidden ? "Listen without reading" : item.sentence_en}</h2><p className="meaning">{hidden ? "英文を隠しています。音声を聞いて意味を選んでください。" : "英文を確認したら、もう一度聞いてみましょう。"}</p></div>
      <div className="actions"><button onClick={() => setHidden(!hidden)}>{hidden ? "英文を表示" : "英文を隠す"}</button><button onClick={() => read(item.sentence_en, true)}>🔊 ゆっくり聞く</button><button onClick={() => read(item.sentence_en)}>🔊 もう一度</button><button onClick={() => copy(item.chatgpt_prompt + " Ask me to choose the correct Japanese meaning after reading it.")}>🎙 ChatGPTで聞く</button></div>
      <div className="choices">{choiceOrder.map(choice => <button key={choice} disabled={!!answer} className={answer ? (choice === item.correct_ja ? "correct" : choice === answer ? "incorrect" : "") : ""} onClick={() => choose(choice)}>{choice}</button>)}</div>
      {answer && <div className="answer"><b>{answer === item.correct_ja ? "正解！" : "もう一度確認しましょう"}</b><p>日本語：{item.correct_ja}</p><div className="actions"><button className={progress.difficult.includes(item.id) ? "warning selected" : "warning"} onClick={() => toggle(item.id,"difficult")}>{progress.difficult.includes(item.id) ? "苦手に登録済み" : "苦手に追加"}</button></div></div>}
      <button className="nextButton" onClick={next}>次の問題へ → <small>すぐ読み上げます</small></button>
      <button className="textButton" onClick={() => setStarted(false)}>難易度を変更する</button>
    </article>}
  </>;
}
function RoleplayView({ copy, read }: { copy: (s: string) => void; read: (s: string, slow?: boolean) => void }) { return <><ViewTitle title="Role Play" text={`${(scenarios as Scenario[]).length}種類。プロンプトをコピーしてChatGPTアプリの音声モードを開始します。`} /><div className="callout"><b>使い方</b><p>「練習をコピー」→ ChatGPTアプリに貼り付け → 音声モードを開始。APIキーは不要です。</p></div>{(scenarios as Scenario[]).map(item => <article className="card item" key={item.id}><span className="tag">{labels[item.level]}</span><h2>{item.title_ja}</h2><p className="example">{item.context_en}</p><p className="small">ChatGPT：{item.role_ai} ／ あなた：{item.role_user}</p><ol>{item.turns.map((turn,i) => <li key={i}>{turn.goal}</li>)}</ol><div className="actions"><button onClick={() => read(item.context_en, true)}>🔊 状況を読む</button><button onClick={() => copy(item.chatgpt_prompt)}>🎙 会議練習をコピー</button></div></article>)}</>; }
function ViewTitle({ title, text }: { title: string; text: string }) { return <section className="viewTitle"><h2>{title}</h2><p>{text}</p></section>; }
function pronunciationPrompt(item: Vocabulary) { return `You are my English teacher for information security meetings.\nPlease practice this term with me: "${item.term_en}".\nJapanese meaning: ${item.meaning_ja}\nExample: ${item.example_en}\nSpeak naturally and clearly. First pronounce the term slowly, then ask me to repeat it. Use it in a realistic security meeting. Correct my English briefly in Japanese when necessary.`; }
function phrasePrompt(item: Phrase) { return `You are my English teacher for information security meetings.\nPlease practice this phrase with me: "${item.sentence_en}".\nJapanese meaning: ${item.meaning_ja}\nUse case: ${item.function}\nSpeak naturally and clearly. Ask me to repeat it, then use it in a realistic security meeting. Correct my English briefly in Japanese when necessary.`; }
