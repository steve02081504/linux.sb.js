import { siteGet } from '../net.mjs'
import { absUrl, elem } from '../util.mjs'

import css from './tip.css'

/**
 *
 */
export { css }

let tip
let showTimer = 0
let hideTimer = 0
let tipToken = 0

/**
 * @param {string} html 页面 HTML
 * @returns {Document} 解析后的文档
 */
function parseDoc(html) {
	return new DOMParser().parseFromString(html, 'text/html')
}

/**
 * @param {Document} doc 解析后的文档
 * @returns {{kind: 'user', name: string, rank: string, avatar: string} | null} 用户卡数据
 */
function parseUserCard(doc) {
	const card = doc.querySelector('.user-card')
	if (!card) return null
	const avatar = card.querySelector('.avatar-img')?.getAttribute('src')
	return {
		kind: 'user',
		name: card.querySelector('.user-name')?.textContent?.trim() || '',
		rank: card.querySelector('.user-rank')?.textContent?.trim() || '',
		avatar: avatar ? absUrl(avatar) : '',
	}
}

/**
 * 从文档与楼层节点拼主题卡。
 * @param {Document | DocumentFragment | Element} root 标题/统计所在根
 * @param {Element | null | undefined} post 楼层节点
 * @param {string | number} [floor] 楼层号
 * @returns {{kind: 'topic', title: string, stats: string[], floor: string | number, author: string, rank: string, avatar: string, snippet: string}} 主题卡数据
 */
function topicCardFrom(root, post, floor) {
	const title = root.querySelector('.post-content-title')?.textContent?.trim()
		|| root.querySelector('h1')?.textContent?.trim()
		|| ''
	const stats = [...root.querySelectorAll('.post-content-stats span')]
		.map(span => span.textContent.replace(/\s+/g, ' ').trim())
		.filter(Boolean)
	const avatar = post?.querySelector('.avatar-img')?.getAttribute('src')
	return {
		kind: 'topic',
		title,
		stats,
		floor: floor || '',
		author: post?.querySelector('.post-author')?.textContent?.trim() || '',
		rank: post?.querySelector('.post-user-group')?.textContent?.trim() || '',
		avatar: avatar ? absUrl(avatar) : '',
		snippet: post?.querySelector('.post-content')?.textContent?.replace(/\s+/g, ' ').trim() || '',
	}
}

/**
 * @param {Document} doc 解析后的文档
 * @param {string | number} [floor] 楼层号
 * @returns {ReturnType<typeof topicCardFrom>} 主题卡数据
 */
function parseTopicCard(doc, floor) {
	const post = floor
		? doc.querySelector(`.post-item[data-floor="${CSS.escape(String(floor))}"]`)
		: doc.querySelector('.topic-post-list .post-item, .post-list .post-item')
	return topicCardFrom(doc, post, floor)
}

/**
 * 同页楼层优先读 DOM。
 * @param {string} topicId 主题 ID
 * @param {string | number} floor 楼层号
 * @returns {ReturnType<typeof topicCardFrom> | null} 同页楼层主题卡，无则 null
 */
function localFloorCard(topicId, floor) {
	if (!floor || !location.pathname.startsWith(`/topic/${topicId}`)) return null
	const post = document.querySelector(`.post-item[data-floor="${CSS.escape(String(floor))}"]`)
	if (!post) return null
	return topicCardFrom(document, post, String(floor))
}

/**
 * @param {string} href 链接地址
 * @returns {{kind: 'user', url: string} | {kind: 'topic', url: string, tid: string, floor: string} | null} 站内链接分类
 */
export function classifyInternal(href) {
	let parsed
	try {
		parsed = new URL(href, location.href)
	} catch {
		return null
	}
	if (parsed.origin !== location.origin) return null
	if (parsed.pathname === '/user' && parsed.searchParams.has('username'))
		return { kind: 'user', url: parsed.href }

	if (/^\/user\/\d+\/?$/.test(parsed.pathname))
		return { kind: 'user', url: parsed.href }

	const topic = parsed.pathname.match(/^\/topic\/(\d+)\/?$/)
	if (topic)
		return {
			kind: 'topic',
			url: parsed.href,
			tid: topic[1],
			floor: parsed.searchParams.get('floor') || '',
		}

	return null
}

/**
 * @param {object | null} data 用户或主题卡数据
 * @returns {void}
 */
