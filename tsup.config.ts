import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'], // 入口文件
  format: ['esm'],         // 因为我们的 package.json 是 type: module，所以只输出 ESM 格式
  dts: true,               // 自动生成 .d.ts 类型声明文件
  splitting: false,        // 关闭代码分割
  sourcemap: true,         // 生成 sourcemap，方便使用者调试报错位置
  clean: true,             // 每次打包前自动清理 dist 目录
  minify: true,           // 作为一个 Node 库，不压缩代码方便别人阅读源码
});