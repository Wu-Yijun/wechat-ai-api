import { readFileSync, writeFileSync } from "node:fs";
import { WeChatBot } from "../src/WechatAiApi.ts";

const bot = new WeChatBot();
const credentials = JSON.parse(readFileSync("./session.json", "utf-8"));
bot.loadCredentials(credentials);

// const ret = await bot.messages.sendFile(import.meta.filename, {caption: "[Optional] Caption text for the file.\nThis file is the example/send_text.ts file itself."});
const ret = await bot.messages.sendImage(import.meta.dirname + "/example.png", {caption: "[Optional] Caption text for the file.\nThis file is the example/send_text.ts file itself."});

console.log("Send result:", ret);

