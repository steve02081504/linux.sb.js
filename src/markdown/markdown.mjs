import css from './markdown.css'

/**
 *
 */
export { css }

const ESM = {
	unified: 'https://esm.sh/unified@11',
	remarkParse: 'https://esm.sh/remark-parse@11',
	remarkGfm: 'https://esm.sh/remark-gfm@4',
	remarkBreaks: 'https://esm.sh/remark-breaks@4',
	remarkMath: 'https://esm.sh/remark-math@6',
	remarkRehype: 'https://esm.sh/remark-rehype@11',
	rehypeStringify: 'https://esm.sh/rehype-stringify@10',
	rehypeKatex: 'https://esm.sh/rehype-katex@7',
	mermaid: 'https://esm.sh/mermaid@11',
	shiki: 'https://esm.sh/shiki@3',
	visit: 'https://esm.sh/unist-util-visit@5',
	fromHtml: 'https://esm.sh/hast-util-from-html@2',
	toString: 'https://esm.sh/hast-util-to-string@3',
}
const SANITIZE_URL = 'https://cdn.jsdelivr.net/gh/steve02081504/fount/src/public/pages/scripts/lib/sanitizeHtml.mjs'
const KATEX_CSS = 'https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.css'

const baseLoadCache = new Map()
const processorCache = new Map()

/**
 * 检测帖文是否需要数学、mermaid 或代码高亮插件。
 * @param {string} src 原始 Markdown 文本
 * @returns {{math: boolean, mermaid: boolean, code: boolean}} 特性标记
 */
