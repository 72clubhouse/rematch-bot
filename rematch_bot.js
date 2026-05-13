const axios = require('axios');
const http = require('http');

const BOT_TOKEN = process.env.REGISTER_BOT_TOKEN || '8704643171:AAG2nd5umGh6bl0S7cT6ekBz3q-FplJXCmg';
const NOTIFY_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '-4806445324';
const SHEET_URL = process.env.SHEET_URL || 'https://script.google.com/macros/s/AKfycbwHVv0q9LzVL2tmS6Ye56UnC_2XiGsRAxlzAJEhncTiuj3jDtT8jNQRDDfLUxl-zC_v/exec';

const API = 'https://api.telegram.org/bot' + BOT_TOKEN;

let offset = 0;
const state = {};

setInterval(function() {
  const now = Date.now();
  for (var userId in state) {
    if (state[userId] && state[userId].timestamp && now - state[userId].timestamp > 10 * 60 * 1000) {
      delete state[userId];
    }
  }
}, 10 * 60 * 1000);

const MSG = {
  welcome: '\u0e22\u0e34\u0e19\u0e14\u0e35\u0e15\u0e49\u0e2d\u0e19\u0e23\u0e31\u0e1a\u0e2a\u0e39\u0e48 72Clubhouse!\nWelcome to 72Clubhouse!\n\n\u0e01\u0e14\u0e1b\u0e38\u0e48\u0e21\u0e14\u0e49\u0e32\u0e19\u0e25\u0e48\u0e32\u0e07\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e25\u0e07\u0e17\u0e30\u0e40\u0e1a\u0e35\u0e22\u0e19\u0e44\u0e14\u0e49\u0e40\u0e25\u0e22\u0e04\u0e23\u0e31\u0e1a\nClick the button below to register:',
  btn_register: '\u0e25\u0e07\u0e17\u0e30\u0e40\u0e1a\u0e35\u0e22\u0e19 / Register Now',
  step1: '\u0e02\u0e31\u0e49\u0e19\u0e15\u0e2d\u0e19\u0e17\u0e35\u0e48 1/4 | Step 1/4\n\n\u0e01\u0e23\u0e38\u0e13\u0e32\u0e01\u0e23\u0e2d\u0e01 <b>\u0e0a\u0e37\u0e48\u0e2d-\u0e19\u0e32\u0e21\u0e2a\u0e01\u0e38\u0e25</b>\nPlease enter your <b>Full Name</b>:',
  step2: '\u0e02\u0e31\u0e49\u0e19\u0e15\u0e2d\u0e19\u0e17\u0e35\u0e48 2/4 | Step 2/4\n\n\u0e01\u0e23\u0e38\u0e13\u0e32\u0e01\u0e23\u0e2d\u0e01 <b>\u0e40\u0e1a\u0e2d\u0e23\u0e4c\u0e42\u0e17\u0e23\u0e28\u0e31\u0e1e\u0e17\u0e4c</b>\nPlease enter your <b>Phone Number</b>:',
  step3: '\u0e02\u0e31\u0e49\u0e19\u0e15\u0e2d\u0e19\u0e17\u0e35\u0e48 3/4 | Step 3/4\n\n\u0e01\u0e23\u0e38\u0e13\u0e32\u0e01\u0e23\u0e2d\u0e01 <b>\u0e0a\u0e37\u0e48\u0e2d\u0e18\u0e19\u0e32\u0e04\u0e32\u0e23 \u0e41\u0e25\u0e30\u0e40\u0e25\u0e02\u0e1a\u0e31\u0e0d\u0e0a\u0e35</b>\nPlease enter your <b>Bank Name and Account Number</b>:\n\u0e15\u0e31\u0e27\u0e2d\u0e22\u0e48\u0e32\u0e07 / Example: Kasikorn 123-4-56789-0',
  step4: '\u0e02\u0e31\u0e49\u0e19\u0e15\u0e2d\u0e19\u0e17\u0e35\u0e48 4/4 | Step 4/4\n\n\u0e01\u0e23\u0e38\u0e13\u0e32\u0e01\u0e23\u0e2d\u0e01 <b>Club GG ID</b> \u0e02\u0e2d\u0e07\u0e04\u0e38\u0e13\nPlease enter your <b>Club GG ID</b>:',
  rematch_step: '<b>\u0e02\u0e31\u0e49\u0e19\u0e15\u0e2d\u0e19\u0e2a\u0e38\u0e14\u0e17\u0e49\u0e32\u0e22! / Last Step!</b>\n\n\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e43\u0e2b\u0e49\u0e23\u0e30\u0e1a\u0e1a\u0e2a\u0e32\u0e21\u0e32\u0e23\u0e16\u0e15\u0e34\u0e14\u0e15\u0e48\u0e2d\u0e04\u0e38\u0e13\u0e44\u0e14\u0e49 \u0e01\u0e23\u0e38\u0e13\u0e32\u0e01\u0e14\u0e1b\u0e38\u0e48\u0e21\u0e14\u0e49\u0e32\u0e19\u0e25\u0e48\u0e32\u0e07\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e40\u0e1b\u0e34\u0e14\u0e43\u0e0a\u0e49\u0e07\u0e32\u0e19 Rematch Bot \u0e04\u0e23\u0e31\u0e1a\nTo allow our system to contact you, please click the button below to activate the Rematch Bot.',
  done: '\u2705 <b>\u0e25\u0e07\u0e17\u0e30\u0e40\u0e1a\u0e35\u0e22\u0e19\u0e2a\u0e33\u0e40\u0e23\u0e47\u0e08\u0e41\u0e25\u0e49\u0e27! / Registration Complete!</b>\n\n\u0e01\u0e23\u0e38\u0e13\u0e32\u0e41\u0e08\u0e49\u0e07\u0e41\u0e2d\u0e14\u0e21\u0e34\u0e19\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e22\u0e37\u0e19\u0e22\u0e31\u0e19\u0e01\u0e32\u0e23\u0e25\u0e07\u0e17\u0e30\u0e40\u0e1a\u0e35\u0e22\u0e19\u0e02\u0e2d\u0e07\u0e04\u0e38\u0e13\u0e04\u0e23\u0e31\u0e1a\nPlease contact admin to confirm your registration.\n\n\ud83d\udc64 @clubhouse72',
  btn_rematch: '\ud83c\udfae \u0e40\u0e1b\u0e34\u0e14\u0e43\u0e0a\u0e49\u0e07\u0e32\u0e19 Rematch Bot / Activate Rematch Bot',
  btn_activated: '\u2705 \u0e01\u0e14\u0e41\u0e25\u0e49\u0e27 / I have activated',
};

