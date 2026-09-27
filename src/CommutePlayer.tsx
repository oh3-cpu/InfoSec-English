import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { commutingNarrations } from "./content";
import studyData from "../content/infosec_english_content_pack/commute_study.json";
import type { AudioManifest } from "./audio";
import type { PlaybackRate } from "./learning";
import { courseQueue, formatTime, nextSentence, phaseLabels, seekQueue, sentenceKey, splitSentences, timedQueue } from "./commuteModel";
import type { CommuteMode, CommuteProgress, CommuteSession, SentenceRef } from "./commuteModel";
import { audioUrl, downloadAudio, downloadedSize, removeAudio } from "./offlineAudio";

type Question = { question_ja: string; choices_ja: string[]; correct_ja: string; explanation_ja: string };
const studies = studyData as Record<string, { translation_ja: string; questions: Question[]; theme: string }>;
const byId = new Map(commutingNarrations.map(n => [n.id, n]));
const textOf = (ref: SentenceRef) => splitSentences(byId.get(ref.narrationId)?.narration_en ?? "")[ref.index];
type Props = { manifest: AudioManifest; rate: PlaybackRate; progress: CommuteProgress;
  onChange: (update: (current: CommuteProgress) => CommuteProgress) => void;
  onPlaying: (playing: boolean) => void; onStudySeconds: (seconds: number) => void; stopOtherAudio: () => void };

