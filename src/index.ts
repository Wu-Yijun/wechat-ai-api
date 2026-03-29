// src/index.ts

// ==========================================
// 1. 核心主类 (业务入口)
// ==========================================
export { WeChatApi } from "./WechatAiApi.ts";

// ==========================================
// 2. 核心数据类型 (极其重要：提升用户的 DX 体验)
// ==========================================
export type {
  WeChatIncomingMessage,  // 用户在 bot.on() 回调中必须要用的类型
  WeChatClientConfig,     // 用户在 new WeChatApi() 抽离配置时需要的类型
  LoginCredentials,       // 用户读取/保存 session.json 时需要的类型注解
  LoginOptions,           // 用户自定义扫码控制台交互时需要的类型
  SendMessageOptions,     // 用户封装自己的发消息函数时需要的类型
  QrCodeInfo              // 用户自定义 onQrCode 回调时需要的类型
} from "./types.ts";

// ==========================================
// 3. 运行时常量 (状态枚举)
// ==========================================
export { LoginStatus } from "./types.ts";