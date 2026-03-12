// Vercel Serverless Function
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

    const prompt = `
提供された食事内容（テキスト：${text}、または画像）から
P(タンパク質), F(脂質), C(炭水化物), k(カロリー)を推定し
以下のJSONのみ返してください。

{"name":"料理名","p":数値,"f":数値,"c":数値,"k":数値}
`;

    const payload = {
        contents: [
            {
                parts: [
                    { text: prompt },
                    ...(image ? [{
                        inline_data: {
                            mime_type: "image/jpeg",
                            data: image
                        }
                    }] : [])
                ]
            }
        ]
    };

    try {

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${API_KEY}`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            }
        );

        const data = await response.json();

        if (data.error) {
            return res.status(500).json({
                error: "Gemini APIエラー",
                detail: data.error.message,
                code: data.error.code
            });
        }

        const resultText =
            data?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!resultText) {
            return res.status(500).json({
                error: "AI応答なし",
                raw: data
            });
        }

        const clean = resultText.replace(/```json|```/g, "").trim();

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