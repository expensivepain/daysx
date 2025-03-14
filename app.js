require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { Pool } = require('pg');
const path = require('path');
const app = express();

const token = process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE';
const bot = new TelegramBot(token, { polling: true }); // Polling для тестирования

// Подключение к Supabase через Transaction pooler
const pool = new Pool({
  connectionString: 'postgresql://postgres.yspttofpgvxzypjgqbzj:snkljhavldsimspihu32123132@aws-0-eu-west-1.pooler.supabase.com:6543/postgres',
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

// Запуск сервера
app.listen(process.env.PORT || 3000, () => {
  console.log('Сервер запущен');
});

// Обработка сообщений бота
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'Привет! Открой Mini App через меню.');
});