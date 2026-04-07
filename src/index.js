export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    try {
      let api_url, customHeaders = {}, payload;

      if (request.method === 'GET') {
        const url = new URL(request.url);
        api_url = url.searchParams.get("url");
      } else {
        const body = await request.json();
        api_url = body.api_url;
        customHeaders = body.headers || {};
        payload = body.payload;
      }

      if (!api_url || !/^https?:\/\//.test(api_url)) {
        return new Response(JSON.stringify({ error: 'Invalid api_url' }), {
          status: 400,
          headers: { 'content-type': 'application/json', ...corsHeaders() }
        });
      }

      const headers = new Headers();

      // giả lập browser
      headers.set('accept', 'application/json, text/plain, */*');
      headers.set('user-agent', 'Mozilla/5.0');

      // merge headers từ client
      for (const key in customHeaders) {
        headers.set(key, customHeaders[key]);
      }

      const fetchOptions = {
        method: request.method === 'GET' ? 'GET' : 'POST',
        headers,
        redirect: 'follow'
      };

      if (payload && fetchOptions.method !== 'GET') {
        fetchOptions.body = JSON.stringify(payload);
        headers.set('content-type', 'application/json');
      }

      const response = await fetch(api_url, fetchOptions);

      const contentType = response.headers.get('content-type') || 'text/plain';
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
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': '*'
  };
}
