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
  await sendMessage(chatId, 'Do you want a rematch? / \u0e04\u0e38\u0e13\u0e15\u0e49\u0e2d\u0e07\u0e01\u0e32\u0e23\u0e41\u0e01\u0e49\u0e21\u0e37\u0e2d\u0e43\u0e0a\u0e48\u0e44\u0e2b\u0e21? \u2694\uFE0F', {
    reply_markup: {
      inline_keyboard: [[
        { text: 'Yes! / \u0e43\u0e0a\u0e48 \u0e09\u0e31\u0e19\u0e15\u0e49\u0e2d\u0e07\u0e01\u0e32\u0e23\u0e41\u0e01\u0e49\u0e21\u0e37\u0e2d!', callback_data: 'start_rematch' }
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
      `ID *${targetId}* not found / \u0e44\u0e21\u0e48\u0e1e\u0e1a\u0e43\u0e19\u0e23\u0e30\u0e1a\u0e1a\n\n` +
      `- Check spelling / \u0e15\u0e23\u0e27\u0e08\u0e2a\u0e2d\u0e1a ID \u0e43\u0e2b\u0e49\u0e16\u0e39\u0e01\u0e15\u0e49\u0e2d\u0e07\n` +
      `- May not be registered / \u0e2d\u0e32\u0e08\u0e22\u0e31\u0e07\u0e44\u0e21\u0e48\u0e44\u0e14\u0e49\u0e25\u0e07\u0e17\u0e30\u0e40\u0e1a\u0e35\u0e22\u0e19\n\n` +
      `Please type the ID again / \u0e25\u0e2d\u0e07\u0e1e\u0e34\u0e21\u0e1e\u0e4c\u0e43\u0e2b\u0e21\u0e48\u0e44\u0e14\u0e49\u0e40\u0e25\u0e22\u0e04\u0e23\u0e31\u0e1a`
    );
    waiting[fromId] = true;
    return;
  }

  if (player.telegramId === `@${msg.from.username}`) {
    await sendMessage(chatId, 'Cannot challenge yourself! / \u0e17\u0e49\u0e32\u0e15\u0e31\u0e27\u0e40\u0e2d\u0e07\u0e44\u0e21\u0e48\u0e44\u0e14\u0e49\u0e19\u0e30\u0e04\u0e23\u0e31\u0e1a! Try again / \u0e25\u0e2d\u0e07\u0e43\u0e2b\u0e21\u0e48\u0e44\u0e14\u0e49\u0e40\u0e25\u0e22');
    waiting[fromId] = true;
    return;
  }

  const key = targetId.toLowerCase();
  const expiresAt = Date.now() + REMATCH_TTL;

  const groupMsg = await sendMessage(GROUP_CHAT_ID,
    `Someone challenged *${player.clubGG}* to a rematch!\n` +
    `\u0e21\u0e35\u0e04\u0e19\u0e17\u0e49\u0e32\u0e41\u0e01\u0e49\u0e21\u0e37\u0e2d *${player.clubGG}* \u0e41\u0e25\u0e49\u0e27!\n\n` +
    `Who is it? Nobody knows / \u0e08\u0e30\u0e40\u0e1b\u0e47\u0e19\u0e43\u0e04\u0e23\u0e19\u0e31\u0e49\u0e19 \u0e44\u0e21\u0e48\u0e21\u0e35\u0e43\u0e04\u0e23\u0e23\u0e39\u0e49 \uD83E\uDD2B\n` +
    `Stay tuned / \u0e23\u0e2d\u0e14\u0e39\u0e1c\u0e25\u0e44\u0e14\u0e49\u0e40\u0e25\u0e22 \uD83D\uDC40`
  );

  if (!groupMsg) {
    await sendMessage(chatId, 'Cannot post in group / \u0e2a\u0e48\u0e07\u0e1b\u0e23\u0e30\u0e01\u0e32\u0e28\u0e43\u0e19 group \u0e44\u0e21\u0e48\u0e44\u0e14\u0e49\u0e04\u0e23\u0e31\u0e1a');
    return;
  }

  const keyboard = {
    inline_keyboard: [[
      { text: 'Accept / \u0e23\u0e31\u0e1a\u0e04\u0e33\u0e17\u0e49\u0e32', callback_data: `accept|${fromId}|${player.clubGG}|${groupMsg.message_id}` },
      { text: 'Decline / \u0e1b\u0e0f\u0e34\u0e40\u0e2a\u0e18', callback_data: `decline|${fromId}|${player.clubGG}|${groupMsg.message_id}` },
    ]]
  };

  const dmResult = await sendMessage(player.telegramId,
    `Someone wants a rematch! / \u0e21\u0e35\u0e04\u0e19\u0e02\u0e2d\u0e41\u0e01\u0e49\u0e21\u0e37\u0e2d\u0e04\u0e38\u0e13!\n` +
    `Club GG ID: *${player.clubGG}*\n\n` +
    `Accept or decline? / \u0e23\u0e31\u0e1a\u0e2b\u0e23\u0e37\u0e2d\u0e1b\u0e0f\u0e34\u0e40\u0e2a\u0e18? (expires in 24h / \u0e2b\u0e21\u0e14\u0e2d\u0e32\u0e22\u0e38\u0e43\u0e19 24 \u0e0a\u0e21.)`,
    { reply_markup: keyboard }
  );

  if (!dmResult) {
    await deleteMessage(GROUP_CHAT_ID, groupMsg.message_id);
    await sendMessage(chatId,
      `Cannot DM *${player.clubGG}* / \u0e2a\u0e48\u0e07\u0e02\u0e49\u0e2d\u0e04\u0e27\u0e32\u0e21\u0e44\u0e21\u0e48\u0e44\u0e14\u0e49\n` +
      `Ask them to start the Bot first / \u0e43\u0e2b\u0e49\u0e40\u0e02\u0e32\u0e01\u0e14 Start \u0e17\u0e35\u0e48 Bot \u0e01\u0e48\u0e2d\u0e19\u0e19\u0e30\u0e04\u0e23\u0e31\u0e1a`
    );
    return;
  }

  pending[key] = { fromId, targetClubGG: player.clubGG, expiresAt, groupMsgId: groupMsg.message_id };
  await sendMessage(chatId,
    `Challenge sent to *${player.clubGG}*! / \u0e2a\u0e48\u0e07\u0e04\u0e33\u0e17\u0e49\u0e32\u0e41\u0e25\u0e49\u0e27!\n` +
    `Waiting... / \u0e23\u0e2d\u0e01\u0e32\u0e23\u0e15\u0e2d\u0e1a\u0e23\u0e31\u0e1a (24h / 24 \u0e0a\u0e21.)\n\n` +
    `Your identity is hidden / \u0e44\u0e21\u0e48\u0e21\u0e35\u0e43\u0e04\u0e23\u0e23\u0e39\u0e49\u0e27\u0e48\u0e32\u0e04\u0e38\u0e13\u0e04\u0e37\u0e2d\u0e04\u0e19\u0e17\u0e49\u0e32 \uD83D\uDD12`
  );
}

function cleanupExpired() {
  const now = Date.now();
  for (const [key, entry] of Object.entries(pending)) {
    if (now > entry.expiresAt) {
      editMessage(GROUP_CHAT_ID, entry.groupMsgId,
        `Challenge expired / \u0e04\u0e33\u0e17\u0e49\u0e32 *${entry.targetClubGG}* \u0e2b\u0e21\u0e14\u0e2d\u0e32\u0e22\u0e38\u0e41\u0e25\u0e49\u0e27 \u23F0`
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
      '\u0e01\u0e23\u0e38\u0e13\u0e32\u0e01\u0e23\u0e2d\u0e01 ID Club GG \u0e02\u0e2d\u0e07\u0e1c\u0e39\u0e49\u0e17\u0e35\u0e48\u0e04\u0e38\u0e13\u0e15\u0e49\u0e2d\u0e07\u0e01\u0e32\u0e23\u0e17\u0e49\u0e32\u0e44\u0e14\u0e49\u0e40\u0e25\u0e22\u0e04\u0e23\u0e31\u0e1a'
    );
    return;
  }

  const [action, challengerId, targetClubGG, groupMsgId] = data.split('|');
  const key = targetClubGG.toLowerCase();
  const entry = pending[key];

  if (entry && Date.now() > entry.expiresAt) {
    delete pending[key];
    await editMessage(chatId, cb.message.message_id, 'Challenge expired / \u0e04\u0e33\u0e17\u0e49\u0e32\u0e19\u0e35\u0e49\u0e2b\u0e21\u0e14\u0e2d\u0e32\u0e22\u0e38\u0e41\u0e25\u0e49\u0e27 \u23F0');
    return;
  }

  if (action === 'accept') {
    delete pending[key];
    await editMessage(GROUP_CHAT_ID, parseInt(groupMsgId),
      `*${targetClubGG}* accepted the challenge! / \u0e23\u0e31\u0e1a\u0e04\u0e33\u0e17\u0e49\u0e32\u0e41\u0e25\u0e49\u0e27!\n\n` +
      `The match is on! / \u0e01\u0e32\u0e23\u0e41\u0e02\u0e48\u0e07\u0e02\u0e31\u0e19\u0e01\u0e33\u0e25\u0e31\u0e07\u0e08\u0e30\u0e40\u0e23\u0e34\u0e48\u0e21 \uD83D\uDD25\n` +
      `Who will win? / \u0e43\u0e04\u0e23\u0e08\u0e30\u0e0a\u0e19\u0e30 \u0e23\u0e2d\u0e14\u0e39\u0e01\u0e31\u0e19\u0e40\u0e25\u0e22 \uD83D\uDC40`
    );
    await editMessage(chatId, cb.message.message_id, 'Challenge accepted! / \u0e23\u0e31\u0e1a\u0e04\u0e33\u0e17\u0e49\u0e32\u0e41\u0e25\u0e49\u0e27! \uD83C\uDFAE');
    await sendMessage(parseInt(challengerId),
      `*${targetClubGG}* accepted your challenge! / \u0e23\u0e31\u0e1a\u0e04\u0e33\u0e17\u0e49\u0e32\u0e41\u0e25\u0e49\u0e27!\n\n` +
      `Contact them in Club GG / \u0e15\u0e34\u0e14\u0e15\u0e48\u0e2d\u0e01\u0e31\u0e19\u0e43\u0e19 Club GG \u0e44\u0e14\u0e49\u0e40\u0e25\u0e22\u0e04\u0e23\u0e31\u0e1a \u2694\uFE0F`
    );
  } else if (action === 'decline') {
    delete pending[key];
    await editMessage(GROUP_CHAT_ID, parseInt(groupMsgId),
      `*${targetClubGG}* declined the challenge / \u0e1b\u0e0f\u0e34\u0e40\u0e2a\u0e18\u0e04\u0e33\u0e17\u0e49\u0e32\u0e04\u0e23\u0e31\u0e49\u0e07\u0e19\u0e35\u0e49\n\n` +
      `Maybe next time / \u0e44\u0e27\u0e49\u0e04\u0e23\u0e32\u0e27\u0e2b\u0e19\u0e49\u0e32\u0e19\u0e30 \uD83D\uDC4B`
    );
    await editMessage(chatId, cb.message.message_id, 'Challenge declined / \u0e1b\u0e0f\u0e34\u0e40\u0e2a\u0e18\u0e04\u0e33\u0e17\u0e49\u0e32\u0e41\u0e25\u0e49\u0e27 \u274C');
    await sendMessage(parseInt(challengerId),
      `*${targetClubGG}* declined your challenge / \u0e1b\u0e0f\u0e34\u0e40\u0e2a\u0e18\u0e04\u0e33\u0e17\u0e49\u0e32\u0e04\u0e23\u0e31\u0e49\u0e07\u0e19\u0e35\u0e49 \uD83D\uDE14`
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
