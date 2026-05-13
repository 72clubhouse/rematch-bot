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

async function answerCallback(id) {
  await axios.post(`${API}/answerCallbackQuery`, { callback_query_id: id }).catch(() => {});
}

async function sendWelcome(chatId) {
  await sendMessage(chatId, 'Do you want a rematch? / เธเธธเธ“เธ•เนเธญเธเธเธฒเธฃเนเธเนเธกเธทเธญเนเธเนเนเธซเธก? โ”๏ธ', {
    reply_markup: {
      inline_keyboard: [[
        { text: 'Yes! / เนเธเน เธเธฑเธเธ•เนเธญเธเธเธฒเธฃเนเธเนเธกเธทเธญ!', callback_data: 'start_rematch' }
      ]]
    }
  });
}

async function processRematch(msg, targetId) {
  const chatId = msg.chat.id;
  const fromId = msg.from.id;
  const player = await findPlayer(targetId);

  if (!player) {
    await sendMessage(chatId,
      `ID *${targetId}* not found / เนเธกเนเธเธเนเธเธฃเธฐเธเธ\n\n` +
      `- Check spelling / เธ•เธฃเธงเธเธชเธญเธ ID เนเธซเนเธ–เธนเธเธ•เนเธญเธ\n` +
      `- May not be registered / เธญเธฒเธเธขเธฑเธเนเธกเนเนเธ”เนเธฅเธเธ—เธฐเน€เธเธตเธขเธ\n\n` +
      `Please type the ID again / เธฅเธญเธเธเธดเธกเธเนเนเธซเธกเนเนเธ”เนเน€เธฅเธขเธเธฃเธฑเธ`
    );
    waiting[fromId] = true;
    return;
  }

  if (player.telegramId === `@${msg.from.username}`) {
    await sendMessage(chatId, 'Cannot challenge yourself! / เธ—เนเธฒเธ•เธฑเธงเน€เธญเธเนเธกเนเนเธ”เนเธเธฐเธเธฃเธฑเธ! Try again / เธฅเธญเธเนเธซเธกเนเนเธ”เนเน€เธฅเธข');
    waiting[fromId] = true;
    return;
  }

  const key = targetId.toLowerCase();
  const expiresAt = Date.now() + REMATCH_TTL;

  const groupMsg = await sendMessage(GROUP_CHAT_ID,
    `Someone challenged *${player.clubGG}* to a rematch!\n` +
    `เธกเธตเธเธเธ—เนเธฒเนเธเนเธกเธทเธญ *${player.clubGG}* เนเธฅเนเธง!\n\n` +
    `Who is it? Nobody knows / เธเธฐเน€เธเนเธเนเธเธฃเธเธฑเนเธ เนเธกเนเธกเธตเนเธเธฃเธฃเธนเน ๐คซ\n` +
    `Stay tuned / เธฃเธญเธ”เธนเธเธฅเนเธ”เนเน€เธฅเธข ๐‘€`
  );

  if (!groupMsg) {
    await sendMessage(chatId, 'Cannot post in group / เธชเนเธเธเธฃเธฐเธเธฒเธจเนเธ group เนเธกเนเนเธ”เนเธเธฃเธฑเธ');
    return;
  }

  const keyboard = {
    inline_keyboard: [[
      { text: 'Accept / เธฃเธฑเธเธเธณเธ—เนเธฒ', callback_data: `accept|${fromId}|${player.clubGG}|${groupMsg.message_id}` },
      { text: 'Decline / เธเธเธดเน€เธชเธ', callback_data: `decline|${fromId}|${player.clubGG}|${groupMsg.message_id}` },
    ]]
  };

  const dmResult = await sendMessage(player.telegramId,
    `Someone wants a rematch! / เธกเธตเธเธเธเธญเนเธเนเธกเธทเธญเธเธธเธ“!\n` +
    `Club GG ID: *${player.clubGG}*\n\n` +
    `Accept or decline? / เธฃเธฑเธเธซเธฃเธทเธญเธเธเธดเน€เธชเธ? (expires in 24h / เธซเธกเธ”เธญเธฒเธขเธธเนเธ 24 เธเธก.)`,
    { reply_markup: keyboard }
  );

  if (!dmResult) {
    await deleteMessage(GROUP_CHAT_ID, groupMsg.message_id);
    await sendMessage(chatId,
      `Cannot DM *${player.clubGG}* / เธชเนเธเธเนเธญเธเธงเธฒเธกเนเธกเนเนเธ”เน\n` +
      `Ask them to start the Bot first / เนเธซเนเน€เธเธฒเธเธ” Start เธ—เธตเน Bot เธเนเธญเธเธเธฐเธเธฃเธฑเธ`
    );
    return;
  }

  pending[key] = { fromId, targetClubGG: player.clubGG, expiresAt, groupMsgId: groupMsg.message_id };
  await sendMessage(chatId,
    `Challenge sent to *${player.clubGG}*! / เธชเนเธเธเธณเธ—เนเธฒเนเธฅเนเธง!\n` +
    `Waiting... / เธฃเธญเธเธฒเธฃเธ•เธญเธเธฃเธฑเธ (24h / 24 เธเธก.)\n\n` +
    `Your identity is hidden / เนเธกเนเธกเธตเนเธเธฃเธฃเธนเนเธงเนเธฒเธเธธเธ“เธเธทเธญเธเธเธ—เนเธฒ ๐”’`
  );
}

