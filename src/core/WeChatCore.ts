// src/core/WeChatCore.ts
import { CryptoUtils } from "./CryptoUtils.ts";
import { buildClientVersion } from "./utils.ts";
import type { CoreRequestOptions, WeChatClientConfig } from "../types.ts";

export class WeChatCore {
  private config: WeChatClientConfig;
  private clientVersionInt: number;

  constructor(config: WeChatClientConfig) {
    this.config = { ...config };
    // 预计算版本号整数，避免每次发请求都算一遍
    this.clientVersionInt = buildClientVersion(config.version);
  }

  // ==========================================
  // 状态修改器 (Mutators)
  // ==========================================

  /** 设置或更新登录凭证 */
  public setToken(token: string): void {
    this.config.token = token;
  }

  /** 更新基础网关 URL (用于处理 IDC 重定向) */
  public setBaseUrl(baseUrl: string): void {
    this.config.baseUrl = baseUrl;
  }

  public setUserId(userId: string): void {
    this.config.userId = userId;
  }

  /** 获取当前的 BaseUrl (供某些需要拼接绝对路径的特殊场景使用) */
  public getBaseUrl(): string {
    return this.config.baseUrl;
  }

  /** 获取当前的用户 ID */
  public getUserId(): string | undefined {
    return this.config.userId;
  }

  // ==========================================
  // 核心请求发射器
  // ==========================================

  /**
   * 统一的 HTTP 请求方法
   * @param endpoint 接口路径，例如 "ilink/bot/sendmessage"
   * @param options 请求配置 (方法、请求体、超时设置)
   */
  public async request<T>(
    endpoint: string,
    options: CoreRequestOptions,
  ): Promise<T> {
    // 1. URL 拼接处理
    const base = this.config.baseUrl.endsWith("/")
      ? this.config.baseUrl
      : `${this.config.baseUrl}/`;
    const url = new URL(endpoint, base);

    // 2. 构造最终的请求体 (如果是 POST，自动注入 base_info)
    let finalBodyString: string | undefined = undefined;

    if (options.method === "POST" && options.body) {
      // 浅拷贝一层，防止污染调用方传入的原始对象
      const payload = { ...options.body };
      payload.base_info = { channel_version: this.config.version };
      finalBodyString = JSON.stringify(payload);
    } else if (options.method === "POST" && !options.body) {
      // 即使没有具体业务参数，POST 请求通常也需要 base_info
      finalBodyString = JSON.stringify({
        base_info: { channel_version: this.config.version },
      });
    }

    // 3. 构造请求头
    const headers = this.buildHeaders(finalBodyString);

    // 4. 设置超时控制器
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs);

    // 5. 执行请求
    try {
      const response = await fetch(url.toString(), {
        method: options.method,
        headers: headers,
        body: finalBodyString,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const rawText = await response.text();

      // 非 200 状态码直接抛出异常，交给上层业务处理
      if (!response.ok) {
        throw new Error(
          `WeChat API Error [${options.method} ${endpoint}] HTTP ${response.status}: ${rawText}`,
        );
      }

      // 如果有返回值则解析，无返回值(如 sendmessage)则返回空对象
      return rawText ? JSON.parse(rawText) as T : ({} as T);
    } catch (err) {
      clearTimeout(timeoutId);
      // 将底层的网络异常原样抛出，如果是 AbortError (超时)，上层(如长轮询)可以特别捕获它
      throw err;
    }
  }

  // ==========================================
  // 私有辅助方法
  // ==========================================

  /** 构造标准请求头 */
  private buildHeaders(bodyString?: string): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "AuthorizationType": "ilink_bot_token",
      "X-WECHAT-UIN": CryptoUtils.randomWechatUin(),
      "iLink-App-Id": this.config.appId,
      "iLink-App-ClientVersion": String(this.clientVersionInt),
    };

    if (bodyString) {
      headers["Content-Length"] = String(
        Buffer.byteLength(bodyString, "utf-8"),
      );
    }

    if (this.config.token?.trim()) {
      headers["Authorization"] = `Bearer ${this.config.token.trim()}`;
    }

    return headers;
  }
}
