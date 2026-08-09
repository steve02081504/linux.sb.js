import { writeFileSync } from 'node:fs'

import * as esbuild from 'esbuild'

import { meta } from './src/meta.mjs'

/**
 * 为 JSDoc 与 eslint global 指令注入 @preserve，esbuild 才会保留进产物。
 * 普通块注释会被丢掉；`/*!` 虽能保留但 ESLint 不认以 `!` 开头的 global。
 */
const preserveComments = {
	name: 'preserve-comments',
	/**
	 * 注册 onLoad，在打包前改写源码注释。
	 * @param {import('esbuild').PluginBuild} build esbuild 构建上下文
	 * @returns {void} 无返回值
	 */
	setup(build) {
		build.onLoad({ filter: /\.mjs$/ }, async (args) => {
			const { readFile } = await import('node:fs/promises')
			let contents = await readFile(args.path, 'utf8')
			contents = contents
				.replace(/\/\*\s*(global\b[^*]*?)\*\//g, '/** @preserve __LSB_GLOBAL__$1*/')
				.replace(/\/\*\*(?!\s*@preserve)/g, '/** @preserve')
			return { contents, loader: 'js' }
		})
	},
}

const result = await esbuild.build({
	entryPoints: ['src/main.mjs'],
	bundle: true,
	format: 'iife',
	write: false,
	loader: { '.css': 'text' },
	target: ['es2020'],
	legalComments: 'inline',
	plugins: [preserveComments],
})

// esbuild 默认 2 空格；产物统一成 tab；还原打包用的 @preserve / global 标记
const js = result.outputFiles[0].text
	.replace(/^( {2})+/gm, m => '\t'.repeat(m.length / 2))
	.replace(/\/\*\* @preserve __LSB_GLOBAL__/g, '/* ')
	.replace(/\/\*\* @preserve/g, '/**')
writeFileSync('linux.sb.user.js', `${meta}\n${js}`)
console.log('wrote linux.sb.user.js')
