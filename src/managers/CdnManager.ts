// src/managers/CdnManager.ts
import { WeChatCore } from "../core/WeChatCore.ts";
import { CryptoUtils } from "../core/CryptoUtils.ts";
import type { UploadMediaType, CdnFileTicket, CdnDownloadTicket } from "../types.ts";

export class CdnManager {
  private core: WeChatCore;

  // 📝 [待重构]: 未来这个值可以从 WeChatBotOptions 中读取
  private readonly DEFAULT_CDN_BASE_URL = "https://cdn.weixin.qq.com";

  constructor(core: WeChatCore) {
    this.core = core;
  }

  // ==========================================
  // 核心流水线：上传二进制流到 CDN
  // ==========================================

  /**
   * 将任意 Buffer 上传至微信 CDN，并返回发送消息所需的凭证
   * @param buffer 文件的二进制原始数据
   * @param toUserId 接收人的微信 ID (CDN 强制要求绑定)
   * @param mediaType 媒体类型 (IMAGE, VIDEO, FILE, VOICE)
   */
  public async uploadBuffer(
    buffer: Buffer,
    toUserId: string,
    mediaType: UploadMediaType
  ): Promise<CdnFileTicket> {

    // --------------------------------------------------
    // Step 1: 准备元数据与加密密钥
    // --------------------------------------------------
    const rawsize = buffer.length;
    const rawfilemd5 = CryptoUtils.md5(buffer);
    const filesize = CryptoUtils.getPaddedSize(rawsize); // AES 加密后的对齐大小

    // 微信要求 aeskey 和 filekey 都是 16 字节
    const filekey = CryptoUtils.generateRandomKey(16).toString("hex");
    const aeskeyBuffer = CryptoUtils.generateRandomKey(16);
    const aeskeyHex = aeskeyBuffer.toString("hex");

    // --------------------------------------------------
    // Step 2: 访问控制面，申请上传门票 (Upload URL)
    // --------------------------------------------------
    const uploadUrlResp = await this.core.request<any>("ilink/bot/getuploadurl", {
      method: "POST",
      body: {
        filekey,
        media_type: mediaType,
        to_user_id: toUserId,
        rawsize,
        rawfilemd5,
        filesize,
        no_need_thumb: true, // 📝 [待重构]: 暂时忽略缩略图逻辑，全部设为 true
        aeskey: aeskeyHex,
      },
      timeoutMs: 15_000,
    });

    // 解析出真实的 CDN 地址
    // 微信有时候返回完整的 URL (upload_full_url)，有时候只返回 query 参数 (upload_param)
    let cdnUrl = "";
    if (uploadUrlResp.upload_full_url?.trim()) {
      cdnUrl = uploadUrlResp.upload_full_url.trim();
    } else if (uploadUrlResp.upload_param) {
      cdnUrl = `${this.DEFAULT_CDN_BASE_URL}/upload?encrypted_query_param=${encodeURIComponent(uploadUrlResp.upload_param)}&filekey=${encodeURIComponent(filekey)}`;
    } else {
      throw new Error(`[CdnManager] 获取上传地址失败，API 响应缺少 full_url 或 upload_param`);
    }

    // --------------------------------------------------
    // Step 3: 数据面加密
    // --------------------------------------------------
    const ciphertextBuffer = CryptoUtils.aesEcbEncrypt(buffer, aeskeyBuffer);

    // --------------------------------------------------
    // Step 4: 物理传输至 CDN (带重试机制)
    // --------------------------------------------------
    const encryptedQueryParam = await this.postToCdn(ciphertextBuffer, cdnUrl);

    // --------------------------------------------------
    // Step 5: 组装凭证交付给 MessageManager
    // --------------------------------------------------
    return {
      filekey,
      aeskeyHex,
      aeskeyBuffer,
      fileSizePlain: rawsize,
      fileSizeCipher: filesize,
      encryptedQueryParam
    };
  }


  // ==========================================
  // 私有发包器：专门应对奇葩的 CDN 接口
  // ==========================================

