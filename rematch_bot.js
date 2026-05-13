const axios = require('axios');
const http = require('http');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

const BOT_TOKEN = process.env.BOT_TOKEN;
const GROUP_CHAT_ID = process.env.GROUP_CHAT_ID;
const SHEET_ID = process.env.SHEET_ID;
const GOOGLE_CREDS = JSON.parse(process.env.GOOGLE_CREDS);
const RENDER_URL = process.env.RENDER_URL;
const REMATCH_TTL = 24 * 60 * 60 * 1000;

const API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const pending = {};
const waiting = {};

async function findPlayer(clubGGId) {
  try {
    const auth = new JWT({
      email: GOOGLE_CREDS.client_email,
      key: GOOGLE_CREDS.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const doc = new GoogleSpreadsheet(SHEET_ID, auth);
    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0];
    const rows = await sheet.getRows();
    const target = clubGGId.trim().toLowerCase();
    for (const row of rows) {
      const clubGG = (row.get('ID Club GG') || '').trim().toLowerCase();
      const telegramId = (row.get('Telegram ID') || '').trim();
      if (clubGG === target && telegramId) {
        return { clubGG: row.get('ID Club GG').trim(), telegramId };
      }
    }
  } catch (e) {
    console.error('Sheet error:', e.message);
  }
  return null;
}

async function sendMessage(chatId, text, extra = {}) {
  try {
    const res = await axios.post(`${API}/sendMessage`, {
      chat_id: chatId, text, parse_mode: 'Markdown', ...extra,
    });
    return res.data.result;
  } catch (e) {
    console.error('sendMessage error:', e.response?.data || e.message);
    return null;
  }
}

async function editMessage(chatId, messageId, text) {
  try {
    await axios.post(`${API}/editMessageText`, {
      chat_id: chatId, message_id: messageId, text, parse_mode: 'Markdown',
    });
  } catch (e) {
    console.error('editMessage error:', e.response?.data || e.message);
  }
}

async function deleteMessage(chatId, messageId) {
  try {
    await axios.post(`${API}/deleteMessage`, { chat_id: chatId, message_id: messageId });
  } catch (e) {}
}

async function answerCallback(callbackQueryId) {
  await axios.post(`${API}/answerCallbackQuery`, { callback_query_id: callbackQueryId }).catch(() => {});
}

async function sendWelcome(chatId) {
  const keyboard = {
    inline_keyboard: [[
      { text: 'โ”๏ธ เนเธเน เธเธฑเธเธ•เนเธญเธเธเธฒเธฃเนเธเนเธกเธทเธญ!', callback_data: 'start_rematch' }
    ]]
  };
  await sendMessage(chatId, '๐ฎ เธเธธเธ“เธ•เนเธญเธเธเธฒเธฃเนเธเนเธกเธทเธญเนเธเนเนเธซเธก?', { reply_markup: keyboard });
}

async function processRematch(msg, targetId) {
  const chatId = msg.chat.id;
  const fromId = msg.from.id;
  const player = await findPlayer(targetId);

  if (!player) {
    await sendMessage(chatId,
      `โ เนเธกเนเธเธ ID *${targetId}* เนเธเธฃเธฐเธเธ\n\n` +
      `โ€ข เธ•เธฃเธงเธเธชเธญเธ ID เนเธซเนเธ–เธนเธเธ•เนเธญเธ\n` +
      `โ€ข เธเธนเนเน€เธฅเนเธเธญเธฒเธเธขเธฑเธเนเธกเนเนเธ”เนเธฅเธเธ—เธฐเน€เธเธตเธขเธ\n\n` +
      `เธฅเธญเธเธเธดเธกเธเน ID เนเธซเธกเนเนเธ”เนเน€เธฅเธขเธเธฃเธฑเธ`
    );
    waiting[fromId] = true;
    return;
  }

  if (player.telegramId === `@${msg.from.username}`) {
    await sendMessage(chatId, '๐… เธ—เนเธฒเธ•เธฑเธงเน€เธญเธเนเธกเนเนเธ”เนเธเธฐเธเธฃเธฑเธ! เธฅเธญเธเนเธซเธกเนเนเธ”เนเน€เธฅเธข');
    waiting[fromId] = true;
    return;
  }

  const key = targetId.toLowerCase();
  const expiresAt = Date.now() + REMATCH_TTL;

  const groupMsg = await sendMessage(GROUP_CHAT_ID,
    `โ”๏ธ เธกเธตเธเธเธ—เนเธฒเนเธเนเธกเธทเธญ *${player.clubGG}*!\n\nเธเธฐเน€เธเนเธเนเธเธฃเธเธฑเนเธ... เนเธกเนเธกเธตเนเธเธฃเธฃเธนเน ๐คซ\nเธฃเธญเธ”เธนเธเธฅเนเธ”เนเน€เธฅเธข ๐‘€`
  );

  if (!groupMsg) {
    await sendMessage(chatId, 'โ ๏ธ เธชเนเธเธเธฃเธฐเธเธฒเธจเนเธ group เนเธกเนเนเธ”เน เธเธฃเธธเธ“เธฒเธ•เธฃเธงเธเธชเธญเธ Bot เนเธ group');
    return;
  }

  const keyboard = {
    inline_keyboard: [[
      { text: 'โ… เธฃเธฑเธเธเธณเธ—เนเธฒ', callback_data: `accept|${fromId}|${player.clubGG}|${groupMsg.message_id}` },
      { text: 'โ เธเธเธดเน€เธชเธ', callback_data: `decline|${fromId}|${player.clubGG}|${groupMsg.message_id}` },
    ]],
  };

  const dmResult = await sendMessage(player.telegramId,
    `โ”๏ธ เธกเธตเธเธเธเธญเนเธเนเธกเธทเธญเธเธธเธ“!\nID Club GG: *${player.clubGG}*\n\nเธฃเธฑเธเธซเธฃเธทเธญเธเธเธดเน€เธชเธ? (เธซเธกเธ”เธญเธฒเธขเธธเนเธ 24 เธเธก.)`,
    { reply_markup: keyboard }
  );

  if (!dmResult) {
    await deleteMessage(GROUP_CHAT_ID, groupMsg.message_id);
    await sendMessage(chatId,
      `โ ๏ธ เธชเนเธเธเนเธญเธเธงเธฒเธกเธซเธฒ *${player.clubGG}* เนเธกเนเนเธ”เน\n` +
      `เนเธซเนเน€เธเธฒ DM Bot เนเธฅเนเธงเธเธ” Start เธเนเธญเธเธเธฐเธเธฃเธฑเธ`
    );
    return;
  }

  pending[key] = { fromId, targetClubGG: player.clubGG, expiresAt, groupMsgId: groupMsg.message_id };
  await sendMessage(chatId,
    `โ… เธชเนเธเธเธณเธ—เนเธฒเธ–เธถเธ *${player.clubGG}* เนเธฅเนเธง!\n` +
    `เธฃเธญเธเธฒเธฃเธ•เธญเธเธฃเธฑเธ... (เธซเธกเธ”เธญเธฒเธขเธธเนเธ 24 เธเธก.)\n\n` +
    `๐”’ เนเธกเนเธกเธตเนเธเธฃเธฃเธนเนเธงเนเธฒเธเธธเธ“เธเธทเธญเธเธเธ—เนเธฒ`
  );
}

function cleanupExpired() {
  const now = Date.now();
  for (const [key, entry] of Object.entries(pending)) {
    if (now > entry.expiresAt) {
      editMessage(GROUP_CHAT_ID, entry.groupMsgId, `โฐ เธเธณเธ—เนเธฒ *${entry.targetClubGG}* เธซเธกเธ”เธญเธฒเธขเธธเนเธฅเนเธง`).catch(() => {});
      delete pending[key];
    }
  }
}
setInterval(cleanupExpired, 30 * 60 * 1000);

async function handleCallback(cb) {
  await answerCallback(cb.id);
  const data = cb.data;
  const chatId = cb.message.chat.id;
  const fromId = cb.from.id;

  if (data === 'start_rematch') {
    await axios.post(`${API}/editMessageReplyMarkup`, {
      chat_id: chatId,
      message_id: cb.message.message_id,
      reply_markup: { inline_keyboard: [] }
    }).catch(() => {});
    waiting[fromId] = true;
    await sendMessage(chatId, '๐“ เธเธฃเธธเธ“เธฒเธเธฃเธญเธ *ID Club GG* เธเธญเธเธเธนเนเธ—เธตเนเธเธธเธ“เธ•เนเธญเธเธเธฒเธฃเธ—เนเธฒเนเธ”เนเน€เธฅเธขเธเธฃเธฑเธ');
    return;
  }

  const [action, challengerId, targetClubGG, groupMsgId] = data.split('|');
  const key = targetClubGG.toLowerCase();
  const entry = pending[key];

  if (entry && Date.now() > entry.expiresAt) {
    delete pending[key];
    await editMessage(chatId, cb.message.message_id, 'โฐ เธเธณเธ—เนเธฒเธเธตเนเธซเธกเธ”เธญเธฒเธขเธธเนเธฅเนเธง');
    return;
  }

  if (action === 'accept') {
    delete pending[key];
    await editMessage(GROUP_CHAT_ID, parseInt(groupMsgId),
      `โ”๏ธ *${targetClubGG}* เธฃเธฑเธเธเธณเธ—เนเธฒเนเธฅเนเธง!\n\nเธเธฒเธฃเนเธเนเธเธเธฑเธเธเธณเธฅเธฑเธเธเธฐเน€เธฃเธดเนเธก... ๐”ฅ\nเนเธเธฃเธเธฐเธเธเธฐ เธฃเธญเธ”เธนเธเธฑเธเน€เธฅเธข ๐‘€`
    );
    await editMessage(chatId, cb.message.message_id, 'โ… เธฃเธฑเธเธเธณเธ—เนเธฒเนเธฅเนเธง! ๐ฎ');
    await sendMessage(parseInt(challengerId),
      `๐ *${targetClubGG}* เธฃเธฑเธเธเธณเธ—เนเธฒเนเธฅเนเธง!\n\nเธ•เธดเธ”เธ•เนเธญเธเธฑเธเนเธ Club GG เนเธ”เนเน€เธฅเธขเธเธฃเธฑเธ โ”๏ธ`
    );
  } else if (action === 'decline') {
    delete pending[key];
    await editMessage(GROUP_CHAT_ID, parseInt(groupMsgId),
      `๐ซ *${targetClubGG}* เธเธเธดเน€เธชเธเธเธณเธ—เนเธฒเธเธฃเธฑเนเธเธเธตเน\n\nเนเธงเนเธเธฃเธฒเธงเธซเธเนเธฒเธเธฐ ๐‘`
    );
    await editMessage(chatId, cb.message.message_id, 'โ เธเธเธดเน€เธชเธเธเธณเธ—เนเธฒเนเธฅเนเธง');
    await sendMessage(parseInt(challengerId), `๐” *${targetClubGG}* เธเธเธดเน€เธชเธเธเธณเธ—เนเธฒเธเธฃเธฑเนเธเธเธตเน`);
  }
}

async function processUpdate(update) {
  try {
    if (update.callback_query) {
      await handleCallback(update.callback_query);
      return;
    }

    const msg = update.message;
    if (!msg || !msg.text) return;
    if (msg.chat.type !== 'private') return;

    const chatId = msg.chat.id;
    const fromId = msg.from.id;
    const text = msg.text.trim();

    if (waiting[fromId] && !text.startsWith('/')) {
      delete waiting[fromId];
      await processRematch(msg, text);
      return;
    }

    if (text === '/start' || text === '/help') {
      await sendWelcome(chatId);
    }

  } catch (e) {
    console.error('processUpdate error:', e.message);
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === `/webhook/${BOT_TOKEN}`) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const update = JSON.parse(body);
        await processUpdate(update);
      } catch (e) {
        console.error('Webhook parse error:', e.message);
      }
      res.writeHead(200);
      res.end('OK');
    });
  } else {
    res.writeHead(200);
    res.end('RematchBot running');
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  try {
    await axios.post(`${API}/setWebhook`, {
      url: `${RENDER_URL}/webhook/${BOT_TOKEN}`,
      drop_pending_updates: true,
    });
    console.log('Webhook set successfully!');
  } catch (e) {
    console.error('Webhook setup error:', e.message);
  }
});
