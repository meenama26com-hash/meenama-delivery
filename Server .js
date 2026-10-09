const express = require('express'); const fs = require('fs'); const path = require('path');
const app = express(); const PORT = process.env.PORT || 3000; const DATA = process.env.DATA_DIR || path.join(__dirname, 'data'); const DB = path.join(DATA, 'orders.json');
fs.mkdirSync(DATA, { recursive: true });
if (!fs.existsSync(DB)) { fs.writeFileSync(DB, '[]'); }
app.use(express.json({ limit: '2mb' })); app.use(express.static(path.join(__dirname, 'public')));
app.get('/api/health', (req, res) => { res.json({ ok: true, app: 'MeenaMa Delivery API', mode: 'prototype' }); });
app.get('/api/orders', (req, res) => { try { res.json(JSON.parse(fs.readFileSync(DB, 'utf8'))); } catch (error) { res.status(500).json({ error: 'Could not read orders' }); } });
app.put('/api/orders', (req, res) => { if (!Array.isArray(req.body.orders)) { return res.status(400).json({ error: 'orders must be an array' }); }
try { fs.writeFileSync( DB, JSON.stringify(req.body.orders, null, 2) );
res.json({
  ok: true,
  count: req.body.orders.length
});
} catch (error) { res.status(500).json({ error: 'Could not save orders' }); } });
app.get('*', (req, res, next) => { if (req.path.startsWith('/api/')) { return next(); }
res.sendFile( path.join(__dirname, 'public', 'MeenaMa_Customer_App.html') ); });
app.listen(PORT, () => { console.log(MeenaMa Delivery server running on port ${PORT}); });
