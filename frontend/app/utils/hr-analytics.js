import { reactive } from 'vue';
import { uiError } from './i18n.js';

const endpoints = { overview: '/hr/overview', gaps: '/hr/skill-gaps', attention: '/hr/needs-attention', coverage: '/hr/recommendation-coverage' };
export function createHrAnalytics(request) {
  const blocks = reactive(Object.fromEntries(Object.keys(endpoints).map(key => [key, { data: null, meta: {}, loading: false, error: '' }])));
  const versions = Object.fromEntries(Object.keys(endpoints).map(key => [key, 0]));
  async function loadBlock(key, query = {}) {
    if (!Object.hasOwn(endpoints, key)) return;
    const version = ++versions[key];
    const block = blocks[key];
    Object.assign(block, { loading: true, error: '', data: null, meta: {} });
    try {
      const result = await request(endpoints[key], { query: { ...query } });
      if (version === versions[key]) Object.assign(block, { data: result.data, meta: result.meta });
    } catch (error) {
      if (version === versions[key]) block.error = uiError(error);
    } finally {
      if (version === versions[key]) block.loading = false;
    }
  }
  return { blocks, loadBlock };
}
