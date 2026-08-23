# InfoSec English Trainer

iPhoneで使う、情報セキュリティ英語会議のための教材・問題集PWAです。発音、自由会話、模擬会議は、各画面のボタンでコピーしたプロンプトを **iPhoneのChatGPTアプリの音声モード** に貼り付けて練習します。アプリにはAPIキーや音声AIを含めません。

公開URL: **https://oh3-cpu.github.io/InfoSec-English/**

## 教材

すべての教材は `content/infosec_english_content_pack/` に保持し、ビルド時にアプリへ統合されます。

- 専門用語: `vocabulary.json` / CSV
- 会議フレーズ: `meeting_phrases.json` / CSV
- 聞き取り: `listening_items.json` / CSV
- 模擬会議: `roleplay_scenarios.json` / CSV
- TypeScript型定義・取り込みガイド・ChatGPTプロンプト

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

各教材の **ChatGPTで練習** または **会議練習をコピー** を押し、コピーされた文章をChatGPT iPhoneアプリのチャット欄に貼り付けて音声モードを始めます。発音、復唱、自然な会議会話、短い日本語での修正を受けられます。

## 主な変更ファイル

- `src/App.tsx` — 日本語UI、教材統合、学習記録、プロンプトコピー
- `src/styles.css` — iPhone向けUI
- `public/manifest.json` / `public/service-worker.js` / `public/icon.svg` — PWA・オフライン対応
- `.github/workflows/deploy.yml` — GitHub Pagesの自動公開
- `content/infosec_english_content_pack/` — すべての教材データ
