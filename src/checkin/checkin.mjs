let clicked = false

/**
 * 主页侧栏「每日签到」未完成时点一次签到按钮。
 * @returns {void}
 */
export function autoCheckin() {
	if (clicked) return
	const button = document.querySelector('.daily-checkin-card .daily-checkin-action button')
	if (!button) return
	clicked = true
	button.click()
}
