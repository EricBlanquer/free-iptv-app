/**
 * Cloudflare Worker for IPTV Configuration Storage
 *
 * This worker provides a temporary key-value storage for IPTV app configuration.
 * The TV generates a random code and polls for configuration.
 * The user enters the code on the web config page and submits the config.
 * The TV receives the config, imports it, and deletes it from the server.
 *
 * SETUP:
 * 1. Create a new Worker on Cloudflare Dashboard
 * 2. Create a KV namespace called "iptv-configs"
 * 3. Bind the KV namespace to the worker with variable name "CONFIGS"
 * 4. Deploy this code
 *
 * API:
 * - PUT /{code}  - Store config (expires after 5 minutes)
 * - GET /{code}  - Retrieve config
 * - DELETE /{code} - Delete config
 *
 * URL: https://iptv-config.eric-blanquer.workers.dev
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const code = url.pathname.slice(1).toUpperCase();
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json'
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers });
    }

    // Validate code
    if (!code || code.length < 4) {
      return new Response('{"error":"invalid code"}', { status: 400, headers });
    }

    // Store config (expires after 5 minutes)
    if (request.method === 'PUT') {
      const data = await request.text();
      await env.CONFIGS.put(code, data, { expirationTtl: 300 });
      return new Response('{"ok":true}', { headers });
    }

    // Retrieve config
    if (request.method === 'GET') {
      const data = await env.CONFIGS.get(code);
      return new Response(data || 'null', { headers });
    }

    // Delete config
    if (request.method === 'DELETE') {
      await env.CONFIGS.delete(code);
      return new Response('{"ok":true}', { headers });
    }

    return new Response('{"error":"method not allowed"}', { status: 405, headers });
  }
}
