import { elem } from '../util.mjs'

import css from './orders.css'

/**
 *
 */
export { css }

/**
 * 将 `.virtual-card-orders` 收成 `<details>`；≥2 条时默认折叠，否则展开；URL 带 `vc_page` 时展开。
 * @param {ParentNode} [root=document] 处理起点
 * @returns {void}
 */
export function collapseOrders(root = document) {
	const boxes = [...root.querySelectorAll?.('.virtual-card-orders') || []]
	if (root.nodeType === 1 && root.matches?.('.virtual-card-orders')) boxes.push(root)

	const forceOpen = new URLSearchParams(location.search).has('vc_page')

	for (const box of boxes) {
		if (box.dataset.lsbOrders) continue
		const heading = box.querySelector(':scope > h3')
		if (!heading) continue

		box.dataset.lsbOrders = '1'
		const details = elem('details', 'lsb-orders')
		details.open = forceOpen || box.querySelectorAll(':scope > ul > li').length < 2
		details.appendChild(elem('summary', null, heading.textContent))
		heading.replaceWith(details)
		while (details.nextSibling) details.appendChild(details.nextSibling)
	}
}
