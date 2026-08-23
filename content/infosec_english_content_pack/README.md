# Information Security English Content Pack for Codex App

Codexで作った英会話アプリへ追加投入するための教材データパックです。
アプリ本体を作り直すのではなく、既存アプリへ取り込むことを想定しています。

## 収録数
- 専門用語: 365件
- 会議文: 232件
- 聞き取り問題: 220件
- 模擬会議シナリオ: 30件
- ChatGPT音声練習用プロンプトテンプレート: 3件

## 推奨取り込み
まず `content_pack_combined.json` を取り込むのが一番簡単です。
既存アプリのデータ構造と違う場合は、Codexにマッピング層を作らせてください。

## Codexへの指示
`CODEX_IMPORT_PROMPT.txt` をそのままCodexに貼り付けてください。

## ファイル
- content_pack_combined.json: 全データ一括
- vocabulary.json / vocabulary.csv
- meeting_phrases.json / meeting_phrases.csv
- listening_items.json / listening_items.csv
- roleplay_scenarios.json / roleplay_scenarios.csv
- chatgpt_prompt_templates.json
- contentTypes.ts
