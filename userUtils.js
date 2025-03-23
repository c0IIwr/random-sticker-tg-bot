const db = require("./db");
const facts = require("./facts.js");

async function getUserData(chatId, msg = {}) {
  const usersCollection = await db.getUsersCollection();
  let user = await usersCollection.findOne({ chatId: chatId.toString() });

  const defaultUser = {
    chatId: chatId.toString(),
    sentStickers: [],
    stickerCount: 0,
    resetCount: 0,
    movieCount: 0,
    sentMovies: [],
    allStickersSent: false,
    firstSent: null,
    lastSent: null,
    firstName: "",
    lastName: "",
    username: "",
    languageCode: "",
    chatType: "",
    chatTitle: "",
    chatUsername: "",
    name: null,
    morningTime: null,
    eveningTime: null,
    timezone: null,
    state: null,
    sentFacts: [],
    factCount: 0,
    morningGreetingIndex: 0,
    eveningGreetingIndex: 0,
    helloMessages: [],
    timeRequestMessages: [],
    userTimeInputMessages: [],
    lastHelloCommandId: null,
    lastRequestMessageId: null,
    startMessageIds: [],
    resetMessageIds: [],
    infoMessageIds: [],
    userCommandMessages: [],
    startBotMessageIds: [],
    resetBotMessageIds: [],
    infoBotMessageIds: [],
  };

  if (!user) {
    user = { ...defaultUser };
    user.firstName = msg.from?.first_name || "";
    user.lastName = msg.from?.last_name || "";
    user.username = msg.from?.username || "";
    user.languageCode = msg.from?.language_code || "";
    user.chatType = msg.chat?.type || "";
    user.chatTitle = msg.chat?.type !== "private" ? msg.chat?.title || "" : "";
    user.chatUsername = msg.chat?.username || "";
    await usersCollection.insertOne(user);
  } else {
    for (const key in defaultUser) {
      if (!(key in user) || user[key] === null) {
        user[key] = defaultUser[key];
      }
    }
    if (msg.from || msg.chat) {
      user.firstName = msg.from?.first_name || user.firstName;
      user.lastName = msg.from?.last_name || user.lastName;
      user.username = msg.from?.username || user.username;
      user.languageCode = msg.from?.language_code || user.languageCode;
      user.chatType = msg.chat?.type || user.chatType;
      user.chatTitle =
        msg.chat?.type !== "private"
          ? msg.chat?.title || user.chatTitle
          : user.chatTitle;
      user.chatUsername = msg.chat?.username || user.chatUsername;
    }
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
        sentFacts: user.sentFacts,
        factCount: user.factCount,
        morningGreetingIndex: user.morningGreetingIndex,
        eveningGreetingIndex: user.eveningGreetingIndex,
        helloMessages: user.helloMessages,
        timeRequestMessages: user.timeRequestMessages,
        userTimeInputMessages: user.userTimeInputMessages,
        lastHelloCommandId: user.lastHelloCommandId,
        lastRequestMessageId: user.lastRequestMessageId,
        startMessageIds: user.startMessageIds,
        resetMessageIds: user.resetMessageIds,
        infoMessageIds: user.infoMessageIds,
        userCommandMessages: user.userCommandMessages,
        startBotMessageIds: user.startBotMessageIds,
        resetBotMessageIds: user.resetBotMessageIds,
        infoBotMessageIds: user.infoBotMessageIds,
      },
    }
  );
}

async function resetUserState(chatId) {
  const user = await getUserData(chatId);
  user.state = null;
  await saveUserData(user);
}

async function getAndMarkRandomFact(user) {
  let availableFacts = facts.filter(
    (fact) => !user.sentFacts.includes(fact.number)
  );
  if (availableFacts.length === 0) {
    user.sentFacts = [];
    availableFacts = facts;
  }
  const randomIndex = Math.floor(Math.random() * availableFacts.length);
  const fact = availableFacts[randomIndex];
  user.sentFacts.push(fact.number);
  user.factCount = (user.factCount || 0) + 1;
  await saveUserData(user);
  return `<b>Интересный факт #${fact.number} 🧐</b>\n${fact.fact}`;
}

module.exports = {
  getUserData,
  saveUserData,
  resetUserState,
  getAndMarkRandomFact,
};
