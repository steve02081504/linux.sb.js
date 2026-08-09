# AGENTS.md

面向 <https://linux.sb/>（bbs1 / v8.x）的油猴脚本。源码在 `src/`（`.mjs`），构建产物是根目录 `linux.sb.user.js`（安装 / `@updateURL` 仍指向它）。

冷门但重要的实现结论：[docs/mermaid.md](docs/mermaid.md)、[docs/build.md](docs/build.md)。

## 改代码前先看

- 站点 DOM：
  - 帖文：`.post-content`（转义文本 + `<br>`；`@用户` 可能已是 `<a>`）
  - 通知：`.post-content.notification-content`（已有真实 HTML `<a>`，勿 Markdown 重渲）
  - 回复：`#reply`，登录后多为 `.ajax-reply-form`，正文 `textarea[name=body]`
  - submit：`button[type=submit]` / `input[type=submit]` / form 内无 `type` 的 `button`
  - 主题：`/topic/{id}`；楼层：`/topic/{id}?floor={n}`（`@用户 #楼层`）
  - 用户：`/user/{id}` 或 `/user?username=…`；侧栏 `.user-card`（`.user-name` / `.user-rank` / `.avatar-img`）；通知 tab=`notifications`
  - 主题头：`.post-content-title`、`.post-content-stats`；楼层：`.post-item[data-floor]`
  - 虚拟卡：`.virtual-card-card` / `.virtual-card-body`；购买记录 `.virtual-card-orders`；分页 query=`vc_page`
  - 签到：主页侧栏 `.daily-checkin-card`；未签 `.daily-checkin-action button`（常在 `.post-action-form`）；已签 `.daily-checkin-done`；独立页 `/daily_checkin`
- 回复列表 AJAX 追加 → `MutationObserver` 处理新 `.post-content`
- 外站标题：`GM_xmlhttpRequest` + `@connect *`；favicon 用 Google s2
- 站内悬浮卡：同源 `fetch`；同页楼层优先读 DOM
- GitHub（`classifyGithub`）：`api.github.com`（需 `User-Agent`，匿名约 60 req/h，进 `ghCache`）；文件走 `raw.githubusercontent.com`（`#L12` / `#L12-L20`）；`blob/.../*.png` 是 HTML 页勿当图；卡片用 `textContent` / 自建 DOM（`.lsb-gh`），勿走 `fetchMeta`；文件预览按路径懒加载 Shiki（与 Markdown 共用 `src/shiki`），CDN 挂则纯文本回退

## 源码与构建

```tree
src/
  meta.mjs              # UserScript 头（改 @version 在这里）
  constants.mjs         # 正则 / 不可变常量
  util.mjs
  store.mjs             # GM_getValue / GM_setValue 长期存储
  net.mjs               # gmRequest / gmGet / siteGet / ghApi / fetchMeta（HEAD→GET；缓存私有）
  main.mjs              # 入口：拼 CSS、theme、tip、submit、checkin、orders、observer
  post/                 # 帖文编排：Markdown → linkify → 站内 tip
  theme/                # 补站点缺变量；首次引导 /theme_switch（GM 存储）
  markdown/             # Markdown（先于 linkify）
  linkify/              # 外链增强（walk / enhance）
  tip/                  # 站内悬浮卡
  github/               # GitHub 卡片
  shiki/                # 共享 Shiki（Markdown + GitHub 文件预览）
  orders/               # 虚拟卡购买记录折叠
  submit/               # Ctrl+Enter
  checkin/              # 主页侧栏自动签到
build.mjs               # → tab 缩进的 linux.sb.user.js（细节见 docs/build.md）
```

- 复杂功能一个目录：同目录 `*.mjs` + `*.css`，模块 `export { css }`
- 改 `src/`，提交前 `npm run build`，产物一并提交
- **有可感知改动就 bump `src/meta.mjs` 的 `@version`**（semver）；版本不升则用户装不到更新
- 不要手改 `linux.sb.user.js`

## 约定（域内）

- 主题色跟站点 `:root` 变量；缺 `--card-bg` / `--bg-soft` 时在 `theme.css` 映射到 `--panel` / `--line-soft`，勿自建深色覆盖
- 脚本偏好用 `src/store.mjs`（`GM_getValue` / `GM_setValue`），勿再塞 `localStorage` 除非站点域内共享有必要
- 未访问过 `/theme_switch` 时 `location.replace` 过去；到该页则 `setStore('themeSwitchSeen', true)`
- 外链增强：`data-lsb`；悬浮绑定：`data-lsb-tip`（防重复监听）
- Markdown：`.post-content` 用 `innerText` 取源（跳过 `.notification-content`）；CDN 拉 unified（remark-gfm/breaks → rehype → hast 消毒 → stringify）；含 `$…$` / mermaid / 其它代码围栏再懒加载 katex·mermaid·shiki；`data-lsb-md` 防重复
- 不把 unified 打进产物；消毒在 rehype 早期做；mermaid SVG 在消毒之后插入
- 只 linkify 外站 `http(s)`；站内链只做悬浮预览；`code` / `pre` / 已有 `a` 内不 linkify
- 图片：pathname 后缀同步内联；无后缀走 `fetchMeta`（HEAD `image/*`，否则 GET 刮标题）
- 悬浮卡一律 `textContent`，勿把远端 HTML `innerHTML` 进 tip
- 有可复用经验再写回本文件或 `docs/`

