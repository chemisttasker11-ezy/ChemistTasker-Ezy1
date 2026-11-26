// The shared-core dist is bundler output (extensionless imports, plain JSON imports). Import this module first, then
// load the code under test with a dynamic import, to run it under plain node.
import fs from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

const fromSharedCore = url => /\/shared-core\/(?:dist\/|[^/]+\.json$)/.test(url ?? '');

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (fromSharedCore(context.parentURL) && specifier.startsWith('.') && !/\.(?:js|json)$/.test(specifier)) {
      const file = new URL(`${specifier}.js`, context.parentURL);
      return nextResolve(fs.existsSync(file) ? `${specifier}.js` : `${specifier}/index.js`, context);
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (!fromSharedCore(url)) return nextLoad(url, context);
    const source = fs.readFileSync(fileURLToPath(url), 'utf8');
    return { format: 'module', shortCircuit: true, source: url.endsWith('.json') ? `export default ${source}` : source };
  },
});
