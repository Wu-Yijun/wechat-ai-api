// src/core/SilkConverter.ts

import { WECHAT_SILK_SAMPLE_RATE } from "../constants.ts";

/**
 * Wrap raw pcm_s16le bytes in a WAV container.
 * Mono channel, 16-bit signed little-endian.
 */
function pcmBytesToWav(pcm: Uint8Array, sampleRate: number): Buffer {
  const pcmBytes = pcm.byteLength;
  const totalSize = 44 + pcmBytes;
  const buf = Buffer.allocUnsafe(totalSize);
  let offset = 0;

  buf.write("RIFF", offset);
  offset += 4;
  buf.writeUInt32LE(totalSize - 8, offset);
  offset += 4;
  buf.write("WAVE", offset);
  offset += 4;

  buf.write("fmt ", offset);
  offset += 4;
  buf.writeUInt32LE(16, offset);
  offset += 4; // fmt chunk size
  buf.writeUInt16LE(1, offset);
  offset += 2; // PCM format
  buf.writeUInt16LE(1, offset);
  offset += 2; // mono
  buf.writeUInt32LE(sampleRate, offset);
  offset += 4;
  buf.writeUInt32LE(sampleRate * 2, offset);
  offset += 4; // byte rate (mono 16-bit)
  buf.writeUInt16LE(2, offset);
  offset += 2; // block align
  buf.writeUInt16LE(16, offset);
  offset += 2; // bits per sample

  buf.write("data", offset);
  offset += 4;
  buf.writeUInt32LE(pcmBytes, offset);
  offset += 4;

  Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength).copy(buf, offset);

  return buf;
}

export async function silkToWav(
  silkBuffer: Buffer,
  sampleRate: number = WECHAT_SILK_SAMPLE_RATE,
): Promise<Buffer | null> {
  try {
    const { decode } = await import("silk-wasm");
    const result = await decode(silkBuffer, sampleRate);
    const wav = pcmBytesToWav(result.data, sampleRate);
    return wav;
  } catch (err) {
    return null;
  }
}
