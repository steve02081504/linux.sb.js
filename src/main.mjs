import { css as githubCss } from './github/github.mjs'
import { css as linkifyCss } from './linkify/linkify.mjs'
import { css as markdownCss } from './markdown/markdown.mjs'
import { processAll } from './post/post.mjs'
import { installSubmit } from './submit/submit.mjs'
import { applyTheme, css as themeCss, installTheme } from './theme/theme.mjs'
import { css as tipCss, initTip } from './tip/tip.mjs'

applyTheme()

const style = document.createElement('style')
style.textContent = [themeCss, markdownCss, linkifyCss, tipCss, githubCss].join('\n')
document.documentElement.appendChild(style)

/**
 * DOM 就绪后挂交互与帖文处理。
 * @returns {void}
 */
function boot() {
	installTheme()
	initTip()
	installSubmit()
	processAll()
	new MutationObserver(mutations => {
		for (const mutation of mutations)
			for (const node of mutation.addedNodes) {
				if (node.nodeType !== 1) continue
				processAll(node)
			}

	}).observe(document.documentElement, { childList: true, subtree: true })
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot)
else boot()
