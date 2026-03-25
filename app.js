import { db, auth } from "./firebase.js";
import { doc, setDoc, getDoc, collection, query, limit, getDocs, orderBy, deleteDoc, where } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
let currentUser = null;
let weeklyChart;
let twoMonthChart;
let waterWeeklyChart; // ★ 水分グラフ用
let foods = {};
let currentWeight = null;
let notifyEnabled = false;
let notifyTime = "20:00";
let notifyInterval = null;
let lastNotifiedDate = null;

function getTodayString() {
    const now = new Date();
    const tzoffset = now.getTimezoneOffset() * 60000;
    return new Date(now - tzoffset).toISOString().split('T')[0];
}
let currentDate = getTodayString();

let target = { p:0, f:0, c:0, k:0, water: 0 };
let total = { p:0, f:0, c:0, k:0, water: 0 };

const ctx = document.getElementById("pfcChart");
const chart = new Chart(ctx, {
    type: "pie",
    data: {
        labels: ["タンパク質", "脂質", "炭水化物"],
        datasets: [{
            data: [0, 0, 0],
            backgroundColor: ["#FF6384", "#FFCE56", "#36A2EB"]
        }]
    },
    plugins: [ChartDataLabels],
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            datalabels: {
                color: '#fff',
                font: { weight: 'bold', size: 20 },
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
    if (!f) {
        alert("追加する定番メニューがありません。履歴から登録してください。");
        return;
    }

    let amount = parseFloat(document.getElementById("presetAmount").value) || 1;
    let food = foods[f];

    let p = food.p * amount;
    let f_val = food.f * amount;
    let c = food.c * amount;
    let k = food.k * amount;

    total.p += p;
    total.f += f_val;
    total.c += c;
    total.k += k;

    let displayName = amount !== 1 ? `${f} (${amount}人前)` : f;
    history.push({ name: displayName, p: p, f: f_val, c: c, k: k });

    updateDisplay();
    updateChart();
    updateHistory();
    saveData();
    updateWeeklyChart();
}

function updateDisplay(){
    document.getElementById("targetP").innerHTML = formatNum(target.p, false);
    document.getElementById("targetF").innerHTML = formatNum(target.f, false);
    document.getElementById("targetC").innerHTML = formatNum(target.c, false);
    document.getElementById("targetK").innerHTML = formatNum(target.k, true);

    document.getElementById("p").innerHTML = formatNum(total.p, false);
    document.getElementById("f").innerHTML = formatNum(total.f, false);
    document.getElementById("c").innerHTML = formatNum(total.c, false);
    document.getElementById("kcal").innerHTML = formatNum(total.k, true);

    document.getElementById("remainP").innerHTML = formatNum(target.p-total.p, false);
    document.getElementById("remainF").innerHTML = formatNum(target.f-total.f, false);
    document.getElementById("remainC").innerHTML = formatNum(target.c-total.c, false);
    document.getElementById("remainK").innerHTML = formatNum(target.k-total.k, true);

    // ★ 水分の表示更新 (そのまま)
    document.getElementById("targetWater").innerText = target.water ? target.water.toFixed(0) : 0;
    document.getElementById("currentWater").innerText = total.water ? total.water.toFixed(0) : 0;
    
    let waterPercent = 0;
    if (target.water && target.water > 0) {
        waterPercent = Math.min(100, ((total.water || 0) / target.water) * 100);
    }
    const waterBar = document.getElementById("waterProgressBar");
    if (waterBar) waterBar.style.width = waterPercent + "%";
}

function formatNum(value, isKcal) {
    // isKcalが true ならカロリー(整数)、false ならPFC(小数第1位)にする
    let str = value.toFixed(isKcal ? 0 : 1);
    
    // 文字数が4文字以上（例: "2200", "120.5", "-150" など）の場合
    if (str.length >= 4) {
        return `<span style="font-size: 11px; white-space: nowrap;">${str}</span>`;
    }
    // 3文字以下なら通常のサイズのまま改行だけ防ぐ
    return `<span style="white-space: nowrap;">${str}</span>`;
}

function updateChart(){
    chart.data.datasets[0].data = [
        Math.max(0, total.p * 4),
        Math.max(0, total.f * 9),
        Math.max(0, total.c * 4)
    ];
    chart.update();
}

function addCustomFood() {
    const name = document.getElementById("customName").value;
    if (!name) { alert("名前を入力してください"); return; }

    const amount = parseFloat(document.getElementById("customAmount").value) || 1;
    const p = (parseFloat(document.getElementById("customP").value) || 0) * amount;
    const f = (parseFloat(document.getElementById("customF").value) || 0) * amount;
    const c = (parseFloat(document.getElementById("customC").value) || 0) * amount;
    const k = (p * 4) + (f * 9) + (c * 4);

    total.p += p;
    total.f += f;
    total.c += c;
    total.k += k;

    let displayName = amount !== 1 ? `${name} (${amount}倍)` : name;
    history.push({ isCustom: true, name: displayName, p: p, f: f, c: c, k: k });

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

function updateHistory(){
    let tbody = document.getElementById("history");
    tbody.innerHTML = "";

    history.forEach((item, index) => {
        let food = (typeof item === 'string') ? foods[item] : item;
        let displayName = (typeof item === 'string') ? item : item.name;

        let cleanName = displayName.replace(/^\[AI\]\s*/, '');
        let isAlreadyPreset = !!foods[cleanName]; 

        let row = document.createElement("tr");

        let presetBtnHtml = "";
        if (isAlreadyPreset) {
            presetBtnHtml = '<td><button disabled style="background-color:#ccc; color:#666; border:none; border-radius:3px; cursor:not-allowed;">✓</button></td>';
        } else {
            presetBtnHtml = '<td><button onclick="addPresetFromHistory(' + index + ')" style="background-color:#2196F3; color:white; border:none; border-radius:3px; cursor:pointer;">✓</button></td>';
        }

        row.innerHTML =
            '<td class="food-name" onclick="showFoodNamePopup(\'' + displayName.replace(/'/g, "\\'") + '\')" style="color: #333; cursor: pointer;">' + displayName + "</td>" +
            // 修正: 各値に .toFixed(1) を適用（エラー防止のためにparseFloatを使用）
            "<td>" + formatNum(parseFloat(food.p), false) + "</td>" +
            "<td>" + formatNum(parseFloat(food.f), false) + "</td>" +
            "<td>" + formatNum(parseFloat(food.c), false) + "</td>" +
            "<td>" + formatNum(parseFloat(food.k), true) + "</td>" +
            presetBtnHtml +
            '<td><button onclick="removeFood(' + index + ')" style="background-color:#F44336; color:white; border:none; border-radius:3px; cursor:pointer; font-size: 14px; padding: 4px 6px;">🗑️</button></td>';        
        tbody.appendChild(row);    });
}

function removeFood(index){
    let item = history[index];
    let food = (typeof item === 'string') ? foods[item] : item;

    total.p -= food.p;
    total.f -= food.f;
    total.c -= food.c;
    total.k -= food.k;

    history.splice(index, 1);

    if (history.length === 0) {
        let currentWater = total.water || 0;
        total = { p: 0, f: 0, c: 0, k: 0, water: currentWater };
    } else {
        total.p = Math.max(0, total.p);
        total.f = Math.max(0, total.f);
        total.c = Math.max(0, total.c);
        total.k = Math.max(0, total.k);
    }

    updateDisplay();
    updateChart();
    updateHistory();
    saveData();
    updateWeeklyChart();
}

async function addAiFood() {
    let text = document.getElementById("aiText").value;
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
        const response = await fetch('/api/estimate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, image: base64Image?.split(',')[1] })
        });

        const food = await response.json();

        if (food.error) {
            console.error("APIエラー:", food);
            status.innerText = "解析に失敗しました";
            alert("エラー: " + food.error + "\n" + (food.raw_text || ""));
            return;
        }

        const pVal = parseFloat(food.p) || 0;
        const fVal = parseFloat(food.f) || 0;
        const cVal = parseFloat(food.c) || 0;
        const kVal = parseFloat(food.k) || 0;

        total.p += pVal;
        total.f += fVal;
        total.c += cVal;
        total.k += kVal;

        history.push({ 
            name: "[AI] " + food.name, 
            p: pVal, 
            f: fVal, 
            c: cVal, 
            k: kVal 
        });
        
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

const toBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
});

async function saveData() {
    if (!currentUser) return;
    try {
        await setDoc(doc(db, "users", currentUser.uid, "records", currentDate), {
            total: total,
            history: history,
            weight: currentWeight
        });
        console.log(`${currentDate} のデータを保存しました！`);
    } catch (e) {
        console.error("保存エラー: ", e);
    }
}

async function loadData() {
    if (!currentUser) return;
    try {
        const docSnap = await getDoc(doc(db, "users", currentUser.uid, "records", currentDate));
        if (docSnap.exists()) {
            const data = docSnap.data();
            total = data.total || {p:0, f:0, c:0, k:0, water:0};
            if (typeof total.water === 'undefined') total.water = 0; 
            history = data.history || [];
            currentWeight = data.weight || null;
        } else {
            total = {p:0, f:0, c:0, k:0, water:0};
            history = [];
            currentWeight = null;
        }
        
        document.getElementById("dailyWeight").value = currentWeight || "";
        
        updateDisplay();
        updateChart();
        updateHistory();
        console.log(`${currentDate} のデータを読み込みました！`);
    } catch (e) {
        console.error("読み込みエラー: ", e);
    }
    updateWeeklyChart();
    updateTwoMonthChart();
}

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
    
    total = {p:0, f:0, c:0, k:0, water: 0}; 
    history = [];
    updateDisplay();
    updateChart();
    updateHistory();
    
    await loadData();
}

window.changeDate = changeDate;

onAuthStateChanged(auth, async (user) => {
    const loginScreen = document.getElementById("loginScreen");
    const profileScreen = document.getElementById("profileScreen");
    const appScreen = document.getElementById("appScreen");

    if (user) {
        currentUser = user;
        loginScreen.style.display = "none";
        
        const profileRef = doc(db, "users", currentUser.uid, "profile", "data");
        const profileSnap = await getDoc(profileRef);
        
        if (profileSnap.exists()) {
            const pData = profileSnap.data();
            target = pData.target;
            
            if (!target.water && pData.weight) {
                target.water = pData.weight * 35;
            }

            notifyEnabled = pData.notifyEnabled || false;
            notifyTime = pData.notifyTime || "20:00";
            
            profileScreen.style.display = "none";
            appScreen.style.display = "block";
            
            document.getElementById("datePicker").value = currentDate;
            loadPresets();
            loadData();
            startNotificationChecker();
        } else {
            appScreen.style.display = "none";
            profileScreen.style.display = "block";
        }

    } else {
        currentUser = null;
        if (notifyInterval) clearInterval(notifyInterval);
        appScreen.style.display = "none";
        profileScreen.style.display = "none";
        loginScreen.style.display = "block";
        
        total = {p:0, f:0, c:0, k:0, water:0};
        history = [];
        updateDisplay();
        updateChart();
        updateHistory();
    }
});

async function updateWeeklyChart() {
    if (!currentUser) return;

    const labels = [];
    const pData = [];
    const fData = [];
    const cData = [];
    const wData = [];
    const waterData = []; 

    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        const tzoffset = d.getTimezoneOffset() * 60000;
        const dateObj = new Date(d - tzoffset - (i * 24 * 60 * 60 * 1000));
        const dateStr = dateObj.toISOString().split('T')[0];
        
        labels.push(dateStr.slice(5));

        if (dateStr === currentDate) {
            pData.push(total.p * 4);
            fData.push(total.f * 9);
            cData.push(total.c * 4);
            wData.push(currentWeight || null);
            waterData.push(total.water || 0);
        } else {
            const docSnap = await getDoc(doc(db, "users", currentUser.uid, "records", dateStr));
            if (docSnap.exists()) {
                const data = docSnap.data();
                const t = data.total || {p:0, f:0, c:0, k:0, water:0};
                pData.push(t.p * 4);
                fData.push(t.f * 9);
                cData.push(t.c * 4);
                wData.push(data.weight || null);
                waterData.push(t.water || 0);
            } else {
                pData.push(0); fData.push(0); cData.push(0); wData.push(null); waterData.push(0);
            }
        }
    }

    const ctxWeekly = document.getElementById("weeklyChart").getContext("2d");
    if (weeklyChart) weeklyChart.destroy();

    weeklyChart = new Chart(ctxWeekly, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '体重 (kg)',
                    data: wData,
                    type: 'line',
                    borderColor: '#9C27B0',
                    backgroundColor: 'rgba(156, 39, 176, 0.2)',
                    yAxisID: 'y1',
                    tension: 0.2,
                    spanGaps: true,
                    order: 1
                },
                { label: 'タンパク質', data: pData, backgroundColor: '#FF6384', yAxisID: 'y', order: 2 },
                { label: '脂質', data: fData, backgroundColor: '#FFCE56', yAxisID: 'y', order: 2 },
                { label: '炭水化物', data: cData, backgroundColor: '#36A2EB', yAxisID: 'y', order: 2 }
            ]
        },
        options: {
            responsive: true,
            aspectRatio: 1.2,
            scales: {
                x: { stacked: true },
                y: { 
                    stacked: true, 
                    position: 'left',
                    title: { display: true, text: 'カロリー (kcal)', font: { size: 10 } }
                },
                y1: { 
                    position: 'right',
                    grid: { drawOnChartArea: false },
                    title: { display: true, text: '体重 (kg)', font: { size: 10 } }
                }
            },
            plugins: { datalabels: { display: false } }
        }
    });

    const ctxWater = document.getElementById("waterWeeklyChart").getContext("2d");
    if (waterWeeklyChart) waterWeeklyChart.destroy();

    const targetWaterArray = Array(7).fill(target.water || 0);

    waterWeeklyChart = new Chart(ctxWater, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '目標 (ml)',
                    data: targetWaterArray,
                    type: 'line',
                    borderColor: '#f44336',
                    borderWidth: 2,
                    pointRadius: 0,
                    borderDash: [5, 5],
                    fill: false,
                    order: 1
                },
                {
                    label: '水分量 (ml)',
                    data: waterData,
                    backgroundColor: '#42a5f5',
                    borderRadius: 4,
                    order: 2
                }
            ]
        },
        options: {
            responsive: true,
            aspectRatio: 2,
            scales: {
                x: { stacked: false },
                y: {
                    beginAtZero: true,
                    title: { display: true, text: '水分量 (ml)', font: { size: 10 } }
                }
            },
            plugins: { datalabels: { display: false } }
        }
    });
}

