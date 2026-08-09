/** UserScript 头；改 @version 在这里 */
export const meta = `// ==UserScript==
// @name         linux.sb helpers
// @namespace    https://linux.sb/
// @version      0.0.6
// @description  Markdown（unified；按需 katex/mermaid/shiki；禁 script / javascript:）；跟随站点主题；Ctrl+Enter；主页自动签到；外链增强；GitHub 内联；站内悬浮；图片内联；购买记录≥2条默认折叠
// @author       steve02081504
// @homepageURL  https://github.com/steve02081504/linux.sb.js
// @downloadURL  https://raw.githubusercontent.com/steve02081504/linux.sb.js/master/linux.sb.user.js
// @updateURL    https://raw.githubusercontent.com/steve02081504/linux.sb.js/master/linux.sb.user.js
// @match        https://linux.sb/*
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      *
// @connect      esm.sh
// @connect      cdn.jsdelivr.net
// ==/UserScript==`