function detect(src) {
	const fences = [...src.matchAll(/^```([^\n]*)/gm)].map(m => m[1].trim().split(/\s+/)[0].toLowerCase())
	return {
		math: /\$\$[\s\S]+?\$\$|(?<![\\$])\$[^$\n]+\$/.test(src),
		mermaid: fences.includes('mermaid'),
		code: fences.some(lang => lang !== 'mermaid'),
	}
}

/**
 * 将特性标记编码为处理器缓存键。
 * @param {{math: boolean, mermaid: boolean, code: boolean}} feat 特性标记
 * @returns {string} 缓存键
 */
function featKey(feat) {
	return `${feat.math ? 1 : 0}${feat.mermaid ? 1 : 0}${feat.code ? 1 : 0}`
}

/**
 * 按需注入 KaTeX 样式表。
 * @returns {void} 无返回值
 */
function ensureKatexCss() {
	if (document.getElementById('lsb-katex-css')) return
	const link = document.createElement('link')
	link.id = 'lsb-katex-css'
	link.rel = 'stylesheet'
	link.href = KATEX_CSS
	document.documentElement.appendChild(link)
}

/**
 * 读取 hast 元素的 className 列表。
 * @param {object} node hast 元素节点
 * @returns {string[]} 类名数组
 */
function classList(node) {
	const c = node.properties?.className
	if (!c) return []
	return Array.isArray(c) ? c.map(String) : String(c).split(/\s+/)
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
	return () => tree => {
		visit(tree, 'element', (node, index, parent) => {
			const tag = String(node.tagName || '').toLowerCase()
			if (BLOCKED_HTML_TAGS.has(tag)) {
				parent.children.splice(index, 1)
				return index
			}
			const props = node.properties || (node.properties = {})
			for (const key of Object.keys(props)) {
				const lower = key.toLowerCase()
				if (lower.startsWith('on')) {
					delete props[key]
					continue
				}
				if (!URL_HTML_ATTRIBUTES.has(lower)) continue
				if (lower === 'srcset') {
					delete props[key]
					continue
				}
				if (!isSafeHtmlUrl(props[key])) delete props[key]
			}
		})
	}
}

/** Mermaid 主题 CSS：用站点变量，随 `html.lsb-dark` 切换，无需重渲。 */
const MERMAID_THEME_CSS = /* css */ `
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

/* mermaid 默认给 #id .edgeLabel p 写死浅色底；html label 靠 background-color，不是 rect fill */
.edgeLabel, .edgeLabel p, .edgeLabel span, .labelBkg {
	background-color: var(--panel) !important;
	color: var(--text) !important;
}
.edgeLabel rect, .edgeLabel .label rect, .edgeLabel .label-container,
.stateLabel .box, .classLabel .box {
	fill: var(--panel) !important;
	opacity: 1 !important;
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

/** 图源 frontmatter / init 不可覆盖的 mermaid 配置键。 */
const MERMAID_SECURE_KEYS = [
	'secure',
	'securityLevel',
	'startOnLoad',
	'maxTextSize',
	'theme',
	'themeCSS',
]

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
		securityLevel: 'strict',
		theme: 'base',
		suppressErrorRendering: true,
		themeCSS: MERMAID_THEME_CSS,
		secure: MERMAID_SECURE_KEYS,
	})
	return () => async tree => {
		const targets = []
		visit(tree, 'element', (node, index, parent) => {
			if (!parent || node.tagName !== 'pre') return
			const code = node.children?.find(c => c.type === 'element' && c.tagName === 'code')
			if (!code) return
			if (!classList(code).some(c => c === 'language-mermaid' || c.endsWith('mermaid'))) return
			targets.push({ index, parent, text: toString(code) })
		})
		for (const t of [...targets].sort((a, b) => b.index - a.index))
			try {
				const id = `lsb-mmd-${Math.random().toString(36).slice(2, 10)}`
				const { svg } = await mermaid.render(id, t.text)
				const nodes = fromHtml(svg, { fragment: true }).children
				t.parent.children.splice(t.index, 1, ...nodes)
			} catch {
				t.parent.children[t.index] = {
					type: 'element',
					tagName: 'pre',
					properties: { className: ['lsb-mermaid-error'] },
					children: [{ type: 'text', value: t.text }],
				}
			}
	}
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
	return () => async tree => {
		const targets = []
		visit(tree, 'element', (node, index, parent) => {
			if (!parent || node.tagName !== 'pre') return
			const code = node.children?.find(c => c.type === 'element' && c.tagName === 'code')
			if (!code) return
			const lang = classList(code).find(c => c.startsWith('language-'))?.slice('language-'.length) || 'text'
			if (lang === 'mermaid') return
			targets.push({ index, parent, lang, text: toString(code).replace(/\n$/, '') })
		})
		for (const t of [...targets].sort((a, b) => b.index - a.index)) {
			let html
			try {
				html = await codeToHtml(t.text, { lang: t.lang, theme: 'github-dark' })
			} catch {
				html = await codeToHtml(t.text, { lang: 'text', theme: 'github-dark' })
			}
			const nodes = fromHtml(html, { fragment: true }).children
			t.parent.children.splice(t.index, 1, ...nodes)
		}
	}
}

/**
 * 懒加载 unified 基础依赖与消毒模块。
 * @returns {Promise<object>} 基础解析器组件
 */
async function loadBase() {
	if (baseLoadCache.has('v')) return baseLoadCache.get('v')
	const task = Promise.all([
		import(ESM.unified),
		import(ESM.remarkParse),
		import(ESM.remarkGfm),
		import(ESM.remarkBreaks),
		import(ESM.remarkRehype),
		import(ESM.rehypeStringify),
		import(ESM.visit),
		import(SANITIZE_URL),
	]).then(([
		{ unified },
		{ default: remarkParse },
		{ default: remarkGfm },
		{ default: remarkBreaks },
		{ default: remarkRehype },
		{ default: rehypeStringify },
		{ visit },
		sanitize,
	]) => ({ unified, remarkParse, remarkGfm, remarkBreaks, remarkRehype, rehypeStringify, visit, sanitize }))
	baseLoadCache.set('v', task)
	task.catch(() => baseLoadCache.delete('v'))
	return task
}

/**
 * 按帖文特性获取或创建 Markdown 处理器。
 * @param {{math: boolean, mermaid: boolean, code: boolean}} feat 特性标记
 * @returns {Promise<object>} unified 处理器
 */
async function getProcessor(feat) {
	const key = featKey(feat)
	if (processorCache.has(key)) return processorCache.get(key)

	const task = (async () => {
		const base = await loadBase()
		const {
			unified, remarkParse, remarkGfm, remarkBreaks, remarkRehype, rehypeStringify, visit, sanitize,
		} = base
		const { BLOCKED_HTML_TAGS, URL_HTML_ATTRIBUTES, isSafeHtmlUrl } = sanitize

		let processor = unified()
			.use(remarkParse)
			.use(remarkBreaks)
			.use(remarkGfm, { singleTilde: false })

		let katexPlugin
		if (feat.math) {
			ensureKatexCss()
			const [{ default: remarkMath }, { default: rehypeKatex }] = await Promise.all([
				import(ESM.remarkMath),
				import(ESM.rehypeKatex),
			])
			processor = processor.use(remarkMath)
			katexPlugin = rehypeKatex
		}

		processor = processor
			.use(remarkRehype, { allowDangerousHtml: false })
			.use(rehypeSanitize(BLOCKED_HTML_TAGS, URL_HTML_ATTRIBUTES, isSafeHtmlUrl, visit))

		if (katexPlugin) processor = processor.use(katexPlugin)

		if (feat.mermaid || feat.code) {
			const [{ fromHtml }, { toString }] = await Promise.all([
				import(ESM.fromHtml),
				import(ESM.toString),
			])
			if (feat.mermaid) {
				const { default: mermaid } = await import(ESM.mermaid)
				processor = processor.use(rehypeMermaid(mermaid, visit, fromHtml, toString))
			}
			if (feat.code) {
				const { codeToHtml } = await import(ESM.shiki)
				processor = processor.use(rehypeShiki(codeToHtml, visit, fromHtml, toString))
			}
		}

		return processor.use(rehypeStringify)
	})()

	processorCache.set(key, task)
	task.catch(() => processorCache.delete(key))
	return task
}

/**
 * 从帖文 DOM 还原 Markdown 源文本。
 * @param {Element} post 帖文容器
 * @returns {string} 源 Markdown
 */
function sourceFromPost(post) {
	return post.innerText.replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n').replace(/\n+$/, '')
}

/**
 * 将帖文容器渲染为 Markdown HTML。
 * @param {Element} post 帖文容器
 * @returns {Promise<void>} 无返回值
 */
export async function renderMarkdown(post) {
	if (post.dataset.lsbMd) return
	// 通知已是带 <a> 的 HTML；innerText 重渲会抹掉链接
	if (post.classList.contains('notification-content')) return
	post.dataset.lsbMd = '1'
	const src = sourceFromPost(post)
	if (!src) return

	const feat = detect(src)
	const processor = await getProcessor(feat)
	const file = await processor.process(src)
	const template = document.createElement('template')
	template.innerHTML = String(file)
	post.replaceChildren(...template.content.childNodes)
	post.classList.add('lsb-md')
}