async function updateTwoMonthChart() {
    if (!currentUser) return;

    const weeks = 8;
    const labels = [];
    const weeklyPData = [];
    const weeklyFData = [];
    const weeklyCData = [];
    const weeklyWeightData = [];

    const promises = [];
    for (let i = 0; i < weeks * 7; i++) {
        const d = new Date();
        const tzoffset = d.getTimezoneOffset() * 60000;
        const dateObj = new Date(d - tzoffset - (i * 24 * 60 * 60 * 1000));
        const dateStr = dateObj.toISOString().split('T')[0];

        if (dateStr === currentDate) {
             promises.push(Promise.resolve({ date: dateStr, data: { total: total, weight: currentWeight } }));
        } else {
             promises.push(
                 getDoc(doc(db, "users", currentUser.uid, "records", dateStr))
                 .then(snap => ({ date: dateStr, data: snap.exists() ? snap.data() : null }))
             );
        }
    }

    const results = await Promise.all(promises);

    for (let w = weeks - 1; w >= 0; w--) {
        let sumP = 0;
        let sumF = 0;
        let sumC = 0;
        let sumWeight = 0;
        let daysWithCal = 0;
        let daysWithWeight = 0;

        for (let d = 0; d < 7; d++) {
            const idx = w * 7 + d;
            const record = results[idx]?.data;

            if (record) {
                if (record.total && (record.total.p > 0 || record.total.f > 0 || record.total.c > 0 || record.total.k > 0)) {
                    sumP += (record.total.p || 0) * 4;
                    sumF += (record.total.f || 0) * 9;
                    sumC += (record.total.c || 0) * 4;
                    daysWithCal++;
                }
                if (record.weight) {
                    sumWeight += record.weight;
                    daysWithWeight++;
                }
            }
        }

        const avgP = daysWithCal > 0 ? (sumP / daysWithCal) : 0;
        const avgF = daysWithCal > 0 ? (sumF / daysWithCal) : 0;
        const avgC = daysWithCal > 0 ? (sumC / daysWithCal) : 0;
        const avgWeight = daysWithWeight > 0 ? (sumWeight / daysWithWeight) : null;

        const startDateObj = new Date();
        const tzoffset = startDateObj.getTimezoneOffset() * 60000;
        const weekStartDate = new Date(startDateObj - tzoffset - ((w * 7 + 6) * 24 * 60 * 60 * 1000));
        const label = `${weekStartDate.getMonth() + 1}/${weekStartDate.getDate()}週`;

        labels.push(label);
        weeklyPData.push(avgP);
        weeklyFData.push(avgF);
        weeklyCData.push(avgC);
        weeklyWeightData.push(avgWeight);
    }

    const ctx = document.getElementById("twoMonthChart").getContext("2d");
    if (twoMonthChart) twoMonthChart.destroy();

    twoMonthChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '平均体重 (kg)',
                    data: weeklyWeightData,
                    type: 'line',
                    borderColor: '#9C27B0',
                    backgroundColor: 'rgba(156, 39, 176, 0.2)',
                    yAxisID: 'y1',
                    tension: 0.2,
                    spanGaps: true,
                    order: 1
                },
                { label: 'タンパク質', data: weeklyPData, backgroundColor: '#FF6384', yAxisID: 'y', order: 2 },
                { label: '脂質', data: weeklyFData, backgroundColor: '#FFCE56', yAxisID: 'y', order: 2 },
                { label: '炭水化物', data: weeklyCData, backgroundColor: '#36A2EB', yAxisID: 'y', order: 2 }
            ]
        },
        options: {
            responsive: true,
            aspectRatio: 1.2,
            scales: {
                x: { stacked: true },
                y: {
                    stacked: true,
                    position: 'left',
                    title: { display: true, text: '平均カロリー (kcal)', font: { size: 10 } }
                },
                y1: {
                    position: 'right',
                    grid: { drawOnChartArea: false },
                    title: { display: true, text: '平均体重 (kg)', font: { size: 10 } }
                }
            },
            plugins: { datalabels: { display: false } }
        }
    });
}

