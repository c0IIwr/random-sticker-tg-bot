const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const { MongoClient } = require("mongodb");
const { google } = require("googleapis");
const emojiRegex = require("emoji-regex");
const regex = emojiRegex();

const token = process.env.TOKEN;
const bot = new TelegramBot(token);

const server = express();
server.use(express.json());

const webhookPath = `/bot${token}`;
const port = process.env.PORT || 3000;
const webhookUrl = `https://random-sticker-tg-bot.onrender.com${webhookPath}`;

bot
  .setWebHook(webhookUrl)
  .then(() => {
    console.log(`Вебхук установлен на ${webhookUrl}`);
  })
  .catch((error) => {
    console.error("Ошибка при установке вебхука:", error);
  });

server.post(webhookPath, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

server.listen(port, () => {
  console.log(`Сервер запущен на порту ${port}`);
});

const mongoUrl = process.env.MONGO_URL;
const client = new MongoClient(mongoUrl);

async function connectToDb() {
  try {
    await client.connect();
    console.log("Подключено к MongoDB");
  } catch (error) {
    console.error("Ошибка подключения к MongoDB:", error);
  }
}

connectToDb();

const db = client.db("stickerBotDb");
const usersCollection = db.collection("users");

const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });
const spreadsheetId = process.env.SPREADSHEET_ID;

const stickerPacks = [
  "psihomem_by_fStikBot",
  "Bigkittypack",
  "yoo3_by_fStikBot",
  "tinycatss",
  "Nekonyaaaa",
  "meowmeowk07_by_fStikBot",
  "fork_art_k_by_fStikBot",
  "StellarCats",
  "tenerezze1",
  "newyearcats_by_TgEmojiBot",
  "Kittyppsps_by_stkpbot",
  "hpospwgq_by_stickrubot",
  "YHITVNT_by_stikers_du_ark_bot",
  "GrustnoMeow",
  "blbbykqzcr_by_e4zybot",
  "guRlYsx_by_achestickbot",
  "set_481_by_makestick3_bot",
  "aanimols",
  "LoveeMeow",
  "tenerezze4",
  "UOSTAJR_by_stikers_du_ark_bot",
  "KORAGOM_by_stikers_du_ark_bot",
  "AMFOBYA_by_stikers_du_ark_bot",
  "BCNWDHG_by_stikers_du_ark_bot",
  "ANVRZVO_by_stikers_du_ark_bot",
  "ZGYNRXJ_by_stikers_du_ark_bot",
  "RBTOECR_by_stikers_du_ark_bot",
  "KXKWMXD_by_stikers_du_ark_bot",
  "UBFIUZF_by_stikers_du_ark_bot",
  "BCZQQBZ_by_stikers_du_ark_bot",
  "ultica",
  "eomhxvyc_by_stickrubot",
  "viexafqf_by_stickrubot",
  "gtrmogcr_by_stickrubot",
  "luvkit",
  "kitties4bynorufx_by_fStikBot",
  "kitee4ki_by_fStikBot",
  "stickersffkitty",
  "kittensticksmeow",
  "Pussy_Cars",
  "ilkvv",
  "BkycnoCats",
  "kartino4ki_lubvi",
  "catsunicmass",
  "kittesss_by_stkpbot",
  "PussysVideo",
  "KOTIKI4000",
  "monkey_cat_luna",
  "EOROHIBABX_by_stikeri_stikeri_bot",
  "randomcatssticks",
  "v232251114338541_by_StickerEdit_bot",
  "spv_469d8135dd35291b6621c84ee1976cc2_by_stckrRobot",
  "lapki_myak",
  "nfKdpgPEuOEz_by_stickers_stealer_bot",
  "mrktcats2",
  "huisnth",
  "Sukrumotion",
  "CATTOOOOOO",
  "anyaandkatyapm",
  "kotikinu",
  "jajjajjaj_by_fStikBot",
  "yulechkinpack_by_fStikBot",
  "kitikitiymeow_by_fStikBot",
  "ktmrcats",
  "KitikiFavoritki_by_fStikBot",
  "PuppyAndKittyVoL1",
  "kitties2bynorufx_by_fStikBot",
  "wiksyua_by_fStikBot",
  "Kitts_chirpani",
  "kkkkiiitttyyy_by_fStikBot",
  "Y_F_H_by_fStikBot",
  "kdr44",
  "Pussy_cars2",
  "Shoobies",
  "bruh_Im_a_cat",
  "JackalCats",
];

