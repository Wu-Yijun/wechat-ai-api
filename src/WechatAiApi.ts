// src/WeChatBot.ts
import { EventEmitter } from "node:events";
import { WeChatCore } from "./core/WeChatCore.ts";
import {
  AuthManager,
} from "./managers/AuthManager.ts";
import { DEFAULT_CLIENT_CONFIG, DEFAULT_LOGIN_OPTIONS } from "./constants.ts";
import { type  CdnDownloadTicket, type ItemType,  type LoginOptions, type WeChatClientConfig, type WeChatIncomingMessage } from "./types.ts";
import { MessageManager } from "./managers/MessageManager.ts";
import { CdnManager } from "./managers/CdnManager.ts";
import { getItemType, mergeObjects } from "./core/utils.ts";
import { writeFile } from "node:fs/promises";

// 导出的凭证接口，通常等于 LoginResult，但在外层改个名字语义更清晰
export interface LoginCredentials {
  token: string;
  baseUrl: string;
  accountId: string;
  userId: string;
}

interface WeChatBotEventMap {
  login: [credentials: LoginCredentials];
  message: [msg: WeChatIncomingMessage];
  text: [msg: WeChatIncomingMessage];
  file: [msg: WeChatIncomingMessage];
  image: [msg: WeChatIncomingMessage];
  video: [msg: WeChatIncomingMessage];
  error: [error: Error];
}

export class WeChatBot extends EventEmitter<WeChatBotEventMap> {
  public readonly core: WeChatCore;
  public readonly auth: AuthManager;
  public readonly messages: MessageManager;
  public readonly cdn: CdnManager;

  // 内部缓存当前的登录凭证
  private currentCredentials: LoginCredentials | null = null;

  private isPolling: boolean = false;
  private syncBuf: string = ""; // 极其重要：状态同步游标
  
  private autoDownloadMedia: boolean;

  constructor(config: Partial<WeChatClientConfig> = DEFAULT_CLIENT_CONFIG) {
    super(); // 初始化 EventEmitter

    // 合并默认配置和用户配置
    const mergedConfig = mergeObjects(DEFAULT_CLIENT_CONFIG, config);

    // 初始化网络底层
    this.core = new WeChatCore(mergedConfig);

    // 挂载领域模块
    this.auth = new AuthManager(this.core);
    this.cdn = new CdnManager(this.core);
    this.messages = new MessageManager(this.core, this.cdn);

    this.autoDownloadMedia = mergedConfig.autoDownloadMedia ?? true;

    // 如果初始化时直接传入了 token，先暂存一份不完整的凭证
    if (mergedConfig.token) {
      this.currentCredentials = {
        token: mergedConfig.token,
        baseUrl: mergedConfig.baseUrl,
        accountId: "", // 初始化时可能未知
        userId: "", // 初始化时可能未知
      };
    }
  }

  // ==========================================
  // 1. 登录模块 (支持无脑调用 & 深度定制)
  // ==========================================

  /**
   * 启动扫码登录流程。
   * @param options 可选。如果为空，将使用默认的控制台交互体验。
   */
  public async login(options: Partial<LoginOptions> = DEFAULT_LOGIN_OPTIONS): Promise<LoginCredentials> {
    // 默认的“无脑”交互实现
    const defaultOptions = mergeObjects(DEFAULT_LOGIN_OPTIONS, options);

    // 执行底层的登录逻辑
    const result = await this.auth.login(defaultOptions);

    // 登录成功后，缓存在 Bot 实例中，方便随时导出
    this.currentCredentials = result;
    this.messages.setUserId(result.userId);

    this.emit("login", this.currentCredentials); // 触发全局登录事件
    return this.currentCredentials;
  }

  public async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ==========================================
  // 2. 凭证管理模块 (导入 / 导出 / 验证)
  // ==========================================

  /**
   * 导出当前的登录凭证。
   * 开发者拿到后可以自行保存到本地文件或数据库中。
   */
  public exportCredentials(): LoginCredentials | null {
    if (!this.currentCredentials || !this.currentCredentials.token) {
      return null;
    }
    // 返回一个深拷贝，防止外部修改污染内部状态
    return { ...this.currentCredentials };
  }

  /**
   * 加载现有的登录凭证。
   * 适用于程序重启后，免扫码直接恢复状态。
   */
  public loadCredentials(credentials: LoginCredentials): void {
    this.currentCredentials = { ...credentials };

    // 同步给底层 HTTP 引擎
    this.core.setToken(credentials.token);
    this.core.setBaseUrl(credentials.baseUrl);

    this.messages.setUserId(credentials.userId);

    console.log(
      `[WeChatBot] 成功加载凭证 (AccountID: ${credentials.accountId})`,
    );
  }

  /**
   * 验证当前加载的凭证是否仍然有效。
   * @returns boolean 是否有效
   */
  public async verifyCredentials(): Promise<boolean> {
    if (!this.currentCredentials || !this.currentCredentials.token) {
      return false;
    }

    try {
      // ⚠️ 留空标注: 这里需要实现真实的有效性探测逻辑。
      // 通常的实现方案是：调用一次不需要发消息的轻量级 API 接口。
      // 比如：
      // const res = await this.core.request("ilink/bot/getconfig", { method: "POST" });
      // 如果返回错误码 (如 errcode === -14 或 HTTP 401)，则认为凭证失效。

      console.log(
        "[WeChatBot] 正在验证凭证有效性... (此接口逻辑待具体 API 完善)",
      );

      // 假设当前永远返回 true
      return true;
    } catch (error) {
      console.error("[WeChatBot] 凭证验证失败，可能已过期:", error);
      return false;
    }
  }

