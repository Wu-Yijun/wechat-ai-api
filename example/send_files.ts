import { readFileSync, writeFileSync } from "node:fs";
import { WeChatBot } from "../src/WechatAiApi.ts";
import { join } from "node:path";

const bot = new WeChatBot();
const credentials = JSON.parse(readFileSync("./session.json", "utf-8"));
bot.loadCredentials(credentials);

const pdf = join(import.meta.dirname, "sample_file", "example.pdf");
const mp3 = join(import.meta.dirname, "sample_file", "example.mp3");
const mp4 = join(import.meta.dirname, "sample_file", "example.mp4");
const jpg = join(import.meta.dirname, "sample_file", "example.jpg");

// send file
const ret_pdf = await bot.messages.sendFile(pdf, { caption: "[Optional] Caption text for the file." });
const ret_mp3 = await bot.messages.sendFile(mp3);
const ret_mp4 = await bot.messages.sendVideo(mp4);
const ret_jpg = await bot.messages.sendImage(jpg, { caption: "This is an image file." });

console.log("Send result:", { ret_pdf, ret_mp3,  ret_mp4, ret_jpg });

