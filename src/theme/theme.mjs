import { elem } from '../util.mjs'

import css from './theme.css'

/**
 *
 */
export { css }

const KEY = 'lsb-theme'

/**
 * @returns {boolean} 当前是否为深色模式
 */
export function isDark() {
	return (localStorage.getItem(KEY) ?? 'dark') === 'dark'
}

/**
 * @param {boolean} [dark=isDark()] 是否启用深色
 * @returns {void}
 */
export function applyTheme(dark = isDark()) {
	document.documentElement.classList.toggle('lsb-dark', dark)
}

/**
 * @param {HTMLButtonElement} toggleButton 切换按钮
 * @returns {void}
 */
function syncToggle(toggleButton) {
	const dark = document.documentElement.classList.contains('lsb-dark')
	toggleButton.textContent = dark ? '浅色' : '深色'
	toggleButton.title = dark ? '切换浅色模式' : '切换深色模式'
	toggleButton.setAttribute('aria-pressed', String(dark))
}

/**
 * @returns {void}
 */
export function toggleTheme() {
	const next = !document.documentElement.classList.contains('lsb-dark')
	localStorage.setItem(KEY, next ? 'dark' : 'light')
	applyTheme(next)
	const toggleButton = document.querySelector('.lsb-theme-toggle')
	if (toggleButton) syncToggle(toggleButton)
}

/**
 * 应用主题并在顶栏安装切换按钮。
 * document-start 时已调用过 applyTheme；此处再同步一次并装按钮。
 * @returns {void}
 */
export function installTheme() {
	applyTheme()
	if (document.querySelector('.lsb-theme-toggle')) return
	const bar = document.querySelector('.bar')
	if (!bar) return
	const toggleButton = elem('button', 'lsb-theme-toggle')
	toggleButton.type = 'button'
	toggleButton.addEventListener('click', toggleTheme)
	syncToggle(toggleButton)
	const search = bar.querySelector('.search-form')
	if (search) search.after(toggleButton)
	else bar.appendChild(toggleButton)
}