## 审美指南

### 命名

- 可读：`index` / `userMessage` / `context` / `button`；避免 `i`、`msg`、`S`、`ctx`、`btn`
- 不用 `_` 开头；类私有用 `#`，否则别导出
- 能用 import / 模块级变量就别往 `window` / `document` 塞状态
- IIFE 打包后顶层绑定共享作用域：导出/顶层名勿与常见形参撞车

### 代码简化

- 只用一次的 `const` 直接内联
- 效果一致即可，例如：
  - `if (!member || member.status !== 'active')` → `if (member?.status !== 'active')`
  - `const c = event.content && typeof event.content === 'object' ? event.content : {}` → `const c = event?.content || {}`
  - `if (type !== 'send' && type !== 'delete')` → `if (!['send', 'delete'].includes(type))`
  - `const result = xxx; return result` → `return xxx`
  - `typeof content === 'string' ? content : content && typeof content.text === 'string' ? content.text : ''` → `content?.text || content || ''`
  - `if (xxx) { console.log(xxx); return }` → `if (xxx) return console.log(xxx)`
- `typeof` 与堆砌防御分支一般是坏味道

### 防御性代码

- 避免不必要的防御；出错是调用者的问题
- 唯一要清扫的是非本机网络层内容（外站抓取、Markdown 消毒、tip/`textContent`）

### 架构

- 精简、DRY、SRP；不向后兼容；结构挡路就改结构
- 删干净：别 `@deprecated`、别重导出
- 不为顶层模块在底层逻辑里特判

### 文件结构

- 代码放在符合定义的文件与分类路径；复杂功能一个目录，勿平铺垃圾命名

### 写完自问

- 这足够优雅吗？
- 有没有往公共库塞只属于一两个模块的逻辑？

## 验证

无自动化测试。改完 `npm run build`，再按改动面手动看：

1. 主题页：裸 URL / 外链 / 图片（含无后缀 `image/*`）链化与内联
2. Markdown（如 `/topic/371`）：渲染与消毒；公式 / mermaid / 代码围栏按需加载
3. 悬停 `@用户`、`@用户 #楼`、作者名、主题链 → 用户卡 / 楼层 / 主题摘要
4. 登录 / 搜索 / 回复：Ctrl+Enter 点到对应 submit
5. AJAX 新楼层同样生效
6. GitHub：仓库 / Issue·PR / commit / blob 行范围；图片走 raw；文件预览有 Shiki 高亮（扩展名识别，含 `ps1`）
7. 主题：跟站点配色；首次未开过 `/theme_switch` 会跳转；`--card-bg` / `--bg-soft` 有映射；代码区滑块跟主题
8. 虚拟卡购买记录：≥2 条默认折叠；`?vc_page=` 分页自动展开
9. 主页：未签到时侧栏签到按钮被自动点一次；已签到（`.daily-checkin-done`）则无动作
10. 推 `master` 后 raw 的 `@version` 已升高

## 常见坑

- 站点不会自动链化裸 URL；正文是转义文本 + `<br>`，Markdown 须 `innerText` 还原后再 parse
- `.notification-content` 已是 HTML；对其 Markdown 会抹掉 `<a>`，提及里的 `# …` 还会被当标题
- `@用户 #N` 是楼层 URL，不是用户主页
- `button:not([type])` 在 form 外不是 submit；优先 `closest('form')` 内找
- 拉标题 / 悬浮失败静默回退，勿 toast
- GitHub API 无 UA → 403；限流时卡片显示失败即可
- CDN 挂了则该帖纯文本并继续 linkify；勿默认预拉 mermaid/shiki/katex
- 「夜间保护模式」是发帖时段限制，不是视觉主题（站点主题在 `/theme_switch`）
- 不要撤销来源不明的未提交改动
- 站点主题插件注入 `:root{--bg…}`；脚本勿再 `html.lsb-dark` 覆盖整套变量
- tip / GitHub 卡用 `--panel` / `--card-bg` / `--text` / `--line` 等，勿用 `Canvas` / `CanvasText`（跟 OS 不跟站点）
- 溢出容器滑块：`scrollbar-color` + `::-webkit-scrollbar-*` 绑 `--text-muted` / `--line` / `--bg-soft`；系统默认常跟 OS 明暗
- Shiki：样式与 `renderShikiPre` / `highlightCode` 在 `src/shiki/`；Markdown 与 GitHub 文件预览共用；勿给 `.line` 设 `display:block`（Shiki 靠行间 `\n`，会撑高行距）
- `themeSwitchSeen` 在 GM 存储；清站点 localStorage 不会重置引导
