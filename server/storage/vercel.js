// Adapt private Vercel Blob storage to the store interface used by the app.
// This module is server-only. Never return Blob URLs or credentials to clients.
function createVercelStore(name, { sdk = require('@vercel/blob'), prefix = process.env.BLOB_PREFIX
  || `realtychain/${process.env.VERCEL_ENV || 'development'}` } = {}) {
  const base = `${prefix.replace(/^\/+|\/+$/g, '')}/${name}/`;
  const versions = new Map();
  const protectedStore = name === 'app-data' || name === 'server-settings';
  const pathname = (key) => `${base}${key}`;

  return {
    async get(key, { type = 'text' } = {}) {
      // Mutable JSON must bypass the CDN, including reads on warm instances.
      const result = await sdk.get(pathname(key), { access: 'private', useCache: false });
      versions.set(key, result?.blob.etag || null);
      if (!result) return null;
      const response = new Response(result.stream);
      if (type === 'arrayBuffer') return response.arrayBuffer();
      if (type === 'json') return response.json();
      return response.text();
    },
    async set(key, value, { metadata } = {}) {
      const version = versions.get(key);
      const options = {
        access: 'private',
        addRandomSuffix: false,
        // A missing snapshot may only be created, never overwrite a competing
        // instance's first write. Existing snapshots require the read ETag.
        allowOverwrite: protectedStore ? Boolean(version) : true,
        ...(protectedStore && version ? { ifMatch: version } : {}),
        ...(metadata?.contentType ? { contentType: metadata.contentType } : {}),
      };
      try {
        const result = await sdk.put(pathname(key), value, options);
        versions.set(key, result.etag);
      } catch (err) {
        if ((sdk.BlobPreconditionFailedError && err instanceof sdk.BlobPreconditionFailedError)
          || /already exists/i.test(err.message)) {
          throw Object.assign(new Error('Data changed in another request. Refresh and try again.'), { status: 409 });
        }
        throw err;
      }
    },
    async delete(key) {
      await sdk.del(pathname(key));
      versions.delete(key);
    },
    async list({ prefix: keyPrefix = '' } = {}) {
      const blobs = [];
      let cursor;
      do {
        const page = await sdk.list({ prefix: pathname(keyPrefix), cursor, limit: 1000 });
        blobs.push(...page.blobs.map((blob) => ({ key: blob.pathname.slice(base.length), etag: blob.etag })));
        cursor = page.hasMore ? page.cursor : undefined;
        if (page.hasMore && !cursor) throw new Error('Blob listing returned no pagination cursor.');
      } while (cursor);
      return { blobs };
    },
  };
}

module.exports = { createVercelStore };
