/**
 * Cloudflare Worker for IPTV Configuration Storage & Premium Licensing
 *
 * This worker provides:
 * 1. Temporary key-value storage for IPTV app configuration (pairing)
 * 2. Premium state storage per deviceId
 * 3. License code validation
 *
 * SETUP:
 * 1. Create a new Worker on Cloudflare Dashboard
 * 2. Create a KV namespace called "iptv-configs"
 * 3. Bind the KV namespace to the worker with variable name "CONFIGS"
 * 4. Add environment variable ADMIN_SECRET for license generation
 * 5. Deploy this code
 *
 * API:
 * - PUT /{code}  - Store config (expires after 5 minutes)
 * - GET /{code}  - Retrieve config
 * - DELETE /{code} - Delete config
 * - GET /premium/{deviceId} - Get premium state
 * - PUT /premium/{deviceId} - Store premium state
 * - POST /license/validate - Validate a license code
 * - POST /license/generate - Generate a license code (admin only)
 *
 * URL: https://iptv-config.eric-blanquer.workers.dev
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Secret',
      'Content-Type': 'application/json'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers });
    }

    // Premium state endpoints
    if (path.startsWith('/premium/')) {
      const deviceId = decodeURIComponent(path.slice('/premium/'.length));
      if (!deviceId || deviceId.length < 2) {
        return new Response('{"error":"invalid deviceId"}', { status: 400, headers });
      }
      const kvKey = 'premium:' + deviceId;

      if (request.method === 'GET') {
        const data = await env.CONFIGS.get(kvKey);
        return new Response(data || 'null', { headers });
      }

      if (request.method === 'PUT') {
        const data = await request.text();
        await env.CONFIGS.put(kvKey, data);
        return new Response('{"ok":true}', { headers });
      }

      return new Response('{"error":"method not allowed"}', { status: 405, headers });
    }

    // License validation
    if (path === '/license/validate' && request.method === 'POST') {
      const body = await request.json();
      const licCode = (body.code || '').toUpperCase().trim();
      const licDeviceId = body.deviceId || '';

      if (!licCode || licCode.length < 4) {
        return new Response('{"valid":false,"error":"invalid_code"}', { headers });
      }

      const licenseData = await env.CONFIGS.get('license:' + licCode);
      if (!licenseData) {
        return new Response('{"valid":false,"error":"not_found"}', { headers });
      }

      const license = JSON.parse(licenseData);
      if (license.used && license.deviceId && license.deviceId !== licDeviceId) {
        return new Response('{"valid":false,"error":"already_used"}', { headers });
      }

      license.used = true;
      license.deviceId = licDeviceId;
      license.activatedAt = Date.now();
      await env.CONFIGS.put('license:' + licCode, JSON.stringify(license));

      if (licDeviceId) {
        const premiumKey = 'premium:' + licDeviceId;
        const existing = await env.CONFIGS.get(premiumKey);
        const premiumData = existing ? JSON.parse(existing) : {};
        premiumData.licenseCode = licCode;
        premiumData.licensedAt = Date.now();
        await env.CONFIGS.put(premiumKey, JSON.stringify(premiumData));
      }

      return new Response('{"valid":true}', { headers });
    }

    // Device deletion (admin only)
    if (path === '/admin/device/delete' && request.method === 'POST') {
      const adminSecret = request.headers.get('X-Admin-Secret');
      if (!adminSecret || adminSecret !== env.ADMIN_SECRET) {
        return new Response('{"error":"unauthorized"}', { status: 401, headers });
      }

      const body = await request.json();
      const delDeviceId = body.deviceId || '';
      if (!delDeviceId) {
        return new Response('{"error":"deviceId required"}', { status: 400, headers });
      }

      await env.CONFIGS.delete('premium:' + delDeviceId);
      return new Response('{"ok":true}', { headers });
    }

    // License revocation (admin only)
    if (path === '/license/revoke' && request.method === 'POST') {
      const adminSecret = request.headers.get('X-Admin-Secret');
      if (!adminSecret || adminSecret !== env.ADMIN_SECRET) {
        return new Response('{"error":"unauthorized"}', { status: 401, headers });
      }

      const body = await request.json();
      const revokeCode = (body.code || '').toUpperCase().trim();
      if (!revokeCode) {
        return new Response('{"error":"code required"}', { status: 400, headers });
      }

      const licenseData = await env.CONFIGS.get('license:' + revokeCode);
      if (licenseData) {
        const license = JSON.parse(licenseData);
        if (license.deviceId) {
          const premiumKey = 'premium:' + license.deviceId;
          const premiumData = await env.CONFIGS.get(premiumKey);
          if (premiumData) {
            const premium = JSON.parse(premiumData);
            delete premium.licenseCode;
            delete premium.licensedAt;
            await env.CONFIGS.put(premiumKey, JSON.stringify(premium));
          }
        }
      }
      await env.CONFIGS.delete('license:' + revokeCode);
      return new Response('{"ok":true}', { headers });
    }

    // License generation (admin only)
    if (path === '/license/generate' && request.method === 'POST') {
      const adminSecret = request.headers.get('X-Admin-Secret');
      if (!adminSecret || adminSecret !== env.ADMIN_SECRET) {
        return new Response('{"error":"unauthorized"}', { status: 401, headers });
      }

      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let genCode = '';
      for (let i = 0; i < 6; i++) {
        genCode += chars.charAt(Math.floor(Math.random() * chars.length));
      }

      await env.CONFIGS.put('license:' + genCode, JSON.stringify({
        code: genCode,
        createdAt: Date.now(),
        used: false,
        deviceId: null
      }));

      return new Response(JSON.stringify({ code: genCode }), { headers });
    }

    // Admin: list all licenses
    if (path === '/admin/licenses' && request.method === 'GET') {
      const adminSecret = url.searchParams.get('secret');
      if (!adminSecret || adminSecret !== env.ADMIN_SECRET) {
        return new Response('{"error":"unauthorized"}', { status: 401, headers });
      }

      const list = await env.CONFIGS.list({ prefix: 'license:' });
      const licenses = [];
      for (const key of list.keys) {
        const data = await env.CONFIGS.get(key.name);
        if (data) {
          licenses.push(JSON.parse(data));
        }
      }

      licenses.sort(function(a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
      return new Response(JSON.stringify({ licenses: licenses }), { headers });
    }

    // Admin: list all premium devices
    if (path === '/admin/devices' && request.method === 'GET') {
      const adminSecret = url.searchParams.get('secret');
      if (!adminSecret || adminSecret !== env.ADMIN_SECRET) {
        return new Response('{"error":"unauthorized"}', { status: 401, headers });
      }

      const list = await env.CONFIGS.list({ prefix: 'premium:' });
      const devices = [];
      for (const key of list.keys) {
        const data = await env.CONFIGS.get(key.name);
        if (data) {
          const parsed = JSON.parse(data);
          parsed.deviceId = key.name.slice('premium:'.length);
          devices.push(parsed);
        }
      }

      return new Response(JSON.stringify({ devices: devices }), { headers });
    }

    // PayPal IPN (Instant Payment Notification)
    if (path === '/paypal/ipn' && request.method === 'POST') {
      const body = await request.text();

      // Verify IPN with PayPal
      const verifyRes = await fetch('https://ipnpb.paypal.com/cgi-bin/webscr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'cmd=_notify-validate&' + body
      });
      const verifyText = await verifyRes.text();

      if (verifyText !== 'VERIFIED') {
        return new Response('IPN not verified', { status: 400 });
      }

      const params = new URLSearchParams(body);
      const paymentStatus = params.get('payment_status');
      const payerEmail = (params.get('payer_email') || '').toLowerCase().trim();
      const txnId = params.get('txn_id') || '';

      if (paymentStatus !== 'Completed' || !payerEmail) {
        return new Response('OK');
      }

      // Check if txn already processed
      const existingTxn = await env.CONFIGS.get('txn:' + txnId);
      if (existingTxn) {
        return new Response('OK');
      }

      // Generate license code
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let ipnCode = '';
      for (let i = 0; i < 6; i++) {
        ipnCode += chars.charAt(Math.floor(Math.random() * chars.length));
      }

      // Store license
      await env.CONFIGS.put('license:' + ipnCode, JSON.stringify({
        code: ipnCode,
        createdAt: Date.now(),
        used: false,
        deviceId: null,
        payerEmail: payerEmail,
        txnId: txnId
      }));

      // Store email -> code mapping (for lookup)
      const emailKey = 'email:' + payerEmail;
      const existingCodes = await env.CONFIGS.get(emailKey);
      const codes = existingCodes ? JSON.parse(existingCodes) : [];
      codes.push({ code: ipnCode, createdAt: Date.now(), txnId: txnId });
      await env.CONFIGS.put(emailKey, JSON.stringify(codes));

      // Mark txn as processed
      await env.CONFIGS.put('txn:' + txnId, ipnCode);

      return new Response('OK');
    }

    // License lookup by email
    if (path === '/license/lookup' && request.method === 'GET') {
      const email = (url.searchParams.get('email') || '').toLowerCase().trim();
      if (!email) {
        return new Response('{"error":"email required"}', { status: 400, headers });
      }

      const emailKey = 'email:' + email;
      const codesData = await env.CONFIGS.get(emailKey);
      if (!codesData) {
        return new Response('{"codes":[]}', { headers });
      }

      return new Response(JSON.stringify({ codes: JSON.parse(codesData) }), { headers });
    }

    // Original config pairing endpoints
    const pairCode = path.slice(1).toUpperCase();

    if (!pairCode || pairCode.length < 4) {
      return new Response('{"error":"invalid code"}', { status: 400, headers });
    }

    if (request.method === 'PUT') {
      const data = await request.text();
      await env.CONFIGS.put(pairCode, data, { expirationTtl: 300 });
      return new Response('{"ok":true}', { headers });
    }

    if (request.method === 'GET') {
      const data = await env.CONFIGS.get(pairCode);
      return new Response(data || 'null', { headers });
    }

    if (request.method === 'DELETE') {
      await env.CONFIGS.delete(pairCode);
      return new Response('{"ok":true}', { headers });
    }

    return new Response('{"error":"method not allowed"}', { status: 405, headers });
  }
}
