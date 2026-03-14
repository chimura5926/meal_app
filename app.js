import { db, auth } from "./firebase.js";
import { doc, setDoc, getDoc, collection, query, limit, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
let currentUser = null;
let weeklyChart;
let foods = {};

function getTodayString() {
    const now = new Date();
    // 日本時間でのズレを防ぐための処理
    const tzoffset = now.getTimezoneOffset() * 60000;
    return new Date(now - tzoffset).toISOString().split('T')[0];
}
let currentDate = getTodayString();

let target = { p:0, f:0, c:0, k:0 };

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
                    size: 20
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
    
    // 何も選択されていない（定番が空の）場合は処理を止める
    if (!f) {
        alert("追加する定番メニューがありません。履歴から登録してください。");
        return;
    }

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
    updateWeeklyChart();
}

function updateDisplay(){
    // 🌟追加：目標（target）の数字を画面のテーブルに反映する
    document.getElementById("targetP").innerText = target.p.toFixed(1);
    document.getElementById("targetF").innerText = target.f.toFixed(1);
    document.getElementById("targetC").innerText = target.c.toFixed(1);
    document.getElementById("targetK").innerText = target.k.toFixed(0);

    // 現在の合計
    document.getElementById("p").innerText = total.p.toFixed(1);
    document.getElementById("f").innerText = total.f.toFixed(1);
    document.getElementById("c").innerText = total.c.toFixed(1);
    document.getElementById("kcal").innerText = total.k.toFixed(0);

    // 残り
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
    updateWeeklyChart();
}

