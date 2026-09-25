import { BadRequestException } from '@nestjs/common';
import { saveCashProofImage } from './cash-proof-upload.util';

describe('saveCashProofImage', () => {
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
});
