const moment = require("moment-timezone");
const cron = require("node-cron");

function setupGreetings(bot, usersCollection, allStickers) {
  function convertToOffset(timezone) {
    if (timezone.startsWith("UTC")) {
      const offset = timezone.slice(3);
      const sign = offset[0];
      const hours = parseInt(offset.slice(1), 10);
      return `${sign}${hours.toString().padStart(2, "0")}:00`;
    }
    return timezone;
  }

  async function getUserData(chatId, msg = {}) {
    let user = await usersCollection.findOne({ chatId: chatId.toString() });
    if (!user) {
      user = {
        chatId: chatId.toString(),
        sentStickers: [],
        stickerCount: 0,
        resetCount: 0,
        movieCount: 0,
        sentMovies: [],
        allStickersSent: false,
        firstSent: null,
        lastSent: null,
        firstName: msg.from?.first_name || "",
        lastName: msg.from?.last_name || "",
        username: msg.from?.username || "",
        languageCode: msg.from?.language_code || "",
        chatType: msg.chat?.type || "",
        chatTitle: msg.chat?.type !== "private" ? msg.chat?.title || "" : "",
        chatUsername: msg.chat?.username || "",
        name: null,
        morningTime: null,
        eveningTime: null,
        timezone: null,
        state: null,
      };
      await usersCollection.insertOne(user);
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
          movieCount: user.movieCount,
          sentMovies: user.sentMovies,
          allStickersSent: user.allStickersSent,
          firstSent: user.firstSent,
          lastSent: user.lastSent,
          firstName: user.firstName,
          lastName: user.lastName,
          username: user.username,
          languageCode: user.languageCode,
          chatType: user.chatType,
          chatTitle: user.chatTitle,
          chatUsername: user.chatUsername,
          name: user.name,
          morningTime: user.morningTime,
          eveningTime: user.eveningTime,
          timezone: user.timezone,
          state: user.state,
        },
      }
    );
  }

  function formatTimezone(tz) {
    return tz === "+03:00" ? "" : ` (UTC${tz})`;
  }

  function calculateRemainingTime(user, period) {
    const tz = user.timezone || "+03:00";
    const now = moment().utcOffset(tz);
    const time = period === "morning" ? user.morningTime : user.eveningTime;
    if (!time) return null;

    const [hours, minutes] = time.split(":").map(Number);
    const scheduledTimeToday = moment()
      .utcOffset(tz)
      .startOf("day")
      .hours(hours)
      .minutes(minutes);
    if (now.isAfter(scheduledTimeToday)) {
      scheduledTimeToday.add(1, "day");
    }
    const duration = moment.duration(scheduledTimeToday.diff(now));
    const hoursLeft = Math.floor(duration.asHours());
    const minutesLeft = Math.floor(duration.asMinutes()) % 60;
    return { hoursLeft, minutesLeft };
  }

  function getKeyboard(user, includeForgetName = false) {
    const buttons = [
      [
        user.morningTime
          ? {
              text: "Сбросить время на утро 🌞",
              callback_data: "reset_morning",
            }
          : { text: "Время просыпаться 🌞", callback_data: "set_morning" },
        user.eveningTime
          ? {
              text: "Сбросить время на ночь 🌙",
              callback_data: "reset_evening",
            }
          : {
              text: "Время ложиться спать 🌙",
              callback_data: "set_evening",
            },
      ],
    ];
    if (includeForgetName) {
      buttons.push([
        {
          text: "Забыть имя 🙈",
          callback_data: "forget_name",
        },
      ]);
    }
    return { inline_keyboard: buttons };
  }

  bot.onText(/\/hello/, async (msg) => {
    const chatId = msg.chat.id.toString();
    const user = await getUserData(chatId, msg);

    if (!user.name) {
      await bot.sendMessage(
        chatId,
        "Приветик 👋😜 я Пупсик 🤗 А как тебя зовут?"
      );
      user.state = "waiting_for_name";
      await saveUserData(user);
    } else {
      let message = `Привет, ${user.name}! 🤗`;
      const tz = user.timezone || "+03:00";
      const tzText = formatTimezone(tz);

      if (!user.morningTime && !user.eveningTime) {
        message += `\nХочешь, чтобы я делал твой день чуточку лучше? Я могу желать тебе доброго утра для бодрого старта и спокойной ночи для сладких снов. Как тебе идейка? ☺️`;
      } else {
        if (user.morningTime) {
          const remaining = calculateRemainingTime(user, "morning");
          message += `\nУтро запланировано на ${user.morningTime}${tzText} (осталось ${remaining.hoursLeft}ч ${remaining.minutesLeft}м)`;
        } else {
          message += `\nУтро не запланировано`;
        }

        if (user.eveningTime) {
          const remaining = calculateRemainingTime(user, "evening");
          message += `\nНочь запланирована на ${user.eveningTime}${tzText} (осталось ${remaining.hoursLeft}ч ${remaining.minutesLeft}м)`;
        } else {
          message += `\nНочь не запланирована`;
        }
      }

      const keyboard = getKeyboard(user, true);
      await bot.sendMessage(chatId, message, {
        reply_markup: JSON.stringify(keyboard),
      });
    }
  });

  bot.on("message", async (msg) => {
    if (msg.text && !msg.text.startsWith("/")) {
      const chatId = msg.chat.id.toString();
      const user = await getUserData(chatId, msg);
      const text = msg.text.trim();

      if (user.state === "waiting_for_name") {
        user.name = text;
        user.state = null;
        await saveUserData(user);
        const message = `Привет, ${user.name}! 🤗\nХочешь, чтобы я делал твой день чуточку лучше? Я могу желать тебе доброго утра для бодрого старта и спокойной ночи для сладких снов. Как тебе идейка? ☺️`;
        const keyboard = {
          inline_keyboard: [
            [
              { text: "Время просыпаться 🌞", callback_data: "set_morning" },
              { text: "Время ложиться спать 🌙", callback_data: "set_evening" },
            ],
          ],
        };
        await bot.sendMessage(chatId, message, {
          reply_markup: JSON.stringify(keyboard),
        });
      } else if (
        user.state === "waiting_for_morning_time" ||
        user.state === "waiting_for_evening_time"
      ) {
        const timeRegex = /^(\d{1,2}):(\d{2})(?:\s*(UTC[+-]\d+))?$/;
        const match = text.match(timeRegex);

        if (match) {
          const hours = parseInt(match[1], 10);
          const minutes = parseInt(match[2], 10);
          const timezoneInput = match[3];
          let offset = user.timezone || "+03:00";

          if (timezoneInput) {
            offset = convertToOffset(timezoneInput);
            user.timezone = offset;
          }

          if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
            const timeStr = `${hours.toString().padStart(2, "0")}:${minutes
              .toString()
              .padStart(2, "0")}`;
            const period =
              user.state === "waiting_for_morning_time" ? "Утро" : "Ночь";
            if (user.state === "waiting_for_morning_time") {
              user.morningTime = timeStr;
            } else {
              user.eveningTime = timeStr;
            }
            user.state = null;
            await saveUserData(user);

            const tzText = formatTimezone(offset);
            const remaining = calculateRemainingTime(
              user,
              period.toLowerCase() === "утро" ? "morning" : "evening"
            );
            const verb = period === "Утро" ? "запланировано" : "запланирована";
            let message = `${period} ${verb} на ${timeStr}${tzText} (осталось ${remaining.hoursLeft}ч ${remaining.minutesLeft}м)`;

            const otherPeriod = period === "Утро" ? "Ночь" : "Утро";
            const otherTime =
              period === "Утро" ? user.eveningTime : user.morningTime;
            if (otherTime) {
              const otherRemaining = calculateRemainingTime(
                user,
                period === "Утро" ? "evening" : "morning"
              );
              const otherVerb =
                otherPeriod === "Утро" ? "запланировано" : "запланирована";
              message += `\n${otherPeriod} ${otherVerb} на ${otherTime}${tzText} (осталось ${otherRemaining.hoursLeft}ч ${otherRemaining.minutesLeft}м)`;
            } else {
              const otherVerb =
                otherPeriod === "Утро"
                  ? "не запланировано"
                  : "не запланирована";
              message += `\n${otherPeriod} ${otherVerb}`;
            }

            const keyboard = getKeyboard(user, false);
            await bot.sendMessage(chatId, message, {
              reply_markup: JSON.stringify(keyboard),
            });
          } else {
            await bot.sendMessage(chatId, "Укажи время, например, 23:59");
          }
        } else {
          await bot.sendMessage(chatId, "Укажи время, например, 23:59");
        }
      }
    }
  });

  bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id.toString();
    const data = query.data;
    const user = await getUserData(chatId);

    if (data === "set_morning") {
      await bot.sendMessage(
        chatId,
        "Во сколько тебе пожелать доброго утра? Укажи время, например, 08:00. Часовой пояс по умолчанию UTC+3, но можно указать свой, например, 08:00 UTC+10."
      );
      user.state = "waiting_for_morning_time";
      await saveUserData(user);
    } else if (data === "set_evening") {
      await bot.sendMessage(
        chatId,
        "Во сколько тебе пожелать спокойной ночи? Укажи время, например, 22:00. Часовой пояс по умолчанию UTC+3, но можно указать свой, например, 22:00 UTC+10."
      );
      user.state = "waiting_for_evening_time";
      await saveUserData(user);
    } else if (data === "reset_morning") {
      user.morningTime = null;
      await saveUserData(user);

      let message = "Время на утро сброшено";
      if (user.eveningTime) {
        const remaining = calculateRemainingTime(user, "evening");
        const tzText = formatTimezone(user.timezone || "+03:00");
        message += `\nНочь запланирована на ${user.eveningTime}${tzText} (осталось ${remaining.hoursLeft}ч ${remaining.minutesLeft}м)`;
      } else {
        message += `\nНочь не запланирована`;
      }

      const keyboard = getKeyboard(user, false);
      await bot.sendMessage(chatId, message, {
        reply_markup: JSON.stringify(keyboard),
      });
    } else if (data === "reset_evening") {
      user.eveningTime = null;
      await saveUserData(user);

      let message = "Время на ночь сброшено";
      if (user.morningTime) {
        const remaining = calculateRemainingTime(user, "morning");
        const tzText = formatTimezone(user.timezone || "+03:00");
        message += `\nУтро запланировано на ${user.morningTime}${tzText} (осталось ${remaining.hoursLeft}ч ${remaining.minutesLeft}м)`;
      } else {
        message += `\nУтро не запланировано`;
      }

      const keyboard = getKeyboard(user, false);
      await bot.sendMessage(chatId, message, {
        reply_markup: JSON.stringify(keyboard),
      });
    } else if (data === "forget_name") {
      user.name = null;
      user.morningTime = null;
      user.eveningTime = null;
      user.state = "waiting_for_name";
      await saveUserData(user);
      const message = "Ты кто? 🤨";
      const keyboard = {
        inline_keyboard: [
          [
            {
              text: "Познакомиться 👋",
              callback_data: "introduce",
            },
          ],
        ],
      };
      await bot.sendMessage(chatId, message, {
        reply_markup: JSON.stringify(keyboard),
      });
    } else if (data === "introduce") {
      await bot.sendMessage(
        chatId,
        "Приветик 👋😜 я Пупсик 🤗 А как тебя зовут?"
      );
      user.state = "waiting_for_name";
      await saveUserData(user);
    }

    await bot.answerCallbackQuery(query.id);
  });

  cron.schedule("* * * * *", async () => {
    const users = await usersCollection.find({}).toArray();
    for (const user of users) {
      const tz = user.timezone || "+03:00";
      const nowInUserOffset = moment().utcOffset(tz);

      if (
        user.morningTime &&
        nowInUserOffset.format("HH:mm") === user.morningTime
      ) {
        await bot.sendMessage(user.chatId, `Доброе утречко, ${user.name}! 🌞`);
        const randomSticker =
          allStickers[Math.floor(Math.random() * allStickers.length)];
        try {
          await bot.sendSticker(user.chatId, randomSticker.file_id);
        } catch (error) {
          console.error(`Ошибка отправки стикера для ${user.chatId}:`, error);
        }
      }

      if (
        user.eveningTime &&
        nowInUserOffset.format("HH:mm") === user.eveningTime
      ) {
        await bot.sendMessage(user.chatId, `Спокойной ночки, ${user.name}! 🌙`);
        const randomSticker =
          allStickers[Math.floor(Math.random() * allStickers.length)];
        try {
          await bot.sendSticker(user.chatId, randomSticker.file_id);
        } catch (error) {
          console.error(`Ошибка отправки стикера для ${user.chatId}:`, error);
        }
      }
    }
  });
}

module.exports = setupGreetings;
