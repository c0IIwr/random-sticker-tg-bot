const { getUserData, saveUserData } = require("./userUtils");

let userStickerPacks = {};

async function loadStickerPack(bot, packName) {
  if (!userStickerPacks[packName]) {
    const stickerSet = await bot.getStickerSet(packName);
    userStickerPacks[packName] = stickerSet.stickers;
  }
  return userStickerPacks[packName];
}

async function addStickerSet(user, setName) {
  user.stickerSets.push({
    name: setName,
    packs: [],
    sentStickers: [],
  });
  user.lastCustomSet = setName;
  await saveUserData(user);
}

async function addStickerPackToSet(bot, user, setName, sticker) {
  const set = user.stickerSets.find((s) => s.name === setName);
  if (!set) return false;

  const packName = sticker.set_name;
  if (set.packs.includes(packName)) {
    return { alreadyExists: true, packName };
  }

  set.packs.push(packName);
  await loadStickerPack(bot, packName);
  await saveUserData(user);
  return { alreadyExists: false, packName };
}

async function selectStickerSet(user, setName) {
  if (setName === "Стикеры с котиками") {
    user.currentSet = setName;
  } else {
    const set = user.stickerSets.find((s) => s.name === setName);
    if (set) {
      user.currentSet = setName;
      user.lastCustomSet = setName;
    }
  }
  await saveUserData(user);
}

async function deleteStickerSet(user, setName) {
  const setIndex = user.stickerSets.findIndex((s) => s.name === setName);
  if (setIndex !== -1) {
    user.stickerSets.splice(setIndex, 1);
    if (user.lastCustomSet === setName) {
      user.lastCustomSet =
        user.stickerSets.length > 0 ? user.stickerSets[0].name : null;
    }
    user.currentSet = "Стикеры с котиками";
    await saveUserData(user);
  }
}

async function getSetStatistics(bot, user, allStickers) {
  const setName = user.currentSet;
  if (setName === "Стикеры с котиками") {
    const packCount = require("./stickerPacks").length;
    const stickerCount = allStickers.length;
    const sentCount = user.sentStickers.length;
    const remainingCount = stickerCount - sentCount;
    const percentageSent =
      stickerCount > 0 ? ((sentCount / stickerCount) * 100).toFixed(2) : 0;

    let message =
      `<b>"${setName}"</b>\n` +
      `<b>Всего стикерпаков:</b> ${packCount}\n` +
      `<b>Всего стикеров:</b> ${stickerCount}\n` +
      `<b>Отправлено стикеров:</b> ${sentCount} (${percentageSent}%)\n` +
      `<b>Осталось стикеров:</b> ${remainingCount}`;

    if (user.movieCount > 0) {
      message += `\n<b>Просмотрено мультиков:</b> ${user.movieCount}`;
    } else {
      message += `\n\n<i><tg-spoiler>Говорят, если закончатся стикеры, то покажут мультик 🤭</tg-spoiler></i>`;
    }
    return message;
  } else {
    const set = user.stickerSets.find((s) => s.name === setName);
    if (!set) return "Набор не найден";

    let totalStickers = 0;
    for (const pack of set.packs) {
      const stickers = await loadStickerPack(bot, pack);
      totalStickers += stickers.length;
    }
    const sentCount = set.sentStickers.length;
    const remainingCount = totalStickers - sentCount;
    const percentageSent =
      totalStickers > 0 ? ((sentCount / totalStickers) * 100).toFixed(2) : 0;

    return (
      `<b>"${setName}"</b>\n` +
      `<b>Всего стикерпаков:</b> ${set.packs.length}\n` +
      `<b>Всего стикеров:</b> ${totalStickers}\n` +
      `<b>Отправлено стикеров:</b> ${sentCount} (${percentageSent}%)\n` +
      `<b>Осталось стикеров:</b> ${remainingCount}`
    );
  }
}

async function sendStickerFromCustomSet(bot, chatId, user) {
  if (!user.lastCustomSet || user.stickerSets.length === 0) {
    const sentMessage = await bot.sendMessage(
      chatId,
      "У тебя нет своих наборов стикеров. Создай свой набор в /info."
    );
    user.stickerMessageIds.push(sentMessage.message_id);
    return;
  }

  const set = user.stickerSets.find((s) => s.name === user.lastCustomSet);
  if (!set || set.packs.length === 0) {
    const sentMessage = await bot.sendMessage(
      chatId,
      "В твоем последнем наборе нет стикерпаков."
    );
    user.stickerMessageIds.push(sentMessage.message_id);
    return;
  }

  let allStickersInSet = [];
  for (const pack of set.packs) {
    const stickers = await loadStickerPack(bot, pack);
    allStickersInSet = allStickersInSet.concat(stickers);
  }

  const availableStickers = allStickersInSet.filter(
    (sticker) => !set.sentStickers.includes(sticker.file_id)
  );

  if (availableStickers.length === 0) {
    const keyboard = {
      inline_keyboard: [
        [
          {
            text: "Начать сначала",
            callback_data: `reset_set_${set.name}`,
          },
        ],
      ],
    };
    const sentMessage = await bot.sendMessage(chatId, "Все стикеры кончились", {
      reply_markup: JSON.stringify(keyboard),
    });
    user.stickerMessageIds.push(sentMessage.message_id);
  } else {
    const randomIndex = Math.floor(Math.random() * availableStickers.length);
    const sticker = availableStickers[randomIndex];
    await bot.sendSticker(chatId, sticker.file_id);
    set.sentStickers.push(sticker.file_id);
    await saveUserData(user);
  }
}

module.exports = {
  addStickerSet,
  addStickerPackToSet,
  selectStickerSet,
  deleteStickerSet,
  getSetStatistics,
  sendStickerFromCustomSet,
  userStickerPacks,
};
