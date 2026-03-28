// src/core/CryptoUtils.ts
import crypto from "node:crypto";

export class CryptoUtils {
  /**
   * 计算 Buffer 的 MD5 值，返回 32 位小写 Hex 字符串
   * 微信 API 需要这个值来校验文件完整性 (`rawfilemd5`)
   */
  public static md5(buffer: Buffer): string {
    return crypto.createHash("md5").update(buffer).digest("hex");
  }

  /**
   * 生成安全的随机字节序列
   * 微信要求 aeskey 和 filekey 都是 16 字节 (128 bits)
   */
  public static generateRandomKey(length: number = 16): Buffer {
    return crypto.randomBytes(length);
  }

  /**
   * 提前计算文件加密后的精准大小 (AES-128-ECB + PKCS7 Padding)
   * * ⚠️ 核心坑点说明：
   * 微信 API 要求在获取上传门票 (getuploadurl) 时，就必须上报加密后的 filesize。
   * AES 加密是按块 (16字节) 进行的。Node.js 默认使用 PKCS7 填充规则：
   * 1. 如果文件差 5 个字节满 16 字节，就会填充 5 个 0x05。
   * 2. 如果文件刚好是 16 字节的整数倍，它**绝不会**不填充，而是会硬生生再加一整个 16 字节的块 (填充 16 个 0x10)。
   * 所以，无论如何，加密后的体积一定会比原体积大 1 ~ 16 字节。
   */
  public static getPaddedSize(plaintextSize: number): number {
    // 算法逻辑：(原始大小 + 1) 除以 16 向上取整，再乘回 16
    return Math.ceil((plaintextSize + 1) / 16) * 16;
  }

  /**
   * 使用 AES-128-ECB 算法加密 Buffer
   * * ⚠️ 核心坑点说明：
   * Node.js 的 createCipheriv 原本要求传入 (算法, 密钥, IV)。
   * 但是 ECB 模式是没有 IV (初始化向量) 的！
   * 所以在这里，第三个参数我们必须显式传入 null 或者空的 Buffer。
   */
  public static aesEcbEncrypt(plaintext: Buffer, key: Buffer): Buffer {
    if (key.length !== 16) {
      throw new Error(`[CryptoUtils] AES-128 密钥长度必须为 16 字节，当前为 ${key.length} 字节`);
    }

    // 第三个参数传 null 代表没有 IV
    const cipher = crypto.createCipheriv("aes-128-ecb", key, null);
    
    // Node.js 默认开启了 autoPadding (即 PKCS7)，所以我们直接塞 Buffer 进去就行
    return Buffer.concat([cipher.update(plaintext), cipher.final()]);
  }

  /**
   * 使用 AES-128-ECB 算法解密 Buffer
   * (未来如果你要做“下载微信图片/文件”的功能，就会用到这个)
   */
  public static aesEcbDecrypt(ciphertext: Buffer, key: Buffer): Buffer {
    if (key.length !== 16) {
      throw new Error(`[CryptoUtils] AES-128 密钥长度必须为 16 字节，当前为 ${key.length} 字节`);
    }

    const decipher = crypto.createDecipheriv("aes-128-ecb", key, null);
    
    // 自动移除 PKCS7 填充
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }
}