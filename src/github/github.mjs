import {
	FILE_MAX_CHARS,
	FILE_PREVIEW_LINES,
	FILE_RANGE_MAX,
	GH_HOST_RE,
	GH_SKIP_OWNER,
	IMG_EXT_RE,
} from '../constants.mjs'
import { ghApi, ghRaw } from '../net.mjs'
import { langFromPath, renderShikiPre } from '../shiki/shiki.mjs'
import { elem, fmtCount, snippetText } from '../util.mjs'

import css from './github.css'

/**
 *
 */
export { css }

/**
 * 解析 GitHub blob URL 的 `#L` 行范围哈希。
 * @param {string} hash URL 哈希部分
 * @returns {{lineStart: number, lineEnd: number} | null} 行范围
 */
function parseLineHash(hash) {
	const match = String(hash || '').match(/^#L(\d+)(?:C\d+)?(?:-L(\d+)(?:C\d+)?)?/i)
	if (!match) return null
	const start = Number(match[1])
	const end = match[2] ? Number(match[2]) : start
	return {
		lineStart: Math.min(start, end),
		lineEnd: Math.max(start, end),
	}
}

/**
 * 识别 GitHub 链接类型并提取 API/raw 信息。
 * @param {string} href 链接地址
 * @returns {object | null} GitHub 链接分类结果
 */
export function classifyGithub(href) {
	let u
	try {
		u = new URL(href, location.href)
	} catch {
		return null
	}
	if (!GH_HOST_RE.test(u.hostname)) return null
	const parts = u.pathname.replace(/\/+$/, '').split('/').filter(Boolean)
	if (parts.length < 2) return null
	const [owner, repo, ...rest] = parts
	if (GH_SKIP_OWNER.has(owner.toLowerCase())) return null
	const base = `${owner}/${repo}`
	const api = `https://api.github.com/repos/${base}`

	if (!rest.length)
		return { kind: 'repo', owner, repo, api }

	if (rest[0] === 'issues' && rest[1] && /^\d+$/.test(rest[1]))
		return { kind: 'issue', owner, repo, num: rest[1], api: `${api}/issues/${rest[1]}` }

	if (rest[0] === 'pull' && rest[1] && /^\d+$/.test(rest[1]))
		return { kind: 'pull', owner, repo, num: rest[1], api: `${api}/pulls/${rest[1]}` }

	if (rest[0] === 'commit' && rest[1] && /^[0-9a-f]{7,40}$/i.test(rest[1]))
		return { kind: 'commit', owner, repo, sha: rest[1], api: `${api}/commits/${rest[1]}` }

	if (rest[0] === 'blob' && rest.length >= 3) {
		const ref = rest[1]
		const path = rest.slice(2).join('/')
		const range = parseLineHash(u.hash)
		return {
			kind: 'file',
			owner,
			repo,
			ref,
			path,
			lineStart: range?.lineStart || 0,
			lineEnd: range?.lineEnd || 0,
			raw: `https://raw.githubusercontent.com/${base}/${ref}/${path}`,
		}
	}
	return null
}

/**
 * 生成 GitHub 卡片链接行的短标签。
 * @param {object} info classifyGithub 返回值
 * @returns {string} 展示标签
 */
function ghLabel(info) {
	if (info.kind === 'repo') return `${info.owner}/${info.repo}`
	if (info.kind === 'issue' || info.kind === 'pull') return `${info.owner}/${info.repo}#${info.num}`
	if (info.kind === 'commit') return `${info.owner}/${info.repo}@${info.sha.slice(0, 7)}`
	if (info.kind === 'file') {
		const name = info.path.split('/').pop() || info.path
		if (info.lineStart) {
			const range = info.lineStart === info.lineEnd
				? `L${info.lineStart}`
				: `L${info.lineStart}-L${info.lineEnd}`
			return `${name} · ${range}`
		}
		return name
	}
	return info.owner + '/' + info.repo
}

/**
 * 提取 commit message 的主题行。
 * @param {string} message commit message
 * @returns {string} 主题行
 */
function commitSubject(message) {
	return String(message || '').replace(/\r\n/g, '\n').trim().split('\n')[0] || ''
}

/**
 * 提取 commit message 的正文摘要。
 * @param {string} message commit message
 * @returns {string} 正文摘要
 */
function commitBody(message) {
	const text = String(message || '').replace(/\r\n/g, '\n').trim()
	const newlineIndex = text.indexOf('\n')
	if (newlineIndex < 0) return ''
	return snippetText(text.slice(newlineIndex + 1).trim())
}

/**
 * 将 ISO 日期格式化为 YYYY-MM-DD。
 * @param {string} iso ISO 日期字符串
 * @returns {string} 格式化日期
 */
function fmtCommitDate(iso) {
	if (!iso) return ''
	const date = new Date(iso)
	if (Number.isNaN(date.getTime())) return ''
	const month = String(date.getMonth() + 1).padStart(2, '0')
	const day = String(date.getDate()).padStart(2, '0')
	return `${date.getFullYear()}-${month}-${day}`
}

/**
 * 拉取 GitHub 卡片展示数据。
 * @param {object} info classifyGithub 返回值
 * @returns {Promise<object | null>} 卡片数据
 */
async function loadGithubCard(info) {
	if (info.kind === 'repo') {
		const data = await ghApi(info.api)
		return {
			kind: 'repo',
			fullName: data.full_name || `${info.owner}/${info.repo}`,
			desc: data.description || '',
			stars: data.stargazers_count,
			forks: data.forks_count,
			watchers: data.subscribers_count,
			lang: data.language || '',
			topics: data.topics || [],
			license: data.license?.spdx_id || data.license?.name || '',
			title: data.full_name || `${info.owner}/${info.repo}`,
		}
	}
	if (info.kind === 'issue') {
		const data = await ghApi(info.api)
		return {
			kind: 'issue',
			title: data.title || `Issue #${info.num}`,
			state: data.state,
			comments: data.comments || 0,
			body: snippetText(data.body),
			user: data.user?.login || '',
			label: `${info.owner}/${info.repo}#${info.num}`,
		}
	}
	if (info.kind === 'pull') {
		const data = await ghApi(info.api)
		const state = data.merged_at ? 'merged' : data.draft ? 'draft' : data.state
		return {
			kind: 'pull',
			title: data.title || `PR #${info.num}`,
			state,
			comments: (data.comments || 0) + (data.review_comments || 0),
			body: snippetText(data.body),
			user: data.user?.login || '',
			label: `${info.owner}/${info.repo}#${info.num}`,
		}
	}
	if (info.kind === 'commit') {
		const data = await ghApi(info.api)
		const sha = data.sha || info.sha
		const message = data.commit?.message || ''
		const subject = commitSubject(message) || sha.slice(0, 7)
		return {
			kind: 'commit',
			title: subject,
			sha: sha.slice(0, 7),
			body: commitBody(message),
			user: data.author?.login || data.commit?.author?.name || '',
			date: fmtCommitDate(data.commit?.author?.date),
			label: `${info.owner}/${info.repo}`,
			additions: data.stats?.additions || 0,
			deletions: data.stats?.deletions || 0,
			files: data.files?.length || 0,
		}
	}
	if (info.kind === 'file') {
		if (IMG_EXT_RE.test('/' + info.path))
			return {
				kind: 'file',
				path: info.path,
				ref: info.ref,
				fullName: `${info.owner}/${info.repo}`,
				image: info.raw,
				title: ghLabel(info),
			}

		let text = await ghRaw(info.raw)
		if (text.includes('\0'))
			return {
				kind: 'file',
				path: info.path,
				ref: info.ref,
				fullName: `${info.owner}/${info.repo}`,
				binary: true,
				title: ghLabel(info),
			}

		if (text.length > FILE_MAX_CHARS) text = text.slice(0, FILE_MAX_CHARS)
		const lines = text.split(/\r?\n/)
		let start = 1
		let end = Math.min(lines.length, FILE_PREVIEW_LINES)
		let truncated = lines.length > FILE_PREVIEW_LINES
		if (info.lineStart) {
			start = Math.max(1, info.lineStart)
			const wantEnd = info.lineEnd || info.lineStart
			end = Math.min(lines.length, wantEnd)
			if (end - start + 1 > FILE_RANGE_MAX) {
				end = start + FILE_RANGE_MAX - 1
				truncated = true
			} else
				truncated = end < wantEnd

		}
		return {
			kind: 'file',
			path: info.path,
			ref: info.ref,
			fullName: `${info.owner}/${info.repo}`,
			start,
			end,
			total: lines.length,
			truncated,
			ranged: !!info.lineStart,
			lines: lines.slice(start - 1, end),
			title: ghLabel(info),
		}
	}
	return null
}

/**
 * Issue/PR 状态 → [className, label]
 */
const STATE_BADGE = {
	open: ['lsb-gh-badge lsb-gh-badge-open', 'Open'],
	closed: ['lsb-gh-badge lsb-gh-badge-closed', 'Closed'],
	merged: ['lsb-gh-badge lsb-gh-badge-merged', 'Merged'],
	draft: ['lsb-gh-badge lsb-gh-badge-draft', 'Draft'],
}

/**
 * @param {string} state 状态名
 * @returns {HTMLElement} 徽章元素
 */
function stateBadge(state) {
	const [className, label] = STATE_BADGE[state] || ['lsb-gh-badge', state || '']
	return elem('span', className, label)
}

/**
 * 将 GitHub 卡片数据渲染到容器。
 * @param {HTMLElement} card 卡片容器
 * @param {object | null} data 卡片数据
 * @returns {Promise<void>} 无返回值
 */
async function renderGithubCard(card, data) {
	card.replaceChildren()
	card.classList.remove('lsb-gh-loading')
	if (!data) {
		card.append(elem('div', 'lsb-gh-meta', '加载失败'))
		return
	}

	if (data.kind === 'repo') {
		const head = elem('div', 'lsb-gh-head')
		head.append(elem('div', 'lsb-gh-name', data.fullName))
		if (data.lang) head.append(elem('span', 'lsb-gh-badge', data.lang))
		card.append(head)
		if (data.desc) card.append(elem('div', 'lsb-gh-desc', data.desc))
		const stats = elem('div', 'lsb-gh-stats')
		stats.append(
			elem('span', null, `★ ${fmtCount(data.stars)}`),
			elem('span', null, `Fork ${fmtCount(data.forks)}`),
		)
		if (data.watchers != null) stats.append(elem('span', null, `Watch ${fmtCount(data.watchers)}`))
		if (data.license) stats.append(elem('span', null, data.license))
		card.append(stats)
		if (data.topics?.length) {
			const topics = elem('div', 'lsb-gh-topics')
			for (const t of data.topics.slice(0, 12)) topics.append(elem('span', 'lsb-gh-topic', t))
			card.append(topics)
		}
		return
	}

	if (data.kind === 'issue' || data.kind === 'pull') {
		const head = elem('div', 'lsb-gh-head')
		head.append(elem('div', 'lsb-gh-name', data.title))
		head.append(stateBadge(data.state))
		card.append(head)
		const metaBits = [data.label]
		if (data.user) metaBits.push(data.user)
		metaBits.push(`${fmtCount(data.comments)} 讨论`)
		card.append(elem('div', 'lsb-gh-meta', metaBits.join(' · ')))
		if (data.body) card.append(elem('div', 'lsb-gh-desc', data.body))
		return
	}

	if (data.kind === 'commit') {
		const head = elem('div', 'lsb-gh-head')
		head.append(elem('div', 'lsb-gh-name', data.title))
		head.append(elem('span', 'lsb-gh-badge', data.sha))
		card.append(head)
		const metaBits = [data.label]
		if (data.user) metaBits.push(data.user)
		if (data.date) metaBits.push(data.date)
		card.append(elem('div', 'lsb-gh-meta', metaBits.join(' · ')))
		if (data.body) card.append(elem('div', 'lsb-gh-desc', data.body))
		const stats = elem('div', 'lsb-gh-stats')
		stats.append(
			elem('span', 'lsb-gh-add', `+${fmtCount(data.additions)}`),
			elem('span', 'lsb-gh-del', `-${fmtCount(data.deletions)}`),
		)
		if (data.files) stats.append(elem('span', null, `${fmtCount(data.files)} files`))
		card.append(stats)
		return
	}

	if (data.kind === 'file') {
		const head = elem('div', 'lsb-gh-head')
		head.append(elem('div', 'lsb-gh-name', data.path))
		head.append(elem('span', 'lsb-gh-badge', `${data.fullName}@${data.ref}`))
		if (data.start) {
			const range = data.start === data.end ? `L${data.start}` : `L${data.start}-L${data.end}`
			head.append(elem('span', 'lsb-gh-badge', range))
		}
		card.append(head)

		if (data.image) {
			const img = elem('img', 'lsb-inline-img')
			img.src = data.image
			img.alt = data.path
			img.loading = 'lazy'
			img.referrerPolicy = 'no-referrer'
			card.append(img)
			return
		}
		if (data.binary) {
			card.append(elem('div', 'lsb-gh-more', '二进制文件，无法预览'))
			return
		}

		const pre = await renderShikiPre(data.lines.join('\n'), langFromPath(data.path), { lineStart: data.start })
		pre.classList.add('lsb-gh-code')
		card.append(pre)
		if (data.truncated) {
			const note = data.ranged
				? `已截断，共 ${data.total} 行`
				: `预览前 ${data.end} 行，共 ${data.total} 行`
			card.append(elem('div', 'lsb-gh-more', note))
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
export function mountGithubCard(host, titleEl, info) {
	const card = elem('div', 'lsb-gh-card lsb-gh-loading', '加载中…')
	host.append(card)
	titleEl.textContent = ghLabel(info)
	loadGithubCard(info).then(async data => {
		if (data?.title)
			titleEl.textContent = data.title

		await renderGithubCard(card, data)
	}).catch(() => {
		renderGithubCard(card, null)
	})
}
