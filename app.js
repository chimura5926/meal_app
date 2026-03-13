import { db } from "./firebase.js";
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

let currentUser = null;

const foods = {

egg:{p:6,f:5,c:0.2,k:70},
rice:{p:4,f:0.5,c:61,k:260},
natto:{p:8,f:5,c:6,k:100},
kimchi:{p:1,f:0.3,c:3,k:15},
protein:{p:20,f:1,c:3,k:100},
kinu_tofu:{p:7,f:4.5,c:2,k:84},
momen_tofu:{p:10,f:6.5,c:2,k:108}
};

const target = {
p:140,
f:50,
c:300,
k:2200
};

let total = {p:0,f:0,c:0,k:0};

const ctx = document.getElementById("pfcChart");

// app.js の該当箇所を修正
const chart = new Chart(ctx, {
    type: "pie",
    data: {
        labels: ["Protein", "Fat", "Carb"],
        datasets: [{
            data: [0, 0, 0],
            backgroundColor: ["#FF6384", "#FFCE56", "#36A2EB"] // 色を付けると見やすくなります
        }]
    },
    plugins: [ChartDataLabels], // プラグインを登録
    options: {
        plugins: {
            datalabels: {
                color: '#fff', // 文字色
                font: {
                    weight: 'bold',
                    size: 14
                },
                formatter: (value, ctx) => {
                    let sum = 0;
                    let dataArr = ctx.chart.data.datasets[0].data;
                    dataArr.map(data => {
                        sum += data;
                    });
                    // 合計が0の場合は表示しない、それ以外は%を計算
                    if (sum === 0) return "";
                    let percentage = (value * 100 / sum).toFixed(1) + "%";
                    return percentage;
                }
            }
        }
    }
});

let history = [];

function addFood(){

let f = document.getElementById("food").value;
let food = foods[f];

total.p += food.p;
total.f += food.f;
total.c += food.c;
total.k += food.k;

history.push(f);

updateDisplay();
updateChart();
updateHistory();
saveData();

}

function updateDisplay(){

document.getElementById("p").innerText = total.p.toFixed(1);
document.getElementById("f").innerText = total.f.toFixed(1);
document.getElementById("c").innerText = total.c.toFixed(1);
document.getElementById("kcal").innerText = total.k.toFixed(0);

document.getElementById("remainP").innerText = (target.p-total.p).toFixed(1);
document.getElementById("remainF").innerText = (target.f-total.f).toFixed(1);
document.getElementById("remainC").innerText = (target.c-total.c).toFixed(1);
document.getElementById("remainK").innerText = (target.k-total.k).toFixed(0);

}

function updateChart(){

chart.data.datasets[0].data=[
total.p*4,
total.f*9,
total.c*4
];

chart.update();


}

// app.js の末尾などに追加

function addCustomFood() {
    // 名前とPFCを取得
    const name = document.getElementById("customName").value;
    const p = parseFloat(document.getElementById("customP").value) || 0;
    const f = parseFloat(document.getElementById("customF").value) || 0;
    const c = parseFloat(document.getElementById("customC").value) || 0;

    // カロリーを自動計算 (P:4kcal, F:9kcal, C:4kcal)
    const k = (p * 4) + (f * 9) + (c * 4);

    if (!name) {
        alert("名前を入力してください");
        return;
    }

    // 合計に加算
    total.p += p;
    total.f += f;
    total.c += c;
    total.k += k;

    // 履歴に追加
    history.push({
        isCustom: true,
        name: name,
        p: p,
        f: f,
        c: c,
        k: k
    });

    // 入力欄をクリア（kの入力欄は不要になるので削除してOK）
    document.getElementById("customName").value = "";
    document.getElementById("customP").value = "";
    document.getElementById("customF").value = "";
    document.getElementById("customC").value = "";

    updateDisplay();
    updateChart();
    updateHistory();
    saveData();
}

// 既存の updateHistory 関数を、カスタムデータに対応するよう書き換え
// app.js の updateHistory 関数を以下に差し替え
function updateHistory(){
    let tbody = document.getElementById("history");
    tbody.innerHTML = "";

    history.forEach((item, index) => {
        // itemが文字列（既存リスト）かオブジェクト（カスタム）かを判定
        let food = (typeof item === 'string') ? foods[item] : item;
        let displayName = (typeof item === 'string') ? item : item.name;

        let row = document.createElement("tr");

        // <td>を追加して food.k を表示するように変更
        row.innerHTML =
            "<td>" + displayName + "</td>" +
            "<td>" + food.p + "</td>" +
            "<td>" + food.f + "</td>" +
            "<td>" + food.c + "</td>" +
            "<td>" + food.k.toFixed(0) + "</td>" + // カロリーを表示（整数に丸める）
            '<td><button onclick="removeFood(' + index + ')">削除</button></td>';

        tbody.appendChild(row);
    });
}

