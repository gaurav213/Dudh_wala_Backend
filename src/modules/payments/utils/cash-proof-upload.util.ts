import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { BadRequestException } from '@nestjs/common';

const ALLOWED_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const MAX_BYTES = 5 * 1024 * 1024;

export function uploadsRoot(): string {
  return join(process.cwd(), 'uploads');
}

/** Saves an image under `uploads/<subdir>/` and returns the public path. */
export async function saveUploadImage(
  file: Express.Multer.File,
  subdir: string,
): Promise<string> {
  if (!file?.buffer?.length) {
    throw new BadRequestException('Image is required');
  }
  if (file.size > MAX_BYTES) {
    throw new BadRequestException('Image must be 5MB or smaller');
  }
  const ext = ALLOWED_MIME[file.mimetype];
  if (!ext) {
    throw new BadRequestException('Image must be jpeg, png, or webp');
  }

  const dir = join(uploadsRoot(), subdir);
  await mkdir(dir, { recursive: true });
  const filename = `${randomUUID()}${ext}`;
  await writeFile(join(dir, filename), file.buffer);
  return `/uploads/${subdir}/${filename}`;
}

export async function saveCashProofImage(
  file: Express.Multer.File,
): Promise<string> {
  return saveUploadImage(file, 'cash-proofs');
}

export async function saveFarmMediaImage(
  file: Express.Multer.File,
): Promise<string> {
  return saveUploadImage(file, 'farm-media');
}

export async function saveAvatarImage(
  file: Express.Multer.File,
): Promise<string> {
  return saveUploadImage(file, 'avatars');
}
