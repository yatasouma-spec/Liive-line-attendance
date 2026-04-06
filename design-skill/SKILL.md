# Liive Dashboard Theme Skill

## 目的
デジタル庁ダッシュボード系テンプレートの配色・余白・可読性ルールを、Liive勤怠のUIへ再適用する。

## 使い方
1. `liive-dashboard-theme-skill.json` の `design_principles` を基本トークンとしてCSS変数に反映。
2. `themes` からテーマを選び、`--primary` 系変数を切り替える。
3. 画面の優先順位は以下。
   - 主要操作: `primary`
   - カード/パネル: `panel_background`
   - 枠線: `border`
   - 補助背景: `surface`
   - 注意・異常: `status`

## 実装方針
- ページ背景は白ベースで情報密度を上げる。
- テーブルは罫線 `#E6E6E6`、ヘッダ薄グレー背景で視線誘導。
- 角丸は12px前後、影は弱く短いものを使用。
- モバイルは1カラムに畳み、主要ボタンは44px以上を確保。

## 備考
ZIP内のPBITから抽出した配色トークンを使用。
