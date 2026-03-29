# WeChat AI API

一个优雅、轻量、开箱即用的个人微信通知与自动化 SDK。基于微信 OpenClaw 开放接口封装，支持扫码登录、长轮询保活、富媒体（图片/视频/文件/语音）自动收发与解析。

## ✨ 特性

- 🚀 **极致精简**：`bot = new WeChatApi(); bot.login();` 即可扫码启动。
- 📦 **实例隔离**：无需传入繁琐的 AccountID，发消息默认路由给扫码管理员。
- 🖼️ **媒体全自动**：发送图片/文件自动完成 AES-128 加密与 CDN 上传；收到文件自动静默下载解密。
- 🎧 **语音支持**：内置微信特有 SILK 格式的处理逻辑。
- 🛡️ **类型安全**：100% TypeScript 编写，提供完善的类型提示。

## 📦 安装

```bash
npm install @aluria/wechat-ai-api
```

## 🚀 快速开始

以下是一个最简单的“鹦鹉学舌”机器人示例：

```typescript
import { WeChatApi } from "@aluria/wechat-ai-api";
import fs from "fs";

async function main() {
  const bot = new WeChatApi();

  // 1. 尝试从本地加载凭证（实现免扫码重启）
  if (fs.existsSync("./session.json")) {
    bot.loadCredentials(JSON.parse(fs.readFileSync("./session.json", "utf-8")));
  } else {
    // 首次登录，终端将打印二维码 URL
    const credentials = await bot.login();
    fs.writeFileSync("./session.json", JSON.stringify(credentials));
  }

  // 2. 启动长轮询监听
  bot.startPolling();

  // 3. 监听文本消息
  bot.on("text", async (msg) => {
    console.log(`收到消息: ${msg.text}`);
    if (msg.text === "ping") {
      await bot.messages.sendText("pong!", { contextToken: msg.contextToken });
    }
  });

  // 4. 监听图片消息（自动下载并存盘）
  bot.on("image", async (msg) => {
    const savePath = await msg.saveToFile!(`./temp/${msg.fileName || Date.now() + '.jpg'}`);
    console.log(`图片已保存至: ${savePath}`);
    await bot.messages.sendText("收到图片，很赞！", { contextToken: msg.contextToken });
  });
}

main();
```

## 📖 API 概览

### 发送消息 (`WeChatApi.messages`)
- `WeChatApi.messages.sendText(text, options?)`
- `WeChatApi.messages.sendImage(filePath, options?)`
- `WeChatApi.messages.sendVideo(filePath, options?)`
- `WeChatApi.messages.sendFile(filePath, options?)`

### 示例代码

更多样例参见 `example/` 目录下的示例文件.

## 📄 协议与免责声明

本项目仅供学习与技术交流使用，请勿用于黑灰产、垃圾群发等违反腾讯微信服务协议的场景。