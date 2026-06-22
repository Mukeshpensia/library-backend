// utils/imageProcessor.js
// Re-encode uploaded images to a modern format (webp/avif) before they are
// stored under /uploads. Keeps covers small and consistent regardless of what
// the librarian uploaded (JPEG/PNG/etc.).

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const COVER_DIR = path.join(UPLOAD_DIR, 'covers');

const SUPPORTED_FORMATS = new Set(['webp', 'avif']);

// Target output format, configurable via COVER_IMAGE_FORMAT (defaults to webp,
// which is faster to encode and universally supported by modern browsers).
function coverFormat() {
    const fmt = (process.env.COVER_IMAGE_FORMAT || 'webp').toLowerCase();
    return SUPPORTED_FORMATS.has(fmt) ? fmt : 'webp';
}

// Buffer the uploaded file, re-encode it to webp/avif, write it under
// uploads/covers, and return the public URL path (served at /uploads/...).
// `keyBase` is used to build a stable, collision-free filename.
async function saveCoverImage(file, keyBase) {
    const buffer = await file.toBuffer();
    const format = coverFormat();

    fs.mkdirSync(COVER_DIR, { recursive: true });

    const safeKey = String(keyBase).replace(/[^a-zA-Z0-9._-]/g, '_');
    const filename = `${safeKey}-${Date.now()}.${format}`;
    const filepath = path.join(COVER_DIR, filename);

    // rotate() honours EXIF orientation; resize keeps covers to a sane size
    // without enlarging smaller uploads.
    let pipeline = sharp(buffer)
        .rotate()
        .resize({ width: 600, height: 900, fit: 'inside', withoutEnlargement: true });

    pipeline = format === 'avif'
        ? pipeline.avif({ quality: 50 })
        : pipeline.webp({ quality: 80 });

    await pipeline.toFile(filepath);

    return `/uploads/covers/${filename}`;
}

// Best-effort removal of a previously stored local cover. Ignores anything that
// isn't one of our own /uploads/covers files (e.g. external URLs).
function deleteCoverImage(urlPath) {
    if (!urlPath || !urlPath.startsWith('/uploads/covers/')) return;
    const filepath = path.join(UPLOAD_DIR, urlPath.replace('/uploads/', ''));
    fs.promises.unlink(filepath).catch(() => {});
}

module.exports = { saveCoverImage, deleteCoverImage, coverFormat };
