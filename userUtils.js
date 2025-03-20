const db = require("./db");

async function getUserData(chatId, msg = {}) {
  const usersCollection = await db.getUsersCollection();
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
  } else if (msg.from || msg.chat) {
    user.firstName = msg.from?.first_name || user.firstName || "";
    user.lastName = msg.from?.last_name || user.lastName || "";
    user.username = msg.from?.username || user.username || "";
    user.languageCode = msg.from?.language_code || user.languageCode || "";
    user.chatType = msg.chat?.type || user.chatType || "";
    user.chatTitle =
      msg.chat?.type !== "private"
        ? msg.chat?.title || user.chatTitle || ""
        : user.chatTitle || "";
    user.chatUsername = msg.chat?.username || user.chatUsername || "";
    await saveUserData(user);
  }
  return user;
}

async function saveUserData(user) {
  const usersCollection = await db.getUsersCollection();
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

async function resetUserState(chatId) {
  const user = await getUserData(chatId);
  user.state = null;
  await saveUserData(user);
}

module.exports = { getUserData, saveUserData, resetUserState };