let allStickers = [];

async function loadStickers() {
  for (const pack of stickerPacks) {
    try {
      const stickerSet = await bot.getStickerSet(pack);
      allStickers = allStickers.concat(stickerSet.stickers);
    } catch (error) {
      console.error(`Ошибка при загрузке пака ${pack}:`, error);
    }
  }
  console.log(`Загружено ${allStickers.length} стикеров`);
}

loadStickers();

async function getUserData(chatId, msg = {}) {
  let user = await usersCollection.findOne({ chatId: chatId.toString() });
  if (!user) {
    user = {
      chatId: chatId.toString(),
      sentStickers: [],
      stickerCount: 0,
      resetCount: 0,
      firstSent: null,
      lastSent: null,
      firstName: msg.from?.first_name || "",
      lastName: msg.from?.last_name || "",
      username: msg.from?.username || "",
      languageCode: msg.from?.language_code || "",
      chatType: msg.chat?.type || "",
      chatTitle: msg.chat?.type !== "private" ? msg.chat?.title || "" : "",
      chatUsername: msg.chat?.username || "",
    };
    await usersCollection.insertOne(user);
  } else if (msg.from || msg.chat) {
    user.firstName = msg.from?.first_name || user.firstName || "";
    user.lastName = msg.from?.last_name || user.lastName || "";
    user.username = msg.from?.username || user.username || "";
    user.languageCode = msg.from?.language_code || user.languageCode || "";
    user.chatType = msg.chat?.type || user.chatType || "";
    user.chatTitle =
      msg.chat?.type !== "private"
        ? msg.chat?.title || user.chatTitle || ""
        : user.chatTitle || "";
    user.chatUsername = msg.chat?.username || user.chatUsername || "";
    await saveUserData(user);
  }
  return user;
}

async function saveUserData(user) {
  await usersCollection.updateOne(
    { chatId: user.chatId },
    {
      $set: {
        sentStickers: user.sentStickers,
        stickerCount: user.stickerCount,
        resetCount: user.resetCount,
        firstSent: user.firstSent,
        lastSent: user.lastSent,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        languageCode: user.languageCode,
        chatType: user.chatType,
        chatTitle: user.chatTitle,
        chatUsername: user.chatUsername,
      },
    }
  );
}

async function updateUserDataInSheet(user) {
  const chatId = user.chatId;
  const fullName =
    user.firstName && user.lastName
      ? `${user.firstName} ${user.lastName}`
      : user.firstName || user.lastName || "";
  const username = user.username || "Скрыто";
  const languageCode = user.languageCode || "";
  const chatType = user.chatType || "";
  const chatTitle =
    chatType === "private" ? "Личный чат" : user.chatTitle || "Без названия";
  const chatLink =
    chatType !== "private" && user.chatUsername
      ? `https://t.me/${user.chatUsername}`
      : "";
  const sentNow = user.sentStickers.length;
  const totalSent = user.stickerCount || 0;
  const stickerCountDisplay = `${sentNow} (${totalSent})`;
  const resetCount = user.resetCount || 0;

  const formatDate = (date) => {
    if (!date) return "";
    const d = new Date(date);
    const options = {
      timeZone: "Europe/Moscow",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    };
    const formattedDate = d.toLocaleString("ru-RU", options);
    return formattedDate.replace(",", "");
  };

  const firstSent = formatDate(user.firstSent);
  const lastSent = formatDate(user.lastSent);

  const headersRange = "Data!A1:Z1";
  const headersResponse = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: headersRange,
  });
  const headers = headersResponse.data.values[0];

  const userData = {
    chatId,
    fullName,
    username,
    languageCode,
    chatType,
    chatTitle,
    chatLink,
    stickerCount: stickerCountDisplay,
    resetCount,
    firstSent,
    lastSent,
  };

  const dataRange = "Data!A2:Z";
  const dataResponse = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: dataRange,
  });
  const rows = dataResponse.data.values || [];

  const rowIndex = rows.findIndex(
    (row) => row[headers.indexOf("chatId")] === chatId
  );

  if (rowIndex === -1) {
    const newRow = headers.map((header) => userData[header] || "");
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "Data",
      valueInputOption: "RAW",
      resource: {
        values: [newRow],
      },
    });
  } else {
    const updateRow = rowIndex + 2;
    const updateData = headers.map((header) => userData[header] || "");
    const updateRange = `Data!A${updateRow}:Z${updateRow}`;
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: updateRange,
      valueInputOption: "RAW",
      resource: {
        values: [updateData],
      },
    });
  }
}

