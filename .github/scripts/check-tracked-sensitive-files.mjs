import { execFileSync } from 'node:child_process';

const trackedFiles = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split(/\r?\n/)
  .filter(Boolean);

const prohibited = [
  /(^|\/)\.env(?:$|\.)/i,
  /\.(pem|key|pfx|p12)$/i,
  /(^|\/)cookies?.*\.txt$/i,
  /\.(backup|bak|original|vps|safe-backup)(?:$|\.)/i,
];

const allowed = new Set(['backend/.env.example']);
const violations = trackedFiles.filter((file) => !allowed.has(file) && prohibited.some((pattern) => pattern.test(file)));

if (violations.length > 0) {
  console.error('Sensitive or legacy files must not be tracked:');
  for (const file of violations) console.error(`- ${file}`);
  process.exit(1);
}

console.log('Tracked-file policy passed.');
