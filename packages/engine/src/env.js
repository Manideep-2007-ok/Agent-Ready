// Tiny .env loader (no dependency, works on every Node 20+). Real environment variables always win over the file,
// and a missing file is fine: that is how `npm start` works on a machine with no .env.
import fs from 'node:fs';

/**
 * @param {string[]} files  later files do not override earlier ones or the real environment
 * @returns {string[]} the files that were found and read
 */
export function loadDotEnv(files) {
  const read = [];
  for (const file of files) {
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
    read.push(file);
    for (const line of text.split(/\r?\n/)) {
      const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
      if (!m || line.trim().startsWith('#')) continue;
      let value = m[2];
      const quote = value[0];
      if ((quote === '"' || quote === "'") && value.endsWith(quote) && value.length >= 2) value = value.slice(1, -1);
      else value = value.replace(/\s+#.*$/, ''); // trailing comment on an unquoted value
      if (process.env[m[1]] === undefined) process.env[m[1]] = value;
    }
  }
  return read;
}
