import { nodeResolve } from '@rollup/plugin-node-resolve'
import terser from '@rollup/plugin-terser'
import typescript from '@rollup/plugin-typescript'
import { dts } from 'rollup-plugin-dts'

export default [
  {
    input: './src/index.ts',
    output: [
      {
        name: 'nbsPlay',
        file: './dist/index.js',
        format: 'iife',
        sourcemap: true,
      },
    ],
    plugins: [nodeResolve(), typescript({ declarationDir: './dts-tmp' }), terser()],
  },
  {
    input: './dist/dts-tmp/index.d.ts',
    output: [{ file: './dist/bundle.d.ts', format: 'es' }],
    plugins: [nodeResolve(), dts()],
  },
]