function cleanupExpired() {
  const now = Date.now();
  for (const [key, entry] of Object.entries(pending)) {
    if (now > entry.expiresAt) {
      editMessage(GROUP_CHAT_ID, entry.groupMsgId,
        `Challenge expired / เธเธณเธ—เนเธฒ *${entry.targetClubGG}* เธซเธกเธ”เธญเธฒเธขเธธเนเธฅเนเธง โฐ`
      ).catch(() => {});
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
    await sendMessage(chatId,
      'Please enter the Club GG ID of the player you want to challenge\n' +
      'เธเธฃเธธเธ“เธฒเธเธฃเธญเธ ID Club GG เธเธญเธเธเธนเนเธ—เธตเนเธเธธเธ“เธ•เนเธญเธเธเธฒเธฃเธ—เนเธฒเนเธ”เนเน€เธฅเธขเธเธฃเธฑเธ'
    );
    return;
  }

  const [action, challengerId, targetClubGG, groupMsgId] = data.split('|');
  const key = targetClubGG.toLowerCase();
  const entry = pending[key];

  if (entry && Date.now() > entry.expiresAt) {
    delete pending[key];
    await editMessage(chatId, cb.message.message_id, 'Challenge expired / เธเธณเธ—เนเธฒเธเธตเนเธซเธกเธ”เธญเธฒเธขเธธเนเธฅเนเธง โฐ');
    return;
  }

  if (action === 'accept') {
    delete pending[key];
    await editMessage(GROUP_CHAT_ID, parseInt(groupMsgId),
      `*${targetClubGG}* accepted the challenge! / เธฃเธฑเธเธเธณเธ—เนเธฒเนเธฅเนเธง!\n\n` +
      `The match is on! / เธเธฒเธฃเนเธเนเธเธเธฑเธเธเธณเธฅเธฑเธเธเธฐเน€เธฃเธดเนเธก ๐”ฅ\n` +
      `Who will win? / เนเธเธฃเธเธฐเธเธเธฐ เธฃเธญเธ”เธนเธเธฑเธเน€เธฅเธข ๐‘€`
    );
    await editMessage(chatId, cb.message.message_id, 'Challenge accepted! / เธฃเธฑเธเธเธณเธ—เนเธฒเนเธฅเนเธง! ๐ฎ');
    await sendMessage(parseInt(challengerId),
      `*${targetClubGG}* accepted your challenge! / เธฃเธฑเธเธเธณเธ—เนเธฒเนเธฅเนเธง!\n\n` +
      `Contact them in Club GG / เธ•เธดเธ”เธ•เนเธญเธเธฑเธเนเธ Club GG เนเธ”เนเน€เธฅเธขเธเธฃเธฑเธ โ”๏ธ`
    );
  } else if (action === 'decline') {
    delete pending[key];
    await editMessage(GROUP_CHAT_ID, parseInt(groupMsgId),
      `*${targetClubGG}* declined the challenge / เธเธเธดเน€เธชเธเธเธณเธ—เนเธฒเธเธฃเธฑเนเธเธเธตเน\n\n` +
      `Maybe next time / เนเธงเนเธเธฃเธฒเธงเธซเธเนเธฒเธเธฐ ๐‘`
    );
    await editMessage(chatId, cb.message.message_id, 'Challenge declined / เธเธเธดเน€เธชเธเธเธณเธ—เนเธฒเนเธฅเนเธง โ');
    await sendMessage(parseInt(challengerId),
      `*${targetClubGG}* declined your challenge / เธเธเธดเน€เธชเธเธเธณเธ—เนเธฒเธเธฃเธฑเนเธเธเธตเน ๐”`
    );
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
  console.log('RematchBot started!');
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
