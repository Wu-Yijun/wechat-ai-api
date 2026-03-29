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
  /** 收到图片/文件/视频时，是否在后台自动下载解密到内存中？默认 true */
  autoDownloadMedia: boolean;
  /** 用户 ID */
  userId?: string;
}


export interface SendMessageOptions {
  /** * 上下文 Token。用于在特定的会话上下文中回复消息
   */
  contextToken?: string;
  /** * 接收消息的用户 ID (微信 ID)，目前仅对自身账号有效，如果不提供，SDK 会尝试使用登录用户的 ID 作为默认值
   */
  userId?: string;
  /** * 媒体附件的文字说明。
   * 注意：微信不支持图文混合在同一个 Item 中，
   * 如果提供此参数，SDK 会先发送一条文本消息，紧接着发送媒体消息。
   */
  caption?: string;
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

export interface LoginCredentials {
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

export interface SendResult {
  clientId: string;
  response: any;
}

/** 内部流转的 CDN 文件凭据 (CdnManager 产出，MessageManager 消费) */
export interface CdnFileTicket {
  filekey: string;
  aeskeyHex: string; // 给 MessageManager 拼 JSON 用的 hex
  aeskeyBuffer: Buffer; // 未来下载解密用的 buffer
  fileSizePlain: number; // 明文大小
  fileSizeCipher: number; // 加密后大小
  encryptedQueryParam: string; // 核心下载参数
}

/** 统一的 CDN 下载票据 (抹平了图片、文件、视频的差异) */
export interface CdnDownloadTicket {
  mediaType: "image" | "video" | "file" | "voice";
  fullUrl?: string; // 优先级 1
  encryptedQueryParam?: string; // 优先级 2
  aesKeyBase64?: string; // 密钥 (已统一转为 base64 处理好的)
  isPlain: boolean; // 是否是明文传输 (针对某些没有 aes_key 的图片)
  originalFileName?: string; // 针对文件
}

// 对外暴露的消息对象结构
export interface WeChatIncomingMessage {
  messageId: string;
  seq: number;
  fromUserId: string;
  toUserId: string;
  timestamp: number;
  contextToken: string; // 回复消息时必须带上这个字段
  msgType: ItemType;
  /** 纯文本内容 */
  text?: string;
  /** 文件名 */
  fileName?: string;
  /**
   * 获取媒体文件的二进制 Buffer。
   * 如果开启了 autoDownloadMedia，此方法瞬间返回内存中的 Buffer。
   * 如果关闭了，此方法会发起网络请求下载并解密，然后缓存。
   */
  getBuffer?: () => Promise<Buffer | null>;
  /** 获取语音消息的二进制 Buffer, 这是原始的 SILK 编码 */
  getVoiceBuffer?: () => Promise<Buffer | null>;
  /**
   * 快捷方法：将媒体文件保存到本地磁盘。
   * @param savePath 指定绝对或相对路径
   */
  saveToFile?: (savePath: string) => Promise<string>;
  /** 原始底层票据 */
  mediaTicket?: CdnDownloadTicket;
  /** 消息在同一 seq 中的索引，方便开发者处理多 Item 的情况 */
  index: number;
  /** 原始消息载荷，给高级玩家使用 */
  raw: any;
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
export type MessageItemType =
  typeof MessageItemType[keyof typeof MessageItemType];
export type MessageState = typeof MessageState[keyof typeof MessageState];
export type UploadMediaType =
  typeof UploadMediaType[keyof typeof UploadMediaType];

export type ItemType =
  | "text"
  | "image"
  | "video"
  | "file"
  | "voice"
  | "unknown";
