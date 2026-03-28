// src/managers/MessageManager.ts
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { WeChatCore } from "../core/WeChatCore.ts";
import { CdnManager } from "./CdnManager.ts";
import { MessageItemType, MessageState, MessageType, UploadMediaType } from "../types.ts"; // 假设在 types.ts 中定义
import { mergeObjects } from "../core/utils.ts";

// ==========================================
// 接口定义
// ==========================================

export interface SendMessageOptions {
  /** * 上下文 Token。用于在特定的会话上下文中回复消息 
   */
  contextToken?: string;
  /** * 接收消息的用户 ID (微信 ID)，如果不提供，SDK 会尝试使用登录用户的 ID 作为默认值
   */
  userId?: string;
}

const DEFAULT_SEND_OPTIONS: SendMessageOptions = {
  contextToken: undefined,
  userId: undefined,
};

export interface SendMediaOptions extends SendMessageOptions {
  /** * 媒体附件的文字说明。
   * 注意：微信不支持图文混合在同一个 Item 中，
   * 如果提供此参数，SDK 会先发送一条文本消息，紧接着发送媒体消息。
   */
  caption?: string;
}

interface SendResult {
  clientId: string;
  response: any; // 微信服务器的原始响应，未来可以根据需要定义更具体的类型
}

export class MessageManager {
  private core: WeChatCore;
  private cdn: CdnManager;
  private userId: string | undefined; // 登录后会自动设置

  constructor(core: WeChatCore, cdn: CdnManager) {
    this.core = core;
    this.cdn = cdn;
  }

  /** * 设置登录用户的微信 ID，供发送消息时使用
   * 这个值通常在登录成功后由外部调用 setUserId 来设置
   */
  public setUserId(userId: string): void {
    this.userId = userId;
  }

  // ==========================================
  // 公开 API: 发送纯文本
  // ==========================================

  public async sendText(text: string, options: Partial<SendMessageOptions> = DEFAULT_SEND_OPTIONS): Promise<SendResult> {
    const textItem = {
      type: MessageItemType.TEXT,
      text_item: { text },
    };
    const mergedOptions = mergeObjects(DEFAULT_SEND_OPTIONS, { userId: this.userId }, options);
    return this._sendRawItem(textItem, mergedOptions.userId!, mergedOptions.contextToken);
  }

  // ==========================================
  // 公开 API: 发送媒体文件
  // ==========================================

  public async sendImage(filePath: string, options: Partial<SendMediaOptions> = DEFAULT_SEND_OPTIONS): Promise<SendResult> {
    const mergedOptions = mergeObjects(DEFAULT_SEND_OPTIONS, { userId: this.userId }, options);
    return this._sendMediaWorkflow(filePath, UploadMediaType.IMAGE, mergedOptions);
  }

  public async sendVideo(filePath: string, options: Partial<SendMediaOptions> = DEFAULT_SEND_OPTIONS): Promise<SendResult> {
    const mergedOptions = mergeObjects(DEFAULT_SEND_OPTIONS, { userId: this.userId }, options);
    return this._sendMediaWorkflow(filePath, UploadMediaType.VIDEO, mergedOptions);
  }

  /** - 仅允许发送文件, 发送**图片或视频**会导致发送失败!
    * - 发送图片和视频应使用 `sendImage` 或 `sendVideo` */
  public async sendFile(filePath: string, options: Partial<SendMediaOptions> = DEFAULT_SEND_OPTIONS): Promise<SendResult> {
    const mergedOptions = mergeObjects(DEFAULT_SEND_OPTIONS, { userId: this.userId }, options);
    return this._sendMediaWorkflow(filePath, UploadMediaType.FILE, mergedOptions);
  }

  // ==========================================
  // 私有核心流水线
  // ==========================================

  /**
   * 统一的媒体发送工作流：读取本地文件 -> 上传 CDN -> (可选发送 Caption) -> 发送媒体消息
   */
  private async _sendMediaWorkflow(
    filePath: string,
    mediaType: UploadMediaType,
    options: SendMediaOptions
  ): Promise<SendResult> {

    // 1. 读取本地文件为 Buffer
    const buffer = await fs.readFile(filePath);
    const fileName = path.basename(filePath);

    // 2. 调用 CdnManager 上传至微信服务器，获取票据
    const ticket = await this.cdn.uploadBuffer(buffer, options.userId!, mediaType);

    // 3. 如果用户传了 caption，先发送一条纯文本消息
    if (options.caption) {
      await this.sendText(options.caption, { contextToken: options.contextToken });
    }

    // 4. 组装媒体 Item 载荷
    const mediaObj = {
      encrypt_query_param: ticket.encryptedQueryParam,
      aes_key: Buffer.from(ticket.aeskeyHex).toString("base64"), // JSON 中要求 base64 格式
      encrypt_type: 1,
    };

    let messageItem: any = {};

    switch (mediaType) {
      case UploadMediaType.IMAGE:
        messageItem = {
          type: MessageItemType.IMAGE,
          image_item: { media: mediaObj, mid_size: ticket.fileSizeCipher },
        };
        break;
      case UploadMediaType.VIDEO:
        messageItem = {
          type: MessageItemType.VIDEO,
          video_item: { media: mediaObj, video_size: ticket.fileSizeCipher },
        };
        break;
      case UploadMediaType.FILE:
        messageItem = {
          type: MessageItemType.FILE,
          file_item: { media: mediaObj, file_name: fileName, len: String(ticket.fileSizePlain) }, // 注意 len 是明文大小的字符串
        };
        break;
      default:
        throw new Error(`[MessageManager] 不支持的媒体类型: ${mediaType}`);
    }

    // 5. 将组装好的媒体 Item 发送出去
    return this._sendRawItem(messageItem, options.userId!, options.contextToken);
  }

  /**
   * 最底层的发包函数，将组装好的 Item 包装成完整的微信请求体并 POST
   */
  private async _sendRawItem(itemObj: any, userId: string, contextToken?: string): Promise<SendResult> {
    const clientId = this._generateClientId();

    const requestBody: any = {
      msg: {
        from_user_id: "",
        to_user_id: userId,
        client_id: clientId,
        message_type: MessageType.BOT,
        message_state: MessageState.FINISH,
        contextToken: contextToken,
        item_list: [itemObj],
      }
    };

    const response  = await this.core.request("ilink/bot/sendmessage", {
      method: "POST",
      body: requestBody,
      timeoutMs: 15000,
    });

    return {clientId, response};
  }

  /** * 生成去重的客户端消息 ID 
   * 格式: prefix:timestamp-randomHex
   */
  private _generateClientId(): string {
    const randomHex = crypto.randomBytes(4).toString("hex");
    return `wechat-bot:${Date.now()}-${randomHex}`;
  }
}