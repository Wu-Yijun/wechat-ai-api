# @aluria/wechat-ai-api

[![npm version](https://badge.fury.io/js/%40aluria%2Fwechat-ai-api.svg)](https://www.npmjs.com/package/@aluria/wechat-ai-api)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue.svg)](https://www.typescriptlang.org/)

基于微信 OpenClaw 开放接口规范封装的 Node.js SDK。为开发者提供标准化的 API，用于快速接入微信扫码鉴权、长轮询消息监听、以及富媒体（文本、图片、文件、视频、语音）的自动化收发。

🔗 **GitHub 仓库**: [https://github.com/Wu-Yijun/wechat-ai-api](https://github.com/Wu-Yijun/wechat-ai-api)

## 核心特性

- **完整的生命周期管理**：封装了完整的扫码鉴权、凭证持久化及长轮询（Long-Polling）保活机制。
- **富媒体透明处理**：内置 `CdnManager`，在发送媒体文件时自动完成 AES-128-ECB 加密与微信 CDN 上传；接收时自动获取凭据并完成解密。
- **按需加载机制**：支持将收到的媒体资源暂存于内存中（惰性求值），支持随时转存为本地文件或直接提取为 Buffer。
- **类型安全**：基于 TypeScript 编写，提供严格的接口约束与完整的类型定义（`.d.ts`）。

## 📦 安装

```bash
npm install @aluria/wechat-ai-api
```

*注：本项目使用了纯 ESM 规范发布，请确保您的 Node.js 项目 (`package.json`) 中已配置 `"type": "module"`。*

## 基础使用

### 1\. 鉴权与会话恢复

SDK 支持将登录成功后的凭据（Token、账户 ID 等）导出，以便在 Node.js 进程重启时免扫码恢复连接。

```typescript
import { WeChatApi } from "@aluria/wechat-ai-api";
import fs from "node:fs";

const bot = new WeChatApi();

async function init() {
  const sessionPath = "./session.json";

  if (fs.existsSync(sessionPath)) {
    // 恢复历史会话
    const credentials = JSON.parse(fs.readFileSync(sessionPath, "utf-8"));
    bot.loadCredentials(credentials);
    console.log("已恢复历史会话");
  } else {
    // 首次扫码登录
    const credentials = await bot.login();
    fs.writeFileSync(sessionPath, JSON.stringify(credentials));
    console.log("登录成功，凭据已保存");
  }

  // 启动消息监听守护进程
  bot.startPolling();
}

init();
```

### 2\. 消息监听与处理

通过继承 `EventEmitter` 的事件系统，您可以对不同类型的消息进行精确路由。

```typescript
// 监听纯文本消息
bot.on("text", async (msg) => {
  console.log(`[Text] 收到来自 ${msg.fromUserId} 的消息: ${msg.text}`);
  
  if (msg.text === "ping") {
    // 使用 contextToken 触发引用回复
    await bot.messages.sendText("pong", { contextToken: msg.contextToken });
  }
});

// 监听图片消息
bot.on("image", async (msg) => {
  console.log(`[Image] 收到图片消息，ID: ${msg.messageId}`);
  
  // 方式 A：直接保存到本地磁盘
  const savedPath = await msg.saveToFile!(`./downloads/${msg.messageId}.jpg`);
  console.log(`图片已落盘: ${savedPath}`);

  // 方式 B：获取 Buffer 传递给第三方 AI 服务（如图像识别）
  // const imageBuffer = await msg.getBuffer!();
  // await externalVisionService.analyze(imageBuffer);
});

// 监听文件接收
bot.on("file", async (msg) => {
  console.log(`[File] 收到文件: ${msg.fileName}`);
  await msg.saveToFile!(`./downloads/${msg.fileName}`);
});
```

### 3\. 主动发送消息

`bot.messages` 命名空间提供了各种媒体的快捷下发接口。

```typescript
// 发送带标题的文件
await bot.messages.sendFile("./reports/weekly.pdf", {
  caption: "本周的数据报表已生成",
});

// 发送视频
await bot.messages.sendVideo("./assets/demo.mp4");

// 向指定用户发送图文消息
await bot.messages.sendImage("./assets/alert.png", {
  caption: "系统触发了阈值警报"
});
```

## ⚙️ 高级配置 (Configuration)

在实例化 `WeChatApi` 时，可传入自定义配置以覆盖默认行为：

```typescript
const bot = new WeChatApi({
  // 是否在接收到图片/文件时自动在后台静默下载并解密缓存到内存中
  // 设为 false 可大幅降低带宽消耗，后续可以手动触发下载
  autoDownloadMedia: true, 

  // 可指定特定的网关地址
  baseUrl: "https://ilinkai.weixin.qq.com", 
});
```

### 自定义登录交互

默认的 `login()` 方法会在控制台打印纯文本的二维码 URL。如果您需要将二维码渲染到 Web 页面或通过其他渠道推送，可传入自定义的回调函数：

```typescript
await bot.login({
  onQrCode: (qrInfo) => {
    // qrcodeUrl 为二维码解析后的文本内容
    // 您可以使用 qrcode 库将其渲染为 base64 图片或在终端输出点阵图
    console.log("获取到授权二维码:", qrInfo.qrcodeUrl);
  },
  onStatusChange: (payload) => {
    // 状态流转：wait -> scanned -> confirmed
    console.log(`授权状态更新: ${payload.status}`);
  }
});
```

## 🛠️ 技术细节与实现约束

1.  **CDN 加解密规范**：微信媒体文件传输采用 `AES-128-ECB` 算法。本项目已完整实现了该加密规范，包括密钥的 Base64 与 Hex 双重编码容错处理。
2.  **长轮询机制**：消息接收依赖 HTTP Long-Polling，默认连接维持时间为 `35,000` 毫秒。SDK 内部维护了 `sync_buf` 游标，有效防止了消息丢失与重复拉取。
3.  **音频编码**：微信语音消息采用私有的 SILK 格式。已集成 `silk-wasm` 进行音频格式的转换。

## 📖 API 参考

详细的类型定义与接口描述，请参阅源码中的 `types.ts`。主要模块包括：

  - `WeChatApi`: 核心实例，统筹鉴权与轮询。
  - `WeChatApi.messages`: 提供 `sendText`, `sendImage`, `sendVideo`, `sendFile` 等方法。
  - `WeChatIncomingMessage`: 暴露于事件回调中的消息体，提供 `saveToFile()` 和 `getBuffer()`。

更多详细示例代码请查阅代码库中的 [`example/`](https://github.com/Wu-Yijun/wechat-ai-api/tree/main/example) 目录。

## 📄 免责声明与协议

本项目基于 **MIT** 协议开源。

**声明：** 本 SDK 仅供技术研究、个人日常学习与自动化辅助使用。请严格遵守《腾讯微信软件许可及服务协议》。使用本 SDK 造成的任何账号封禁、数据丢失或法律纠纷，开发者概不负责。严禁用于批量营销、黑灰产及任何侵犯用户隐私的商业行为。
