const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const { MongoClient } = require("mongodb");
const { google } = require("googleapis");
const fs = require("fs");

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

const credentials = JSON.parse(fs.readFileSync("credentials.json"));
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

async function getUserData(chatId) {
  let user = await usersCollection.findOne({ chatId: chatId.toString() });
  if (!user) {
    user = {
      chatId: chatId.toString(),
      sentStickers: [],
      stickerCount: 0,
      resetCount: 0,
      firstSent: null,
      lastSent: null,
      username: "N/A",
      firstName: "N/A",
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
        firstSent: user.firstSent,
        lastSent: user.lastSent,
        username: user.username,
        firstName: user.firstName,
      },
    }
  );
}

async function updateUserDataInSheet(user) {
  const chatId = user.chatId;
  const username = user.username || "N/A";
  const firstName = user.firstName || "N/A";
  const stickerCount = user.stickerCount || 0;
  const resetCount = user.resetCount || 0;
  const firstSent = user.firstSent ? user.firstSent.toISOString() : "N/A";
  const lastSent = user.lastSent ? user.lastSent.toISOString() : "N/A";

  const range = "Sheet1!A:A";
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });
  const rows = response.data.values || [];
  const rowIndex = rows.findIndex((row) => row[0] === chatId);

  if (rowIndex === -1) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "Sheet1",
      valueInputOption: "RAW",
      resource: {
        values: [
          [
            chatId,
            firstName,
            username,
            stickerCount,
            resetCount,
            firstSent,
            lastSent,
          ],
        ],
      },
    });
  } else {
    const updateRange = `Sheet1!A${rowIndex + 1}:G${rowIndex + 1}`;
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: updateRange,
      valueInputOption: "RAW",
      resource: {
        values: [
          [
            chatId,
            firstName,
            username,
            stickerCount,
            resetCount,
            firstSent,
            lastSent,
          ],
        ],
      },
    });
  }
}

bot.onText(/\/sticker/, async (msg) => {
  try {
    const chatId = msg.chat.id.toString();
    const user = await getUserData(chatId);

    if (!user.firstSent) user.firstSent = new Date();
    user.lastSent = new Date();
    user.username = msg.from.username || "N/A";
    user.firstName = msg.from.first_name || "N/A";
    user.stickerCount = (user.stickerCount || 0) + 1;

    if (stickerPacks.length === 0) {
      bot.sendMessage(chatId, "Нет доступных стикерпаков!");
      return;
    }

    let availablePacks = stickerPacks.filter((pack) => {
      const stickers = allStickers.filter((s) => s.set_name === pack);
      const availableStickers = stickers.filter(
        (s) => !user.sentStickers.includes(s.file_id)
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
      (s) => !user.sentStickers.includes(s.file_id)
    );

    const randomIndex = Math.floor(Math.random() * availableStickers.length);
    const sticker = availableStickers[randomIndex];

    user.sentStickers.push(sticker.file_id);
    await saveUserData(user);
    await updateUserDataInSheet(user);
    bot.sendSticker(chatId, sticker.file_id);
  } catch (error) {
    console.error("Ошибка в команде /sticker:", error);
    bot.sendMessage(msg.chat.id, "Произошла ошибка. Попробуйте позже.");
  }
});

bot.onText(/\/reset/, async (msg) => {
  try {
    const chatId = msg.chat.id.toString();
    const user = await getUserData(chatId);
    user.sentStickers = [];
    user.resetCount = (user.resetCount || 0) + 1;
    await saveUserData(user);
    await updateUserDataInSheet(user);
    bot.sendMessage(chatId, "Список отправленных стикеров сброшен!");
  } catch (error) {
    console.error("Ошибка в команде /reset:", error);
    bot.sendMessage(msg.chat.id, "Произошла ошибка. Попробуйте позже.");
  }
});

bot.onText(/\/info/, async (msg) => {
  try {
    const chatId = msg.chat.id.toString();
    const user = await getUserData(chatId);
    const packCount = stickerPacks.length;
    const stickerCount = allStickers.length;
    const sentCount = user.sentStickers.length;
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

bot.setMyCommands([
  {
    command: "/sticker",
    description: "Получить случайный стикер из случайного пака",
  },
  { command: "/reset", description: "Сбросить список отправленных стикеров" },
  { command: "/info", description: "Получить информацию о стикерпаках" },
]);

console.log("Бот запущен...");
