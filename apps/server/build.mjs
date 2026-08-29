import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  sourcemap: true,
  packages: 'external',
  loader: { '.json': 'json' },
  alias: {
    '@te/shared': `${root}packages/shared/src/index.ts`,
    '@te/config': `${root}packages/config/src/index.ts`,
    '@te/game-engine': `${root}packages/game-engine/src/index.ts`,
  },
  banner: {
    js: "import{createRequire as __cr}from'node:module';const require=__cr(import.meta.url);",
  },
});

console.log('server bundled to dist/index.js');
