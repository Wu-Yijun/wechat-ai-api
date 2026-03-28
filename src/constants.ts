import type { LoginOptions, WeChatClientConfig } from "./types.ts";

export const DEFAULT_CLIENT_CONFIG: WeChatClientConfig = {
  appId: "bot",
  version: "2.1.1",
  baseUrl: "https://ilinkai.weixin.qq.com",
  autoDownloadMedia: true,
};

export const DEFAULT_LOGIN_OPTIONS: LoginOptions = {
  maxRetries: 3,
  pollTimeoutMs: 35000,
  onQrCode: (qrInfo) => {
    console.log("\n==========================================");
    console.log("请在浏览器中打开以下链接，并使用微信扫码：");
    console.log(qrInfo.qrcodeUrl);
    console.log("==========================================\n");
  },
  onStatusChange: (payload) => {
    switch (payload.status) {
      case "wait":
        process.stdout.write("."); // 简易的 loading 动画
        break;
      case "scaned":
        console.log("\n👀 已扫码，请在手机微信上点击确认登录...");
        break;
      case "confirmed":
        console.log(
          "\n已链接, 但需手动在微信发送第一条消息后, bot 才能正常回复",
        );
        break;
      case "scaned_but_redirect":
        console.log(`\n[系统] ${payload.message}`);
        break;
    }
  },
};
