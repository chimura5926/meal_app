self.addEventListener("install", e => {
    console.log("PWA installed");
});

// アプリとして認識されるための必須イベント（とりあえず通信を素通りさせる）
self.addEventListener("fetch", e => {
    // 現在はオフライン対応をしないので何もせずスルー
});