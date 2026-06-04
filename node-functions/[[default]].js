import express from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { get as dbGet, list as dbList, create as dbCreate, update as dbUpdate } from '../utils/db.js';

const app = express();
app.use(express.json());

// ========== SECURITY CONFIG ==========
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'msadmin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'MithilaSafar@2026';
const JWT_SECRET = process.env.JWT_SECRET || 'ms-booking-secret-change-this';
const TOKEN_EXPIRY = '8h';
const ADMIN_PASS_HASH = crypto.createHash('sha256').update(ADMIN_PASSWORD).digest('hex');

// Rate limiting
const loginAttempts = new Map();
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_TIME = 15 * 60 * 1000;

function checkRateLimit(ip) {
    const a = loginAttempts.get(ip);
    if (!a) return true;
    if (a.count >= MAX_LOGIN_ATTEMPTS) {
        if (Date.now() - a.lastAttempt < LOCKOUT_TIME) return false;
        loginAttempts.delete(ip); return true;
    }
    return true;
}

function recordLoginAttempt(ip, ok) {
    if (ok) { loginAttempts.delete(ip); return; }
    const a = loginAttempts.get(ip) || { count: 0, lastAttempt: 0 };
    a.count++; a.lastAttempt = Date.now();
    loginAttempts.set(ip, a);
}

// ========== AUTH MIDDLEWARE ==========
function requireAdmin(req, res, next) {
    const h = req.headers.authorization;
    if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ success: false, message: 'No token' });
    try {
        const d = jwt.verify(h.split(' ')[1], JWT_SECRET);
        if (d.role !== 'admin') return res.status(403).json({ success: false, message: 'Forbidden' });
        req.admin = d; next();
    } catch (e) { return res.status(401).json({ success: false, message: 'Invalid token' }); }
}

// ========== DATABASE HELPERS ==========
async function loadOrders() {
    try {
        const orders = await dbList('orders', { orderBy: { column: 'created_at', ascending: false } });
        return orders;
    } catch (e) { console.error('DB error:', e); return []; }
}

async function saveOrder(order) { await dbCreate('orders', order.orderId, order); }
async function updateOrder(id, data) { await dbUpdate('orders', id, data); }

// ========== PUBLIC API ==========
app.post('/api/create-order', async (req, res) => {
    const { type, itemName, amount, payNow, due, details, seats, roomType } = req.body;
    if (!type || !itemName || !amount || !payNow) return res.status(400).json({ success: false, message: 'Missing fields' });

    const order = {
        orderId: 'MS' + Date.now().toString(36).toUpperCase(),
        transactionId: crypto.randomBytes(4).toString('hex').toUpperCase(),
        type, itemName, amount: Number(amount), payNow: Number(payNow), due: Number(due) || 0,
        details, seats: seats || null, roomType: roomType || null,
        status: 'payment_pending', payMethod: 'upi',
        createdAt: new Date().toISOString(), verifiedAt: null, verifiedBy: null
    };

    await saveOrder(order);
    res.json({ success: true, orderId: order.orderId, transactionId: order.transactionId, status: 'payment_pending' });
});

app.get('/api/order-status/:orderId', async (req, res) => {
    const order = await dbGet('orders', req.params.orderId);
    if (!order) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, orderId: order.orderId, status: order.status, amount: order.amount, payNow: order.payNow, itemName: order.itemName, type: order.type });
});

// ========== ADMIN AUTH ==========
app.post('/api/admin/login', (req, res) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    if (!checkRateLimit(ip)) return res.status(429).json({ success: false, message: 'Too many attempts. Try later.' });

    const { username, password } = req.body;
    const hash = crypto.createHash('sha256').update(password || '').digest('hex');

    if (username === ADMIN_USERNAME && hash === ADMIN_PASS_HASH) {
        recordLoginAttempt(ip, true);
        res.json({ success: true, token: jwt.sign({ role: 'admin', username }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY }) });
    } else {
        recordLoginAttempt(ip, false);
        const rem = MAX_LOGIN_ATTEMPTS - (loginAttempts.get(ip)?.count || 0);
        res.status(401).json({ success: false, message: `Invalid. ${rem} attempts left.` });
    }
});

// ========== PROTECTED ADMIN API ==========
app.get('/api/admin/orders', requireAdmin, async (req, res) => {
    const orders = await loadOrders();
    orders.sort((a, b) => {
        if (a.status === 'payment_pending' && b.status !== 'payment_pending') return -1;
        if (b.status === 'payment_pending' && a.status !== 'payment_pending') return 1;
        return 0;
    });
    res.json({ success: true, orders });
});

