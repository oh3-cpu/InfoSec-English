import { useEffect, useMemo, useState } from "react";
import baseVocabulary from "../content/infosec_english_content_pack/vocabulary.json";
import basePhrases from "../content/infosec_english_content_pack/meeting_phrases.json";
import baseListening from "../content/infosec_english_content_pack/listening_items.json";
import baseScenarios from "../content/infosec_english_content_pack/roleplay_scenarios.json";
import promptTemplates from "../content/infosec_english_content_pack/chatgpt_prompt_templates.json";
import advancedContent from "../content/infosec_english_content_pack/advanced_waf_ndr.json";

type Level = "beginner" | "lower_intermediate" | "intermediate" | "advanced";
type Vocabulary = { id: string; category_ja: string; level: Level; term_en: string; meaning_ja: string; example_en: string };
type Phrase = { id: string; function: string; level: Level; sentence_en: string; meaning_ja: string };
type Listening = { id: string; category: string; level: Level; sentence_en: string; correct_ja: string; choices_ja: string[]; chatgpt_prompt: string };
type Scenario = { id: string; title_ja: string; context_en: string; role_ai: string; role_user: string; level: Level; turns: { speaker: string; goal: string }[]; chatgpt_prompt: string };
type Progress = { known: string[]; difficult: string[]; correct: number; attempts: number; minutes: number; lastDate: string };

const labels: Record<Level, string> = { beginner: "初級", lower_intermediate: "初中級", intermediate: "中級", advanced: "上級" };
const advanced = advancedContent as { vocabulary: Vocabulary[]; phrases: Phrase[]; listening: Listening[]; scenarios: Scenario[] };
const vocabulary = [...(baseVocabulary as Vocabulary[]), ...advanced.vocabulary];
const phrases = [...(basePhrases as Phrase[]), ...advanced.phrases];
const listening = [...(baseListening as Listening[]), ...advanced.listening];
const scenarios = [...(baseScenarios as Scenario[]), ...advanced.scenarios];
const emptyProgress: Progress = { known: [], difficult: [], correct: 0, attempts: 0, minutes: 0, lastDate: "" };
const storeKey = "infosec-english-progress-v1";
const getProgress = (): Progress => { try { return { ...emptyProgress, ...JSON.parse(localStorage.getItem(storeKey) || "{}") }; } catch { return emptyProgress; } };

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
  const content = tab === "home" ? <Dashboard progress={progress} onNavigate={setTab} copy={copy} />
    : tab === "vocabulary" ? <VocabularyView progress={progress} toggle={toggle} copy={copy} read={read} />
    : tab === "phrases" ? <PhrasesView copy={copy} read={read} />
    : tab === "listening" ? <ListeningView progress={progress} setProgress={setProgress} toggle={toggle} copy={copy} read={read} />
    : <RoleplayView copy={copy} read={read} />;
  return <main className="app"><header><div><p className="eyebrow">3か月の情報セキュリティ英語</p><h1>InfoSec English Trainer</h1></div><span className="shield">✦</span></header>{notice && <div className="toast" role="status">{notice}</div>}<section className="content">{content}</section><nav aria-label="メインメニュー">{[["home","ホーム","⌂"],["vocabulary","単語","Aa"],["phrases","会議文","☷"],["listening","聞き取り","◉"],["roleplay","会議練習","♧"]].map(([id,label,icon]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}><b>{icon}</b><span>{label}</span></button>)}</nav></main>;
}

function Dashboard({ progress, onNavigate, copy }: { progress: Progress; onNavigate: (tab: string) => void; copy: (s: string) => void }) {
  const review = progress.difficult.length || Math.max(0, 10 - progress.known.length);
  const dailyPrompt = (promptTemplates as { id: string; prompt_en: string }[]).find(x => x.id === "prompt_daily_drill")?.prompt_en || "";
  return <><section className="hero"><p>今日の学習</p><h2>小さく続けて、会議で使える英語へ。</h2><button onClick={() => onNavigate("vocabulary")}>今日の単語を始める →</button></section><div className="stats"><Stat label="学習時間" value={`${progress.minutes}分`} /><Stat label="覚えた単語" value={`${progress.known.length}語`} /><Stat label="苦手項目" value={`${progress.difficult.length}件`} /><Stat label="復習候補" value={`${review}件`} /></div><section className="card"><h2>3か月の目安</h2><div className="progress"><i style={{ width: `${Math.min(100, Math.round(progress.known.length / (vocabulary as Vocabulary[]).length * 100))}%` }} /></div><p>{progress.known.length} / {(vocabulary as Vocabulary[]).length} 語を記録済み。まずは毎日10分、単語・会議文・聞き取りを1つずつ。</p></section><section className="card"><h2>今日のおすすめ</h2><div className="quick"><button onClick={() => onNavigate("phrases")}>会議で聞き返す表現</button><button onClick={() => onNavigate("listening")}>短い聞き取り問題</button><button onClick={() => onNavigate("roleplay")}>ChatGPTで模擬会議</button><button onClick={() => copy(dailyPrompt)}>🎙 30分練習をコピー</button></div></section></>;
}
function Stat({ label, value }: { label: string; value: string }) { return <div className="stat"><strong>{value}</strong><span>{label}</span></div>; }