// 既存の updateHistory 関数を、カスタムデータに対応するよう書き換え
// app.js の updateHistory 関数を以下に差し替え
function updateHistory(){
    let tbody = document.getElementById("history");
    tbody.innerHTML = "";

    history.forEach((item, index) => {
        let food = (typeof item === 'string') ? foods[item] : item;
        let displayName = (typeof item === 'string') ? item : item.name;

        // 🌟 追加：AIの接頭辞を外した素の名前で、すでに定番(foods)に存在するかチェック
        let cleanName = displayName.replace(/^\[AI\]\s*/, '');
        let isAlreadyPreset = !!foods[cleanName]; 

        let row = document.createElement("tr");

        // 🌟 追加：登録済みならグレーのボタン、未登録なら青いボタンにする
        let presetBtnHtml = "";
        if (isAlreadyPreset) {
            presetBtnHtml = '<td><button disabled style="background-color:#ccc; color:#666; border:none; border-radius:3px; cursor:not-allowed;">✓</button></td>';
        } else {
            presetBtnHtml = '<td><button onclick="addPresetFromHistory(' + index + ')" style="background-color:#2196F3; color:white; border:none; border-radius:3px; cursor:pointer;">✓</button></td>';
        }

        row.innerHTML =
            '<td class="food-name" title="' + displayName + '">' + displayName + "</td>" +
            "<td>" + food.p + "</td>" +
            "<td>" + food.f + "</td>" +
            "<td>" + food.c + "</td>" +
            "<td>" + food.k.toFixed(0) + "</td>" +
            presetBtnHtml + // 🌟 ここで先ほど作ったボタンを入れる
            '<td><button onclick="removeFood(' + index + ')" style="background-color:#2196F3; color:white; border:none; border-radius:3px; cursor:pointer;">✓</button></td>';        tbody.appendChild(row);
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
    updateWeeklyChart();
    
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

        // エラーが返ってきていたら処理を止めて知らせる
        if (food.error) {
            console.error("APIエラー:", food);
            status.innerText = "解析に失敗しました";
            alert("エラー: " + food.error + "\n" + (food.raw_text || ""));
            return;
        }

        // addAiLog(food);

        // ★最重要修正ポイント：AIの回答を確実に数値(Number)に変換して変数に入れておく
        const pVal = parseFloat(food.p) || 0;
        const fVal = parseFloat(food.f) || 0;
        const cVal = parseFloat(food.c) || 0;
        const kVal = parseFloat(food.k) || 0;

        // 合計に数値を足す
        total.p += pVal;
        total.f += fVal;
        total.c += cVal;
        total.k += kVal;

        // 履歴に追加（ここでも先ほど作った数値の変数を入れる！）
        history.push({ 
            name: "[AI] " + food.name, 
            p: pVal, 
            f: fVal, 
            c: cVal, 
            k: kVal 
        });
        
        // 既存の更新関数を呼ぶ
        updateDisplay();
        updateChart();
        updateHistory();
        saveData();
        updateWeeklyChart();

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
// function addAiLog(message) {
//     const logContainer = document.getElementById("aiLogContent");
//     if (!logContainer) return;

//     const logItem = document.createElement("div");
//     logItem.style.borderBottom = "1px solid #ddd";
//     logItem.style.padding = "5px 0";
    
//     // 時間を取得して見やすくする
//     const now = new Date();
//     const timeStr = now.getHours() + ":" + String(now.getMinutes()).padStart(2, '0') + ":" + String(now.getSeconds()).padStart(2, '0');
    
//     // データがJSON(オブジェクト)の場合は文字列に変換、それ以外はそのまま表示
//     const displayMsg = typeof message === 'object' ? JSON.stringify(message, null, 2) : message;

//     // 時間とメッセージを設定
//     logItem.innerText = `[${timeStr}]\n${displayMsg}`;
    
//     // prependを使うことで、新しいログが「一番上」に追加されるようにします
//     logContainer.prepend(logItem); 
// }

// // ログをすべて消去する関数
// function clearAiLogs() {
//     const logContainer = document.getElementById("aiLogContent");
//     if (logContainer) {
//         logContainer.innerHTML = ""; // 中身を空っぽにする
//     }
// }

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
onAuthStateChanged(auth, async (user) => {
    const loginScreen = document.getElementById("loginScreen");
    const profileScreen = document.getElementById("profileScreen"); // 追加
    const appScreen = document.getElementById("appScreen");

    if (user) {
        currentUser = user;
        // document.getElementById("userName").innerText = user.displayName + " さん";
        loginScreen.style.display = "none";
        
        // 🌟 プロフィールが登録されているかチェック
        const profileRef = doc(db, "users", currentUser.uid, "profile", "data");
        const profileSnap = await getDoc(profileRef);
        
        if (profileSnap.exists()) {
            // 【登録済み】保存されている目標値をセットしてアプリ画面へ
            target = profileSnap.data().target;
            profileScreen.style.display = "none";
            appScreen.style.display = "block";
            
            document.getElementById("datePicker").value = currentDate;
            loadPresets();
            loadData();
        } else {
            // 【未登録】プロフィール設定画面を表示
            appScreen.style.display = "none";
            profileScreen.style.display = "block";
        }

    } else {
        // ========== ログアウト状態のとき ==========
        currentUser = null;
        appScreen.style.display = "none";
        profileScreen.style.display = "none"; // 追加
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
    const pData = [];
    const fData = [];
    const cData = [];

    // 今日から遡って7日分のデータを準備
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        const tzoffset = d.getTimezoneOffset() * 60000;
        const dateObj = new Date(d - tzoffset - (i * 24 * 60 * 60 * 1000));
        const dateStr = dateObj.toISOString().split('T')[0];
        
        labels.push(dateStr.slice(5)); // "2026-03-13" -> "03-13"

        // ★ 今日(表示している日付)の場合は、即座に画面の合計値を使う（ラグを無くすため）
        if (dateStr === currentDate) {
            pData.push(total.p * 4);
            fData.push(total.f * 9);
            cData.push(total.c * 4);
        } else {
            // 過去の日はFirebaseから取得
            const docSnap = await getDoc(doc(db, "users", currentUser.uid, "records", dateStr));
            if (docSnap.exists() && docSnap.data().total) {
                const t = docSnap.data().total;
                pData.push((t.p || 0) * 4);
                fData.push((t.f || 0) * 9);
                cData.push((t.c || 0) * 4);
            } else {
                pData.push(0);
                fData.push(0);
                cData.push(0);
            }
        }
    }

    const ctxWeekly = document.getElementById("weeklyChart").getContext("2d");

    // すでにグラフがあれば壊して作り直す
    if (weeklyChart) {
        weeklyChart.destroy();
    }

    weeklyChart = new Chart(ctxWeekly, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: 'タンパク質', data: pData, backgroundColor: '#FF6384' },
                { label: '脂質', data: fData, backgroundColor: '#FFCE56' },
                { label: '炭水化物', data: cData, backgroundColor: '#36A2EB' }
            ]
        },
        options: {
            responsive: true,
            scales: {
                x: { stacked: true }, // X軸を積み上げにする
                y: { stacked: true, beginAtZero: true } // Y軸を積み上げにする
            },
            plugins: {
                datalabels: {
                    display: false // 円グラフ用のパーセント表示がこちらに混ざらないように非表示
                }
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
    
    // 🌟 これを追加：追加直後に履歴テーブルを描画し直して、ボタンをグレーにする
    updateHistory(); 
}

async function saveToPresets(name, p, f, c, k) {
    if (!currentUser) return;
    
    if (foods[name]) return; 

    foods[name] = { p: p, f: f, c: c, k: k };

    const select = document.getElementById("food");
    
    // 最初の「定番がありません」というダミー選択肢があれば消す
    if (select.options.length > 0 && select.options[0].value === "") {
        select.remove(0);
    }

    const option = document.createElement("option");
    option.value = name;
    option.text = name;
    select.appendChild(option);

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

            if (!foods[name]) {
                foods[name] = { p: data.p, f: data.f, c: data.c, k: data.k };
                
                // ダミーの選択肢があれば消す
                if (select.options.length > 0 && select.options[0].value === "") {
                    select.remove(0);
                }

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

async function saveProfile() {
    if (!currentUser) return;

    // 1. 画面から入力値を取得
    const gender = document.querySelector('input[name="gender"]:checked').value;
    const age = parseInt(document.getElementById("profAge").value);
    const height = parseFloat(document.getElementById("profHeight").value);
    const weight = parseFloat(document.getElementById("profWeight").value);
    const activity = parseFloat(document.getElementById("profActivity").value);
    const goal = document.getElementById("profGoal").value;

    // 未入力チェック
    if (!age || !height || !weight) {
        alert("年齢、身長、体重をすべて入力してください。");
        return;
    }

    // 2. 基礎代謝 (BMR) の計算 (ミフリン・セントジョールの方程式)
    let bmr = (10 * weight) + (6.25 * height) - (5 * age);
    bmr += (gender === "male") ? 5 : -161;

    // 3. 1日の総消費カロリー (TDEE) と 目的別の調整
    let tdee = bmr * activity;
    let targetKcal = tdee;
    if (goal === "lose") targetKcal -= 300; // 減量は-300kcal
    if (goal === "gain") targetKcal += 300; // 増量は+300kcal

    // 4. PFCバランスの計算
    // P (タンパク質): 筋肉維持のため体重1kgあたり2g (1g=4kcal)
    let targetP;
    if (goal === "maintain") {
        targetP = weight * 0.8; // 現状維持
    } else {
        targetP = weight * 1.6; // 減量期・増量期
    }
    const pKcal = targetP * 4;

    // F (脂質): ホルモンバランス維持のため総カロリーの25% (1g=9kcal)
    const fKcal = targetKcal * 0.25;
    const targetF = fKcal / 9;

    // C (炭水化物): 残りのカロリーすべて (1g=4kcal)
    const cKcal = targetKcal - pKcal - fKcal;
    const targetC = cKcal / 4;

    // アプリの変数にセット
    target = {
        p: targetP,
        f: targetF,
        c: targetC,
        k: targetKcal
    };

    try {
        // 5. データベース (Firestore) にプロフィールと目標を保存
        await setDoc(doc(db, "users", currentUser.uid, "profile", "data"), {
            gender: gender,
            age: age,
            height: height,
            weight: weight,
            activity: activity,
            goal: goal,
            target: target
        });

        alert("あなた専用の目標を設定しました！");

        // 6. 画面を切り替えてアプリを開始
        document.getElementById("profileScreen").style.display = "none";
        document.getElementById("appScreen").style.display = "block";
        
        document.getElementById("datePicker").value = currentDate;
        loadPresets();
        await loadData(); // これを呼ぶことで updateDisplay() も実行される

    } catch (error) {
        console.error("プロフィールの保存エラー:", error);
        alert("保存に失敗しました。");
    }
}

async function editProfile() {
    if (!currentUser) return;

    // 1. データベースから現在のプロフィールを取得して入力欄にセットする
    try {
        const profileRef = doc(db, "users", currentUser.uid, "profile", "data");
        const profileSnap = await getDoc(profileRef);

        if (profileSnap.exists()) {
            const data = profileSnap.data();
            
            // 性別
            if (data.gender) {
                document.querySelector(`input[name="gender"][value="${data.gender}"]`).checked = true;
            }
            // 年齢、身長、体重
            if (data.age) document.getElementById("profAge").value = data.age;
            if (data.height) document.getElementById("profHeight").value = data.height;
            if (data.weight) document.getElementById("profWeight").value = data.weight;
            
            // 運動量、目的
            if (data.activity) document.getElementById("profActivity").value = data.activity;
            if (data.goal) document.getElementById("profGoal").value = data.goal;
        }
    } catch (e) {
        console.error("プロフィール読み込みエラー: ", e);
    }

    // 2. アプリ画面を隠して、プロフィール画面を表示する
    document.getElementById("appScreen").style.display = "none";
    document.getElementById("profileScreen").style.display = "block";
    
    // 3. ボタンの文字を「更新する」に変更（わかりやすさのため）
    const submitBtn = document.querySelector("#profileScreen button");
    if(submitBtn) submitBtn.innerText = "設定を更新する";
}

// ====== HTMLから関数を呼び出せるようにする設定 ======
window.addFood = addFood;
window.addCustomFood = addCustomFood;
window.removeFood = removeFood;
window.addAiFood = addAiFood;
// window.clearAiLogs = clearAiLogs;
window.login = login;  
window.logout = logout;
window.switchInputMethod = switchInputMethod;
window.addPresetFromHistory = addPresetFromHistory;
window.saveProfile = saveProfile;
window.editProfile = editProfile;

// 1. iPhoneかどうかを判定
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

// 2. すでにホーム画面からアプリとして起動しているかを判定
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

// もしすでにアプリとして開かれていたら、インストールボタンを隠す
if (isStandalone) {
    const installBtn = document.getElementById('installBtn');
    if (installBtn) installBtn.style.display = 'none';
}

// 3. Android用のインストール確認画面を「保留」しておく変数
let deferredPrompt;

// ブラウザが「インストールできるよ」と判断した時に発動するイベント（主にAndroid）
window.addEventListener('beforeinstallprompt', (e) => {
    // 勝手にインストール画面が出るのを防ぐ
    e.preventDefault();
    // イベントを後で使えるように保存
    deferredPrompt = e;
});

// 4. ボタンが押された時の処理
function installApp() {
    if (deferredPrompt) {
        // Androidの場合：保留しておいたインストール画面を出す
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                // インストールしてくれたらボタンを隠す
                document.getElementById('installBtn').style.display = 'none';
            }
            deferredPrompt = null;
        });
    } else if (isIOS) {
        // iPhoneの場合：やり方をポップアップで教える
        alert("【iPhoneでのアプリ追加方法】\n\n画面下にある「共有ボタン（四角から上向きの矢印）」をタップし、メニューから「ホーム画面に追加」を選んでください！");
    } else {
        // それ以外（PCの非対応ブラウザなど）
        alert("ブラウザのメニューから「ホーム画面に追加」または「アプリをインストール」を選んでください。");
    }
}

// HTMLのボタンからこの関数を呼べるように紐付ける
window.installApp = installApp;

// ====== 晩御飯提案機能（コサイン類似度） ======

// 1. JSONデータを読み込んで保存しておく変数
let dinnerMenuDB = [];

// 2. JSONファイルを読み込む関数
async function loadDinnerMenuDB() {
    try {
        const response = await fetch('dinnerMenuDB.json');
        dinnerMenuDB = await response.json();
        console.log("晩御飯DBを読み込みました！", dinnerMenuDB.length, "件");
    } catch (e) {
        console.error("晩御飯DBの読み込みエラー:", e);
    }
}

// アプリ起動時に読み込むように実行
loadDinnerMenuDB();

// 3. コサイン類似度を計算する関数
function calculateCosineSimilarity(remain, menu) {
    // 全体のグラム数を計算
    const remainTotal = remain.p + remain.f + remain.c;
    const menuTotal = menu.p + menu.f + menu.c;

    // 残りが0の場合はエラーを防ぐために0を返す
    if (remainTotal === 0 || menuTotal === 0) return 0;

    // それぞれが全体に占める割合（0.0 〜 1.0）を出す
    const rP = remain.p / remainTotal;
    const rF = remain.f / remainTotal;
    const rC = remain.c / remainTotal;

    const mP = menu.p / menuTotal;
    const mF = menu.f / menuTotal;
    const mC = menu.c / menuTotal;

    // 割合のズレの絶対値をすべて足す
    const diff = Math.abs(rP - mP) + Math.abs(rF - mF) + Math.abs(rC - mC);

    // 1.0（100%）から、ズレの半分を引く（全く同じ比率なら1.0になる）
    return Math.max(0, 1 - (diff / 2));
}

// 4. 残りPFCからトップ3を計算して返す関数
function suggestDinner() {
    // 今の「残りPFC」を計算（マイナスの場合は0にしておく）
    const remainP = Math.max(0, target.p - total.p);
    const remainF = Math.max(0, target.f - total.f);
    const remainC = Math.max(0, target.c - total.c);
    
    const remainVector = { p: remainP, f: remainF, c: remainC };

    // 全メニューに対してコサイン類似度を計算
    const scoredMenus = dinnerMenuDB.map(menu => {
        const similarity = calculateCosineSimilarity(remainVector, menu);
        return {
            ...menu,
            similarity: similarity
        };
    });

    // 類似度が高い順（1に近い順）に並び替え
    scoredMenus.sort((a, b) => b.similarity - a.similarity);

    // 上位3つを取得
    const top3 = scoredMenus.slice(0, 3);
    
    // 開発者ツール（コンソール）で結果を確認するため出力
    console.log("【今の残りPFC】", remainVector);
    console.log("【提案トップ3】", top3);
    
    return top3;
}

// テスト用にグローバルから呼べるようにしておく
window.suggestDinner = suggestDinner;

// ====== ドロワーの開閉と提案メニューの表示 ======

function toggleDinnerDrawer() {
    const drawer = document.getElementById("dinnerDrawer");
    
    // クラスを付け替えてスライドさせる
    if (drawer.classList.contains("drawer-closed")) {
        // 開くときの処理
        drawer.classList.remove("drawer-closed");
        drawer.classList.add("drawer-open");
        
        // 開いた瞬間に、最新の残りPFCで提案を計算して画面に描画する
        renderSuggestions();
    } else {
        // 閉じるときの処理
        drawer.classList.remove("drawer-open");
        drawer.classList.add("drawer-closed");
    }
}

function renderSuggestions() {
    const top3 = suggestDinner(); // 先ほど作った計算関数を呼ぶ
    const listDiv = document.getElementById("suggestList");
    
    listDiv.innerHTML = ""; // 以前の表示を一旦リセット
    
    if (top3.length === 0) {
        listDiv.innerHTML = "<p>データがありません。</p>";
        return;
    }

    // 取得した3つのメニューをカード形式でHTMLに挿入していく
    top3.forEach((menu, index) => {
        const card = document.createElement("div");
        card.className = "suggest-card";
        
        // 類似度(1に近いほどマッチ)をパーセンテージ風に変換しておく（おまけ）
        const matchPercent = Math.round(menu.similarity * 100);

        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                <h4 style="margin: 0; font-size: 15px; padding-right: 8px;"><span style="color:#ff9800;">${index + 1}位</span> ${menu.name}</h4>
                <span style="font-size: 11px; font-weight: bold; color: #4CAF50; background: #e8f5e9; padding: 2px 6px; border-radius: 4px; white-space: nowrap; flex-shrink: 0;">一致度: ${matchPercent}%</span>
            </div>
            
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); text-align: center; background: white; padding: 6px; border-radius: 6px; border: 1px solid #eee; margin-bottom: 8px;">
                <div style="border-right: 1px solid #eee;">
                    <div style="font-size: 10px; color: #999;">P</div>
                    <div style="font-size: 13px; font-weight: bold; color: #FF6384;">${menu.p}g</div>
                </div>
                <div style="border-right: 1px solid #eee;">
                    <div style="font-size: 10px; color: #999;">F</div>
                    <div style="font-size: 13px; font-weight: bold; color: #FFCE56;">${menu.f}g</div>
                </div>
                <div style="border-right: 1px solid #eee;">
                    <div style="font-size: 10px; color: #999;">C</div>
                    <div style="font-size: 13px; font-weight: bold; color: #36A2EB;">${menu.c}g</div>
                </div>
                <div>
                    <div style="font-size: 10px; color: #999;">kcal</div>
                    <div style="font-size: 13px; font-weight: bold; color: #555;">${menu.k}</div>
                </div>
            </div>

            <button onclick="addSuggestedDinner('${menu.name}', ${menu.p}, ${menu.f}, ${menu.c}, ${menu.k})" style="width: 100%; padding: 8px; background-color: #ff9800; color: white; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 14px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                食事履歴に追加
            </button>
        `;
        
        listDiv.appendChild(card);
    });
}

window.toggleDinnerDrawer = toggleDinnerDrawer;

function addSuggestedDinner(name, p, f, c, k) {
    // 1. 今の合計に足し算
    total.p += p;
    total.f += f;
    total.c += c;
    total.k += k;

    // 2. 履歴にデータを追加（名前の前に [提案] と付けておくとわかりやすいです）
    history.push({
        name: "[提案] " + name,
        p: p,
        f: f,
        c: c,
        k: k
    });

    // 3. アプリの画面とデータベースを更新
    updateDisplay();
    updateChart();
    updateHistory();
    saveData();
    updateWeeklyChart();

    // 4. ドロワーを閉じる（※アラートは削除してスムーズにしました！）
    toggleDinnerDrawer();
}

// HTMLからこの関数を呼べるようにする
window.addSuggestedDinner = addSuggestedDinner;