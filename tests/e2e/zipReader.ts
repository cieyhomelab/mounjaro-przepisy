import { crc32, inflateRawSync } from 'node:zlib';

/** Reads a ZIP archive (as written by the export) into a map from path to content. */
export function readZip(archive: Buffer): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  const endAt = archive.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (endAt < 0) throw new Error('not a zip archive');
  const count = archive.readUInt16LE(endAt + 10);
  let at = archive.readUInt32LE(endAt + 16);
  for (let index = 0; index < count; index++) {
    if (archive.readUInt32LE(at) !== 0x02014b50) throw new Error('broken central directory');
    const method = archive.readUInt16LE(at + 10);
    const crc = archive.readUInt32LE(at + 16);
    const packedSize = archive.readUInt32LE(at + 20);
    const nameLength = archive.readUInt16LE(at + 28);
    const extraLength = archive.readUInt16LE(at + 30);
    const commentLength = archive.readUInt16LE(at + 32);
    const localAt = archive.readUInt32LE(at + 42);
    const name = archive.toString('utf8', at + 46, at + 46 + nameLength);
    const dataAt =
      localAt + 30 + archive.readUInt16LE(localAt + 26) + archive.readUInt16LE(localAt + 28);
    const packed = archive.subarray(dataAt, dataAt + packedSize);
    const data = method === 8 ? inflateRawSync(packed) : Buffer.from(packed);
    if (crc32(data) !== crc) throw new Error(`checksum mismatch in ${name}`);
    files.set(name, data);
    at += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}
