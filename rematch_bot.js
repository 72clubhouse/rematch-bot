/**
 * RematchBot — ระบบแก้มือแบบไม่เปิดเผยตัวผู้ท้า
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * Google Sheet: "72Clubhouse Members" / ชีต1
 *   คอลัมน์ E = ID Club GG
 *   คอลัมน์ G = Telegram ID (@username)
 *
 * ติดตั้ง: npm install axios google-spreadsheet http
 */

const axios           = require('axios');
const http            = require('http');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT }         = require('google-auth-library');

// ════════════════════════════════════════════
//  CONFIG — ใช้ Environment Variables บน Render
// ════════════════════════════════════════════
const BOT_TOKEN     = process.env.BOT_TOKEN;
const GROUP_CHAT_ID = process.env.GROUP_CHAT_ID;        // เลขติดลบ เช่น -1001234567890
const SHEET_ID      = process.env.SHEET_ID;             // ID ใน URL ของ Google Sheet
const GOOGLE_CREDS  = JSON.parse(process.env.GOOGLE_CREDS); // credentials.json แบบ JSON string
const REMATCH_TTL   = 24 * 60 * 60 * 1000;             // 24 ชั่วโมง (ms)

const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// pending rematches
// key = club_gg_id (lowercase)
// value = { fromId, fromClubGG, targetClubGG, expiresAt, groupMsgId }
const pending = {};

// ════════════════════════════════════════════
//  Google Sheet helper
// ════════════════════════════════════════════

