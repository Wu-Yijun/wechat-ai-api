// src/core/CryptoUtils.ts
import crypto from "node:crypto";

export class CryptoUtils {

  public static md5(buffer: Buffer): string {
    return crypto.createHash("md5").update(buffer).digest("hex");
  }

  public static generateRandomKey(length: number = 16): Buffer {
    return crypto.randomBytes(length);
  }

  public static getPaddedSize(plaintextSize: number): number {
    return Math.ceil((plaintextSize + 1) / 16) * 16;
  }

  public static aesEcbEncrypt(plaintext: Buffer, key: Buffer): Buffer {
    if (key.length !== 16) {
      throw new Error(`[CryptoUtils] AES-128 密钥长度必须为 16 字节，当前为 ${key.length} 字节`);
    }
    const cipher = crypto.createCipheriv("aes-128-ecb", key, null);
    return Buffer.concat([cipher.update(plaintext), cipher.final()]);
  }

  public static aesEcbDecrypt(ciphertext: Buffer, key: Buffer): Buffer {
    if (key.length !== 16) {
      throw new Error(`[CryptoUtils] AES-128 密钥长度必须为 16 字节，当前为 ${key.length} 字节`);
    }
    const decipher = crypto.createDecipheriv("aes-128-ecb", key, null);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }
}