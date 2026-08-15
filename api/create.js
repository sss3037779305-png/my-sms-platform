export default async function handler(req, res) {
    // 你的管理员密码
    const ADMIN_PASSWORD = 'admin'; 
    const pass = req.query.pass;
    const service = req.query.service || 'dr'; // dr 或 acz
    
    // 新增：读取你要生成的数量，默认是 1 个
    let count = parseInt(req.query.count) || 1; 

    if (pass !== ADMIN_PASSWORD) {
        return res.status(401).send('密码错误，无权生成链接');
    }

    // 限制单次最多生成 100 个，防止数据库请求过多导致超时报错
    if (count > 100) count = 100;

    const host = req.headers.host;
    let links = [];

    // 循环生成指定数量的订单
    for (let i = 0; i < count; i++) {
        const orderId = 'ord_' + Math.random().toString(36).substr(2, 8);
        const orderData = {
            status: 'NEW',
            service: service,
            grizzly_id: null,
            phone: null,
            code: null
        };

        // 存入 Vercel KV 数据库
        await fetch(process.env.KV_REST_API_URL, {
            method: 'POST',
            headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
            body: JSON.stringify(['SET', orderId, JSON.stringify(orderData)])
        });

        // 拼接好专属链接，放进数组里
        links.push(`https://${host}/?order=${orderId}`);
    }

    // 【关键修改】将返回格式改为“纯文本”，每行一个链接，方便你直接复制
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(200).send(links.join('\n'));
}
