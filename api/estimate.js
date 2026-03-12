import { GoogleGenAI } from "@google/genai";

export default async function handler(req, res) {

    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    const { text, image } = req.body;
    const API_KEY = process.env.GEMINI_API_KEY;

    if (!API_KEY) {
        return res.status(500).json({
            error: "APIキー未設定",
            detail: "Vercel Environment Variables を確認してください"
        });
    }

    try {

        const ai = new GoogleGenAI({ apiKey: API_KEY });

        const prompt = `
提供された食事内容（テキスト：${text}、または画像）から
P(タンパク質), F(脂質), C(炭水化物), k(カロリー)を推定し
以下のJSONのみ返してください。

{"name":"料理名","p":数値,"f":数値,"c":数値,"k":数値}
`;

        const parts = [{ text: prompt }];

        if (image) {
            parts.push({
                inlineData: {
                    mimeType: "image/jpeg",
                    data: image
                }
            });
        }

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [{
                role: "user",
                parts: parts
            }]
        });

        const resultText = response.text;

        if (!resultText) {
            return res.status(500).json({
                error: "AI応答なし",
                raw: response
            });
        }

        const clean = resultText
            .replace(/```json/g, "")
            .replace(/```/g, "")
            .trim();

        let parsed;

        try {
            parsed = JSON.parse(clean);
        } catch {
            return res.status(500).json({
                error: "JSON解析失敗",
                raw_text: resultText
            });
        }

        res.status(200).json(parsed);

    } catch (err) {

        console.error(err);

        res.status(500).json({
            error: "サーバーエラー",
            detail: err.message
        });

    }
}