export default async function handler(req, res) {
    const orderId = req.query.order;
    if (!orderId) return res.status(400).json({ success: false, error: '链接无效，缺少订单号' });

    // 1. 查询数据库中的订单
    const kvRes = await fetch(process.env.KV_REST_API_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
        body: JSON.stringify(['GET', orderId])
    });
    const kvData = await kvRes.json();
    if (!kvData.result) return res.status(400).json({ success: false, error: '订单不存在' });
    
    let orderData = JSON.parse(kvData.result);

    // 2. 如果订单已经获取过号码（防刷新逻辑），直接返回旧数据！
    if (orderData.status === 'PENDING' || orderData.status === 'COMPLETED') {
        return res.status(200).json({ success: true, phone: orderData.phone, status: orderData.status, service: orderData.service });
    }

    // 3. 如果是新订单，去 Grizzly 平台拿号
    const API_KEY = process.env.GRIZZLY_API_KEY;
    const country = orderData.service === 'dr' ? '187' : '33'; // 自动分配国家
    const url = `https://api.grizzlysms.com/stubs/handler_api.php?api_key=${API_KEY}&action=getNumber&service=${orderData.service}&country=${country}`;

    try {
        const response = await fetch(url);
        const text = await response.text();

        if (text.startsWith('ACCESS_NUMBER')) {
            const parts = text.split(':');
            orderData.grizzly_id = parts[1];
            orderData.phone = parts[2];
            orderData.status = 'PENDING'; // 状态改为：等待中

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
        return res.status(500).json({ success: false, error: '服务器请求 Grizzly 失败' });
    }
}
