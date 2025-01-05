import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';

const isProd = process.env.BUILD === 'production';

export default {
  input: 'main.ts',
  output: {
    dir: '.',
    sourcemap: 'inline',
    format: 'cjs',
    exports: 'default',
    name: 'YoutubeKnowledgeGraphPlugin'
  },
  external: ['obsidian'],
  plugins: [
    typescript(),
    nodeResolve({
      browser: true,
      preferBuiltins: true
    }),
    commonjs({
      include: 'node_modules/**',
      transformMixedEsModules: true,
      ignore: ['bufferutil', 'utf-8-validate']
    }),
    json()
  ]
}