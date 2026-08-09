# AGENTS.md

面向 <https://linux.sb/>（bbs1 / v8.x）的油猴脚本。源码在 `src/`（`.mjs`），构建产物是根目录 `linux.sb.user.js`（安装 / `@updateURL` 仍指向它）。

## 改代码前先看

- 站点 DOM（实测）：
  - 帖文容器：`.post-content`（主题楼层是转义文本 + `<br>`；`@用户` 可能已是 `<a>`）
  - 通知：`.post-content.notification-content`（已有真实 HTML `<a>`，勿 Markdown 重渲）
  - 回复区：`#reply`，登录后表单多为 `.ajax-reply-form`，正文 `textarea[name=body]`
  - submit：`button[type=submit]` / `input[type=submit]` / 无 `type` 的 `button`（在 form 内默认 submit）
  - 主题 URL：`/topic/{id}`；带楼层：`/topic/{id}?floor={n}`（`@用户 #楼层` 常见形态）
  - 用户页：`/user/{id}` 或 `/user?username=…`；资料在侧栏 `.user-card`（`.user-name` / `.user-rank` / `.avatar-img`）；通知 tab=`notifications`
  - 主题头：`.post-content-title`、`.post-content-stats`；楼层节点：`.post-item[data-floor]`
- 回复列表会 AJAX 追加，必须靠 `MutationObserver` 处理新 `.post-content`
- 外站标题：`GM_xmlhttpRequest` + `@connect *`；favicon 用 Google s2
- 站内悬浮卡：同源 `fetch` 即可；同页楼层优先读 DOM，避免多余请求
- GitHub 内联（`classifyGithub`）：
  - 仓库 / Issue / PR / commit：`api.github.com`（需 `User-Agent`，匿名约 60 req/h，结果进 `ghCache`）
  - commit：`/owner/repo/commit/{sha}` → 标题、作者、日期、±行、改动文件数
  - 文件：`raw.githubusercontent.com`；hash `#L12` / `#L12-L20` / `#L12C1-L20C5` 切行
  - `github.com/.../blob/.../*.png` 是 HTML 页，不要当图片 URL；图片用 raw 地址内联
  - 卡片一律 `textContent` / 自建 DOM，挂在 `.lsb-gh` 下，勿走通用 `fetchMeta` 刮标题

## 源码与构建

```tree
src/
  meta.mjs              # UserScript 头（改 @version 在这里）
  constants.mjs         # 正则 / 不可变常量
  util.mjs
  net.mjs               # gmRequest / gmGet / siteGet / ghApi / fetchMeta（HEAD→GET；缓存私有）
  main.mjs              # 入口：拼 CSS、theme、tip、submit、observer
  post/
    post.mjs            # 帖文编排：Markdown → linkify → 站内 tip
  theme/                # 深色模式（默认开；localStorage `lsb-theme`）
    theme.mjs
    theme.css
  markdown/             # 帖文 Markdown 渲染（先于 linkify）
    markdown.mjs
    markdown.css
  linkify/              # 外链增强（walk / enhance，不含编排）
    linkify.mjs
    linkify.css
  tip/                  # 站内悬浮卡
    tip.mjs
    tip.css
  github/               # GitHub 卡片
    github.mjs
    github.css
  submit/
    submit.mjs          # Ctrl+Enter（无样式）
build.mjs               # esbuild → tab 缩进的 linux.sb.user.js
```

- 复杂功能一个目录：同目录放 `*.mjs` + 对应 `*.css`，模块 `export { css }`
- 改 `src/`，提交前跑 `npm run build`，把根目录产物一并提交
- **有可感知改动就 bump `src/meta.mjs` 的 `@version`**（semver）；`@updateURL`/`@downloadURL` 指向 `master` raw，版本不升则用户装不到更新
- 产物保持单文件 IIFE + UserScript 头、**tab 缩进**；不要手改 `linux.sb.user.js`

## 约定（域内）

