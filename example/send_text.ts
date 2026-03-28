import { readFileSync, writeFileSync } from "node:fs";
import { WeChatBot } from "../src/WechatAiApi.ts";

const bot = new WeChatBot();
const credentials = JSON.parse(readFileSync("./session.json", "utf-8"));
bot.loadCredentials(credentials);

const ret = await bot.messages.sendText("Hello, this is a first message from WeChatBot API!\n这是来自 WeChatBot API 的第一条消息！");

console.log("Send result(Response is always empty):", ret);