import { getStore, setStore } from '../store.mjs'

import css from './theme.css'

/**
 *
 */
export { css }

const SEEN_KEY = 'themeSwitchSeen'
const THEME_SWITCH_PATH = '/theme_switch'

/**
 * 未打开过站点主题页则跳转；打开过则记入长期存储。
 * document-start 调用，避免先闪旧页。
 * @returns {boolean} 是否继续初始化（已跳转则为 false）
 */
export function syncThemeSwitch() {
	if (location.pathname === THEME_SWITCH_PATH) {
		setStore(SEEN_KEY, true)
		return true
	}
	if (getStore(SEEN_KEY, false)) return true
	location.replace(THEME_SWITCH_PATH)
	return false
}
