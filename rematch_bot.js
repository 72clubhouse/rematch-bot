const axios = require('axios');
const http = require('http');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

const BOT_TOKEN = process.env.BOT_TOKEN;
const GROUP_CHAT_ID = process.env.GROUP_CHAT_ID;
const SHEET_ID = process.env.SHEET_ID;
const GOOGLE_CREDS = JSON.parse(process.env.GOOGLE_CREDS);
const RENDER_URL = process.env.RENDER_URL; // https://rematch-bot-scgu.onrender.com
const REMATCH_TTL = 24 * 60 * 60 * 1000;

const API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const pending = {};

async function findPlayer(clubGGName) {
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
    const target = clubGGName.trim().toLowerCase();
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

async function handleRematch(msg, args) {
  const chatId = msg.chat.id;
  const fromId = msg.from.id;

  if (msg.chat.type !== 'private') {
    await sendMessage(chatId, '๐”’ Please send this command in DM with the Bot');
    return;
  }
  if (!args.length) {
    await sendMessage(chatId, 'โ Usage: /rematch <Club GG ID>\nExample: /rematch Panupong');
    return;
  }

  const targetName = args.join(' ').trim();
  const player = await findPlayer(targetName);

  if (!player) {
    await sendMessage(chatId,
      `โ Player *${targetName}* not found\n\n` +
      `โ€ข Check spelling\n` +
      `โ€ข Player may not be registered yet`
    );
    return;
  }

  if (player.telegramId === `@${msg.from.username}`) {
    await sendMessage(chatId, '๐… You cannot challenge yourself!');
    return;
  }

  const key = targetName.toLowerCase();
  const expiresAt = Date.now() + REMATCH_TTL;

  const groupMsg = await sendMessage(GROUP_CHAT_ID,
    `โ”๏ธ Someone challenged *${player.clubGG}*!\n\nWho is it? Nobody knows ๐คซ\nStay tuned ๐‘€`
  );

  if (!groupMsg) {
    await sendMessage(chatId, 'โ ๏ธ Cannot post in group. Make sure Bot is in the group.');
    return;
  }

  const keyboard = {
    inline_keyboard: [[
      { text: 'โ… Accept', callback_data: `accept|${fromId}|${player.clubGG}|${groupMsg.message_id}` },
      { text: 'โ Decline', callback_data: `decline|${fromId}|${player.clubGG}|${groupMsg.message_id}` },
    ]],
  };

  const dmResult = await sendMessage(player.telegramId,
    `โ”๏ธ Someone wants a rematch!\nClub GG: *${player.clubGG}*\n\nAccept or decline? (expires in 24h)`,
    { reply_markup: keyboard }
  );

  if (!dmResult) {
    await deleteMessage(GROUP_CHAT_ID, groupMsg.message_id);
    await sendMessage(chatId, `โ ๏ธ Cannot DM *${player.clubGG}*\nAsk them to /start the Bot first.`);
    return;
  }

  pending[key] = { fromId, targetClubGG: player.clubGG, expiresAt, groupMsgId: groupMsg.message_id };
  await sendMessage(chatId,
    `โ… Challenge sent to *${player.clubGG}*!\nWaiting... (24h)\n\n๐”’ Your identity is hidden`
  );
}

async function handleCancel(msg, args) {
  if (msg.chat.type !== 'private') return;
  if (!args.length) { await sendMessage(msg.chat.id, 'โ Usage: /cancel <Club GG ID>'); return; }
  const key = args.join(' ').toLowerCase();
  const entry = pending[key];
  if (!entry) { await sendMessage(msg.chat.id, 'โ No pending challenge found'); return; }
  if (entry.fromId !== msg.from.id) { await sendMessage(msg.chat.id, 'โ This is not your challenge'); return; }
  await deleteMessage(GROUP_CHAT_ID, entry.groupMsgId);
  delete pending[key];
  await sendMessage(msg.chat.id, 'โ… Challenge cancelled');
}

async function handlePending(msg) {
  if (msg.chat.type !== 'private') return;
  cleanupExpired();
  const mine = Object.values(pending).filter(e => e.fromId === msg.from.id);
  if (!mine.length) { await sendMessage(msg.chat.id, '๐“ญ No pending challenges'); return; }
  const lines = ['๐“ *Your pending challenges:*\n'];
  for (const e of mine) {
    const hrs = Math.floor((e.expiresAt - Date.now()) / 3600000);
    const mins = Math.floor(((e.expiresAt - Date.now()) % 3600000) / 60000);
    lines.push(`โ€ข *${e.targetClubGG}* โ€” ${hrs}h ${mins}m left`);
  }
  await sendMessage(msg.chat.id, lines.join('\n'));
}

async function handleHelp(msg) {
  if (msg.chat.type !== 'private') {
    await sendMessage(msg.chat.id, '๐“ฉ Please use this command in DM with the Bot');
    return;
  }
  await sendMessage(msg.chat.id,
    '๐ฎ *RematchBot Commands*\n\n' +
    '/rematch <Club GG ID> โ€” Challenge a player\n' +
    '/cancel <Club GG ID>  โ€” Cancel your challenge\n' +
    '/pending              โ€” View your pending challenges\n\n' +
    '๐”’ Your identity is always hidden'
  );
}

async function handleCallback(cb) {
  await answerCallback(cb.id);
  const [action, fromId, targetClubGG, groupMsgId] = cb.data.split('|');
  const key = targetClubGG.toLowerCase();
  const entry = pending[key];

  if (entry && Date.now() > entry.expiresAt) {
    delete pending[key];
    await editMessage(cb.message.chat.id, cb.message.message_id, 'โฐ This challenge has expired');
    return;
  }

  if (action === 'accept') {
    delete pending[key];
    await editMessage(GROUP_CHAT_ID, parseInt(groupMsgId),
      `โ”๏ธ *${targetClubGG}* accepted the challenge!\n\nThe match is on! ๐”ฅ\nWho will win? ๐‘€`
    );
    await editMessage(cb.message.chat.id, cb.message.message_id, 'โ… Challenge accepted! ๐ฎ');
    await sendMessage(parseInt(fromId), `๐ *${targetClubGG}* accepted!\n\nContact them in Club GG โ”๏ธ`);
  } else if (action === 'decline') {
    delete pending[key];
    await editMessage(GROUP_CHAT_ID, parseInt(groupMsgId),
      `๐ซ *${targetClubGG}* declined the challenge\n\nMaybe next time ๐‘`
    );
    await editMessage(cb.message.chat.id, cb.message.message_id, 'โ Challenge declined');
    await sendMessage(parseInt(fromId), `๐” *${targetClubGG}* declined this time`);
  }
}

function cleanupExpired() {
  const now = Date.now();
  for (const [key, entry] of Object.entries(pending)) {
    if (now > entry.expiresAt) {
      editMessage(GROUP_CHAT_ID, entry.groupMsgId, `โฐ Challenge for *${entry.targetClubGG}* expired`).catch(() => {});
      delete pending[key];
    }
  }
}
setInterval(cleanupExpired, 30 * 60 * 1000);

async function processUpdate(update) {
  try {
    if (update.callback_query) { await handleCallback(update.callback_query); return; }
    const msg = update.message;
    if (!msg || !msg.text) return;
    const [cmd, ...args] = msg.text.trim().split(/\s+/);
    if (cmd === '/start' || cmd === '/help') await handleHelp(msg);
    else if (cmd === '/rematch') await handleRematch(msg, args);
    else if (cmd === '/cancel') await handleCancel(msg, args);
    else if (cmd === '/pending') await handlePending(msg);
  } catch (e) {
    console.error('processUpdate error:', e.message);
  }
}

// Webhook server
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
  // Set webhook
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
