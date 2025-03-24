const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const db = require("./db");
const stickerPacks = require("./stickerPacks");
const movies = require("./movies");
const setupGreetings = require("./greetings");
const {
  getUserData,
  saveUserData,
  resetUserState,
  getAndMarkRandomFact,
} = require("./userUtils");
const {
  addStickerSet,
  addStickerPackToSet,
  selectStickerSet,
  deleteStickerSet,
  getSetStatistics,
  sendStickerFromCustomSet,
  userStickerPacks,
} = require("./stickerSets");
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

const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });
const spreadsheetId = process.env.SPREADSHEET_ID;

let allStickers = [];

global.userStickerPacks = userStickerPacks;

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
  ];
  if (user.stickerSets.length > 0) {
    commands.push({
      command: "/sticker",
      description: "🎉 Случайный стикер из выбранного набора",
    });
  }
  commands.push(
    { command: "/reset", description: "❌ Сброс отправленных стикеров" },
    { command: "/info", description: "📃 Инфа о стикерпаках" },
    { command: "/fact", description: "🧐 Случайный факт" },
    { command: "/hello", description: helloDescription }
  );
  await bot.setMyCommands(commands, {
    scope: { type: "chat", chat_id: chatId },
  });
}

async function startBot() {
  await db.connectToDb();
  await loadStickers();
  setupGreetings(bot, allStickers, updateUserCommands, updateUserDataInSheet);
}

startBot();

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
  const factCount = user.factCount || 0;

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

  const name = user.name || "";
  const eveningTime = user.eveningTime || "";
  const morningTime = user.morningTime || "";
  const timezone = user.timezone || "";

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
    factCount,
    firstSent,
    lastSent,
    name,
    eveningTime,
    morningTime,
    timezone,
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
  await resetUserStateWithDeletion(chatId);
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

async function deleteMessages(chatId, messageIds) {
  for (const messageId of messageIds) {
    try {
      await bot.deleteMessage(chatId, messageId);
    } catch (error) {}
  }
}

async function resetUserStateWithDeletion(chatId) {
  const user = await getUserData(chatId);
  if (user.lastRequestMessageId) {
    try {
      await bot.deleteMessage(chatId, user.lastRequestMessageId);
    } catch (error) {}
    user.lastRequestMessageId = null;
  }
  await resetUserState(chatId);
}

bot.onText(/\/reset/, async (msg) => {
  const chatId = msg.chat.id.toString();
  await resetUserStateWithDeletion(chatId);
  const user = await getUserData(chatId, msg);

  await deleteMessages(chatId, user.resetMessageIds);
  user.resetMessageIds = [msg.message_id];

  await deleteMessages(chatId, user.resetBotMessageIds);
  user.resetBotMessageIds = [];

  await deleteMessages(chatId, user.userCommandMessages);
  user.userCommandMessages = [];

  const keyboard = {
    inline_keyboard: [
      [{ text: "Сбросить 🗑️", callback_data: "confirm_reset" }],
    ],
  };
  const sentMessage = await bot.sendMessage(
    chatId,
    "Ты точно хочешь сбросить список отправленных стикеров? 🤔",
    {
      reply_markup: JSON.stringify(keyboard),
    }
  );

  user.resetBotMessageIds.push(sentMessage.message_id);
  await saveUserData(user);
});

async function sendInfo(chatId) {
  try {
    const user = await getUserData(chatId);
    const infoMessage = await getSetStatistics(bot, user, allStickers);
    const keyboard = {
      inline_keyboard: [
        [{ text: "Выбрать набор", callback_data: "choose_set" }],
      ],
    };
    const sentMessage = await bot.sendMessage(chatId, infoMessage, {
      parse_mode: "HTML",
      reply_markup: JSON.stringify(keyboard),
    });
    return sentMessage;
  } catch (error) {
    console.error("Ошибка в команде /info:", error);
    const keyboard = {
      inline_keyboard: [
        [{ text: "Разбудить котят 🫣", callback_data: "retry_info" }],
      ],
    };
    const sentMessage = await bot.sendMessage(
      chatId,
      "Котики спят 😴 Попробуйте позже ⌛️",
      {
        reply_markup: JSON.stringify(keyboard),
      }
    );
    return sentMessage;
  }
}

bot.onText(/\/info/, async (msg) => {
  const chatId = msg.chat.id.toString();
  await resetUserStateWithDeletion(chatId);
  const user = await getUserData(chatId, msg);

  await deleteMessages(chatId, user.infoMessageIds);
  user.infoMessageIds = [msg.message_id];

  await deleteMessages(chatId, user.infoBotMessageIds);
  user.infoBotMessageIds = [];

  await deleteMessages(chatId, user.userCommandMessages);
  user.userCommandMessages = [];

  const sentMessage = await sendInfo(chatId);
  user.infoBotMessageIds.push(sentMessage.message_id);
  await saveUserData(user);
});

