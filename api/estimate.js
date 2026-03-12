// Vercel Serverless Function
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    const { text, image } = req.body;
    const API_KEY = process.env.GEMINI_API_KEY;

    // APIキー確認
    if (!API_KEY) {
        return res.status(500).json({
            error: "サーバーにAPIキーが設定されていません",
            detail: "Vercelの Settings > Environment Variables を確認してください"
        });
    }

    const prompt = `
提供された食事内容（テキスト：${text}、または画像）から、P(タンパク質), F(脂質), C(炭水化物), k(カロリー)を推定し、
以下のJSON形式のみで返してください。余計な説明は不要です。解説や挨拶などのテキストは一切含めないでください。

{"name": "料理名", "p": 数値, "f": 数値, "c": 数値, "k": 数値}
`;

    const payload = {
        contents: [
            {
                parts: [
                    { text: prompt },
                    ...(image
                        ? [
                              {
                                  inline_data: {
                                      mime_type: "image/jpeg",
                                      data: image
                                  }
                              }
                          ]
                        : [])
                ]
            }
        ]
    };

    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            }
        );

        const data = await response.json();

        // Gemini APIエラー
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
                error: "AIからの応答が空です",
                raw_data: data
            });
        }

        // ```json```除去
        const clean = resultText.replace(/```json|```/g, "").trim();

        let parsed;
        try {
            parsed = JSON.parse(clean);
        } catch (e) {
            return res.status(500).json({
                error: "JSON解析失敗",
                raw_text: resultText
            });
        }

        res.status(200).json(parsed);

    } catch (error) {
        console.error("バックエンドエラー:", error);

        res.status(500).json({
            error: "サーバー処理エラー",
            detail: error.message
        });
    }
}