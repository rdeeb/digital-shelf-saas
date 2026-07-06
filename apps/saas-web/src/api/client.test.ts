import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiDelete, apiGet, apiPost } from './client';

function stubFetch(body: unknown = {}) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('api client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('prefixes relative API paths with /api/v1 and sends credentials', async () => {
    const fetchMock = stubFetch({ ok: true });

    await apiGet('/settings');

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/settings', {
      credentials: 'include',
    });
  });

  it('keeps explicit API paths available for auth and device calls', async () => {
    const fetchMock = stubFetch({ ok: true });

    await apiPost('/api/auth/logout');
    await apiDelete('/api/device/v1/frame-manifest');

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/auth/logout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
      credentials: 'include',
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/device/v1/frame-manifest', {
      method: 'DELETE',
      credentials: 'include',
    });
  });
});
