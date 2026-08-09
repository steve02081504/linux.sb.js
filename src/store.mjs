/* global GM_getValue, GM_setValue */

/**
 * 油猴长期存储（脚本级，跨页、清站点 localStorage 仍在）。
 * @param {string} key 键
 * @param {*} [fallback] 未写入时的默认值
 * @returns {*} 已存值或 fallback
 */
export function getStore(key, fallback) {
	return GM_getValue(key, fallback)
}

/**
 * @param {string} key 键
 * @param {*} value 可序列化值
 * @returns {void}
 */
export function setStore(key, value) {
	GM_setValue(key, value)
}