function VocabularyView({ progress, toggle, copy, read }: { progress: Progress; toggle: (id: string, field: "known" | "difficult") => void; copy: (s: string) => void; read: (s: string, slow?: boolean) => void }) {
  const [query, setQuery] = useState(""); const [level, setLevel] = useState<"all" | Level>("all");
  const items = useMemo(() => (vocabulary as Vocabulary[]).filter(x => (!query || `${x.term_en} ${x.meaning_ja} ${x.category_ja}`.toLowerCase().includes(query.toLowerCase())) && (level === "all" || x.level === level)), [query, level]);
  return <><ViewTitle title="専門用語" text={`${(vocabulary as Vocabulary[]).length}語。英語・日本語・例文を確認して記録します。`} /><div className="filters"><input value={query} onChange={e => setQuery(e.target.value)} placeholder="単語・意味・分野を検索" /><select value={level} onChange={e => setLevel(e.target.value as "all" | Level)}><option value="all">すべての難易度</option>{Object.entries(labels).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></div><p className="result">{items.length}件</p>{items.map(item => <article className="card item" key={item.id}><div className="row"><div><span className="tag">{item.category_ja} · {labels[item.level]}</span><h2>{item.term_en}</h2><p className="meaning">{item.meaning_ja}</p></div><button className="iconButton" aria-label="ChatGPTで練習" onClick={() => copy(pronunciationPrompt(item))}>🎙</button></div><p className="example">{item.example_en}</p><p className="small">ChatGPT音声モードで、ゆっくり発音→復唱→会議速度の順に練習できます。</p><div className="actions"><button onClick={() => read(`${item.term_en}. ${item.example_en}`, true)}>🔊 ゆっくり</button><button onClick={() => read(`${item.term_en}. ${item.example_en}`)}>🔊 通常速度</button><button className={progress.known.includes(item.id) ? "selected" : ""} onClick={() => toggle(item.id, "known")}>✓ 覚えた</button><button className={progress.difficult.includes(item.id) ? "warning selected" : "warning"} onClick={() => toggle(item.id, "difficult")}>苦手</button><button onClick={() => copy(pronunciationPrompt(item))}>ChatGPTで練習</button></div></article>)}</>;
}
function PhrasesView({ copy, read }: { copy: (s: string) => void; read: (s: string, slow?: boolean) => void }) { const [group, setGroup] = useState("all"); const groups = [...new Set((phrases as Phrase[]).map(x => x.function))]; const items = (phrases as Phrase[]).filter(x => group === "all" || x.function === group); return <><ViewTitle title="会議フレーズ" text={`${(phrases as Phrase[]).length}文。会議の場面別に練習します。`} /><div className="chips"><button className={group === "all" ? "selected" : ""} onClick={() => setGroup("all")}>すべて</button>{groups.map(g => <button key={g} className={group === g ? "selected" : ""} onClick={() => setGroup(g)}>{g}</button>)}</div>{items.map(item => <article className="card item" key={item.id}><span className="tag">{item.function} · {labels[item.level]}</span><h2>{item.sentence_en}</h2><p className="meaning">{item.meaning_ja}</p><p className="small">使用場面：情報セキュリティ会議での「{item.function}」</p><div className="actions"><button onClick={() => read(item.sentence_en, true)}>🔊 ゆっくり</button><button onClick={() => read(item.sentence_en)}>🔊 通常速度</button><button onClick={() => copy(phrasePrompt(item))}>🎙 ChatGPTで練習</button></div></article>)}</>; }
function ListeningView({ progress, setProgress, toggle, copy, read }: { progress: Progress; setProgress: React.Dispatch<React.SetStateAction<Progress>>; toggle: (id: string, field: "known" | "difficult") => void; copy: (s: string) => void; read: (s: string, slow?: boolean) => void }) { const [index,setIndex] = useState(0); const [hidden,setHidden] = useState(false); const [answer,setAnswer] = useState<string | null>(null); const item = (listening as Listening[])[index]; const correct = answer === item.correct_ja; const choose = (choice: string) => { if (answer) return; setAnswer(choice); setProgress(p => ({ ...p, attempts: p.attempts + 1, correct: p.correct + (choice === item.correct_ja ? 1 : 0) })); if (choice !== item.correct_ja) toggle(item.id, "difficult"); }; const next = () => { setIndex((index + 1) % (listening as Listening[]).length); setAnswer(null); setHidden(false); }; return <><ViewTitle title="Listening" text={`${(listening as Listening[]).length}問。ブラウザまたはChatGPT音声モードで練習します。`} /><article className="card listening"><div className="row"><span className="tag">{labels[item.level]} · {item.category}</span><span>{index + 1} / {(listening as Listening[]).length}</span></div><h2>{hidden ? "••••••••••••••••" : item.sentence_en}</h2><p className="meaning">{hidden ? "英文を隠して意味を選びます" : "英文を確認したら、隠して聞き取りに挑戦"}</p><div className="actions"><button onClick={() => setHidden(!hidden)}>{hidden ? "英文を表示" : "英文を隠す"}</button><button onClick={() => read(item.sentence_en, true)}>🔊 ゆっくり聞く</button><button onClick={() => read(item.sentence_en)}>🔊 通常速度</button><button onClick={() => copy(item.chatgpt_prompt + " Ask me to choose the correct Japanese meaning after reading it.")}>🎙 ChatGPTで聞く</button></div><div className="choices">{item.choices_ja.map(c => <button key={c} disabled={!!answer} className={answer ? (c === item.correct_ja ? "correct" : c === answer ? "incorrect" : "") : ""} onClick={() => choose(c)}>{c}</button>)}</div>{answer && <div className="answer"><b>{correct ? "正解！" : "もう一度確認しましょう"}</b><p>日本語：{item.correct_ja}</p><div className="actions"><button className={progress.difficult.includes(item.id) ? "warning selected" : "warning"} onClick={() => toggle(item.id,"difficult")}>苦手に追加</button><button onClick={next}>次の問題 →</button></div></div>}</article></>; }
function RoleplayView({ copy, read }: { copy: (s: string) => void; read: (s: string, slow?: boolean) => void }) { return <><ViewTitle title="Role Play" text={`${(scenarios as Scenario[]).length}種類。プロンプトをコピーしてChatGPTアプリの音声モードを開始します。`} /><div className="callout"><b>使い方</b><p>「練習をコピー」→ ChatGPTアプリに貼り付け → 音声モードを開始。APIキーは不要です。</p></div>{(scenarios as Scenario[]).map(item => <article className="card item" key={item.id}><span className="tag">{labels[item.level]}</span><h2>{item.title_ja}</h2><p className="example">{item.context_en}</p><p className="small">ChatGPT：{item.role_ai} ／ あなた：{item.role_user}</p><ol>{item.turns.map((turn,i) => <li key={i}>{turn.goal}</li>)}</ol><div className="actions"><button onClick={() => read(item.context_en, true)}>🔊 状況を読む</button><button onClick={() => copy(item.chatgpt_prompt)}>🎙 会議練習をコピー</button></div></article>)}</>; }
function ViewTitle({ title, text }: { title: string; text: string }) { return <section className="viewTitle"><h2>{title}</h2><p>{text}</p></section>; }
function pronunciationPrompt(item: Vocabulary) { return `You are my English teacher for information security meetings.\nPlease practice this term with me: "${item.term_en}".\nJapanese meaning: ${item.meaning_ja}\nExample: ${item.example_en}\nSpeak naturally and clearly. First pronounce the term slowly, then ask me to repeat it. Use it in a realistic security meeting. Correct my English briefly in Japanese when necessary.`; }
function phrasePrompt(item: Phrase) { return `You are my English teacher for information security meetings.\nPlease practice this phrase with me: "${item.sentence_en}".\nJapanese meaning: ${item.meaning_ja}\nUse case: ${item.function}\nSpeak naturally and clearly. Ask me to repeat it, then use it in a realistic security meeting. Correct my English briefly in Japanese when necessary.`; }