function isOnlyEmojis(str) {
  const matches = str.match(regex);
  return matches && matches.join("") === str;
}

function splitEmojis(str) {
  return str.match(regex) || [];
}

async function sendStickerAgain(chatId, emojis) {
  const userEmojis = emojis ? emojis.split(",") : [];
  const matchingStickers = allStickers.filter((sticker) => {
    const stickerEmojis = splitEmojis(sticker.emoji);
    return userEmojis.some((emoji) => stickerEmojis.includes(emoji));
  });
  const randomIndex = Math.floor(Math.random() * matchingStickers.length);
  const sticker = matchingStickers[randomIndex];
  const keyboard = {
    keyboard: [[{ text: "Ещё котик 🤗" }]],
    resize_keyboard: true,
    one_time_keyboard: false,
  };
  await bot.sendSticker(chatId, sticker.file_id, {
    reply_markup: JSON.stringify(keyboard),
  });
}

async function sendRandomStickerFromList(
  chatId,
  stickers,
  user,
  emojis = null
) {
  if (stickers.length === 0) {
    const keyboard = {
      inline_keyboard: [
        [{ text: "Случайный котик 🤗", callback_data: "random_sticker" }],
      ],
    };
    bot.sendMessage(chatId, "Таких котиков нет 😔", {
      reply_markup: JSON.stringify(keyboard),
    });
    return;
  }
  const availableStickers = stickers.filter(
    (s) => !user.sentStickers.includes(s.file_id)
  );
  if (availableStickers.length === 0) {
    const emojiString = emojis ? emojis.join(",") : "";
    const keyboard = {
      inline_keyboard: [
        [
          {
            text: "Всё равно отправить котика 🤗",
            callback_data: `send_again_${emojiString}`,
          },
        ],
      ],
    };
    bot.sendMessage(
      chatId,
      "Все стикеры с этими эмодзи уже были отправлены 😔",
      {
        reply_markup: JSON.stringify(keyboard),
      }
    );
    return;
  }
  const randomIndex = Math.floor(Math.random() * availableStickers.length);
  const sticker = availableStickers[randomIndex];
  user.sentStickers.push(sticker.file_id);
  user.stickerCount = (user.stickerCount || 0) + 1;
  user.lastSent = new Date();
  if (!user.firstSent) user.firstSent = new Date();
  await saveUserData(user);
  updateUserDataInSheet(user).catch((error) => {
    console.error("Ошибка при обновлении данных в Google Sheets:", error);
  });
  const buttonText =
    user.stickerCount === 1 ? "Отправить котика 🤗" : "Ещё котик 🤗";
  const keyboard = {
    keyboard: [[{ text: buttonText }]],
    resize_keyboard: true,
    one_time_keyboard: false,
  };
  await bot.sendSticker(chatId, sticker.file_id, {
    reply_markup: JSON.stringify(keyboard),
  });
}

async function sendSticker(msg) {
  try {
    const chatId = msg.chat.id.toString();
    const user = await getUserData(chatId, msg);
    const text = msg.text ? msg.text.trim() : "";
    let stickers = allStickers;
    let emojis = null;
    if (isOnlyEmojis(text)) {
      emojis = splitEmojis(text);
      stickers = allStickers.filter((sticker) => {
        const stickerEmojis = splitEmojis(sticker.emoji);
        return emojis.some((emoji) => stickerEmojis.includes(emoji));
      });
    }
    await sendRandomStickerFromList(chatId, stickers, user, emojis);
  } catch (error) {
    console.error("Ошибка в функции sendSticker:", error);
    const keyboard = {
      inline_keyboard: [
        [{ text: "Разбудить котят 🫣", callback_data: "retry_sendSticker" }],
      ],
    };
    bot.sendMessage(msg.chat.id, "Котики спят 😴 Попробуйте позже ⌛️", {
      reply_markup: JSON.stringify(keyboard),
    });
  }
}

bot.onText(/\/kitty/, (msg) => {
  sendSticker(msg);
});

