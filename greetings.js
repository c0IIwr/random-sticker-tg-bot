const moment = require("moment-timezone");
const cron = require("node-cron");
const db = require("./db");
const {
  getUserData,
  saveUserData,
  resetUserState,
  getAndMarkRandomFact,
} = require("./userUtils");
const nameVariants = require("./nameVariants");

const morningGreetings = [
  "Доброе утречко, {name}! 🌞 Надеюсь, твое утро начинается с хорошего настроения!",
  "С добрым утром, {name}! ☀️ Пусть твой день будет полон радости!",
  "Привет, {name}! 😊 Желаю тебе замечательного дня!",
  "Утро доброе, {name}! 🌅 Пусть сегодня сбудутся твои мечты!",
  "Доброго утра, {name}! 🌼 Желаю тебе новых впечатлений!",
  "Привет, {name}! 😄 Желаю тебе отличного настроения!",
  "С новым днем, {name}! 🍀 Удачи во всех твоих делах!",
  "Утро доброе, {name}! 🌈 Пусть твой день будет ярким и веселым!",
  "Привет, {name}! 🌺 Желаю тебе чувствовать себя прекрасно сегодня!",
];

const eveningGreetings = [
  "Спокойной ночки, {name}! 🌙 Пусть твои сны будут сладкими!",
  "Сладких снов, {name}! 🌟 Отдыхай хорошо!",
  "Доброй ночи, {name}! 🌌 Желаю тебе крепкого и спокойного сна!",
  "Приятных снов, {name}! 🌠 Пусть звезды освещают твой путь!",
  "Споки-ноки, {name}! 🌃 Завтра будет новый замечательный день!",
  "Спокойной ночи, {name}! 😴 Желаю тебе хорошего отдыха!",
  "Доброй ночи, {name}! 💤 Пусть твой сон будет крепким!",
  "Приятных снов, {name}! ✨ Желаю тебе сладких снов!",
  "Споки-ноки, {name}! 🌙 Отдыхай и набирайся сил!",
];