- 站点 CSS 主题色全在 `:root` 变量（`--bg` / `--panel` / `--text` / `--brand`…）；深色模式用 `html.lsb-dark` 覆盖即可，勿硬刷元素色
- 站点部分样式用了未在 `:root` 声明的变量并带浅色 fallback（如 `var(--card-bg,#fff)` / `var(--bg-soft,#f7f7f7)`，发帖页 `.topic-type-choice` / `.topic-type-panel`）；深色必须在 `theme.css` 一并定义，否则永远回退白底
- 外链增强用 `data-lsb`；悬浮绑定用 `data-lsb-tip`，禁止重复挂监听
- Markdown：`.post-content` 先 `innerText` 取源（跳过 `.notification-content`）；CDN 拉轻量 unified 管线（remark-gfm/breaks → rehype → fount 规则 hast 消毒 → stringify）；正文含 `$…$` / mermaid 围栏 / 其它代码围栏时再懒加载 katex、mermaid、shiki；`data-lsb-md` 防重复
- 不把 unified 栈打进产物；不整抄 fount convertor（无执行按钮/DaisyUI/embed）
- 消毒在 rehype 早期做（与 fount `sanitizeHtml` 标签/URL 规则对齐），mermaid 产出的 SVG 在消毒之后插入，避免被剥掉
- 只 linkify / 内联增强外站 `http(s)`；站内链做悬浮预览，不改成外链样式
- `code` / `pre` / 已有 `a` 内文本不 linkify
- 图片：pathname 后缀（avif/bmp/gif/jpeg/png/svg/webp）同步内联；无后缀外链走 `fetchMeta`（先 HEAD 看 `Content-Type: image/*`，否则再 GET 刮标题）
- 悬浮卡内容一律 `textContent` 填充，不要把远端 HTML 直接 `innerHTML` 进 tip
- 流程走完有可复用经验再写回本文件

## 审美指南

### 命名

- 文件名、导入名、变量/函数名可读易懂：`index` / `userMessage` / `context` / `button`；烂例子：`i`、`msg`、`aj.json`、`S`、`ctx`、`btn`
- 不用 `_` 作符号开头；类私有字段用 `#`，否则别导出即可
- 能用 import / 模块级变量搞定就别往 `window` / `document` 等全局塞状态

### 代码简化

- 只使用一次的 `const` 直接内联到使用处
- 效果一致即可，例如：
  - `if (!member || member.status !== 'active')` → `if (member?.status !== 'active')`
  - `const c = event.content && typeof event.content === 'object' ? event.content : {}` → `const c = event?.content || {}`
  - `if (type !== 'send' && type !== 'delete')` → `if (!['send', 'delete'].includes(type))`
  - `const result = xxx; return result` → `return xxx`
  - `typeof content === 'string' ? content : content && typeof content.text === 'string' ? content.text : ''` → `content?.text || content || ''`
  - `typeof channelId === 'string' && /^[\w.-]+$/.test(channelId) && channelId.length <= 128` → `/^[\w.-]{1,127}$/.test(String(channelId))`
  - `if (xxx) { console.log(xxx); return }` → `if (xxx) return console.log(xxx)`
- `typeof` 与堆砌防御分支一般是坏味道

### 防御性代码

- 避免不必要的防御；出错是调用者的问题
- 不为别人的蠢负责，传垃圾数据直接爱咋咋
- 前后端信任彼此的数据；后端信任自己加载的文件
- 唯一要清扫的是非本机网络层传入的内容（远端 HTML / API / 用户帖文），别整盘接收带爆炸——本项目里即外站抓取、Markdown 消毒、tip/`textContent` 填充

### 架构

- 精简、DRY、SRP
- 不向后兼容；兼容旧数据是用户或单独导入模块的事
- 不追求最小更新，追求最终成品简洁优雅高效；结构挡路就改结构
- 删东西删干净：别 `@deprecated`、别重导出
- 不为顶层模块在底层逻辑里特判；每个模块只做自己该做的事

### 文件结构

