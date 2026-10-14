import { beforeEach, describe, expect, it, vi } from 'vitest';

const runtime = { native: false };
const writeFile = vi.fn(async () => ({ uri: 'file:///cache/otchet.xlsx' }));
const share = vi.fn(async () => ({}));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => runtime.native } }));
vi.mock('@capacitor/filesystem', () => ({ Filesystem: { writeFile }, Directory: { Cache: 'CACHE' } }));
vi.mock('@capacitor/share', () => ({ Share: { share } }));

const { blobToBase64, shareFileNatively } = await import('./nativeFileShare');

describe('blobToBase64', () => {
  it('encodes bytes exactly, including a large file', async () => {
    expect(await blobToBase64(new Blob(['Отчёт 123']))).toBe(Buffer.from('Отчёт 123').toString('base64'));
    const big = new Uint8Array(200_000).map((_, i) => i % 256);
    expect(await blobToBase64(new Blob([big]))).toBe(Buffer.from(big).toString('base64'));
  });
});

describe('shareFileNatively', () => {
  beforeEach(() => { writeFile.mockClear(); share.mockClear(); });

  it('does nothing in a browser, so the regular download runs', async () => {
    runtime.native = false;
    expect(await shareFileNatively(new Blob(['x']), 'a.xlsx')).toBe(false);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('in the app writes the file to the cache and opens the share sheet with it', async () => {
    runtime.native = true;
    expect(await shareFileNatively(new Blob(['x']), 'otchet.xlsx')).toBe(true);
    expect(writeFile).toHaveBeenCalledWith({ path: 'otchet.xlsx', data: Buffer.from('x').toString('base64'), directory: 'CACHE' });
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ files: ['file:///cache/otchet.xlsx'] }));
  });

  it('treats closing the share sheet as done, and passes real errors on', async () => {
    runtime.native = true;
    share.mockRejectedValueOnce(new Error('Share canceled'));
    expect(await shareFileNatively(new Blob(['x']), 'a.xlsx')).toBe(true);
    share.mockRejectedValueOnce(new Error('No space left'));
    await expect(shareFileNatively(new Blob(['x']), 'a.xlsx')).rejects.toThrow('No space left');
  });
});
