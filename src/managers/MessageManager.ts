// src/managers/MessageManager.ts

import { readFile } from "node:fs/promises";
import { basename } from "node:path";

import { mergeObjects } from "../core/utils.ts";
import {
  DEFAULT_API_TIMEOUT_MS,
  DEFAULT_SEND_OPTIONS,
  WECHAT_CDN_ENCRYPT_TYPE,
} from "../constants.ts";
import { CryptoUtils } from "../core/CryptoUtils.ts";
import {
  MessageItemType,
  MessageState,
  MessageType,
  type SendMessageOptions,
  type SendResult,
  UploadMediaType,
} from "../types.ts";
import type { WeChatCore } from "../core/WeChatCore.ts";
import type { CdnManager } from "./CdnManager.ts";

export class MessageManager {
  private core: WeChatCore;
  private cdn: CdnManager;

  constructor(core: WeChatCore, cdn: CdnManager) {
    this.core = core;
    this.cdn = cdn;
  }

  // ==========================================
  // 公开 API: 发送纯文本
  // ==========================================

  public async sendText(
    text: string,
    options: Partial<SendMessageOptions> = DEFAULT_SEND_OPTIONS,
  ): Promise<SendResult> {
    const textItem = {
      type: MessageItemType.TEXT,
      text_item: { text },
    };
    const mergedOptions = mergeObjects(DEFAULT_SEND_OPTIONS, {
      userId: this.core.getUserId(),
    }, options);
    return this._sendRawItem(
      textItem,
      mergedOptions.userId!,
      mergedOptions.contextToken,
    );
  }

  // ==========================================
  // 公开 API: 发送媒体文件
  // ==========================================

  public async sendImage(
    filePath: string,
    options: Partial<SendMessageOptions> = DEFAULT_SEND_OPTIONS,
  ): Promise<SendResult> {
    const mergedOptions = mergeObjects(DEFAULT_SEND_OPTIONS, {
      userId: this.core.getUserId(),
    }, options);
    return this._sendMediaWorkflow(
      filePath,
      UploadMediaType.IMAGE,
      mergedOptions,
    );
  }

  public async sendVideo(
    filePath: string,
    options: Partial<SendMessageOptions> = DEFAULT_SEND_OPTIONS,
  ): Promise<SendResult> {
    const mergedOptions = mergeObjects(DEFAULT_SEND_OPTIONS, {
      userId: this.core.getUserId(),
    }, options);
    return this._sendMediaWorkflow(
      filePath,
      UploadMediaType.VIDEO,
      mergedOptions,
    );
  }

  /** - 仅允许发送文件, 发送**图片或视频**会导致发送失败!
   * - 发送图片和视频应使用 `sendImage` 或 `sendVideo` */
  public async sendFile(
    filePath: string,
    options: Partial<SendMessageOptions> = DEFAULT_SEND_OPTIONS,
  ): Promise<SendResult> {
    const mergedOptions = mergeObjects(DEFAULT_SEND_OPTIONS, {
      userId: this.core.getUserId(),
    }, options);
    return this._sendMediaWorkflow(
      filePath,
      UploadMediaType.FILE,
      mergedOptions,
    );
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
    options: SendMessageOptions,
  ): Promise<SendResult> {
    // 1. 读取本地文件为 Buffer
    const buffer = await readFile(filePath);
    const fileName = basename(filePath);

    // 2. 调用 CdnManager 上传至微信服务器，获取票据
    const ticket = await this.cdn.uploadBuffer(
      buffer,
      options.userId!,
      mediaType,
    );

    // 3. 如果用户传了 caption，先发送一条纯文本消息
    if (options.caption) {
      await this.sendText(options.caption, {
        contextToken: options.contextToken,
      });
    }

    // 4. 组装媒体 Item 载荷
    const mediaObj = {
      encrypt_query_param: ticket.encryptedQueryParam,
      aes_key: Buffer.from(ticket.aeskeyHex).toString("base64"), // JSON 中要求 base64 格式
      encrypt_type: WECHAT_CDN_ENCRYPT_TYPE,
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
          file_item: {
            media: mediaObj,
            file_name: fileName,
            len: String(ticket.fileSizePlain),
          }, // 注意 len 是明文大小的字符串
        };
        break;
      default:
        throw new Error(`[MessageManager] 不支持的媒体类型: ${mediaType}`);
    }

    // 5. 将组装好的媒体 Item 发送出去
    return this._sendRawItem(
      messageItem,
      options.userId!,
      options.contextToken,
    );
  }

  /**
   * 最底层的发包函数，将组装好的 Item 包装成完整的微信请求体并 POST
   */
  private async _sendRawItem(
    itemObj: any,
    userId: string,
    contextToken?: string,
  ): Promise<SendResult> {
    const clientId = CryptoUtils.generateClientId();

    const requestBody: any = {
      msg: {
        from_user_id: "", // 留空，微信网关会自动通过 Bearer Token 识别机器人身份
        to_user_id: userId,
        client_id: clientId,
        message_type: MessageType.BOT,
        message_state: MessageState.FINISH,
        context_token: contextToken,
        item_list: [itemObj],
      },
    };

    const response = await this.core.request("ilink/bot/sendmessage", {
      method: "POST",
      body: requestBody,
      timeoutMs: DEFAULT_API_TIMEOUT_MS,
    });

    return { clientId, response };
  }
}