async function findPlayer(clubGGName) {
  try {
    const auth = new JWT({
      email: GOOGLE_CREDS.client_email,
      key:   GOOGLE_CREDS.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const doc = new GoogleSpreadsheet(SHEET_ID, auth);
    await doc.loadInfo();

    const sheet = doc.sheetsByIndex[0]; // ชีต1
    const rows  = await sheet.getRows();

    const target = clubGGName.trim().toLowerCase();
    for (const row of rows) {
      const clubGG   = (row.get('ID Club GG') || '').trim().toLowerCase();
      const telegramId = (row.get('Telegram ID') || '').trim();
      if (clubGG === target && telegramId) {
        return {
          clubGG:     row.get('ID Club GG').trim(),
          telegramId: telegramId, // @username
        };
      }
    }
  } catch (e) {
    console.error('Sheet error:', e.message);
  }
  return null;
}

// ════════════════════════════════════════════
//  Telegram API helpers
// ════════════════════════════════════════════

async function sendMessage(chatId, text, extra = {}) {
  try {
    const res = await axios.post(`${API}/sendMessage`, {
      chat_id:    chatId,
      text,
      parse_mode: 'Markdown',
      ...extra,
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
      chat_id:    chatId,
      message_id: messageId,
      text,
      parse_mode: 'Markdown',
    });
  } catch (e) {
    console.error('editMessage error:', e.response?.data || e.message);
  }
}

async function deleteMessage(chatId, messageId) {
  try {
    await axios.post(`${API}/deleteMessage`, {
      chat_id:    chatId,
      message_id: messageId,
    });
  } catch (e) {}
}

async function answerCallback(callbackQueryId, text = '') {
  await axios.post(`${API}/answerCallbackQuery`, {
    callback_query_id: callbackQueryId,
    text,
  }).catch(() => {});
}

// ════════════════════════════════════════════
//  Commands
// ════════════════════════════════════════════

async function handleRematch(msg, args) {
  const chatId    = msg.chat.id;
  const chatType  = msg.chat.type;
  const fromId    = msg.from.id;

  // บังคับใช้ใน DM เท่านั้น
  if (chatType !== 'private') {
    await sendMessage(chatId, '🔒 กรุณาส่งคำสั่งนี้ใน *DM กับ Bot* นะครับ');
    return;
  }

  if (!args.length) {
    await sendMessage(chatId,
      '❌ วิธีใช้: /rematch <ID Club GG>\nตัวอย่าง: /rematch Panupong'
    );
    return;
  }

  const targetName = args.join(' ').trim();
  const player     = await findPlayer(targetName);

  if (!player) {
    await sendMessage(chatId,
      `❌ ไม่พบ *${targetName}* ในระบบ\n\n` +
      `อาจเป็นเพราะ:\n` +
      `• ชื่อในเกมไม่ตรง (ตัวพิมพ์ใหญ่/เล็ก)\n` +
      `• ${targetName} ยังไม่ได้ลงทะเบียน\n\n` +
      `💡 ให้ ${targetName} ลงทะเบียนก่อนนะครับ`
    );
    return;
  }

  // ป้องกันท้าตัวเอง (ถ้า Telegram ID ตรงกัน)
  if (player.telegramId === `@${msg.from.username}`) {
    await sendMessage(chatId, '😅 ท้าตัวเองไม่ได้นะครับ!');
    return;
  }

  const key       = targetName.toLowerCase();
  const expiresAt = Date.now() + REMATCH_TTL;

  // หา Club GG ของคนท้าจาก Sheet (ถ้ามี) หรือใช้ชื่อ Telegram แทน
  const fromClubGG = msg.from.username ? `@${msg.from.username}` : msg.from.first_name;

  // 1. ประกาศใน group (ไม่บอกชื่อคนท้า)
  const groupMsg = await sendMessage(GROUP_CHAT_ID,
    `⚔️ มีคนท้าแก้มือ *${player.clubGG}* แล้ว!\n\n` +
    `จะเป็นใครนั้น... ไม่มีใครรู้ 🤫\n` +
    `รอดูผลได้เลย 👀`
  );

  if (!groupMsg) {
    await sendMessage(chatId, '⚠️ ส่งประกาศใน group ไม่ได้ กรุณาตรวจสอบว่า Bot เป็น Admin ใน group');
    return;
  }

  // 2. ส่ง DM หาผู้ถูกท้าพร้อมปุ่ม
  const keyboard = {
    inline_keyboard: [[
      { text: '✅ รับคำท้า',  callback_data: `accept|${fromId}|${player.clubGG}|${groupMsg.message_id}` },
      { text: '❌ ปฏิเสธ',   callback_data: `decline|${fromId}|${player.clubGG}|${groupMsg.message_id}` },
    ]],
  };

  const dmResult = await sendMessage(player.telegramId,
    `⚔️ มีคนขอแก้มือคุณ!\n` +
    `ชื่อในเกม: *${player.clubGG}*\n\n` +
    `รับหรือปฏิเสธ? (หมดอายุใน 24 ชม.)`,
    { reply_markup: keyboard }
  );

  if (!dmResult) {
    // ส่ง DM ไม่ได้ — ลบ group message แล้วแจ้ง
    await deleteMessage(GROUP_CHAT_ID, groupMsg.message_id);
    await sendMessage(chatId,
      `⚠️ ส่งข้อความหา *${player.clubGG}* ไม่ได้\n` +
      `ให้เขา DM Bot แล้วพิมพ์ /start ก่อนนะครับ`
    );
    return;
  }

  // 3. บันทึก pending
  pending[key] = { fromId, fromClubGG, targetClubGG: player.clubGG, expiresAt, groupMsgId: groupMsg.message_id };

  await sendMessage(chatId,
    `✅ ส่งคำท้าถึง *${player.clubGG}* แล้ว!\n` +
    `รอการตอบรับ... (หมดอายุใน 24 ชม.)\n\n` +
    `🔒 ไม่มีใครรู้ว่าคุณคือคนท้า`
  );
}

async function handleCancel(msg, args) {
  if (msg.chat.type !== 'private') return;
  if (!args.length) {
    await sendMessage(msg.chat.id, '❌ วิธีใช้: /cancel <ID Club GG>');
    return;
  }
  const key   = args.join(' ').toLowerCase();
  const entry = pending[key];
  if (!entry) {
    await sendMessage(msg.chat.id, `❌ ไม่มีคำท้าที่รออยู่`);
    return;
  }
  if (entry.fromId !== msg.from.id) {
    await sendMessage(msg.chat.id, '❌ นี่ไม่ใช่คำท้าของคุณ');
    return;
  }
  await deleteMessage(GROUP_CHAT_ID, entry.groupMsgId);
  delete pending[key];
  await sendMessage(msg.chat.id, `✅ ยกเลิกคำท้าแล้ว`);
}

async function handlePending(msg) {
  if (msg.chat.type !== 'private') return;
  cleanupExpired();
  const mine = Object.values(pending).filter(e => e.fromId === msg.from.id);
  if (!mine.length) {
    await sendMessage(msg.chat.id, '📭 คุณไม่มีคำท้าที่รออยู่');
    return;
  }
  const lines = ['📋 *คำท้าของคุณที่ยังรออยู่:*\n'];
  for (const e of mine) {
    const hrs  = Math.floor((e.expiresAt - Date.now()) / 3600000);
    const mins = Math.floor(((e.expiresAt - Date.now()) % 3600000) / 60000);
    lines.push(`• *${e.targetClubGG}* — เหลือ ${hrs}ชม. ${mins}น.`);
  }
  await sendMessage(msg.chat.id, lines.join('\n'));
}

async function handleHelp(msg) {
  if (msg.chat.type !== 'private') {
    await sendMessage(msg.chat.id, '📩 กรุณาใช้คำสั่งนี้ใน DM กับ Bot นะครับ');
    return;
  }
  await sendMessage(msg.chat.id,
    '🎮 *RematchBot — คำสั่งทั้งหมด*\n\n' +
    '/rematch <ID Club GG> — ท้าแก้มือ (ไม่มีใครรู้ว่าคุณท้า)\n' +
    '/cancel <ID Club GG>  — ยกเลิกคำท้าที่ส่งไป\n' +
    '/pending              — ดูคำท้าที่ยังรออยู่\n\n' +
    '🔒 ทุกอย่างเป็นความลับ — กลุ่มเห็นแค่ว่ามีคนท้า ไม่รู้ว่าใคร'
  );
}

// ════════════════════════════════════════════
//  Callback (ปุ่ม ✅ / ❌)
// ════════════════════════════════════════════

async function handleCallback(cb) {
  await answerCallback(cb.id);
  const [action, fromId, targetClubGG, groupMsgId] = cb.data.split('|');
  const key = targetClubGG.toLowerCase();
  const entry = pending[key];

  // ตรวจหมดอายุ
  if (entry && Date.now() > entry.expiresAt) {
    delete pending[key];
    await editMessage(cb.message.chat.id, cb.message.message_id, '⏰ คำท้านี้หมดอายุแล้ว');
    return;
  }

  if (action === 'accept') {
    delete pending[key];

    // อัปเดต group
    await editMessage(GROUP_CHAT_ID, parseInt(groupMsgId),
      `⚔️ *${targetClubGG}* รับคำท้าแล้ว!\n\n` +
      `การแข่งขันกำลังจะเริ่ม... 🔥\n` +
      `ใครจะชนะ รอดูกันเลย 👀`
    );

    // แจ้ง Panupong
    await editMessage(cb.message.chat.id, cb.message.message_id,
      '✅ รับคำท้าแล้ว!\nBot แจ้งให้คู่ต่อสู้รู้แล้ว 🎮'
    );

    // แจ้ง Teerapong ใน DM
    await sendMessage(parseInt(fromId),
      `🎉 *${targetClubGG}* รับคำท้าแล้ว!\n\nติดต่อกันใน Club GG ได้เลยครับ ⚔️`
    );

  } else if (action === 'decline') {
    delete pending[key];

    // อัปเดต group — โชว์ว่าปฏิเสธ
    await editMessage(GROUP_CHAT_ID, parseInt(groupMsgId),
      `🚫 *${targetClubGG}* ปฏิเสธคำท้าครั้งนี้\n\nไว้คราวหน้านะ 👋`
    );

    // แจ้ง Panupong
    await editMessage(cb.message.chat.id, cb.message.message_id,
      '❌ ปฏิเสธคำท้าแล้ว'
    );

    // แจ้ง Teerapong ใน DM
    await sendMessage(parseInt(fromId),
      `😔 *${targetClubGG}* ปฏิเสธคำท้าครั้งนี้`
    );
  }
}

// ════════════════════════════════════════════
//  Cleanup expired
// ════════════════════════════════════════════

function cleanupExpired() {
  const now = Date.now();
  for (const [key, entry] of Object.entries(pending)) {
    if (now > entry.expiresAt) {
      editMessage(GROUP_CHAT_ID, entry.groupMsgId,
        `⏰ คำท้า *${entry.targetClubGG}* หมดอายุแล้ว`
      ).catch(() => {});
      delete pending[key];
    }
  }
}
setInterval(cleanupExpired, 30 * 60 * 1000); // ทุก 30 นาที

// ════════════════════════════════════════════
//  Polling loop
// ════════════════════════════════════════════

let offset = 0;

async function poll() {
  try {
    const res = await axios.get(`${API}/getUpdates`, {
      params: { offset, timeout: 30, allowed_updates: ['message', 'callback_query'] },
      timeout: 35000,
    });

    for (const update of res.data.result) {
      offset = update.update_id + 1;

      // callback (ปุ่ม)
      if (update.callback_query) {
        await handleCallback(update.callback_query);
        continue;
      }

      // message
      const msg  = update.message;
      if (!msg || !msg.text) continue;

      const text = msg.text.trim();
      const [cmd, ...args] = text.split(/\s+/);

      if (cmd === '/start' || cmd === '/help')    await handleHelp(msg);
      else if (cmd === '/rematch')                await handleRematch(msg, args);
      else if (cmd === '/cancel')                 await handleCancel(msg, args);
      else if (cmd === '/pending')                await handlePending(msg);
    }
  } catch (e) {
    console.error('Poll error:', e.message);
  }
  setTimeout(poll, 1000);
}

// ════════════════════════════════════════════
//  Keep-alive server (Render ต้องการ port)
// ════════════════════════════════════════════

http.createServer((req, res) => res.end('RematchBot running')).listen(process.env.PORT || 3000);

console.log('RematchBot started!');
poll();
