/* global GM_xmlhttpRequest */

import { faviconUrl, decodeHtml } from './util.mjs'

const metaCache = new Map()
const pageCache = new Map()
const ghCache = new Map()

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
			timeout: 15000,
			/**
			 * @param {GMXMLHttpRequestResponse} res GM 响应对象
			 * @returns {void}
			 */
			onload: res => {
				if (res.status >= 200 && res.status < 400) resolve(res)
				else reject(new Error(String(res.status)))
			},
			/**
			 * @returns {void}
			 */
			onerror: () => reject(new Error('network')),
			/**
			 * @returns {void}
			 */
			ontimeout: () => reject(new Error('timeout')),
		})
	})
}

/**
 * 从 GM 响应头取出 Content-Type（小写，无参数）。
 * @param {GMXMLHttpRequestResponse} res GM 响应
 * @returns {string} MIME 类型，缺省为空串
 */
function contentType(res) {
	const match = String(res.responseHeaders || '').match(/^content-type:\s*([^\n;]+)/im)
	return match?.[1].trim().toLowerCase() || ''
}

/**
 * 通过 GM_xmlhttpRequest 发起 GET 请求。
 * @param {string} url 请求地址
 * @param {Record<string, string>} [headers] 请求头
 * @returns {Promise<string>} 响应正文
 */
export function gmGet(url, headers) {
	return gmRequest('GET', url, headers).then(res => res.responseText)
}

/**
 * 同源 fetch 页面 HTML，带内存缓存。
 * @param {string} url 站内 URL
 * @returns {Promise<string>} 页面 HTML
 */
export function siteGet(url) {
	if (pageCache.has(url)) return pageCache.get(url)
	const task = fetch(url, { credentials: 'same-origin', headers: { Accept: 'text/html' } })
		.then(res => {
			if (!res.ok) throw new Error(String(res.status))
			return res.text()
		})
	pageCache.set(url, task)
	return task
}

/**
 * 请求 GitHub REST API 并解析 JSON，带缓存。
 * @param {string} url API 地址
 * @returns {Promise<object>} 解析后的 JSON
 */
export function ghApi(url) {
	if (ghCache.has(url)) return ghCache.get(url)
	const task = gmGet(url, {
		Accept: 'application/vnd.github+json',
		'X-GitHub-Api-Version': '2022-11-28',
		'User-Agent': 'linux.sb-helpers',
	}).then(JSON.parse)
	ghCache.set(url, task)
	return task
}

/**
 * 拉取 GitHub raw 文件内容，带缓存。
 * @param {string} url raw 地址
 * @returns {Promise<string>} 文件正文
 */
export function ghRaw(url) {
	if (ghCache.has(url)) return ghCache.get(url)
	const task = gmGet(url)
	ghCache.set(url, task)
	return task
}

/**
 * 从 HTML 中提取页面标题。
 * @param {string} html 页面 HTML
 * @returns {string} 标题文本
 */
export function parseTitle(html) {
	const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
		|| html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)
	if (og?.[1]) return decodeHtml(og[1]).trim()
	const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)
	return title ? decodeHtml(title[1]).trim() : ''
}

/**
 * 探测外链：先 HEAD 看 Content-Type，图片则短路；否则再 GET 刮标题。
 * @param {string} url 目标 URL
 * @returns {Promise<{image: boolean, title: string, icon: string}>} 元数据
 */
export async function fetchMeta(url) {
	if (metaCache.has(url)) return metaCache.get(url)
	const empty = { image: false, title: '', icon: faviconUrl(url) }
	const task = (async () => {
		try {
			const head = await gmRequest('HEAD', url)
			if (contentType(head).startsWith('image/'))
				return { image: true, title: '', icon: faviconUrl(url) }
		} catch { /* HEAD 失败则改走 GET */ }

		const res = await gmRequest('GET', url)
		if (contentType(res).startsWith('image/'))
			return { image: true, title: '', icon: faviconUrl(url) }
		return { image: false, title: parseTitle(res.responseText), icon: faviconUrl(url) }
	})().catch(() => empty)
	metaCache.set(url, task)
	return task
}
