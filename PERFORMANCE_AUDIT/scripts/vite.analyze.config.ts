// Same build as vite.config.ts plus a report of what every chunk is made of (rendered bytes per
// module), written to PERFORMANCE_AUDIT/data/chunks-<label>.json. Output goes to a scratch folder.
//
//   ANALYZE_LABEL=before npx vite build --config PERFORMANCE_AUDIT/scripts/vite.analyze.config.ts --outDir .perf-dist --emptyOutDir
import fs from 'node:fs';
import base from '../../vite.config';
import type { ConfigEnv, Plugin, UserConfig } from 'vite';

const report: Plugin = {
  name: 'chunk-report',
  generateBundle(_options, bundle) {
    const chunks = Object.values(bundle)
      .filter((c): c is Extract<typeof c, { type: 'chunk' }> => c.type === 'chunk')
      .map((c) => ({
        file: c.fileName,
        isEntry: c.isEntry,
        imports: c.imports,
        size: c.code.length,
        modules: Object.entries(c.modules)
          .map(([id, m]) => ({ id: id.replace(/\\/g, '/').replace(/^.*?(node_modules|src|server)\//, '$1/'), bytes: m.renderedLength }))
          .sort((a, b) => b.bytes - a.bytes)
          .slice(0, 40),
      }))
      .sort((a, b) => b.size - a.size);
    fs.mkdirSync('PERFORMANCE_AUDIT/data', { recursive: true });
    fs.writeFileSync(`PERFORMANCE_AUDIT/data/chunks-${process.env.ANALYZE_LABEL || 'run'}.json`, JSON.stringify(chunks, null, 1));
  },
};

export default async (env: ConfigEnv): Promise<UserConfig> => {
  const config = (typeof base === 'function' ? await base(env) : base) as UserConfig;
  return { ...config, plugins: [...(config.plugins ?? []), report] };
};
