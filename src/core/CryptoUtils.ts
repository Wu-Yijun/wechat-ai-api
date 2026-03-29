// src/core/CryptoUtils.ts

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { AES_BLOCK_SIZE, WECHAT_AES_ALGO } from "../constants.ts";

export class CryptoUtils {
  public static md5(buffer: Buffer): string {
    return createHash("md5").update(buffer).digest("hex");
  }

  public static generateRandomKey(length: number = 16): Buffer {
    return randomBytes(length);
  }

  public static getPaddedSize(plaintextSize: number): number {
    return Math.ceil((plaintextSize + 1) / AES_BLOCK_SIZE) * AES_BLOCK_SIZE;
  }

  public static aesEcbEncrypt(plaintext: Buffer, key: Buffer): Buffer {
    if (key.length !== AES_BLOCK_SIZE) {
      throw new Error(
        `[CryptoUtils] AES-128 密钥长度必须为 ${AES_BLOCK_SIZE} 字节，当前为 ${key.length} 字节`,
      );
    }
    const cipher = createCipheriv(WECHAT_AES_ALGO, key, null);
    return Buffer.concat([cipher.update(plaintext), cipher.final()]);
  }

  public static aesEcbDecrypt(ciphertext: Buffer, key: Buffer): Buffer {
    if (key.length !== AES_BLOCK_SIZE) {
      throw new Error(
        `[CryptoUtils] AES-128 密钥长度必须为 ${AES_BLOCK_SIZE} 字节，当前为 ${key.length} 字节`,
      );
    }
    const decipher = createDecipheriv(WECHAT_AES_ALGO, key, null);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }

  /**
   * 生成去重的客户端消息 ID
   * 格式: prefix:timestamp-randomHex
   */
  public static generateClientId(): string {
    const randomHex = randomBytes(4).toString("hex");
    return `wechat-bot:${Date.now()}-${randomHex}`;
  }

  /** 生成随机的 X-WECHAT-UIN (4字节随机数 -> uint32 -> base64) */
  public static randomWechatUin(): string {
    const uint32 = randomBytes(4).readUInt32BE(0);
    return Buffer.from(String(uint32), "utf-8").toString("base64");
  }
}
