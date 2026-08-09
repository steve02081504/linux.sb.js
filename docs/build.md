# 构建细节

改 `build.mjs` 或 UserScript 头 / `/* global … */` 时再读。

## `/* global … */`

不是 esbuild legal comment，普通块注释会被丢掉。须走 `build.mjs` 的 `preserve-comments` 插件（注入 `@preserve` 再还原）。改插件后确认产物里仍有 `/* global GM_xmlhttpRequest */`。

## 产物约定

- 单文件 IIFE + UserScript 头
- **tab** 缩进（esbuild 默认空格，构建脚本会再转）
- 不要手改根目录 `linux.sb.user.js`