  /**
   * 将密文 POST 到 CDN，并从 Response Header 中抠出下载参数。
   * 包含 4xx 直接报错、5xx 重试的逻辑。
   */
  private async postToCdn(ciphertext: Buffer, cdnUrl: string): Promise<string> {
    const MAX_RETRIES = 3; // 📝 [待重构]: 可提取为常量

    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(cdnUrl, {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: new Uint8Array(ciphertext),
        });

        // 1. 客户端错误 (4xx)：比如鉴权失败、参数错误，重试也没用，直接抛出
        if (res.status >= 400 && res.status < 500) {
          const errMsg = res.headers.get("x-error-message") ?? (await res.text());
          throw new Error(`[CdnClientError] HTTP ${res.status}: ${errMsg}`);
        }

        // 2. 服务端错误 (5xx)：比如网关超时，尝试重试
        if (res.status !== 200) {
          const errMsg = res.headers.get("x-error-message") ?? `HTTP ${res.status}`;
          throw new Error(`[CdnServerError]: ${errMsg}`);
        }

        // 3. 成功！从 Header 中寻找那把“钥匙”
        const downloadParam = res.headers.get("x-encrypted-param");
        if (!downloadParam) {
          throw new Error("[CdnManager] 上传成功，但响应头中缺少 x-encrypted-param");
        }

        return downloadParam;

      } catch (err: any) {
        lastError = err;

        // 如果是 4xx 错误，立刻中断循环，不进行无意义的重试
        if (err.message && err.message.includes("[CdnClientError]")) {
          throw err;
        }

        // 否则等待一会儿继续重试 (简易退避)
        if (attempt < MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    throw new Error(`[CdnManager] CDN 上传失败，已重试 ${MAX_RETRIES} 次。最后错误: ${(lastError as Error)?.message}`);
  }

  // ==========================================
  // 核心流水线：从 CDN 下载并解密
  // ==========================================

  /**
     * 唯一对内暴露的下载引擎
     * 负责拉取字节流并根据协议规范进行解密
     */
  public async downloadBuffer(ticket: CdnDownloadTicket): Promise<Buffer> {
    // 1. 确定最终的下载 URL (优先使用 fullUrl)
    let url = "";
    if (ticket.fullUrl) {
      url = ticket.fullUrl;
    } else if (ticket.encryptedQueryParam) {
      // 如果没有 fullUrl，就按照规则拼接
      url = `${this.DEFAULT_CDN_BASE_URL}/download?encrypted_query_param=${encodeURIComponent(ticket.encryptedQueryParam)}`;
    } else {
      throw new Error("[CdnManager] 下载失败：缺少 fullUrl 和 encryptedQueryParam");
    }

    // 2. 发起网络请求，拉取原始的 ArrayBuffer
    const encryptedBuffer = await this.fetchCdnBytes(url);

    // 3. 明文回退：如果协议表明这是明文传输（没有密钥），直接返回
    if (ticket.isPlain || !ticket.aesKeyBase64) {
      return encryptedBuffer;
    }

    // 4. 解析变态的微信 AES 密钥
    const aesKey = this.parseWechatAesKey(ticket.aesKeyBase64);

    // 5. 使用密码学工具箱进行 AES-128-ECB 解密
    return CryptoUtils.aesEcbDecrypt(encryptedBuffer, aesKey);
  }

  // ==========================================
  // 私有辅助方法
  // ==========================================

  /**
   * 处理微信极其不一致的密钥编码：
   * 情况A: base64( raw 16 bytes )
   * 情况B: base64( hex string of 16 bytes )
   */
  private parseWechatAesKey(aesKeyBase64: string): Buffer {
    const decoded = Buffer.from(aesKeyBase64, "base64");

    // 如果解密出来正好是 16 字节的二进制，直接用
    if (decoded.length === 16) {
      return decoded;
    }

    // 如果解密出来是 32 个字符，并且全是十六进制字符，说明它被二次 Hex 编码了
    if (decoded.length === 32 && /^[0-9a-fA-F]{32}$/i.test(decoded.toString("ascii"))) {
      return Buffer.from(decoded.toString("ascii"), "hex");
    }

    throw new Error(`[CdnManager] 无法解析的 AES 密钥格式 (Base64="${aesKeyBase64}")`);
  }

  /**
   * 原生 fetch 拉取二进制字节流
   */
  private async fetchCdnBytes(url: string): Promise<Buffer> {
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "(unreadable)");
      throw new Error(`[CdnManager] CDN 下载网络错误 HTTP ${res.status}: ${body}`);
    }
    return Buffer.from(await res.arrayBuffer());
  }
}