export default async function handler(req, res) {
    const orderId = req.query.order;
    if (!orderId) return res.status(400).json({ success: false, error: '缺少订单号' });

    // 1. 查数据库
    const kvRes = await fetch(process.env.KV_REST_API_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
        body: JSON.stringify(['GET', orderId])
    });
    const kvData = await kvRes.json();
    let orderData = JSON.parse(kvData.result);

    // 2. 如果订单已完成，直接返回历史验证码，不需要再去请求平台
    if (orderData.status === 'COMPLETED') {
        return res.status(200).json({ success: true, code: orderData.code });
    }

    // 3. 去平台查询最新状态
    const API_KEY = process.env.GRIZZLY_API_KEY;
    const url = `https://api.grizzlysms.com/stubs/handler_api.php?api_key=${API_KEY}&action=getStatus&id=${orderData.grizzly_id}`;

    const response = await fetch(url);
    const text = await response.text();

    if (text === 'STATUS_WAIT_CODE') {
        return res.status(200).json({ success: false, status: 'STATUS_WAIT_CODE' });
    } else if (text.startsWith('STATUS_OK:')) {
        const code = text.split(':')[1];
        
        // 收到验证码！修改数据库状态为“已完成”
        orderData.status = 'COMPLETED';
        orderData.code = code;
        await fetch(process.env.KV_REST_API_URL, {
            method: 'POST',
            headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
            body: JSON.stringify(['SET', orderId, JSON.stringify(orderData)])
        });

        return res.status(200).json({ success: true, code: code });
    } else {
        return res.status(200).json({ success: false, status: text });
    }
}