async function resetSentStickers(chatId) {
  try {
    const user = await getUserData(chatId);
    user.sentStickers = [];
    user.resetCount = (user.resetCount || 0) + 1;
    await saveUserData(user);
    updateUserDataInSheet(user).catch((error) => {
      console.error("Ошибка при обновлении данных в Google Sheets:", error);
    });
    const keyboard = {
      inline_keyboard: [
        [{ text: "Случайный котик 🤗", callback_data: "random_sticker" }],
      ],
    };
    bot.sendMessage(chatId, "Список отправленных стикеров сброшен 👍", {
      reply_markup: JSON.stringify(keyboard),
    });
  } catch (error) {
    console.error("Ошибка в команде /reset:", error);
    const keyboard = {
      inline_keyboard: [
        [{ text: "Разбудить котят 🫣", callback_data: "retry_reset" }],
      ],
    };
    bot.sendMessage(chatId, "Котики спят 😴 Попробуйте позже ⌛️", {
      reply_markup: JSON.stringify(keyboard),
    });
  }
}

bot.onText(/\/reset/, (msg) => {
  const chatId = msg.chat.id.toString();
  resetSentStickers(chatId);
});

async function sendInfo(chatId) {
  try {
    const user = await getUserData(chatId);
    const packCount = stickerPacks.length;
    const stickerCount = allStickers.length;
    const sentCount = user.sentStickers.length;
    const remainingCount = stickerCount - sentCount;
    const percentageSent =
      stickerCount > 0 ? ((sentCount / stickerCount) * 100).toFixed(2) : 0;
    bot.sendMessage(
      chatId,
      `Всего стикерпаков: ${packCount}\n` +
        `Всего стикеров: ${stickerCount}\n` +
        `Отправлено стикеров: ${sentCount} (${percentageSent}%)\n` +
        `Осталось стикеров: ${remainingCount}`
    );
  } catch (error) {
    console.error("Ошибка в команде /info:", error);
    const keyboard = {
      inline_keyboard: [
        [{ text: "Разбудить котят 🫣", callback_data: "retry_info" }],
      ],
    };
    bot.sendMessage(chatId, "Котики спят 😴 Попробуйте позже ⌛️", {
      reply_markup: JSON.stringify(keyboard),
    });
  }
}

bot.onText(/\/info/, (msg) => {
  const chatId = msg.chat.id.toString();
  sendInfo(chatId);
});

bot.onText(/котик/i, (msg) => {
  const text = msg.text.toLowerCase();
  if (text !== "отправить котика 🤗" && text !== "ещё котик 🤗") {
    sendSticker(msg);
  }
});

bot.onText(/^(Отправить котика 🤗|Ещё котик 🤗)$/i, (msg) => {
  sendSticker(msg);
});

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id.toString();
  const user = await getUserData(chatId, msg);
  const keyboard = {
    inline_keyboard: [
      [{ text: "Случайный котик 🤗", callback_data: "random_sticker" }],
    ],
  };
  await bot.sendMessage(
    chatId,
    "Нажмите кнопку, чтобы получить стикер с котиком 🤗",
    {
      reply_markup: JSON.stringify(keyboard),
    }
  );
});

bot.on("message", async (msg) => {
  if (msg.text && !msg.text.startsWith("/")) {
    const text = msg.text.trim();
    if (isOnlyEmojis(text)) {
      const userEmojis = text.match(regex);
      if (userEmojis && userEmojis.length > 0) {
        const matchingStickers = allStickers.filter((sticker) => {
          const stickerEmojis = splitEmojis(sticker.emoji);
          return userEmojis.some((emoji) => stickerEmojis.includes(emoji));
        });
        const chatId = msg.chat.id.toString();
        const user = await getUserData(chatId, msg);
        await sendRandomStickerFromList(chatId, matchingStickers, user);
      }
    }
  }
});

bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id.toString();
  const data = query.data;

  if (data === "random_sticker") {
    await sendSticker({ chat: { id: chatId }, from: query.from || {} });
  } else if (data.startsWith("send_again_")) {
    const emojis = data.replace("send_again_", "");
    await sendStickerAgain(chatId, emojis);
  } else if (data === "retry_sendSticker") {
    await sendSticker({ chat: { id: chatId }, from: query.from || {} });
  } else if (data === "retry_reset") {
    await resetSentStickers(chatId);
  } else if (data === "retry_info") {
    await sendInfo(chatId);
  }

  bot.answerCallbackQuery(query.id);
});

bot.setMyCommands([
  { command: "/kitty", description: "🤗 Котик из случайного стикерпака" },
  { command: "/reset", description: "❌ Сброс отправленных стикеров" },
  { command: "/info", description: "📃 Инфа о стикерпаках" },
]);

console.log("Бот запущен...");