- 代码放在符合其定义的文件里；文件放在合适分类路径；必要时新建目录，别在不合适处拉屎
- 复杂功能一个目录（本仓库已是 `theme/` / `markdown/` / `linkify/` …），不要摊成 `xxx_aae.mjs`、`xxx_aba.mjs` 平铺命名

### 写完自问

- 这足够优雅吗？
- 有没有往公共库塞只属于一两个模块的狗屎逻辑？

## 验证

没有自动化测试框架。改完后 `npm run build`，再手动：

1. 主题页：裸 URL / 外链 / 图片 URL（含无后缀但 `Content-Type: image/*`）是否链化、变蓝、出图标标题或内联图
2. Markdown 帖（如 `/topic/371`）：标题/引用/表格是否渲染；`<script>`、`[x](javascript:…)` 是否被剥掉；有公式/` ```mermaid ` /代码围栏时 katex·mermaid·shiki 是否按需加载
3. 悬停 `@用户`、`@用户 #楼`、作者名、主题链：是否弹出用户卡 / 楼层预览 / 主题摘要
4. 登录页 / 搜索框 / 回复框：Ctrl+Enter 是否点到对应 submit
5. AJAX 新楼层的链接 / Markdown 是否也生效
6. GitHub：仓库卡、Issue/PR 卡、commit 卡（标题/sha/±行）、blob 文件预览与 `#L12-L20` 行范围
7. 深色模式：默认 `html.lsb-dark`；顶栏「浅色/深色」可切换且刷新保持；站点卡片/输入/代码块对比正常
8. 推送到 `master` 后确认 raw URL 的 `@version` 已升高（扩展靠它判断更新）

## 常见坑

- 站点不会自动把裸 `https://…` 变成 `<a>`，linkify 是脚本自己的职责
- 站点正文是转义文本 + `<br>`，不是 HTML；Markdown 必须从 `innerText` 还原换行后再 parse
- `.notification-content` 已是带主题链的 HTML；对其 `innerText`→Markdown 会抹掉 `<a>`（提及里的 `# …` 还会被当成标题）
- `@用户 #N` 指向的是楼层 URL，不是用户主页；预览应按 `floor` 解帖
- `button:not([type])` 在 form 外不是 submit；找最近按钮时优先 `closest('form')` 内候选
- 拉标题 / 悬浮失败应静默回退，不要 toast 刷屏
- GitHub API 无 UA 会 403；限流时卡片显示加载失败即可
- CDN 挂了则该帖保持纯文本并继续 linkify；普通帖只拉基础 unified，勿默认预拉 mermaid/shiki/katex
- `mermaid.render(id, text, host)`（mermaid@11）：第三参传 DOM 宿主会 `getAttribute of null`；只传 id+text，让库自建临时节点；勿再搞零尺寸离屏 host
- Mermaid 深色：`theme: 'base'` + `themeCSS` 绑站点变量（`--panel` / `--text` / `--brand`…）；SVG 内 `var()` 随 `html.lsb-dark` 切换，不必主题切换时重渲；`secure` 锁住 theme/themeCSS/securityLevel 防图源 frontmatter 覆盖
- Mermaid `edgeLabel`：库会往 SVG 内嵌 `#id .edgeLabel p { background-color: … }`（常为浅色）；只改 `.edgeLabel rect` 不够，必须连 `.edgeLabel` / `p` / `span` / `.labelBkg` 的 `background-color` + `color` 一起盖，否则深色下白字叠浅底看不见
- 「夜间保护模式」是发帖时段限制，不是视觉深色；深色靠脚本 `lsb-dark` / `lsb-theme`
- 不要撤销你不知道来源的未提交改动（可能是其他 agent 在改）
- IIFE 打包后顶层绑定共享作用域：导出/顶层名勿与常见形参撞车（曾用 `el` 工厂导致形参被改成 `el2`，JSDoc `@param el` 对不上）
- `/* global … */` 不是 legal comment，需走 `build.mjs` 的 preserve 插件；改插件时顺带确认产物里仍有该行
