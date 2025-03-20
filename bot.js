const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const { MongoClient } = require("mongodb");
const { google } = require("googleapis");
const emojiRegex = require("emoji-regex");
const regex = emojiRegex();
const stickerPacks = require("./stickerPacks");
const movies = require("./movies");
const setupGreetings = require("./greetings");
const { getUserData, saveUserData, resetUserState } = require("./userUtils");

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
module.exports.usersCollection = usersCollection;

const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });
const spreadsheetId = process.env.SPREADSHEET_ID;

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

async function updateUserCommands(chatId) {
  const user = await getUserData(chatId);
  const helloDescription = user.name ? "👋 Поздороваться" : "👋 Познакомиться";
  const commands = [
    { command: "/kitty", description: "🤗 Котик из случайного стикерпака" },
    { command: "/reset", description: "❌ Сброс отправленных стикеров" },
    { command: "/info", description: "📃 Инфа о стикерпаках" },
    { command: "/hello", description: helloDescription },
  ];
  await bot.setMyCommands(commands, {
    scope: { type: "chat", chat_id: chatId },
  });
}

loadStickers().then(() => {
  setupGreetings(bot, usersCollection, allStickers, updateUserCommands);
});

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
      : chatType === "private" && user.username
      ? `https://t.me/${user.username}`
      : "";
  const sentNow = user.sentStickers.length;
  const totalSent = user.stickerCount || 0;
  const stickerCountDisplay = `${sentNow} (${totalSent})`;
  const resetCount = user.resetCount || 0;
  const movieCount = user.movieCount || 0;

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
    movieCount,
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