function switchInputMethod(areaId) {
    document.getElementById('presetArea').style.display = 'none';
    document.getElementById('customArea').style.display = 'none';
    document.getElementById('aiArea').style.display = 'none';

    document.getElementById('tab-preset').classList.remove('active-tab');
    document.getElementById('tab-custom').classList.remove('active-tab');
    document.getElementById('tab-ai').classList.remove('active-tab');

    document.getElementById(areaId).style.display = 'block';
    
    if (areaId === 'presetArea') document.getElementById('tab-preset').classList.add('active-tab');
    if (areaId === 'customArea') document.getElementById('tab-custom').classList.add('active-tab');
    if (areaId === 'aiArea') document.getElementById('tab-ai').classList.add('active-tab');
}

async function addPresetFromHistory(index) {
    let item = history[index];
    let food = (typeof item === 'string') ? foods[item] : item;
    let displayName = (typeof item === 'string') ? item : item.name;

    let cleanName = displayName.replace(/^\[AI\]\s*/, '');

    await saveToPresets(cleanName, parseFloat(food.p)||0, parseFloat(food.f)||0, parseFloat(food.c)||0, parseFloat(food.k)||0);
    alert("「" + cleanName + "」を定番リストに追加しました！");
    
    updateHistory(); 
}

async function saveToPresets(name, p, f, c, k) {
    if (!currentUser) return;
    if (foods[name]) return; 

    foods[name] = { p: p, f: f, c: c, k: k };

    const select = document.getElementById("food");
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

// ▼▼ 定番メニューを削除する処理 ▼▼
async function removePreset() {
    const select = document.getElementById("food");
    const selectedName = select.value;

    if (!selectedName) {
        alert("削除する定番メニューを選択してください。");
        return;
    }

    // 間違えて押した時のために確認メッセージを出す
    if (!confirm(`「${selectedName}」を定番リストから完全に削除しますか？`)) {
        return;
    }

    // 1. 画面のリストとメモリから消す
    delete foods[selectedName];
    select.remove(select.selectedIndex);

    // すべて消えた場合の表示リセット
    if (select.options.length === 0) {
        const option = document.createElement("option");
        option.value = "";
        option.text = "登録されている定番がありません";
        option.disabled = true;
        option.selected = true;
        select.appendChild(option);
    }

    // 2. データベース(Firestore)から消す
    if (currentUser) {
        try {
            const q = query(collection(db, "users", currentUser.uid, "presets"), where("name", "==", selectedName));
            const querySnapshot = await getDocs(q);
            querySnapshot.forEach(async (documentSnapshot) => {
                await deleteDoc(doc(db, "users", currentUser.uid, "presets", documentSnapshot.id));
            });
            alert("削除しました！");
        } catch (e) {
            console.error("定番の削除エラー: ", e);
            alert("削除中にエラーが発生しました。");
        }
    }
}

async function saveProfile() {
    if (!currentUser) return;

    const gender = document.querySelector('input[name="gender"]:checked').value;
    const age = parseInt(document.getElementById("profAge").value);
    const height = parseFloat(document.getElementById("profHeight").value);
    const weight = parseFloat(document.getElementById("profWeight").value);
    const activity = parseFloat(document.getElementById("profActivity").value);
    const goal = document.getElementById("profGoal").value;

    if (!age || !height || !weight) {
        alert("年齢、身長、体重をすべて入力してください。");
        return;
    }

    let bmr = (10 * weight) + (6.25 * height) - (5 * age);
    bmr += (gender === "male") ? 5 : -161;

    let tdee = bmr * activity;
    let targetKcal = tdee;
    if (goal === "lose") targetKcal -= 300; 
    if (goal === "gain") targetKcal += 300; 

    let targetP;
    if (goal === "maintain") {
        targetP = weight * 0.8; 
    } else {
        targetP = weight * 1.6; 
    }
    const pKcal = targetP * 4;

    const fKcal = targetKcal * 0.25;
    const targetF = fKcal / 9;

    const cKcal = targetKcal - pKcal - fKcal;
    const targetC = cKcal / 4;

    target = {
        p: targetP,
        f: targetF,
        c: targetC,
        k: targetKcal,
        water: weight * 35
    };
    notifyEnabled = document.getElementById("profNotifyEnable").checked;
    notifyTime = document.getElementById("profNotifyTime").value;

    try {
        await setDoc(doc(db, "users", currentUser.uid, "profile", "data"), {
            gender: gender,
            age: age,
            height: height,
            weight: weight,
            activity: activity,
            goal: goal,
            target: target,
            notifyEnabled: notifyEnabled,
            notifyTime: notifyTime
        });

        alert("あなた専用の目標を設定しました！");

        document.getElementById("profileScreen").style.display = "none";
        document.getElementById("appScreen").style.display = "block";
        
        document.getElementById("datePicker").value = currentDate;
        loadPresets();
        await loadData(); 

        startNotificationChecker();

    } catch (error) {
        console.error("プロフィールの保存エラー:", error);
        alert("保存に失敗しました。");
    }
}

async function editProfile() {
    if (!currentUser) return;

    try {
        const profileRef = doc(db, "users", currentUser.uid, "profile", "data");
        const profileSnap = await getDoc(profileRef);

        if (profileSnap.exists()) {
            const data = profileSnap.data();
            
            if (data.gender) {
                document.querySelector(`input[name="gender"][value="${data.gender}"]`).checked = true;
            }
            if (data.age) document.getElementById("profAge").value = data.age;
            if (data.height) document.getElementById("profHeight").value = data.height;
            if (data.weight) document.getElementById("profWeight").value = data.weight;
            
            if (data.activity) document.getElementById("profActivity").value = data.activity;
            if (data.goal) document.getElementById("profGoal").value = data.goal;

            if (data.notifyEnabled !== undefined) {
                document.getElementById("profNotifyEnable").checked = data.notifyEnabled;
                document.getElementById("profNotifyTime").value = data.notifyTime || "20:00";
                toggleNotifyTime();
            }
        }
    } catch (e) {
        console.error("プロフィール読み込みエラー: ", e);
    }

    document.getElementById("appScreen").style.display = "none";
    document.getElementById("profileScreen").style.display = "block";
    
    const submitBtn = document.querySelector("#profileScreen button");
    if(submitBtn) submitBtn.innerText = "設定を更新する";
}

window.addFood = addFood;
window.addCustomFood = addCustomFood;
window.removeFood = removeFood;
window.addAiFood = addAiFood;
window.login = login;  
window.logout = logout;
window.switchInputMethod = switchInputMethod;
window.addPresetFromHistory = addPresetFromHistory;
window.saveProfile = saveProfile;
window.editProfile = editProfile;
window.saveWeight = saveWeight;
window.removePreset = removePreset;

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standabunnryoulone;

if (isStandalone) {
    const installBtn = document.getElementById('installBtn');
    if (installBtn) installBtn.style.display = 'none';
}

let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
});

