// Runs every test/test_*.js in its own process (each test calls process.exit),
// from the repo root so the tests' cwd-relative paths (vendor/, js/) resolve.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const repoRoot = path.resolve(dir, '..');
const files = fs.readdirSync(dir).filter(f => /^test_.*\.js$/.test(f)).sort();

let failed = 0;
for (const f of files) {
  process.stdout.write(`\n=== ${f} ===\n`);
  try {
    execFileSync(process.execPath, [path.join(dir, f)], { stdio: 'inherit', cwd: repoRoot });
  } catch (e) {
    failed++;
  }
}
console.log(`\n${files.length - failed}/${files.length} test files passed`);
process.exit(failed ? 1 : 0);
