export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Only POST allowed' }), {
        status: 405,
        headers: { 'content-type': 'application/json', ...corsHeaders() }
      });
    }

    try {
      const { api_url, payload } = await request.json();

      if (!api_url || typeof api_url !== 'string' || !/^https?:\/\//.test(api_url)) {
        return new Response(JSON.stringify({ error: 'Invalid or missing api_url' }), {
          status: 400,
          headers: { 'content-type': 'application/json', ...corsHeaders() }
        });
      }

      // Copy headers từ client request
      const incomingHeaders = request.headers;
      const headers = new Headers();

      for (const [key, value] of incomingHeaders.entries()) {
        if (['host', 'content-length'].includes(key.toLowerCase())) continue;
        headers.set(key, value);
      }

      // Override bắt buộc
      headers.set('accept', 'application/json, text/plain, */*');
      headers.set('accept-language', 'vi,en-US;q=0.9,en;q=0.8,uz;q=0.7');
      headers.set('user-agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36');
      headers.set('content-type', 'application/json');

      const response = await fetch(api_url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        redirect: 'follow'
      });

      const contentType = response.headers.get('content-type') || 'application/json';
      const body = await response.text();

      return new Response(body, {
        status: response.status,
        headers: {
          'content-type': contentType,
          ...corsHeaders()
        }
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { 'content-type': 'application/json', ...corsHeaders() }
      });
    }
  }
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': '*'
  };
}
