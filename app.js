import { db, auth } from "./firebase.js";
import { doc, setDoc, getDoc, collection, query, limit, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
let currentUser = null;
let weeklyChart;

function getTodayString() {
    const now = new Date();
    // 日本時間でのズレを防ぐための処理
    const tzoffset = now.getTimezoneOffset() * 60000;
    return new Date(now - tzoffset).toISOString().split('T')[0];
}
let currentDate = getTodayString();

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
        labels: ["タンパク質", "脂質", "炭水化物"],
        datasets: [{
            data: [0, 0, 0],
            backgroundColor: ["#FF6384", "#FFCE56", "#36A2EB"] // 色を付けると見やすくなります
        }]
    },
    plugins: [ChartDataLabels], // プラグインを登録
    options: {
        responsive: true,
        maintainAspectRatio: false,
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
                    dataArr.map(data => { sum += data; });
                    if (sum === 0) return "";
                    return (value * 100 / sum).toFixed(1) + "%";
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
        let food = (typeof item === 'string') ? foods[item] : item;
        let displayName = (typeof item === 'string') ? item : item.name;

        let row = document.createElement("tr");

        // 「定番へ」ボタンの列を追加
        row.innerHTML =
            "<td>" + displayName + "</td>" +
            "<td>" + food.p + "</td>" +
            "<td>" + food.f + "</td>" +
            "<td>" + food.c + "</td>" +
            "<td>" + food.k.toFixed(0) + "</td>" +
            '<td><button onclick="addPresetFromHistory(' + index + ')" style="background-color:#2196F3; color:white; border:none; border-radius:3px;">追加</button></td>' +
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
    if (!currentUser) return;
    try {
        // "records" というフォルダの中の "2026-03-13" などの日付ファイルに保存する
        await setDoc(doc(db, "users", currentUser.uid, "records", currentDate), {
            total: total,
            history: history
        });
        console.log(`${currentDate} のデータを保存しました！`);
    } catch (e) {
        console.error("保存エラー: ", e);
    }
}

async function loadData() {
    if (!currentUser) return;
    try {
        // 現在選択されている日付（currentDate）のデータを読み込む
        const docSnap = await getDoc(doc(db, "users", currentUser.uid, "records", currentDate));
        if (docSnap.exists()) {
            const data = docSnap.data();
            total = data.total || {p:0, f:0, c:0, k:0};
            history = data.history || [];
        } else {
            // その日のデータが無ければ0にリセット
            total = {p:0, f:0, c:0, k:0};
            history = [];
        }
        updateDisplay();
        updateChart();
        updateHistory();
        console.log(`${currentDate} のデータを読み込みました！`);
    } catch (e) {
        console.error("読み込みエラー: ", e);
    }
    // 🌟 catchの外側でグラフを更新する
    updateWeeklyChart();
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

async function changeDate() {
    currentDate = document.getElementById("datePicker").value;
    
    // 一旦画面の数字をゼロにしてから、新しい日付のデータを読み込む
    total = {p:0, f:0, c:0, k:0};
    history = [];
    updateDisplay();
    updateChart();
    updateHistory();
    
    await loadData();
}

// 🌟 既存の window.~ のリストに1行追加
window.changeDate = changeDate;


// 🌟 既存の onAuthStateChanged の中身を少しだけ修正
onAuthStateChanged(auth, (user) => {
    const loginScreen = document.getElementById("loginScreen");
    const appScreen = document.getElementById("appScreen");

    if (user) {
        currentUser = user;
        document.getElementById("userName").innerText = user.displayName + " さん";
        loginScreen.style.display = "none";
        appScreen.style.display = "block";
        
        // （追加）ログイン時にカレンダーの初期値を今日にセットする
        document.getElementById("datePicker").value = currentDate;
        loadPresets();
        loadData();
    } else {
        // ========== ログアウト状態のとき ==========
        currentUser = null;
        
        // 🌟 画面の切り替え：アプリ画面を隠して、ログイン画面を出す！
        appScreen.style.display = "none";
        loginScreen.style.display = "block";
        
        // 画面の数字をゼロにリセットする
        total = {p:0, f:0, c:0, k:0};
        history = [];
        updateDisplay();
        updateChart();
        updateHistory();
    }
});

// 🌟 過去7日分のデータを取得して棒グラフを表示する関数
async function updateWeeklyChart() {
    if (!currentUser) return;

    const labels = [];
    const kcalData = [];

    // 今日から遡って7日分のデータを準備
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        const tzoffset = d.getTimezoneOffset() * 60000;
        const dateObj = new Date(d - tzoffset - (i * 24 * 60 * 60 * 1000));
        const dateStr = dateObj.toISOString().split('T')[0];
        
        labels.push(dateStr.slice(5)); // "2026-03-13" -> "03-13" のように短くする

        // Firebaseからその日のデータを取得
        const docSnap = await getDoc(doc(db, "users", currentUser.uid, "records", dateStr));
        if (docSnap.exists()) {
            kcalData.push(docSnap.data().total.k);
        } else {
            kcalData.push(0); // データがない日は0
        }
    }

    const ctxWeekly = document.getElementById("weeklyChart").getContext("2d");

    // すでにグラフがあれば壊して作り直す（重複防止）
    if (weeklyChart) {
        weeklyChart.destroy();
    }

    weeklyChart = new Chart(ctxWeekly, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: '摂取カロリー (kcal)',
                data: kcalData,
                backgroundColor: '#4CAF50'
            }]
        },
        options: {
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
}

