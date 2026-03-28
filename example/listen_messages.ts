import { readFileSync } from "node:fs";
import { WeChatBot } from "../src/WechatAiApi.ts";
import { inspect } from "node:util";

async function main() {
  const bot = new WeChatBot();
  const credentials = JSON.parse(readFileSync("./session.json", "utf-8"));
  bot.loadCredentials(credentials);
  // await bot.login(); 

  bot.startPolling();

  bot.on("text", async (msg) => {
    console.log(`收到来自 ${msg.fromUserId} 的消息:`, msg);
    console.log("items", inspect(msg.raw.item_list, { depth: Infinity, colors: true }));
    if (msg.text === "服务器状态") {
      // 携带 contextToken 进行“精准回复”（微信中会显示为引用回复）
      await bot.messages.sendText("CPU: 12%, 内存: 45%", { 
        contextToken: msg.contextToken 
      });
    }
  });

  bot.on("file", async (msg) => {
    console.log("收到一个文件", msg);
  });

  bot.on("image", async (msg) => {
    console.log("收到一张图片", msg);
  });

  bot.on("video", async (msg) => {
    console.log("收到一个视频", msg);
  });

  bot.on("voice", async (msg) => {
    console.log("收到一段语音", msg);
  });
}

main();