function formatClubGG(id) {
  var digits = id.replace(/[^0-9]/g, '');
  if (digits.length === 8) return digits.slice(0,4) + '-' + digits.slice(4);
  return id;
}

function formatPhone(phone) {
  var digits = phone.replace(/[^0-9]/g, '');
  if (digits.length === 10) return digits.slice(0,3) + '-' + digits.slice(3,6) + '-' + digits.slice(6);
  return phone;
}

function formatBankAccount(input) {
  var parts = input.trim().split(' ');
  var bankName = '';
  var digits = '';
  for (var i = 0; i < parts.length; i++) {
    var d = parts[i].replace(/[^0-9]/g, '');
    if (d.length > 3) { digits += d; }
    else if (parts[i].replace(/[^0-9]/g, '').length === 0) { bankName += (bankName ? ' ' : '') + parts[i]; }
    else { digits += d; }
  }
  var len = digits.length;
  var formatted = '';
  if (len === 10) { formatted = digits.slice(0,3)+'-'+digits.slice(3,4)+'-'+digits.slice(4,9)+'-'+digits.slice(9); }
  else if (len === 11) { formatted = digits.slice(0,3)+'-'+digits.slice(3,6)+'-'+digits.slice(6,10)+'-'+digits.slice(10); }
  else if (len === 12) { formatted = digits.slice(0,3)+'-'+digits.slice(3,10)+'-'+digits.slice(10); }
  else if (len === 15) { formatted = digits.slice(0,3)+'-'+digits.slice(3,8)+'-'+digits.slice(8,13)+'-'+digits.slice(13); }
  else { return input; }
  return bankName ? bankName + ' ' + formatted : formatted;
}

