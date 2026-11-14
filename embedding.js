// 応答ヘッダーが「この親には埋め込ませない」と言っているかを判定する。
// DNR はパネル直下以外のフレームからもヘッダーを外してしまうため、
// 入れ子のフレームではこの結果を使って、本来表示されないはずのフレームを取り除く（#7）。

function originOf(value) {
  try {
    return value && value !== 'null' ? new URL(value).origin : null;
  } catch {
    return null;
  }
}

function sourceAllows(source, parentOrigin, frameOrigin) {
  if (source === "'self'") return parentOrigin === frameOrigin;
  if (!parentOrigin) return false;
  if (source === 'https:' || source === 'http:') return parentOrigin.startsWith(source);
  try {
    const allowed = new URL(source.includes('://') ? source : `https://${source}`);
    const parent = new URL(parentOrigin);
    if (allowed.hostname.startsWith('*.')) {
      return (
        parent.protocol === allowed.protocol && parent.hostname.endsWith(allowed.hostname.slice(1))
      );
    }
    return allowed.origin === parent.origin;
  } catch {
    return false;
  }
}

/**
 * @param {{ url: string, initiator?: string, responseHeaders?: { name: string, value?: string }[] }} details
 * @returns {boolean}
 */
export function blocksEmbedding({ url, initiator, responseHeaders = [] }) {
  const frameOrigin = originOf(url);
  if (!frameOrigin) return false;
  const parentOrigin = originOf(initiator);

  for (const header of responseHeaders) {
    const name = header.name.toLowerCase();
    const value = (header.value ?? '').trim();

    if (name === 'x-frame-options') {
      const options = value.split(',').map((part) => part.trim().toLowerCase());
      if (options.includes('deny')) return true;
      if (options.includes('sameorigin') && parentOrigin !== frameOrigin) return true;
      continue;
    }

    if (name !== 'content-security-policy') continue;
    const match = value.match(/(?:^|;\s*)frame-ancestors\s+([^;]+)/i);
    if (!match) continue;
    const sources = match[1].trim().toLowerCase().split(/\s+/);
    if (sources.includes("'none'")) return true;
    if (sources.includes('*')) continue;
    if (!sources.some((source) => sourceAllows(source, parentOrigin, frameOrigin))) return true;
  }
  return false;
}
