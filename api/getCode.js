export default async function handler(req, res) {
    const orderId = req.query.order;
    if (!orderId) return res.status(400).json({ success: false, error: '缺少订单号' });

    const API_KEY = process.env.GRIZZLY_API_KEY;
    if (!API_KEY) return res.status(500).json({ success: false, error: 'API_KEY 丢失' });

    try {
        const kvRes = await fetch(process.env.KV_REST_API_URL, {
            method: 'POST',
            headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
            body: JSON.stringify(['GET', orderId])
        });
        const kvData = await kvRes.json();
        if (!kvData.result) return res.status(400).json({ success: false, error: '订单不存在' });
        
        let orderData = JSON.parse(kvData.result);

        if (orderData.status === 'COMPLETED') {
            return res.status(200).json({ success: true, code: orderData.code });
        }

        // 【关键修复】：将 api_key 严格放在第一位
        const url = `https://api.grizzlysms.com/stubs/handler_api.php?api_key=${API_KEY}&action=getStatus&id=${orderData.grizzly_id}`;

        const response = await fetch(url);
        const text = await response.text();

        if (text === 'STATUS_WAIT_CODE') {
            return res.status(200).json({ success: false, status: 'STATUS_WAIT_CODE' });
        } else if (text.startsWith('STATUS_OK:')) {
            const code = text.split(':')[1];
            
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
    } catch (error) {
        return res.status(500).json({ success: false, error: '系统内部错误' });
    }
}