bot.onText(/котик/i, async (msg) => {
  const text = msg.text.toLowerCase();
  if (text !== "отправить котика 🤗" && text !== "ещё котик 🤗") {
    const chatId = msg.chat.id.toString();
    await resetUserStateWithDeletion(chatId);
    sendSticker(msg);
  }
});

bot.onText(/^(Отправить котика 🤗|Ещё котик 🤗)$/i, async (msg) => {
  const chatId = msg.chat.id.toString();
  await resetUserStateWithDeletion(chatId);
  sendSticker(msg);
});

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id.toString();
  await resetUserStateWithDeletion(chatId);
  const user = await getUserData(chatId, msg);

  await deleteMessages(chatId, user.startMessageIds);
  user.startMessageIds = [msg.message_id];

  await deleteMessages(chatId, user.startBotMessageIds);
  user.startBotMessageIds = [];

  await deleteMessages(chatId, user.userCommandMessages);
  user.userCommandMessages = [];

  await updateUserCommands(chatId);
  const keyboard = {
    inline_keyboard: [
      [{ text: "Случайный котик 🤗", callback_data: "random_sticker" }],
    ],
  };
  const sentMessage = await bot.sendMessage(
    chatId,
    "Нажми кнопку, чтобы получить стикер с котиком 🤗",
    {
      reply_markup: JSON.stringify(keyboard),
    }
  );

  user.startBotMessageIds.push(sentMessage.message_id);
  await saveUserData(user);
});