  // ==========================================
  // 轮询守护进程 (Daemon Loop)
  // ==========================================

  /**
   * 启动长轮询，监听新消息
   */
  public async startPolling() {
    if (this.isPolling) {
      console.warn("[WeChatBot] 轮询已经在运行中，请勿重复启动");
      return;
    }

    if (!this.currentCredentials?.token) {
      throw new Error("[WeChatBot] 无法启动轮询：尚未登录或未加载凭证");
    }

    this.isPolling = true;
    console.log("[WeChatBot] 🚀 轮询守护进程已启动，正在监听新消息...");

    while (this.isPolling) {
      try {
        // 核心：发起长轮询请求。这里会挂起长达 35 秒，直到有新消息或超时
        const response = await this.core.request<any>("ilink/bot/getupdates", {
          method: "POST",
          body: { get_updates_buf: this.syncBuf },
          timeoutMs: 35000, // 长轮询标准超时时间
        });

        // 1. 检查服务端返回的错误码 (容错处理：成功时字段可能被省略)
        const hasErrorRet = response.ret !== undefined && response.ret !== 0;
        const hasErrcode = response.errcode !== undefined && response.errcode !== 0;

        // 1. 检查服务端返回的错误码 (例如 -14 代表登录失效)
        if (hasErrorRet || hasErrcode) {
          this.isPolling = false;
          console.log(response);
          this.emit("error", new Error(`会话已失效或服务端报错 (errcode: ${response.errcode})`));
          console.error(`[WeChatBot] ❌ 轮询异常中止：${response.errmsg}`);
          break;
        }

        // 2. 更新同步游标 (无论有没有新消息，都要更新，否则会死循环拉取旧消息)
        if (response.get_updates_buf) {
          this.syncBuf = response.get_updates_buf;
        }

        // 3. 解析并分发新消息
        if (response.msgs && response.msgs.length > 0) {
          for (const rawMsg of response.msgs) {
            const parsedMsgs = this._parseIncomingMessage(rawMsg);
            if (!parsedMsgs || parsedMsgs.length === 0) continue;

            // 触发全局通用消息事件
            for (const msg of parsedMsgs) {
              this.emit("message", msg);
              this.emit(msg.msgType, msg);
            }
          }
        }

      } catch (error: any) {
        // 4. 处理客户端超时 (正常现象，继续轮询)
        if (error.name === "AbortError" || error.message.includes("timeout")) {
          // 仅仅是 35 秒内没人发消息而已，什么都不用做，继续进入下一个 while 循环
          continue;
        }

        // 处理真实的网络异常 (断网等)，退避 3 秒后重试，防止 CPU 满载
        console.error(`[WeChatBot] ⚠️ 轮询遇到网络异常，3秒后重试: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    console.log("[WeChatBot] 🛑 轮询守护进程已停止。");
  }

  /**
   * 停止长轮询
   */
  public stopPolling() {
    this.isPolling = false;
  }

  // ==========================================
  // 消息解析器 (Message Parser)
  // ==========================================

  /**
   * 将微信底层的复杂 JSON 扁平化为开发者友好的对象
   */
  private _parseIncomingMessage(raw: any): WeChatIncomingMessage[] {
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
      msgType: "unknown",
      index: 0,
      raw: raw,
    };

    for (let i = 0; i < raw.item_list.length; i++) {
      const item = raw.item_list[i];
      const itemType = getItemType(item.type);
      const msgCopy = mergeObjects(shared_data, { index: i, msgType: itemType });
      if (itemType !== "text" && itemType !== "unknown") {
        let cachedBuffer: Buffer | null = null;
        const ticket = this._extractDownloadTicket(item, itemType);
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
          // fs.writeFile 写入并返回路径
          await writeFile(savePath, buf);
          return savePath;
        }
        // 4. [核心逻辑]: 如果开启了自动下载，就在抛出事件前，在后台先下载好！
        if (this.autoDownloadMedia !== false && ticket) {
          try {
            msgCopy.getBuffer(); // 不 await，后台下载，事件照常触发
          } catch (err: any) {
            console.error(`自动下载媒体失败: ${err.message}`);
          }
        }
      }
      results.push(msgCopy);
    }
    return results;
  }

  /**
   * 从原始 JSON 中提取标准化的 CDN 下载票据
   */
  private _extractDownloadTicket(item: any, itemType: ItemType): CdnDownloadTicket | undefined {
    if(itemType === "text" || itemType === "unknown") return undefined; // 纯文本没有下载票

    if (!item.media) return undefined;
    const media = item.media;

    // 如果连基本的下载参数都没有，直接放弃
    if (!media.encrypt_query_param && !media.full_url) return undefined;

    // 2. 抹平 AES 密钥的特权差异
    let aesKeyBase64 = media.aes_key;
    
    // ⚠️ 协议特例：图片类型有时会把密钥放在外层，而且是 Hex 格式
    if (itemType === "image" && item.aeskey) {
      // 统一转成 Base64，方便 CdnManager 统一处理
      aesKeyBase64 = Buffer.from(item.aeskey, "hex").toString("base64");
    }

    // 3. 判断是否为明文传输 (某些情况下微信图片没有 aes_key)
    const isPlain = !aesKeyBase64;

    return {
      mediaType: itemType,
      fullUrl: media.full_url,
      encryptedQueryParam: media.encrypt_query_param,
      aesKeyBase64,
      isPlain,
      originalFileName: item.file_name // 仅针对文件类型有效
    };
  }

}
