export default async function handler(req, res) {
    const API_KEY = process.env.GRIZZLY_API_KEY;
    const id = req.query.id;

    if (!id) {
        return res.status(400).json({ success: false, error: '缺少订单 ID' });
    }

    // 根据你提供的截图，调用 getStatusV2 API
    const url = `https://api.grizzlysms.com/stubs/handler_api.php?api_key=${API_KEY}&action=getStatusV2&id=${id}`;

    try {
        const response = await fetch(url);
        const text = await response.text();

        try {
            // 尝试解析 JSON（因为如果成功，截图显示会返回 JSON 数据）
            const data = JSON.parse(text);
            if (data.sms && data.sms.code) {
                // 成功提取到验证码
                return res.status(200).json({ 
                    success: true, 
                    code: data.sms.code,
                    full_text: data.sms.text
                });
            } else {
                return res.status(200).json({ success: false, status: '解析 JSON 失败，未找到 code' });
            }
        } catch (e) {
            // 如果解析 JSON 失败，说明收到的不是 JSON，而是纯文本状态码（如 STATUS_WAIT_CODE）
            return res.status(200).json({ success: false, status: text });
        }
    } catch (error) {
        return res.status(500).json({ success: false, error: '服务器请求 Grizzly 失败' });
    }
}
