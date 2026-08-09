/** 外链 URL 正则 */
export const URL_RE = /https?:\/\/[^\s<>"'`]+/gi
/** URL 末尾可剥的标点 */
export const TRAIL_PUNCT_RE = /[),.;:!?，。；：！？、》」』】）]+$/
/** 可内联图片的 pathname 后缀 */
export const IMG_EXT_RE = /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)(?:$|[?#])/i
/** 不参与 linkify 的标签 */
export const SKIP_LINKIFY = new Set(['A', 'SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE', 'SVG', 'BUTTON', 'INPUT', 'SELECT'])
/** github.com 主机名 */
export const GH_HOST_RE = /^(?:www\.)?github\.com$/i
/** 非用户/仓库路径段 */
export const GH_SKIP_OWNER = new Set([
	'settings', 'marketplace', 'orgs', 'organizations', 'login', 'join', 'features',
	'pricing', 'enterprise', 'security', 'about', 'site', 'topics', 'collections',
	'events', 'sponsors', 'customer-stories', 'readme', 'explore', 'notifications',
	'messages', 'new', 'codespaces', 'account', 'apps', 'integrations', 'copilot',
])
/** blob 无行范围时默认预览行数 */
export const FILE_PREVIEW_LINES = 40
/** 行范围预览上限 */
export const FILE_RANGE_MAX = 200
/** raw 文件截断字符数 */
export const FILE_MAX_CHARS = 120000
