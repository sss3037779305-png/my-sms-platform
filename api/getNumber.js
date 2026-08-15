// 【小白专属配置区】以后加新项目，只需要在这里加一行即可！
// 格式：'项目代码': '国家代码'
const SERVICE_CONFIG = {
    'dr': '187',  // ChatGPT - 美国实卡
    'acz': '187', // Claude - 美国实卡 (根据你的要求改为了187)
    'tw': '12',   // X (Twitter) - 美国虚拟
    'go': '12',   // Google - 美国虚拟
    'ot': '187',  // 其他项目 - 美国实卡
    'ig': '12',   // Instagram - 美国虚拟
    'tg': '12'    // Telegram - 美国虚拟
};

export default async function handler(req, res) {
    const orderId = req.query.order;
    const isChange = req.query.change === 'true'; 

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

        if (orderData.status === 'COMPLETED') {
            if (isChange) return res.status(400).json({ success: false, error: '订单已完成，无法更换号码' });
            return res.status(200).json({ success: true, phone: orderData.phone, status: orderData.status, service: orderData.service, created_at: orderData.created_at });
        }

        // 【智能匹配项目和国家】
        let rawService = orderData.service;
        if (Array.isArray(rawService)) rawService = rawService[0];
        let service = String(rawService).trim();
        
        // 如果数据库里的项目代码不在我们的配置表里，默认给它分配 'dr' (ChatGPT)
        if (!SERVICE_CONFIG[service]) {
            service = 'dr';
        }
        // 根据配置表自动获取对应的国家代码
        const country = SERVICE_CONFIG[service];

        if (orderData.status === 'PENDING') {
            if (!isChange) {
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
                const elapsed = Date.now() - (orderData.created_at || 0);
                const isExpired = elapsed >= 20 * 60 * 1000;
                const isCooldown = elapsed < 178000; 

                if (isCooldown && !isExpired) {
                    const left = Math.ceil((180000 - elapsed) / 1000);
                    return res.status(400).json({ success: false, error: `换号冷却中，请等待 ${left} 秒` });
                }

                if (orderData.grizzly_id) {
                    const cancelUrl = new URL('https://api.grizzlysms.com/stubs/handler_api.php');
                    cancelUrl.searchParams.append('api_key', API_KEY);
                    cancelUrl.searchParams.append('action', 'setStatus');
                    cancelUrl.searchParams.append('status', '8');
                    cancelUrl.searchParams.append('id', orderData.grizzly_id);
                    fetch(cancelUrl.toString()).catch(() => {}); 
                }
            }
        }

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
            orderData.created_at = Date.now(); 

            await fetch(process.env.KV_REST_API_URL, {
                method: 'POST',
                headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
                body: JSON.stringify(['SET', orderId, JSON.stringify(orderData)])
            });

            return res.status(200).json({ success: true, phone: orderData.phone, service: service, created_at: orderData.created_at });
        } else {
            return res.status(400).json({ success: false, error: text });
        }
    } catch (error) {
        return res.status(500).json({ success: false, error: '系统错误' });
    }
}
