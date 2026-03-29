// src/constants.ts

import type {
  CdnManagerConfig,
  LoginOptions,
  SendMessageOptions,
  WeChatClientConfig,
} from "./types.ts";

// ====== Universal Constants ======

export const WECHAT_DEFAULT_BASE_URL = "https://ilinkai.weixin.qq.com";
export const WECHAT_DEFAULT_CDN_URL = "https://cdn.weixin.qq.com";

// 获取二维码的普通 HTTP 请求超时 (10秒)
export const DEFAULT_REQUEST_TIMEOUT_MS = 10000;
// 微信极其经典的长轮询 (Long-Polling) 超时基准线 (35秒)
export const LONG_POLLING_TIMEOUT_MS = 35000;
// 轮询接口返回错误时的重试间隔 (3秒)
export const POLLING_ERROR_RETRY_DELAY_MS = 3000;
// 获取上传门票的接口超时时间 (15秒)
export const DEFAULT_API_TIMEOUT_MS = 15000;
// 二维码硬性失效的兜底时间 (5分钟)
export const QR_CODE_EXPIRATION_MS = 5 * 60 * 1000;
// 轮询失败或异常时的退避时间 (1秒 防御性延迟)
export const BACKOFF_BASE_MS = 1000;
// 获取二维码超时的重试次数
export const DEFAULT_LOGIN_MAX_RETRIES = 3;

// AES-128 的密钥长度和块大小（Block Size）。
export const AES_BLOCK_SIZE = 16;
// 微信 CDN 加密算法的硬性规定。
export const WECHAT_AES_ALGO = "aes-128-ecb";
// 协议层魔数。微信用 1 来代表特定的 CDN 加密方式（极大概率指代 AES-128-ECB）
export const WECHAT_CDN_ENCRYPT_TYPE = 1;

// 微信语音的标准采样率。虽然现在是定义在文件顶部的常量，但它属于协议级常量。
export const WECHAT_SILK_SAMPLE_RATE = 24000;

export const WECHAT_HTTP_HEADERS = {
  AUTH_TYPE: "AuthorizationType",
  UIN: "X-WECHAT-UIN",
  APP_ID: "iLink-App-Id",
  CLIENT_VERSION: "iLink-App-ClientVersion",
  CONTENT_TYPE: "Content-Type",
  AUTHORIZATION: "Authorization",
  ERROR_MSG: "x-error-message",
  ENCRYPTED_PARAM: "x-encrypted-param",
} as const;

export const WECHAT_PROTOCOL = {
  AUTH_TYPE_VALUE: "ilink_bot_token",
  CONTENT_TYPE_JSON: "application/json",
  DEFAULT_TIMEOUT_MS: 30000,
} as const;

// ====== default options =======

export const DEFAULT_CLIENT_CONFIG: WeChatClientConfig = {
  appId: "bot",
  version: "2.1.1",
  baseUrl: WECHAT_DEFAULT_BASE_URL,
  botType: "3",
  autoDownloadMedia: true,
};

export const DEFAULT_CDN_CONFIG: CdnManagerConfig = {
  maxRetry: 3,
  cdnBaseUrl: WECHAT_DEFAULT_CDN_URL,
  apiTimeoutMs: DEFAULT_API_TIMEOUT_MS,
  backoffBaseMs: BACKOFF_BASE_MS,
};

export const DEFAULT_LOGIN_OPTIONS: LoginOptions = {
  maxRetries: DEFAULT_LOGIN_MAX_RETRIES,
  pollTimeoutMs: LONG_POLLING_TIMEOUT_MS,
  onQrCode: (qrInfo) => {
    console.log("\n==========================================");
    console.log("请在浏览器中打开以下链接，并使用微信扫码：");
    console.log(qrInfo.qrcodeUrl);
    console.log("==========================================\n");
  },
  onStatusChange: (payload) => {
    switch (payload.status) {
      case "wait":
        console.log("等待登录..."); // 简易的 loading 动画
        break;
      case "scaned":
        console.log("\n👀 已扫码，请在手机微信上点击确认登录...");
        break;
      case "confirmed":
        console.log(
          "\n已链接, 但需手动在微信发送第一条消息后, bot 才能正常回复",
        );
        break;
      case "scaned_but_redirect":
        console.log(`\n[系统] ${payload.message}`);
        break;
    }
  },
};

export const DEFAULT_SEND_OPTIONS: SendMessageOptions = {
  contextToken: undefined,
  userId: undefined,
  caption: undefined,
};
