

[中文](README.md) [English](README_EN.md) [日本語](README_JP.md)


<h1 align="center">SuperConnectX</h1>

[![LICENSE](https://img.shields.io/badge/license-GPL%203.0-blue)](#)
[![Star](https://img.shields.io/github/stars/SuperStudio/SuperConnectX?label=Star%20this%20repo)](https://github.com/SuperStudio/SuperConnectX)
[![Fork](https://img.shields.io/github/forks/SuperStudio/SuperConnectX?label=Fork%20this%20repo)](https://github.com/SuperStudio/SuperConnectX/fork)


SuperConnectXは、COMやTelnetなどの端末接続をサポートする**スーパー端末ツール**で、完全に**Vibe Coding**で開発されています。

ダウンロード：[こちらからダウンロード](https://github.com/SuperStudio/SuperConnectX/releases)

## macOS へのインストールとアップデート

- Apple Silicon Mac（M1/M2/M3/M4 など）では `macos-arm64.dmg`、Intel Mac では `macos-x64.dmg` を選択してください。
- 現在、本プロジェクトは Apple Developer ID による署名と公証を行っていません。ブラウザから初めてダウンロードしてインストールした場合、macOS が「開発元を確認できません」または「アプリが壊れています」と表示することがあります。まず「システム設定 → プライバシーとセキュリティ」でブロックされたアプリを確認し、「このまま開く」を選択してください。
- 「このまま開く」が表示されない場合は、本プロジェクトの Releases から取得したアプリであることを確認し、`SHA256SUMS` を検証した上で、ターミナルから次のコマンドを実行してください。

```bash
xattr -r -d com.apple.quarantine "/Applications/superconnectx.app"
```

- 別の場所にインストールした場合は、実際の `.app` のパスに置き換えてください。`/Applications` 全体ではなく、対象アプリだけを指定してください。
- アプリ内で GitHub Release のメタデータを確認し、現在の CPU アーキテクチャ向けパッケージを判別できます。ただし、macOS の自動インストールには有効なコード署名が必要なため、未署名版では正常完了が保証されません。更新ダイアログの「ダウンロード」から Releases を開き、手動でダウンロードしてアプリを置き換えてください。Gatekeeper に再度ブロックされた場合は、上記の手順を繰り返してください。


![image-20260531221403478](Image/image-20260531221403478.png)


![star-history](https://api.star-history.com/svg?repos=SuperStudio/SuperConnectX&type=Date)

# 機能の革新

1. シリアルポート機能は [SuperCom](https://github.com/SuperStudio/SuperCom) から完全に継承

2. Telnet機能に対応

# ソフトウェアの特徴

## シンタックスハイライト

<img src="Image/image-20260712223054054.png" alt="image-20260712223054054" style="zoom:80%;" />

<img src="Image/image-20260712223112569.png" alt="image-20260712223112569" style="zoom:80%;" />

## 画面分割

<img src="Image/image-20260712223133963.png" alt="image-20260712223133963" style="zoom:80%;" />

タブのドラッグ＆ドロップに対応

<img src="Image/image-20260712223431638.png" alt="image-20260712223431638" style="zoom:80%;" />

## コマンドエディタ

<img src="Image/image-20260712223209692.png" alt="image-20260712223209692" style="zoom:80%;" />

コマンドのループ一括実行

<img src="Image/2.gif" alt="2" style="zoom:80%;" />



## シリアルCRCチェック

<img src="Image/image-20260712223233500.png" alt="image-20260712223233500" style="zoom:80%;" />

## テーマ - ダーク / ライトモード

<img src="Image/image-20260712212608912.png" alt="image-20260712212608912" style="zoom:80%;" />

<img src="Image/image-20260712212627051.png" alt="image-20260712212627051" style="zoom:80%;" />

## 複数接続のサポート

COM / Telnet / FTP

<img src="Image/image-20260712212729695.png" alt="image-20260712212729695" style="zoom:80%;" />

<img src="Image/image-20260712222905898.png" alt="image-20260712222905898" style="zoom:80%;" />

<img src="Image/image-20260712222929409.png" alt="image-20260712222929409" style="zoom:80%;" />

## 仮想シリアルポートエミュレーション

<img src="Image/image-20260809175628990.png" alt="image-20260809175628990" style="zoom:80%;" />

## ショートカットキー

<img src="Image/image-20260712222946297.png" alt="image-20260712222946297" style="zoom:80%;" />

## データのインポート / エクスポート

<img src="Image/image-20260712223001191.png" alt="image-20260712223001191" style="zoom:80%;" />

## フォント、折り返しなど

<img src="Image/image-20260712223024396.png" alt="image-20260712223024396" style="zoom:80%;" />



## 自動更新

<img src="Image/image-20260712223343355.png" alt="image-20260712223343355" style="zoom:80%;" />

# 開発方法

## 環境設定

依存関係のインストール

```bash
npm install
```

実行

```bash
npm run dev
```

## 開発への参加

VS CodeでCodeBuddy拡張機能をインストールするか、他のエージェントを使用してVibe Codingを行ってください。

<img src="Image/image-20260531221642675.png" alt="image-20260531221642675" style="zoom: 80%;" />

# バージョンリリース

## リリースノートの自動生成

`skills/version-generate.md` の内容をVibe Codingのダイアログに貼り付けてください。

## コードチェック

`npm run typecheck` を実行してください。

## ローカルビルド

`build.bat` を実行してください。

## CI/CD ビルド

`release.bat` を実行すると、GitHub Actionsが自動的に起動し、ビルド完了後に最新のリリースが自動生成されます。

<img src="Image/image-20260531222201852.png" alt="image-20260531222201852" style="zoom:80%;" />
