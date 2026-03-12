// Vercel Serverless Function
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const { text, image } = req.body;
    const API_KEY = process.env.GEMINI_API_KEY;

    // 1. APIキーがそもそも設定されているかチェック
    if (!API_KEY) {
        return res.status(500).json({ 
            error: 'サーバーにAPIキーが設定されていません', 
            detail: 'VercelのSettings > Environment Variablesを確認してください。' 
        });
    }

    const payload = {
        contents: [{
            parts: [
                { text: `提供された食事内容（テキスト：${text}、または画像）から、P(タンパク質), F(脂質), C(炭水化物), k(カロリー)を推定し、以下のJSON形式のみで返してください。余計な説明は不要です。解説や挨拶などのテキストは一切含めないでください。 {"name": "料理名", "p": 数値, "f": 数値, "c": 数値, "k": 数値}` },
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

        // 2. Gemini API 自体がエラーを返してきた場合 (キー間違いや制限など)
        if (data.error) {
            return res.status(500).json({ 
                error: 'Gemini APIエラー', 
                detail: data.error.message,
                code: data.error.code 
            });
        }

        const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;

        // 3. AIからの応答テキストが空の場合
        if (!resultText) {
            return res.status(500).json({ 
                error: 'AIからの応答が空です', 
                detail: 'Geminiからの回答テキストが見つかりませんでした。',
                raw_data: data 
            });
        }

        // 4. JSONを整形して解析
        const cleanJson = resultText.replace(/```json|```/g, "").trim();
        res.status(200).json(JSON.parse(cleanJson));

    } catch (error) {
        console.error("バックエンドエラー:", error);
        res.status(500).json({ 
            error: '解析プロセス中に失敗しました', 
            detail: error.message 
        });
    }
}