# InfoSec English Trainer

iPhoneで使う、情報セキュリティ英語会議のための教材・問題集PWAです。発音、自由会話、模擬会議は、各画面のボタンでコピーしたプロンプトを **iPhoneのChatGPTアプリの音声モード** に貼り付けて練習します。アプリにはAPIキーや音声AIを含めません。

公開URL: **https://oh3-cpu.github.io/InfoSec-English/**

## 教材

すべての教材は `content/infosec_english_content_pack/` に保持し、ビルド時にアプリへ統合されます。

- 専門用語: `vocabulary.json` / CSV
- 会議フレーズ: `meeting_phrases.json` / CSV
- 聞き取り: `listening_items.json` / CSV
- 会議全体リスニング: `meeting_listening.json`（複数人の会議音声・1会議3問）
- 模擬会議: `roleplay_scenarios.json` / CSV
- TypeScript型定義・取り込みガイド・ChatGPTプロンプト
- 上級WAF・NDR教材: `advanced_waf_ndr.json`（WAFチューニング、NDR、横展開、C2、MITRE ATT&CK、DLP、ゼロトラスト、マイクロセグメンテーション）

## 開発

```bash
npm install
npm run dev
```

ローカルの開発URLをブラウザで開きます。公開用ビルドは次のとおりです。

```bash
npm run build
```

## GitHub Pages公開

`main` ブランチへのpushで `.github/workflows/deploy.yml` がビルドと公開を行います。GitHubリポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** に一度設定してください。

プロジェクトサイトのサブパス `/InfoSec-English/` に対応しています。

## iPhoneへの追加

1. iPhoneのSafariで https://oh3-cpu.github.io/InfoSec-English/ を開く
2. 共有ボタンを押し、**ホーム画面に追加** を選ぶ
3. 「Webアプリとして開く」をオンにして追加する

教材とアプリ本体は、一度開いた後はオフラインでも利用できます。ChatGPTの音声モードだけはインターネット接続が必要です。

## ChatGPT音声モード

ホームの **今日の30分コース** は、単語15語 → 短文5問 → Listening 3問 → 会議1本を順番に案内します。各パートでは、復習期限の来た苦手問題が優先されます。

単語とListeningは、学習開始後にランダムな問題を1件ずつ表示します。回答して次へ進むと、次の英語をすぐに読み上げます。間違えた項目は翌日・3日後・7日後に優先して復習します。

会議フレーズの **会議全体リスニング** では、複数人による6〜8発言の模擬会議を通して聞き、「現在の状況」「決定事項」「担当者・期限」の3問に答えます。英文は必要なときだけ表示できます。

音声速度は全画面共通で0.7倍・0.85倍・1.0倍から選べます。iPhoneに追加したAva（プレミアム）・Alex・Alison（拡張）をアプリ内で選択でき、会議では話者ごとに利用可能な音声を切り替えます。Safariから検出できない音声は端末の自動英語音声へフォールバックします。

ホーム画面では学習記録をJSONで保存・読み込みできるため、端末変更時にも音声設定を含む記録を移行できます。

各教材の **ChatGPTで練習** または **会議練習をコピー** を押し、コピーされた文章をChatGPT iPhoneアプリのチャット欄に貼り付けて音声モードを始めます。発音、復唱、自然な会議会話、短い日本語での修正を受けられます。

## 主な変更ファイル

- `src/App.tsx` — 日本語UI、教材統合、学習記録、JSONバックアップ
- `src/DailyCourse.tsx` — 30分コースと学習終了画面
- `src/learning.ts` — 復習スケジュールと学習記録の移行
- `src/voices.ts` — iPhoneのナチュラル音声検出・選択・会議話者への割り当て
- `src/styles.css` — iPhone向けUI
- `public/manifest.json` / `public/service-worker.js` / `public/icon.svg` — PWA・オフライン対応
- `.github/workflows/deploy.yml` — GitHub Pagesの自動公開
- `content/infosec_english_content_pack/` — すべての教材データ
