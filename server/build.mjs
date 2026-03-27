import esbuild from 'esbuild'

const watch = process.argv.includes('--watch')

const options = {
  entryPoints: ['src-js/peer-manager.ts', 'src-js/connect.ts'],
  outdir: 'static/js',
  bundle: false,
  target: 'es2020',
  sourcemap: false,
}

if (watch) {
  const ctx = await esbuild.context(options)
  await ctx.watch()
  console.log('Watching for changes...')
} else {
  await esbuild.build(options)
}
