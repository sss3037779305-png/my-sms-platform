export default async function handler(req, res) {
    const orderId = req.query.order;
    if (!orderId) return res.status(400).json({ success: false, error: '链接无效，缺少订单号' });

    // 1. 检查环境变量是否丢失
    const API_KEY = process.env.GRIZZLY_API_KEY;
    if (!API_KEY) {
        return res.status(500).json({ success: false, error: 'API_KEY 丢失，请在 Vercel 环境变量中重新添加' });
    }

    try {
        // 2. 查询数据库中的订单
        const kvRes = await fetch(process.env.KV_REST_API_URL, {
            method: 'POST',
            headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
            body: JSON.stringify(['GET', orderId])
        });
        const kvData = await kvRes.json();
        if (!kvData.result) return res.status(400).json({ success: false, error: '订单不存在或已失效' });
        
        let orderData = JSON.parse(kvData.result);

        // 3. 防刷新：如果订单已经有号码，直接返回
        if (orderData.status === 'PENDING' || orderData.status === 'COMPLETED') {
            return res.status(200).json({ success: true, phone: orderData.phone, status: orderData.status, service: orderData.service });
        }

        // 4. 去 Grizzly 拿号（使用最严格的 URL 拼接方式，action放第一位）
        const country = orderData.service === 'dr' ? '187' : '33';
        const url = `https://api.grizzlysms.com/stubs/handler_api.php?action=getNumber&api_key=${API_KEY}&service=${orderData.service}&country=${country}`;

        const response = await fetch(url);
        const text = await response.text();

        if (text.startsWith('ACCESS_NUMBER')) {
            const parts = text.split(':');
            orderData.grizzly_id = parts[1];
            orderData.phone = parts[2];
            orderData.status = 'PENDING';

            // 更新数据库
            await fetch(process.env.KV_REST_API_URL, {
                method: 'POST',
                headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
                body: JSON.stringify(['SET', orderId, JSON.stringify(orderData)])
            });

            return res.status(200).json({ success: true, phone: orderData.phone, service: orderData.service });
        } else {
            return res.status(400).json({ success: false, error: text });
        }
    } catch (error) {
        return res.status(500).json({ success: false, error: '系统内部错误: ' + error.message });
    }
}
