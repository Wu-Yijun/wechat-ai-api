import fs from "node:fs";
import { WeChatApi } from "../src/WechatAiApi.ts";

const bot = new WeChatApi({
  appId: "bot",
  version: "2.1.1",
  baseUrl: "https://ilinkai.weixin.qq.com",
});

async function startBot() {
  const credentials = await bot.login({
    onQrCode: (qr) => {
      // 这里可以自定义二维码的展示方式，比如用第三方库生成图片，或者在 Web 页面上展示。
      console.log("\nPlease scan the QR code: ", qr.qrcodeUrl);
    },
    onStatusChange: (status) => {
      // 这里可以根据不同状态更新 UI，比如显示不同的提示信息，或者在 Web 页面上展示不同的组件。
      console.log(`[Status Change] ${status.status}: ${status.message}`);
    }
  });

  // 验证凭证是否过期
  const isValid = await bot.verifyCredentials();
  if (!isValid) {
    console.error("Login failed or credentials expired. Please try again.");
    return;
  }

  // 可以将新获取的凭证保存下来
  fs.writeFileSync("./session.json", JSON.stringify(credentials));
}

await startBot();