// ====== 入力方法切り替え機能 ======
function switchInputMethod(areaId) {
    // 1. 全ての入力エリアを一旦隠す
    document.getElementById('presetArea').style.display = 'none';
    document.getElementById('customArea').style.display = 'none';
    document.getElementById('aiArea').style.display = 'none';

    // 2. 全てのタブから 'active-tab' クラス（緑色の背景）を外す
    document.getElementById('tab-preset').classList.remove('active-tab');
    document.getElementById('tab-custom').classList.remove('active-tab');
    document.getElementById('tab-ai').classList.remove('active-tab');

    // 3. 選ばれたエリアだけを表示する
    document.getElementById(areaId).style.display = 'block';
    
    // 4. 選ばれたタブを緑色にする
    if (areaId === 'presetArea') document.getElementById('tab-preset').classList.add('active-tab');
    if (areaId === 'customArea') document.getElementById('tab-custom').classList.add('active-tab');
    if (areaId === 'aiArea') document.getElementById('tab-ai').classList.add('active-tab');
}

// 履歴から定番に追加する関数
async function addPresetFromHistory(index) {
    let item = history[index];
    let food = (typeof item === 'string') ? foods[item] : item;
    let displayName = (typeof item === 'string') ? item : item.name;

    // AI追加時に付く「[AI] 」の文字を取り除く
    let cleanName = displayName.replace(/^\[AI\]\s*/, '');

    await saveToPresets(cleanName, parseFloat(food.p)||0, parseFloat(food.f)||0, parseFloat(food.c)||0, parseFloat(food.k)||0);
    alert("「" + cleanName + "」を定番リストに追加しました！");
}

async function saveToPresets(name, p, f, c, k) {
    if (!currentUser) return;
    
    // すでに同じ名前が登録されていたらスキップ
    if (foods[name]) return; 

    // メモリ上のリストに追加
    foods[name] = { p: p, f: f, c: c, k: k };

    // ドロップダウン（select）に追加
    const select = document.getElementById("food");
    const option = document.createElement("option");
    option.value = name;
    option.text = name;
    select.appendChild(option);

    // Firebaseに保存
    const presetId = "custom_" + Date.now();
    try {
        await setDoc(doc(db, "users", currentUser.uid, "presets", presetId), {
            name: name, p: p, f: f, c: c, k: k
        });
    } catch (e) {
        console.error("定番保存エラー: ", e);
    }
}

async function loadPresets() {
    if (!currentUser) return;
    try {
        const q = query(collection(db, "users", currentUser.uid, "presets"));
        const querySnapshot = await getDocs(q);
        const select = document.getElementById("food");

        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const name = data.name;

            // まだリストになければ追加する
            if (!foods[name]) {
                foods[name] = { p: data.p, f: data.f, c: data.c, k: data.k };
                const option = document.createElement("option");
                option.value = name;
                option.text = name;
                select.appendChild(option);
            }
        });
    } catch (e) {
        console.error("定番読み込みエラー: ", e);
    }
}

// ====== HTMLから関数を呼び出せるようにする設定 ======
window.addFood = addFood;
window.addCustomFood = addCustomFood;
window.removeFood = removeFood;
window.addAiFood = addAiFood;
window.clearAiLogs = clearAiLogs;
window.login = login;  
window.logout = logout;
window.switchInputMethod = switchInputMethod;
window.addPresetFromHistory = addPresetFromHistory;