async function send(chatId, text, keyboard) {
  const payload = { chat_id: chatId, text: text, parse_mode: 'HTML' };
  if (keyboard) payload.reply_markup = { inline_keyboard: keyboard };
  try { await axios.post(API + '/sendMessage', payload); }
  catch(e) { console.error('Send error:', e.message); }
}

async function notifyAdmin(text) {
  try {
    await axios.post(API + '/sendMessage', { chat_id: NOTIFY_CHAT_ID, text: text, parse_mode: 'HTML' });
  } catch(e) { console.error('Notify error:', e.message); }
}

async function saveSheet(data) {
  try { await axios.post(SHEET_URL, data, { headers: { 'Content-Type': 'application/json' } }); }
  catch(e) { console.error('Sheet error:', e.message); }
}

async function handleUpdate(update) {
  if (update.message) {
    const chatId = update.message.chat.id;
    const userId = update.message.from.id;
    const text = update.message.text || '';
    if (update.message.chat.type !== 'private') return;

    if (state[userId]) {
      const s = state[userId];
      if (s.step === 'name') {
        s.name = text; s.step = 'phone';
        await send(chatId, MSG.step2, null);
      } else if (s.step === 'phone') {
        s.phone = text; s.step = 'bank';
        await send(chatId, MSG.step3, null);
      } else if (s.step === 'bank') {
        s.bank = text; s.step = 'clubgg';
        await send(chatId, MSG.step4, null);
      } else if (s.step === 'clubgg') {
        s.clubgg_id = text;
        s.phone = formatPhone(s.phone);
        s.bank = formatBankAccount(s.bank);
        s.clubgg_id = formatClubGG(s.clubgg_id);
        await saveSheet({
          name: s.name, phone: s.phone, bank: s.bank,
          clubgg_id: s.clubgg_id,
          telegram_id: '@' + (update.message.from.username || userId),
        });
        await notifyAdmin(
          '๐• <b>New Member!</b>\n\n' +
          '๐‘ค Name: ' + s.name + '\n' +
          '๐“ Phone: ' + s.phone + '\n' +
          '๐ฆ Bank: ' + s.bank + '\n' +
          '๐ฎ Club GG ID: ' + s.clubgg_id + '\n' +
          '๐“ฑ Telegram: @' + (update.message.from.username || userId)
        );
        s.step = 'rematch';
        await send(chatId, MSG.rematch_step, [
          [{ text: MSG.btn_rematch, url: 'https://t.me/clubhouse72_rematch_bot?start=register' }],
          [{ text: MSG.btn_activated, callback_data: 'rematch_done' }]
        ]);
      }
      return;
    }

    if (text === '/start') {
      delete state[userId];
      await send(chatId, MSG.welcome, [[{ text: MSG.btn_register, callback_data: 'register' }]]);
    }
  }

  if (update.callback_query) {
    const chatId = update.callback_query.message.chat.id;
    const userId = update.callback_query.from.id;
    const data = update.callback_query.data;
    await axios.post(API + '/answerCallbackQuery', { callback_query_id: update.callback_query.id }).catch(function(){});

    if (data === 'rematch_done') {
      if (state[userId]) delete state[userId];
      await send(chatId, MSG.done, null);
    } else if (data === 'register') {
      state[userId] = { step: 'name', timestamp: Date.now() };
      await send(chatId, MSG.step1, null);
    }
  }
}

async function poll() {
  try {
    const res = await axios.get(API + '/getUpdates', { params: { offset: offset, timeout: 30 }, timeout: 35000 });
    const updates = res.data.result || [];
    for (var i = 0; i < updates.length; i++) {
      offset = updates[i].update_id + 1;
      await handleUpdate(updates[i]);
    }
  } catch(e) { console.error('Poll error:', e.message); }
  setTimeout(poll, 1000);
}

const PORT = process.env.PORT || 3000;
http.createServer(function(req, res) {
  res.writeHead(200);
  res.end('Register Bot running');
}).listen(PORT, function() { console.log('Server on port ' + PORT); });

console.log('Register Bot starting...');
poll();
