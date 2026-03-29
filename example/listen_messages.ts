import { readFileSync } from "node:fs";
import { WeChatApi } from "../src/WechatAiApi.ts";
import { inspect } from "node:util";

async function main() {
  const bot = new WeChatApi();
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
    const name = msg.fileName || `file_${Date.now()}`;
    console.log("保存到本地", await msg.saveToFile!(`./temp/${name}`));
  });

  bot.on("image", async (msg) => {
    console.log("收到一张图片", msg);
    const name = msg.fileName || `image_${Date.now()}.jpg`;
    console.log("保存到本地", await msg.saveToFile!(`./temp/${name}`));
  });

  bot.on("video", async (msg) => {
    console.log("收到一个视频", msg);
    const name = msg.fileName || `video_${Date.now()}.mp4`;
    console.log("保存到本地", await msg.saveToFile!(`./temp/${name}`));
  });

  bot.on("voice", async (msg) => {
    console.log("收到一段语音", msg);
    const name = msg.fileName || `voice_${Date.now()}.wav`;
    console.log("保存到本地", await msg.saveToFile!(`./temp/${name}`));
  });
}

main();