// 既存の removeFood 関数も、カスタムデータに対応するよう書き換え
function removeFood(index){
    let item = history[index];
    let food = (typeof item === 'string') ? foods[item] : item;

    total.p -= food.p;
    total.f -= food.f;
    total.c -= food.c;
    total.k -= food.k;

    history.splice(index, 1);

    updateDisplay();
    updateChart();
    updateHistory();
    saveData();
}
// AI解析ボタンから呼ばれる関数
async function addAiFood() {
    const text = document.getElementById("aiText").value;
    const imageFile = document.getElementById("aiImage").files[0];
    const status = document.getElementById("aiStatus");
    const btn = document.getElementById("aiBtn");

    if (!text && !imageFile) {
        alert("料理名を入力するか、画像を添付してください");
        return;
    }

    status.innerText = "解析中...";
    btn.disabled = true;

    let base64Image = null;
    if (imageFile) {
        base64Image = await toBase64(imageFile);
    }

    try {
        const response = await fetch('/api/estimate', { // VercelのAPIルートに合わせる
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, image: base64Image?.split(',')[1] })
        });

        const food = await response.json();

        addAiLog(food);

        // 【修正ポイント】既存の変数に数値を足す
        total.p += parseFloat(food.p) || 0;
        total.f += parseFloat(food.f) || 0;
        total.c += parseFloat(food.c) || 0;
        total.k += parseFloat(food.k) || 0;

        // 履歴に追加
        history.push({ 
            name: "[AI] " + food.name, 
            p: food.p, 
            f: food.f, 
            c: food.c, 
            k: food.k 
        });
        
        // 【修正ポイント】既存の更新関数を呼ぶ
        updateDisplay();
        updateChart();
        updateHistory();
        saveData();

        status.innerText = "追加完了！";
        document.getElementById("aiText").value = "";
        document.getElementById("aiImage").value = "";
    } catch (e) {
        console.error(e);
        status.innerText = "エラーが発生しました";
    } finally {
        btn.disabled = false;
    }
}

// 画像をBase64に変換する補助関数
const toBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
});


// ====== AIログ用の関数（app.jsの末尾に追加） ======

// ログを画面に追加する関数
function addAiLog(message) {
    const logContainer = document.getElementById("aiLogContent");
    if (!logContainer) return;

    const logItem = document.createElement("div");
    logItem.style.borderBottom = "1px solid #ddd";
    logItem.style.padding = "5px 0";
    
    // 時間を取得して見やすくする
    const now = new Date();
    const timeStr = now.getHours() + ":" + String(now.getMinutes()).padStart(2, '0') + ":" + String(now.getSeconds()).padStart(2, '0');
    
    // データがJSON(オブジェクト)の場合は文字列に変換、それ以外はそのまま表示
    const displayMsg = typeof message === 'object' ? JSON.stringify(message, null, 2) : message;

    // 時間とメッセージを設定
    logItem.innerText = `[${timeStr}]\n${displayMsg}`;
    
    // prependを使うことで、新しいログが「一番上」に追加されるようにします
    logContainer.prepend(logItem); 
}

// ログをすべて消去する関数
function clearAiLogs() {
    const logContainer = document.getElementById("aiLogContent");
    if (logContainer) {
        logContainer.innerHTML = ""; // 中身を空っぽにする
    }
}

// ====== Firestore 保存・読み込み機能 ======

// データベースに現在の状態を保存する関数
async function saveData() {
    if (!currentUser) return; // ログインしていなければ保存しない
    try {
        // "my_app" ではなく "users" フォルダの中の "ユーザーの専用ID" に保存する
        await setDoc(doc(db, "users", currentUser.uid), {
            total: total,
            history: history
        });
        console.log("データを保存しました！");
    } catch (e) {
        console.error("保存エラー: ", e);
    }
}

// データベースから状態を読み込む関数
async function loadData() {
    if (!currentUser) return; // ログインしていなければ読み込まない
    try {
        const docSnap = await getDoc(doc(db, "users", currentUser.uid));
        if (docSnap.exists()) {
            const data = docSnap.data();
            total = data.total || {p:0, f:0, c:0, k:0};
            history = data.history || [];
        } else {
            // 初めてのユーザーの場合は0に戻す
            total = {p:0, f:0, c:0, k:0};
            history = [];
        }
        updateDisplay();
        updateChart();
        updateHistory();
        console.log("データを読み込みました！");
    } catch (e) {
        console.error("読み込みエラー: ", e);
    }
}

// ページが開かれたときに自動でデータを読み込む
// ====== 認証機能 ======
const provider = new GoogleAuthProvider();

async function login() {
    try {
        await signInWithPopup(auth, provider);
    } catch (error) {
        console.error("ログインエラー:", error);
    }
}

async function logout() {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("ログアウトエラー:", error);
    }
}

// ログイン状態を常に監視する（ページを開いた時や、ログイン・ログアウト時に自動で動く）
onAuthStateChanged(auth, (user) => {
    if (user) {
        // ログイン状態のとき
        currentUser = user;
        document.getElementById("userName").innerText = user.displayName + " さん";
        document.getElementById("loginBtn").style.display = "none";
        document.getElementById("logoutBtn").style.display = "inline-block";
        
        loadData(); // ログインできたらその人のデータを読み込む
    } else {
        // ログアウト状態のとき
        currentUser = null;
        document.getElementById("userName").innerText = "ログインしていません";
        document.getElementById("loginBtn").style.display = "inline-block";
        document.getElementById("logoutBtn").style.display = "none";
        
        // 画面の数字をゼロにリセットする
        total = {p:0, f:0, c:0, k:0};
        history = [];
        updateDisplay();
        updateChart();
        updateHistory();
    }
});

// ====== HTMLから関数を呼び出せるようにする設定 ======
window.addFood = addFood;
window.addCustomFood = addCustomFood;
window.removeFood = removeFood;
window.addAiFood = addAiFood;
window.clearAiLogs = clearAiLogs;
window.login = login;  
window.logout = logout;  