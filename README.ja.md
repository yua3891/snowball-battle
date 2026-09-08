# Snowball Battle / 雪球大战

[English](./README.md) · [简体中文](./README.zh-CN.md) · [日本語](./README.ja.md)

クラシックな **Kele8（可乐8）の「打雪仗」** に着想を得た、軽量なブラウザ向けリアルタイム雪合戦ゲームです。

> 本プロジェクトは独立したオープンソースのリメイク／トリビュートであり、元ゲームの運営者・権利者との提携、承認、ライセンス関係はありません。本リポジトリには元ゲームから直接抽出したプログラムやアセットは含まれていません。

![Snowball Battle gameplay](./docs/screenshots/gameplay-battle.webp)

## 主な特徴

- 🔵 **Blue vs Red** のリアルタイムチーム対戦
- 🖱️ **右クリックで移動**、**左クリックで雪玉を投げる**
- ❄️ 雪玉は連続で素早く投げられ、チームごとに青 / 赤のアウトラインと軌跡を表示
- ☃️ **雪だるま保護**：8 秒間、移動も攻撃もせず戦闘状態を離れていると、無敵の雪だるまになる
- 🧊 湖、フェンス、木、家、岩、氷雪装飾などをランダム生成
- 🚧 **フェンスと湖は移動をブロック**。木や家は表示用で通過可能
- 🏹 雪玉はマップ障害物に遮られない
- 🤖 ゲーム内設定から Blue / Red の Bot 数を個別設定。初期値は 0 / 0
- ❤️ HP 100、雪玉 1 発 20 ダメージ、チームスコアと個人 K/D/Hit 統計
- 💀 人間プレイヤーは自動復活せず、**Respawn now / 立即复活** を押して復活
- 🎯 倒された画面には、誰に倒されたかを表示
- 🎮 多方向 Sprite、雪だるま状態、スムーズなプレイヤー補間とカメラ追従
- 🌐 Node.js リアルタイムサーバー + ブラウザ Canvas 描画
- 📦 現在の実行時依存パッケージはなし

## スクリーンショット

### チーム選択

![Join screen](./docs/screenshots/join-screen.webp)

### Bot 設定とバトル

![Bot configuration](./docs/screenshots/gameplay-config.webp)

### 雪だるま状態

![Snowman gameplay](./docs/screenshots/gameplay-snowman.webp)

### ノックダウンと手動復活

![Death screen](./docs/screenshots/death-screen.webp)

## 操作

| 入力 | 動作 |
| --- | --- |
| マウス右クリック | クリック位置へ移動。フェンスと湖を自動で迂回 |
| マウス左クリック | クリックした方向へ雪玉を投げる |
| 敵にカーソルを重ねる | カーソルが赤くなり攻撃対象を識別しやすくする |
| 左上の設定 | Blue / Red の Bot 数を設定 |
| Respawn now | 倒された後、ランダムな有効位置に手動復活 |

ゲーム内では右クリックを移動専用にするため、ブラウザのコンテキストメニューを無効化しています。

## 基本ルール

- ゲーム参加前に Blue または Red を選択します。
- 固定のチーム基地はなく、プレイヤーは有効な場所にランダムスポーンします。
- クリック位置が最大射程内なら雪玉はその距離まで飛び、射程外の場合のみ最大射程に制限されます。
- 複数の雪玉を同時に存在させることができ、前の雪玉が消えるのを待つ必要はありません。
- 味方にはダメージを与えません。
- 人間プレイヤーは自動復活せず、手動で復活します。
- Bot はテスト対戦を継続するため自動復活できます。
- 8 秒間移動も攻撃もせず、かつ戦闘状態を離れていると雪だるまになります。
- 雪だるまは無敵で、移動または攻撃入力によって解凍を開始します。

## 現在の主な数値