bot.on("message", async (msg) => {
  const chatId = msg.chat.id.toString();
  const user = await getUserData(chatId, msg);

  if (msg.text && !msg.text.startsWith("/")) {
    const text = msg.text.trim();

    if (user.state === "waiting_for_set_name") {
      const setName = text;
      await addStickerSet(user, setName);
      await bot.deleteMessage(chatId, user.lastRequestMessageId);
      await bot.deleteMessage(chatId, msg.message_id);
      const sentMessage = await bot.sendMessage(
        chatId,
        `Добавлен набор «${setName}». А теперь отправь стикер, из этого стикерпака будет выбираться случайный стикер`
      );
      user.state = "waiting_for_sticker";
      user.lastRequestMessageId = sentMessage.message_id;
      await saveUserData(user);
      await updateUserCommands(chatId);
    } else if (isOnlyEmojis(text)) {
      const userEmojis = text.match(regex);
      if (userEmojis && userEmojis.length > 0) {
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
  } else if (msg.sticker && user.state === "waiting_for_sticker") {
    const setName = user.lastCustomSet;
    const result = await addStickerPackToSet(bot, user, setName, msg.sticker);
    await bot.deleteMessage(chatId, user.lastRequestMessageId);
    await bot.deleteMessage(chatId, msg.message_id);
    const keyboard = {
      inline_keyboard: [
        [
          {
            text: "Добавить ещё стикерпак",
            callback_data: "add_more_stickerpack",
          },
        ],
      ],
    };
    let message;
    if (result.alreadyExists) {
      message = `Стикерпак «${result.packName}» уже есть в наборе «${setName}»`;
    } else {
      message = `Добавлен стикерпак «${result.packName}»`;
    }
    const sentMessage = await bot.sendMessage(chatId, message, {
      reply_markup: JSON.stringify(keyboard),
    });
    user.lastRequestMessageId = sentMessage.message_id;
    await saveUserData(user);
  }
});

async function sendRandomFact(chatId) {
  const user = await getUserData(chatId);
  const factMessage = await getAndMarkRandomFact(user);
  updateUserDataInSheet(user).catch((error) => {
    console.error("Ошибка при обновлении данных в Google Sheets:", error);
  });
  const keyboard = {
    inline_keyboard: [[{ text: "Ещё факт 🤓", callback_data: "more_fact" }]],
  };
  await bot.sendMessage(chatId, factMessage, {
    parse_mode: "HTML",
    reply_markup: JSON.stringify(keyboard),
  });
}

bot.onText(/\/fact/, async (msg) => {
  const chatId = msg.chat.id.toString();
  await resetUserStateWithDeletion(chatId);
  await sendRandomFact(chatId);
});

bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id.toString();
  const data = query.data;
  const user = await getUserData(chatId);

  if (data === "choose_set") {
    const addSetText =
      user.stickerSets.length > 0
        ? "Добавить новый набор"
        : "Добавить свой набор";
    const keyboard = { inline_keyboard: [] };

    if (user.currentSet === "Стикеры с котиками") {
      keyboard.inline_keyboard.push([
        { text: addSetText, callback_data: "add_set" },
      ]);
      const customSets = user.stickerSets.map((set) => ({
        text: set.name,
        callback_data: `select_set_${set.name}`,
      }));
      for (let i = 0; i < customSets.length; i += 4) {
        keyboard.inline_keyboard.push(customSets.slice(i, i + 4));
      }
    } else {
      keyboard.inline_keyboard.push([
        { text: addSetText, callback_data: "add_set" },
        {
          text: "Стикеры с котиками",
          callback_data: "select_set_Стикеры с котиками",
        },
      ]);
      const customSets = user.stickerSets
        .filter((set) => set.name !== user.currentSet)
        .map((set) => ({
          text: set.name,
          callback_data: `select_set_${set.name}`,
        }));
      for (let i = 0; i < customSets.length; i += 4) {
        keyboard.inline_keyboard.push(customSets.slice(i, i + 4));
      }
      keyboard.inline_keyboard.push([
        {
          text: `Удалить «${user.currentSet}»`,
          callback_data: `delete_set_${user.currentSet}`,
        },
      ]);
    }
    await bot.editMessageReplyMarkup(JSON.stringify(keyboard), {
      chat_id: chatId,
      message_id: query.message.message_id,
    });
  } else if (data.startsWith("select_set_")) {
    const setName = data.replace("select_set_", "");
    await selectStickerSet(user, setName);
    await bot.deleteMessage(chatId, query.message.message_id);
    await updateUserCommands(chatId);
    const sentMessage = await sendInfo(chatId);
    user.infoBotMessageIds = [sentMessage.message_id];
    await saveUserData(user);
  } else if (data.startsWith("delete_set_")) {
    const setName = data.replace("delete_set_", "");
    await bot.deleteMessage(chatId, query.message.message_id);
    const keyboard = {
      inline_keyboard: [
        [{ text: "Удалить 🗑️", callback_data: `confirm_delete_${setName}` }],
      ],
    };
    const sentMessage = await bot.sendMessage(
      chatId,
      `Ты точно хочешь удалить набор «${setName}»? 🤔`,
      {
        reply_markup: JSON.stringify(keyboard),
      }
    );
    user.lastRequestMessageId = sentMessage.message_id;
    await saveUserData(user);
  } else if (data.startsWith("confirm_delete_")) {
    const setName = data.replace("confirm_delete_", "");
    await deleteStickerSet(user, setName);
    await bot.deleteMessage(chatId, query.message.message_id);
    await updateUserCommands(chatId);
    const sentMessage = await sendInfo(chatId);
    user.infoBotMessageIds = [sentMessage.message_id];
    await saveUserData(user);
  } else if (data === "add_set") {
    await bot.deleteMessage(chatId, query.message.message_id);
    const sentMessage = await bot.sendMessage(
      chatId,
      "Напиши название для нового набора"
    );
    user.state = "waiting_for_set_name";
    user.lastRequestMessageId = sentMessage.message_id;
    await saveUserData(user);
  } else if (data === "add_more_stickerpack") {
    await bot.deleteMessage(chatId, query.message.message_id);
    const sentMessage = await bot.sendMessage(
      chatId,
      "Отправь стикер. Из этого стикерпака будет выбираться случайный стикер"
    );
    user.state = "waiting_for_sticker";
    user.lastRequestMessageId = sentMessage.message_id;
    await saveUserData(user);
  } else if (data === "confirm_reset") {
    try {
      await bot.deleteMessage(chatId, query.message.message_id);
    } catch (error) {}
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
  } else if (data === "more_fact") {
    await sendRandomFact(chatId);
  } else if (data.startsWith("reset_set_")) {
    const setName = data.replace("reset_set_", "");
    const set = user.stickerSets.find((s) => s.name === setName);
    if (set) {
      set.sentStickers = [];
      try {
        await bot.deleteMessage(chatId, query.message.message_id);
      } catch (error) {}
      const keyboard = {
        inline_keyboard: [
          [
            {
              text: "Случайный стикер",
              callback_data: `send_random_sticker_${setName}`,
            },
          ],
        ],
      };
      const sentMessage = await bot.sendMessage(
        chatId,
        `Список отправленных стикеров для набора «${setName}» сброшен 👍`,
        {
          reply_markup: JSON.stringify(keyboard),
        }
      );
      user.stickerMessageIds.push(sentMessage.message_id);
      await saveUserData(user);
    } else {
      const sentMessage = await bot.sendMessage(chatId, "Набор не найден");
      user.stickerMessageIds.push(sentMessage.message_id);
      await saveUserData(user);
    }
  } else if (data.startsWith("send_random_sticker_")) {
    const setName = data.replace("send_random_sticker_", "");
    await sendStickerFromCustomSet(bot, chatId, user, setName);
  }

  await bot.answerCallbackQuery(query.id);
});

bot.onText(/\/sticker/, async (msg) => {
  const chatId = msg.chat.id.toString();
  await resetUserStateWithDeletion(chatId);
  const user = await getUserData(chatId, msg);
  await deleteMessages(chatId, user.stickerMessageIds);
  user.stickerMessageIds = [msg.message_id];
  await sendStickerFromCustomSet(bot, chatId, user);
  await saveUserData(user);
});

bot.setMyCommands([
  { command: "/kitty", description: "🤗 Котик из случайного стикерпака" },
  { command: "/reset", description: "❌ Сброс отправленных стикеров" },
  { command: "/info", description: "📃 Инфа о стикерпаках" },
  { command: "/fact", description: "🧐 Случайный факт" },
  { command: "/hello", description: "👋 Познакомиться" },
]);

console.log("Бот запущен...");
