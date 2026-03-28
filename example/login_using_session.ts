import fs from "node:fs";
import { WeChatBot } from "../src/WechatAiApi.ts";

const bot = new WeChatBot();

async function startBot() {
  // 1. 尝试从本地文件加载凭证
  if (fs.existsSync("./session.json")) {
    const credentials = JSON.parse(fs.readFileSync("./session.json", "utf-8"));
    bot.loadCredentials(credentials);
    
    // 2. 验证凭证是否过期
    const isValid = await bot.verifyCredentials();
    if (isValid) {
      console.log("缓存凭证有效，直接跳过扫码！");
      return; 
    } else {
      console.log("凭证已过期，需要重新登录...");
    }
  }

  // 3. 如果没加载到，或者过期了，就启动扫码流程
  const newCredentials = await bot.login();
  
  // 4. 将新获取的凭证保存下来
  fs.writeFileSync("./session.json", JSON.stringify(newCredentials));
}

await startBot();