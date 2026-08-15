// 文件路径：api/create.js (卖家生成订单专用)
export default async function handler(req, res) {
    // 你的管理员密码，防止别人乱造链接，你可以自己改！
    const ADMIN_PASSWORD = 'admin'; 
    const pass = req.query.pass;
    const service = req.query.service || 'dr'; // 默认生成 ChatGPT 订单

    if (pass !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: '密码错误，无权生成链接' });
    }

    // 生成一个随机的订单号，如 ord_7a8b9c
    const orderId = 'ord_' + Math.random().toString(36).substr(2, 8);

    // 初始订单状态
    const orderData = {
        status: 'NEW',        // NEW(未使用), PENDING(等验证码), COMPLETED(已完成)
        service: service,     // dr 或 acz
        grizzly_id: null,     // 平台任务ID
        phone: null,          // 手机号
        code: null            // 验证码
    };

    // 将订单存入 Vercel KV 数据库
    await fetch(process.env.KV_REST_API_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
        body: JSON.stringify(['SET', orderId, JSON.stringify(orderData)])
    });

    // 假设你的 Vercel 域名是 my-sms-platform.vercel.app，你可以把这个域名换成你自己的
    const host = req.headers.host;
    const link = `https://${host}/?order=${orderId}`;

    return res.status(200).json({ 
        message: '订单生成成功！请将下方链接发给客户：',
        link: link
    });
}
