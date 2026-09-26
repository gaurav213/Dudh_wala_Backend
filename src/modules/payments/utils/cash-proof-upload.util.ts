import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { BadRequestException } from '@nestjs/common';

const ALLOWED_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const MAX_BYTES = 5 * 1024 * 1024;

let resolvedRoot: string | undefined;

export function uploadsRoot(): string {
  if (process.env.UPLOADS_DIR) return process.env.UPLOADS_DIR;
  if (resolvedRoot) return resolvedRoot;
  return join(process.cwd(), 'uploads');
}

/** Create a writable uploads dir. Falls back to /tmp when cwd is not writable. */
export async function ensureUploadsRoot(): Promise<string> {
  if (process.env.UPLOADS_DIR) {
    await mkdir(process.env.UPLOADS_DIR, { recursive: true });
    resolvedRoot = process.env.UPLOADS_DIR;
    return resolvedRoot;
  }
  if (resolvedRoot) return resolvedRoot;
  const preferred = join(process.cwd(), 'uploads');
  try {
    await mkdir(preferred, { recursive: true });
    resolvedRoot = preferred;
    return preferred;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'EACCES' && code !== 'EROFS' && code !== 'EPERM') {
      throw err;
    }
    // ponytail: Render image runs as USER app; /app/uploads is root-owned.
    // Persistent disk or object storage is the upgrade. /tmp lasts this process.
    const fallback = '/tmp/doodh-uploads';
    await mkdir(fallback, { recursive: true });
    resolvedRoot = fallback;
    return fallback;
  }
}

/** jpeg / png / webp from declared mime or magic bytes (Flutter often sends octet-stream). */
export function sniffImageExt(
  mimetype: string | undefined,
  buffer: Buffer,
): string | undefined {
  const declared = ALLOWED_MIME[(mimetype ?? '').toLowerCase()];
  if (declared) return declared;
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return '.jpg';
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return '.png';
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return '.webp';
  }
  return undefined;
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
  const ext = sniffImageExt(file.mimetype, file.buffer);
  if (!ext) {
    throw new BadRequestException('Image must be jpeg, png, or webp');
  }

  const root = await ensureUploadsRoot();
  const dir = join(root, subdir);
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
