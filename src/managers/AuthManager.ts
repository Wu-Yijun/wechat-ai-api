// src/managers/AuthManager.ts
import { WeChatCore } from "../core/WeChatCore.ts";
import type { LoginCredentials, LoginOptions, QrCodeInfo } from "../types.ts";

export class AuthManager {
  private core: WeChatCore;
  private readonly DEFAULT_BOT_TYPE = "3";
  private readonly FIXED_BASE_URL = "https://ilinkai.weixin.qq.com";

  constructor(core: WeChatCore) {
    this.core = core;
  }

  // ==========================================
  // 细粒度 API: 第一步 - 获取二维码
  // ==========================================
  public async getQrCode(): Promise<QrCodeInfo> {
    // 强制使用默认的登录网关获取二维码
    this.core.setBaseUrl(this.FIXED_BASE_URL);

    const response = await this.core.request<any>(
      `ilink/bot/get_bot_qrcode?bot_type=${this.DEFAULT_BOT_TYPE}`,
      { method: "GET", timeoutMs: 10000 },
    );

    return {
      qrcodeId: response.qrcode,
      qrcodeUrl: response.qrcode_img_content,
    };
  }

  // ==========================================
  // 细粒度 API: 第二步 - 单次轮询状态
  // ==========================================
  public async pollLoginStatus(
    qrcodeId: string,
    timeoutMs = 35000,
  ): Promise<{ status: string; data?: any }> {
    try {
      const response = await this.core.request<any>(
        `ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcodeId)}`,
        { method: "GET", timeoutMs },
      );
      return { status: response.status, data: response };
    } catch (err: any) {
      // 区分普通网络错误和长轮询的正常超时 (AbortError)
      if (err.name === "AbortError") {
        return { status: "wait" }; // 超时视为继续等待
      }
      throw err;
    }
  }

  // ==========================================
  // 粗粒度 API: 一键自动托管登录
  // ==========================================
  public async login(options: LoginOptions): Promise<LoginCredentials> {
    const maxRetries = options.maxRetries ?? 3;
    let currentRetry = 0;

    while (currentRetry <= maxRetries) {
      // 1. 获取二维码
      const qrInfo = await this.getQrCode();
      options.onQrCode(qrInfo);

      // 2. 开始持续轮询该二维码
      // 设置一个总超时，防止死循环 (比如 5 分钟二维码一定会过期)
      const qrDeadline = Date.now() + 5 * 60 * 1000;

      while (Date.now() < qrDeadline) {
        const { status, data } = await this.pollLoginStatus(
          qrInfo.qrcodeId,
          options.pollTimeoutMs,
        );

        switch (status) {
          case "wait":
            options.onStatusChange?.({
              status: "wait",
              message: "等待扫码...",
            });
            break;

          case "scaned":
            options.onStatusChange?.({
              status: "scaned",
              message: "已扫码，请在手机端确认...",
            });
            break;

          case "scaned_but_redirect":
            if (data.redirect_host) {
              const newBaseUrl = `https://${data.redirect_host}`;
              this.core.setBaseUrl(newBaseUrl); // 关键：更新底层引擎的 BaseUrl
              options.onStatusChange?.({
                status: "scaned_but_redirect",
                message: `服务器要求重定向至: ${newBaseUrl}`,
                redirect_host: data.redirect_host,
              });
            }
            break;

          case "confirmed":
            options.onStatusChange?.({
              status: "confirmed",
              message: "登录成功！",
              bot_token: data.bot_token,
              baseurl: data.baseurl,
              ilink_bot_id: data.ilink_bot_id,
              ilink_user_id: data.ilink_user_id,
            });

            // 关键：自动将获取到的凭据注入到底层引擎中
            this.core.setToken(data.bot_token);
            if (data.baseurl) {
              this.core.setBaseUrl(data.baseurl);
            }
            console.warn("debug", data);

            // 返回凭据给开发者，以便他们持久化存储
            return {
              token: data.bot_token,
              baseUrl: data.baseurl || this.core.getBaseUrl(),
              accountId: data.ilink_bot_id,
              userId: data.ilink_user_id,
            };

          case "expired":
            options.onStatusChange?.({
              status: "expired",
              message: "二维码已过期，正在重新获取...",
            });
            // 跳出内层轮询，触发外层循环重新获取二维码
            break;

          default:
            // 未知状态，稍作延迟后继续尝试
            await new Promise((res) => setTimeout(res, 1000));
        }

        if (status === "expired") {
          break; // 跳出内层 while 循环
        }

        // 防御性延迟，避免请求过于频繁
        await new Promise((res) => setTimeout(res, 1000));
      }

      currentRetry++;
    }

    throw new Error(
      `登录失败：二维码已过期并超过最大重试次数 (${maxRetries}次)。`,
    );
  }
}
