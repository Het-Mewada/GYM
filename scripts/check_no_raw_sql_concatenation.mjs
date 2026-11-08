import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const DIRS_TO_SCAN = ['apps', 'packages'];
const EXTENSIONS = ['.ts', '.js', '.mjs'];

// Disallowed patterns:
// 1. .query(`...${...}`) - template string interpolation inside queries
// 2. .query("..." + ...) or .query('...' + ...) - string concatenation inside queries
const INTERPOLATED_QUERY_REGEX = /\.(query|execute)\s*\(\s*`[^`]*\$\{/g;
const CONCATENATED_QUERY_REGEX = /\.(query|execute)\s*\(\s*["'][^"']*["']\s*\+/g;

let violationsCount = 0;

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    // Ignore comments
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
      return;
    }

    if (INTERPOLATED_QUERY_REGEX.test(line)) {
      console.error(
        `\x1b[31mSECURITY VIOLATION\x1b[0m [SQL Injection Risk]: String template interpolation detected in database query call!\n` +
        `  File: ${path.relative(projectRoot, filePath)}:${index + 1}\n` +
        `  Line: ${trimmed}\n` +
        `  Rule: SQL queries must use bound parameter placeholders ($1, $2) or typed ORM builders, NEVER string template interpolation.\n`
      );
      violationsCount++;
    }

    if (CONCATENATED_QUERY_REGEX.test(line)) {
      console.error(
        `\x1b[31mSECURITY VIOLATION\x1b[0m [SQL Injection Risk]: String concatenation detected in database query call!\n` +
        `  File: ${path.relative(projectRoot, filePath)}:${index + 1}\n` +
        `  Line: ${trimmed}\n` +
        `  Rule: SQL queries must use bound parameter placeholders ($1, $2) or typed ORM builders, NEVER string concatenation.\n`
      );
      violationsCount++;
    }
  });
}

function traverseDirectory(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', '.turbo', '.git'].includes(entry.name)) {
        continue;
      }
      traverseDirectory(fullPath);
    } else if (entry.isFile() && EXTENSIONS.includes(path.extname(entry.name))) {
      scanFile(fullPath);
    }
  }
}

console.log('>>> [Lint/CI] Scanning codebase for prohibited string-concatenated SQL queries...');
for (const dir of DIRS_TO_SCAN) {
  const fullDir = path.join(projectRoot, dir);
  if (fs.existsSync(fullDir)) {
    traverseDirectory(fullDir);
  }
}

if (violationsCount > 0) {
  console.error(`\x1b[31mFAILED\x1b[0m: Found ${violationsCount} security violations. Build aborted.`);
  process.exit(1);
} else {
  console.log('\x1b[32mPASSED\x1b[0m: Zero string-concatenated or interpolated SQL queries found across all scanned directories.');
  process.exit(0);
}
