import { BadRequestException } from '@nestjs/common';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { saveCashProofImage, sniffImageExt } from './cash-proof-upload.util';

describe('sniffImageExt', () => {
  it('uses declared jpeg mime', () => {
    expect(sniffImageExt('image/jpeg', Buffer.from([0x00]))).toBe('.jpg');
  });

  it('sniffs jpeg magic when mime is octet-stream', () => {
    expect(
      sniffImageExt('application/octet-stream', Buffer.from([0xff, 0xd8, 0xff, 0xe0])),
    ).toBe('.jpg');
  });

  it('sniffs png magic', () => {
    expect(
      sniffImageExt(
        undefined,
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
    ).toBe('.png');
  });

  it('rejects unknown bytes', () => {
    expect(sniffImageExt('application/pdf', Buffer.from('x'))).toBeUndefined();
  });
});

describe('saveCashProofImage', () => {
  const prev = process.env.UPLOADS_DIR;
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'dw-upload-'));
    process.env.UPLOADS_DIR = dir;
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.UPLOADS_DIR;
    else process.env.UPLOADS_DIR = prev;
    rmSync(dir, { recursive: true, force: true });
  });

  it('rejects missing file', async () => {
    await expect(
      saveCashProofImage(undefined as unknown as Express.Multer.File),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects unsupported mime type', async () => {
    await expect(
      saveCashProofImage({
        buffer: Buffer.from('x'),
        size: 1,
        mimetype: 'application/pdf',
      } as Express.Multer.File),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('writes a sniffed jpeg under the uploads root', async () => {
    mkdirSync(dir, { recursive: true });
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
    const url = await saveCashProofImage({
      buffer: jpeg,
      size: jpeg.length,
      mimetype: 'application/octet-stream',
    } as Express.Multer.File);
    expect(url).toMatch(/^\/uploads\/cash-proofs\/.+\.jpg$/);
    const filename = url.split('/').pop()!;
    expect(readFileSync(join(dir, 'cash-proofs', filename)).equals(jpeg)).toBe(
      true,
    );
  });
});
