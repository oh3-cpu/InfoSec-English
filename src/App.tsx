import { useEffect, useMemo, useRef, useState } from "react";
import promptTemplates from "../content/infosec_english_content_pack/chatgpt_prompt_templates.json";
import DailyCourse from "./DailyCourse";
import { audioKey, commutingAudioKey, meetingAudioKey } from "./audio";
import type { AudioManifest } from "./audio";
import { commutingCourses, commutingNarrations, labels, listening, meetings, phrases, questionTypeLabels, scenarios, vocabulary } from "./content";
import type { Level, MeetingListening, Phrase, Vocabulary } from "./content";
import { addMinutes, dueReviews, loadProgress, normalizeProgress, prioritizedItems, recordResult, recordVocabulary, shuffle, storeKey, todayText } from "./learning";
import type { ItemKind, PlaybackRate, Progress, SessionSummary } from "./learning";
import { findVoice, meetingVoicePool } from "./voices";

type Tab = "home" | "course" | "vocabulary" | "phrases" | "listening" | "roleplay";

export default function App() {
  const [tab, setTab] = useState<Tab>("home");
  const [reviewOnly, setReviewOnly] = useState(false);
  const [progress, setProgress] = useState<Progress>(loadProgress);
  const [notice, setNotice] = useState("");
  const [audioManifest, setAudioManifest] = useState<AudioManifest>({ version: 1, items: {} });
  const [audioStatus, setAudioStatus] = useState<"idle" | "playing" | "paused" | "completed">("idle");
  const [audioTitle, setAudioTitle] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playbackGeneration = useRef(0);
  const preloadedAudio = useRef(new Map<string, HTMLAudioElement>());
  const noticeTimer = useRef<number | null>(null);

  const showNotice = (message: string, duration = 2200) => {
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    setNotice(message);
    noticeTimer.current = window.setTimeout(() => setNotice(""), duration);
  };

  useEffect(() => { localStorage.setItem(storeKey, JSON.stringify(progress)); }, [progress]);
  useEffect(() => {
    fetch("./audio/manifest.json", { cache: "no-store" })
      .then(response => response.ok ? response.json() as Promise<AudioManifest> : Promise.reject(new Error("manifest unavailable")))
      .then(manifest => setAudioManifest(manifest))
      .catch(() => setAudioManifest({ version: 1, items: {} }));
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => setProgress(current => addMinutes(current)), 60000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => () => { if (noticeTimer.current) window.clearTimeout(noticeTimer.current); }, []);

  const stopAudio = () => {
    playbackGeneration.current += 1;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setAudioStatus("idle");
    setAudioTitle("");
  };

  const preloadAudio = (key?: string) => {
    if (!key) return;
    const path = audioManifest.items[key];
    if (!path || preloadedAudio.current.has(key)) return;
    const audio = new Audio(new URL(path, document.baseURI).href);
    audio.preload = "auto";
    preloadedAudio.current.set(key, audio);
    audio.load();
  };

  const preloadAdjacent = (key?: string) => {
    if (!key) return;
    const keys = Object.keys(audioManifest.items);
    const index = keys.indexOf(key);
    if (index >= 0) preloadAudio(keys[index + 1]);
  };

  const speakWithBrowser = (text: string, onEnded?: () => void) => {
    if (!("speechSynthesis" in window)) return showNotice("このブラウザでは読み上げを利用できません。");
    const utterance = new SpeechSynthesisUtterance(text);
    const selectedVoice = findVoice(window.speechSynthesis.getVoices(), progress.preferredVoice);
    if (selectedVoice) utterance.voice = selectedVoice;
    utterance.lang = selectedVoice?.lang || "en-US";
    utterance.rate = progress.playbackRate;
    utterance.onstart = () => setAudioStatus("playing");
    utterance.onend = () => { setAudioStatus("completed"); onEnded?.(); };
    utterance.onerror = () => setAudioStatus("idle");
    setAudioTitle(text.split(".")[0]);
    window.speechSynthesis.speak(utterance);
    showNotice(`${selectedVoice?.name || "端末の自動音声"}・${progress.playbackRate}倍`, 1800);
  };

  const read = (text: string, key?: string, onEnded?: () => void) => {
    window.speechSynthesis.cancel();
    stopAudio();
    const generation = playbackGeneration.current;
    const complete = () => { if (playbackGeneration.current === generation) onEnded?.(); };
    const audioPath = key ? audioManifest.items[key] : undefined;
    if (audioPath && key) {
      preloadAdjacent(key);
      const audio = preloadedAudio.current.get(key) ?? new Audio(new URL(audioPath, document.baseURI).href);
      audio.playbackRate = progress.playbackRate;
      audio.onplay = () => setAudioStatus("playing");
      audio.onpause = () => { if (!audio.ended) setAudioStatus("paused"); };
      audio.onended = () => { if (audioRef.current === audio) audioRef.current = null; setAudioStatus("completed"); complete(); };
      audio.onerror = () => { if (audioRef.current === audio) audioRef.current = null; setAudioStatus("idle"); speakWithBrowser(text, complete); };
      audioRef.current = audio;
      setAudioTitle(text.split(".")[0]);
      void audio.play().then(() => showNotice(`自然音声MP3・${progress.playbackRate}倍`, 1800)).catch(() => { audioRef.current = null; speakWithBrowser(text, complete); });
      return;
    }
    speakWithBrowser(text, complete);
  };

  const readMeeting = (dialogue: MeetingListening["dialogue"], meetingId?: string, lineIndex?: number) => {
    window.speechSynthesis.cancel();
    stopAudio();
    const requestedPaths = meetingId ? (lineIndex === undefined ? dialogue.map((_, index) => audioManifest.items[meetingAudioKey(meetingId, index)]) : [audioManifest.items[meetingAudioKey(meetingId, lineIndex)]]) : [];
    const audioPaths = requestedPaths.filter((path): path is string => Boolean(path));
    if (audioPaths.length === dialogue.length) {
      let index = 0;
      const playNext = () => {
        if (index >= audioPaths.length) { audioRef.current = null; return; }
        const currentPath = audioPaths[index];
        if (!currentPath) return;
        const audio = new Audio(new URL(currentPath, document.baseURI).href);
        audio.preload = "auto";
        if (index + 1 < audioPaths.length) { const nextAudio = new Audio(new URL(audioPaths[index + 1], document.baseURI).href); nextAudio.preload = "auto"; nextAudio.load(); }
        audio.playbackRate = progress.playbackRate;
        audioRef.current = audio;
        audio.onplay = () => setAudioStatus("playing");
        audio.onpause = () => { if (!audio.ended) setAudioStatus("paused"); };
        audio.onended = () => { index += 1; if (index >= audioPaths.length) setAudioStatus("completed"); playNext(); };
        audio.onerror = () => { stopAudio(); speakMeetingWithBrowser(dialogue); };
        void audio.play().catch(() => { stopAudio(); speakMeetingWithBrowser(dialogue); });
      };
      playNext();
      setAudioTitle("会議全体");
      showNotice(`会議の自然音声MP3・${progress.playbackRate}倍`, 5000);
      return;
    }
    speakMeetingWithBrowser(dialogue);
  };

  const speakMeetingWithBrowser = (dialogue: MeetingListening["dialogue"]) => {
    if (!("speechSynthesis" in window)) return showNotice("自然音声MP3が未生成のため、端末音声を利用できません。");
    const speakers = [...new Set(dialogue.map(line => line.speaker))];
    const voicePool = meetingVoicePool(window.speechSynthesis.getVoices(), progress.preferredVoice);
    dialogue.forEach((line, index) => {
      const utterance = new SpeechSynthesisUtterance(line.sentence_en);
      const speakerIndex = speakers.indexOf(line.speaker);
      const speakerVoice = voicePool.length ? voicePool[speakerIndex % voicePool.length] : undefined;
      if (speakerVoice) utterance.voice = speakerVoice;
      utterance.lang = speakerVoice?.lang || "en-US";
      utterance.rate = progress.playbackRate;
      utterance.pitch = speakerVoice ? 1 : speakerIndex % 2 === 0 ? 1.03 : 0.94;
      if (index === dialogue.length - 1) utterance.onend = () => setNotice("");
      window.speechSynthesis.speak(utterance);
    });
    showNotice(`会議全体を${progress.playbackRate}倍で読み上げています`, 5000);
  };

  const stopReading = () => {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    stopAudio();
    showNotice("読み上げを停止しました", 1200);
  };

  const pauseAudio = () => { if (audioRef.current) audioRef.current.pause(); else if ("speechSynthesis" in window) window.speechSynthesis.pause(); setAudioStatus("paused"); };
  const resumeAudio = () => { if (audioRef.current) void audioRef.current.play(); else if ("speechSynthesis" in window) window.speechSynthesis.resume(); setAudioStatus("playing"); };

  const navigate = (next: Tab) => {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    stopAudio();
    if (next !== "course") setReviewOnly(false);
    setTab(next);
  };

  const startReview = () => { setReviewOnly(true); setTab("course"); };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showNotice("ChatGPT用プロンプトをコピーしました");
    } catch {
      showNotice("コピーできませんでした。文章を長押ししてコピーしてください。");
    }
  };

  const markVocabulary = (id: string, remembered: boolean) => setProgress(current => recordVocabulary(current, id, remembered));
  const markAnswer = (kind: ItemKind, id: string, correct: boolean) => setProgress(current => recordResult(current, kind, id, correct));
  const setRate = (rate: PlaybackRate) => setProgress(current => ({ ...current, playbackRate: rate }));
  const setCourseLevel = (courseLevel: Level) => setProgress(current => ({ ...current, courseLevel }));
  const finishCourse = (lastSession: SessionSummary) => setProgress(current => ({ ...current, lastSession, lastDate: todayText() }));

  const exportProgress = () => {
    const body = JSON.stringify({ app: "InfoSec English Trainer", version: 3, exportedAt: new Date().toISOString(), progress }, null, 2);
    const url = URL.createObjectURL(new Blob([body], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `infosec-english-backup-${todayText()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    showNotice("学習記録をJSONで保存しました");
  };

  const importProgress = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as { progress?: unknown };
      const restored = normalizeProgress(parsed?.progress ?? parsed);
      if (!window.confirm("現在の学習記録を、選択したバックアップで置き換えますか？")) return;
      setProgress(restored);
      showNotice("学習記録を復元しました");
    } catch {
      showNotice("JSONを読み込めませんでした。バックアップファイルを確認してください。");
    }
  };

  const content = tab === "home" ? <Dashboard progress={progress} onNavigate={navigate} onReview={startReview} copy={copy} exportProgress={exportProgress} importProgress={importProgress} />
    : tab === "course" ? <DailyCourse key={reviewOnly ? "review" : "course"} reviewOnly={reviewOnly} progress={progress} read={read} readMeeting={readMeeting} onVocabulary={markVocabulary} onAnswer={markAnswer} onLevel={setCourseLevel} onFinish={finishCourse} onHome={() => navigate("home")} />
    : tab === "vocabulary" ? <VocabularyView progress={progress} onResult={markVocabulary} copy={copy} read={read} />
    : tab === "phrases" ? <PhrasesView progress={progress} onAnswer={markAnswer} copy={copy} read={read} readMeeting={readMeeting} stopReading={stopReading} />
    : tab === "listening" ? <ListeningView progress={progress} onAnswer={markAnswer} copy={copy} read={read} stopReading={stopReading} />
    : <RoleplayView copy={copy} read={read} />;

  return <main className="app">
    <header><div><p className="eyebrow">3か月の情報セキュリティ英語</p><h1>InfoSec English Trainer</h1></div><span className="shield">✦</span></header>
    <SpeedControl rate={progress.playbackRate} onChange={setRate} />
    <AudioStatusBar status={audioStatus} title={audioTitle} onPause={pauseAudio} onResume={resumeAudio} onStop={stopReading} />
    {notice && <div className="toast" role="status">{notice}</div>}
    <section className="content">{content}</section>
    <nav aria-label="メインメニュー">{([[
      "home", "ホーム", "⌂"], ["vocabulary", "単語", "Aa"], ["phrases", "会議文", "☷"], ["listening", "聞き取り", "◉"], ["roleplay", "会議練習", "♧"]] as [Tab, string, string][]).map(([id, label, icon]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => navigate(id)}><b>{icon}</b><span>{label}</span></button>)}</nav>
  </main>;
}

function AudioStatusBar({ status, title, onPause, onResume, onStop }: { status: "idle" | "playing" | "paused" | "completed"; title: string; onPause: () => void; onResume: () => void; onStop: () => void }) {
  if (status === "idle") return null;
  const label = status === "playing" ? "再生中" : status === "paused" ? "一時停止" : "完了";
  return <div className="audioStatusBar" role="status"><span>🎧 {label}{title ? `：${title}` : ""}</span><div>{status === "playing" ? <button onClick={onPause}>⏸ 一時停止</button> : status === "paused" ? <button onClick={onResume}>▶ 再開</button> : null}<button onClick={onStop}>■ 停止</button></div></div>;
}

function SpeedControl({ rate, onChange }: { rate: PlaybackRate; onChange: (rate: PlaybackRate) => void }) {
  return <div className="speedBar" aria-label="音声速度"><span>🔊 音声速度</span>{([0.7, 0.85, 1] as PlaybackRate[]).map(value => <button key={value} className={rate === value ? "selected" : ""} onClick={() => onChange(value)}>{value}倍</button>)}</div>;
}

function Dashboard({ progress, onNavigate, onReview, copy, exportProgress, importProgress }: { progress: Progress; onNavigate: (tab: Tab) => void; onReview: () => void; copy: (text: string) => void; exportProgress: () => void; importProgress: (file: File) => void }) {
  const dailyPrompt = (promptTemplates as { id: string; prompt_en: string }[]).find(item => item.id === "prompt_daily_drill")?.prompt_en || "";
  const due = dueReviews(progress).length;
  const last = progress.lastSession;
  const lastAccuracy = last?.attempts ? Math.round(last.correct / last.attempts * 100) : 0;
  return <>
    <section className="hero dailyHero"><p>今日の30分コース</p><h2>単語15語 → 短文5問 → Listening 3問 → 会議1本</h2><p className="heroText">復習期限の来た問題から優先し、次の問題は自動で読み上げます。</p><button onClick={() => onNavigate("course")}>30分コースを始める →</button></section>
    <div className="stats"><Stat label="学習時間" value={`${progress.minutes}分`} /><Stat label="覚えた単語" value={`${progress.known.length}語`} /><Stat label="苦手項目" value={`${progress.difficult.length}件`} /><Stat label="今日の復習" value={`${due}件`} /></div>
    {last && <section className="card"><h2>前回の学習結果</h2><div className="summaryGrid"><Stat label="正解率" value={`${lastAccuracy}%`} /><Stat label="覚えた単語" value={`${last.knownWords}語`} /><Stat label="苦手項目" value={`${last.difficultItems}件`} /><Stat label="学習時間" value={`${last.elapsedMinutes}分`} /></div><p className="recommendation">{last.recommendation}</p></section>}
    <section className="card"><h2>3か月の進捗</h2><div className="progress"><i style={{ width: `${Math.min(100, Math.round(progress.known.length / vocabulary.length * 100))}%` }} /></div><p>{progress.known.length} / {vocabulary.length} 語を記録済み。間違えた問題は翌日・3日後・7日後に優先出題されます。</p></section>
    <WeeklyProgress progress={progress} />
    <section className="card"><h2>個別に練習</h2><div className="quick"><button onClick={() => onNavigate("vocabulary")}>単語を1語ずつ</button><button onClick={() => onNavigate("phrases")}>会議全体リスニング</button><button onClick={() => onNavigate("listening")}>🚆 通勤Listening 5コース</button><button className="reviewButton" disabled={!due} onClick={onReview}>今日の復習（{due}件）</button><button onClick={() => copy(dailyPrompt)}>🎙 ChatGPT練習をコピー</button></div></section>
    <section className="card backupCard"><h2>学習記録のバックアップ</h2><p>JSONを保存しておくと、iPhoneを変更したあとも同じ記録を読み込めます。</p><div className="actions"><button onClick={exportProgress}>↓ JSONを保存</button><label className="fileButton">↑ JSONを読み込む<input type="file" accept="application/json,.json" onChange={event => { const file = event.target.files?.[0]; if (file) void importProgress(file); event.currentTarget.value = ""; }} /></label></div></section>
  </>;
}

function WeeklyProgress({ progress }: { progress: Progress }) {
  const days = Array.from({ length: 7 }, (_, index) => { const date = new Date(); date.setHours(12, 0, 0, 0); date.setDate(date.getDate() - (6 - index)); return date.toISOString().slice(0, 10); });
  const stats = days.map(date => progress.dailyStats.find(item => item.date === date) ?? { date, attempts: 0, correct: 0, minutes: 0 });
  const totalAttempts = stats.reduce((sum, item) => sum + item.attempts, 0);
  const totalCorrect = stats.reduce((sum, item) => sum + item.correct, 0);
  const totalMinutes = stats.reduce((sum, item) => sum + item.minutes, 0);
  const streak = (() => { let count = 0; for (let index = stats.length - 1; index >= 0 && (stats[index].attempts > 0 || stats[index].minutes > 0); index -= 1) count += 1; return count; })();
  const maxMinutes = Math.max(1, ...stats.map(item => item.minutes));
  return <section className="card weeklyCard"><div className="row"><h2>今週の学習状況</h2><span className="small">連続 {streak}日</span></div><div className="summaryGrid"><Stat label="正解率" value={`${totalAttempts ? Math.round(totalCorrect / totalAttempts * 100) : 0}%`} /><Stat label="学習時間" value={`${totalMinutes}分`} /><Stat label="苦手項目" value={`${progress.difficult.length}件`} /></div><div className="weeklyChart" aria-label="直近7日間の学習時間">{stats.map((item, index) => <div className="chartDay" key={item.date}><i style={{ height: `${Math.max(4, Math.round(item.minutes / maxMinutes * 70))}px` }} /><span>{["日", "月", "火", "水", "木", "金", "土"][new Date(`${item.date}T12:00:00`).getDay()]}</span></div>)}</div></section>;
}

function VocabularyView({ progress, onResult, copy, read }: { progress: Progress; onResult: (id: string, remembered: boolean) => void; copy: (text: string) => void; read: (text: string, key?: string) => void }) {
  const [mode, setMode] = useState<"study" | "list">("study");
  const [level, setLevel] = useState<"all" | Level>("all");
  const [queue, setQueue] = useState<Vocabulary[]>([]);
  const [position, setPosition] = useState(0);
  const [query, setQuery] = useState("");
  const item = queue[position];
  const available = vocabulary.filter(word => level === "all" || word.level === level);
  const listItems = useMemo(() => vocabulary.filter(word => (!query || `${word.term_en} ${word.meaning_ja} ${word.category_ja}`.toLowerCase().includes(query.toLowerCase())) && (level === "all" || word.level === level)), [query, level]);

  const start = () => {
    const next = prioritizedItems(available, progress, "vocabulary");
    setQueue(next); setPosition(0);
    if (next[0]) read(`${next[0].term_en}. ${next[0].example_en}`, audioKey("vocabulary", next[0].id));
  };
  const decide = (remembered: boolean) => {
    if (!item) return;
    onResult(item.id, remembered);
    let nextQueue = queue;
    let nextPosition = position + 1;
    if (nextPosition >= queue.length) { nextQueue = prioritizedItems(available, progress, "vocabulary"); nextPosition = 0; setQueue(nextQueue); }
    setPosition(nextPosition);
    const next = nextQueue[nextPosition];
    if (next) read(`${next.term_en}. ${next.example_en}`, audioKey("vocabulary", next.id));
  };

  return <><ViewTitle title="専門用語" text="ランダムに1語ずつ出題。復習期限の来た苦手語を先に表示します。" />
    <div className="modeSwitch"><button className={mode === "study" ? "selected" : ""} onClick={() => setMode("study")}>1語ずつ学習</button><button className={mode === "list" ? "selected" : ""} onClick={() => setMode("list")}>一覧・検索</button></div>
    {mode === "study" ? !item ? <section className="card sessionStart"><span className="tag">ランダム＋復習優先</span><h2>1語ずつ、音声と例文で覚える</h2><p className="meaning">開始時と「覚えた／まだ苦手」を選んだ直後に、次の単語を読み上げます。</p><LevelSelect value={level} onChange={setLevel} all /><p className="reviewHint">今日が期限の単語：<b>{dueReviews(progress, "vocabulary").length}語</b></p><button className="primaryButton" onClick={start}>▶ 学習を開始</button></section>
      : <article className="card focusCard"><div className="row"><span className="tag">{item.category_ja} · {labels[item.level]}</span><span className="counter">{position + 1} / {queue.length}</span></div><h2 className="focusWord">{item.term_en}</h2><p className="meaning">{item.meaning_ja}</p><p className="example">{item.example_en}</p><div className="actions"><button onClick={() => read(`${item.term_en}. ${item.example_en}`, audioKey("vocabulary", item.id))}>🔊 もう一度</button><button onClick={() => copy(pronunciationPrompt(item))}>🎙 ChatGPTで練習</button></div><div className="courseDecision"><button className="warning" onClick={() => decide(false)}>まだ苦手</button><button className="successButton" onClick={() => decide(true)}>✓ 覚えた</button></div><p className="small">選ぶと次の単語をすぐ読み上げます。</p><button className="textButton" onClick={() => setQueue([])}>難易度を変更する</button></article>
      : <><div className="filters"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="単語・意味・分野を検索" /><LevelSelect value={level} onChange={setLevel} all /></div><p className="result">{listItems.length}件</p>{listItems.map(word => <article className="card item" key={word.id}><span className="tag">{word.category_ja} · {labels[word.level]}</span><h2>{word.term_en}</h2><p className="meaning">{word.meaning_ja}</p><p className="example">{word.example_en}</p><div className="actions"><button onClick={() => read(`${word.term_en}. ${word.example_en}`, audioKey("vocabulary", word.id))}>🔊 読み上げ</button><button onClick={() => onResult(word.id, !progress.known.includes(word.id))}>{progress.known.includes(word.id) ? "✓ 覚えた" : "覚えたにする"}</button></div></article>)}</>}
  </>;
}

function PhrasesView({ progress, onAnswer, copy, read, readMeeting, stopReading }: { progress: Progress; onAnswer: (kind: ItemKind, id: string, correct: boolean) => void; copy: (text: string) => void; read: (text: string, key?: string) => void; readMeeting: (dialogue: MeetingListening["dialogue"], meetingId?: string, lineIndex?: number) => void; stopReading: () => void }) {
  const [mode, setMode] = useState<"study" | "list" | "meeting">("study");
  const [group, setGroup] = useState("all");
  const groups = [...new Set(phrases.map(item => item.function))];
  const items = phrases.filter(item => group === "all" || item.function === group);
  return <><ViewTitle title="会議フレーズ" text="場面別の短文をランダムに1問ずつ、または一覧で練習できます。会議全体リスニングも選べます。" /><div className="modeSwitch"><button className={mode === "study" ? "selected" : ""} onClick={() => setMode("study")}>1問ずつ学習</button><button className={mode === "list" ? "selected" : ""} onClick={() => setMode("list")}>一覧・検索</button><button className={mode === "meeting" ? "selected" : ""} onClick={() => setMode("meeting")}>会議全体</button></div>
    {mode === "meeting" ? <MeetingListeningView progress={progress} onAnswer={onAnswer} readMeeting={readMeeting} stopReading={stopReading} /> : mode === "study" ? <PhraseStudyView progress={progress} onAnswer={onAnswer} read={read} copy={copy} /> : <><div className="chips"><button className={group === "all" ? "selected" : ""} onClick={() => setGroup("all")}>すべて</button>{groups.map(name => <button key={name} className={group === name ? "selected" : ""} onClick={() => setGroup(name)}>{name}</button>)}</div>{items.map(item => <article className="card item" key={item.id}><span className="tag">{item.function} · {labels[item.level]}</span><h2>{item.sentence_en}</h2><p className="meaning">{item.meaning_ja}</p><div className="actions"><button onClick={() => read(item.sentence_en, audioKey("phrase", item.id))}>🔊 読み上げ</button><button onClick={() => copy(phrasePrompt(item))}>🎙 ChatGPTで練習</button></div></article>)}</>}
  </>;
}

function PhraseStudyView({ progress, onAnswer, read, copy }: { progress: Progress; onAnswer: (kind: ItemKind, id: string, correct: boolean) => void; read: (text: string, key?: string) => void; copy: (text: string) => void }) {
  const [level, setLevel] = useState<"all" | Level>("all");
  const [group, setGroup] = useState("all");
  const [queue, setQueue] = useState<Phrase[]>([]);
  const [position, setPosition] = useState(0);
  const [answer, setAnswer] = useState<string | null>(null);
  const item = queue[position];
  const available = phrases.filter(entry => (level === "all" || entry.level === level) && (group === "all" || entry.function === group));
  const groups = [...new Set(phrases.map(entry => entry.function))];
  const start = () => { const next = prioritizedItems(available, progress, "phrase"); setQueue(next); setPosition(0); setAnswer(null); if (next[0]) read(next[0].sentence_en, audioKey("phrase", next[0].id)); };
  const next = () => { const nextPosition = position + 1; const nextQueue = nextPosition < queue.length ? queue : prioritizedItems(available, progress, "phrase"); const actualPosition = nextPosition < nextQueue.length ? nextPosition : 0; setQueue(nextQueue); setPosition(actualPosition); setAnswer(null); const nextItem = nextQueue[actualPosition]; if (nextItem) read(nextItem.sentence_en, audioKey("phrase", nextItem.id)); };
  const choose = (choice: string) => { if (!item || answer) return; setAnswer(choice); onAnswer("phrase", item.id, choice === item.meaning_ja); };
  const choices = item ? shuffle([item.meaning_ja, ...shuffle(phrases.filter(other => other.id !== item.id).map(other => other.meaning_ja)).slice(0, 2)]) : [];
  if (!item) return <section className="card sessionStart"><span className="tag">ランダム＋復習優先</span><h2>会議フレーズを1問ずつ練習</h2><p className="meaning">次へ進むと、次のフレーズをすぐ読み上げます。間違えたフレーズは復習期限順に優先します。</p><div className="studyFilters"><LevelSelect value={level} onChange={setLevel} all /><label className="fieldLabel">場面<select value={group} onChange={event => setGroup(event.target.value)}><option value="all">すべての場面</option>{groups.map(name => <option key={name} value={name}>{name}</option>)}</select></label></div><p className="reviewHint">今日が期限の会議フレーズ：<b>{dueReviews(progress, "phrase").length}件</b></p><button className="primaryButton" onClick={start}>▶ フレーズ学習を開始</button></section>;
  return <article className="card focusCard"><div className="row"><span className="tag">{item.function} · {labels[item.level]}</span><span className="counter">{position + 1} / {queue.length}</span></div><div className="shownSentence"><h2>{item.sentence_en}</h2><p>{item.meaning_ja}</p></div><div className="actions"><button onClick={() => read(item.sentence_en, audioKey("phrase", item.id))}>🔊 もう一度</button><button onClick={() => copy(phrasePrompt(item))}>🎙 ChatGPTで練習</button></div><div className="choices">{choices.map(choice => <button key={choice} disabled={!!answer} className={answer ? choice === item.meaning_ja ? "correct" : choice === answer ? "incorrect" : "" : ""} onClick={() => choose(choice)}>{choice}</button>)}</div>{answer && <div className="answer"><b>{answer === item.meaning_ja ? "正解！" : "もう一度確認しましょう。"}</b><p>正解：{item.meaning_ja}</p><p className="explanation">重要表現：{item.sentence_en}</p></div>}{answer && <button className="nextButton" onClick={next}>次のフレーズへ → <small>すぐ読み上げます</small></button>}</article>;
}

function MeetingListeningView({ progress, onAnswer, readMeeting, stopReading }: { progress: Progress; onAnswer: (kind: ItemKind, id: string, correct: boolean) => void; readMeeting: (dialogue: MeetingListening["dialogue"], meetingId?: string, lineIndex?: number) => void; stopReading: () => void }) {
  const [level, setLevel] = useState<"all" | Level>("all");
  const [queue, setQueue] = useState<MeetingListening[]>([]);
  const [position, setPosition] = useState(0);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answer, setAnswer] = useState<string | null>(null);
  const [choices, setChoices] = useState<string[]>([]);
  const [showTranscript, setShowTranscript] = useState(false);
  const [stageMode, setStageMode] = useState<"full" | "line" | "caption">("full");
  const meeting = queue[position];
  const question = meeting?.questions[questionIndex];
  const available = meetings.filter(item => level === "all" || item.level === level);
  const start = () => {
    const next = prioritizedItems(available, progress, "meeting");
    setQueue(next); setPosition(0); setQuestionIndex(0); setAnswer(null); setShowTranscript(false);
    if (next[0]) { setChoices(shuffle(next[0].questions[0].choices_ja)); readMeeting(next[0].dialogue, next[0].id); }
  };
  const choose = (choice: string) => {
    if (!meeting || !question || answer) return;
    setAnswer(choice);
    onAnswer("meeting", `${meeting.id}:${question.question_type}`, choice === question.correct_ja);
  };
  const next = () => {
    if (!meeting) return;
    if (questionIndex + 1 < meeting.questions.length) {
      const index = questionIndex + 1; setQuestionIndex(index); setAnswer(null); setChoices(shuffle(meeting.questions[index].choices_ja)); return;
    }
    let nextPosition = position + 1;
    let nextQueue = queue;
    if (nextPosition >= queue.length) { nextQueue = prioritizedItems(available, progress, "meeting"); nextPosition = 0; setQueue(nextQueue); }
    const nextMeeting = nextQueue[nextPosition];
    setPosition(nextPosition); setQuestionIndex(0); setAnswer(null); setShowTranscript(false);
    if (nextMeeting) { setChoices(shuffle(nextMeeting.questions[0].choices_ja)); readMeeting(nextMeeting.dialogue, nextMeeting.id); }
  };
  if (!meeting || !question) return <section className="card sessionStart"><span className="tag">会議全体＋3問</span><h2>会議を最後まで聞いて要点を整理</h2><p className="meaning">1本の会議につき、現在の状況・決定事項・担当者／期限を別々に確認します。</p><LevelSelect value={level} onChange={setLevel} all /><p className="reviewHint">今日が期限の会議問題：<b>{dueReviews(progress, "meeting").length}件</b></p><button className="primaryButton" onClick={start}>▶ ランダムな会議を開始</button></section>;
  return <article className="card meetingCard"><div className="row"><span className="tag">{labels[meeting.level]} · 会議全体</span><span className="counter">{position + 1} / {queue.length}</span></div><h2>{meeting.title_ja}</h2><p className="meaning">{meeting.context_ja}</p><div className="stageTabs"><button className={stageMode === "full" ? "selected" : ""} onClick={() => { setStageMode("full"); readMeeting(meeting.dialogue, meeting.id); }}>① 会議全体</button><button className={stageMode === "line" ? "selected" : ""} onClick={() => setStageMode("line")}>② 1発言ずつ</button><button className={stageMode === "caption" ? "selected" : ""} onClick={() => { setStageMode("caption"); setShowTranscript(true); }}>③ 字幕付き</button></div><div className="actions"><button onClick={() => readMeeting(meeting.dialogue, meeting.id)}>🔊 全体をもう一度</button><button className="warning" onClick={stopReading}>■ 停止</button></div>
    {stageMode === "line" ? <div className="transcript">{meeting.dialogue.map((line, index) => <div className="dialogueLine" key={`${line.speaker}-${index}`}><b>{line.speaker}</b><p>{line.sentence_en}</p><button onClick={() => readMeeting([line], meeting.id, index)}>▶ この発言を聞く</button></div>)}</div> : showTranscript ? <div className="transcript">{meeting.dialogue.map((line, index) => <div className="dialogueLine" key={`${line.speaker}-${index}`}><b>{line.speaker}</b><p>{line.sentence_en}</p></div>)}</div> : <div className="audioOnly"><span>🎧</span><p>英文を見ずに、会議全体の要点を聞き取ってください。</p></div>}
    <section className="meetingQuestion"><span className="questionType">{questionTypeLabels[question.question_type]} · {questionIndex + 1}/3</span><h3>{question.question_ja}</h3><div className="choices">{choices.map(choice => <button key={choice} disabled={!!answer} className={answer ? (choice === question.correct_ja ? "correct" : choice === answer ? "incorrect" : "") : ""} onClick={() => choose(choice)}>{choice}</button>)}</div>{answer && <div className="answer"><b>{answer === question.correct_ja ? "正解！" : "もう一度確認しましょう。"}</b><p>正解：{question.correct_ja}</p></div>}</section>
    {answer && <button className="nextButton" onClick={next}>{questionIndex === 2 ? "次の会議へ" : "次の確認問題へ"} → <small>{questionIndex === 2 ? "次の会議をすぐ読み上げます" : "同じ会議について答えます"}</small></button>}<button className="textButton" onClick={() => { stopReading(); setQueue([]); }}>難易度を変更する</button>
  </article>;
}

function ListeningView({ progress, onAnswer, copy, read, stopReading }: { progress: Progress; onAnswer: (kind: ItemKind, id: string, correct: boolean) => void; copy: (text: string) => void; read: (text: string, key?: string, onEnded?: () => void) => void; stopReading: () => void }) {
  const [mode, setMode] = useState<"commute" | "all">("commute");
  const changeMode = (next: "commute" | "all") => { stopReading(); setMode(next); };
  return <><ViewTitle title="Listening" text="通勤中は約4分の長文を連続・繰り返し再生。あとで40問の理解度チェックもできます。" /><div className="modeSwitch"><button className={mode === "commute" ? "selected" : ""} onClick={() => changeMode("commute")}>🚆 通勤聞き流し</button><button className={mode === "all" ? "selected" : ""} onClick={() => changeMode("all")}>理解度チェック</button></div>{mode === "commute" ? <CommutingListeningView read={read} stopReading={stopReading} /> : <GeneralListeningView progress={progress} onAnswer={onAnswer} copy={copy} read={read} />}</>;
}

function CommutingListeningView({ read, stopReading }: { read: (text: string, key?: string, onEnded?: () => void) => void; stopReading: () => void }) {
  type PlayMode = "once" | "repeat" | "continuous";
  const [courseId, setCourseId] = useState(commutingCourses[0]?.id ?? "");
  const [playMode, setPlayMode] = useState<PlayMode>("continuous");
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showEnglish, setShowEnglish] = useState(false);
  const course = commutingCourses.find(entry => entry.id === courseId) ?? commutingCourses[0];
  const narration = commutingNarrations.find(entry => entry.course_id === courseId) ?? commutingNarrations[0];
  const playTrack = (index: number, mode = playMode) => {
    const target = commutingNarrations[index];
    if (!target) return;
    setCourseId(target.course_id);
    setPlayingIndex(index);
    setShowDetails(false);
    setShowEnglish(false);
    read(target.narration_en, commutingAudioKey(target.id), () => {
      if (mode === "repeat") playTrack(index, mode);
      if (mode === "continuous") playTrack((index + 1) % commutingNarrations.length, mode);
    });
  };
  const selectedIndex = Math.max(0, commutingNarrations.findIndex(entry => entry.course_id === courseId));
  const currentNarration = playingIndex === null ? narration : commutingNarrations[playingIndex];
  const stopPlayer = () => { stopReading(); setPlayingIndex(null); };
  if (!course) return null;
  return <section className="card sessionStart commuteStart"><div className="row"><span className="tag">ハンズフリー長文Listening</span><span className="counter">全5本・1周約15〜20分</span></div><h2>{playingIndex === null ? "開始するコースを選択" : currentNarration?.title_ja}</h2>{playingIndex === null ? <><p className="meaning">1本約3分です。5コース連続ループまたは同じコースの繰り返しなら、再生開始後の操作は不要です。</p><div className="commuteCourseGrid">{commutingCourses.map((entry, index) => <button key={entry.id} className={courseId === entry.id ? "selected" : ""} onClick={() => setCourseId(entry.id)}><span>{index + 1}</span><strong>{entry.title_ja}</strong><small>{entry.description_ja}</small><em>長文 約{commutingNarrations.find(item => item.course_id === entry.id)?.duration_min ?? 3}分</em></button>)}</div><div className="selectedCourse"><b>{narration?.title_ja}</b><span>{narration?.summary_ja}</span></div><div className="playModeSelect" aria-label="再生方法"><button className={playMode === "once" ? "selected" : ""} onClick={() => setPlayMode("once")}>1回だけ</button><button className={playMode === "repeat" ? "selected" : ""} onClick={() => setPlayMode("repeat")}>同じ内容を繰り返す</button><button className={playMode === "continuous" ? "selected" : ""} onClick={() => setPlayMode("continuous")}>5コース連続ループ</button></div><button className="primaryButton" onClick={() => playTrack(selectedIndex)}>▶ ハンズフリー再生を開始</button><p className="small">開始後は上部の「一時停止／再開／停止」だけで操作できます。</p></> : <><div className="audioOnly commuteAudio"><span>🎧</span><p>{playMode === "repeat" ? "このコースを自動で繰り返します。" : playMode === "continuous" ? "終了すると次のコースを自動再生し、5本目の後は1本目へ戻ります。" : "このコースを1回再生します。"}</p></div><div className="handsFreeControls"><button onClick={() => playTrack(playingIndex, playMode)}>↻ 最初から</button><button onClick={() => playTrack((playingIndex + 1) % commutingNarrations.length, playMode)}>次のコースへ</button><button onClick={() => setShowEnglish(value => !value)}>{showEnglish ? "英文を隠す" : "英文を表示"}</button><button onClick={() => setShowDetails(value => !value)}>{showDetails ? "解説を隠す" : "日本語解説"}</button></div>{(showDetails || showEnglish) && currentNarration && <div className="narrationDetails">{showDetails && <><h3>日本語概要</h3><p>{currentNarration.summary_ja}</p><h3>重要表現</h3><ul>{currentNarration.key_points_ja.map(point => <li key={point}>{point}</li>)}</ul></>}{showEnglish && <><h3>English Transcript</h3><p className="narrationEnglish">{currentNarration.narration_en}</p></>}</div>}<button className="textButton" onClick={stopPlayer}>コース選択へ戻る</button></>}</section>;
}

function GeneralListeningView({ progress, onAnswer, copy, read }: { progress: Progress; onAnswer: (kind: ItemKind, id: string, correct: boolean) => void; copy: (text: string) => void; read: (text: string, key?: string) => void }) {
  const [level, setLevel] = useState<"all" | Level>("all");
  const [queue, setQueue] = useState<typeof listening>([]);
  const [position, setPosition] = useState(0);
  const [answer, setAnswer] = useState<string | null>(null);
  const [choices, setChoices] = useState<string[]>([]);
  const [showEnglish, setShowEnglish] = useState(false);
  const item = queue[position];
  const available = listening.filter(entry => level === "all" || entry.level === level);
  const start = () => {
    const next = prioritizedItems(available, progress, "listening");
    setQueue(next); setPosition(0); setAnswer(null); setShowEnglish(false);
    if (next[0]) { setChoices(shuffle(next[0].choices_ja)); read(next[0].sentence_en, audioKey("listening", next[0].id)); }
  };
  const choose = (choice: string) => { if (!item || answer) return; setAnswer(choice); onAnswer("listening", item.id, choice === item.correct_ja); };
  const next = () => {
    let nextPosition = position + 1;
    let nextQueue = queue;
    if (nextPosition >= queue.length) { nextQueue = prioritizedItems(available, progress, "listening"); nextPosition = 0; setQueue(nextQueue); }
    const nextItem = nextQueue[nextPosition]; setPosition(nextPosition); setAnswer(null); setShowEnglish(false);
    if (nextItem) { setChoices(shuffle(nextItem.choices_ja)); read(nextItem.sentence_en, audioKey("listening", nextItem.id)); }
  };
  return <>{!item ? <section className="card sessionStart"><span className="tag">ランダム＋復習優先</span><h2>全教材から1問ずつ聞く</h2><p className="meaning">間違えた問題は翌日・3日後・7日後に優先して再出題します。</p><LevelSelect value={level} onChange={setLevel} all /><p className="reviewHint">今日が期限のListening：<b>{dueReviews(progress, "listening").length}問</b></p><button className="primaryButton" onClick={start}>▶ Listeningを開始</button></section>
    : <article className="card focusCard"><div className="row"><span className="tag">{labels[item.level]} · {item.category}</span><span className="counter">{position + 1} / {queue.length}</span></div><div className={showEnglish ? "shownSentence" : "hiddenSentence"}><h2>{showEnglish ? item.sentence_en : "Listen without reading"}</h2><p>{showEnglish ? "英文を確認してもう一度聞きましょう。" : "音声を聞いて意味を選んでください。"}</p></div><div className="actions"><button onClick={() => read(item.sentence_en, audioKey("listening", item.id))}>🔊 もう一度</button><button onClick={() => setShowEnglish(value => !value)}>{showEnglish ? "英文を隠す" : "英文を表示"}</button><button onClick={() => copy(item.chatgpt_prompt)}>🎙 ChatGPTで聞く</button></div><div className="choices">{choices.map(choice => <button key={choice} disabled={!!answer} className={answer ? (choice === item.correct_ja ? "correct" : choice === answer ? "incorrect" : "") : ""} onClick={() => choose(choice)}>{choice}</button>)}</div>{answer && <div className="answer"><b>{answer === item.correct_ja ? "正解！" : "もう一度確認しましょう。"}</b><p>正解：{item.correct_ja}</p></div>}{answer && <button className="nextButton" onClick={next}>次の問題へ → <small>すぐ読み上げます</small></button>}<button className="textButton" onClick={() => setQueue([])}>難易度を変更する</button></article>}</>;
}

function RoleplayView({ copy, read }: { copy: (text: string) => void; read: (text: string) => void }) {
  return <><ViewTitle title="Role Play" text={`${scenarios.length}種類。プロンプトをコピーしてChatGPTの音声モードで模擬会議を始めます。`} /><div className="callout"><b>使い方</b><p>「会議練習をコピー」→ ChatGPTに貼り付け → 音声モードを開始。APIキーは不要です。</p></div>{scenarios.map(item => <article className="card item" key={item.id}><span className="tag">{labels[item.level]}</span><h2>{item.title_ja}</h2><p className="example">{item.context_en}</p><p className="small">ChatGPT：{item.role_ai} ／ あなた：{item.role_user}</p><ol>{item.turns.map((turn, index) => <li key={index}>{turn.goal}</li>)}</ol><div className="actions"><button onClick={() => read(item.context_en)}>🔊 状況を読む</button><button onClick={() => copy(item.chatgpt_prompt)}>🎙 会議練習をコピー</button></div></article>)}</>;
}

function LevelSelect({ value, onChange, all = false }: { value: "all" | Level; onChange: (level: "all" | Level) => void; all?: boolean }) {
  return <label className="fieldLabel">難易度<select value={value} onChange={event => onChange(event.target.value as "all" | Level)}>{all && <option value="all">すべての難易度</option>}{Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>;
}

function Stat({ label, value }: { label: string; value: string }) { return <div className="stat"><strong>{value}</strong><span>{label}</span></div>; }
function ViewTitle({ title, text }: { title: string; text: string }) { return <section className="viewTitle"><h2>{title}</h2><p>{text}</p></section>; }
function pronunciationPrompt(item: Vocabulary) { return `You are my English teacher for information security meetings.\nPlease practice this term with me: "${item.term_en}".\nJapanese meaning: ${item.meaning_ja}\nExample: ${item.example_en}\nFirst pronounce the term, then ask me to repeat it. Correct me briefly in Japanese.`; }
function phrasePrompt(item: Phrase) { return `You are my English teacher for information security meetings.\nPlease practice this phrase with me: "${item.sentence_en}".\nJapanese meaning: ${item.meaning_ja}\nUse case: ${item.function}\nAsk me to repeat it, then use it in a realistic security meeting.`; }
