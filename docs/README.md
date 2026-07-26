# 使い方ガイド

`GE8-ENDURANCE-運営プラットフォーム-使い方ガイド.pdf` が配布用の説明書です（A4・18ページ）。

## 作り直しかた

画面を変更したら、スクリーンショットも古くなります。次の手順で作り直せます。

1. `manual.html` の文章を直す
2. `manual-assets/` の画像を撮り直す（アプリの各画面のスクリーンショット）
3. Chromium の印刷機能で PDF に書き出す

PDF は HTML から Chromium のヘッドレス印刷で生成しています。日本語は IPAGothic で
サブセット埋め込みされるため、フォントが入っていない環境でも同じ見た目で開けます。

```js
// 例: Playwright での書き出し
await page.goto('file:///.../docs/manual.html', { waitUntil: 'networkidle' })
await page.pdf({
  path: 'GE8-ENDURANCE-運営プラットフォーム-使い方ガイド.pdf',
  format: 'A4', printBackground: true, displayHeaderFooter: true,
  margin: { top: '18mm', bottom: '20mm', left: '16mm', right: '16mm' },
})
```

`manual.html` はブラウザでそのまま開いても読めます。ブラウザの「印刷 → PDF に保存」でも
ほぼ同じものが出ます（余白とヘッダー／フッターの設定だけ合わせてください）。