export default function CommutePlayer(props: Props) {
  const latest = useRef(props); latest.current = props;
  const [selected, setSelected] = useState(props.progress.resume?.queue[props.progress.resume.position]?.narrationId ?? commutingNarrations[0].id);
  const [mode, setMode] = useState<CommuteMode>("continuous");
  const [minutes, setMinutes] = useState(30);
  const [theme, setTheme] = useState("すべて");
  const [session, setSession] = useState<CommuteSession | null>(props.progress.resume);
  const current = useRef(session);
  const [status, setStatus] = useState<"idle" | "loading" | "playing" | "paused" | "completed">("idle");
  const [error, setError] = useState("");
  const [showJapanese, setShowJapanese] = useState(false);
  const [quizId, setQuizId] = useState<string | null>(null);
  const [savedSizes, setSavedSizes] = useState<Record<string, number | null>>({});
  const [downloading, setDownloading] = useState<{ id: string; done: number; total: number } | null>(null);
  const [storageFree, setStorageFree] = useState<number | null>(null);
  const abort = useRef<AbortController | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const sharedAudio = useRef<HTMLAudioElement | null>(null);
  const preload = useRef<HTMLAudioElement | null>(null);
  const generation = useRef(0), lastSave = useRef(0), lastMediaTime = useRef(0);
  const available = commutingNarrations.filter(n => theme === "すべて" || studies[n.id]?.theme === theme);
  const ref = session?.queue[session.position];
  const activeId = ref?.narrationId ?? selected;
  const narration = byId.get(activeId) ?? commutingNarrations[0];
  const sentences = splitSentences(narration.narration_en);
  const changeStatus = (value: typeof status) => { setStatus(value); latest.current.onPlaying(value === "playing"); };
  const checkpoint = (next: CommuteSession, force = false) => {
    current.current = next; setSession(next);
    if (force || Date.now() - lastSave.current > 2000) {
      lastSave.current = Date.now(); latest.current.onChange(value => ({ ...value, resume: next }));
    }
  };
  const stopElement = () => {
    generation.current++;
    if (audio.current) {
      const old = audio.current; audio.current = null;
      old.onended = old.onpause = old.onplaying = old.onwaiting = old.onerror = old.ontimeupdate = old.onloadedmetadata = null;
      old.pause(); old.removeAttribute("src"); old.load();
    }
    if (preload.current) { preload.current.removeAttribute("src"); preload.current.load(); preload.current = null; }
    latest.current.onPlaying(false);
  };
  const info = (entry: SentenceRef) => latest.current.manifest.commutingSegments?.[entry.narrationId]?.[entry.index];
  const durationOf = (entry: SentenceRef) => info(entry)?.duration ?? 1;
  const ready = (id: string) => {
    const texts = splitSentences(byId.get(id)?.narration_en ?? "");
    const segments = props.manifest.commutingSegments?.[id];
    return Boolean(segments && segments.length === texts.length && segments.every((s, i) => s.text === texts[i] && s.duration > 0 && props.manifest.items[s.key]));
  };
  const pathsFor = (id: string) => props.manifest.commutingSegments?.[id]?.map(s => props.manifest.items[s.key]).filter(Boolean) ?? [];
  const load = (next: CommuteSession, autoplay = true) => {
    stopElement(); setError(""); checkpoint(next, true);
    if (next.completed) { changeStatus("completed"); return; }
    const entry = next.queue[next.position];
    const segment = entry && info(entry);
    const path = segment && latest.current.manifest.items[segment.key];
    if (!path || segment?.text !== textOf(entry)) {
      changeStatus("paused"); setError("この教材の同期音声を取得できません。オンラインでアプリを開き直してから再試行してください。"); return;
    }
    const token = generation.current;
    const player = sharedAudio.current ?? new Audio(); sharedAudio.current = player; audio.current = player;
    player.src = audioUrl(path);
    player.preload = "auto"; player.playbackRate = latest.current.rate;
    lastMediaTime.current = next.offset;
    const live = () => token === generation.current && audio.current === player;
    const report = () => {
      if (!live() || !current.current) return;
      const delta = Math.max(0, player.currentTime - lastMediaTime.current);
      lastMediaTime.current = player.currentTime;
      if (delta > 0) latest.current.onStudySeconds(delta / player.playbackRate);
      checkpoint({ ...current.current, offset: player.currentTime, listenedSeconds: current.current.listenedSeconds + delta / player.playbackRate });
    };
    player.onloadedmetadata = () => {
      if (!live()) return;
      const offset = Math.max(0, Math.min(next.offset, Math.max(0, player.duration - .05)));
      player.currentTime = offset; lastMediaTime.current = offset;
      if (current.current) checkpoint({ ...current.current, offset }, true);
    };
    player.onplaying = () => { if (live()) changeStatus("playing"); };
    player.onwaiting = () => { if (live()) changeStatus("loading"); };
    player.onpause = () => { if (live() && !player.ended) { report(); changeStatus("paused"); if (current.current) checkpoint(current.current, true); } };
    player.ontimeupdate = report;
    player.onended = () => {
      if (!live() || !current.current) return;
      report();
      const before = current.current;
      const after = nextSentence(before);
      const reviewTranslation = before.mode === "staged" && before.phase === 1 && after.phase === 2;
      load(after, !reviewTranslation);
    };
    const failed = () => { if (live()) { changeStatus("paused"); setError("音声を再生できません。通信または保存状態を確認し、「再開」を押してください。"); } };
    player.onerror = failed;
    const following = nextSentence(next);
    const nextInfo = following.completed ? undefined : info(following.queue[following.position]);
    const nextPath = nextInfo && latest.current.manifest.items[nextInfo.key];
    if (nextPath) { const upcoming = new Audio(audioUrl(nextPath)); preload.current = upcoming; upcoming.preload = "auto"; upcoming.load(); }
    changeStatus(autoplay ? "loading" : "paused");
    if (autoplay) void player.play().catch(failed); else player.load();
  };
  useEffect(() => {
    if (audio.current) audio.current.playbackRate = props.rate;
  }, [props.rate]);
  useEffect(() => () => { if (current.current) checkpoint(current.current, true); stopElement(); abort.current?.abort(); }, []);
  useEffect(() => {
    const save = () => { if (current.current) checkpoint(current.current, true); };
    window.addEventListener("pagehide", save);
    return () => window.removeEventListener("pagehide", save);
  }, []);
  useEffect(() => {
    let disposed = false;
    void Promise.all(commutingNarrations.map(async n => [n.id, ready(n.id) ? await downloadedSize(pathsFor(n.id)) : null] as const))
      .then(entries => { if (!disposed) setSavedSizes(Object.fromEntries(entries)); }).catch(() => {});
    void navigator.storage?.estimate?.().then(value => { if (!disposed && value.quota) setStorageFree(value.quota - (value.usage ?? 0)); }).catch(() => {});
    return () => { disposed = true; };
  }, [props.manifest]);

  const start = (kind = mode, budget = minutes) => {
    const chosen = byId.get(selected) ?? available[0];
    if (!chosen) return;
    const ordered = [chosen, ...available.filter(n => n.id !== chosen.id)];
    const queue = kind === "bookmarks" ? props.progress.bookmarks.filter(entry => textOf(entry))
      : kind === "timed" ? timedQueue(ordered, budget, props.rate, n => (props.manifest.commutingSegments?.[n.id] ?? []).reduce((sum, s) => sum + s.duration, 0) || n.duration_min * 60)
      : courseQueue(kind === "continuous" ? ordered : [chosen]);
    if (!queue.length) { setError("先に聞き直したい文を★で保存してください。"); return; }
    if (queue.some(entry => !ready(entry.narrationId))) { setError("同期音声の準備が完了していないコースがあります。オンラインで開き直してください。"); return; }
    props.stopOtherAudio(); setQuizId(null); setShowJapanese(false);
    load({ queue, position: 0, offset: 0, mode: kind, phase: 0, targetSeconds: kind === "timed" || kind === "bookmarks" ? budget * 60 : 0, listenedSeconds: 0, completed: false });
  };
  const resume = () => {
    if (!current.current) return;
    props.stopOtherAudio(); setError("");
    if (audio.current && !error && !current.current.completed) {
      void audio.current.play().catch(() => { changeStatus("paused"); setError("再生を開始できませんでした。もう一度お試しください。"); });
    } else load({ ...current.current, ...(current.current.completed ? { position: 0, offset: 0, listenedSeconds: 0, phase: 0 } : {}), completed: false });
  };
  const pause = () => { audio.current?.pause(); if (current.current) checkpoint(current.current, true); changeStatus("paused"); };
  const seek = (seconds: number) => {
    if (!current.current) return;
    const next = seekQueue(current.current.queue, current.current.position, audio.current?.currentTime ?? current.current.offset, seconds, durationOf);
    load({ ...current.current, ...next, completed: false }, status === "playing" || status === "loading");
  };
  const repeatSentence = () => { if (current.current) { props.stopOtherAudio(); load({ ...current.current, offset: 0, completed: false }); } };
  const toggleBookmark = () => {
    if (!ref) return;
    props.onChange(value => ({ ...value, bookmarks: value.bookmarks.some(b => sentenceKey(b) === sentenceKey(ref)) ? value.bookmarks.filter(b => sentenceKey(b) !== sentenceKey(ref)) : [...value.bookmarks, ref] }));
  };
  const download = async (id: string) => {
    const controller = new AbortController(); abort.current = controller; setError("");
    setDownloading({ id, done: 0, total: pathsFor(id).length });
    try {
      await downloadAudio(pathsFor(id), props.manifest, controller.signal, (done, total) => setDownloading({ id, done, total }));
      const size = await downloadedSize(pathsFor(id)); setSavedSizes(value => ({ ...value, [id]: size }));
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error && reason.name === "QuotaExceededError" ? "保存容量が不足しています。不要な保存音声を削除してください。" : reason instanceof Error ? reason.message : "保存できませんでした。");
    } finally { setDownloading(null); abort.current = null; }
  };
  const remove = async (id: string) => {
    try { await removeAudio(pathsFor(id)); setSavedSizes(value => ({ ...value, [id]: null })); }
    catch { setError("保存音声を削除できませんでした。"); }
  };
  const captions = session?.mode === "staged" ? session.phase === 1 ? "focus" : session.phase === 2 ? "full" : "hidden" : props.progress.captions;
  const courseSeconds = (props.manifest.commutingSegments?.[narration.id] ?? []).reduce((sum, segment) => sum + segment.duration, 0);
  const currentSeconds = ref ? (props.manifest.commutingSegments?.[ref.narrationId] ?? []).slice(0, ref.index).reduce((sum, segment) => sum + segment.duration, 0) + (session?.offset ?? 0) : 0;
  const completedQuizzes = props.progress.quizResults;

  return <section className="card commutePlayer">
    <div className="row"><h2>通勤聞き流し</h2><span className="tag">全{commutingNarrations.length}本</span></div>
    <p className="small">文ごとの自然音声に合わせて英文が追従します。文のつなぎ目に短い間が入ることがあります。</p>
    {error && <p className="commuteError" role="alert">{error}</p>}
    {props.progress.resume && status === "idle" && <button className="primaryButton" onClick={resume}>{session?.completed ? "▶ 前回の内容をもう一度" : "▶ 前回の続きから再生"}</button>}
    <div className="commuteSetup">
      <label>テーマ<select aria-label="テーマ" value={theme} onChange={event => { setTheme(event.target.value); const n = commutingNarrations.find(n => event.target.value === "すべて" || studies[n.id]?.theme === event.target.value); if (n) setSelected(n.id); }}><option>すべて</option>{[...new Set(Object.values(studies).map(study => study.theme))].map(t => <option key={t}>{t}</option>)}</select></label>
      <label>開始する教材<select aria-label="開始する教材" value={selected} onChange={event => setSelected(event.target.value)}>{available.map(n => <option value={n.id} key={n.id}>{n.title_ja}</option>)}</select></label>
      <label>再生方法<select aria-label="再生方法" value={mode} onChange={event => setMode(event.target.value as CommuteMode)}><option value="continuous">テーマ内の教材を連続ループ</option><option value="once">選んだ教材を1回</option><option value="repeat">選んだ教材を繰り返す</option><option value="staged">4段階の聞き取り練習</option><option value="timed">通勤時間に合わせる</option></select></label>
      {mode === "timed" && <label>学習時間<select aria-label="学習時間" value={minutes} onChange={event => setMinutes(Number(event.target.value))}>{[15, 30, 45].map(m => <option value={m} key={m}>約{m}分</option>)}</select></label>}
      <button className="primaryButton" onClick={() => start()}>▶ 選んだ内容で開始</button>
      <p className="small">時間指定は現在の再生速度を考慮します。指定時間を過ぎた文の終わりで停止します。</p>
    </div>
    {session && ref && <div className="commuteNow">
      <h3>{narration.title_ja}</h3>
      <p role="status">{{ idle: "停止中", loading: "読み込み中", playing: "再生中", paused: "一時停止", completed: "完了" }[status]} · {formatTime(currentSeconds)} / {formatTime(courseSeconds)} · 文{ref.index + 1}/{sentences.length}</p>
      {session.targetSeconds > 0 && <p className="small">今回の再生 {formatTime(session.listenedSeconds)} / 約{session.targetSeconds / 60}分</p>}
      {session.mode === "staged" && <div className="callout"><b>{phaseLabels[session.phase]}</b><p>字幕なし → 英文 → 日本語訳 → 字幕なし。日本語訳の段階では一時停止します。</p><button onClick={() => load({ ...session, position: 0, offset: 0, phase: Math.min(3, session.phase + 1), completed: false }, session.phase !== 1)} disabled={session.phase === 3}>次の段階へ</button></div>}
      <div className="handsFreeControls">
        {status === "playing" || status === "loading" ? <button onClick={pause}>⏸ 一時停止</button> : <button onClick={resume}>{session.completed ? "▶ もう一度" : "▶ 再開"}</button>}
        <button onClick={() => { pause(); stopElement(); changeStatus("idle"); }}>■ 停止・位置を保存</button>
        <button onClick={() => seek(-10)}>↶ 10秒戻す</button><button onClick={() => seek(10)}>10秒進む ↷</button>
        <button onClick={repeatSentence}>↻ この文をもう一度</button>
        <button onClick={() => load({ ...session, position: session.queue.findIndex(entry => entry.narrationId === ref.narrationId), offset: 0, completed: false })}>教材の最初から</button>
        <button onClick={() => { const next = session.queue.findIndex((entry, i) => i > session.position && entry.index === 0); load({ ...session, position: next >= 0 ? next : 0, offset: 0, completed: false }); }}>次のコースへ</button>
        <button aria-pressed={props.progress.bookmarks.some(b => sentenceKey(b) === sentenceKey(ref))} onClick={toggleBookmark}>{props.progress.bookmarks.some(b => sentenceKey(b) === sentenceKey(ref)) ? "★ 保存済み" : "☆ この文を保存"}</button>
      </div>
      {session.mode !== "staged" && <div className="chips" aria-label="英文表示">{(["hidden", "focus", "full"] as const).map((value, i) => <button key={value} aria-pressed={captions === value} onClick={() => props.onChange(old => ({ ...old, captions: value }))}>{["英文を隠す", "追従表示", "英文全文"][i]}</button>)}<button onClick={() => setShowJapanese(value => !value)}>{showJapanese ? "日本語訳を隠す" : "日本語訳を表示"}</button></div>}
      {captions === "focus" && <FollowingText key={narration.id} sentences={sentences} index={ref.index} />}
      {captions === "full" && <div className="commuteFullText" lang="en">{sentences.map((s, i) => <p key={i} aria-current={i === ref.index ? "true" : undefined}>{s}</p>)}</div>}
      {(showJapanese || session.mode === "staged" && session.phase === 2) && <div className="commuteTranslation"><h3>日本語訳</h3><p lang="ja">{studies[narration.id]?.translation_ja}</p></div>}
      <button className="primaryButton" onClick={() => { pause(); setQuizId(narration.id); }}>内容を3問で確認する（任意）</button>
    </div>}
    <details className="commuteBookmarks"><summary>★ 保存した文：{props.progress.bookmarks.length}件</summary>
      <div className="actions"><button disabled={!props.progress.bookmarks.length} onClick={() => start("bookmarks", 5)}>苦手な文だけ約5分</button><button disabled={!props.progress.bookmarks.length} onClick={() => start("bookmarks", 10)}>約10分</button></div>
      {props.progress.bookmarks.map(entry => <div key={sentenceKey(entry)} className="savedSentence"><p lang="en">{textOf(entry) ?? "教材が見つかりません"}</p><button onClick={() => props.onChange(value => ({ ...value, bookmarks: value.bookmarks.filter(b => sentenceKey(b) !== sentenceKey(entry)) }))}>保存を解除</button></div>)}
    </details>
    <details className="commuteDownloads"><summary>コースの保存・削除／あとで理解確認</summary>
      <p className="small">オンラインで事前保存すると、通信がない場所でも使えます。ブラウザーの保存データを消すと再ダウンロードが必要です。{storageFree !== null && `空き容量の目安：約${Math.round(storageFree / 1024 / 1024)} MB。`}</p>
      {commutingNarrations.map(n => <div className="downloadRow" key={n.id}><strong>{n.title_ja}</strong><span>{savedSizes[n.id] != null ? `保存済み ${(savedSizes[n.id]! / 1024 / 1024).toFixed(1)} MB` : "未保存"}</span><div className="actions"><button disabled={!!downloading || !ready(n.id)} onClick={() => void download(n.id)}>↓ 保存</button><button disabled={!!downloading || savedSizes[n.id] == null} onClick={() => void remove(n.id)}>保存音声を削除</button><button onClick={() => { pause(); setQuizId(n.id); }}>3問確認{completedQuizzes[n.id] ? `（前回${completedQuizzes[n.id].correct}/3）` : ""}</button></div></div>)}
      {downloading && <p role="status">保存中 {downloading.done}/{downloading.total} <button onClick={() => abort.current?.abort()}>中止</button></p>}
    </details>
    {quizId && studies[quizId] && <CommutingQuiz key={quizId} title={byId.get(quizId)?.title_ja ?? "理解確認"} questions={studies[quizId].questions} onDone={correct => props.onChange(value => ({ ...value, quizResults: { ...value.quizResults, [quizId]: { correct, total: 3, completedAt: new Date().toISOString() } } }))} onClose={() => setQuizId(null)} />}
  </section>;
}

