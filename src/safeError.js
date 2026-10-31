function redact(text) {
  return String(text)
    .replace(/mongodb(?:\+srv)?:\/\/[^\s"'<>]+/gi, '[MongoDB URI redigida]')
    .replace(/\b(mongodb_uri|password|passwd|pwd|token|secret|api[_-]?key|authorization)["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1=[redigido]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [redigido]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[token redigido]')
    .replace(/\bsb_secret_[A-Za-z0-9_-]+\b/g, '[chave redigida]')
    .replace(/\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/g, '[hash redigido]')
    .replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ')
    .slice(0, 1200);
}

export function formatSafeError(error) {
  const name = redact(error?.name || 'Error');
  const rawCode = error?.code ?? error?.codeName ?? error?.cause?.code ?? error?.reason?.code;
  const code = rawCode === undefined || rawCode === null ? '' : ` code=${redact(rawCode)}`;
  const message = redact(error?.message || 'Erro sem mensagem.');
  return `${name}${code}: ${message}`;
}
