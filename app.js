require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { Pool } = require('pg');
const path = require('path');
const app = express();

const token = process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE';
const bot = new TelegramBot(token);

// Настройка вебхука
const domain = process.env.VERCEL_URL || 'https://daysx.vercel.app';
const webhookPath = '/webhook';
bot.setWebHook(`${domain}${webhookPath}`).then(() => {
  console.log(`Вебхук установлен: ${domain}${webhookPath}`);
}).catch(err => {
  console.error('Ошибка установки вебхука:', err.message);
});

// Подключение к Supabase Postgres
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Тест подключения
pool.connect((err) => {
  if (err) {
    console.error('Ошибка теста подключения:', err.message);
  } else {
    console.log('Тест подключения успешен');
  }
});

// Инициализация таблиц
(async () => {
  try {
    console.log('Начинаю создавать таблицы...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        balance INTEGER DEFAULT 1000,
        tokens TEXT DEFAULT '[]'
      )
    `);
    console.log('Таблица users создана');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tokens (
        type TEXT PRIMARY KEY,
        price INTEGER,
        quantity INTEGER
      )
    `);
    console.log('Таблица tokens создана');
    await pool.query(`
      INSERT INTO tokens (type, price, quantity) VALUES ('happy_day', 15, 9999) ON CONFLICT DO NOTHING
    `);
    console.log('Токен happy_day добавлен');
    await pool.query(`
      INSERT INTO tokens (type, price, quantity) VALUES ('sad_day', 50, 2) ON CONFLICT DO NOTHING
    `);
    console.log('Токен sad_day добавлен');
    console.log('Подключено к БД');
  } catch (err) {
    console.error('Ошибка подключения к БД:', err.message);
  }
})();

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Вебхук для Telegram
app.post(webhookPath, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Главная страница
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Получение профиля
app.get('/profile', async (req, res) => {
  const userId = req.query.userId;
  console.log(`Запрос профиля для userId: ${userId}`);
  try {
    const { rows } = await pool.query('SELECT balance, tokens FROM users WHERE id = $1', [userId]);
    console.log('Результат запроса:', rows);
    if (rows.length === 0) {
      await pool.query('INSERT INTO users (id, balance, tokens) VALUES ($1, 1000, $2)', [userId, '[]']);
      console.log(`Создан новый пользователь ${userId}`);
      res.json({ balance: 1000, tokens: [] });
    } else {
      res.json({ balance: rows[0].balance, tokens: JSON.parse(rows[0].tokens) });
    }
  } catch (err) {
    console.error('Ошибка в /profile:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Покупка токена
app.post('/buy', async (req, res) => {
  const userId = req.query.userId;
  const tokenType = req.query.token;
  console.log(`Покупка токена ${tokenType} для userId: ${userId}`);
  try {
    const { rows: tokenRows } = await pool.query('SELECT price, quantity FROM tokens WHERE type = $1', [tokenType]);
    if (tokenRows.length === 0) return res.status(400).json({ success: false, error: 'Токен не найден' });
    const token = tokenRows[0];
    if (token.quantity <= 0) return res.status(400).json({ success: false, error: 'Токен распродан' });

    const { rows: userRows } = await pool.query('SELECT balance, tokens FROM users WHERE id = $1', [userId]);
    if (userRows.length === 0) return res.status(400).json({ success: false, error: 'Пользователь не найден' });
    const user = userRows[0];
    const balance = user.balance;
    const tokens = JSON.parse(user.tokens);

    if (balance < token.price) return res.status(400).json({ success: false, error: 'Недостаточно монет' });
    const newBalance = balance - token.price;
    tokens.push(tokenType);

    await pool.query('UPDATE users SET balance = $1, tokens = $2 WHERE id = $3', [newBalance, JSON.stringify(tokens), userId]);
    if (token.quantity < 9999) {
      await pool.query('UPDATE tokens SET quantity = quantity - 1 WHERE type = $1', [tokenType]);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Ошибка в /buy:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Отправка токена
app.post('/send', async (req, res) => {
  const userId = req.query.userId;
  const tokenType = req.query.token;
  console.log(`Отправка токена ${tokenType} для userId: ${userId}`);
  try {
    const { rows } = await pool.query('SELECT tokens FROM users WHERE id = $1', [userId]);
    if (rows.length === 0) return res.status(400).json({ success: false, error: 'Пользователь не найден' });
    let tokens = JSON.parse(rows[0].tokens);
    if (!tokens.includes(tokenType)) return res.status(400).json({ success: false, error: 'Токен не найден' });

    tokens = tokens.filter(t => t !== tokenType);
    await pool.query('UPDATE users SET tokens = $1 WHERE id = $2', [JSON.stringify(tokens), userId]);
    bot.sendMessage(userId, `Токен отправлен! Используй: @YourBotName ${tokenType}`, {
      reply_markup: {
        inline_keyboard: [[{ text: "Получить токен", url: `${req.protocol}://${req.get('host')}/claim?token=${tokenType}` }]]
      }
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Ошибка в /send:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Получение токена
app.get('/claim', (req, res) => {
  const tokenType = req.query.token;
  res.send(`Токен ${tokenType} получен! Добавь логику в Mini App.`);
});

// Обработка сообщений бота через вебхук
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'Привет! Открой Mini App через меню.');
});

// Запуск сервера
app.listen(process.env.PORT || 3000, () => {
  console.log('Сервер запущен');
});