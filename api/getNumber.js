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

        // 【终极防错1】强制转换格式，绝对不再报 .trim() 的错误，也不会认错国家！
        let rawService = orderData.service;
        if (Array.isArray(rawService)) rawService = rawService[0]; // 防止被变成数组
        const service = (String(rawService).trim() === 'acz') ? 'acz' : 'dr';
        const country = (service === 'dr') ? '187' : '33';

        // 【终极防错2】修复刷新重置倒计时的问题
        if (orderData.status === 'PENDING' || orderData.status === 'COMPLETED') {
            // 如果老订单没有时间戳，给它补上一个，下次刷新就不会重置了
            if (!orderData.created_at) {
                orderData.created_at = Date.now();
                await fetch(process.env.KV_REST_API_URL, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
                    body: JSON.stringify(['SET', orderId, JSON.stringify(orderData)])
                });
            }
            return res.status(200).json({ 
                success: true, 
                phone: orderData.phone, 
                status: orderData.status, 
                service: service, // 返回清洗干净的服务代码
                created_at: orderData.created_at 
            });
        }

        // 获取新号码
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
            orderData.created_at = Date.now(); // 记录精准获取时间

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