function FollowingText({ sentences, index }: { sentences: string[]; index: number }) {
  const frame = useRef<HTMLDivElement>(null), reel = useRef<HTMLDivElement>(null);
  const previous = useRef(index), initialized = useRef(false);
  const [position, setPosition] = useState({ y: 0, animate: false });
  useLayoutEffect(() => {
    const measure = (animate: boolean) => {
      const active = reel.current?.children[index] as HTMLElement | undefined;
      if (frame.current && active) setPosition({ y: frame.current.clientHeight / 2 - active.offsetTop - active.offsetHeight / 2, animate });
    };
    measure(initialized.current && index > previous.current); previous.current = index; initialized.current = true;
    let width = frame.current?.clientWidth, height = frame.current?.clientHeight;
    const observer = new ResizeObserver(() => {
      if (frame.current?.clientWidth === width && frame.current?.clientHeight === height) return;
      width = frame.current?.clientWidth; height = frame.current?.clientHeight; measure(false);
    });
    if (frame.current) observer.observe(frame.current);
    return () => observer.disconnect();
  }, [index]);
  return <div className="syncedTranscript"><div className="transcriptViewport" ref={frame}><div ref={reel} className={position.animate ? "transcriptReel moving" : "transcriptReel"} style={{ transform: `translateY(${position.y}px)` }}>{sentences.map((sentence, i) => <p key={i} lang="en" aria-current={i === index ? "true" : undefined} className={i === index ? "current" : "neighbor"}>{sentence}</p>)}</div></div></div>;
}

