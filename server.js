const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();app.use((req, res, next) => {
res.setHeader("Access-Control-Allow-Origin", "*");
res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

if (req.method === "OPTIONS") {
return res.sendStatus(204);
}

next();
});
const PORT = process.env.PORT || 3000;
const DB = path.join(__dirname, "orders.json");

app.use(express.json({ limit: "12mb" }));
app.use(express.static(__dirname));

function readOrders() {
  try {
    return JSON.parse(fs.readFileSync(DB, "utf8"));
  } catch {
    return [];
  }
}

function saveOrders(orders) {
  fs.writeFileSync(DB, JSON.stringify(orders, null, 2));
}

app.post("/api/delivery-login", (req, res) => {
  const mobile = String(req.body?.mobile || "").trim();
  const pin = String(req.body?.pin || "").trim();
  const configuredPin = process.env.DELIVERY_BOY_PIN;
  if (!configuredPin) return res.status(503).json({ ok: false, error: "Delivery Boy login is not configured on the server." });
  if (!/^\+?[0-9]{10,15}$/.test(mobile)) return res.status(400).json({ ok: false, error: "Enter a valid registered mobile number." });
  if (!pin || pin !== configuredPin) return res.status(401).json({ ok: false, error: "PIN galat hai." });
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true, mobile });
});

// Public merchant details only; the actual UPI ID is configured privately in Render env vars.
app.get("/api/payment-settings", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ payeeName: "MeenaMa Delivery", merchantUpi: String(process.env.MEENAMA_MERCHANT_UPI || "").trim() });
});

const PRICING_DB = path.join(__dirname, "delivery-settings.json");
const DEFAULT_PRICING = { deliveryMode: "fixed", deliveryFee: 15, lowThreshold: 199, lowFee: 15, midThreshold: 499, midFee: 10, handlingFee: 0, platformFee: 0, surgeFee: 0, minimumOrder: 0, businessStatus: "open" };
function readPricing() { try { return { ...DEFAULT_PRICING, ...JSON.parse(fs.readFileSync(PRICING_DB, "utf8")) }; } catch { return { ...DEFAULT_PRICING }; } }
function savePricing(value) { const clean = {}; for (const key of ["deliveryFee","lowThreshold","lowFee","midThreshold","midFee","handlingFee","platformFee","surgeFee","minimumOrder"]) { const n = Number(value[key]); if (!Number.isFinite(n) || n < 0) return null; clean[key] = n; } clean.deliveryMode = value.deliveryMode === "slabs" ? "slabs" : "fixed"; if (clean.midThreshold < clean.lowThreshold) return null; clean.businessStatus = value.businessStatus === "closed" ? "closed" : "open"; fs.writeFileSync(PRICING_DB, JSON.stringify(clean, null, 2)); return clean; }
app.get("/api/delivery-settings", (req, res) => { res.setHeader("Cache-Control", "no-store"); res.json(readPricing()); });
app.put("/api/delivery-settings", (req, res) => { const settings = savePricing(req.body || {}); if (!settings) return res.status(400).json({ ok: false, error: "Invalid delivery pricing settings" }); res.json({ ok: true, settings }); });

app.get("/api/health", (req, res) => {
  res.json({ ok: true, app: "MeenaMa Delivery API" });
});

// Shared product catalogue used by the existing Admin and Customer apps.
const PRODUCTS_DB = path.join(__dirname, "products.json");
function readProducts() { try { const v = JSON.parse(fs.readFileSync(PRODUCTS_DB, "utf8")); return Array.isArray(v) ? v : []; } catch { return []; } }
function saveProducts(items) { fs.writeFileSync(PRODUCTS_DB, JSON.stringify(items, null, 2)); }
app.get("/api/products", (req, res) => { res.setHeader("Cache-Control", "no-store"); res.json({ ok: true, products: readProducts() }); });
app.put("/api/products", (req, res) => {
  const items = req.body && req.body.products;
  if (!Array.isArray(items)) return res.status(400).json({ ok: false, error: "products must be an array" });
  if (items.length > 2000) return res.status(413).json({ ok: false, error: "Too many products" });
  for (const p of items) {
    if (!p || typeof p !== "object" || !String(p.name || "").trim()) return res.status(400).json({ ok: false, error: "Every product needs a name" });
  }
  saveProducts(items);
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true, count: items.length, products: items });
});

