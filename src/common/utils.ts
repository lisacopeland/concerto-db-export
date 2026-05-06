import * as fs from 'fs';
import * as path from 'path';
import { TestNodePortKey } from './testnodeportkey.interface';
// Get the arg named 'name' from the commandline
export function getArg(name: string, fallback: string | null = null) {
  const prefix = `--${name}=`;
  const match = process.argv.find((a) => a.startsWith(prefix));
  if (match) return match.slice(prefix.length);

  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1];

  return fallback;
}

export function safeIdentifier(value: string | null, label: string): string | null {
  if (!/^[A-Za-z0-9_]+$/.test(value ?? '')) {
    // throw new Error(`Invalid ${label}: ${value}`);
    return null;
  }
  return value;
}

// Ensure that a foldername contains only valid chars
export function safeName(name: string) {
  return String(name || 'unnamed')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 120);
}

export function extensionForColumn(column: string): string {
  const map: Record<string, string> = {
    html: 'html',
    css: 'css',
    js: 'js',
    code: 'R',
    value: 'R',
  };

  return map[column] ?? 'txt';
}

export function normalizeText(value: string) {
  return String(value ?? '')
    .replace(/\r\n/g, '\n') // CRLF → LF
    .replace(/\r/g, '\n') // stray CR → LF
    .replace(/\s*$/, '\n'); // ensure single trailing newline
}

// If the content is not empty or null, write to the filePath
export function writeIfPresent(filePath: string, content: string | null | undefined) {
  if (content === undefined || content === null || content === '') return;
  fs.writeFileSync(filePath, String(content), 'utf8');
}

export function makeFileName(compositeMode: boolean, row: any, column: string, keyColumn: string) {
  let filename = '';
  if (compositeMode) {
    filename = `${safeName(row['flow_test_name'])}__${safeName(row['node_title'])}__${safeName(row['port_name'])}.R`;
  } else {
    const ext = extensionForColumn(column);
    filename = `${row[keyColumn]}.${ext}`;
  }
  return filename;
}

export function getKeyFromFileName(fileName: string) {
  return path.parse(fileName).name;
}

export function getTestNodePortKeyFromFileName(fileName: string): TestNodePortKey {
  const baseName = path.basename(fileName, path.extname(fileName));
  const parts = baseName.split('__');

  if (parts.length !== 3) {
    throw new Error(`Invalid TestNodePort filename: ${fileName}`);
  }

  const [flow_test_name, node_title, port_name] = parts;

  return { flow_test_name, node_title, port_name };
}

export function makeTestNodePortKey(row: {
  flow_test_name: string;
  node_title: string;
  port_name: string;
}): string {
  return `${row.flow_test_name}__${row.node_title}__${row.port_name}`;
}