function CommutingQuiz({ title, questions, onDone, onClose }: { title: string; questions: Question[]; onDone: (correct: number) => void; onClose: () => void }) {
  const [answers, setAnswers] = useState<string[]>([]);
  const [position, setPosition] = useState(0);
  const item = questions[position];
  const answer = answers[position];
  const correct = answers.reduce((n, value, i) => n + Number(value === questions[i].correct_ja), 0);
  return <section className="commuteQuiz"><h3>{title}：理解確認</h3>{position < questions.length ? <><p>{position + 1}/3 · {item.question_ja}</p><div className="choices">{item.choices_ja.map(choice => <button key={choice} disabled={Boolean(answer)} className={answer ? choice === item.correct_ja ? "correct" : choice === answer ? "incorrect" : "" : ""} onClick={() => setAnswers(value => [...value, choice])}>{choice}</button>)}</div>{answer && <div className="answer"><b>{answer === item.correct_ja ? "正解です" : `正解：${item.correct_ja}`}</b><p>{item.explanation_ja}</p><button onClick={() => { if (position + 1 === questions.length) onDone(correct); setPosition(value => value + 1); }}>次へ</button></div>}</> : <><p>今回の結果：{correct}/3問正解</p><p>聞き取れなかった部分は、★に保存して繰り返しましょう。</p></>}<button onClick={onClose}>閉じる</button></section>;
}
