// firebase.js
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-analytics.js";
// ▼ データベース(Firestore)の機能をインポート ▼
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// ご自身のFirebase設定
const firebaseConfig = {
  apiKey: "AIzaSyBOHc5-RTXGesHwL0ex46SQcAVpkGQgos0",
  authDomain: "meal-app-4ac4c.firebaseapp.com",
  projectId: "meal-app-4ac4c",
  storageBucket: "meal-app-4ac4c.firebasestorage.app",
  messagingSenderId: "904148974123",
  appId: "1:904148974123:web:35c2eea770eb9e62b4486e",
  measurementId: "G-W6BDW16DHQ"
};

// Firebaseの初期化
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// ▼ データベースを app.js で使えるように export する ▼
export const db = getFirestore(app);

export const auth = getAuth(app);

console.log("Firebase & Firestoreが正常に初期化されました！");