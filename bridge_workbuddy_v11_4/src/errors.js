export function safeError(error) {
  const code = error?.cause?.code || error?.code;
  if (['TimeoutError', 'AbortError'].includes(error?.name) || ['ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT'].includes(code)) return '上游响应超时，请稍后重试；现有账号和记录已保留';
  if (['ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH', 'UND_ERR_SOCKET'].includes(code)) return '暂时无法连接 WorkBuddy 服务，请检查网络后重试；现有账号和记录已保留';
  if (['CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN'].includes(code)) return 'WorkBuddy 连接的证书验证失败，请检查系统时间或代理设置后重试';
  const text = error?.message || '';
  // Never surface arbitrary upstream response bodies or credentials.
  return /^[\u3400-\u9fff]/u.test(text) && text.length < 180 ? text : '操作未完成，请稍后重试；现有账号和记录已保留';
}
