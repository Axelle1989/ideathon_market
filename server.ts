import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import path from "path";
import { fileURLToPath } from "url";
import { createServer } from "http";
import { Server } from "socket.io";
import nodemailer from "nodemailer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("market.db");
const JWT_SECRET = "super-secret-key-for-local-market";

// Initialize DB
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    password TEXT,
    role TEXT,
    name TEXT,
    balance REAL DEFAULT 0,
    welcome_code TEXT,
    shop_name TEXT,
    phone TEXT,
    lat REAL,
    lng REAL,
    bank_info TEXT,
    theme TEXT DEFAULT 'default'
  );

  CREATE TABLE IF NOT EXISTS markets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    location TEXT,
    lat REAL,
    lng REAL
  );

  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    seller_id INTEGER,
    market_id INTEGER,
    name TEXT,
    description TEXT,
    price REAL,
    photo TEXT,
    category TEXT,
    FOREIGN KEY(seller_id) REFERENCES users(id),
    FOREIGN KEY(market_id) REFERENCES markets(id)
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    buyer_id INTEGER,
    seller_id INTEGER,
    status TEXT,
    total REAL,
    items_json TEXT,
    invoice_id TEXT UNIQUE,
    paid INTEGER DEFAULT 0,
    delivery_type TEXT DEFAULT 'pickup',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(buyer_id) REFERENCES users(id),
    FOREIGN KEY(seller_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER,
    receiver_id INTEGER,
    market_id INTEGER,
    content TEXT,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(sender_id) REFERENCES users(id),
    FOREIGN KEY(receiver_id) REFERENCES users(id),
    FOREIGN KEY(market_id) REFERENCES markets(id)
  );