function renderTip(data) {
	tip.replaceChildren()
	if (!data) {
		tip.append(elem('div', 'lsb-tip-loading', '加载失败'))
		return
	}
	if (data.kind === 'user') {
		const row = elem('div', 'lsb-tip-user')
		if (data.avatar) {
			const image = elem('img', 'lsb-tip-avatar')
			image.src = data.avatar
			image.alt = ''
			image.referrerPolicy = 'no-referrer'
			row.append(image)
		}
		const meta = elem('div')
		meta.append(elem('div', 'lsb-tip-name', data.name || '用户'))
		if (data.rank) meta.append(elem('div', 'lsb-tip-sub', data.rank))
		row.append(meta)
		tip.append(row)
		return
	}

	const box = elem('div')
	box.append(elem('div', 'lsb-tip-name', data.title || '主题'))
	if (data.stats?.length) box.append(elem('div', 'lsb-tip-sub', data.stats.join(' · ')))
	if (data.floor) box.append(elem('div', 'lsb-tip-badge', `#${data.floor}`))
	if (data.author || data.snippet || data.avatar) {
		const row = elem('div', 'lsb-tip-row')
		if (data.avatar) {
			const image = elem('img', 'lsb-tip-avatar')
			image.src = data.avatar
			image.alt = ''
			image.referrerPolicy = 'no-referrer'
			row.append(image)
		}
		const meta = elem('div')
		if (data.author)
			meta.append(elem('div', 'lsb-tip-sub', data.rank ? `${data.author} · ${data.rank}` : data.author))

		if (data.snippet) meta.append(elem('div', 'lsb-tip-snippet', data.snippet))
		row.append(meta)
		box.append(row)
	}
	tip.append(box)
}

/**
 * @param {Element} anchor 触发链接
 * @returns {void}
 */
function placeTip(anchor) {
	tip.hidden = false
	const rect = anchor.getBoundingClientRect()
	const pad = 8
	const tipWidth = tip.offsetWidth
	const tipHeight = tip.offsetHeight
	const left = Math.min(Math.max(pad, rect.left), innerWidth - tipWidth - pad)
	let top = rect.bottom + pad
	if (top + tipHeight > innerHeight - pad) top = Math.max(pad, rect.top - tipHeight - pad)
	tip.style.left = `${left}px`
	tip.style.top = `${top}px`
}

/**
 * @returns {void}
 */
function scheduleHide() {
	clearTimeout(hideTimer)
	hideTimer = setTimeout(() => {
		tip.hidden = true
		tip.replaceChildren()
		tipToken++
	}, 160)
}

/**
 * @param {{kind: 'user', url: string} | {kind: 'topic', url: string, tid: string, floor: string}} info 站内链接信息
 * @returns {Promise<object | null>} 悬浮卡数据
 */
async function loadInternalCard(info) {
	if (info.kind === 'user') return parseUserCard(parseDoc(await siteGet(info.url)))
	const local = localFloorCard(info.tid, info.floor)
	if (local) return local
	return parseTopicCard(parseDoc(await siteGet(info.url)), info.floor)
}

/**
 * @param {Element} anchor 触发链接
 * @param {{kind: 'user', url: string} | {kind: 'topic', url: string, tid: string, floor: string}} info 站内链接信息
 * @returns {void}
 */
function showTip(anchor, info) {
	const token = ++tipToken
	tip.classList.add('lsb-tip-loading')
	tip.replaceChildren(elem('div', null, '加载中…'))
	placeTip(anchor)
	loadInternalCard(info).then(data => {
		if (token !== tipToken) return
		tip.classList.remove('lsb-tip-loading')
		renderTip(data)
		placeTip(anchor)
	}).catch(() => {
		if (token !== tipToken) return
		tip.classList.remove('lsb-tip-loading')
		renderTip(null)
		placeTip(anchor)
	})
}

/**
 * @returns {void}
 */
export function initTip() {
	tip = document.createElement('div')
	tip.className = 'lsb-tip'
	tip.hidden = true
	document.documentElement.appendChild(tip)
	tip.addEventListener('mouseenter', () => clearTimeout(hideTimer))
	tip.addEventListener('mouseleave', scheduleHide)
}

/**
 * @param {HTMLAnchorElement} anchor 链接元素
 * @returns {void}
 */
export function bindInternalTip(anchor) {
	if (anchor.dataset.lsbTip) return
	const info = classifyInternal(anchor.href)
	if (!info) return
	anchor.dataset.lsbTip = '1'
	anchor.addEventListener('mouseenter', () => {
		clearTimeout(hideTimer)
		clearTimeout(showTimer)
		showTimer = setTimeout(() => showTip(anchor, info), 220)
	})
	anchor.addEventListener('mouseleave', () => {
		clearTimeout(showTimer)
		scheduleHide()
	})
}
