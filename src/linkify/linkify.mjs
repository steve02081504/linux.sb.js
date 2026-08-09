import { SKIP_LINKIFY, URL_RE } from '../constants.mjs'
import { classifyGithub, mountGithubCard } from '../github/github.mjs'
import { fetchMeta } from '../net.mjs'
import { faviconUrl, isExternalHttp, isImageUrl, trimUrl } from '../util.mjs'

import css from './linkify.css'

/**
 *
 */
export { css }

/**
 * @param {string} url 目标 URL
 * @returns {HTMLImageElement} favicon 节点
 */
function makeFavicon(url) {
	const icon = document.createElement('img')
	icon.className = 'lsb-favicon'
	icon.alt = ''
	icon.loading = 'lazy'
	icon.referrerPolicy = 'no-referrer'
	icon.src = faviconUrl(url)
	return icon
}

/**
 * @param {string} url 图片地址
 * @param {string} alt 替代文本
 * @param {() => void} onError 加载失败回调
 * @returns {HTMLImageElement} 内联图
 */
function makeInlineImage(url, alt, onError) {
	const image = document.createElement('img')
	image.className = 'lsb-inline-img'
	image.src = url
	image.alt = alt
	image.loading = 'lazy'
	image.referrerPolicy = 'no-referrer'
	image.onerror = onError
	return image
}

/**
 * @param {string} url 图片地址
 * @returns {HTMLAnchorElement} 包裹图片的链接
 */
function buildImage(url) {
	const anchor = document.createElement('a')
	anchor.className = 'lsb-url'
	anchor.href = url
	anchor.target = '_blank'
	anchor.rel = 'noopener noreferrer'
	anchor.dataset.lsb = '1'
	anchor.appendChild(makeInlineImage(url, url, () => {
		anchor.textContent = url
		anchor.classList.add('lsb-url')
	}))
	return anchor
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
	fetchMeta(url).then(meta => {
		if (meta.image) {
			const root = anchor.closest('.lsb-link') || anchor
			root.replaceWith(buildImage(url))
			return
		}
		if (meta.icon) icon.src = meta.icon
		if (meta.title) {
			titleEl.textContent = meta.title
			anchor.title = `${meta.title}\n${url}`
		}
	})
}

/**
 * 为外链锚点套 favicon 包装，并挂 GitHub 卡或拉标题。
 * @param {HTMLAnchorElement} anchor 已配置的外链
 * @param {string} url 目标 URL
 * @param {string} titleText 标题初始文案
 * @returns {HTMLElement} 最终根节点（普通包装或 `.lsb-gh`）
 */
function mountExternalChrome(anchor, url, titleText) {
	const title = document.createElement('span')
	title.className = 'lsb-title'
	title.textContent = titleText
	anchor.replaceChildren(title)

	const wrap = document.createElement('span')
	wrap.className = 'lsb-link'
	wrap.dataset.lsb = '1'
	const icon = makeFavicon(url)

	if (anchor.parentNode) {
		anchor.parentNode.insertBefore(wrap, anchor)
		wrap.append(icon, anchor)
	} else
		wrap.append(icon, anchor)


	const github = classifyGithub(url)
	if (github) {
		const host = document.createElement('span')
		host.className = 'lsb-gh'
		host.dataset.lsb = '1'
		if (wrap.parentNode) {
			wrap.parentNode.insertBefore(host, wrap)
			host.append(wrap)
		} else
			host.append(wrap)

		mountGithubCard(host, title, github)
		return host
	}

	enhanceLinkMeta(anchor, title, icon, url)
	return wrap
}

/**
 * @param {string} url 目标 URL
 * @returns {HTMLElement} 增强链接根节点
 */
function buildLink(url) {
	const anchor = document.createElement('a')
	anchor.className = 'lsb-url'
	anchor.href = url
	anchor.target = '_blank'
	anchor.rel = 'noopener noreferrer'
	anchor.dataset.lsb = '1'
	return mountExternalChrome(anchor, url, url)
}

/**
 * @param {Text} node 文本节点
 * @returns {void}
 */
function linkifyTextNode(node) {
	const text = node.nodeValue
	URL_RE.lastIndex = 0
	if (!URL_RE.test(text)) return
	URL_RE.lastIndex = 0

	const fragment = document.createDocumentFragment()
	let last = 0
	let match
	while (match = URL_RE.exec(text)) {
		const url = trimUrl(match[0])
		const start = match.index
		const end = start + url.length
		if (start > last) fragment.appendChild(document.createTextNode(text.slice(last, start)))
		fragment.appendChild(isImageUrl(url) ? buildImage(url) : buildLink(url))
		last = end
		URL_RE.lastIndex = end
	}
	if (last < text.length) fragment.appendChild(document.createTextNode(text.slice(last)))
	node.parentNode.replaceChild(fragment, node)
}

/**
 * 增强帖内已有的外链锚点。
 * @param {HTMLAnchorElement} anchor 链接元素
 * @returns {void}
 */
export function enhanceExistingAnchor(anchor) {
	if (anchor.dataset.lsb || anchor.closest('[data-lsb="1"]')) return
	const href = anchor.href
	if (!isExternalHttp(href)) return

	anchor.dataset.lsb = '1'
	anchor.classList.add('lsb-url')
	anchor.target ||= '_blank'
	anchor.rel = 'noopener noreferrer'

	if (isImageUrl(href)) {
		anchor.replaceChildren(makeInlineImage(href, anchor.textContent.trim() || href, function () {
			this.remove()
		}))
		return
	}

	mountExternalChrome(anchor, href, anchor.textContent.trim() || href)
}

/**
 * 遍历根节点下可 linkify 的文本节点。
 * @param {Node} root 遍历起点
 * @returns {void}
 */
export function walkLinkify(root) {
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
		/**
		 * @param {Node} node 候选文本节点
		 * @returns {number} NodeFilter 常量
		 */
		acceptNode(node) {
			const parent = node.parentElement
			if (!parent || SKIP_LINKIFY.has(parent.tagName)) return NodeFilter.FILTER_REJECT
			if (parent.closest('a, code, pre, [data-lsb]')) return NodeFilter.FILTER_REJECT
			return NodeFilter.FILTER_ACCEPT
		},
	})
	const nodes = []
	for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node)
	for (const node of nodes) linkifyTextNode(node)
}