`);

// Migration: Add seller fields if missing
try {
  db.exec("ALTER TABLE users ADD COLUMN shop_name TEXT");
  db.exec("ALTER TABLE users ADD COLUMN phone TEXT");
  db.exec("ALTER TABLE users ADD COLUMN lat REAL");
  db.exec("ALTER TABLE users ADD COLUMN lng REAL");
  db.exec("ALTER TABLE users ADD COLUMN bank_info TEXT");
} catch (e) {
  // Columns probably already exist
}

// Migration: Add seller_type if missing
try {
  db.exec("ALTER TABLE users ADD COLUMN seller_type TEXT DEFAULT 'boutique'");
} catch (e) {
  // Column probably already exists
}

// Migration: Add is_read to messages if missing
try {
  db.exec("ALTER TABLE messages ADD COLUMN is_read INTEGER DEFAULT 0");
} catch (e) {
  // Column probably already exists
}

// Seed markets with coordinates if empty
const marketCount = db.prepare("SELECT count(*) as count FROM markets").get() as { count: number };
if (marketCount.count === 0) {
  const insertMarket = db.prepare("INSERT INTO markets (name, location, lat, lng) VALUES (?, ?, ?, ?)");
  insertMarket.run("Marché Dantokpa", "Cotonou", 6.3654, 2.4183);
  insertMarket.run("Marché Ouando", "Porto-Novo", 6.4969, 2.6289);
  insertMarket.run("Marché Arzéké", "Parakou", 9.3372, 2.6303);
  insertMarket.run("Marché de Calavi", "Abomey-Calavi", 6.4481, 2.3514);
}

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: "*" }
  });

  app.use(express.json());

  // Auth Middleware
  const authenticateToken = (req: any, res: any, next: any) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
      if (err) return res.sendStatus(403);
      req.user = user;
      next();
    });
  };

  // Socket.io logic
  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("join_chat", (room) => {
      socket.join(room);
      console.log(`User joined room: ${room}`);
    });

    socket.on("send_message", (data) => {
      const { sender_id, receiver_id, market_id, content } = data;
      const stmt = db.prepare("INSERT INTO messages (sender_id, receiver_id, market_id, content) VALUES (?, ?, ?, ?)");
      const result = stmt.run(sender_id, receiver_id, market_id, content);
      
      const message = {
        id: result.lastInsertRowid,
        sender_id,
        receiver_id,
        market_id,
        content,
        is_read: 0,
        created_at: new Date().toISOString()
      };

      io.to(`chat_${market_id}_${sender_id}_${receiver_id}`).emit("receive_message", message);
      io.to(`chat_${market_id}_${receiver_id}_${sender_id}`).emit("receive_message", message);
      
      // Notify receiver about new message (for badges)
      io.to(`user_${receiver_id}`).emit("new_message_notification", message);
    });

    socket.on("join_user_room", (userId) => {
      socket.join(`user_${userId}`);
      console.log(`User joined personal room: user_${userId}`);
    });

    socket.on("disconnect", () => {
      console.log("User disconnected");
    });
  });

  // Auth Routes
  app.post("/api/auth/register", (req, res) => {
    const { email, password, role, name, shop_name, seller_type, phone, bank_info, lat, lng } = req.body;
    
    // Check if user already exists
    const existingUser = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (existingUser) {
      return res.status(400).json({ error: "Email already exists" });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    const welcomeCode = `BIENVENUE-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    try {
      const stmt = db.prepare("INSERT INTO users (email, password, role, name, welcome_code, shop_name, seller_type, phone, bank_info, lat, lng) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
      const result = stmt.run(email, hashedPassword, role, name, welcomeCode, shop_name || null, seller_type || 'boutique', phone || null, bank_info || null, lat || null, lng || null);
      const token = jwt.sign({ id: result.lastInsertRowid, email, role, name }, JWT_SECRET);
      res.json({ token, user: { 
        id: result.lastInsertRowid, 
        email, 
        role, 
        name, 
        balance: 0, 
        welcome_code: welcomeCode,
        shop_name,
        seller_type: seller_type || 'boutique',
        phone,
        bank_info,
        lat,
        lng
      } });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/auth/login", (req, res) => {
    const { email, password } = req.body;
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as any;
    if (user && bcrypt.compareSync(password, user.password)) {
      const token = jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.name }, JWT_SECRET);
      res.json({ token, user: { 
        id: user.id, 
        email: user.email, 
        role: user.role, 
        name: user.name, 
        balance: user.balance,
        shop_name: user.shop_name,
        phone: user.phone,
        bank_info: user.bank_info,
        lat: user.lat,
        lng: user.lng,
        theme: user.theme
      } });
    } else {
      res.status(401).json({ error: "Invalid credentials" });
    }
  });

  app.post("/api/user/location", authenticateToken, (req: any, res) => {
    const { lat, lng } = req.body;
    try {
      db.prepare("UPDATE users SET lat = ?, lng = ? WHERE id = ?").run(lat, lng, req.user.id);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to update location" });
    }
  });

  app.put("/api/user/profile", authenticateToken, (req: any, res) => {
    const { name, shop_name, seller_type, phone, bank_info, theme } = req.body;
    try {
      db.prepare("UPDATE users SET name = ?, shop_name = ?, seller_type = ?, phone = ?, bank_info = ?, theme = ? WHERE id = ?")
        .run(name, shop_name, seller_type || 'boutique', phone, bank_info, theme || 'default', req.user.id);
      
      const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id) as any;
      res.json({ 
        success: true, 
        user: { 
          id: user.id, 
          email: user.email, 
          role: user.role, 
          name: user.name, 
          balance: user.balance,
          shop_name: user.shop_name,
          seller_type: user.seller_type,
          phone: user.phone,
          bank_info: user.bank_info,
          lat: user.lat,
          lng: user.lng,
          theme: user.theme
        } 
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to update profile" });
    }
  });

  app.delete("/api/user", authenticateToken, (req: any, res) => {
    try {
      const userId = req.user.id;
      // Delete items, orders, messages associated with user
      db.prepare("DELETE FROM items WHERE seller_id = ?").run(userId);
      db.prepare("DELETE FROM orders WHERE buyer_id = ? OR seller_id = ?").run(userId, userId);
      db.prepare("DELETE FROM messages WHERE sender_id = ? OR receiver_id = ?").run(userId, userId);
      db.prepare("DELETE FROM users WHERE id = ?").run(userId);
      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to delete account" });
    }
  });

  // Market Routes
  app.get("/api/markets", (req, res) => {
    // Get all markets and check if they have sellers (items)
    const markets = db.prepare(`
      SELECT m.*, 
             (SELECT COUNT(DISTINCT i.seller_id) FROM items i WHERE i.market_id = m.id) > 0 as has_sellers,
             'market' as type
      FROM markets m
    `).all();

    // Get sellers who have items but might be considered standalone boutiques
    const boutiques = db.prepare(`
      SELECT DISTINCT 
        u.id + 10000 as id, 
        u.shop_name as name, 
        'Boutique Indépendante' as location, 
        u.lat, 
        u.lng,
        'boutique' as type,
        u.id as seller_id,
        1 as has_sellers
      FROM users u
      JOIN items i ON u.id = i.seller_id
      WHERE u.role = 'seller' AND u.lat IS NOT NULL AND u.lng IS NOT NULL
      AND (i.market_id IS NULL OR i.market_id = 0)
    `).all();

    res.json([...markets, ...boutiques]);
  });

  app.get("/api/markets/:id/sellers", (req, res) => {
    const id = parseInt(req.params.id);
    
    if (id >= 10000) {
      // It's a boutique, return the specific seller
      const sellerId = id - 10000;
      const seller = db.prepare(`
        SELECT id, name, email, shop_name, phone, lat, lng
        FROM users 
        WHERE id = ? AND role = 'seller'
      `).get(sellerId);
      res.json(seller ? [seller] : []);
    } else {
      // It's a regular market
      const sellers = db.prepare(`
        SELECT DISTINCT users.id, users.name, users.email, users.shop_name, users.phone, users.lat, users.lng
        FROM users 
        JOIN items ON users.id = items.seller_id 
        WHERE items.market_id = ? AND users.role = 'seller'
      `).all(id);
      res.json(sellers);
    }
  });

  // Seller Routes
  app.get("/api/sellers", (req, res) => {
    const sellers = db.prepare(`
      SELECT DISTINCT 
        u.id, u.name, u.shop_name, u.phone, u.lat, u.lng,
        COALESCE(m.name, 'Boutique Indépendante') as market_name,
        (SELECT GROUP_CONCAT(name, ', ') FROM (SELECT DISTINCT name FROM items WHERE seller_id = u.id LIMIT 5)) as products
      FROM users u
      LEFT JOIN items i ON u.id = i.seller_id
      LEFT JOIN markets m ON i.market_id = m.id
      WHERE u.role = 'seller'
    `).all();
    res.json(sellers);
  });

  // Item Routes
  app.get("/api/items", (req, res) => {
    const { market_id, category, seller_id, name, min_price, max_price } = req.query;
    let query = `
      SELECT items.*, users.name as seller_name, COALESCE(markets.name, 'Boutique Indépendante') as market_name 
      FROM items 
      JOIN users ON items.seller_id = users.id 
      LEFT JOIN markets ON items.market_id = markets.id
    `;
    const params: any[] = [];
    
    const conditions = [];
    if (market_id) {
      const mid = parseInt(market_id as string);
      if (mid >= 10000) {
        // It's a boutique, filter by seller_id instead
        conditions.push("items.seller_id = ?");
        params.push(mid - 10000);
      } else if (mid === 0) {
        // It's a boutique item (no market)
        conditions.push("(items.market_id IS NULL OR items.market_id = 0)");
      } else {
        conditions.push("items.market_id = ?");
        params.push(mid);
      }
    }
    if (category) {
      conditions.push("category = ?");
      params.push(category);
    }
    if (seller_id) {
      conditions.push("seller_id = ?");
      params.push(seller_id);
    }
    if (name) {
      conditions.push("(items.name LIKE ? OR items.description LIKE ?)");
      params.push(`%${name}%`);
      params.push(`%${name}%`);
    }
    if (min_price) {
      conditions.push("price >= ?");
      params.push(parseFloat(min_price as string));
    }
    if (max_price) {
      conditions.push("price <= ?");
      params.push(parseFloat(max_price as string));
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }
    
    const items = db.prepare(query).all(...params);
    res.json(items);
  });

  app.get("/api/my-items", authenticateToken, (req: any, res) => {
    const { min_price, max_price } = req.query;
    let query = "SELECT * FROM items WHERE seller_id = ?";
    const params: any[] = [req.user.id];

    if (min_price) {
      query += " AND price >= ?";
      params.push(parseFloat(min_price as string));
    }
    if (max_price) {
      query += " AND price <= ?";
      params.push(parseFloat(max_price as string));
    }

    const items = db.prepare(query).all(...params);
    res.json(items);
  });

  app.post("/api/items", authenticateToken, (req: any, res) => {
    try {
      const { name, description, price, photo, market_id, category } = req.body;
      if (!name || !price) {
        return res.status(400).json({ error: "Le nom et le prix sont obligatoires" });
      }
      const stmt = db.prepare("INSERT INTO items (seller_id, market_id, name, description, price, photo, category) VALUES (?, ?, ?, ?, ?, ?, ?)");
      const result = stmt.run(req.user.id, market_id || 0, name, description || "", price, photo || "", category || "");
      res.json({ id: result.lastInsertRowid });
    } catch (e) {
      console.error("Error saving item:", e);
      res.status(500).json({ error: "Erreur lors de l'enregistrement de l'article" });
    }
  });

  app.put("/api/items/:id", authenticateToken, (req: any, res) => {
    try {
      const { name, description, price, photo, market_id, category } = req.body;
      const item = db.prepare("SELECT * FROM items WHERE id = ?").get(req.params.id) as any;
      if (!item || item.seller_id !== req.user.id) return res.sendStatus(403);
      
      const stmt = db.prepare("UPDATE items SET name = ?, description = ?, price = ?, photo = ?, market_id = ?, category = ? WHERE id = ?");
      stmt.run(name, description || "", price, photo || "", market_id || 0, category || "", req.params.id);
      res.json({ success: true });
    } catch (e) {
      console.error("Error updating item:", e);
      res.status(500).json({ error: "Erreur lors de la modification de l'article" });
    }
  });

  app.delete("/api/items/:id", authenticateToken, (req: any, res) => {
    const item = db.prepare("SELECT * FROM items WHERE id = ?").get(req.params.id) as any;
    if (!item || item.seller_id !== req.user.id) return res.sendStatus(403);
    
    db.prepare("DELETE FROM items WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // Balance Routes
  app.get("/api/balance", authenticateToken, (req: any, res) => {
    const user = db.prepare("SELECT balance FROM users WHERE id = ?").get(req.user.id) as any;
    res.json({ balance: user.balance });
  });

  app.post("/api/balance/add", authenticateToken, (req: any, res) => {
    const { amount } = req.body;
    if (amount <= 0) return res.status(400).json({ error: "Invalid amount" });
    
    db.prepare("UPDATE users SET balance = balance + ? WHERE id = ?").run(amount, req.user.id);
    const user = db.prepare("SELECT balance FROM users WHERE id = ?").get(req.user.id) as any;
    res.json({ balance: user.balance });
  });

  // Order Routes
  app.post("/api/orders", authenticateToken, async (req: any, res) => {
    const { seller_id, total, items, pay_online, delivery_type } = req.body;
    const buyer_id = req.user.id;

    const buyer = db.prepare("SELECT balance, name FROM users WHERE id = ?").get(buyer_id) as any;
    
    if (pay_online) {
      if (buyer.balance < total) {
        return res.status(400).json({ error: "Solde insuffisant" });
      }
      // Deduct balance from buyer
      db.prepare("UPDATE users SET balance = balance - ? WHERE id = ?").run(total, buyer_id);
      // Add balance to seller (virtual wallet)
      db.prepare("UPDATE users SET balance = balance + ? WHERE id = ?").run(total, seller_id);
    }

    const invoice_id = `INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const stmt = db.prepare("INSERT INTO orders (buyer_id, seller_id, status, total, items_json, invoice_id, paid, delivery_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    const result = stmt.run(buyer_id, seller_id, pay_online ? 'paid' : 'pending', total, JSON.stringify(items), invoice_id, pay_online ? 1 : 0, delivery_type || 'pickup');

    const seller = db.prepare("SELECT email, name FROM users WHERE id = ?").get(seller_id) as any;
    console.log(`ORDER PLACED: From ${buyer.name} to ${seller.name}. Total: ${total} FCFA. Paid: ${pay_online}. Mode: ${delivery_type}. Invoice: ${invoice_id}`);

    res.json({ 
      id: result.lastInsertRowid, 
      invoice_id, 
      paid: pay_online,
      message: pay_online ? "Commande payée et envoyée" : "Commande envoyée au vendeur" 
    });
  });

  app.get("/api/orders", authenticateToken, (req: any, res) => {
    const role = req.user.role;
    let query = "";
    if (role === 'seller') {
      query = `
        SELECT o.*, u.name as buyer_name, u.phone as buyer_phone
        FROM orders o
        JOIN users u ON o.buyer_id = u.id
        WHERE o.seller_id = ?
        ORDER BY o.created_at DESC
      `;
    } else {
      query = `
        SELECT o.*, u.name as seller_name, u.shop_name as seller_shop_name, u.phone as seller_phone
        FROM orders o
        JOIN users u ON o.seller_id = u.id
        WHERE o.buyer_id = ?
        ORDER BY o.created_at DESC
      `;
    }
    const orders = db.prepare(query).all(req.user.id);
    res.json(orders);
  });

  app.put("/api/orders/:id/status", authenticateToken, (req: any, res) => {
    const { status } = req.body;
    const orderId = req.params.id;
    const sellerId = req.user.id;

    const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId) as any;
    if (!order || order.seller_id !== sellerId) return res.sendStatus(403);

    db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(status, orderId);
    res.json({ success: true });
  });

  app.get("/api/orders/:invoice_id", authenticateToken, (req: any, res) => {
    const order = db.prepare(`
      SELECT orders.*, users.name as seller_name 
      FROM orders 
      JOIN users ON orders.seller_id = users.id 
      WHERE invoice_id = ? AND buyer_id = ?
    `).get(req.params.invoice_id, req.user.id) as any;
    
    if (!order) return res.status(404).json({ error: "Facture non trouvée" });
    res.json(order);
  });

  // Message Routes
  app.get("/api/messages", authenticateToken, (req: any, res) => {
    const { other_user_id, market_id } = req.query;
    
    // Mark as read when fetching
    db.prepare("UPDATE messages SET is_read = 1 WHERE receiver_id = ? AND sender_id = ? AND market_id = ?")
      .run(req.user.id, other_user_id, market_id);

    const messages = db.prepare(`
      SELECT * FROM messages 
      WHERE market_id = ? 
      AND ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))
      ORDER BY created_at ASC
    `).all(market_id, req.user.id, other_user_id, other_user_id, req.user.id);
    res.json(messages);
  });

  app.get("/api/conversations", authenticateToken, (req: any, res) => {
    const userId = req.user.id;
    const conversations = db.prepare(`
      WITH LastMessages AS (
        SELECT MAX(id) as last_id
        FROM messages 
        WHERE sender_id = ? OR receiver_id = ?
        GROUP BY market_id, (CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END)
      ),
      ConvDetails AS (
        SELECT 
          m.market_id,
          CASE WHEN m.sender_id = ? THEN m.receiver_id ELSE m.sender_id END as other_user_id,
          m.content as last_message,
          m.created_at as last_message_at,
          m.id as message_id
        FROM messages m
        WHERE m.id IN (SELECT last_id FROM LastMessages)
      )
      SELECT 
        cd.market_id,
        cd.other_user_id,
        u.name as other_user_name,
        u.shop_name as other_shop_name,
        mk.name as market_name,
        cd.last_message,
        cd.last_message_at,
        (SELECT COUNT(*) FROM messages WHERE receiver_id = ? AND sender_id = cd.other_user_id AND market_id = cd.market_id AND is_read = 0) as unread_count
      FROM ConvDetails cd
      JOIN users u ON u.id = cd.other_user_id
      LEFT JOIN markets mk ON mk.id = cd.market_id
      ORDER BY cd.last_message_at DESC
    `).all(userId, userId, userId, userId, userId);
    res.json(conversations);
  });

  app.post("/api/messages/read", authenticateToken, (req: any, res) => {
    const { other_user_id, market_id } = req.body;
    db.prepare("UPDATE messages SET is_read = 1 WHERE receiver_id = ? AND sender_id = ? AND market_id = ?")
      .run(req.user.id, other_user_id, market_id);
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  httpServer.listen(3000, "0.0.0.0", () => {
    console.log("Server running on http://localhost:3000");
  });
}

startServer();
