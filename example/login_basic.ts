import { WeChatBot } from "../src/WechatAiApi.ts";

// 这是一个简单的登录示例，展示了如何使用 WeChatBot 类进行扫码登录。

const bot = new WeChatBot();

// 这一句就会自动在终端打印 URL，自动打印等待小点，自动完成鉴权！
await bot.login(); 

console.log("准备就绪！");