// src/WeChatBot.ts
import { EventEmitter } from "node:events";
import { WeChatCore } from "./core/WeChatCore.ts";
import {
  AuthManager,
} from "./managers/AuthManager.ts";
import { DEFAULT_CLIENT_CONFIG, DEFAULT_LOGIN_OPTIONS } from "./constants.ts";
import type { LoginOptions, WeChatClientConfig } from "./types.ts";
import { MessageManager } from "./managers/MessageManager.ts";
import { CdnManager } from "./managers/CdnManager.ts";
import { mergeObjects } from "./core/utils.ts";

// 导出的凭证接口，通常等于 LoginResult，但在外层改个名字语义更清晰
export interface LoginCredentials {
  token: string;
  baseUrl: string;
  accountId: string;
  userId: string;
}

export class WeChatBot extends EventEmitter {
  public readonly core: WeChatCore;
  public readonly auth: AuthManager;
  public readonly messages: MessageManager;
  public readonly cdn: CdnManager;

  // 内部缓存当前的登录凭证
  private currentCredentials: LoginCredentials | null = null;

  constructor(config: Partial<WeChatClientConfig> = DEFAULT_CLIENT_CONFIG) {
    super(); // 初始化 EventEmitter

    // 合并默认配置和用户配置
    const mergedConfig =  mergeObjects(DEFAULT_CLIENT_CONFIG, config);

    // 初始化网络底层
    this.core = new WeChatCore(mergedConfig);

    // 挂载领域模块
    this.auth = new AuthManager(this.core);
    this.cdn = new CdnManager(this.core);
    this.messages = new MessageManager(this.core, this.cdn);

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
  // 3. 事件循环模块 (预留)
  // ==========================================
  // public async startPolling() { ... }
  // public stopPolling() { ... }
}
