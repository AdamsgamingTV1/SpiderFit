const express = require("express");
const session = require("express-session");
const bcrypt = require("bcrypt");
const bodyParser = require("body-parser");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const app = express();
const db = new sqlite3.Database("spiderfit.db");

app.set("view engine", "ejs");
app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
  secret: "spiderfit_secret",
  resave: false,
  saveUninitialized: false
}));

function checkAuth(req, res, next) {
  if (!req.session.user) return res.redirect("/login");
  next();
}

app.get("/", (req, res) => {
  db.all("SELECT * FROM products", [], (err, products) => {
    if (err) throw err;
    const isVip = req.session.user?.is_vip || false;
    res.render("index", { products, isVip, user: req.session.user });
  });
});

app.get("/register", (req, res) => res.render("register"));
app.post("/register", async (req, res) => {
  const { username, password, vip } = req.body;
  const hashed = await bcrypt.hash(password, 10);
  db.run("INSERT INTO users (username, password, is_vip) VALUES (?, ?, ?)",
    [username, hashed, vip === "on"], err => {
      if (err) return res.send("Uživatel existuje.");
      res.redirect("/login");
    });
});

app.get("/login", (req, res) => res.render("login"));
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  db.get("SELECT * FROM users WHERE username = ?", [username], async (err, user) => {
    if (!user) return res.send("Uživatel neexistuje");
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.send("Špatné heslo");
    req.session.user = { id: user.id, username: user.username, is_vip: user.is_vip };
    res.redirect("/");
  });
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

app.post("/cart/add", checkAuth, (req, res) => {
  const { product_id } = req.body;
  const user_id = req.session.user.id;
  db.get("SELECT * FROM cart WHERE user_id = ? AND product_id = ?", [user_id, product_id], (err, row) => {
    if (row) {
      db.run("UPDATE cart SET quantity = quantity + 1 WHERE id = ?", [row.id]);
    } else {
      db.run("INSERT INTO cart (user_id, product_id, quantity) VALUES (?, ?, 1)", [user_id, product_id]);
    }
    res.redirect("/cart");
  });
});

app.get("/cart", checkAuth, (req, res) => {
  const user_id = req.session.user.id;
  const isVip = req.session.user.is_vip;

  const query = `
    SELECT p.*, c.quantity FROM cart c
    JOIN products p ON p.id = c.product_id
    WHERE c.user_id = ?
  `;

  db.all(query, [user_id], (err, items) => {
    let total = 0;
    items.forEach(item => {
      let price = item.price;
      if (isVip) price *= 0.7;
      if (item.quantity >= 10) price *= 0.9;
      total += price * item.quantity;
    });

    res.render("cart", { items, total, isVip, user: req.session.user });
  });
});

app.listen(3000, () => console.log("SpiderFit běží na http://localhost:3000"));