const DELIVERY_DB = path.join(__dirname, "delivery-status.json");
function readDeliveryStatus() {
  try { return JSON.parse(fs.readFileSync(DELIVERY_DB, "utf8")); }
  catch { return { deliveryBoys: [] }; }
}
function saveDeliveryStatus(data) {
  fs.writeFileSync(DELIVERY_DB, JSON.stringify(data, null, 2));
}
app.get("/api/delivery-status", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(readDeliveryStatus());
});
app.patch("/api/delivery-status/:mobile", (req, res) => {
  const mobile = String(req.params.mobile || "").replace(/\D/g, "").slice(-10);
  if (!/^\d{10}$/.test(mobile)) return res.status(400).json({ ok: false, error: "Valid 10-digit mobile required" });
  const current = readDeliveryStatus();
  const list = Array.isArray(current.deliveryBoys) ? current.deliveryBoys : [];
  const incoming = req.body && typeof req.body === "object" ? req.body : {};
  const prior = list.find(x => String(x.mobile || "").replace(/\D/g, "").slice(-10) === mobile) || {};
  const entry = { ...prior, ...incoming, mobile, updatedAt: new Date().toISOString() };
  const next = list.filter(x => String(x.mobile || "").replace(/\D/g, "").slice(-10) !== mobile);
  next.push(entry);
  saveDeliveryStatus({ deliveryBoys: next });
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true, deliveryBoy: entry });
});
app.put("/api/delivery-status", (req, res) => {
  if (!req.body || !Array.isArray(req.body.deliveryBoys)) {
    return res.status(400).json({ error: "deliveryBoys must be an array" });
  }
  saveDeliveryStatus(req.body);
  res.json({ ok: true, count: req.body.deliveryBoys.length });
});

const OFFERS_DB = path.join(__dirname, "offers.json");
function readOffers() { try { const value = JSON.parse(fs.readFileSync(OFFERS_DB, "utf8")); return Array.isArray(value) ? value : []; } catch { return []; } }
function saveOffers(offers) { fs.writeFileSync(OFFERS_DB, JSON.stringify(offers, null, 2)); }
app.get("/api/offers", (req, res) => { res.setHeader("Cache-Control", "no-store"); res.json(readOffers()); });
app.put("/api/offers", (req, res) => {
  if (!req.body || !Array.isArray(req.body.offers)) return res.status(400).json({ ok: false, error: "offers must be an array" });
  const offers = req.body.offers.map((o, i) => ({ id: String(o.id || ("OFF" + Date.now() + i)), title: String(o.title || "").trim().slice(0,100), description: String(o.description || "").trim().slice(0,240), image: String(o.image || "").trim().slice(0,1200000), badge: String(o.badge || "OFFER").trim().slice(0,30), active: o.active !== false, startsAt: o.startsAt ? new Date(o.startsAt).toISOString() : null, endsAt: o.endsAt ? new Date(o.endsAt).toISOString() : null, updatedAt: new Date().toISOString() })).filter(o => o.title);
  saveOffers(offers); res.json({ ok: true, count: offers.length, offers });
});
app.get("/api/orders", (req, res) => {
  res.json(readOrders());
});

app.post("/api/orders", (req, res) => {
  if (!req.body || typeof req.body !== "object") {
    return res.status(400).json({ error: "Invalid order" });
  }

  const orders = readOrders();
  const order = {
    ...req.body,
    id: req.body.id || Date.now().toString(),
    status: req.body.status || "New Order",
    createdAt: new Date().toISOString()
  };

  orders.push(order);
  saveOrders(orders);

  res.status(201).json({ ok: true, order });
});

app.patch("/api/orders/:id", (req, res) => {
  const orders = readOrders();
  const index = orders.findIndex(
    order => String(order.id) === String(req.params.id)
  );

  if (index === -1) {
    return res.status(404).json({ error: "Order not found" });
  }

  orders[index] = { ...orders[index], ...req.body };
  saveOrders(orders);

  res.json({ ok: true, order: orders[index] });
});

app.put("/api/orders", (req, res) => {
  if (!Array.isArray(req.body.orders)) {
    return res.status(400).json({ error: "Orders must be an array" });
  }

  saveOrders(req.body.orders);
  res.json({ ok: true, count: req.body.orders.length });
});

// Explicit app routes so Admin and Delivery Boy pages never fall back to customer index.
app.get(["/admin", "/admin/", "/MeenaMa_Owner_Admin.html"], (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(path.join(__dirname, "MeenaMa_Owner_Admin.html"), err => {
    if (err && !res.headersSent) res.status(404).send("Admin file missing from deployment. Please check repository root.");
  });
});
app.get(["/delivery", "/delivery/", "/delivery.html", "/MeenaMa_Delivery_Boy_App.html"], (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(path.join(__dirname, "MeenaMa_Delivery_Boy_App.html"), err => {
    if (err && !res.headersSent) res.status(404).send("Green Delivery Boy file missing from deployment.");
  });
});

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return next();
  }

  res.sendFile(path.join(__dirname, "index.html"), err => {
    if (err && !res.headersSent) {
      res.status(404).send("MeenaMa page not found");
    }
  });
});

app.listen(PORT, () => {
  console.log(`MeenaMa API running on port ${PORT}`);
});