function installApp() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                document.getElementById('installBtn').style.display = 'none';
            }
            deferredPrompt = null;
        });
    } else if (isIOS) {
        alert("【iPhoneでのアプリ追加方法】\n\n画面下にある「共有ボタン（四角から上向きの矢印）」をタップし、メニューから「ホーム画面に追加」を選んでください！");
    } else {
        alert("ブラウザのメニューから「ホーム画面に追加」または「アプリをインストール」を選んでください。");
    }
}

window.installApp = installApp;

let dinnerMenuDB = [];

async function loadDinnerMenuDB() {
    try {
        const response = await fetch('dinnerMenuDB.json');
        dinnerMenuDB = await response.json();
    } catch (e) {
        console.error("晩御飯DBの読み込みエラー:", e);
    }
}
loadDinnerMenuDB();

function calculateCosineSimilarity(remain, menu) {
    const remainTotal = remain.p + remain.f + remain.c;
    const menuTotal = menu.p + menu.f + menu.c;

    if (remainTotal === 0 || menuTotal === 0) return 0;

    const rP = remain.p / remainTotal;
    const rF = remain.f / remainTotal;
    const rC = remain.c / remainTotal;

    const mP = menu.p / menuTotal;
    const mF = menu.f / menuTotal;
    const mC = menu.c / menuTotal;

    const diff = Math.abs(rP - mP) + Math.abs(rF - mF) + Math.abs(rC - mC);
    return Math.max(0, 1 - (diff / 2));
}