| 設定 | 値 |
| --- | ---: |
| HP | 100 |
| 雪玉ダメージ | 20 |
| 最大射程 | 500 |
| 雪だるま待機時間 | 8 秒 |
| 戦闘離脱条件 | 約 5 秒 |
| スポーン保護 | 約 1.8 秒 |
| 初期 Bot | Blue 0 / Red 0 |

## クイックスタート

### 必要環境

- Node.js **18+**
- Chrome / Edge などのモダンなデスクトップブラウザ

### ローカル起動

```bash
git clone https://github.com/yua3891/snowball-battle.git
cd snowball-battle
npm start
```

ブラウザで開きます：

```text
http://localhost:8080
```

Windows では `start.bat` をダブルクリックして起動することもできます。

### ポート変更

```bash
PORT=8090 npm start
```

### Docker

```bash
docker build -t snowball-battle .
docker run --rm -p 8080:8080 snowball-battle
```

## 技術構成

- **Client:** HTML + CSS + JavaScript + Canvas
- **Server:** Node.js built-in HTTP + WebSocket framing
- **Networking:** ダメージ、雪玉、プレイヤー状態はサーバー権威方式
- **Movement:** ローカル予測、他プレイヤー補間 / 外挿、スムーズなカメラ追従
- **Pathfinding:** フェンス / 湖を避けるグリッドベース経路探索

## Kele8（可乐8）/「打雪仗」について

本プロジェクトは、クラシックな Kele8（可乐8）の「打雪仗」のゲームプレイ感覚に着想を得ています。チーム雪合戦、マウス移動、方向別キャラクター、雪だるま保護といった楽しいコア体験を、読みやすい現代的なオープンソース実装として再構成することを目的としています。

本プロジェクトは Kele8 の公式プロジェクトではありません。元ゲームのブランド、キャラクター、商標、その他の保護対象物の所有権を主張しません。「Kele8 / 可乐8 / 打雪仗」への言及は、歴史的なインスピレーションを説明する目的に限られます。

権利上問題があると思われる内容を見つけた場合は Issue を作成してください。確認のうえ必要に応じて差し替えます。

## コントリビューション

Issue / Pull Request を歓迎します。特に以下の改善に向いています：

- 移動・カメラ感覚、ネットワーク遅延処理
- Sprite の位置合わせ、走り / 投球アニメーション
- ランダムマップと Bot AI
- ルーム / ラウンド / マッチ終了処理
- モバイル / タッチ操作
- サウンドと追加エフェクト

## ライセンス

**MIT License** で公開しています：[`LICENSE`](./LICENSE)

翻訳 / 説明：

- [简体中文 MIT 说明](./LICENSE.zh-CN.md)
- [日本語 MIT 説明](./LICENSE.ja.md)

法的に有効なライセンス本文は英語版 `LICENSE` です。




---

<table>
  <tr>
    <th align="center">加微信交流</th>
    <th align="center">支持开源（微信）</th>
    <th align="center">支持开源（支付宝）</th>
  </tr>
  <tr>
    <td align="center"><img src="examples/weixin.jpg" alt="加微信交流" height="320"></td>
    <td align="center"><img src="examples/paywx.jpg" alt="微信支持开源" height="320"></td>
    <td align="center"><img src="examples/payalipay.jpg" alt="支付宝支持开源" height="320"></td>
  </tr>
</table>

### 关注我们

<table>
  <tr>
    <th align="center">公众号</th>
    <th align="center">视频号</th>
    <th align="center">抖音</th>
  </tr>
  <tr>
    <td align="center"><img src="doc/examples/qr_gzh.jpg" alt="关注 AISolo大西瓜公众号" height="320"></td>
    <td align="center"><img src="doc/examples/qr_sph.jpg" alt="关注 AISolo大西瓜视频号" height="320"></td>
    <td align="center"><img src="doc/examples/qr_dy.jpg" alt="关注 AISolo大西瓜抖音" height="320"></td>
  </tr>
</table>