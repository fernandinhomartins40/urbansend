#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'src');
const OUTPUT_FILE = path.join(__dirname, '..', 'postgres-sql-audit.json');

const PATTERNS = [
  { id: 'sqlite_strftime', regex: /strftime\s*\(/g },
  { id: 'sqlite_datetime_now', regex: /datetime\s*\(\s*'now'/g },
  { id: 'sqlite_insert_or_ignore', regex: /INSERT\s+OR\s+IGNORE/gi },
  { id: 'sqlite_autoincrement', regex: /AUTOINCREMENT/gi },
  { id: 'double_quote_string_comparison', regex: /\b(status|event_type|severity|direction)\s*=\s*\"[A-Za-z0-9_ -]+\"/g },
  { id: 'mysql_interval_syntax', regex: /NOW\(\)\s*-\s*INTERVAL\s+\d+\s+HOUR/gi }
];

const isCodeFile = (filePath) => /\.(ts|js)$/i.test(filePath);

const walk = (dir, acc = []) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, acc);
    } else if (entry.isFile() && isCodeFile(fullPath)) {
      acc.push(fullPath);
    }
  }
  return acc;
};

const lineColAt = (content, index) => {
  const head = content.slice(0, index);
  const lines = head.split('\n');
  const line = lines.length;
  const col = lines[lines.length - 1].length + 1;
  return { line, col };
};

const run = () => {
  const files = walk(ROOT);
  const report = {
    generatedAt: new Date().toISOString(),
    root: ROOT,
    fileCount: files.length,
    summary: {},
    matches: []
  };

  for (const pattern of PATTERNS) {
    report.summary[pattern.id] = 0;
  }

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    for (const pattern of PATTERNS) {
      const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
      let match;
      while ((match = regex.exec(content)) !== null) {
        const pos = lineColAt(content, match.index);
        report.summary[pattern.id] += 1;
        report.matches.push({
          pattern: pattern.id,
          file: path.relative(path.join(__dirname, '..'), file).replace(/\\/g, '/'),
          line: pos.line,
          col: pos.col,
          snippet: content.slice(match.index, Math.min(match.index + 120, content.length)).split('\n')[0]
        });
      }
    }
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(report, null, 2), 'utf8');
  console.log(`SQL compatibility audit written to ${OUTPUT_FILE}`);
  console.log('Summary:', report.summary);
};

run();
