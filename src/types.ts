// src/types.ts

export interface WeChatClientConfig {
  /** 你的应用 ID (对应原 config.json 的 ilink_appid) */
  appId: string;
  /** 客户端版本号字符串，如 "1.0.11" */
  version: string;
  /** 基础 API 地址，通常为 https://ilinkai.weixin.qq.com */
  baseUrl: string;
  /** 机器人的登录凭证，登录前可为空 */
  token?: string;
}

/** 核心引擎接收的请求参数 */
export interface CoreRequestOptions {
  method: "GET" | "POST";
  /** 纯业务请求体，无需包含 base_info */
  body?: Record<string, any>;
  /** 超时时间 (毫秒) */
  timeoutMs: number;
}



export interface QrCodeInfo {
  qrcodeId: string;
  qrcodeUrl: string; // 用于生成图片的原始字符串/链接
}

export interface LoginResult {
  token: string;
  baseUrl: string;
  accountId: string;
  userId: string;
}

export type LogStatusChangePayload =
  | {
    status: "wait" | "scaned" | "expired";
    message: string;
  }
  | {
    status: "scaned_but_redirect";
    message: string;
    redirect_host: string; // 服务器要求重定向的新 host
  }
  | {
    status: "confirmed";
    message: string;
    bot_token: string; // 登录成功后返回的 token
    baseurl?: string; // 登录成功后返回的 baseUrl（如果有的话）
    ilink_bot_id: string; // 登录成功后返回的 bot 账号 ID
    ilink_user_id: string; // 登录成功后返回的用户 ID
  };

export interface LoginOptions {
  /** 当获取到新二维码时触发 (如果二维码过期会自动刷新并再次触发) */
  onQrCode: (qrInfo: QrCodeInfo) => void;
  /** 当轮询状态改变时触发 (可选) */
  onStatusChange: (payload: LogStatusChangePayload) => void;
  /** 二维码过期后最大重试次数，默认 3 */
  maxRetries: number;
  /** 单次长轮询的超时时间，默认 35000ms */
  pollTimeoutMs: number;
}

/** 内部流转的 CDN 文件凭据 (CdnManager 产出，MessageManager 消费) */
export interface CdnFileTicket {
  filekey: string;
  aeskeyHex: string;          // 给 MessageManager 拼 JSON 用的 hex
  aeskeyBuffer: Buffer;       // 未来下载解密用的 buffer
  fileSizePlain: number;      // 明文大小
  fileSizeCipher: number;     // 加密后大小
  encryptedQueryParam: string;// 核心下载参数
}


export const MessageType = {
  NONE: 0,
  USER: 1,
  BOT: 2,
} as const;

export const MessageItemType = {
  NONE: 0,
  TEXT: 1,
  IMAGE: 2,
  VOICE: 3,
  FILE: 4,
  VIDEO: 5,
} as const;

export const MessageState = {
  NEW: 0,
  GENERATING: 1,
  FINISH: 2,
} as const;

export const UploadMediaType = {
  IMAGE: 1,
  VIDEO: 2,
  FILE: 3,
  VOICE: 4,
} as const;
export type MessageType = typeof MessageType[keyof typeof MessageType];
export type MessageItemType = typeof MessageItemType[keyof typeof MessageItemType];
export type MessageState = typeof MessageState[keyof typeof MessageState];
export type UploadMediaType = typeof UploadMediaType[keyof typeof UploadMediaType];