async function getRandomMovie(user) {
  const availableMovies = movies.filter(
    (movie) => !user.sentMovies.includes(movie.title)
  );
  if (availableMovies.length === 0) {
    user.sentMovies = [];
    await saveUserData(user);
    return getRandomMovie(user);
  }
  const randomIndex = Math.floor(Math.random() * availableMovies.length);
  return availableMovies[randomIndex];
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
    if (emojis === null) {
      if (!user.allStickersSent) {
        const movie = await getRandomMovie(user);
        const caption = `
<b>${movie.title}</b>

<b>Год выпуска:</b> ${movie.year}
<b>Оригинальное название:</b> ${movie.originalTitle}
<b>Страна производства:</b> ${movie.country}
<b>Жанры:</b> ${movie.genres}
<b>Продолжительность:</b> ${movie.duration}

${movie.description}
        `.trim();
        const movieKeyboard = {
          inline_keyboard: [
            [
              {
                text: "Смотреть 🎥",
                url: movie.watchUrl,
              },
            ],
          ],
        };
        await bot.sendPhoto(chatId, movie.posterUrl, {
          caption: caption,
          parse_mode: "HTML",
          reply_markup: JSON.stringify(movieKeyboard),
        });

        user.sentMovies.push(movie.title);
        user.movieCount = (user.movieCount || 0) + 1;
        user.allStickersSent = true;
        await saveUserData(user);
        updateUserDataInSheet(user).catch((error) => {
          console.error("Ошибка при обновлении данных в Google Sheets:", error);
        });
      }

      const resetKeyboard = {
        inline_keyboard: [
          [{ text: "Начать сначала 😇", callback_data: "reset_and_send" }],
        ],
      };
      await bot.sendMessage(
        chatId,
        "Поздравляю! 🎉 Ты умничка 🤗 Все стикеры кончились 🔥",
        {
          reply_markup: JSON.stringify(resetKeyboard),
        }
      );
    } else {
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
    }
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

bot.onText(/\/kitty/, async (msg) => {
  const chatId = msg.chat.id.toString();
  await resetUserState(chatId);
  sendSticker(msg);
});

async function resetSentStickers(chatId, silent = false) {
  try {
    const user = await getUserData(chatId);
    user.sentStickers = [];
    user.allStickersSent = false;
    user.resetCount = (user.resetCount || 0) + 1;
    await saveUserData(user);
    updateUserDataInSheet(user).catch((error) => {
      console.error("Ошибка при обновлении данных в Google Sheets:", error);
    });
    if (!silent) {
      const keyboard = {
        inline_keyboard: [
          [{ text: "Случайный котик 🤗", callback_data: "random_sticker" }],
        ],
      };
      bot.sendMessage(chatId, "Список отправленных стикеров сброшен 👍", {
        reply_markup: JSON.stringify(keyboard),
      });
    }
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

bot.onText(/\/reset/, async (msg) => {
  const chatId = msg.chat.id.toString();
  await resetUserState(chatId);
  const keyboard = {
    inline_keyboard: [
      [{ text: "Сбросить 🗑️", callback_data: "confirm_reset" }],
    ],
  };
  bot.sendMessage(
    chatId,
    "Ты точно хочешь сбросить список отправленных стикеров? 🤔",
    {
      reply_markup: JSON.stringify(keyboard),
    }
  );
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

    let infoMessage =
      `<b>Всего стикерпаков:</b> ${packCount}\n` +
      `<b>Всего стикеров:</b> ${stickerCount}\n` +
      `<b>Отправлено стикеров:</b> ${sentCount} (${percentageSent}%)\n` +
      `<b>Осталось стикеров:</b> ${remainingCount}`;

    if (user.movieCount > 0) {
      infoMessage += `\n<b>Просмотрено мультиков:</b> ${user.movieCount}`;
    } else {
      infoMessage += `\n\n<i><tg-spoiler>Говорят, если закончатся стикеры, то покажут мультик 🤭</tg-spoiler></i>`;
    }

    bot.sendMessage(chatId, infoMessage, { parse_mode: "HTML" });
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

bot.onText(/\/info/, async (msg) => {
  const chatId = msg.chat.id.toString();
  await resetUserState(chatId);
  sendInfo(chatId);
});

bot.onText(/котик/i, async (msg) => {
  const text = msg.text.toLowerCase();
  if (text !== "отправить котика 🤗" && text !== "ещё котик 🤗") {
    const chatId = msg.chat.id.toString();
    await resetUserState(chatId);
    sendSticker(msg);
  }
});

bot.onText(/^(Отправить котика 🤗|Ещё котик 🤗)$/i, async (msg) => {
  const chatId = msg.chat.id.toString();
  await resetUserState(chatId);
  sendSticker(msg);
});

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id.toString();
  await resetUserState(chatId);
  const user = await getUserData(chatId, msg);
  await updateUserCommands(chatId);
  const keyboard = {
    inline_keyboard: [
      [{ text: "Случайный котик 🤗", callback_data: "random_sticker" }],
    ],
  };
  await bot.sendMessage(
    chatId,
    "Нажми кнопку, чтобы получить стикер с котиком 🤗",
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
        const chatId = msg.chat.id.toString();
        const user = await getUserData(chatId, msg);
        const matchingStickers = allStickers.filter((sticker) => {
          const stickerEmojis = splitEmojis(sticker.emoji);
          return userEmojis.some((emoji) => stickerEmojis.includes(emoji));
        });
        await sendRandomStickerFromList(
          chatId,
          matchingStickers,
          user,
          userEmojis
        );
      }
    }
  }
});

bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id.toString();
  const data = query.data;

  if (data === "confirm_reset") {
    try {
      await bot.deleteMessage(chatId, query.message.message_id);
    } catch (error) {
      console.error("Ошибка при удалении сообщения:", error);
    }
    await resetSentStickers(chatId);
  } else if (data === "random_sticker") {
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
  } else if (data === "reset_and_send") {
    await resetSentStickers(chatId, true);
    await sendSticker({ chat: { id: chatId }, from: query.from || {} });
  }

  await bot.answerCallbackQuery(query.id);
});

bot.setMyCommands([
  { command: "/kitty", description: "🤗 Котик из случайного стикерпака" },
  { command: "/reset", description: "❌ Сброс отправленных стикеров" },
  { command: "/info", description: "📃 Инфа о стикерпаках" },
  { command: "/hello", description: "👋 Познакомиться" },
]);

console.log("Бот запущен...");
