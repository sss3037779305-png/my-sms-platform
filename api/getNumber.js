export default async function handler(req, res) {
    const orderId = req.query.order;
    if (!orderId) return res.status(400).json({ success: false, error: '链接无效，缺少订单号' });

    const API_KEY = (process.env.GRIZZLY_API_KEY || '').trim();
    if (!API_KEY) return res.status(500).json({ success: false, error: 'API_KEY 丢失' });

    try {
        const kvRes = await fetch(process.env.KV_REST_API_URL, {
            method: 'POST',
            headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
            body: JSON.stringify(['GET', orderId])
        });
        const kvData = await kvRes.json();
        if (!kvData.result) return res.status(400).json({ success: false, error: '订单不存在或已失效' });
        
        let orderData = JSON.parse(kvData.result);

        // 如果已经在等验证码，把之前保存的时间戳传给前端（保证刷新不断）
        if (orderData.status === 'PENDING' || orderData.status === 'COMPLETED') {
            return res.status(200).json({ 
                success: true, 
                phone: orderData.phone, 
                status: orderData.status, 
                service: orderData.service,
                created_at: orderData.created_at // 返回创建时间
            });
        }

        const service = (orderData.service || 'dr').trim();
        const country = service === 'dr' ? '187' : '33';

        const url = new URL('https://api.grizzlysms.com/stubs/handler_api.php');
        url.searchParams.append('api_key', API_KEY);
        url.searchParams.append('action', 'getNumber');
        url.searchParams.append('service', service);
        url.searchParams.append('country', country);

        const response = await fetch(url.toString());
        const text = await response.text();

        if (text.startsWith('ACCESS_NUMBER')) {
            const parts = text.split(':');
            orderData.grizzly_id = parts[1];
            orderData.phone = parts[2];
            orderData.status = 'PENDING';
            // 【关键代码】：记录号码获取的精确时间（毫秒）
            orderData.created_at = Date.now(); 

            await fetch(process.env.KV_REST_API_URL, {
                method: 'POST',
                headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
                body: JSON.stringify(['SET', orderId, JSON.stringify(orderData)])
            });

            return res.status(200).json({ 
                success: true, 
                phone: orderData.phone, 
                service: service,
                created_at: orderData.created_at 
            });
        } else {
            return res.status(400).json({ success: false, error: text });
        }
    } catch (error) {
        return res.status(500).json({ success: false, error: '系统错误: ' + error.message });
    }
}
