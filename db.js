const { MongoClient } = require("mongodb");

const mongoUrl = process.env.MONGO_URL;
const client = new MongoClient(mongoUrl);

let db;

async function connectToDb() {
  if (db) return db;
  try {
    await client.connect();
    console.log("Подключено к MongoDB");
    db = client.db("stickerBotDb");
    return db;
  } catch (error) {
    console.error("Ошибка подключения к MongoDB:", error);
    throw error;
  }
}

module.exports = {
  connectToDb,
  getUsersCollection: async () => {
    const db = await connectToDb();
    return db.collection("users");
  },
};
