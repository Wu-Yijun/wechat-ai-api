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
  fullUrl?: string; // 优先级 1
  encryptedQueryParam?: string; // 优先级 2
  aesKeyBase64?: string; // 密钥 (已统一转为 base64 处理好的)
  isPlain: boolean; // 是否是明文传输 (针对某些没有 aes_key 的图片)
  originalFileName?: string; // 针对文件
}

export type ItemTypeStr =
  | "text"
  | "image"
  | "video"
  | "file"
  | "voice"
  | "unknown";

// 对外暴露的消息对象结构
export interface WeChatIncomingMessage<
  T extends RawMessageItemBase = RawMessageItem,
> {
  messageId: string;
  seq: number;
  fromUserId: string;
  toUserId: string;
  timestamp: number;
  contextToken: string; // 回复消息时必须带上这个字段
  msgType: T["type"];
  msgTypeStr: ItemTypeStr; // 方便使用者直接判断类型的字符串版本
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
  raw: RawMessage<T>;
}

export const enum MessageType {
  NONE = 0,
  USER = 1,
  BOT = 2,
}

export const enum MessageItemType {
  NONE = 0,
  TEXT = 1,
  IMAGE = 2,
  VOICE = 3,
  FILE = 4,
  VIDEO = 5,
}

export const enum MessageState {
  NEW = 0,
  GENERATING = 1,
  FINISH = 2,
}

export const enum UploadMediaType {
  IMAGE = 1,
  VIDEO = 2,
  FILE = 3,
  VOICE = 4,
}

export interface PollingResult {
  ret?: number | -2;
  errcode?: number;
  errmsg?: string;
  get_updates_buf?: string;
  msgs?: RawMessage[];
}

export interface RawMessage<T extends RawMessageItemBase = RawMessageItem> {
  seq: number;
  message_id: number;
  from_user_id: string;
  to_user_id: string;
  client_id: string;
  create_time_ms: number;
  update_time_ms: number;
  delete_time_ms: number | 0;
  session_id: string | "";
  group_id: string | "";
  message_type: MessageType;
  message_state: MessageState;
  item_list: T[];
  context_token: string;
}

export type RawMessageItem =
  | RawMessageTextItem
  | RawMessageFileItem
  | RawMessageImageItem
  | RawMessageVideoItem
  | RawMessageVoiceItem;

export interface RawMessageItemBase {
  type: MessageItemType;
  create_time_ms: number;
  update_time_ms: number;
  is_completed: boolean;
}

export interface RawMessageTextItem extends RawMessageItemBase {
  type: MessageItemType.TEXT;
  text_item: { text: string };
}

export interface RawMessageFileItem extends RawMessageItemBase {
  type: MessageItemType.FILE;
  file_item: {
    media: RawMessageMedia;
    file_name: string;
    md5: string;
    len: string;
  };
}

export interface RawMessageImageItem extends RawMessageItemBase {
  type: MessageItemType.IMAGE;
  image_item: {
    url: string;
    aeskey: string;
    media: RawMessageMedia;
    mid_size: number;
    thumb_size: number;
    thumb_height: number;
    thumb_width: number;
    hd_size: number;
  };
}

export interface RawMessageVideoItem extends RawMessageItemBase {
  type: MessageItemType.VIDEO;
  video_item: {
    media: RawMessageMedia;
    video_size: number;
    play_length: number;
    video_md5: string;
    thumb_media: RawMessageMedia;
    thumb_size: number;
    thumb_height: number;
    thumb_width: number;
  };
}

export interface RawMessageVoiceItem extends RawMessageItemBase {
  type: MessageItemType.VOICE;
  voice_item: {
    media: RawMessageMedia;
    encode_type: number | 4;
    bits_per_sample: number | 16;
    sample_rate: number | 16000;
    playtime: number;
    text: string | "";
  };
}

export interface RawMessageMedia {
  encrypt_query_param: string;
  aes_key: string;
  full_url: string;
}

export interface WeChatApiEventMap {
  login: [credentials: LoginCredentials];
  message: [msg: WeChatIncomingMessage];
  text: [msg: WeChatIncomingMessage<RawMessageTextItem>];
  file: [msg: WeChatIncomingMessage<RawMessageFileItem>];
  image: [msg: WeChatIncomingMessage<RawMessageImageItem>];
  video: [msg: WeChatIncomingMessage<RawMessageVideoItem>];
  voice: [msg: WeChatIncomingMessage<RawMessageVoiceItem>];
  error: [error: Error];
}
