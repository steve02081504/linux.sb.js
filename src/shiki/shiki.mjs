const SHIKI_URL = 'https://esm.sh/shiki@3'

/** @type {Promise<Function> | null} */
let codeToHtmlCache = null

/**
 * 按站点 `--bg` 亮度判断背景是否偏暗。
 * @returns {boolean} 是否深色
 */
export function siteIsDark() {
	const raw = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
	const match = raw.match(/^#([\da-f]{3}|[\da-f]{6})$/i)
	if (!match) return false
	let hex = match[1]
	if (hex.length === 3) hex = [...hex].map(c => c + c).join('')
	/**
	 * @param {number} index hex 字符串起始下标
	 * @returns {number} 0–1 归一化通道值
	 */
	const channel = index => parseInt(hex.slice(index, index + 2), 16) / 255
	return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4) < 0.45
}

/**
 * 懒加载 Shiki `codeToHtml`（全页共享一次）。
 * @returns {Promise<Function>} codeToHtml
 */
export function loadCodeToHtml() {
	if (!codeToHtmlCache) {
		codeToHtmlCache = import(SHIKI_URL).then(m => m.codeToHtml)
		codeToHtmlCache.catch(() => {
			codeToHtmlCache = null
		})
	}
	return codeToHtmlCache
}

/**
 * 用站点明暗主题高亮代码；未知语言回退纯文本。
 * @param {string} text 源码
 * @param {string} [lang='text'] Shiki 语言 id / 别名
 * @returns {Promise<string>} Shiki HTML
 */
export async function highlightCode(text, lang = 'text') {
	const codeToHtml = await loadCodeToHtml()
	const theme = siteIsDark() ? 'github-dark' : 'github-light'
	try {
		return await codeToHtml(text, { lang, theme })
	} catch {
		return await codeToHtml(text, { lang: 'text', theme })
	}
}

/**
 * 从文件路径猜 Shiki 语言（扩展名多为别名，如 `ps1` → powershell）。
 * @param {string} path 仓库内路径
 * @returns {string} 语言 id
 */
export function langFromPath(path) {
	const base = (path.split('/').pop() || '').toLowerCase()
	if (base === 'dockerfile') return 'dockerfile'
	if (base === 'makefile' || base === 'gnumakefile') return 'makefile'
	const dot = base.lastIndexOf('.')
	return dot < 0 ? 'text' : base.slice(dot + 1) || 'text'
}
