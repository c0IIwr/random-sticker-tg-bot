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
        const morningOffset = user.morningTimezone || "+03:00";
        const eveningOffset = user.eveningTimezone || "+03:00";

        const now = moment().utcOffset(morningOffset);
        const morningTimeToday = moment()
          .utcOffset(morningOffset)
          .startOf("day")
          .hours(parseInt(user.morningTime.split(":")[0]))
          .minutes(parseInt(user.morningTime.split(":")[1]));
        if (now.isAfter(morningTimeToday)) {
          morningTimeToday.add(1, "day");
        }
        const morningDuration = moment.duration(morningTimeToday.diff(now));
        const morningHours = Math.floor(morningDuration.asHours());
        const morningMinutes = Math.floor(morningDuration.asMinutes()) % 60;

        const eveningNow = moment().utcOffset(eveningOffset);
        const eveningTimeToday = moment()
          .utcOffset(eveningOffset)
          .startOf("day")
          .hours(parseInt(user.eveningTime.split(":")[0]))
          .minutes(parseInt(user.eveningTime.split(":")[1]));
        if (eveningNow.isAfter(eveningTimeToday)) {
          eveningTimeToday.add(1, "day");
        }
        const eveningDuration = moment.duration(
          eveningTimeToday.diff(eveningNow)
        );
        const eveningHours = Math.floor(eveningDuration.asHours());
        const eveningMinutes = Math.floor(eveningDuration.asMinutes()) % 60;

        message += `\nУтро запланировано на ${user.morningTime} (UTC${morningOffset}) (осталось ${morningHours}ч ${morningMinutes}м)`;
        message += `\nНочь запланирована на ${user.eveningTime} (UTC${eveningOffset}) (осталось ${eveningHours}ч ${eveningMinutes}м)`;
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
          const timezoneInput = match[3] || "UTC+3";
          const offset = convertToOffset(timezoneInput);

          if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
            const timeStr = `${hours.toString().padStart(2, "0")}:${minutes
              .toString()
              .padStart(2, "0")}`;
            if (user.state === "waiting_for_morning_time") {
              user.morningTime = timeStr;
              user.morningTimezone = offset;
              user.state = null;
            } else {
              user.eveningTime = timeStr;
              user.eveningTimezone = offset;
              user.state = null;
            }
            await saveUserData(user);

            const isMorning = user.morningTime === timeStr;
            const tz = isMorning ? user.morningTimezone : user.eveningTimezone;
            const time = isMorning ? user.morningTime : user.eveningTime;

            const now = moment().utcOffset(tz);
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

            const period = isMorning ? "Утро" : "Ночь";
            let message = `${period} запланировано на ${time} (UTC${tz}) (осталось ${hoursLeft}ч ${minutesLeft}м)`;
            let keyboard;

            if (user.morningTime && user.eveningTime) {
              const otherTime = isMorning ? user.eveningTime : user.morningTime;
              const otherTz = isMorning
                ? user.eveningTimezone
                : user.morningTimezone;
              const otherPeriod = isMorning ? "Ночь" : "Утро";
              message += `\n${otherPeriod} запланировано на ${otherTime} (UTC${otherTz})`;
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

        const now = moment().utcOffset(remainingTz);
        const scheduledTimeToday = moment()
          .utcOffset(remainingTz)
          .startOf("day")
          .hours(parseInt(remainingTime.split(":")[0]))
          .minutes(parseInt(remainingTime.split(":")[1]));
        if (now.isAfter(scheduledTimeToday)) {
          scheduledTimeToday.add(1, "day");
        }
        const duration = moment.duration(scheduledTimeToday.diff(now));
        const hoursLeft = Math.floor(duration.asHours());
        const minutesLeft = Math.floor(duration.asMinutes()) % 60;

        message += `\n${period} запланировано на ${remainingTime} (UTC${remainingTz}) (осталось ${hoursLeft}ч ${minutesLeft}м)`;
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
    for (const user of users) {
      if (user.morningTime && user.morningTimezone) {
        const nowInUserOffset = moment().utcOffset(user.morningTimezone);
        if (nowInUserOffset.format("HH:mm") === user.morningTime) {
          await bot.sendMessage(user.chatId, "Доброе утро! 🌞");
          if (allStickers.length > 0) {
            const randomSticker =
              allStickers[Math.floor(Math.random() * allStickers.length)];
            try {
              await bot.sendSticker(user.chatId, randomSticker.file_id);
            } catch (error) {
              console.error(
                `Ошибка отправки стикера для ${user.chatId}:`,
                error
              );
            }
          } else {
            console.log("Стикеры ещё не загружены");
          }
        }
      }

      if (user.eveningTime && user.eveningTimezone) {
        const nowInUserOffset = moment().utcOffset(user.eveningTimezone);
        if (nowInUserOffset.format("HH:mm") === user.eveningTime) {
          await bot.sendMessage(user.chatId, "Спокойной ночи! 🌙");
          if (allStickers.length > 0) {
            const randomSticker =
              allStickers[Math.floor(Math.random() * allStickers.length)];
            try {
              await bot.sendSticker(user.chatId, randomSticker.file_id);
            } catch (error) {
              console.error(
                `Ошибка отправки стикера для ${user.chatId}:`,
                error
              );
            }
          } else {
            console.log("Стикеры ещё не загружены");
          }
        }
      }
    }
  });
}

module.exports = setupGreetings;
