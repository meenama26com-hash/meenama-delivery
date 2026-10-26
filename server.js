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

app.use(express.json({ limit: "2mb" }));
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

app.get("/api/health", (req, res) => {
  res.json({ ok: true, app: "MeenaMa Delivery API" });
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
app.put("/api/delivery-status", (req, res) => {
  if (!req.body || !Array.isArray(req.body.deliveryBoys)) {
    return res.status(400).json({ error: "deliveryBoys must be an array" });
  }
  saveDeliveryStatus(req.body);
  res.json({ ok: true, count: req.body.deliveryBoys.length });
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
app.get(["/delivery", "/delivery/", "/delivery.html"], (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(path.join(__dirname, "delivery.html"), err => {
    if (err && !res.headersSent) res.status(404).send("Delivery Boy file missing from deployment.");
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
