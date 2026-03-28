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
