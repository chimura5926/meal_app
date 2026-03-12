// Vercel Serverless Function
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const { text, image } = req.body;
    const API_KEY = process.env.GEMINI_API_KEY; // Vercelの環境変数に設定

    const payload = {
        contents: [{
        parts: [
            { text: `提供された食事内容（テキスト：${text}、または画像）から、P(タンパク質), F(脂質), C(炭水化物), k(カロリー)を推定し、以下のJSON形式のみで返してください。余計な説明は不要です。 {"name": "料理名", "p": 数値, "f": 数値, "c": 数値, "k": 数値}` },
            ...(image ? [{ inline_data: { mime_type: "image/jpeg", data: image } }] : [])
        ]
        }]
    };

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
        });

        const data = await response.json();

        console.log("Gemini raw response:", JSON.stringify(data, null, 2));

        const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        console.log("Gemini text:", resultText);

        // ```json や ``` などの余計な装飾を削除する
        const cleanJson = resultText.replace(/```json|```/g, "").trim();
        console.log("Clean JSON:", cleanJson);
        res.status(200).json(JSON.parse(cleanJson));
    } catch (error) {
        res.status(500).json({ error: '解析に失敗しました' });
    }
}