import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

/** @type {esbuild.BuildOptions} */
const extensionConfig = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  outfile: 'dist/extension.js',
  // Don't bundle node_modules. VS Code extensions ship node_modules alongside the bundle,
  // and bundling native deps (.node) breaks in esbuild without custom loaders.
  packages: 'external',
  external: ['vscode'],
  sourcemap: true,
  logLevel: 'info'
};

/** @type {esbuild.BuildOptions} */
const webviewConfig = {
  entryPoints: ['src/webview/main.ts'],
  bundle: true,
  platform: 'browser',
  target: 'es2020',
  format: 'iife',
  outfile: 'media/main.js',
  sourcemap: true,
  logLevel: 'info'
};

if (watch) {
  const ctx1 = await esbuild.context(extensionConfig);
  const ctx2 = await esbuild.context(webviewConfig);
  await Promise.all([ctx1.watch(), ctx2.watch()]);
  console.log('[SpaceCode] esbuild watching...');
} else {
  await esbuild.build(extensionConfig);
  await esbuild.build(webviewConfig);
}
