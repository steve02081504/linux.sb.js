/**
 * @param {Element} el 目标元素
 * @returns {{x: number, y: number}} 元素中心坐标
 */
function centerOf(el) {
	const rect = el.getBoundingClientRect()
	return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}

/**
 * @param {{x: number, y: number}} a 点 A
 * @param {{x: number, y: number}} b 点 B
 * @returns {number} 平方距离
 */
function distSq(a, b) {
	const dx = a.x - b.x
	const dy = a.y - b.y
	return dx * dx + dy * dy
}

/**
 * @param {Element} el 目标元素
 * @returns {boolean} 是否在布局中可见
 */
function visible(el) {
	return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length)
}

/**
 * @param {ParentNode} scope 搜索范围
 * @returns {HTMLElement[]} 可见的 submit 候选按钮
 */
function submitCandidates(scope) {
	return [...scope.querySelectorAll('button[type="submit"], input[type="submit"], button:not([type])')]
		.filter(el => !el.disabled && visible(el))
}

/**
 * @param {HTMLElement[]} pool 候选按钮
 * @param {Element} from 当前输入元素
 * @returns {HTMLElement | null} 距离最近的 submit
 */
function nearestInPool(pool, from) {
	if (!pool.length) return null
	const origin = centerOf(from)
	return pool.reduce((best, el) => distSq(origin, centerOf(el)) < distSq(origin, centerOf(best)) ? el : best)
}

/**
 * 找离输入框最近的 submit，优先同 form。
 * @param {Element} from 当前输入元素
 * @returns {HTMLElement | null} 距离最近的 submit
 */
function nearestSubmit(from) {
	const form = from.closest('form')
	return nearestInPool(submitCandidates(form || document), from)
		|| (form && nearestInPool(submitCandidates(document), from))
		|| null
}

/**
 * @param {EventTarget | null} el 目标元素
 * @returns {boolean} 是否为可编辑输入
 */
function isEditable(el) {
	if (!el || el.disabled || el.readOnly) return false
	const tag = el.tagName
	if (tag === 'TEXTAREA') return true
	if (tag === 'INPUT') {
		const type = (el.type || 'text').toLowerCase()
		return !['button', 'submit', 'reset', 'checkbox', 'radio', 'file', 'image', 'range', 'color', 'hidden'].includes(type)
	}
	return el.isContentEditable
}

/**
 * 绑定 Ctrl/Cmd+Enter 提交当前表单。
 * @returns {void}
 */
export function installSubmit() {
	document.addEventListener('keydown', event => {
		if (!(event.ctrlKey || event.metaKey) || event.key !== 'Enter') return
		if (event.isComposing) return
		const target = event.target
		if (!isEditable(target)) return
		const submitButton = nearestSubmit(target)
		if (!submitButton) return
		event.preventDefault()
		event.stopPropagation()
		submitButton.click()
	}, true)
}
