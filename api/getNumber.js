export default async function handler(req, res) {
    // 安全读取云端配置的 API KEY，绝不暴露在前端
    const API_KEY = process.env.GRIZZLY_API_KEY; 
    
    if (!API_KEY) {
        return res.status(500).json({ success: false, error: 'API Key 未配置' });
    }

    // 从前端请求中获取服务类型和国家，如果没有提供则使用默认值
    const service = req.query.service || 'ot'; 
    const country = req.query.country || '0';  

    const url = `https://api.grizzlysms.com/stubs/handler_api.php?api_key=${API_KEY}&action=getNumber&service=${service}&country=${country}`;

    try {
        const response = await fetch(url);
        const text = await response.text();

        // 成功时，Grizzly 会返回如 "ACCESS_NUMBER:12345678:79991234567"
        if (text.startsWith('ACCESS_NUMBER')) {
            const parts = text.split(':');
            return res.status(200).json({ 
                success: true, 
                id: parts[1], 
                phone: parts[2] 
            });
        } else {
            // 余额不足或没号时会返回 NO_BALANCE, NO_NUMBERS 等字符串
            return res.status(400).json({ success: false, error: text });
        }
    } catch (error) {
        return res.status(500).json({ success: false, error: '服务器请求 Grizzly 失败' });
    }
}
