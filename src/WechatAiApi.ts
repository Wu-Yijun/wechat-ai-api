import { EventEmitter } from "node:events";

import { WeChatCore } from "./core/WeChatCore.ts";
import { AuthManager } from "./managers/AuthManager.ts";
import { MessageManager } from "./managers/MessageManager.ts";
import { CdnManager } from "./managers/CdnManager.ts";
import { mergeObjects } from "./core/utils.ts";
import { DEFAULT_CLIENT_CONFIG, DEFAULT_LOGIN_OPTIONS } from "./constants.ts";
import type {
  LoginCredentials,
  LoginOptions,
  WeChatClientConfig,
  WeChatIncomingMessage,
} from "./types.ts";
import { MessageParser } from "./managers/MessageParser.ts";


interface WeChatApiEventMap {
  login: [credentials: LoginCredentials];
  message: [msg: WeChatIncomingMessage];
  text: [msg: WeChatIncomingMessage];
  file: [msg: WeChatIncomingMessage];
  image: [msg: WeChatIncomingMessage];
  video: [msg: WeChatIncomingMessage];
  voice: [msg: WeChatIncomingMessage];
  error: [error: Error];
}

export class WeChatApi extends EventEmitter<WeChatApiEventMap> {
  public readonly core: WeChatCore;
  public readonly auth: AuthManager;
  public readonly messages: MessageManager;
  public readonly parser: MessageParser;
  public readonly cdn: CdnManager;

  // 内部缓存当前的登录凭证
  private currentCredentials: LoginCredentials | null = null;

  private isPolling: boolean = false;
  private syncBuf: string = ""; // 极其重要：状态同步游标

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
    this.parser = new MessageParser(this.cdn, mergedConfig);

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
  public async login(
    options: Partial<LoginOptions> = DEFAULT_LOGIN_OPTIONS,
  ): Promise<LoginCredentials> {
    // 默认的“无脑”交互实现
    const defaultOptions = mergeObjects(DEFAULT_LOGIN_OPTIONS, options);

    // 执行底层的登录逻辑
    const result = await this.auth.login(defaultOptions);

    // 登录成功后，缓存在 Bot 实例中，方便随时导出
    this.currentCredentials = result;

    this.emit("login", this.currentCredentials); // 触发全局登录事件
    return this.currentCredentials;
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
    this.core.setUserId(credentials.userId);

    console.log(
      `[WeChatApi] 成功加载凭证 (AccountID: ${credentials.accountId})`,
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
        "[WeChatApi] 正在验证凭证有效性... (此接口逻辑待具体 API 完善)",
      );

      // 假设当前永远返回 true
      return true;
    } catch (error) {
      console.error("[WeChatApi] 凭证验证失败，可能已过期:", error);
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
      console.warn("[WeChatApi] 轮询已经在运行中，请勿重复启动");
      return;
    }

    if (!this.currentCredentials?.token) {
      throw new Error("[WeChatApi] 无法启动轮询：尚未登录或未加载凭证");
    }

    this.isPolling = true;
    console.log("[WeChatApi] 🚀 轮询守护进程已启动，正在监听新消息...");

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
        const hasErrcode = response.errcode !== undefined &&
          response.errcode !== 0;

        // 1. 检查服务端返回的错误码 (例如 -14 代表登录失效)
        if (hasErrorRet || hasErrcode) {
          this.isPolling = false;
          console.log(response);
          this.emit(
            "error",
            new Error(`会话已失效或服务端报错 (errcode: ${response.errcode})`),
          );
          console.error(`[WeChatApi] ❌ 轮询异常中止：${response.errmsg}`);
          break;
        }

        // 2. 更新同步游标 (无论有没有新消息，都要更新，否则会死循环拉取旧消息)
        if (response.get_updates_buf) {
          this.syncBuf = response.get_updates_buf;
        }

        // 3. 解析并分发新消息
        if (response.msgs && response.msgs.length > 0) {
          for (const rawMsg of response.msgs) {
            const parsedMsgs = await this.parser.parse(rawMsg);
            if (!parsedMsgs || parsedMsgs.length === 0) continue;

            // 触发全局通用消息事件
            for (const msg of parsedMsgs) {
              this.emit("message", msg);
              if (msg.msgType && msg.msgType !== "unknown") this.emit(msg.msgType, msg);
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
        console.error(
          `[WeChatApi] ⚠️ 轮询遇到网络异常，3秒后重试: ${error.message}`,
        );
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }

    console.log("[WeChatApi] 🛑 轮询守护进程已停止。");
  }

  /**
   * 停止长轮询
   */
  public stopPolling() {
    this.isPolling = false;
  }

}
