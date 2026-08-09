# linux.sb.js

面向 [LINUX SB](https://linux.sb/)（bbs1 / v8.x）的油猴脚本，增强帖文阅读与发帖体验。

## 安装

推荐直接打开安装链接（扩展会接管）：

<https://raw.githubusercontent.com/steve02081504/linux.sb.js/master/linux.sb.user.js>

或：

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) / [Violentmonkey](https://violentmonkey.github.io/)
2. 新建脚本，粘贴 [`linux.sb.user.js`](linux.sb.user.js) 全文并保存
3. 打开 `https://linux.sb/*`，首次拉外站标题时按提示允许跨域（`GM_xmlhttpRequest`）

脚本带 `@updateURL` / `@downloadURL`，扩展会按 `@version` 自动检查更新。合并到 `master` 且版本号升高后才会推到用户。

## 功能

| 功能           | 行为                                                                                                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Markdown       | `.post-content` 内帖文按 GFM 渲染（标题、引用、表格、任务列表等）；正文含 `$…$` / ` ```mermaid ` / 其它代码围栏时按需从 CDN 加载 KaTeX、mermaid、Shiki；HTML 经消毒（禁 `<script>`、`javascript:` 等） |
| 深色模式       | 默认开启（`html.lsb-dark`），顶栏有「浅色 / 深色」切换，偏好写入 `localStorage`（`lsb-theme`）                                                                                                         |
| Ctrl/Cmd+Enter | 在输入框中提交：点击离当前输入最近的 submit（优先同 form 内）                                                                                                                                          |
| URL 增强       | 帖内裸 `http(s)://` 链化并标蓝，尝试拉取 favicon + 页面标题；`code` / `pre` / 已有链接内不重复处理                                                                                                     |
| 图片内联       | 指向常见图片后缀（avif/bmp/gif/jpeg/png/svg/webp）的 URL 在帖内直接显示                                                                                                                                |
| 悬浮预览       | `@用户`、`@用户 #楼层`、作者名、站内主题/用户/楼层链悬停显示资料卡；同页楼层优先读 DOM，减少请求                                                                                                       |
| GitHub         | 仓库 / Issue / PR / commit / blob 文件在帖内展开卡片；commit 显示标题、作者、±行；blob 支持 `#L12` / `#L12-L20` 行范围预览；图片走 raw 内联                                                            |

AJAX 追加的新楼层也会自动处理（`MutationObserver` 监听 `.post-content`）。

Markdown 解析依赖 [esm.sh](https://esm.sh) 与 [jsDelivr](https://www.jsdelivr.com/) CDN；CDN 不可用时该帖保持纯文本并继续 linkify，不影响其它功能。

## 开发

```bash
npm i
npm run build   # src/ → linux.sb.user.js
```

| 路径                           | 说明                                                        |
| ------------------------------ | ----------------------------------------------------------- |
| `src/main.mjs`                 | 入口：注入 CSS、启动各模块、`MutationObserver`              |
| `src/meta.mjs`                 | UserScript 头；**改 `@version` 在这里**                     |
| `src/constants.mjs`            | 正则、常量、缓存 Map                                        |
| `src/util.mjs` / `src/net.mjs` | 工具函数；`gmGet` / `siteGet` / `ghApi` / `fetchMeta`（HEAD→GET） |
| `src/theme/`                   | 深色模式                                                    |
| `src/markdown/`                | 帖文 Markdown 渲染（先于 linkify）                          |
| `src/linkify/`                 | 外链增强、图片内联、调度 GitHub 卡片                        |
| `src/tip/`                     | 站内悬浮卡                                                  |
| `src/github/`                  | GitHub 内联卡片                                             |
| `src/submit/`                  | Ctrl+Enter 提交                                             |
| `build.mjs`                    | esbuild 打包为 tab 缩进的单文件 IIFE                        |
| `linux.sb.user.js`             | 构建产物（安装用，请一并提交）                              |
| `AGENTS.md`                    | 给后续改脚本的 agent 看的备忘（DOM 约定、常见坑、验证清单） |

有可感知改动时记得 bump `src/meta.mjs` 的 `@version`（semver），再 `npm run build` 并提交产物。
