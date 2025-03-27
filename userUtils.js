const db = require("./db");
const facts = require("./facts.js");

async function getUserData(chatId, msg = {}) {
  const usersCollection = await db.getUsersCollection();
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
    stickerSets: [],
    currentSet: "Стикеры с котиками",
    lastCustomSet: null,
    stickerMessageIds: [],
    lastCommandMessages: {},
  };

  const update = {
    $setOnInsert: defaultUser,
    $set: {
      firstName: msg.from?.first_name || "",
      lastName: msg.from?.last_name || "",
      username: msg.from?.username || "",
      languageCode: msg.from?.language_code || "",
      chatType: msg.chat?.type || "",
      chatTitle: msg.chat?.type !== "private" ? msg.chat?.title || "" : "",
      chatUsername: msg.chat?.username || "",
    },
  };

  const result = await usersCollection.findOneAndUpdate(
    { chatId: chatId.toString() },
    update,
    { upsert: true, returnDocument: "after" }
  );

  let user = result.value;

  for (const key in defaultUser) {
    if (!(key in user)) {
      user[key] = defaultUser[key];
    }
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
        stickerSets: user.stickerSets,
        currentSet: user.currentSet,
        lastCustomSet: user.lastCustomSet,
        stickerMessageIds: user.stickerMessageIds,
        lastCommandMessages: user.lastCommandMessages,
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