function setupGreetings(
  bot,
  allStickers,
  updateUserCommands,
  updateUserDataInSheet
) {
  function convertToOffset(timezone) {
    if (timezone.startsWith("UTC")) {
      const offset = timezone.slice(3);
      const sign = offset[0];
      const hours = parseInt(offset.slice(1), 10);
      return `${sign}${hours.toString().padStart(2, "0")}:00`;
    }
    return timezone;
  }

  function formatTimezone(tz) {
    return tz === "+03:00" ? "" : ` [UTC${tz}]`;
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

  function formatRemainingTime(hours, minutes) {
    if (hours > 0) {
      return `${hours}ч ${minutes}м`;
    } else {
      return `${minutes}м`;
    }
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
    await updateUserCommands(chatId);

    user.helloMessages = user.helloMessages || [];
    user.timeRequestMessages = user.timeRequestMessages || [];
    user.userTimeInputMessages = user.userTimeInputMessages || [];

    if (user.lastHelloCommandId) {
      try {
        await bot.deleteMessage(chatId, user.lastHelloCommandId);
      } catch (error) {
        console.error(
          `Не удалось удалить сообщение ${user.lastHelloCommandId}: ${error.message}`
        );
      }
    }
    user.lastHelloCommandId = msg.message_id;

    if (user.helloMessages.length > 0) {
      for (const messageId of user.helloMessages) {
        try {
          await bot.deleteMessage(chatId, messageId);
        } catch (error) {
          console.error(
            `Не удалось удалить сообщение ${messageId}: ${error.message}`
          );
        }
      }
      user.helloMessages = [];
    }

    await resetUserState(chatId);

    if (!user.name) {
      const sentMessage = await bot.sendMessage(
        chatId,
        "Приветик 👋😜 я Пупсик 🤗 А как тебя зовут?"
      );
      user.lastRequestMessageId = sentMessage.message_id;
      user.helloMessages.push(sentMessage.message_id);
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
          const remainingText = formatRemainingTime(
            remaining.hoursLeft,
            remaining.minutesLeft
          );
          message += `\nУтро запланировано на ${user.morningTime}${tzText} (осталось ${remainingText})`;
        } else {
          message += `\nУтро не запланировано`;
        }

        if (user.eveningTime) {
          const remaining = calculateRemainingTime(user, "evening");
          const remainingText = formatRemainingTime(
            remaining.hoursLeft,
            remaining.minutesLeft
          );
          message += `\nНочь запланирована на ${user.eveningTime}${tzText} (осталось ${remainingText})`;
        } else {
          message += `\nНочь не запланирована`;
        }
      }

      const keyboard = getKeyboard(user, true);
      const sentMessage = await bot.sendMessage(chatId, message, {
        reply_markup: JSON.stringify(keyboard),
      });
      user.helloMessages.push(sentMessage.message_id);
      await saveUserData(user);
    }
  });

  bot.on("message", async (msg) => {
    if (msg.text && !msg.text.startsWith("/")) {
      const chatId = msg.chat.id.toString();
      const user = await getUserData(chatId, msg);
      const text = msg.text.trim();

      user.helloMessages = user.helloMessages || [];
      user.timeRequestMessages = user.timeRequestMessages || [];
      user.userTimeInputMessages = user.userTimeInputMessages || [];

      if (user.state === "waiting_for_name") {
        if (/котик/i.test(text)) {
          return;
        }

        const inputName = text.trim();
        user.name = inputName;
        await saveUserData(user);

        await bot.deleteMessage(chatId, msg.message_id);

        if (user.helloMessages.length > 0) {
          for (const messageId of user.helloMessages) {
            try {
              await bot.deleteMessage(chatId, messageId);
            } catch (error) {
              console.error(
                `Не удалось удалить сообщение ${messageId}: ${error.message}`
              );
            }
          }
          user.helloMessages = [];
        }

        const inputNameLower = inputName.toLowerCase();
        let foundVariants = [];
        let fullNameMatches = [];

        for (const fullName in nameVariants) {
          const fullNameLower = fullName.toLowerCase();
          const variants = nameVariants[fullName]
            .split(",")
            .map((v) => v.trim());
          const variantsLower = variants.map((v) => v.toLowerCase());

          if (
            fullNameLower === inputNameLower ||
            variantsLower.includes(inputNameLower)
          ) {
            fullNameMatches.push(fullName);
            foundVariants.push(fullName, ...variants);
          }
        }

        if (fullNameMatches.length > 0) {
          const message = `Приятно познакомиться, ${inputName}! 🤗\nКак тебе больше нравится?`;
          foundVariants = [...new Set(foundVariants)].filter(
            (variant) => variant.toLowerCase() !== inputNameLower
          );
          const keyboard = {
            inline_keyboard: [
              [{ text: `Оставить ${inputName}`, callback_data: "keep_name" }],
            ],
          };

          for (let i = 0; i < foundVariants.length; i += 4) {
            const row = foundVariants.slice(i, i + 4).map((variant) => ({
              text: variant,
              callback_data: `choose_name_${variant}`,
            }));
            keyboard.inline_keyboard.push(row);
          }

          const sentMessage = await bot.sendMessage(chatId, message, {
            reply_markup: JSON.stringify(keyboard),
          });
          user.helloMessages.push(sentMessage.message_id);
          user.state = "choosing_name";
          await saveUserData(user);
        } else {
          user.state = null;
          await saveUserData(user);
          await updateUserCommands(chatId);
          const message = `Приятно познакомиться, ${inputName}! 🤗\nХочешь, чтобы я делал твой день чуточку лучше? Я могу желать тебе доброго утра для бодрого старта и спокойной ночи для сладких снов. Как тебе идейка? ☺️`;
          const keyboard = {
            inline_keyboard: [
              [
                { text: "Время просыпаться 🌞", callback_data: "set_morning" },
                {
                  text: "Время ложиться спать 🌙",
                  callback_data: "set_evening",
                },
              ],
            ],
          };
          const sentMessage = await bot.sendMessage(chatId, message, {
            reply_markup: JSON.stringify(keyboard),
          });
          user.helloMessages.push(sentMessage.message_id);
          await saveUserData(user);
        }
      } else if (
        user.state === "waiting_for_morning_time" ||
        user.state === "waiting_for_evening_time"
      ) {
        user.userTimeInputMessages.push(msg.message_id);

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

            if (user.timeRequestMessages.length > 0) {
              for (const messageId of user.timeRequestMessages) {
                try {
                  await bot.deleteMessage(chatId, messageId);
                } catch (error) {
                  console.error(
                    `Не удалось удалить сообщение ${messageId}: ${error.message}`
                  );
                }
              }
              user.timeRequestMessages = [];
            }

            if (user.userTimeInputMessages.length > 0) {
              for (const messageId of user.userTimeInputMessages) {
                try {
                  await bot.deleteMessage(chatId, messageId);
                } catch (error) {
                  console.error(
                    `Не удалось удалить сообщение ${messageId}: ${error.message}`
                  );
                }
              }
              user.userTimeInputMessages = [];
            }

            await saveUserData(user);

            const tzText = formatTimezone(offset);
            const remaining = calculateRemainingTime(
              user,
              period.toLowerCase() === "утро" ? "morning" : "evening"
            );
            const remainingText = formatRemainingTime(
              remaining.hoursLeft,
              remaining.minutesLeft
            );
            const verb = period === "Утро" ? "запланировано" : "запланирована";
            let message = `${period} ${verb} на ${timeStr}${tzText} (осталось ${remainingText})`;

            const otherPeriod = period === "Утро" ? "Ночь" : "Утро";
            const otherTime =
              period === "Утро" ? user.eveningTime : user.morningTime;
            if (otherTime) {
              const otherRemaining = calculateRemainingTime(
                user,
                period === "Утро" ? "evening" : "morning"
              );
              const otherRemainingText = formatRemainingTime(
                otherRemaining.hoursLeft,
                otherRemaining.minutesLeft
              );
              const otherVerb =
                otherPeriod === "Утро" ? "запланировано" : "запланирована";
              message += `\n${otherPeriod} ${otherVerb} на ${otherTime}${tzText} (осталось ${otherRemainingText})`;
            } else {
              const otherVerb =
                otherPeriod === "Утро"
                  ? "не запланировано"
                  : "не запланирована";
              message += `\n${otherPeriod} ${otherVerb}`;
            }

            const keyboard = getKeyboard(user, false);
            const sentMessage = await bot.sendMessage(chatId, message, {
              reply_markup: JSON.stringify(keyboard),
            });
            user.helloMessages.push(sentMessage.message_id);
            await saveUserData(user);
          } else {
            const sentMessage = await bot.sendMessage(
              chatId,
              "Укажи время, например, 23:59 или 23:59 UTC+10"
            );
            user.timeRequestMessages.push(sentMessage.message_id);
            await saveUserData(user);
          }
        } else {
          const sentMessage = await bot.sendMessage(
            chatId,
            "Укажи время, например, 23:59 или 23:59 UTC+10"
          );
          user.timeRequestMessages.push(sentMessage.message_id);
          await saveUserData(user);
        }
      }
    }
  });

  bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id.toString();
    const messageId = query.message.message_id;
    const data = query.data;
    const user = await getUserData(chatId);

    user.helloMessages = user.helloMessages || [];
    user.timeRequestMessages = user.timeRequestMessages || [];

    if (data.startsWith("choose_name_")) {
      const chosenName = data.replace("choose_name_", "");
      user.name = chosenName;
      user.state = null;
      await saveUserData(user);
      await updateUserCommands(chatId);
      await bot.deleteMessage(chatId, messageId);
      const message = `Отлично, ${chosenName}! 🤗\nХочешь, чтобы я делал твой день чуточку лучше? Я могу желать тебе доброго утра для бодрого старта и спокойной ночи для сладких снов. Как тебе идейка? ☺️`;
      const keyboard = {
        inline_keyboard: [
          [
            { text: "Время просыпаться 🌞", callback_data: "set_morning" },
            { text: "Время ложиться спать 🌙", callback_data: "set_evening" },
          ],
        ],
      };
      const sentMessage = await bot.sendMessage(chatId, message, {
        reply_markup: JSON.stringify(keyboard),
      });
      user.helloMessages.push(sentMessage.message_id);
      await saveUserData(user);
    } else if (data === "keep_name") {
      user.state = null;
      await saveUserData(user);
      await updateUserCommands(chatId);
      await bot.deleteMessage(chatId, messageId);
      const message = `Отлично, ${user.name}! 🤗\nХочешь, чтобы я делал твой день чуточку лучше? Я могу желать тебе доброго утра для бодрого старта и спокойной ночи для сладких снов. Как тебе идейка? ☺️`;
      const keyboard = {
        inline_keyboard: [
          [
            { text: "Время просыпаться 🌞", callback_data: "set_morning" },
            { text: "Время ложиться спать 🌙", callback_data: "set_evening" },
          ],
        ],
      };
      const sentMessage = await bot.sendMessage(chatId, message, {
        reply_markup: JSON.stringify(keyboard),
      });
      user.helloMessages.push(sentMessage.message_id);
      await saveUserData(user);
    } else if (data === "set_morning") {
      await bot.deleteMessage(chatId, messageId);
      const sentMessage = await bot.sendMessage(
        chatId,
        "Во сколько тебе пожелать доброго утра? Укажи время, например, 08:00. Часовой пояс по умолчанию UTC+3, но можно указать свой, например, 08:00 UTC+10."
      );
      user.lastRequestMessageId = sentMessage.message_id;
      user.helloMessages.push(sentMessage.message_id);
      user.timeRequestMessages.push(sentMessage.message_id);
      user.state = "waiting_for_morning_time";
      await saveUserData(user);
    } else if (data === "set_evening") {
      await bot.deleteMessage(chatId, messageId);
      const sentMessage = await bot.sendMessage(
        chatId,
        "Во сколько тебе пожелать спокойной ночи? Укажи время, например, 22:00. Часовой пояс по умолчанию UTC+3, но можно указать свой, например, 22:00 UTC+10."
      );
      user.lastRequestMessageId = sentMessage.message_id;
      user.helloMessages.push(sentMessage.message_id);
      user.timeRequestMessages.push(sentMessage.message_id);
      user.state = "waiting_for_evening_time";
      await saveUserData(user);
    } else if (data === "reset_morning") {
      user.morningTime = null;
      await saveUserData(user);
      await bot.deleteMessage(chatId, messageId);
      let message = "Время на утро сброшено 👍";
      if (user.eveningTime) {
        const remaining = calculateRemainingTime(user, "evening");
        const remainingText = formatRemainingTime(
          remaining.hoursLeft,
          remaining.minutesLeft
        );
        const tzText = formatTimezone(user.timezone || "+03:00");
        message += `\nНочь запланирована на ${user.eveningTime}${tzText} (осталось ${remainingText})`;
      } else {
        message += `\nНочь не запланирована`;
      }

      const keyboard = getKeyboard(user, false);
      const sentMessage = await bot.sendMessage(chatId, message, {
        reply_markup: JSON.stringify(keyboard),
      });
      user.helloMessages.push(sentMessage.message_id);
      await saveUserData(user);
    } else if (data === "reset_evening") {
      user.eveningTime = null;
      await saveUserData(user);
      await bot.deleteMessage(chatId, messageId);
      let message = "Время на ночь сброшено 👍";
      if (user.morningTime) {
        const remaining = calculateRemainingTime(user, "morning");
        const remainingText = formatRemainingTime(
          remaining.hoursLeft,
          remaining.minutesLeft
        );
        const tzText = formatTimezone(user.timezone || "+03:00");
        message += `\nУтро запланировано на ${user.morningTime}${tzText} (осталось ${remainingText})`;
      } else {
        message += `\nУтро не запланировано`;
      }

      const keyboard = getKeyboard(user, false);
      const sentMessage = await bot.sendMessage(chatId, message, {
        reply_markup: JSON.stringify(keyboard),
      });
      user.helloMessages.push(sentMessage.message_id);
      await saveUserData(user);
    } else if (data === "forget_name") {
      user.name = null;
      user.morningTime = null;
      user.eveningTime = null;
      user.state = "waiting_for_name";
      await saveUserData(user);
      await updateUserCommands(chatId);
      await bot.deleteMessage(chatId, messageId);
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
      const sentMessage = await bot.sendMessage(chatId, message, {
        reply_markup: JSON.stringify(keyboard),
      });
      user.helloMessages.push(sentMessage.message_id);
      await saveUserData(user);
    } else if (data === "introduce") {
      await bot.deleteMessage(chatId, messageId);
      const sentMessage = await bot.sendMessage(
        chatId,
        "Приветик 👋😜 я Пупсик 🤗 А как тебя зовут?"
      );
      user.lastRequestMessageId = sentMessage.message_id;
      user.helloMessages.push(sentMessage.message_id);
      user.state = "waiting_for_name";
      await saveUserData(user);
    }

    await bot.answerCallbackQuery(query.id);
  });

  cron.schedule("* * * * *", async () => {
    const usersCollection = await db.getUsersCollection();
    const users = await usersCollection.find({}).toArray();
    for (const user of users) {
      const tz = user.timezone || "+03:00";
      const nowInUserOffset = moment().utcOffset(tz);

      if (
        user.morningTime &&
        nowInUserOffset.format("HH:mm") === user.morningTime
      ) {
        const greetingTemplate = morningGreetings[user.morningGreetingIndex];
        const greeting = greetingTemplate.replace("{name}", user.name);
        user.morningGreetingIndex =
          (user.morningGreetingIndex + 1) % morningGreetings.length;
        await saveUserData(user);
        const factMessage = await getAndMarkRandomFact(user);
        const greetingMessage = `${greeting}\n\n<tg-spoiler>${factMessage}</tg-spoiler>`;
        await bot.sendMessage(user.chatId, greetingMessage, {
          parse_mode: "HTML",
        });
        updateUserDataInSheet(user).catch((error) => {
          console.error("Ошибка при обновлении данных в Google Sheets:", error);
        });
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
        const greetingTemplate = eveningGreetings[user.eveningGreetingIndex];
        const greeting = greetingTemplate.replace("{name}", user.name);
        user.eveningGreetingIndex =
          (user.eveningGreetingIndex + 1) % eveningGreetings.length;
        await saveUserData(user);
        const factMessage = await getAndMarkRandomFact(user);
        const greetingMessage = `${greeting}\n\n<tg-spoiler>${factMessage}</tg-spoiler>`;
        await bot.sendMessage(user.chatId, greetingMessage, {
          parse_mode: "HTML",
        });
        updateUserDataInSheet(user).catch((error) => {
          console.error("Ошибка при обновлении данных в Google Sheets:", error);
        });
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
