import { defineConfig } from 'rollup';

function cjsImportMetaPlugin() {
  return {
    name: 'cjs-import-meta-url',
    resolveImportMeta(property, { format }) {
      if (property === 'url' && format === 'cjs') {
        return 'require("url").pathToFileURL(__filename).href';
      }
      return null;
    },
  };
}

export default defineConfig([
  {
    input: 'dist/index.node.js',
    output: {
      file: 'dist/index.node.js',
      format: 'es',
      sourcemap: true,
    },
    external: ['fs', 'path', 'url', 'module'],
  },
  {
    input: 'dist/index.browser.js',
    output: {
      file: 'dist/index.browser.js',
      format: 'es',
      sourcemap: true,
    },
    external: ['fs', 'path', 'url', 'module'],
  },
  {
    input: 'dist/index.node.js',
    output: { file: 'dist/index.node.cjs', format: 'cjs', sourcemap: true },
    external: ['fs', 'path', 'url', 'module'],
    plugins: [cjsImportMetaPlugin()],
  },
]);