app.post('/api/admin/verify-payment', requireAdmin, async (req, res) => {
    const { orderId, action } = req.body;
    const order = await dbGet('orders', orderId);
    if (!order) return res.status(404).json({ success: false, message: 'Not found' });

    if (order.status !== 'payment_pending') return res.json({ success: false, message: `Already ${order.status}` });

    const updates = { verifiedAt: new Date().toISOString(), verifiedBy: req.admin.username };
    if (action === 'approve') updates.status = 'confirmed';
    else if (action === 'reject') updates.status = 'payment_failed';

    await updateOrder(orderId, updates);
    res.json({ success: true, orderId, status: updates.status });
});

// ========== ADMIN PANEL HTML ==========
app.get('/admin', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Yatri Point — Admin</title>
    <style>
        *{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',sans-serif;background:#f0f2f5;color:#1a1a1a}.header{background:linear-gradient(135deg,#d84e55,#b03d44);color:#fff;padding:1rem 1.5rem;display:flex;justify-content:space-between;align-items:center}.header h1{font-size:1.2rem}.logout-btn{background:rgba(255,255,255,.2);border:none;color:#fff;padding:.4rem .8rem;border-radius:6px;cursor:pointer;font-weight:600;font-size:.8rem}.container{max-width:900px;margin:1rem auto;padding:0 1rem}.login-page{display:flex;align-items:center;justify-content:center;min-height:100vh;background:linear-gradient(135deg,#1a1a2e,#16213e)}.login-box{background:#fff;padding:2rem;border-radius:16px;width:100%;max-width:380px;box-shadow:0 20px 60px rgba(0,0,0,.3)}.login-box h2{text-align:center;color:#d84e55;margin-bottom:.3rem;font-size:1.4rem}.login-box .subtitle{text-align:center;color:#999;font-size:.82rem;margin-bottom:1.5rem}.login-box input{width:100%;padding:.7rem 1rem;border:2px solid #e0e0e0;border-radius:8px;font-size:.9rem;margin-bottom:.8rem;outline:none}.login-box input:focus{border-color:#d84e55}.login-box button{width:100%;padding:.8rem;background:linear-gradient(135deg,#d84e55,#b03d44);color:#fff;border:none;border-radius:8px;font-size:1rem;font-weight:700;cursor:pointer}.login-error{color:#e74c3c;font-size:.8rem;text-align:center;margin-bottom:.5rem;display:none}.lock-icon{text-align:center;font-size:2.5rem;margin-bottom:.5rem}.dashboard{display:none}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:.8rem;margin-bottom:1.5rem}.stat-card{background:#fff;padding:1rem;border-radius:10px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.06)}.stat-card .number{font-size:1.8rem;font-weight:800}.stat-card .label{font-size:.75rem;color:#666;margin-top:.2rem}.stat-card.pending .number{color:#f39c12}.stat-card.confirmed .number{color:#27ae60}.stat-card.failed .number{color:#e74c3c}.order-card{background:#fff;border-radius:10px;padding:1rem;margin-bottom:.8rem;box-shadow:0 2px 8px rgba(0,0,0,.06)}.order-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem}.order-id{font-weight:700;font-size:.95rem}.badge{padding:.2rem .6rem;border-radius:20px;font-size:.72rem;font-weight:700}.badge.pending{background:#fef3cd;color:#856404}.badge.confirmed{background:#d4edda;color:#155724}.badge.failed{background:#f8d7da;color:#721c24}.order-details{font-size:.82rem;color:#555;line-height:1.6}.order-details strong{color:#333}.order-actions{display:flex;gap:.5rem;margin-top:.8rem}.btn{padding:.5rem 1.2rem;border:none;border-radius:8px;font-weight:700;cursor:pointer;font-size:.82rem}.btn-approve{background:#27ae60;color:#fff}.btn-reject{background:#e74c3c;color:#fff}.refresh-btn{background:#3498db;color:#fff;border:none;padding:.5rem 1rem;border-radius:8px;cursor:pointer;font-weight:600;font-size:.85rem}.empty{text-align:center;padding:3rem;color:#999}@media(max-width:600px){.stats{grid-template-columns:1fr}}
    </style>
</head>
<body>
    <div id="loginPage" class="login-page"><div class="login-box"><div class="lock-icon">🔒</div><h2>Admin Panel</h2><p class="subtitle">Yatri Point — Payment Verification</p><div id="loginError" class="login-error"></div><input type="text" id="adminUser" placeholder="Username"><input type="password" id="adminPass" placeholder="Password"><button onclick="adminLogin()">🔐 Login</button></div></div>
    <div id="dashboard" class="dashboard">
        <div class="header"><h1>🔒 Yatri Point — Admin</h1><button class="logout-btn" onclick="adminLogout()">🚪 Logout</button></div>
        <div class="container">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem"><h3>Orders</h3><button class="refresh-btn" onclick="loadOrders()">🔄 Refresh</button></div>
            <div class="stats" id="stats"></div>
            <div id="ordersList"></div>
        </div>
    </div>
    <script>
        let T=sessionStorage.getItem('adminToken');if(T)showDashboard();
        async function adminLogin(){const u=document.getElementById('adminUser').value.trim(),p=document.getElementById('adminPass').value,e=document.getElementById('loginError');if(!u||!p){e.textContent='Enter credentials';e.style.display='block';return}try{const r=await fetch('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})});const d=await r.json();if(d.success){T=d.token;sessionStorage.setItem('adminToken',T);showDashboard()}else{e.textContent=d.message;e.style.display='block'}}catch(err){e.textContent='Server error';e.style.display='block'}}
        document.getElementById('adminPass').addEventListener('keypress',e=>{if(e.key==='Enter')adminLogin()});
        function adminLogout(){T=null;sessionStorage.removeItem('adminToken');document.getElementById('dashboard').style.display='none';document.getElementById('loginPage').style.display='flex'}
        function showDashboard(){document.getElementById('loginPage').style.display='none';document.getElementById('dashboard').style.display='block';loadOrders()}
        async function loadOrders(){try{const r=await fetch('/api/admin/orders',{headers:{'Authorization':'Bearer '+T}});if(r.status===401){adminLogout();return}const d=await r.json();if(!d.success)return;const o=d.orders,pe=o.filter(x=>x.status==='payment_pending').length,co=o.filter(x=>x.status==='confirmed').length,fa=o.filter(x=>x.status==='payment_failed').length;document.getElementById('stats').innerHTML=\`<div class="stat-card pending"><div class="number">\${pe}</div><div class="label">⏳ Pending</div></div><div class="stat-card confirmed"><div class="number">\${co}</div><div class="label">✅ Confirmed</div></div><div class="stat-card failed"><div class="number">\${fa}</div><div class="label">❌ Failed</div></div>\`;if(!o.length){document.getElementById('ordersList').innerHTML='<div class="empty">No orders yet</div>';return}document.getElementById('ordersList').innerHTML=o.map(x=>\`<div class="order-card"><div class="order-top"><span class="order-id">\${x.orderId}</span><span class="badge \${x.status==='payment_pending'?'pending':x.status==='confirmed'?'confirmed':'failed'}">\${x.status==='payment_pending'?'⏳ PENDING':x.status==='confirmed'?'✅ VERIFIED':'❌ FAILED'}</span></div><div class="order-details"><strong>\${x.itemName}</strong> (\${x.type})<br>💰 ₹\${x.amount} · Pay: ₹\${x.payNow}\${x.due>0?' · Due: ₹'+x.due:''}<br>📅 \${new Date(x.createdAt).toLocaleString('en-IN')}<br>🔑 \${x.transactionId}\${x.verifiedAt?'<br>✅ '+new Date(x.verifiedAt).toLocaleString('en-IN'):''}</div>\${x.status==='payment_pending'?'<div class="order-actions"><button class="btn btn-approve" onclick="verify(\\''+x.orderId+'\\',\\'approve\\')">✅ Approve</button><button class="btn btn-reject" onclick="verify(\\''+x.orderId+'\\',\\'reject\\')">❌ Reject</button></div>':''}</div>\`).join('')}catch(e){console.error(e)}}
        async function verify(id,action){if(!confirm(action==='approve'?'Verified in PhonePe/bank? Approve?':'Reject?'))return;const r=await fetch('/api/admin/verify-payment',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+T},body:JSON.stringify({orderId:id,action})});if(r.status===401){adminLogout();return}const d=await r.json();if(d.success){alert(action==='approve'?'✅ Verified!':'❌ Rejected.');loadOrders()}}
        setInterval(()=>{if(T)loadOrders()},30000);
    </script>
</body>
</html>
    `);
});

export default app;
