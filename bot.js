const express = require("express");
const TelegramBot = require("node-telegram-bot-api");

// Настройка бота
const token = process.env.TOKEN; // Токен бота из переменных окружения
const bot = new TelegramBot(token); // Создаём бота без polling

// Настройка сервера с помощью express
const server = express();
server.use(express.json()); // Для парсинга JSON-запросов от Telegram

// Установка вебхука
const webhookPath = `/bot${token}`;
const port = process.env.PORT || 3000;
const webhookUrl = `https://random-sticker-tg-bot.onrender.com${webhookPath}`; // Замените на ваш URL

bot
  .setWebHook(webhookUrl)
  .then(() => {
    console.log(`Вебхук установлен на ${webhookUrl}`);
  })
  .catch((error) => {
    console.error("Ошибка при установке вебхука:", error);
  });

// Обработка обновлений от Telegram
server.post(webhookPath, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200); // Отправляем Telegram подтверждение получения
});

// Запуск сервера
server.listen(port, () => {
  console.log(`Сервер запущен на порту ${port}`);
});

// Список стикерпаков
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
let sentStickers = new Set();

// Функция для загрузки стикеров
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

// Загружаем стикеры при старте
loadStickers();

// Обработка команды /sticker с try-catch
bot.onText(/\/sticker/, async (msg) => {
  try {
    const chatId = msg.chat.id;

    if (stickerPacks.length === 0) {
      bot.sendMessage(chatId, "Нет доступных стикерпаков!");
      return;
    }

    let availablePacks = stickerPacks.filter((pack) => {
      const stickers = allStickers.filter((s) => s.set_name === pack);
      const availableStickers = stickers.filter(
        (s) => !sentStickers.has(s.file_id)
      );
      return availableStickers.length > 0;
    });

    if (availablePacks.length === 0) {
      bot.sendMessage(chatId, "Все стикеры уже были отправлены!");
      return;
    }

    const randomPackIndex = Math.floor(Math.random() * availablePacks.length);
    const randomPack = availablePacks[randomPackIndex];

    const stickers = allStickers.filter((s) => s.set_name === randomPack);
    const availableStickers = stickers.filter(
      (s) => !sentStickers.has(s.file_id)
    );

    const randomIndex = Math.floor(Math.random() * availableStickers.length);
    const sticker = availableStickers[randomIndex];

    sentStickers.add(sticker.file_id);
    bot.sendSticker(chatId, sticker.file_id);
  } catch (error) {
    console.error("Ошибка в команде /sticker:", error);
    bot.sendMessage(msg.chat.id, "Произошла ошибка. Попробуйте позже.");
  }
});

// Обработка команды /reset с try-catch
bot.onText(/\/reset/, (msg) => {
  try {
    sentStickers.clear();
    bot.sendMessage(msg.chat.id, "Список отправленных стикеров сброшен!");
  } catch (error) {
    console.error("Ошибка в команде /reset:", error);
    bot.sendMessage(msg.chat.id, "Произошла ошибка. Попробуйте позже.");
  }
});

// Обработка команды /info с try-catch
bot.onText(/\/info/, (msg) => {
  try {
    const chatId = msg.chat.id;
    const packCount = stickerPacks.length;
    const stickerCount = allStickers.length;
    const sentCount = sentStickers.size;
    const remainingCount = stickerCount - sentCount;

    bot.sendMessage(
      chatId,
      `Всего стикерпаков: ${packCount}\n` +
        `Всего стикеров: ${stickerCount}\n` +
        `Отправлено стикеров: ${sentCount}\n` +
        `Осталось стикеров: ${remainingCount}`
    );
  } catch (error) {
    console.error("Ошибка в команде /info:", error);
    bot.sendMessage(msg.chat.id, "Произошла ошибка. Попробуйте позже.");
  }
});

// Установка команд в меню бота
bot.setMyCommands([
  {
    command: "/sticker",
    description: "Получить случайный стикер из случайного пака",
  },
  { command: "/reset", description: "Сбросить список отправленных стикеров" },
  { command: "/info", description: "Получить информацию о стикерпаках" },
]);

console.log("Бот запущен...");
