# Mermaid（按需加载）

改 `src/markdown/` 里 mermaid 渲染 / 深色样式时再读。实现见 `markdown.mjs` 的 `MERMAID_THEME_CSS` / `rehypeMermaid`。

## `mermaid.render`（@11）

只传 `(id, text)`，让库自建临时节点。第三参传 DOM 宿主会 `getAttribute of null`；勿再搞零尺寸离屏 host。

## 主题

- `theme: 'base'` + `themeCSS` 绑站点变量（`--panel` / `--text` / `--brand`…）
- SVG 内 `var()` 随站点主题切换，不必主题切换时重渲
- `secure` 锁住 `theme` / `themeCSS` / `securityLevel`，防图源 frontmatter 覆盖

## `edgeLabel`

库会往 SVG 内嵌 `#id .edgeLabel p { background-color: … }`（常为浅色）。只改 `.edgeLabel rect` 不够；须一并覆盖 `.edgeLabel` / `p` / `span` / `.labelBkg` 的 `background-color` + `color`，否则深色主题下白字叠浅底。
