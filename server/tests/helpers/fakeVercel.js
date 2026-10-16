function fakeVercel() {
  const values = new Map();
  const calls = [];
  let sequence = 0;
  class BlobPreconditionFailedError extends Error {}
  const sdk = {
    values, calls, BlobPreconditionFailedError,
    beforePut: null,
    failReads: false,
    write(path, value) {
      const record = { bytes: Buffer.from(value), etag: `"version-${++sequence}"` };
      values.set(path, record);
      return record;
    },
    async get(path, options) {
      calls.push({ method: 'get', path, options });
      if (sdk.failReads) throw new Error('Storage offline');
      const record = values.get(path);
      if (!record) return null;
      return { statusCode: 200, stream: new Blob([record.bytes]).stream(), blob: { etag: record.etag } };
    },
    async put(path, value, options) {
      calls.push({ method: 'put', path, options });
      if (sdk.beforePut) await sdk.beforePut(path);
      const existing = values.get(path);
      if (options.ifMatch && existing?.etag !== options.ifMatch) throw new BlobPreconditionFailedError('ETag mismatch');
      if (!options.allowOverwrite && existing) throw new Error('Blob already exists');
      const record = sdk.write(path, value);
      return { pathname: path, etag: record.etag };
    },
    async del(path) {
      calls.push({ method: 'del', path });
      values.delete(path);
    },
    async list({ prefix, cursor }) {
      const paths = [...values.keys()].filter((key) => key.startsWith(prefix)).sort();
      const start = Number(cursor || 0);
      // Small pages exercise pagination even with tiny test datasets.
      const page = paths.slice(start, start + 2);
      return {
        blobs: page.map((pathname) => ({ pathname, etag: values.get(pathname).etag })),
        hasMore: start + page.length < paths.length,
        cursor: String(start + page.length),
      };
    },
  };
  return sdk;
}

module.exports = { fakeVercel };
