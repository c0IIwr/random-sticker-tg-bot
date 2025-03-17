const schedule = require("node-schedule");

module.exports = (bot, usersCollection, allStickers) => {
  async function getUserData(chatId, msg = {}) {
    let user = await usersCollection.findOne({ chatId: chatId.toString() });
    if (!user) {
      user = {
        chatId: chatId.toString(),
        name: null,
        morningTime: null,
        nightTime: null,
        timezone: "UTC+3",
        waitingForName: false,
        waitingForTime: null,
      };
      await usersCollection.insertOne(user);
    }
    return user;
  }

  async function saveUserData(user) {
    await usersCollection.updateOne(
      { chatId: user.chatId },
      { $set: user },
      { upsert: true }
    );
  }

  bot.onText(/\/hello/, async (msg) => {
    const chatId = msg.chat.id.toString();
    const user = await getUserData(chatId, msg);

    if (!user.name) {
      await bot.sendMessage(
        chatId,
        "Приветик 👋😜 я Пупсик 🤗 А как тебя зовут?"
      );
      user.waitingForName = true;
      await saveUserData(user);
    } else {
      let message = `Привет, ${user.name} 😊`;
      let buttons = [];

      if (user.morningTime) {
        message += `\nУтро запланировано на ${user.morningTime}!`;
        buttons.push({
          text: "Сбросить время на утро",
          callback_data: "reset_morning",
        });
      } else {
        message += "\nХочешь, чтобы я желал тебе доброго утра? 😇";
        buttons.push({ text: "Утро 🌞", callback_data: "set_morning" });
      }

      if (user.nightTime) {
        message += `\nНочь запланирована на ${user.nightTime}!`;
        buttons.push({
          text: "Сбросить время на ночь",
          callback_data: "reset_night",
        });
      } else {
        message += "\nХочешь, чтобы я желал тебе спокойной ночи? 😇";
        buttons.push({ text: "Ночь 🌙", callback_data: "set_night" });
      }

      const keyboard = {
        inline_keyboard: [buttons],
      };

      await bot.sendMessage(chatId, message, {
        reply_markup: JSON.stringify(keyboard),
      });
    }
  });

  bot.on("message", async (msg) => {
    const chatId = msg.chat.id.toString();
    const user = await getUserData(chatId, msg);

    if (user.waitingForName) {
      user.name = msg.text.trim();
      user.waitingForName = false;
      await saveUserData(user);
      const keyboard = {
        inline_keyboard: [
          [{ text: "Утро 🌞", callback_data: "set_morning" }],
          [{ text: "Ночь 🌙", callback_data: "set_night" }],
        ],
      };
      await bot.sendMessage(
        chatId,
        `Приятно познакомиться, ${user.name}! 😊\nХочешь, чтобы я желал тебе доброго утра или спокойной ночи? 😇`,
        { reply_markup: JSON.stringify(keyboard) }
      );
    } else if (user.waitingForTime) {
      const text = msg.text.trim();
      const timeRegex = /^(\d{2}:\d{2})(?:\s*(UTC[+-]\d+))?$/;
      const match = text.match(timeRegex);

      if (match) {
        const time = match[1];
        const timezone = match[2] || "UTC+3";
        const type = user.waitingForTime;

        if (type === "утро") {
          user.morningTime = time;
        } else {
          user.nightTime = time;
        }
        user.timezone = timezone;
        user.waitingForTime = null;
        await saveUserData(user);
        await scheduleUserMessages(user);

        const keyboard = {
          inline_keyboard: [
            [
              {
                text: `Сбросить время на ${type}`,
                callback_data: `reset_${type === "утро" ? "morning" : "night"}`,
              },
            ],
          ],
        };
        await bot.sendMessage(
          chatId,
          `${
            type.charAt(0).toUpperCase() + type.slice(1)
          } запланировано на ${time}!`,
          { reply_markup: JSON.stringify(keyboard) }
        );
      } else {
        await bot.sendMessage(
          chatId,
          'Неверный формат времени. Введите в формате "HH:MM", например, "08:00". Можете указать часовой пояс, например, "08:00 UTC+10".'
        );
      }
    }
  });

  bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id.toString();
    const data = query.data;
    const user = await getUserData(chatId);

    if (data === "set_morning" || data === "set_night") {
      const type = data === "set_morning" ? "утро" : "ночь";
      await bot.sendMessage(
        chatId,
        `Введите время для ${type} в формате "HH:MM" (например, "08:00"). По умолчанию часовой пояс UTC+3, но вы можете указать другой, добавив, например, "UTC+10".`
      );
      user.waitingForTime = type;
      await saveUserData(user);
    } else if (data === "reset_morning" || data === "reset_night") {
      const type = data === "reset_morning" ? "утро" : "ночь";
      if (type === "утро") {
        user.morningTime = null;
      } else {
        user.nightTime = null;
      }
      await saveUserData(user);
      await bot.sendMessage(chatId, `Заменить время на ${type}`);
      user.waitingForTime = type;
      await saveUserData(user);
    }

    await bot.answerCallbackQuery(query.id);
  });

  async function scheduleUserMessages(user) {
    if (user.morningTime) {
      const [hour, minute] = user.morningTime.split(":").map(Number);
      schedule.scheduleJob({ hour, minute }, async () => {
        await bot.sendMessage(user.chatId, "Доброго утра! 🌞");
        const randomSticker =
          allStickers[Math.floor(Math.random() * allStickers.length)];
        await bot.sendSticker(user.chatId, randomSticker.file_id);
      });
    }
    if (user.nightTime) {
      const [hour, minute] = user.nightTime.split(":").map(Number);
      schedule.scheduleJob({ hour, minute }, async () => {
        await bot.sendMessage(user.chatId, "Доброй ночи! 🌙");
        const randomSticker =
          allStickers[Math.floor(Math.random() * allStickers.length)];
        await bot.sendSticker(user.chatId, randomSticker.file_id);
      });
    }
  }

  async function initSchedules() {
    const users = await usersCollection.find({}).toArray();
    users.forEach((user) => {
      if (user.morningTime || user.nightTime) {
        scheduleUserMessages(user);
      }
    });
  }

  initSchedules();
};
