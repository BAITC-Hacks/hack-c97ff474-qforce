import { DomainError } from '../../../../shared/domain/domain-error';

export async function readBoundedJson(response: Response, maxBytes = 262_144): Promise<unknown> {
  if (!response.body) throw new DomainError('LLM_INVALID_JSON', 'Provider returned an empty body');
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > maxBytes) {await reader.cancel(); throw new DomainError('LLM_RESPONSE_TOO_LARGE', 'Provider response exceeded the size limit');}
      chunks.push(next.value);
    }
  } finally {reader.releaseLock();}
  try {return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;} catch {throw new DomainError('LLM_INVALID_JSON', 'Provider returned invalid JSON');}
}
