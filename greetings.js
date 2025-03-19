const moment = require("moment-timezone");
const cron = require("node-cron");

function setupGreetings(bot, usersCollection, allStickers) {
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
        morningTimezone: null,
        eveningTime: null,
        eveningTimezone: null,
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
          morningTimezone: user.morningTimezone,
          eveningTime: user.eveningTime,
          eveningTimezone: user.eveningTimezone,
          state: user.state,
        },
      }
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
      user.state = "waiting_for_name";
      await saveUserData(user);
    } else {
      let message = `Привет, ${user.name}! 🤗`;
      let keyboard;

      if (!user.morningTime || !user.eveningTime) {
        message += `\nХочешь, чтобы я делал твой день чуточку лучше? Я могу желать тебе доброго утра для бодрого старта и спокойной ночи для сладких снов. Как тебе идея? ☺️`;
        keyboard = {
          inline_keyboard: [
            [
              { text: "Время просыпаться 🌞", callback_data: "set_morning" },
              { text: "Время ложиться спать 🌙", callback_data: "set_evening" },
            ],
          ],
        };
      } else {
        const morningTimezone = user.morningTimezone || "UTC+3";
        const eveningTimezone = user.eveningTimezone || "UTC+3";

        const now = moment().tz(morningTimezone);
        const morningTimeToday = moment
          .tz(user.morningTime, "HH:mm", morningTimezone)
          .startOf("day")
          .add(parseInt(user.morningTime.split(":")[0]), "hours")
          .add(parseInt(user.morningTime.split(":")[1]), "minutes");
        if (now.isAfter(morningTimeToday)) {
          morningTimeToday.add(1, "day");
        }
        const morningDuration = moment.duration(morningTimeToday.diff(now));
        const morningHours = Math.floor(morningDuration.asHours());
        const morningMinutes = Math.floor(morningDuration.asMinutes()) % 60;

        const eveningNow = moment().tz(eveningTimezone);
        const eveningTimeToday = moment
          .tz(user.eveningTime, "HH:mm", eveningTimezone)
          .startOf("day")
          .add(parseInt(user.eveningTime.split(":")[0]), "hours")
          .add(parseInt(user.eveningTime.split(":")[1]), "minutes");
        if (eveningNow.isAfter(eveningTimeToday)) {
          eveningTimeToday.add(1, "day");
        }
        const eveningDuration = moment.duration(
          eveningTimeToday.diff(eveningNow)
        );
        const eveningHours = Math.floor(eveningDuration.asHours());
        const eveningMinutes = Math.floor(eveningDuration.asMinutes()) % 60;

        message += `\nУтро запланировано на ${user.morningTime} ${morningTimezone} (осталось ${morningHours}ч ${morningMinutes}м)`;
        message += `\nНочь запланирована на ${user.eveningTime} ${eveningTimezone} (осталось ${eveningHours}ч ${eveningMinutes}м)`;
        keyboard = {
          inline_keyboard: [
            [
              {
                text: "Сбросить время на утро 🌞",
                callback_data: "reset_morning",
              },
              {
                text: "Сбросить время на ночь 🌙",
                callback_data: "reset_evening",
              },
            ],
          ],
        };
      }

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

        const message = `Привет, ${user.name}! 🤗\nХочешь, чтобы я делал твой день чуточку лучше? Я могу желать тебе доброго утра для бодрого старта и спокойной ночи для сладких снов. Как тебе идея? ☺️`;
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
          const timezone = match[3] || "UTC+3";

          if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
            const timeStr = `${hours.toString().padStart(2, "0")}:${minutes
              .toString()
              .padStart(2, "0")}`;

            if (user.state === "waiting_for_morning_time") {
              user.morningTime = timeStr;
              user.morningTimezone = timezone;
              user.state = null;
            } else {
              user.eveningTime = timeStr;
              user.eveningTimezone = timezone;
              user.state = null;
            }
            await saveUserData(user);

            const isMorning =
              user.state === null && user.morningTime === timeStr;
            const tz = isMorning ? user.morningTimezone : user.eveningTimezone;
            const time = isMorning ? user.morningTime : user.eveningTime;

            const now = moment().tz(tz);
            const scheduledTimeToday = moment
              .tz(time, "HH:mm", tz)
              .startOf("day")
              .add(hours, "hours")
              .add(minutes, "minutes");
            if (now.isAfter(scheduledTimeToday)) {
              scheduledTimeToday.add(1, "day");
            }
            const duration = moment.duration(scheduledTimeToday.diff(now));
            const hoursLeft = Math.floor(duration.asHours());
            const minutesLeft = Math.floor(duration.asMinutes()) % 60;

            const period = isMorning ? "Утро" : "Ночь";
            let message = `${period} запланировано на ${time} ${tz} (осталось ${hoursLeft}ч ${minutesLeft}м)`;
            let keyboard;

            if (user.morningTime && user.eveningTime) {
              const otherTime = isMorning ? user.eveningTime : user.morningTime;
              const otherTz = isMorning
                ? user.eveningTimezone
                : user.morningTimezone;
              const otherPeriod = isMorning ? "Ночь" : "Утро";
              message += `\n${otherPeriod} запланировано на ${otherTime} ${otherTz}`;
              keyboard = {
                inline_keyboard: [
                  [
                    {
                      text: "Сбросить время на утро 🌞",
                      callback_data: "reset_morning",
                    },
                    {
                      text: "Сбросить время на ночь 🌙",
                      callback_data: "reset_evening",
                    },
                  ],
                ],
              };
            } else {
              keyboard = {
                inline_keyboard: [
                  [
                    {
                      text: isMorning
                        ? "Сбросить время на утро 🌞"
                        : "Время просыпаться 🌞",
                      callback_data: isMorning
                        ? "reset_morning"
                        : "set_morning",
                    },
                    {
                      text: isMorning
                        ? "Время ложиться спать 🌙"
                        : "Сбросить время на ночь 🌙",
                      callback_data: isMorning
                        ? "set_evening"
                        : "reset_evening",
                    },
                  ],
                ],
              };
            }

            await bot.sendMessage(chatId, message, {
              reply_markup: JSON.stringify(keyboard),
            });
          } else {
            await bot.sendMessage(
              chatId,
              "Неверный формат времени. Введите время в формате HH:MM, например, 08:00"
            );
          }
        } else {
          await bot.sendMessage(
            chatId,
            "Неверный формат времени. Введите время в формате HH:MM, например, 08:00"
          );
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
        "Введите время для утреннего приветствия в формате HH:MM, например, 08:00. Можно указать часовой пояс, например, UTC+10 (по умолчанию UTC+3)."
      );
      user.state = "waiting_for_morning_time";
      await saveUserData(user);
    } else if (data === "set_evening") {
      await bot.sendMessage(
        chatId,
        "Введите время для вечернего приветствия в формате HH:MM, например, 22:00. Можно указать часовой пояс, например, UTC+10 (по умолчанию UTC+3)."
      );
      user.state = "waiting_for_evening_time";
      await saveUserData(user);
    } else if (data === "reset_morning" || data === "reset_evening") {
      const isMorning = data === "reset_morning";
      if (isMorning) {
        user.morningTime = null;
        user.morningTimezone = null;
      } else {
        user.eveningTime = null;
        user.eveningTimezone = null;
      }
      await saveUserData(user);

      let message = `Привет, ${user.name}! 🤗`;
      let keyboard;

      if (!user.morningTime && !user.eveningTime) {
        message += `\nХочешь, чтобы я делал твой день чуточку лучше? Я могу желать тебе доброго утра для бодрого старта и спокойной ночи для сладких снов. Как тебе идея? ☺️`;
        keyboard = {
          inline_keyboard: [
            [
              { text: "Время просыпаться 🌞", callback_data: "set_morning" },
              { text: "Время ложиться спать 🌙", callback_data: "set_evening" },
            ],
          ],
        };
      } else {
        const remainingTime = isMorning ? user.eveningTime : user.morningTime;
        const remainingTz = isMorning
          ? user.eveningTimezone
          : user.morningTimezone;
        const period = isMorning ? "Ночь" : "Утро";

        const now = moment().tz(remainingTz);
        const scheduledTimeToday = moment
          .tz(remainingTime, "HH:mm", remainingTz)
          .startOf("day")
          .add(parseInt(remainingTime.split(":")[0]), "hours")
          .add(parseInt(remainingTime.split(":")[1]), "minutes");
        if (now.isAfter(scheduledTimeToday)) {
          scheduledTimeToday.add(1, "day");
        }
        const duration = moment.duration(scheduledTimeToday.diff(now));
        const hoursLeft = Math.floor(duration.asHours());
        const minutesLeft = Math.floor(duration.asMinutes()) % 60;

        message += `\n${period} запланировано на ${remainingTime} ${remainingTz} (осталось ${hoursLeft}ч ${minutesLeft}м)`;
        keyboard = {
          inline_keyboard: [
            [
              {
                text: isMorning
                  ? "Время просыпаться 🌞"
                  : "Сбросить время на утро 🌞",
                callback_data: isMorning ? "set_morning" : "reset_morning",
              },
              {
                text: isMorning
                  ? "Сбросить время на ночь 🌙"
                  : "Время ложиться спать 🌙",
                callback_data: isMorning ? "reset_evening" : "set_evening",
              },
            ],
          ],
        };
      }

      await bot.sendMessage(chatId, message, {
        reply_markup: JSON.stringify(keyboard),
      });
    }

    await bot.answerCallbackQuery(query.id);
  });

  cron.schedule("* * * * *", async () => {
    const users = await usersCollection.find({}).toArray();
    const now = moment();

    for (const user of users) {
      if (user.morningTime && user.morningTimezone) {
        const morningTime = moment.tz(
          user.morningTime,
          "HH:mm",
          user.morningTimezone
        );
        if (
          now.tz(user.morningTimezone).format("HH:mm") ===
          morningTime.format("HH:mm")
        ) {
          await bot.sendMessage(user.chatId, "Доброе утро! 🌞");
          const randomSticker =
            allStickers[Math.floor(Math.random() * allStickers.length)];
          await bot.sendSticker(user.chatId, randomSticker.file_id);
        }
      }

      if (user.eveningTime && user.eveningTimezone) {
        const eveningTime = moment.tz(
          user.eveningTime,
          "HH:mm",
          user.eveningTimezone
        );
        if (
          now.tz(user.eveningTimezone).format("HH:mm") ===
          eveningTime.format("HH:mm")
        ) {
          await bot.sendMessage(user.chatId, "Спокойной ночи! 🌙");
          const randomSticker =
            allStickers[Math.floor(Math.random() * allStickers.length)];
          await bot.sendSticker(user.chatId, randomSticker.file_id);
        }
      }
    }
  });
}

module.exports = setupGreetings;
