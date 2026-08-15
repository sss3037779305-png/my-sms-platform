export default async function handler(req, res) {
    const orderId = req.query.order;
    const isChange = req.query.change === 'true'; // 是否是换号请求

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

        // 如果订单已经完成，禁止换号
        if (orderData.status === 'COMPLETED') {
            if (isChange) return res.status(400).json({ success: false, error: '订单已完成，无法更换号码' });
            return res.status(200).json({ success: true, phone: orderData.phone, status: orderData.status, service: orderData.service, created_at: orderData.created_at });
        }

        let rawService = orderData.service;
        if (Array.isArray(rawService)) rawService = rawService[0];
        const service = (String(rawService).trim() === 'acz') ? 'acz' : 'dr';
        const country = (service === 'dr') ? '187' : '33';

        // 如果已经在等验证码
        if (orderData.status === 'PENDING') {
            if (!isChange) {
                // 普通刷新页面，直接返回旧数据
                if (!orderData.created_at) {
                    orderData.created_at = Date.now();
                    await fetch(process.env.KV_REST_API_URL, {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
                        body: JSON.stringify(['SET', orderId, JSON.stringify(orderData)])
                    });
                }
                return res.status(200).json({ success: true, phone: orderData.phone, status: orderData.status, service: service, created_at: orderData.created_at });
            } else {
                // 【核心逻辑】处理换号请求
                const elapsed = Date.now() - (orderData.created_at || 0);
                const isExpired = elapsed >= 20 * 60 * 1000;
                const isCooldown = elapsed < 298000; // 5分钟 = 300000毫秒 (预留2秒容错)

                // 没过期且还在冷却中，驳回
                if (isCooldown && !isExpired) {
                    const left = Math.ceil((300000 - elapsed) / 1000);
                    return res.status(400).json({ success: false, error: `换号冷却中，请等待 ${left} 秒` });
                }

                // 取消旧号码（发送 status=8 退款）
                if (orderData.grizzly_id) {
                    const cancelUrl = new URL('https://api.grizzlysms.com/stubs/handler_api.php');
                    cancelUrl.searchParams.append('api_key', API_KEY);
                    cancelUrl.searchParams.append('action', 'setStatus');
                    cancelUrl.searchParams.append('status', '8');
                    cancelUrl.searchParams.append('id', orderData.grizzly_id);
                    fetch(cancelUrl.toString()).catch(() => {}); // 异步发送，不管成功失败
                }
            }
        }

        // 去 Grizzly 获取新号码
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
            orderData.created_at = Date.now(); // 记录全新的获取时间

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
