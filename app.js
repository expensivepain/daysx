require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const sqlite3 = require('sqlite3').verbose();
const path = require('path'); // Добавляем модуль path для работы с путями
const app = express();

const token = process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE';
const bot = new TelegramBot(token, { polling: true });

// Подключаемся к SQLite
const db = new sqlite3.Database('./database.db', (err) => {
  if (err) {
    console.error('Ошибка подключения к БД:', err.message);
  } else {
    console.log('Подключено к БД');
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      balance INTEGER DEFAULT 1000,
      tokens TEXT DEFAULT '[]'
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS tokens (
      type TEXT PRIMARY KEY,
      price INTEGER,
      quantity INTEGER
    )`);
    db.run(`INSERT OR IGNORE INTO tokens (type, price, quantity) VALUES ('happy_day', 15, 9999)`);
    db.run(`INSERT OR IGNORE INTO tokens (type, price, quantity) VALUES ('sad_day', 50, 2)`);
  }
});

// Middleware для обработки JSON и статических файлов
app.use(express.json());
app.use(express.static('public'));

// Добавляем маршрут для корневого пути
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Получение профиля
app.get('/profile', (req, res) => {
  const userId = req.query.userId;
  db.get(`SELECT balance, tokens FROM users WHERE id = ?`, [userId], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) {
      db.run(`INSERT INTO users (id, balance, tokens) VALUES (?, 1000, '[]')`, [userId], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ balance: 1000, tokens: [] });
      });
    } else {
      res.json({ balance: row.balance, tokens: JSON.parse(row.tokens) });
    }
  });
});

// Покупка токена
app.post('/buy', (req, res) => {
  const userId = req.query.userId;
  const tokenType = req.query.token;
  db.get(`SELECT price, quantity FROM tokens WHERE type = ?`, [tokenType], (err, token) => {
    if (err || !token) return res.status(400).json({ success: false, error: 'Токен не найден' });
    if (token.quantity <= 0) return res.status(400).json({ success: false, error: 'Токен распродан' });
    db.get(`SELECT balance, tokens FROM users WHERE id = ?`, [userId], (err, user) => {
      if (err || !user) return res.status(400).json({ success: false, error: 'Пользователь не найден' });
      const balance = user.balance;
      const tokens = JSON.parse(user.tokens);
      if (balance < token.price) return res.status(400).json({ success: false, error: 'Недостаточно монет' });
      const newBalance = balance - token.price;
      tokens.push(tokenType);
      db.run(`UPDATE users SET balance = ?, tokens = ? WHERE id = ?`, [newBalance, JSON.stringify(tokens), userId], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        if (token.quantity < 9999) {
          db.run(`UPDATE tokens SET quantity = quantity - 1 WHERE type = ?`, [tokenType]);
        }
        res.json({ success: true });
      });
    });
  });
});

// Отправка токена
app.post('/send', (req, res) => {
  const userId = req.query.userId;
  const tokenType = req.query.token;
  db.get(`SELECT tokens FROM users WHERE id = ?`, [userId], (err, user) => {
    if (err || !user) return res.status(400).json({ success: false, error: 'Пользователь не найден' });
    let tokens = JSON.parse(user.tokens);
    if (!tokens.includes(tokenType)) return res.status(400).json({ success: false, error: 'Токен не найден' });
    tokens = tokens.filter(t => t !== tokenType);
    db.run(`UPDATE users SET tokens = ? WHERE id = ?`, [JSON.stringify(tokens), userId], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      bot.sendMessage(userId, `Токен отправлен! Используй: @YourBotName ${tokenType}`, {
        reply_markup: {
          inline_keyboard: [[{ text: "Получить токен", url: `${req.protocol}://${req.get('host')}/claim?token=${tokenType}` }]]
        }
      });
      res.json({ success: true });
    });
  });
});

// Получение токена по ссылке (заглушка)
app.get('/claim', (req, res) => {
  const tokenType = req.query.token;
  res.send(`Токен ${tokenType} получен! Добавь логику в Mini App.`);
});

// Бот
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'Привет! Открой Mini App через меню.');
});

// Запуск сервера
app.listen(process.env.PORT || 3000, () => {
  console.log('Сервер запущен');
});