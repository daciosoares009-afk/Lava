function redact(text) {
  return String(text)
    .replace(/mongodb(?:\+srv)?:\/\/[^\s"'<>]+/gi, '[MongoDB URI redigida]')
    .replace(/\b(mongodb_uri|password|passwd|pwd|token|secret|api[_-]?key|authorization)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1=[redigido]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [redigido]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[token redigido]')
    .slice(0, 1200);
}

export function formatSafeError(error) {
  const name = redact(error?.name || 'Error');
  const rawCode = error?.code ?? error?.codeName ?? error?.cause?.code ?? error?.reason?.code;
  const code = rawCode === undefined || rawCode === null ? '' : ` code=${redact(rawCode)}`;
  const message = redact(error?.message || 'Erro sem mensagem.');
  return `${name}${code}: ${message}`;
}
