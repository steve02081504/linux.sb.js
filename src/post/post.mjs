import { enhanceExistingAnchor, walkLinkify } from '../linkify/linkify.mjs'
import { renderMarkdown } from '../markdown/markdown.mjs'
import { bindInternalTip } from '../tip/tip.mjs'
import { isExternalHttp } from '../util.mjs'

/**
 * 对单个帖文：Markdown → linkify → 站内悬浮。
 * @param {Element} post `.post-content`
 * @returns {Promise<void>}
 */
async function processPost(post) {
	try {
		await renderMarkdown(post)
	} catch {
		// CDN 失败则保持纯文本，继续 linkify
	}
	walkLinkify(post)
	for (const anchor of post.querySelectorAll('a[href]'))
		if (isExternalHttp(anchor.href)) enhanceExistingAnchor(anchor)
		else bindInternalTip(anchor)

}

/**
 * 处理页面或子树内所有帖文与作者链接。
 * @param {ParentNode} [root=document] 处理起点
 * @returns {void}
 */
export function processAll(root = document) {
	const posts = [...root.querySelectorAll('.post-content')]
	if (root.nodeType === 1 && root.matches('.post-content')) posts.push(root)
	for (const post of posts) processPost(post)

	const authors = [...root.querySelectorAll('.post-author[href]')]
	if (root.nodeType === 1 && root.matches('.post-author[href]')) authors.push(root)
	for (const author of authors) bindInternalTip(author)
}
