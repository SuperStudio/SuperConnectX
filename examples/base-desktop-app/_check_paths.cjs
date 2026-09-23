/**
 * _check_paths.cjs
 *
 * Static cross-check: every relative import in src/** must point to a real
 * file on disk. This runs WITHOUT npm install — it's a fast sanity check that
 * the template is internally consistent before the user runs `npm install`.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname);
const SRC = path.join(ROOT, 'src');

const CANDIDATE_EXTS = ['.ts', '.vue', '.tsx', '.js', '.mjs', '.cjs'];

function existsAsFile(absPath) {
  return fs.existsSync(absPath) && fs.statSync(absPath).isFile();
}

/**
 * Try to resolve a relative import path against common extensions and the
 * `/index.<ext>` directory convention. The `importee` may or may not have
 * an extension already.
 */
function resolveImport(importee, importerFile) {
  const importerDir = path.dirname(importerFile);
  const target = path.resolve(importerDir, importee);

  if (existsAsFile(target)) return target;

  // Try appending each known extension to the raw path (covers `from './foo'`)
  for (const ext of CANDIDATE_EXTS) {
    const withExt = target + ext;
    if (existsAsFile(withExt)) return withExt;
  }

  // Try directory + index.<ext> (covers `from './foo'`)
  for (const ext of CANDIDATE_EXTS) {
    const withIndex = path.join(target, `index${ext}`);
    if (existsAsFile(withIndex)) return withIndex;
  }

  return null;
}

const errors = [];
const filesChecked = { ts: 0, vue: 0 };

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (!/\.(ts|vue)$/.test(entry.name)) continue;
    if (entry.name.endsWith('.d.ts')) continue;
    if (/\.(test|spec)\.(ts|vue)$/.test(entry.name)) continue;

    if (entry.name.endsWith('.ts')) filesChecked.ts++;
    if (entry.name.endsWith('.vue')) filesChecked.vue++;

    const text = fs.readFileSync(full, 'utf8');
    // Match: `import ... from '...'`, `export ... from '...'`, and dynamic `import('...')`
    const reImport = /(?:import|export)\s+(?:[^'"\n]*from\s+)?(['"])([^'"]+)\1/g;
    const reDynamic = /import\s*\(\s*(['"])([^'"]+)\1\s*\)/g;
    for (const re of [reImport, reDynamic]) {
      let match;
      while ((match = re.exec(text)) !== null) {
        const importPath = match[2];
        if (!importPath.startsWith('.')) continue;
        const resolved = resolveImport(importPath, full);
        if (!resolved) errors.push({ file: full, importPath });
      }
    }
  }
}

walk(SRC);

console.log(`Checked ${filesChecked.ts} .ts and ${filesChecked.vue} .vue files.`);
if (errors.length === 0) {
  console.log('OK \u2014 all relative imports resolve to existing files.');
} else {
  console.error(`FAIL \u2014 ${errors.length} broken import(s):`);
  for (const e of errors) {
    console.error(`  ${path.relative(ROOT, e.file)} \u2192 ${e.importPath}`);
  }
  process.exit(1);
}