function suggestDinner() {
    const remainP = Math.max(0, target.p - total.p);
    const remainF = Math.max(0, target.f - total.f);
    const remainC = Math.max(0, target.c - total.c);
    
    const remainVector = { p: remainP, f: remainF, c: remainC };

    const scoredMenus = dinnerMenuDB.map(menu => {
        const similarity = calculateCosineSimilarity(remainVector, menu);
        return {
            ...menu,
            similarity: similarity
        };
    });

    scoredMenus.sort((a, b) => b.similarity - a.similarity);
    return scoredMenus.slice(0, 3);
}

window.suggestDinner = suggestDinner;

// ▼▼ 総合メニュードロワーの開閉 ▼▼
function toggleMenuDrawer() {
    const drawer = document.getElementById("menuDrawer");
    
    if (drawer.classList.contains("drawer-closed")) {
        drawer.classList.remove("drawer-closed");
        drawer.classList.add("drawer-open");
    } else {
        drawer.classList.remove("drawer-open");
        drawer.classList.add("drawer-closed");
    }
}
window.toggleMenuDrawer = toggleMenuDrawer;

// ▼▼ AIおすすめメニュー用ポップアップの処理 ▼▼
function openSuggestModal() {
    toggleMenuDrawer(); // 横のメニューを閉じる
    document.getElementById("suggestModal").style.display = "flex"; // ポップアップを開く
    renderSuggestionsModal(); // おすすめを計算して描画
}
window.openSuggestModal = openSuggestModal;

