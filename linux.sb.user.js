// ==UserScript==
// @name         linux.sb helpers
// @namespace    https://linux.sb/
// @version      0.0.3
// @description  Markdown（unified；按需 katex/mermaid/shiki；禁 script / javascript:）；深色模式（默认开）；Ctrl+Enter；外链增强；GitHub 内联；站内悬浮；图片内联
// @author       steve02081504
// @homepageURL  https://github.com/steve02081504/linux.sb.js
// @downloadURL  https://raw.githubusercontent.com/steve02081504/linux.sb.js/master/linux.sb.user.js
// @updateURL    https://raw.githubusercontent.com/steve02081504/linux.sb.js/master/linux.sb.user.js
// @match        https://linux.sb/*
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @connect      *
// @connect      esm.sh
// @connect      cdn.jsdelivr.net
// ==/UserScript==
(() => {
	// src/constants.mjs
	/** 外链 URL 正则 */
	var URL_RE = /https?:\/\/[^\s<>"'`]+/gi;
	/** URL 末尾可剥的标点 */
	var TRAIL_PUNCT_RE = /[),.;:!?，。；：！？、》」』】）]+$/;
	/** 可内联图片的 pathname 后缀 */
	var IMG_EXT_RE = /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)(?:$|[?#])/i;
	/** 不参与 linkify 的标签 */
	var SKIP_LINKIFY = /* @__PURE__ */ new Set(["A", "SCRIPT", "STYLE", "TEXTAREA", "CODE", "PRE", "SVG", "BUTTON", "INPUT", "SELECT"]);
	/** github.com 主机名 */
	var GH_HOST_RE = /^(?:www\.)?github\.com$/i;
	/** 非用户/仓库路径段 */
	var GH_SKIP_OWNER = /* @__PURE__ */ new Set([
		"settings",
		"marketplace",
		"orgs",
		"organizations",
		"login",
		"join",
		"features",
		"pricing",
		"enterprise",
		"security",
		"about",
		"site",
		"topics",
		"collections",
		"events",
		"sponsors",
		"customer-stories",
		"readme",
		"explore",
		"notifications",
		"messages",
		"new",
		"codespaces",
		"account",
		"apps",
		"integrations",
		"copilot"
	]);
	/** blob 无行范围时默认预览行数 */
	var FILE_PREVIEW_LINES = 40;
	/** 行范围预览上限 */
	var FILE_RANGE_MAX = 200;
	/** raw 文件截断字符数 */
	var FILE_MAX_CHARS = 12e4;

	// src/util.mjs
	/**
	 * 去掉 URL 末尾标点与不成对闭括号。
	 * @param {string} raw 原始匹配串
	 * @returns {string} 修剪后的 URL
	 */
	function trimUrl(raw) {
		let url = raw;
		for (; ; ) {
			const next = url.replace(TRAIL_PUNCT_RE, "");
			if (next === url) break;
			url = next;
		}
		while (/[)\]}>]$/.test(url)) {
			const end = url.slice(-1);
			const open = { ")": "(", "]": "[", "}": "{", ">": "<" }[end];
			if (open && url.includes(open)) break;
			url = url.slice(0, -1);
		}
		return url;
	}
	/**
	 * 同步快路径：pathname 带图片后缀则可直接内联（无后缀由 fetchMeta HEAD 判定）。
	 * @param {string} url 待检测 URL
	 * @returns {boolean} 是否为图片 URL
	 */
	function isImageUrl(url) {
		try {
			const parsed = new URL(url);
			if (GH_HOST_RE.test(parsed.hostname)) return false;
			return IMG_EXT_RE.test(parsed.pathname);
		} catch {
			return IMG_EXT_RE.test(url);
		}
	}
	/**
	 * 判断链接是否为跨站 http(s) 外链。
	 * @param {string} href 链接地址
	 * @returns {boolean} 是否为外站 http(s) 链接
	 */
	function isExternalHttp(href) {
		try {
			const parsed = new URL(href, location.href);
			return (parsed.protocol === "http:" || parsed.protocol === "https:") && parsed.origin !== location.origin;
		} catch {
			return false;
		}
	}
	/**
	 * 将相对或绝对链接解析为完整 URL。
	 * @param {string} href 链接地址
	 * @returns {string} 绝对 URL
	 */
	function absUrl(href) {
		try {
			return new URL(href, location.href).href;
		} catch {
			return href;
		}
	}
	/**
	 * 生成 Google favicon 服务地址。
	 * @param {string} url 目标页面 URL
	 * @returns {string} favicon 图片 URL
	 */
	function faviconUrl(url) {
		return `https://www.google.com/s2/favicons?sz=32&domain_url=${encodeURIComponent(url)}`;
	}
	/**
	 * 解码 HTML 实体。
	 * @param {string} text 含实体的字符串
	 * @returns {string} 解码后的文本
	 */
	function decodeHtml(text) {
		const textarea = document.createElement("textarea");
		textarea.innerHTML = text;
		return textarea.value;
	}
	/**
	 * 创建带类名与文本的 DOM 元素。
	 * @param {string} tag 标签名
	 * @param {string} [className] CSS 类名
	 * @param {string} [text] 文本内容
	 * @returns {HTMLElement} 新元素
	 */
	function elem(tag, className, text) {
		const node = document.createElement(tag);
		if (className) node.className = className;
		if (text != null) node.textContent = text;
		return node;
	}
	/**
	 * 将大数字格式化为 k/m 缩写。
	 * @param {number} count 原始数值
	 * @returns {string} 格式化后的字符串
	 */
	function fmtCount(count) {
		const value = Number(count) || 0;
		if (value >= 1e6) return `${(value / 1e6).toFixed(value >= 1e7 ? 0 : 1)}m`;
		if (value >= 1e3) return `${(value / 1e3).toFixed(value >= 1e4 ? 0 : 1)}k`;
		return String(value);
	}
	/**
	 * 截断长文本并追加省略号。
	 * @param {string} text 原始文本
	 * @param {number} [max=220] 最大长度
	 * @returns {string} 摘要文本
	 */
	function snippetText(text, max = 220) {
		const trimmed = String(text || "").replace(/\r\n/g, "\n").trim();
		if (!trimmed) return "";
		return trimmed.length > max ? `${trimmed.slice(0, max)}\u2026` : trimmed;
	}

	// src/net.mjs
	/* global GM_xmlhttpRequest */
	var metaCache = /* @__PURE__ */ new Map();
	var pageCache = /* @__PURE__ */ new Map();
	var ghCache = /* @__PURE__ */ new Map();
	/**
	 * 通过 GM_xmlhttpRequest 发起请求。
	 * @param {string} method HTTP 方法
	 * @param {string} url 请求地址
	 * @param {Record<string, string>} [headers] 请求头
	 * @returns {Promise<GMXMLHttpRequestResponse>} GM 响应对象
	 */
	function gmRequest(method, url, headers) {
		return new Promise((resolve, reject) => {
			GM_xmlhttpRequest({
				method,
				url,
				headers: headers || {},
				timeout: 15e3,
				/**
				 * @param {GMXMLHttpRequestResponse} res GM 响应对象
				 * @returns {void}
				 */
				onload: (res) => {
					if (res.status >= 200 && res.status < 400) resolve(res);
					else reject(new Error(String(res.status)));
				},
				/**
				 * @returns {void}
				 */
				onerror: () => reject(new Error("network")),
				/**
				 * @returns {void}
				 */
				ontimeout: () => reject(new Error("timeout"))
			});
		});
	}
	/**
	 * 从 GM 响应头取出 Content-Type（小写，无参数）。
	 * @param {GMXMLHttpRequestResponse} res GM 响应
	 * @returns {string} MIME 类型，缺省为空串
	 */
	function contentType(res) {
		const match = String(res.responseHeaders || "").match(/^content-type:\s*([^\n;]+)/im);
		return match?.[1].trim().toLowerCase() || "";
	}
	/**
	 * 通过 GM_xmlhttpRequest 发起 GET 请求。
	 * @param {string} url 请求地址
	 * @param {Record<string, string>} [headers] 请求头
	 * @returns {Promise<string>} 响应正文
	 */
	function gmGet(url, headers) {
		return gmRequest("GET", url, headers).then((res) => res.responseText);
	}
	/**
	 * 同源 fetch 页面 HTML，带内存缓存。
	 * @param {string} url 站内 URL
	 * @returns {Promise<string>} 页面 HTML
	 */
	function siteGet(url) {
		if (pageCache.has(url)) return pageCache.get(url);
		const task = fetch(url, { credentials: "same-origin", headers: { Accept: "text/html" } }).then((res) => {
			if (!res.ok) throw new Error(String(res.status));
			return res.text();
		});
		pageCache.set(url, task);
		return task;
	}
	/**
	 * 请求 GitHub REST API 并解析 JSON，带缓存。
	 * @param {string} url API 地址
	 * @returns {Promise<object>} 解析后的 JSON
	 */
	function ghApi(url) {
		if (ghCache.has(url)) return ghCache.get(url);
		const task = gmGet(url, {
			Accept: "application/vnd.github+json",
			"X-GitHub-Api-Version": "2022-11-28",
			"User-Agent": "linux.sb-helpers"
		}).then(JSON.parse);
		ghCache.set(url, task);
		return task;
	}
	/**
	 * 拉取 GitHub raw 文件内容，带缓存。
	 * @param {string} url raw 地址
	 * @returns {Promise<string>} 文件正文
	 */
	function ghRaw(url) {
		if (ghCache.has(url)) return ghCache.get(url);
		const task = gmGet(url);
		ghCache.set(url, task);
		return task;
	}
	/**
	 * 从 HTML 中提取页面标题。
	 * @param {string} html 页面 HTML
	 * @returns {string} 标题文本
	 */
	function parseTitle(html) {
		const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
		if (og?.[1]) return decodeHtml(og[1]).trim();
		const title = html.match(/<title[^>]*>([^<]*)<\/title>/i);
		return title ? decodeHtml(title[1]).trim() : "";
	}
	/**
	 * 探测外链：先 HEAD 看 Content-Type，图片则短路；否则再 GET 刮标题。
	 * @param {string} url 目标 URL
	 * @returns {Promise<{image: boolean, title: string, icon: string}>} 元数据
	 */
	async function fetchMeta(url) {
		if (metaCache.has(url)) return metaCache.get(url);
		const empty = { image: false, title: "", icon: faviconUrl(url) };
		const task = (async () => {
			try {
				const head = await gmRequest("HEAD", url);
				if (contentType(head).startsWith("image/"))
					return { image: true, title: "", icon: faviconUrl(url) };
			} catch {
			}
			const res = await gmRequest("GET", url);
			if (contentType(res).startsWith("image/"))
				return { image: true, title: "", icon: faviconUrl(url) };
			return { image: false, title: parseTitle(res.responseText), icon: faviconUrl(url) };
		})().catch(() => empty);
		metaCache.set(url, task);
		return task;
	}

	// src/github/github.css
	var github_default = ".lsb-gh{\n	display:block;\n	margin:.55em 0;\n	max-width:min(100%,720px);\n}\n.lsb-gh-card{\n	margin-top:.45em;\n	padding:10px 12px;\n	border:1px solid color-mix(in srgb, CanvasText 14%, transparent);\n	border-radius:10px;\n	background:color-mix(in srgb, CanvasText 3%, Canvas);\n	color:CanvasText;\n	font:13px/1.45 system-ui,sans-serif;\n}\n.lsb-gh-card.lsb-gh-loading{opacity:.7}\n.lsb-gh-head{\n	display:flex;\n	flex-wrap:wrap;\n	gap:6px 10px;\n	align-items:baseline;\n}\n.lsb-gh-name{font-weight:700;word-break:break-word}\n.lsb-gh-meta{\n	margin-top:4px;\n	opacity:.72;\n	font-size:12px;\n}\n.lsb-gh-desc{\n	margin-top:6px;\n	opacity:.9;\n	white-space:pre-wrap;\n	word-break:break-word;\n}\n.lsb-gh-stats{\n	display:flex;\n	flex-wrap:wrap;\n	gap:8px 12px;\n	margin-top:8px;\n	font-size:12px;\n	opacity:.82;\n}\n.lsb-gh-topics{\n	display:flex;\n	flex-wrap:wrap;\n	gap:4px;\n	margin-top:8px;\n}\n.lsb-gh-topic{\n	padding:1px 7px;\n	border-radius:999px;\n	background:color-mix(in srgb, CanvasText 10%, transparent);\n	font-size:11px;\n}\n.lsb-gh-badge{\n	display:inline-block;\n	padding:1px 6px;\n	border-radius:999px;\n	background:color-mix(in srgb, CanvasText 8%, transparent);\n	font-size:11px;\n	opacity:.9;\n}\n.lsb-gh-badge-open{background:color-mix(in srgb,#238636 22%,transparent);color:#1a7f37}\n.lsb-gh-badge-closed{background:color-mix(in srgb,#cf222e 18%,transparent);color:#cf222e}\n.lsb-gh-badge-merged{background:color-mix(in srgb,#8250df 20%,transparent);color:#8250df}\n.lsb-gh-badge-draft{background:color-mix(in srgb,CanvasText 10%,transparent)}\n.lsb-gh-add{color:#1a7f37}\n.lsb-gh-del{color:#cf222e}\n.lsb-gh-code-wrap{\n	margin-top:8px;\n	border:1px solid color-mix(in srgb, CanvasText 12%, transparent);\n	border-radius:8px;\n	overflow:auto;\n	max-height:420px;\n	background:color-mix(in srgb, CanvasText 4%, Canvas);\n}\n.lsb-gh-code{\n	margin:0;\n	padding:8px 0;\n	font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;\n	white-space:pre;\n	tab-size:4;\n}\n.lsb-gh-line{\n	display:block;\n	padding:0 12px 0 0;\n}\n.lsb-gh-line:hover{background:color-mix(in srgb, CanvasText 6%, transparent)}\n.lsb-gh-ln{\n	display:inline-block;\n	width:3.2em;\n	margin-right:10px;\n	padding-left:10px;\n	text-align:right;\n	opacity:.42;\n	user-select:none;\n	vertical-align:top;\n}\n.lsb-gh-more{\n	margin-top:6px;\n	font-size:12px;\n	opacity:.65;\n}\n";

	// src/github/github.mjs
	/**
	 *
	 */
	/**
	 * 解析 GitHub blob URL 的 `#L` 行范围哈希。
	 * @param {string} hash URL 哈希部分
	 * @returns {{lineStart: number, lineEnd: number} | null} 行范围
	 */
	function parseLineHash(hash) {
		const match = String(hash || "").match(/^#L(\d+)(?:C\d+)?(?:-L(\d+)(?:C\d+)?)?/i);
		if (!match) return null;
		const start = Number(match[1]);
		const end = match[2] ? Number(match[2]) : start;
		return {
			lineStart: Math.min(start, end),
			lineEnd: Math.max(start, end)
		};
	}
	/**
	 * 识别 GitHub 链接类型并提取 API/raw 信息。
	 * @param {string} href 链接地址
	 * @returns {object | null} GitHub 链接分类结果
	 */
	function classifyGithub(href) {
		let u;
		try {
			u = new URL(href, location.href);
		} catch {
			return null;
		}
		if (!GH_HOST_RE.test(u.hostname)) return null;
		const parts = u.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
		if (parts.length < 2) return null;
		const [owner, repo, ...rest] = parts;
		if (GH_SKIP_OWNER.has(owner.toLowerCase())) return null;
		const base = `${owner}/${repo}`;
		const api = `https://api.github.com/repos/${base}`;
		if (!rest.length)
			return { kind: "repo", owner, repo, api };
		if (rest[0] === "issues" && rest[1] && /^\d+$/.test(rest[1]))
			return { kind: "issue", owner, repo, num: rest[1], api: `${api}/issues/${rest[1]}` };
		if (rest[0] === "pull" && rest[1] && /^\d+$/.test(rest[1]))
			return { kind: "pull", owner, repo, num: rest[1], api: `${api}/pulls/${rest[1]}` };
		if (rest[0] === "commit" && rest[1] && /^[0-9a-f]{7,40}$/i.test(rest[1]))
			return { kind: "commit", owner, repo, sha: rest[1], api: `${api}/commits/${rest[1]}` };
		if (rest[0] === "blob" && rest.length >= 3) {
			const ref = rest[1];
			const path = rest.slice(2).join("/");
			const range = parseLineHash(u.hash);
			return {
				kind: "file",
				owner,
				repo,
				ref,
				path,
				lineStart: range?.lineStart || 0,
				lineEnd: range?.lineEnd || 0,
				raw: `https://raw.githubusercontent.com/${base}/${ref}/${path}`
			};
		}
		return null;
	}
	/**
	 * 生成 GitHub 卡片链接行的短标签。
	 * @param {object} info classifyGithub 返回值
	 * @returns {string} 展示标签
	 */
	function ghLabel(info) {
		if (info.kind === "repo") return `${info.owner}/${info.repo}`;
		if (info.kind === "issue" || info.kind === "pull") return `${info.owner}/${info.repo}#${info.num}`;
		if (info.kind === "commit") return `${info.owner}/${info.repo}@${info.sha.slice(0, 7)}`;
		if (info.kind === "file") {
			const name = info.path.split("/").pop() || info.path;
			if (info.lineStart) {
				const range = info.lineStart === info.lineEnd ? `L${info.lineStart}` : `L${info.lineStart}-L${info.lineEnd}`;
				return `${name} \xB7 ${range}`;
			}
			return name;
		}
		return info.owner + "/" + info.repo;
	}
	/**
	 * 提取 commit message 的主题行。
	 * @param {string} message commit message
	 * @returns {string} 主题行
	 */
	function commitSubject(message) {
		return String(message || "").replace(/\r\n/g, "\n").trim().split("\n")[0] || "";
	}
	/**
	 * 提取 commit message 的正文摘要。
	 * @param {string} message commit message
	 * @returns {string} 正文摘要
	 */
	function commitBody(message) {
		const text = String(message || "").replace(/\r\n/g, "\n").trim();
		const newlineIndex = text.indexOf("\n");
		if (newlineIndex < 0) return "";
		return snippetText(text.slice(newlineIndex + 1).trim());
	}
	/**
	 * 将 ISO 日期格式化为 YYYY-MM-DD。
	 * @param {string} iso ISO 日期字符串
	 * @returns {string} 格式化日期
	 */
	function fmtCommitDate(iso) {
		if (!iso) return "";
		const date = new Date(iso);
		if (Number.isNaN(date.getTime())) return "";
		const month = String(date.getMonth() + 1).padStart(2, "0");
		const day = String(date.getDate()).padStart(2, "0");
		return `${date.getFullYear()}-${month}-${day}`;
	}
	/**
	 * 拉取 GitHub 卡片展示数据。
	 * @param {object} info classifyGithub 返回值
	 * @returns {Promise<object | null>} 卡片数据
	 */
	async function loadGithubCard(info) {
		if (info.kind === "repo") {
			const data = await ghApi(info.api);
			return {
				kind: "repo",
				fullName: data.full_name || `${info.owner}/${info.repo}`,
				desc: data.description || "",
				stars: data.stargazers_count,
				forks: data.forks_count,
				watchers: data.subscribers_count,
				lang: data.language || "",
				topics: data.topics || [],
				license: data.license?.spdx_id || data.license?.name || "",
				title: data.full_name || `${info.owner}/${info.repo}`
			};
		}
		if (info.kind === "issue") {
			const data = await ghApi(info.api);
			return {
				kind: "issue",
				title: data.title || `Issue #${info.num}`,
				state: data.state,
				comments: data.comments || 0,
				body: snippetText(data.body),
				user: data.user?.login || "",
				label: `${info.owner}/${info.repo}#${info.num}`
			};
		}
		if (info.kind === "pull") {
			const data = await ghApi(info.api);
			const state = data.merged_at ? "merged" : data.draft ? "draft" : data.state;
			return {
				kind: "pull",
				title: data.title || `PR #${info.num}`,
				state,
				comments: (data.comments || 0) + (data.review_comments || 0),
				body: snippetText(data.body),
				user: data.user?.login || "",
				label: `${info.owner}/${info.repo}#${info.num}`
			};
		}
		if (info.kind === "commit") {
			const data = await ghApi(info.api);
			const sha = data.sha || info.sha;
			const message = data.commit?.message || "";
			const subject = commitSubject(message) || sha.slice(0, 7);
			return {
				kind: "commit",
				title: subject,
				sha: sha.slice(0, 7),
				body: commitBody(message),
				user: data.author?.login || data.commit?.author?.name || "",
				date: fmtCommitDate(data.commit?.author?.date),
				label: `${info.owner}/${info.repo}`,
				additions: data.stats?.additions || 0,
				deletions: data.stats?.deletions || 0,
				files: data.files?.length || 0
			};
		}
		if (info.kind === "file") {
			if (IMG_EXT_RE.test("/" + info.path))
				return {
					kind: "file",
					path: info.path,
					ref: info.ref,
					fullName: `${info.owner}/${info.repo}`,
					image: info.raw,
					title: ghLabel(info)
				};
			let text = await ghRaw(info.raw);
			if (text.includes("\0"))
				return {
					kind: "file",
					path: info.path,
					ref: info.ref,
					fullName: `${info.owner}/${info.repo}`,
					binary: true,
					title: ghLabel(info)
				};
			if (text.length > FILE_MAX_CHARS) text = text.slice(0, FILE_MAX_CHARS);
			const lines = text.split(/\r?\n/);
			let start = 1;
			let end = Math.min(lines.length, FILE_PREVIEW_LINES);
			let truncated = lines.length > FILE_PREVIEW_LINES;
			if (info.lineStart) {
				start = Math.max(1, info.lineStart);
				const wantEnd = info.lineEnd || info.lineStart;
				end = Math.min(lines.length, wantEnd);
				if (end - start + 1 > FILE_RANGE_MAX) {
					end = start + FILE_RANGE_MAX - 1;
					truncated = true;
				} else
					truncated = end < wantEnd;
			}
			return {
				kind: "file",
				path: info.path,
				ref: info.ref,
				fullName: `${info.owner}/${info.repo}`,
				start,
				end,
				total: lines.length,
				truncated,
				ranged: !!info.lineStart,
				lines: lines.slice(start - 1, end),
				title: ghLabel(info)
			};
		}
		return null;
	}
	/**
	 * Issue/PR 状态 → [className, label]
	 */
	var STATE_BADGE = {
		open: ["lsb-gh-badge lsb-gh-badge-open", "Open"],
		closed: ["lsb-gh-badge lsb-gh-badge-closed", "Closed"],
		merged: ["lsb-gh-badge lsb-gh-badge-merged", "Merged"],
		draft: ["lsb-gh-badge lsb-gh-badge-draft", "Draft"]
	};
	/**
	 * @param {string} state 状态名
	 * @returns {HTMLElement} 徽章元素
	 */
	function stateBadge(state) {
		const [className, label] = STATE_BADGE[state] || ["lsb-gh-badge", state || ""];
		return elem("span", className, label);
	}
	/**
	 * 将 GitHub 卡片数据渲染到容器。
	 * @param {HTMLElement} card 卡片容器
	 * @param {object | null} data 卡片数据
	 * @returns {void} 无返回值
	 */
	function renderGithubCard(card, data) {
		card.replaceChildren();
		card.classList.remove("lsb-gh-loading");
		if (!data) {
			card.append(elem("div", "lsb-gh-meta", "\u52A0\u8F7D\u5931\u8D25"));
			return;
		}
		if (data.kind === "repo") {
			const head = elem("div", "lsb-gh-head");
			head.append(elem("div", "lsb-gh-name", data.fullName));
			if (data.lang) head.append(elem("span", "lsb-gh-badge", data.lang));
			card.append(head);
			if (data.desc) card.append(elem("div", "lsb-gh-desc", data.desc));
			const stats = elem("div", "lsb-gh-stats");
			stats.append(
				elem("span", null, `\u2605 ${fmtCount(data.stars)}`),
				elem("span", null, `Fork ${fmtCount(data.forks)}`)
			);
			if (data.watchers != null) stats.append(elem("span", null, `Watch ${fmtCount(data.watchers)}`));
			if (data.license) stats.append(elem("span", null, data.license));
			card.append(stats);
			if (data.topics?.length) {
				const topics = elem("div", "lsb-gh-topics");
				for (const t of data.topics.slice(0, 12)) topics.append(elem("span", "lsb-gh-topic", t));
				card.append(topics);
			}
			return;
		}
		if (data.kind === "issue" || data.kind === "pull") {
			const head = elem("div", "lsb-gh-head");
			head.append(elem("div", "lsb-gh-name", data.title));
			head.append(stateBadge(data.state));
			card.append(head);
			const metaBits = [data.label];
			if (data.user) metaBits.push(data.user);
			metaBits.push(`${fmtCount(data.comments)} \u8BA8\u8BBA`);
			card.append(elem("div", "lsb-gh-meta", metaBits.join(" \xB7 ")));
			if (data.body) card.append(elem("div", "lsb-gh-desc", data.body));
			return;
		}
		if (data.kind === "commit") {
			const head = elem("div", "lsb-gh-head");
			head.append(elem("div", "lsb-gh-name", data.title));
			head.append(elem("span", "lsb-gh-badge", data.sha));
			card.append(head);
			const metaBits = [data.label];
			if (data.user) metaBits.push(data.user);
			if (data.date) metaBits.push(data.date);
			card.append(elem("div", "lsb-gh-meta", metaBits.join(" \xB7 ")));
			if (data.body) card.append(elem("div", "lsb-gh-desc", data.body));
			const stats = elem("div", "lsb-gh-stats");
			stats.append(
				elem("span", "lsb-gh-add", `+${fmtCount(data.additions)}`),
				elem("span", "lsb-gh-del", `-${fmtCount(data.deletions)}`)
			);
			if (data.files) stats.append(elem("span", null, `${fmtCount(data.files)} files`));
			card.append(stats);
			return;
		}
		if (data.kind === "file") {
			const head = elem("div", "lsb-gh-head");
			head.append(elem("div", "lsb-gh-name", data.path));
			head.append(elem("span", "lsb-gh-badge", `${data.fullName}@${data.ref}`));
			if (data.start) {
				const range = data.start === data.end ? `L${data.start}` : `L${data.start}-L${data.end}`;
				head.append(elem("span", "lsb-gh-badge", range));
			}
			card.append(head);
			if (data.image) {
				const img = elem("img", "lsb-inline-img");
				img.src = data.image;
				img.alt = data.path;
				img.loading = "lazy";
				img.referrerPolicy = "no-referrer";
				card.append(img);
				return;
			}
			if (data.binary) {
				card.append(elem("div", "lsb-gh-more", "\u4E8C\u8FDB\u5236\u6587\u4EF6\uFF0C\u65E0\u6CD5\u9884\u89C8"));
				return;
			}
			const wrap = elem("div", "lsb-gh-code-wrap");
			const pre = elem("pre", "lsb-gh-code");
			for (let index = 0; index < data.lines.length; index++) {
				const row = elem("span", "lsb-gh-line");
				row.append(elem("span", "lsb-gh-ln", String(data.start + index)), document.createTextNode(data.lines[index] || " "));
				pre.append(row);
			}
			wrap.append(pre);
			card.append(wrap);
			if (data.truncated) {
				const note = data.ranged ? `\u5DF2\u622A\u65AD\uFF0C\u5171 ${data.total} \u884C` : `\u9884\u89C8\u524D ${data.end} \u884C\uFF0C\u5171 ${data.total} \u884C`;
				card.append(elem("div", "lsb-gh-more", note));
			}
		}
	}
	/**
	 * 挂载 GitHub 内联卡片并异步加载数据。
	 * @param {HTMLElement} host 卡片宿主
	 * @param {HTMLElement} titleEl 链接标题元素
	 * @param {object} info classifyGithub 返回值
	 * @returns {void} 无返回值
	 */
	function mountGithubCard(host, titleEl, info) {
		const card = elem("div", "lsb-gh-card lsb-gh-loading", "\u52A0\u8F7D\u4E2D\u2026");
		host.append(card);
		titleEl.textContent = ghLabel(info);
		loadGithubCard(info).then((data) => {
			if (data?.title)
				titleEl.textContent = data.title;
			renderGithubCard(card, data);
		}).catch(() => {
			renderGithubCard(card, null);
		});
	}

	// src/linkify/linkify.css
	var linkify_default = ".lsb-url{\n	color:var(--brand-hover);\n	text-decoration:underline;\n	text-underline-offset:2px;\n	word-break:break-all;\n}\n.lsb-url:hover{color:var(--brand)}\n.lsb-link{\n	display:inline-flex;\n	align-items:center;\n	gap:.35em;\n	max-width:100%;\n	vertical-align:baseline;\n}\n.lsb-favicon{\n	width:14px;\n	height:14px;\n	flex:none;\n	border-radius:2px;\n}\n.lsb-title{font-weight:600}\n.lsb-inline-img{\n	display:block;\n	max-width:min(100%,520px);\n	max-height:480px;\n	margin:.5em 0;\n	border-radius:6px;\n}\n";

	// src/linkify/linkify.mjs
	/**
	 *
	 */
	/**
	 * @param {string} url 目标 URL
	 * @returns {HTMLImageElement} favicon 节点
	 */
	function makeFavicon(url) {
		const icon = document.createElement("img");
		icon.className = "lsb-favicon";
		icon.alt = "";
		icon.loading = "lazy";
		icon.referrerPolicy = "no-referrer";
		icon.src = faviconUrl(url);
		return icon;
	}
	/**
	 * @param {string} url 图片地址
	 * @param {string} alt 替代文本
	 * @param {() => void} onError 加载失败回调
	 * @returns {HTMLImageElement} 内联图
	 */
	function makeInlineImage(url, alt, onError) {
		const image = document.createElement("img");
		image.className = "lsb-inline-img";
		image.src = url;
		image.alt = alt;
		image.loading = "lazy";
		image.referrerPolicy = "no-referrer";
		image.onerror = onError;
		return image;
	}
	/**
	 * @param {string} url 图片地址
	 * @returns {HTMLAnchorElement} 包裹图片的链接
	 */
	function buildImage(url) {
		const anchor = document.createElement("a");
		anchor.className = "lsb-url";
		anchor.href = url;
		anchor.target = "_blank";
		anchor.rel = "noopener noreferrer";
		anchor.dataset.lsb = "1";
		anchor.appendChild(makeInlineImage(url, url, () => {
			anchor.textContent = url;
			anchor.classList.add("lsb-url");
		}));
		return anchor;
	}
	/**
	 * 先 HEAD（再必要时 GET）探测外链：图片则换成内联图，否则填标题。
	 * @param {HTMLAnchorElement} anchor 链接元素
	 * @param {HTMLElement} titleEl 标题容器
	 * @param {HTMLImageElement} icon 图标元素
	 * @param {string} url 目标 URL
	 * @returns {void}
	 */
	function enhanceLinkMeta(anchor, titleEl, icon, url) {
		fetchMeta(url).then((meta) => {
			if (meta.image) {
				const root = anchor.closest(".lsb-link") || anchor;
				root.replaceWith(buildImage(url));
				return;
			}
			if (meta.icon) icon.src = meta.icon;
			if (meta.title) {
				titleEl.textContent = meta.title;
				anchor.title = `${meta.title}
${url}`;
			}
		});
	}
	/**
	 * 为外链锚点套 favicon 包装，并挂 GitHub 卡或拉标题。
	 * @param {HTMLAnchorElement} anchor 已配置的外链
	 * @param {string} url 目标 URL
	 * @param {string} titleText 标题初始文案
	 * @returns {HTMLElement} 最终根节点（普通包装或 `.lsb-gh`）
	 */
	function mountExternalChrome(anchor, url, titleText) {
		const title = document.createElement("span");
		title.className = "lsb-title";
		title.textContent = titleText;
		anchor.replaceChildren(title);
		const wrap = document.createElement("span");
		wrap.className = "lsb-link";
		wrap.dataset.lsb = "1";
		const icon = makeFavicon(url);
		if (anchor.parentNode) {
			anchor.parentNode.insertBefore(wrap, anchor);
			wrap.append(icon, anchor);
		} else
			wrap.append(icon, anchor);
		const github = classifyGithub(url);
		if (github) {
			const host = document.createElement("span");
			host.className = "lsb-gh";
			host.dataset.lsb = "1";
			if (wrap.parentNode) {
				wrap.parentNode.insertBefore(host, wrap);
				host.append(wrap);
			} else
				host.append(wrap);
			mountGithubCard(host, title, github);
			return host;
		}
		enhanceLinkMeta(anchor, title, icon, url);
		return wrap;
	}
	/**
	 * @param {string} url 目标 URL
	 * @returns {HTMLElement} 增强链接根节点
	 */
	function buildLink(url) {
		const anchor = document.createElement("a");
		anchor.className = "lsb-url";
		anchor.href = url;
		anchor.target = "_blank";
		anchor.rel = "noopener noreferrer";
		anchor.dataset.lsb = "1";
		return mountExternalChrome(anchor, url, url);
	}
	/**
	 * @param {Text} node 文本节点
	 * @returns {void}
	 */
	function linkifyTextNode(node) {
		const text = node.nodeValue;
		URL_RE.lastIndex = 0;
		if (!URL_RE.test(text)) return;
		URL_RE.lastIndex = 0;
		const fragment = document.createDocumentFragment();
		let last = 0;
		let match;
		while (match = URL_RE.exec(text)) {
			const url = trimUrl(match[0]);
			const start = match.index;
			const end = start + url.length;
			if (start > last) fragment.appendChild(document.createTextNode(text.slice(last, start)));
			fragment.appendChild(isImageUrl(url) ? buildImage(url) : buildLink(url));
			last = end;
			URL_RE.lastIndex = end;
		}
		if (last < text.length) fragment.appendChild(document.createTextNode(text.slice(last)));
		node.parentNode.replaceChild(fragment, node);
	}
	/**
	 * 增强帖内已有的外链锚点。
	 * @param {HTMLAnchorElement} anchor 链接元素
	 * @returns {void}
	 */
	function enhanceExistingAnchor(anchor) {
		if (anchor.dataset.lsb || anchor.closest('[data-lsb="1"]')) return;
		const href = anchor.href;
		if (!isExternalHttp(href)) return;
		anchor.dataset.lsb = "1";
		anchor.classList.add("lsb-url");
		anchor.target || (anchor.target = "_blank");
		anchor.rel = "noopener noreferrer";
		if (isImageUrl(href)) {
			anchor.replaceChildren(makeInlineImage(href, anchor.textContent.trim() || href, function() {
				this.remove();
			}));
			return;
		}
		mountExternalChrome(anchor, href, anchor.textContent.trim() || href);
	}
	/**
	 * 遍历根节点下可 linkify 的文本节点。
	 * @param {Node} root 遍历起点
	 * @returns {void}
	 */
	function walkLinkify(root) {
		const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
			/**
			 * @param {Node} node 候选文本节点
			 * @returns {number} NodeFilter 常量
			 */
			acceptNode(node) {
				const parent = node.parentElement;
				if (!parent || SKIP_LINKIFY.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
				if (parent.closest("a, code, pre, [data-lsb]")) return NodeFilter.FILTER_REJECT;
				return NodeFilter.FILTER_ACCEPT;
			}
		});
		const nodes = [];
		for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node);
		for (const node of nodes) linkifyTextNode(node);
	}

	// src/markdown/markdown.css
	var markdown_default = `.lsb-md{
	line-height:1.65;
	word-break:break-word;
}
.lsb-md>:first-child{margin-top:0}
.lsb-md>:last-child{margin-bottom:0}
.lsb-md h1,.lsb-md h2,.lsb-md h3,.lsb-md h4,.lsb-md h5,.lsb-md h6{
	margin:1.1em 0 .45em;
	font-weight:700;
	line-height:1.35;
}
.lsb-md h1{font-size:1.45em}
.lsb-md h2{font-size:1.28em}
.lsb-md h3{font-size:1.14em}
.lsb-md h4,.lsb-md h5,.lsb-md h6{font-size:1em}
.lsb-md p,.lsb-md ul,.lsb-md ol,.lsb-md blockquote,.lsb-md pre,.lsb-md table,.lsb-md hr{
	margin:.7em 0;
}
.lsb-md ul,.lsb-md ol{
	padding-left:1.4em;
}
.lsb-md li{margin:.2em 0}
.lsb-md li>ul,.lsb-md li>ol{margin:.2em 0}
.lsb-md .task-list-item{
	list-style:none;
}
.lsb-md .task-list-item input[type=checkbox]{
	appearance:none;
	width:1.05em;
	height:1.05em;
	margin:0 .45em 0 -.2em;
	vertical-align:-.12em;
	border:1.5px solid var(--text-muted);
	border-radius:3px;
	background-color:color-mix(in srgb, var(--text) 8%, transparent);
}
.lsb-md .task-list-item input[type=checkbox]:checked{
	border-color:var(--brand);
	background-color:var(--brand);
	background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill='none' stroke='%23fff' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round' d='M3.5 8.5l3 3 6-7'/%3E%3C/svg%3E");
	background-size:.85em;
	background-position:center;
	background-repeat:no-repeat;
}
.lsb-md blockquote{
	margin-left:0;
	padding:.15em .9em;
	border-left:3px solid color-mix(in srgb, currentColor 28%, transparent);
	opacity:.92;
}
.lsb-md blockquote>:first-child{margin-top:0}
.lsb-md blockquote>:last-child{margin-bottom:0}
.lsb-md hr{
	border:0;
	border-top:1px solid color-mix(in srgb, currentColor 18%, transparent);
}
.lsb-md code{
	font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
	font-size:.9em;
	padding:.1em .35em;
	border-radius:4px;
	background:color-mix(in srgb, currentColor 8%, transparent);
}
.lsb-md pre{
	overflow:auto;
	padding:.75em 1em;
	border-radius:8px;
	background:color-mix(in srgb, currentColor 7%, transparent);
}
.lsb-md pre code{
	padding:0;
	background:none;
	font-size:.86em;
}
.lsb-md table{
	display:block;
	max-width:100%;
	overflow:auto;
	border-collapse:collapse;
}
.lsb-md th,.lsb-md td{
	border:1px solid color-mix(in srgb, currentColor 16%, transparent);
	padding:.35em .65em;
	text-align:left;
}
.lsb-md th{
	font-weight:600;
	background:color-mix(in srgb, currentColor 6%, transparent);
}
.lsb-md img{
	display:block;
	max-width:min(100%,520px);
	max-height:480px;
	margin:.5em 0;
	border-radius:6px;
}
.lsb-md a{
	color:var(--brand-hover);
	text-decoration:underline;
	text-underline-offset:2px;
}
.lsb-md a:hover{color:var(--brand)}
.lsb-md .katex-display{
	overflow-x:auto;
	overflow-y:hidden;
	padding:.25em 0;
}
.lsb-md .lsb-mermaid-error{
	color:var(--danger, #b91c1c);
	white-space:pre-wrap;
}
.lsb-md pre.shiki,.lsb-md .shiki{
	overflow:auto;
	padding:.75em 1em;
	border-radius:8px;
}
.lsb-md svg[id^="lsb-mmd-"],.lsb-md svg[id^="mermaid-"]{
	display:block;
	max-width:100%;
	height:auto;
	margin:.7em 0;
}
`;

	// src/markdown/markdown.mjs
	/**
	 *
	 */
	var ESM = {
		unified: "https://esm.sh/unified@11",
		remarkParse: "https://esm.sh/remark-parse@11",
		remarkGfm: "https://esm.sh/remark-gfm@4",
		remarkBreaks: "https://esm.sh/remark-breaks@4",
		remarkMath: "https://esm.sh/remark-math@6",
		remarkRehype: "https://esm.sh/remark-rehype@11",
		rehypeStringify: "https://esm.sh/rehype-stringify@10",
		rehypeKatex: "https://esm.sh/rehype-katex@7",
		mermaid: "https://esm.sh/mermaid@11",
		shiki: "https://esm.sh/shiki@3",
		visit: "https://esm.sh/unist-util-visit@5",
		fromHtml: "https://esm.sh/hast-util-from-html@2",
		toString: "https://esm.sh/hast-util-to-string@3"
	};
	var SANITIZE_URL = "https://cdn.jsdelivr.net/gh/steve02081504/fount/src/public/pages/scripts/lib/sanitizeHtml.mjs";
	var KATEX_CSS = "https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.css";
	var baseLoadCache = /* @__PURE__ */ new Map();
	var processorCache = /* @__PURE__ */ new Map();
	/**
	 * 检测帖文是否需要数学、mermaid 或代码高亮插件。
	 * @param {string} src 原始 Markdown 文本
	 * @returns {{math: boolean, mermaid: boolean, code: boolean}} 特性标记
	 */
	function detect(src) {
		const fences = [...src.matchAll(/^```([^\n]*)/gm)].map((m) => m[1].trim().split(/\s+/)[0].toLowerCase());
		return {
			math: /\$\$[\s\S]+?\$\$|(?<![\\$])\$[^$\n]+\$/.test(src),
			mermaid: fences.includes("mermaid"),
			code: fences.some((lang) => lang !== "mermaid")
		};
	}
	/**
	 * 将特性标记编码为处理器缓存键。
	 * @param {{math: boolean, mermaid: boolean, code: boolean}} feat 特性标记
	 * @returns {string} 缓存键
	 */
	function featKey(feat) {
		return `${feat.math ? 1 : 0}${feat.mermaid ? 1 : 0}${feat.code ? 1 : 0}`;
	}
	/**
	 * 按需注入 KaTeX 样式表。
	 * @returns {void} 无返回值
	 */
	function ensureKatexCss() {
		if (document.getElementById("lsb-katex-css")) return;
		const link = document.createElement("link");
		link.id = "lsb-katex-css";
		link.rel = "stylesheet";
		link.href = KATEX_CSS;
		document.documentElement.appendChild(link);
	}
	/**
	 * 读取 hast 元素的 className 列表。
	 * @param {object} node hast 元素节点
	 * @returns {string[]} 类名数组
	 */
	function classList(node) {
		const c = node.properties?.className;
		if (!c) return [];
		return Array.isArray(c) ? c.map(String) : String(c).split(/\s+/);
	}
	/**
	 * 创建 rehype 插件，按 fount 规则消毒 HTML。
	 * @param {Set<string>} BLOCKED_HTML_TAGS 禁止标签集合
	 * @param {Set<string>} URL_HTML_ATTRIBUTES 需校验 URL 的属性
	 * @param {(url: unknown) => boolean} isSafeHtmlUrl URL 安全校验
	 * @param {Function} visit unist-util-visit
	 * @returns {() => (tree: object) => void} rehype 插件工厂
	 */
	function rehypeSanitize(BLOCKED_HTML_TAGS, URL_HTML_ATTRIBUTES, isSafeHtmlUrl, visit) {
		return () => (tree) => {
			visit(tree, "element", (node, index, parent) => {
				const tag = String(node.tagName || "").toLowerCase();
				if (BLOCKED_HTML_TAGS.has(tag)) {
					parent.children.splice(index, 1);
					return index;
				}
				const props = node.properties || (node.properties = {});
				for (const key of Object.keys(props)) {
					const lower = key.toLowerCase();
					if (lower.startsWith("on")) {
						delete props[key];
						continue;
					}
					if (!URL_HTML_ATTRIBUTES.has(lower)) continue;
					if (lower === "srcset") {
						delete props[key];
						continue;
					}
					if (!isSafeHtmlUrl(props[key])) delete props[key];
				}
			});
		};
	}
	/** Mermaid 主题 CSS：用站点变量，随 `html.lsb-dark` 切换，无需重渲。 */
	var MERMAID_THEME_CSS = (
		/* css */
		`
.node rect, .node circle, .node polygon, .node ellipse, .node path,
.cluster rect, .cluster polygon,
.section0 rect, .section1 rect, .section2 rect, .section3 rect,
.actor rect, .actor line,
.title rect, .title polygon,
g.classGroup rect, g.stateGroup rect, .statediagram-cluster rect {
	fill: var(--panel) !important;
	stroke: var(--text) !important;
	stroke-opacity: 0.35 !important;
}

.title rect, .title polygon,
g.stateGroup .composit, .statediagram-cluster .inner {
	fill: var(--bg) !important;
}
.statediagram-cluster.statediagram-cluster-alt .inner { fill: var(--bg-soft, #f7f7f7) !important; }

.nodeLabel, .node .label, .edgeLabel, .cluster-label, .label span,
.title .label, .title text, g.stateGroup text, .stateLabel text,
.statediagramTitleText, .classTitleText {
	fill: var(--text) !important;
	color: var(--text) !important;
}

.edgePath path, .edgePath line, .marker path, .arrowheadPath,
.relation, .transition, g.stateGroup line, .statediagram-cluster .divider,
[id$="-compositionStart"], [id$="-compositionEnd"],
[id$="-dependencyStart"], [id$="-dependencyEnd"],
[id$="-extensionStart"], [id$="-extensionEnd"],
[id$="-aggregationStart"], [id$="-aggregationEnd"],
[id$="-lollipopStart"], [id$="-lollipopEnd"],
defs [id$="-barbEnd"] {
	stroke: var(--text) !important;
	fill: var(--text) !important;
}
[id$="-extensionStart"], [id$="-extensionEnd"], [id$="-aggregationStart"], [id$="-aggregationEnd"] { fill: transparent !important; }
[id$="-lollipopStart"], [id$="-lollipopEnd"] { fill: var(--panel) !important; }

.edgeLabel .label rect, .stateLabel .box, .classLabel .box {
	fill: var(--panel) !important;
	opacity: 0.5 !important;
	stroke: none !important;
}
.divider, g.classGroup line { stroke: var(--text) !important; stroke-opacity: 0.35 !important; }
.statediagram-state rect.divider { stroke-dasharray: 10,10 !important; fill: var(--bg-soft, #f7f7f7) !important; }

.note rect, .note polygon, .state-note, .statediagram-note rect {
	fill: var(--warning, #fff5ad) !important;
	stroke: var(--warning, #fff5ad) !important;
}
.note .label, .note text, .state-note text, .statediagram-note text, .statediagram-note .nodeLabel {
	fill: #1c1917 !important;
	color: #1c1917 !important;
}

.activation0, .activation1, .activation2,
g.stateGroup .alt-composit, .statediagram-state rect.divider {
	fill: var(--bg-soft, #f7f7f7) !important;
}

.node circle.state-start, .node .fork-join {
	fill: var(--brand) !important;
	stroke: var(--brand) !important;
}
.node circle.state-end, .end-state-inner {
	fill: var(--text) !important;
	stroke: var(--bg) !important;
	stroke-width: 1.5 !important;
}
.actor-man line { stroke: var(--text) !important; }

.text-muted {
	fill: var(--text) !important;
	color: var(--text) !important;
	opacity: 0.7;
}
.statediagram-state rect.basic { rx: 5px !important; ry: 5px !important; }
.statediagram-cluster rect.outer { rx: 5px !important; ry: 5px !important; }
g.classGroup .title { font-weight: bolder !important; }
.classTitle { font-weight: bolder !important; }
`
	);
	/** 图源 frontmatter / init 不可覆盖的 mermaid 配置键。 */
	var MERMAID_SECURE_KEYS = [
		"secure",
		"securityLevel",
		"startOnLoad",
		"maxTextSize",
		"theme",
		"themeCSS"
	];
	/**
	 * 创建 rehype 插件，将 mermaid 代码块渲染为 SVG。
	 * @param {object} mermaid mermaid 实例
	 * @param {Function} visit unist-util-visit
	 * @param {Function} fromHtml hast-util-from-html
	 * @param {Function} toString hast-util-to-string
	 * @returns {() => (tree: object) => Promise<void>} rehype 异步插件工厂
	 */
	function rehypeMermaid(mermaid, visit, fromHtml, toString) {
		mermaid.initialize({
			startOnLoad: false,
			securityLevel: "strict",
			theme: "base",
			suppressErrorRendering: true,
			themeCSS: MERMAID_THEME_CSS,
			secure: MERMAID_SECURE_KEYS
		});
		return () => async (tree) => {
			const targets = [];
			visit(tree, "element", (node, index, parent) => {
				if (!parent || node.tagName !== "pre") return;
				const code = node.children?.find((c) => c.type === "element" && c.tagName === "code");
				if (!code) return;
				if (!classList(code).some((c) => c === "language-mermaid" || c.endsWith("mermaid"))) return;
				targets.push({ index, parent, text: toString(code) });
			});
			for (const t of [...targets].sort((a, b) => b.index - a.index))
				try {
					const id = `lsb-mmd-${Math.random().toString(36).slice(2, 10)}`;
					const { svg } = await mermaid.render(id, t.text);
					const nodes = fromHtml(svg, { fragment: true }).children;
					t.parent.children.splice(t.index, 1, ...nodes);
				} catch {
					t.parent.children[t.index] = {
						type: "element",
						tagName: "pre",
						properties: { className: ["lsb-mermaid-error"] },
						children: [{ type: "text", value: t.text }]
					};
				}
		};
	}
	/**
	 * 创建 rehype 插件，用 Shiki 高亮代码块。
	 * @param {Function} codeToHtml Shiki codeToHtml
	 * @param {Function} visit unist-util-visit
	 * @param {Function} fromHtml hast-util-from-html
	 * @param {Function} toString hast-util-to-string
	 * @returns {() => (tree: object) => Promise<void>} rehype 异步插件工厂
	 */
	function rehypeShiki(codeToHtml, visit, fromHtml, toString) {
		return () => async (tree) => {
			const targets = [];
			visit(tree, "element", (node, index, parent) => {
				if (!parent || node.tagName !== "pre") return;
				const code = node.children?.find((c) => c.type === "element" && c.tagName === "code");
				if (!code) return;
				const lang = classList(code).find((c) => c.startsWith("language-"))?.slice("language-".length) || "text";
				if (lang === "mermaid") return;
				targets.push({ index, parent, lang, text: toString(code).replace(/\n$/, "") });
			});
			for (const t of [...targets].sort((a, b) => b.index - a.index)) {
				let html;
				try {
					html = await codeToHtml(t.text, { lang: t.lang, theme: "github-dark" });
				} catch {
					html = await codeToHtml(t.text, { lang: "text", theme: "github-dark" });
				}
				const nodes = fromHtml(html, { fragment: true }).children;
				t.parent.children.splice(t.index, 1, ...nodes);
			}
		};
	}
	/**
	 * 懒加载 unified 基础依赖与消毒模块。
	 * @returns {Promise<object>} 基础解析器组件
	 */
	async function loadBase() {
		if (baseLoadCache.has("v")) return baseLoadCache.get("v");
		const task = Promise.all([
			import(ESM.unified),
			import(ESM.remarkParse),
			import(ESM.remarkGfm),
			import(ESM.remarkBreaks),
			import(ESM.remarkRehype),
			import(ESM.rehypeStringify),
			import(ESM.visit),
			import(SANITIZE_URL)
		]).then(([
			{ unified },
			{ default: remarkParse },
			{ default: remarkGfm },
			{ default: remarkBreaks },
			{ default: remarkRehype },
			{ default: rehypeStringify },
			{ visit },
			sanitize
		]) => ({ unified, remarkParse, remarkGfm, remarkBreaks, remarkRehype, rehypeStringify, visit, sanitize }));
		baseLoadCache.set("v", task);
		task.catch(() => baseLoadCache.delete("v"));
		return task;
	}
	/**
	 * 按帖文特性获取或创建 Markdown 处理器。
	 * @param {{math: boolean, mermaid: boolean, code: boolean}} feat 特性标记
	 * @returns {Promise<object>} unified 处理器
	 */
	async function getProcessor(feat) {
		const key = featKey(feat);
		if (processorCache.has(key)) return processorCache.get(key);
		const task = (async () => {
			const base = await loadBase();
			const {
				unified,
				remarkParse,
				remarkGfm,
				remarkBreaks,
				remarkRehype,
				rehypeStringify,
				visit,
				sanitize
			} = base;
			const { BLOCKED_HTML_TAGS, URL_HTML_ATTRIBUTES, isSafeHtmlUrl } = sanitize;
			let processor = unified().use(remarkParse).use(remarkBreaks).use(remarkGfm, { singleTilde: false });
			let katexPlugin;
			if (feat.math) {
				ensureKatexCss();
				const [{ default: remarkMath }, { default: rehypeKatex }] = await Promise.all([
					import(ESM.remarkMath),
					import(ESM.rehypeKatex)
				]);
				processor = processor.use(remarkMath);
				katexPlugin = rehypeKatex;
			}
			processor = processor.use(remarkRehype, { allowDangerousHtml: false }).use(rehypeSanitize(BLOCKED_HTML_TAGS, URL_HTML_ATTRIBUTES, isSafeHtmlUrl, visit));
			if (katexPlugin) processor = processor.use(katexPlugin);
			if (feat.mermaid || feat.code) {
				const [{ fromHtml }, { toString }] = await Promise.all([
					import(ESM.fromHtml),
					import(ESM.toString)
				]);
				if (feat.mermaid) {
					const { default: mermaid } = await import(ESM.mermaid);
					processor = processor.use(rehypeMermaid(mermaid, visit, fromHtml, toString));
				}
				if (feat.code) {
					const { codeToHtml } = await import(ESM.shiki);
					processor = processor.use(rehypeShiki(codeToHtml, visit, fromHtml, toString));
				}
			}
			return processor.use(rehypeStringify);
		})();
		processorCache.set(key, task);
		task.catch(() => processorCache.delete(key));
		return task;
	}
	/**
	 * 从帖文 DOM 还原 Markdown 源文本。
	 * @param {Element} post 帖文容器
	 * @returns {string} 源 Markdown
	 */
	function sourceFromPost(post) {
		return post.innerText.replace(/\u00a0/g, " ").replace(/\r\n?/g, "\n").replace(/\n+$/, "");
	}
	/**
	 * 将帖文容器渲染为 Markdown HTML。
	 * @param {Element} post 帖文容器
	 * @returns {Promise<void>} 无返回值
	 */
	async function renderMarkdown(post) {
		if (post.dataset.lsbMd) return;
		post.dataset.lsbMd = "1";
		const src = sourceFromPost(post);
		if (!src) return;
		const feat = detect(src);
		const processor = await getProcessor(feat);
		const file = await processor.process(src);
		const template = document.createElement("template");
		template.innerHTML = String(file);
		post.replaceChildren(...template.content.childNodes);
		post.classList.add("lsb-md");
	}

	// src/tip/tip.css
	var tip_default = ".lsb-tip{\n	position:fixed;\n	z-index:99999;\n	min-width:220px;\n	max-width:min(360px,calc(100vw - 16px));\n	padding:10px 12px;\n	border:1px solid color-mix(in srgb, CanvasText 14%, transparent);\n	border-radius:10px;\n	background:Canvas;\n	color:CanvasText;\n	box-shadow:0 10px 30px color-mix(in srgb, CanvasText 18%, transparent);\n	font:13px/1.45 system-ui,sans-serif;\n	pointer-events:auto;\n}\n.lsb-tip[hidden]{display:none!important}\n.lsb-tip-loading{opacity:.7}\n.lsb-tip-user,.lsb-tip-row{\n	display:flex;\n	gap:10px;\n	align-items:flex-start;\n}\n.lsb-tip-row{margin-top:8px}\n.lsb-tip-avatar{\n	width:40px;\n	height:40px;\n	border-radius:50%;\n	object-fit:cover;\n	flex:none;\n	background:color-mix(in srgb, CanvasText 8%, transparent);\n}\n.lsb-tip-name{font-weight:700}\n.lsb-tip-sub{\n	margin-top:2px;\n	opacity:.72;\n	font-size:12px;\n}\n.lsb-tip-snippet{\n	margin-top:6px;\n	opacity:.88;\n	display:-webkit-box;\n	-webkit-line-clamp:4;\n	-webkit-box-orient:vertical;\n	overflow:hidden;\n	white-space:pre-wrap;\n	word-break:break-word;\n}\n.lsb-tip-badge{\n	display:inline-block;\n	margin-top:4px;\n	padding:1px 6px;\n	border-radius:999px;\n	background:color-mix(in srgb, CanvasText 8%, transparent);\n	font-size:12px;\n}\n";

	// src/tip/tip.mjs
	/**
	 *
	 */
	var tip;
	var showTimer = 0;
	var hideTimer = 0;
	var tipToken = 0;
	/**
	 * @param {string} html 页面 HTML
	 * @returns {Document} 解析后的文档
	 */
	function parseDoc(html) {
		return new DOMParser().parseFromString(html, "text/html");
	}
	/**
	 * @param {Document} doc 解析后的文档
	 * @returns {{kind: 'user', name: string, rank: string, avatar: string} | null} 用户卡数据
	 */
	function parseUserCard(doc) {
		const card = doc.querySelector(".user-card");
		if (!card) return null;
		const avatar = card.querySelector(".avatar-img")?.getAttribute("src");
		return {
			kind: "user",
			name: card.querySelector(".user-name")?.textContent?.trim() || "",
			rank: card.querySelector(".user-rank")?.textContent?.trim() || "",
			avatar: avatar ? absUrl(avatar) : ""
		};
	}
	/**
	 * 从文档与楼层节点拼主题卡。
	 * @param {Document | DocumentFragment | Element} root 标题/统计所在根
	 * @param {Element | null | undefined} post 楼层节点
	 * @param {string | number} [floor] 楼层号
	 * @returns {{kind: 'topic', title: string, stats: string[], floor: string | number, author: string, rank: string, avatar: string, snippet: string}} 主题卡数据
	 */
	function topicCardFrom(root, post, floor) {
		const title = root.querySelector(".post-content-title")?.textContent?.trim() || root.querySelector("h1")?.textContent?.trim() || "";
		const stats = [...root.querySelectorAll(".post-content-stats span")].map((span) => span.textContent.replace(/\s+/g, " ").trim()).filter(Boolean);
		const avatar = post?.querySelector(".avatar-img")?.getAttribute("src");
		return {
			kind: "topic",
			title,
			stats,
			floor: floor || "",
			author: post?.querySelector(".post-author")?.textContent?.trim() || "",
			rank: post?.querySelector(".post-user-group")?.textContent?.trim() || "",
			avatar: avatar ? absUrl(avatar) : "",
			snippet: post?.querySelector(".post-content")?.textContent?.replace(/\s+/g, " ").trim() || ""
		};
	}
	/**
	 * @param {Document} doc 解析后的文档
	 * @param {string | number} [floor] 楼层号
	 * @returns {ReturnType<typeof topicCardFrom>} 主题卡数据
	 */
	function parseTopicCard(doc, floor) {
		const post = floor ? doc.querySelector(`.post-item[data-floor="${CSS.escape(String(floor))}"]`) : doc.querySelector(".topic-post-list .post-item, .post-list .post-item");
		return topicCardFrom(doc, post, floor);
	}
	/**
	 * 同页楼层优先读 DOM。
	 * @param {string} topicId 主题 ID
	 * @param {string | number} floor 楼层号
	 * @returns {ReturnType<typeof topicCardFrom> | null} 同页楼层主题卡，无则 null
	 */
	function localFloorCard(topicId, floor) {
		if (!floor || !location.pathname.startsWith(`/topic/${topicId}`)) return null;
		const post = document.querySelector(`.post-item[data-floor="${CSS.escape(String(floor))}"]`);
		if (!post) return null;
		return topicCardFrom(document, post, String(floor));
	}
	/**
	 * @param {string} href 链接地址
	 * @returns {{kind: 'user', url: string} | {kind: 'topic', url: string, tid: string, floor: string} | null} 站内链接分类
	 */
	function classifyInternal(href) {
		let parsed;
		try {
			parsed = new URL(href, location.href);
		} catch {
			return null;
		}
		if (parsed.origin !== location.origin) return null;
		if (parsed.pathname === "/user" && parsed.searchParams.has("username"))
			return { kind: "user", url: parsed.href };
		if (/^\/user\/\d+\/?$/.test(parsed.pathname))
			return { kind: "user", url: parsed.href };
		const topic = parsed.pathname.match(/^\/topic\/(\d+)\/?$/);
		if (topic)
			return {
				kind: "topic",
				url: parsed.href,
				tid: topic[1],
				floor: parsed.searchParams.get("floor") || ""
			};
		return null;
	}
	/**
	 * @param {object | null} data 用户或主题卡数据
	 * @returns {void}
	 */
	function renderTip(data) {
		tip.replaceChildren();
		if (!data) {
			tip.append(elem("div", "lsb-tip-loading", "\u52A0\u8F7D\u5931\u8D25"));
			return;
		}
		if (data.kind === "user") {
			const row = elem("div", "lsb-tip-user");
			if (data.avatar) {
				const image = elem("img", "lsb-tip-avatar");
				image.src = data.avatar;
				image.alt = "";
				image.referrerPolicy = "no-referrer";
				row.append(image);
			}
			const meta = elem("div");
			meta.append(elem("div", "lsb-tip-name", data.name || "\u7528\u6237"));
			if (data.rank) meta.append(elem("div", "lsb-tip-sub", data.rank));
			row.append(meta);
			tip.append(row);
			return;
		}
		const box = elem("div");
		box.append(elem("div", "lsb-tip-name", data.title || "\u4E3B\u9898"));
		if (data.stats?.length) box.append(elem("div", "lsb-tip-sub", data.stats.join(" \xB7 ")));
		if (data.floor) box.append(elem("div", "lsb-tip-badge", `#${data.floor}`));
		if (data.author || data.snippet || data.avatar) {
			const row = elem("div", "lsb-tip-row");
			if (data.avatar) {
				const image = elem("img", "lsb-tip-avatar");
				image.src = data.avatar;
				image.alt = "";
				image.referrerPolicy = "no-referrer";
				row.append(image);
			}
			const meta = elem("div");
			if (data.author)
				meta.append(elem("div", "lsb-tip-sub", data.rank ? `${data.author} \xB7 ${data.rank}` : data.author));
			if (data.snippet) meta.append(elem("div", "lsb-tip-snippet", data.snippet));
			row.append(meta);
			box.append(row);
		}
		tip.append(box);
	}
	/**
	 * @param {Element} anchor 触发链接
	 * @returns {void}
	 */
	function placeTip(anchor) {
		tip.hidden = false;
		const rect = anchor.getBoundingClientRect();
		const pad = 8;
		const tipWidth = tip.offsetWidth;
		const tipHeight = tip.offsetHeight;
		const left = Math.min(Math.max(pad, rect.left), innerWidth - tipWidth - pad);
		let top = rect.bottom + pad;
		if (top + tipHeight > innerHeight - pad) top = Math.max(pad, rect.top - tipHeight - pad);
		tip.style.left = `${left}px`;
		tip.style.top = `${top}px`;
	}
	/**
	 * @returns {void}
	 */
	function scheduleHide() {
		clearTimeout(hideTimer);
		hideTimer = setTimeout(() => {
			tip.hidden = true;
			tip.replaceChildren();
			tipToken++;
		}, 160);
	}
	/**
	 * @param {{kind: 'user', url: string} | {kind: 'topic', url: string, tid: string, floor: string}} info 站内链接信息
	 * @returns {Promise<object | null>} 悬浮卡数据
	 */
	async function loadInternalCard(info) {
		if (info.kind === "user") return parseUserCard(parseDoc(await siteGet(info.url)));
		const local = localFloorCard(info.tid, info.floor);
		if (local) return local;
		return parseTopicCard(parseDoc(await siteGet(info.url)), info.floor);
	}
	/**
	 * @param {Element} anchor 触发链接
	 * @param {{kind: 'user', url: string} | {kind: 'topic', url: string, tid: string, floor: string}} info 站内链接信息
	 * @returns {void}
	 */
	function showTip(anchor, info) {
		const token = ++tipToken;
		tip.classList.add("lsb-tip-loading");
		tip.replaceChildren(elem("div", null, "\u52A0\u8F7D\u4E2D\u2026"));
		placeTip(anchor);
		loadInternalCard(info).then((data) => {
			if (token !== tipToken) return;
			tip.classList.remove("lsb-tip-loading");
			renderTip(data);
			placeTip(anchor);
		}).catch(() => {
			if (token !== tipToken) return;
			tip.classList.remove("lsb-tip-loading");
			renderTip(null);
			placeTip(anchor);
		});
	}
	/**
	 * @returns {void}
	 */
	function initTip() {
		tip = document.createElement("div");
		tip.className = "lsb-tip";
		tip.hidden = true;
		document.documentElement.appendChild(tip);
		tip.addEventListener("mouseenter", () => clearTimeout(hideTimer));
		tip.addEventListener("mouseleave", scheduleHide);
	}
	/**
	 * @param {HTMLAnchorElement} anchor 链接元素
	 * @returns {void}
	 */
	function bindInternalTip(anchor) {
		if (anchor.dataset.lsbTip) return;
		const info = classifyInternal(anchor.href);
		if (!info) return;
		anchor.dataset.lsbTip = "1";
		anchor.addEventListener("mouseenter", () => {
			clearTimeout(hideTimer);
			clearTimeout(showTimer);
			showTimer = setTimeout(() => showTip(anchor, info), 220);
		});
		anchor.addEventListener("mouseleave", () => {
			clearTimeout(showTimer);
			scheduleHide();
		});
	}

	// src/post/post.mjs
	/**
	 * 对单个帖文：Markdown → linkify → 站内悬浮。
	 * @param {Element} post `.post-content`
	 * @returns {Promise<void>}
	 */
	async function processPost(post) {
		try {
			await renderMarkdown(post);
		} catch {
		}
		walkLinkify(post);
		for (const anchor of post.querySelectorAll("a[href]"))
			if (isExternalHttp(anchor.href)) enhanceExistingAnchor(anchor);
			else bindInternalTip(anchor);
	}
	/**
	 * 处理页面或子树内所有帖文与作者链接。
	 * @param {ParentNode} [root=document] 处理起点
	 * @returns {void}
	 */
	function processAll(root = document) {
		const posts = [...root.querySelectorAll(".post-content")];
		if (root.nodeType === 1 && root.matches(".post-content")) posts.push(root);
		for (const post of posts) processPost(post);
		const authors = [...root.querySelectorAll(".post-author[href]")];
		if (root.nodeType === 1 && root.matches(".post-author[href]")) authors.push(root);
		for (const author of authors) bindInternalTip(author);
	}

	// src/submit/submit.mjs
	/**
	 * @param {Element} el 目标元素
	 * @returns {{x: number, y: number}} 元素中心坐标
	 */
	function centerOf(el) {
		const rect = el.getBoundingClientRect();
		return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
	}
	/**
	 * @param {{x: number, y: number}} a 点 A
	 * @param {{x: number, y: number}} b 点 B
	 * @returns {number} 平方距离
	 */
	function distSq(a, b) {
		const dx = a.x - b.x;
		const dy = a.y - b.y;
		return dx * dx + dy * dy;
	}
	/**
	 * @param {Element} el 目标元素
	 * @returns {boolean} 是否在布局中可见
	 */
	function visible(el) {
		return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
	}
	/**
	 * @param {ParentNode} scope 搜索范围
	 * @returns {HTMLElement[]} 可见的 submit 候选按钮
	 */
	function submitCandidates(scope) {
		return [...scope.querySelectorAll('button[type="submit"], input[type="submit"], button:not([type])')].filter((el) => !el.disabled && visible(el));
	}
	/**
	 * @param {HTMLElement[]} pool 候选按钮
	 * @param {Element} from 当前输入元素
	 * @returns {HTMLElement | null} 距离最近的 submit
	 */
	function nearestInPool(pool, from) {
		if (!pool.length) return null;
		const origin = centerOf(from);
		return pool.reduce((best, el) => distSq(origin, centerOf(el)) < distSq(origin, centerOf(best)) ? el : best);
	}
	/**
	 * 找离输入框最近的 submit，优先同 form。
	 * @param {Element} from 当前输入元素
	 * @returns {HTMLElement | null} 距离最近的 submit
	 */
	function nearestSubmit(from) {
		const form = from.closest("form");
		return nearestInPool(submitCandidates(form || document), from) || form && nearestInPool(submitCandidates(document), from) || null;
	}
	/**
	 * @param {EventTarget | null} el 目标元素
	 * @returns {boolean} 是否为可编辑输入
	 */
	function isEditable(el) {
		if (!el || el.disabled || el.readOnly) return false;
		const tag = el.tagName;
		if (tag === "TEXTAREA") return true;
		if (tag === "INPUT") {
			const type = (el.type || "text").toLowerCase();
			return !["button", "submit", "reset", "checkbox", "radio", "file", "image", "range", "color", "hidden"].includes(type);
		}
		return el.isContentEditable;
	}
	/**
	 * 绑定 Ctrl/Cmd+Enter 提交当前表单。
	 * @returns {void}
	 */
	function installSubmit() {
		document.addEventListener("keydown", (event) => {
			if (!(event.ctrlKey || event.metaKey) || event.key !== "Enter") return;
			if (event.isComposing) return;
			const target = event.target;
			if (!isEditable(target)) return;
			const submitButton = nearestSubmit(target);
			if (!submitButton) return;
			event.preventDefault();
			event.stopPropagation();
			submitButton.click();
		}, true);
	}

	// src/theme/theme.css
	var theme_default = "html.lsb-dark{\n	color-scheme:dark;\n	--bg:#121418;\n	--bg-soft:#16191f;\n	--panel:#1a1d24;\n	--card-bg:#1a1d24;\n	--line:#2c313c;\n	--line-soft:#232830;\n	--text:#e6e8ec;\n	--text-muted:#9aa3b2;\n	--text-subtle:#6e7685;\n	--text-disabled:#555c68;\n	--brand:#7b95c9;\n	--brand-hover:#97aed8;\n	--brand-soft:#243044;\n	--success:#5aabff;\n	--success-soft:#1c2b40;\n	--danger:#e06b6b;\n	--danger-soft:#3a1f22;\n	--warning:#e0a05a;\n	--warning-soft:#3a2a16;\n	--info:#6bb0ff;\n	--info-soft:#1a2a40;\n	--inverse:#0c0e12;\n	--inverse-border:#3a4150;\n	--inverse-text:#e6e8ec;\n	--color-dark-rgb:0,0,0;\n	--backdrop:rgba(0,0,0,.55);\n	--shadow-base:rgba(0,0,0,.28);\n	--shadow-medium:rgba(0,0,0,.45);\n	--focus-ring:rgba(123,149,201,.35);\n}\n.lsb-theme-toggle{\n	display:inline-flex;\n	align-items:center;\n	justify-content:center;\n	flex:0 0 auto;\n	min-width:52px;\n	min-height:30px;\n	height:30px;\n	padding:0 10px;\n	border:1px solid var(--line)!important;\n	border-radius:var(--radius-sm);\n	background:var(--panel)!important;\n	color:var(--text-muted)!important;\n	font:inherit;\n	font-size:var(--font-size-sm);\n	font-weight:500;\n	line-height:1;\n	cursor:pointer;\n	user-select:none;\n	white-space:nowrap;\n}\n.lsb-theme-toggle:hover{\n	background:var(--bg)!important;\n	color:var(--text)!important;\n	border-color:var(--text-subtle)!important;\n}\n.bar .search-form{grid-column:5}\n.bar .lsb-theme-toggle{\n	grid-column:6;\n	grid-row:1;\n	justify-self:end;\n}\n@media(max-width:720px){\n	.bar .lsb-theme-toggle{height:26px;min-height:26px;min-width:44px;padding:0 8px}\n}\n";

	// src/theme/theme.mjs
	/**
	 *
	 */
	var KEY = "lsb-theme";
	/**
	 * @returns {boolean} 当前是否为深色模式
	 */
	function isDark() {
		return (localStorage.getItem(KEY) ?? "dark") === "dark";
	}
	/**
	 * @param {boolean} [dark=isDark()] 是否启用深色
	 * @returns {void}
	 */
	function applyTheme(dark = isDark()) {
		document.documentElement.classList.toggle("lsb-dark", dark);
	}
	/**
	 * @param {HTMLButtonElement} toggleButton 切换按钮
	 * @returns {void}
	 */
	function syncToggle(toggleButton) {
		const dark = document.documentElement.classList.contains("lsb-dark");
		toggleButton.textContent = dark ? "\u6D45\u8272" : "\u6DF1\u8272";
		toggleButton.title = dark ? "\u5207\u6362\u6D45\u8272\u6A21\u5F0F" : "\u5207\u6362\u6DF1\u8272\u6A21\u5F0F";
		toggleButton.setAttribute("aria-pressed", String(dark));
	}
	/**
	 * @returns {void}
	 */
	function toggleTheme() {
		const next = !document.documentElement.classList.contains("lsb-dark");
		localStorage.setItem(KEY, next ? "dark" : "light");
		applyTheme(next);
		const toggleButton = document.querySelector(".lsb-theme-toggle");
		if (toggleButton) syncToggle(toggleButton);
	}
	/**
	 * 应用主题并在顶栏安装切换按钮。
	 * document-start 时已调用过 applyTheme；此处再同步一次并装按钮。
	 * @returns {void}
	 */
	function installTheme() {
		applyTheme();
		if (document.querySelector(".lsb-theme-toggle")) return;
		const bar = document.querySelector(".bar");
		if (!bar) return;
		const toggleButton = elem("button", "lsb-theme-toggle");
		toggleButton.type = "button";
		toggleButton.addEventListener("click", toggleTheme);
		syncToggle(toggleButton);
		const search = bar.querySelector(".search-form");
		if (search) search.after(toggleButton);
		else bar.appendChild(toggleButton);
	}

	// src/main.mjs
	applyTheme();
	var style = document.createElement("style");
	style.textContent = [theme_default, markdown_default, linkify_default, tip_default, github_default].join("\n");
	document.documentElement.appendChild(style);
	/**
	 * DOM 就绪后挂交互与帖文处理。
	 * @returns {void}
	 */
	function boot() {
		installTheme();
		initTip();
		installSubmit();
		processAll();
		new MutationObserver((mutations) => {
			for (const mutation of mutations)
				for (const node of mutation.addedNodes) {
					if (node.nodeType !== 1) continue;
					processAll(node);
				}
		}).observe(document.documentElement, { childList: true, subtree: true });
	}
	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
	else boot();
})();
