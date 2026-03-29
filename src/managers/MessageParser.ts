// src/managers/MessageParser.ts

import type { CdnManager } from "./CdnManager.ts";
import {
  type CdnDownloadTicket,
  MessageItemType,
  type RawMessage,
  type RawMessageItem,
  type WeChatClientConfig,
  type WeChatIncomingMessage,
} from "../types.ts";
import { silkToWav } from "../core/SilkConverter.ts";
import { writeFile } from "node:fs/promises";
import {
  getFileImageItem,
  getItemType,
  isItemWithMedia,
  mergeObjects,
} from "../core/utils.ts";

export class MessageParser {
  private cdn: CdnManager;
  private config: WeChatClientConfig;

  constructor(cdn: CdnManager, config: WeChatClientConfig) {
    this.cdn = cdn;
    this.config = config;
  }

  /**
   * 将微信底层的复杂 JSON 扁平化为开发者友好的对象
   */
  public async parse(raw: RawMessage): Promise<WeChatIncomingMessage[] | null> {
    // 过滤掉系统消息或无内容的空包
    if (!raw.item_list || raw.item_list.length === 0) return [];

    const results: WeChatIncomingMessage[] = [];

    // 提取公共的信封数据
    const shared_data: WeChatIncomingMessage = {
      messageId: String(raw.message_id),
      seq: raw.seq,
      fromUserId: raw.from_user_id,
      toUserId: raw.to_user_id,
      timestamp: raw.create_time_ms,
      contextToken: raw.context_token,
      msgType: MessageItemType.TEXT,
      msgTypeStr: "unknown",
      index: 0,
      raw: raw,
    };

    for (let i = 0; i < raw.item_list.length; i++) {
      const item = raw.item_list[i];
      const msgCopy = mergeObjects(shared_data, {
        index: i,
        msgType: item.type,
        msgTypeStr: getItemType(item.type),
      });

      // 1. 先处理文本消息，提取纯文本内容
      if (item.type === MessageItemType.TEXT) {
        msgCopy.text = item.text_item.text;
      }
      if (!isItemWithMedia(item.type)) {
        results.push(msgCopy);
        continue; // 如果不是媒体消息，直接进入下一轮循环
      }

      // 2. 媒体消息需要提取下载票据，并提供 getBuffer 方法
      let cachedBuffer: Buffer | null = null;
      const ticket = this._extractDownloadTicket(item);
      msgCopy.fileName = ticket?.originalFileName;
      msgCopy.mediaTicket = ticket;
      msgCopy.getBuffer = async () => {
        if (cachedBuffer) return cachedBuffer;
        if (!ticket) return null;
        // 调用 CDN 管理器下载
        cachedBuffer = await this.cdn.downloadBuffer(ticket);
        return cachedBuffer;
      };
      msgCopy.saveToFile = async (savePath: string) => {
        const buf = await msgCopy.getBuffer!();
        if (!buf) throw new Error("无媒体内容可保存");
        await writeFile(savePath, buf);
        return savePath;
      };

      // 3. 语音消息需要特殊处理，提供一个额外的方法获取原始 SILK 编码的 Buffer
      if (msgCopy.msgType === MessageItemType.VOICE) {
        msgCopy.getVoiceBuffer = msgCopy.getBuffer; // 语音消息的原始 Buffer 是 SILK 编码
        let pcmCachedBuffer: Buffer | null = null;
        msgCopy.getBuffer = async () => {
          if (pcmCachedBuffer) return pcmCachedBuffer;
          const silk_buffer = await msgCopy.getVoiceBuffer!();
          if (!silk_buffer) return null;
          pcmCachedBuffer = await silkToWav(silk_buffer);
          return pcmCachedBuffer;
        };
      }

      // 4. 如果开启了自动下载，就在抛出事件前，在后台先下载好！
      if (this.config.autoDownloadMedia !== false && ticket) {
        try {
          msgCopy.getBuffer(); // 不 await，后台下载，事件照常触发
        } catch (err: any) {
          console.error(`自动下载媒体失败: ${err.message}`);
        }
      }
      results.push(msgCopy);
    }
    return results;
  }

  /**
   * 从原始 JSON 中提取标准化的 CDN 下载票据
   */
  private _extractDownloadTicket(
    item: RawMessageItem,
  ): CdnDownloadTicket | undefined {
    const file_item = getFileImageItem(item);
    if (!file_item || !file_item.media) return undefined;
    const media = file_item.media;

    // 如果连基本的下载参数都没有，直接放弃
    if (!media.encrypt_query_param && !media.full_url) return undefined;

    // 2. 抹平 AES 密钥的特权差异
    let aesKeyBase64 = media.aes_key;

    // ⚠️ 协议特例：图片类型有时会把密钥放在外层，而且是 Hex 格式
    if (
      item.type === MessageItemType.IMAGE && "aeskey" in file_item &&
      file_item.aeskey
    ) {
      // 统一转成 Base64，方便 CdnManager 统一处理
      aesKeyBase64 = Buffer.from(file_item.aeskey, "hex").toString("base64");
    }

    // 3. 判断是否为明文传输 (某些情况下微信图片没有 aes_key)
    const isPlain = !aesKeyBase64;

    return {
      fullUrl: media.full_url,
      encryptedQueryParam: media.encrypt_query_param,
      aesKeyBase64,
      isPlain,
      originalFileName: "file_name" in file_item
        ? file_item.file_name
        : undefined,
    };
  }
}
