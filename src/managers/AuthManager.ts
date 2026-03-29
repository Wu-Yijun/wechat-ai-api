// src/managers/AuthManager.ts
import {
  BACKOFF_BASE_MS,
  DEFAULT_LOGIN_MAX_RETRIES,
  DEFAULT_REQUEST_TIMEOUT_MS,
  LONG_POLLING_TIMEOUT_MS,
  QR_CODE_EXPIRATION_MS,
} from "../constants.ts";
import { WeChatCore } from "../core/WeChatCore.ts";
import {
  type LoginCredentials,
  type LoginOptions,
  LoginStatus,
  type QrCodeInfo,
} from "../types.ts";

export class AuthManager {
  private core: WeChatCore;

  constructor(core: WeChatCore) {
    this.core = core;
  }

  // ==========================================
  // 细粒度 API: 第一步 - 获取二维码
  // ==========================================
  public async getQrCode(): Promise<QrCodeInfo> {
    // 强制使用默认的登录网关获取二维码
    this.core.setBaseUrl(this.core.getBaseUrl()); // 触发内部状态更新，确保使用默认 BaseUrl

    const response = await this.core.request<any>(
      `ilink/bot/get_bot_qrcode?bot_type=${this.core.getBotType()}`,
      { method: "GET", timeoutMs: DEFAULT_REQUEST_TIMEOUT_MS },
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
    timeoutMs = LONG_POLLING_TIMEOUT_MS,
  ): Promise<{ status: LoginStatus; data?: any }> {
    try {
      const response = await this.core.request<any>(
        `ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcodeId)}`,
        { method: "GET", timeoutMs },
      );
      return { status: response.status, data: response };
    } catch (err: any) {
      // 区分普通网络错误和长轮询的正常超时 (AbortError)
      if (err.name === "AbortError") {
        return { status: LoginStatus.WAIT }; // 超时视为继续等待
      }
      throw err;
    }
  }

  // ==========================================
  // 粗粒度 API: 一键自动托管登录
  // ==========================================
  public async login(options: LoginOptions): Promise<LoginCredentials> {
    const maxRetries = options.maxRetries ?? DEFAULT_LOGIN_MAX_RETRIES;
    let currentRetry = 0;

    while (currentRetry <= maxRetries) {
      // 1. 获取二维码
      const qrInfo = await this.getQrCode();
      options.onQrCode(qrInfo);

      // 2. 开始持续轮询该二维码
      // 设置一个总超时，防止死循环 (比如 5 分钟二维码一定会过期)
      const qrDeadline = Date.now() + QR_CODE_EXPIRATION_MS;

      while (Date.now() < qrDeadline) {
        const { status, data } = await this.pollLoginStatus(
          qrInfo.qrcodeId,
          options.pollTimeoutMs,
        );

        switch (status) {
          case LoginStatus.WAIT:
            options.onStatusChange?.({
              status: LoginStatus.WAIT,
              message: "等待扫码...",
            });
            break;

          case LoginStatus.SCANNED:
            options.onStatusChange?.({
              status: LoginStatus.SCANNED,
              message: "已扫码，请在手机端确认...",
            });
            break;

          case LoginStatus.REDIRECT:
            if (data.redirect_host) {
              const newBaseUrl = `https://${data.redirect_host}`;
              this.core.setBaseUrl(newBaseUrl); // 关键：更新底层引擎的 BaseUrl
              options.onStatusChange?.({
                status: LoginStatus.REDIRECT,
                message: `服务器要求重定向至: ${newBaseUrl}`,
                redirect_host: data.redirect_host,
              });
            }
            break;

          case LoginStatus.CONFIRMED:
            options.onStatusChange?.({
              status: LoginStatus.CONFIRMED,
              message: "登录成功！",
              bot_token: data.bot_token,
              baseurl: data.baseurl,
              ilink_bot_id: data.ilink_bot_id,
              ilink_user_id: data.ilink_user_id,
            });

            // 关键：自动将获取到的凭据注入到底层引擎中
            this.core.setToken(data.bot_token);
            this.core.setUserId(data.ilink_user_id);
            if (data.baseurl) {
              this.core.setBaseUrl(data.baseurl);
            }

            // 返回凭据给开发者，以便他们持久化存储
            return {
              token: data.bot_token,
              baseUrl: data.baseurl || this.core.getBaseUrl(),
              accountId: data.ilink_bot_id,
              userId: data.ilink_user_id,
            };

          case LoginStatus.EXPIRED:
            options.onStatusChange?.({
              status: LoginStatus.EXPIRED,
              message: "二维码已过期，正在重新获取...",
            });
            // 跳出内层轮询，触发外层循环重新获取二维码
            break;

          default:
            // 未知状态，稍作延迟后继续尝试
            await new Promise((res) => setTimeout(res, BACKOFF_BASE_MS));
        }

        if (status === LoginStatus.EXPIRED) {
          break; // 跳出内层 while 循环
        }

        // 防御性延迟，避免请求过于频繁
        await new Promise((res) => setTimeout(res, BACKOFF_BASE_MS));
      }

      currentRetry++;
    }

    throw new Error(
      `登录失败：二维码已过期并超过最大重试次数 (${maxRetries}次)。`,
    );
  }
}
