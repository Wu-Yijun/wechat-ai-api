import { readFileSync, writeFileSync } from "node:fs";
import { WeChatApi } from "../src/WechatAiApi.ts";

const bot = new WeChatApi();
const credentials = JSON.parse(readFileSync("./session.json", "utf-8"));
bot.loadCredentials(credentials);

const ret = await bot.messages.sendText("Hello, this is a first message from WeChatApi API!\n这是来自 WeChatApi API 的第一条消息！");

console.log("Send result(Response is always empty):", ret);