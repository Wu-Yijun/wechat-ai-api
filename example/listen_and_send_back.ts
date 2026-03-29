import { readFileSync, writeFileSync } from "node:fs";
import { inspect } from "node:util";
import { WeChatApi } from "../src/WechatAiApi.ts";

async function main() {
  const bot = new WeChatApi();
  // 或者手动控制一些细节
  // const bot = new WeChatApi({
  //   appId: "bot",
  //   version: "2.1.1",
  //   baseUrl: "https://ilinkai.weixin.qq.com",
  //   autoDownloadMedia: true,
  // });

  try {
    // 本地加载
    const credentials = JSON.parse(readFileSync("./session.json", "utf-8"));
    bot.loadCredentials(credentials);
  } catch (_) {
    // 重新登录获取新的凭证
    const newCredentials = await bot.login();
    writeFileSync("./session.json", JSON.stringify(newCredentials));

    // 也可以在登录时提供回调函数，实时更新凭证
    // const credentials = await bot.login({
    //   onQrCode: (qr) => {
    //     // 这里可以自定义二维码的展示方式，比如用第三方库生成图片，或者在 Web 页面上展示。
    //     console.log("\nPlease scan the QR code: ", qr.qrcodeUrl);
    //   },
    //   onStatusChange: (status) => {
    //     // 这里可以根据不同状态更新 UI，比如显示不同的提示信息，或者在 Web 页面上展示不同的组件。
    //     console.log(`[Status Change] ${status.status}: ${status.message}`);
    //   }
    // });
  }

  bot.startPolling();

  bot.on("text", async (msg) => {
    console.log(`收到来自 ${msg.fromUserId} 的消息:`, msg.text);
    // console.log("items", inspect(msg.raw.item_list, { depth: Infinity, colors: true }));
    if (msg.text === "服务器状态") {
      await bot.messages.sendText("CPU: 12%, 内存: 45%", {
        contextToken: msg.contextToken
      });
    } else {
      await bot.messages.sendText(`你刚才说了: ${msg.text}`, {
        contextToken: msg.contextToken
      });
    }
  });

  bot.on("file", async (msg) => {
    console.log("收到一个文件:", msg.fileName);
    const name = msg.fileName || `file_${Date.now()}`;
    console.log("保存到本地", await msg.saveToFile!(`./temp/${name}`));
    console.log("发送回去", await bot.messages.sendFile(`./temp/${name}`, { contextToken: msg.contextToken, caption: "这是你刚才发的文件哦" }));
  });

  bot.on("image", async (msg) => {
    console.log("收到一张图片, 大小:", msg.raw.item_list[0].image_item.hd_size);
    const name = `image_${Date.now()}.jpg`;
    console.log("保存到本地", await msg.saveToFile!(`./temp/${name}`));
    console.log("发送回去", await bot.messages.sendImage(`./temp/${name}`, { contextToken: msg.contextToken }));
  });

  bot.on("video", async (msg) => {
    console.log("收到一个视频, 时长:", msg.raw.item_list[0].video_item.play_length);
    const name = `video_${Date.now()}.mp4`;
    console.log("保存到本地", await msg.saveToFile!(`./temp/${name}`));
    console.log("发送回去", await bot.messages.sendVideo(`./temp/${name}`, { contextToken: msg.contextToken }));
  });

  bot.on("voice", async (msg) => {
    console.log("收到一段语音, 时长:", msg.raw.item_list[0].voice_item.playtime);
    const name = `voice_${Date.now()}.wav`;
    console.log("保存到本地", await msg.saveToFile!(`./temp/${name}`));
    // TODO: 可能将来会支持 sendVoice 方法，目前先用 sendFile 发送回去
    console.log("发送回去", await bot.messages.sendFile(`./temp/${name}`, { contextToken: msg.contextToken }));
  });
}

main();