function closeSuggestModal() {
    document.getElementById("suggestModal").style.display = "none";
}
window.closeSuggestModal = closeSuggestModal;

function renderSuggestionsModal() {
    const top3 = suggestDinner(); 
    const listDiv = document.getElementById("suggestListModal");
    
    listDiv.innerHTML = ""; 
    
    if (top3.length === 0) {
        listDiv.innerHTML = "<p>データがありません。</p>";
        return;
    }

    top3.forEach((menu, index) => {
        const card = document.createElement("div");
        card.className = "suggest-card";
        
        const matchPercent = Math.round(menu.similarity * 100);

        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                <h4 style="margin: 0; font-size: 15px; padding-right: 8px;"><span style="color:#ff9800;">${index + 1}位</span> ${menu.name}</h4>
                <span style="font-size: 11px; font-weight: bold; color: #4CAF50; background: #e8f5e9; padding: 2px 6px; border-radius: 4px; white-space: nowrap; flex-shrink: 0;">一致度: ${matchPercent}%</span>
            </div>
            
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); text-align: center; background: white; padding: 6px; border-radius: 6px; border: 1px solid #eee; margin-bottom: 8px;">
                <div style="border-right: 1px solid #eee;">
                    <div style="font-size: 10px; color: #999;">P</div>
                    <div style="font-size: 13px; font-weight: bold; color: #FF6384;">${parseFloat(menu.p).toFixed(1)}g</div>
                </div>
                <div style="border-right: 1px solid #eee;">
                    <div style="font-size: 10px; color: #999;">F</div>
                    <div style="font-size: 13px; font-weight: bold; color: #FFCE56;">${parseFloat(menu.f).toFixed(1)}g</div>
                </div>
                <div style="border-right: 1px solid #eee;">
                    <div style="font-size: 10px; color: #999;">C</div>
                    <div style="font-size: 13px; font-weight: bold; color: #36A2EB;">${parseFloat(menu.c).toFixed(1)}g</div>
                </div>
                <div>
                    <div style="font-size: 10px; color: #999;">kcal</div>
                    <div style="font-size: 13px; font-weight: bold; color: #555;">${parseFloat(menu.k).toFixed(0)}</div>
                </div>
            </div>

            <button onclick="addSuggestedDinner('${menu.name}', ${menu.p}, ${menu.f}, ${menu.c}, ${menu.k})" style="width: 100%; padding: 8px; background-color: #ff9800; color: white; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 14px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                食事履歴に追加
            </button>
        `;
        listDiv.appendChild(card);
    });
}
window.renderSuggestionsModal = renderSuggestionsModal;

function addSuggestedDinner(name, p, f, c, k) {
    total.p += p;
    total.f += f;
    total.c += c;
    total.k += k;

    history.push({
        name: "[提案] " + name,
        p: p,
        f: f,
        c: c,
        k: k
    });

    updateDisplay();
    updateChart();
    updateHistory();
    saveData();
    updateWeeklyChart();

    closeSuggestModal(); // 追加したらポップアップを閉じる
    alert("「" + name + "」を食事履歴に追加しました！");
}
window.addSuggestedDinner = addSuggestedDinner;

function saveWeight() {
    const w = parseFloat(document.getElementById("dailyWeight").value);
    if (!w) return;
    currentWeight = w;
    saveData();
    updateWeeklyChart(); 
    updateTwoMonthChart(); 
    alert("体重を記録しました！");
}

function toggleNotifyTime() {
    const isChecked = document.getElementById("profNotifyEnable").checked;
    document.getElementById("notifyTimeArea").style.display = isChecked ? "block" : "none";
    
    if (isChecked && "Notification" in window && Notification.permission !== "granted") {
        Notification.requestPermission(); 
    }
}

function startNotificationChecker() {
    if (notifyInterval) clearInterval(notifyInterval);
    if (!notifyEnabled) return;

    notifyInterval = setInterval(() => {
        if (!notifyEnabled || !notifyTime) return;

        const now = new Date();
        const currentH = String(now.getHours()).padStart(2, '0');
        const currentM = String(now.getMinutes()).padStart(2, '0');
        const currentTimeStr = `${currentH}:${currentM}`;

        if (currentTimeStr === notifyTime) {
            if (lastNotifiedDate === currentDate) return;

            let message = "";
            if (history.length === 0) {
                message = "今日の食事がまだ記録されていません！忘れずに追加しましょう。";
            } else if (total.k < target.k * 0.5) {
                message = "今日のカロリーが目標の半分未満です。記録忘れはありませんか？";
            }

            if (message !== "") {
                if ("Notification" in window && Notification.permission === "granted") {
                    new Notification("FitNavi リマインダー", {
                        body: message,
                        icon: "icon-192.png" 
                    });
                } else {
                    alert("🔔 【FitNavi リマインダー】\n\n" + message); 
                }
                lastNotifiedDate = currentDate; 
            }
        }
    }, 60000); 
}

window.toggleNotifyTime = toggleNotifyTime;

function showFoodNamePopup(name) {
    document.getElementById("fullFoodNameText").innerText = name;
    document.getElementById("foodNameModal").style.display = "flex";
}

function closeFoodNamePopup() {
    document.getElementById("foodNameModal").style.display = "none";
}

window.showFoodNamePopup = showFoodNamePopup;
window.closeFoodNamePopup = closeFoodNamePopup;

function addWater(amount) {
    total.water = (total.water || 0) + amount;
    if (total.water < 0) total.water = 0; 
    
    updateDisplay();
    saveData();
    
    if (waterWeeklyChart) {
        waterWeeklyChart.data.datasets[1].data[6] = total.water;
        waterWeeklyChart.update();
    } else {
        updateWeeklyChart();
    }
}
window.addWater = addWater;

// 自由に入力した水分量を追加する処理
function addCustomWater() {
    const input = document.getElementById("customWaterAmount");
    const amount = parseFloat(input.value);
    
    if (!amount || isNaN(amount)) {
        alert("追加する水分量を入力してください。");
        return;
    }
    
    // 入力された数値を addWater に渡して追加
    addWater(amount);
    
    // 追加が終わったら入力欄を空っぽに戻す
    input.value = "";
}
window.addCustomWater = addCustomWater;

let currentGeneratedWorkout = null; // 生成されたメニューを一時保存する変数

function openWorkoutInputModal() {
    document.getElementById("workoutInputModal").style.display = "flex";
}
window.openWorkoutInputModal = openWorkoutInputModal;

function closeWorkoutInputModal() {
    document.getElementById("workoutInputModal").style.display = "none";
}
window.closeWorkoutInputModal = closeWorkoutInputModal;

function closeWorkoutResultModal() {
    document.getElementById("workoutResultModal").style.display = "none";
}
window.closeWorkoutResultModal = closeWorkoutResultModal;

// 1. 前日の食事データを取得する関数
async function getYesterdayNutrition() {
    if (!currentUser) return null;
    const d = new Date();
    const tzoffset = d.getTimezoneOffset() * 60000;
    const yesterdayObj = new Date(d - tzoffset - (24 * 60 * 60 * 1000));
    const yesterdayStr = yesterdayObj.toISOString().split('T')[0];

    const docSnap = await getDoc(doc(db, "users", currentUser.uid, "records", yesterdayStr));
    if (docSnap.exists()) {
        return docSnap.data().total;
    }
    return null;
}

// 2. 過去のトレーニング履歴を直近数件取得する関数
async function getRecentWorkouts() {
    if (!currentUser) return [];
    const q = query(collection(db, "users", currentUser.uid, "workouts"), orderBy("date", "desc"), limit(5));
    const querySnapshot = await getDocs(q);
    let workouts = [];
    querySnapshot.forEach((docSnap) => {
        workouts.push(docSnap.data());
    });
    return workouts;
}

// 3. トレーニング生成のメイン処理
async function generateWorkout() {
    const btn = document.getElementById("woGenerateBtn");
    const statusText = document.getElementById("woStatusText");
    
    btn.disabled = true;
    btn.style.backgroundColor = "#ccc";
    statusText.style.display = "block";

    // UIから入力値を取得
    const env = document.getElementById("woEnv").value;
    const cond = document.getElementById("woCond").value;
    const isTimeAuto = document.getElementById("woTimeAuto").checked;
    const time = isTimeAuto ? "おまかせ" : document.getElementById("woTimeSlider").value + "分";
    const targetMuscle = document.getElementById("woTarget").value;

    // 前日の食事と過去の履歴を取得
    const yesterdayFood = await getYesterdayNutrition();
    const recentWorkouts = await getRecentWorkouts();

    // =============== AIに送るためのプロンプト情報 ===============
    // ※ 実際のバックエンド（/api/workout等）がある場合は、このpromptを送信します。
    // 今回はAI API（OpenAI等）に渡す想定のプロンプト文字列を構築します。
    
    const promptData = {
        role: "あなたは中級者向けの論理的でドライなパーソナルトレーナーです。感情的な励ましは不要で、数字と根拠ベースで指示を出してください。",
        user_context: {
            environment: env,
            condition: cond,
            available_time: time,
            target_muscle: targetMuscle,
            yesterday_nutrition: yesterdayFood ? `P:${yesterdayFood.p}g, F:${yesterdayFood.f}g, C:${yesterdayFood.c}g` : "データなし",
            recent_workouts: recentWorkouts.map(w => `${w.date}: ${w.target} (${w.completionLevel})`)
        },
        output_format: "必ず以下のJSON形式のみで出力してください。Markdownの```jsonなどは含めないでください。",
        json_schema: {
            "aiComment": "なぜこのメニューにしたのか、前日の食事や過去の履歴を交えたドライで論理的な理由（100文字程度）",
            "exercises": [
                { "name": "種目名", "sets": 3, "reps": 10, "interval": 60 }
            ]
        }
    };

    try {
        /*
        ====================================================================
        【重要】ここにバックエンドのAI API（Gemini/ChatGPT等）を叩く処理を書きます。
        既存の /api/estimate と同じように独自エンドポイントを作成してください。
        
        const response = await fetch('/api/generateWorkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: promptData })
        });
        const aiResult = await response.json();
        ====================================================================
        */

        // ⚠️ 以下はAPIが繋がるまでのモック（仮）データです。繋いだら削除してください。
        await new Promise(resolve => setTimeout(resolve, 1500)); // 通信のフリ
        const aiResult = {
            aiComment: `昨日の脂質摂取量がやや多いため、消費カロリーを稼ぐべくインターバルを短く設定しました。前回は胸を攻めているため、本日は${targetMuscle === 'おまかせ' ? '背中' : targetMuscle}を中心に${time === 'おまかせ' ? '45分' : time}で完了する構成です。`,
            exercises: [
                { name: env === "自重" ? "懸垂" : "ラットプルダウン", sets: 3, reps: 10, interval: 60 },
                { name: env === "自重" ? "リバーススノーエンジェル" : "シーテッドロー", sets: 3, reps: 12, interval: 60 },
                { name: "プランク", sets: 3, reps: "60秒", interval: 30 }
            ]
        };
        // ⚠️ モックここまで

        currentGeneratedWorkout = {
            date: currentDate,
            environment: env,
            condition: cond,
            time: time,
            target: targetMuscle,
            ...aiResult
        };

        renderWorkoutResult(aiResult);

        closeWorkoutInputModal();
        document.getElementById("workoutResultModal").style.display = "flex";

    } catch (e) {
        console.error(e);
        alert("メニューの生成に失敗しました。");
    } finally {
        btn.disabled = false;
        btn.style.backgroundColor = "#F44336";
        statusText.style.display = "none";
    }
}
window.generateWorkout = generateWorkout;
function renderWorkoutResult(data) {
    document.getElementById("woAiComment").innerText = data.aiComment;
    
    const listDiv = document.getElementById("woExerciseList");
    listDiv.innerHTML = "";

    data.exercises.forEach((ex, index) => {
        const card = document.createElement("div");
        card.style.cssText = "border: 1px solid #ddd; border-radius: 6px; padding: 10px; background: #fafafa;";
        card.innerHTML = `
            <div style="font-weight: bold; font-size: 15px; margin-bottom: 5px;">${index + 1}. ${ex.name}</div>
            <div style="display: flex; gap: 15px; font-size: 13px; color: #555;">
                <span>🎯 ${ex.sets} セット</span>
                <span>🔄 ${ex.reps} ${typeof ex.reps === 'number' ? '回' : ''}</span>
                <span>⏱️ 休憩: ${ex.interval}秒</span>
            </div>
        `;
        listDiv.appendChild(card);
    });
}
async function saveWorkout() {
    if (!currentUser || !currentGeneratedWorkout) return;

    const completion = document.getElementById("woCompletion").value;
    currentGeneratedWorkout.completionLevel = completion;
    currentGeneratedWorkout.timestamp = new Date().getTime(); // ソート用

    try {
        // users/{uid}/workouts/{date} に保存
        await setDoc(doc(db, "users", currentUser.uid, "workouts", currentDate), currentGeneratedWorkout);
        
        alert("今日のトレーニング履歴を保存しました！お疲れ様でした！");
        closeWorkoutResultModal();
    } catch (e) {
        console.error("保存エラー: ", e);
        alert("保存に失敗しました。");
    }
}
window.saveWorkout = saveWorkout;