import { GH_HOST_RE, IMG_EXT_RE, TRAIL_PUNCT_RE } from './constants.mjs'

/**
 * 去掉 URL 末尾标点与不成对闭括号。
 * @param {string} raw 原始匹配串
 * @returns {string} 修剪后的 URL
 */
export function trimUrl(raw) {
	let url = raw
	for (;;) {
		const next = url.replace(TRAIL_PUNCT_RE, '')
		if (next === url) break
		url = next
	}
	while (/[)\]}>]$/.test(url)) {
		const end = url.slice(-1)
		const open = { ')': '(', ']': '[', '}': '{', '>': '<' }[end]
		if (open && url.includes(open)) break
		url = url.slice(0, -1)
	}
	return url
}

/**
 * 同步快路径：pathname 带图片后缀则可直接内联（无后缀由 fetchMeta HEAD 判定）。
 * @param {string} url 待检测 URL
 * @returns {boolean} 是否为图片 URL
 */
export function isImageUrl(url) {
	try {
		const parsed = new URL(url)
		// github.com/blob 是 HTML 页，不是图片字节；raw / user-images 等仍可内联
		if (GH_HOST_RE.test(parsed.hostname)) return false
		return IMG_EXT_RE.test(parsed.pathname)
	} catch {
		return IMG_EXT_RE.test(url)
	}
}

/**
 * 判断链接是否为跨站 http(s) 外链。
 * @param {string} href 链接地址
 * @returns {boolean} 是否为外站 http(s) 链接
 */
export function isExternalHttp(href) {
	try {
		const parsed = new URL(href, location.href)
		return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.origin !== location.origin
	} catch {
		return false
	}
}

/**
 * 将相对或绝对链接解析为完整 URL。
 * @param {string} href 链接地址
 * @returns {string} 绝对 URL
 */
export function absUrl(href) {
	try {
		return new URL(href, location.href).href
	} catch {
		return href
	}
}

/**
 * 生成 Google favicon 服务地址。
 * @param {string} url 目标页面 URL
 * @returns {string} favicon 图片 URL
 */
export function faviconUrl(url) {
	return `https://www.google.com/s2/favicons?sz=32&domain_url=${encodeURIComponent(url)}`
}

/**
 * 解码 HTML 实体。
 * @param {string} text 含实体的字符串
 * @returns {string} 解码后的文本
 */
export function decodeHtml(text) {
	const textarea = document.createElement('textarea')
	textarea.innerHTML = text
	return textarea.value
}

/**
 * 创建带类名与文本的 DOM 元素。
 * @param {string} tag 标签名
 * @param {string} [className] CSS 类名
 * @param {string} [text] 文本内容
 * @returns {HTMLElement} 新元素
 */
export function elem(tag, className, text) {
	const node = document.createElement(tag)
	if (className) node.className = className
	if (text != null) node.textContent = text
	return node
}

/**
 * 将大数字格式化为 k/m 缩写。
 * @param {number} count 原始数值
 * @returns {string} 格式化后的字符串
 */
export function fmtCount(count) {
	const value = Number(count) || 0
	if (value >= 1e6) return `${(value / 1e6).toFixed(value >= 1e7 ? 0 : 1)}m`
	if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`
	return String(value)
}

/**
 * 截断长文本并追加省略号。
 * @param {string} text 原始文本
 * @param {number} [max=220] 最大长度
 * @returns {string} 摘要文本
 */
export function snippetText(text, max = 220) {
	const trimmed = String(text || '').replace(/\r\n/g, '\n').trim()
	if (!trimmed) return ''
	return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed
}
