export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    try {
      let api_url;
      let customHeaders = {};
      let body = null;

      // ===== GET =====
      if (request.method === 'GET') {
        const url = new URL(request.url);
        api_url = url.searchParams.get("url");
      }

      // ===== POST =====
      else if (request.method === 'POST') {
        const reqBody = await request.json();
        api_url = reqBody.api_url;
        customHeaders = reqBody.headers || {};
        body = reqBody.payload || null;
      }

      if (!api_url || !/^https?:\/\//.test(api_url)) {
        return new Response(JSON.stringify({ error: 'Invalid api_url' }), {
          status: 400,
          headers: jsonHeaders()
        });
      }

      // 🔥 Forward headers chuẩn
      const headers = new Headers();

      // giữ nguyên header từ client
      for (const key in customHeaders) {
        headers.set(key, customHeaders[key]);
      }

      // fallback nếu thiếu
      if (!headers.has("user-agent")) {
        headers.set("user-agent", "Mozilla/5.0");
      }

      if (!headers.has("accept")) {
        headers.set("accept", "application/json");
      }

      // 🔥 cực quan trọng (tránh cache + bot detect)
      const fetchOptions = {
        method: request.method === 'GET' ? 'GET' : 'POST',
        headers,
        redirect: "follow",
        cf: {
          cacheTtl: 0,
          cacheEverything: false
        }
      };

      if (body && fetchOptions.method !== 'GET') {
        fetchOptions.body = JSON.stringify(body);
      }

      const response = await fetch(api_url, fetchOptions);

      const contentType = response.headers.get("content-type") || "text/plain";
      const text = await response.text();

      return new Response(text, {
        status: response.status,
        headers: {
          "content-type": contentType,
          ...corsHeaders()
        }
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: jsonHeaders()
      });
    }
  }
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "*"
  };
}

function jsonHeaders() {
  return {
    "content-type": "application/json",
    ...corsHeaders()
  };
}
