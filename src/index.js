export default {
  // Telegram bot reviewkhoahoc
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("OK", { status: 200 });
    }

    try {
      const body = await request.json();

      if (!body?.message?.text) {
        return new Response("ok", { status: 200 });
      }

      const chatId = body.message.chat.id;
      const text = body.message.text.trim();

      const apiDomain = env.API_DOMAIN;
      const apiUsername = env.API_USERNAME;
      const apiPassword = env.API_PASSWORD;
      const apiSecret = env.API_SECRET;
      const botToken = env.BOT_TOKEN;

      // 🔥 encode Basic Auth (Worker không có Buffer)
      const basicAuth = btoa(`${apiUsername}:${apiPassword}`);

      const commonHeaders = {
        "Authorization": `Basic ${basicAuth}`,
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0",
        ...(apiSecret && { "X-RVKH-Secret": apiSecret })
      };

      let reply = "Sai cú pháp";

      // =========================
      // 🔥 helper gọi API
      // =========================
      async function callAPI(url, method = "GET") {
        const res = await fetch(url, {
          method,
          headers: commonHeaders,
          redirect: "follow"
        });

        const text = await res.text();

        if (!res.ok) {
          console.error("API Error:", res.status, text.substring(0, 300));
          throw new Error(`HTTP ${res.status}`);
        }

        // detect Cloudflare block
        if (text.includes("Just a moment")) {
          throw new Error("Bị Cloudflare chặn");
        }

        return JSON.parse(text);
      }

      const parts = text.split(" ");
      const command = parts[0];
      const id = parts[1];

      // =========================
      // /user
      // =========================
      if (command === "/user") {
        if (!id) {
          reply = "❌ Ví dụ: /user 123";
        } else {
          const data = await callAPI(`${apiDomain}/user?target=${id}`);

          if (data?.id) {
            reply =
              `👤 User Info:\n` +
              `- ID: ${data.id}\n` +
              `- Email: ${data.email}\n` +
              `- Status: ${data.status === 'locked' ? '🔒 Locked' : '✅ Active'}`;
          } else {
            reply = `❌ Không tìm thấy user ${id}`;
          }
        }
      }

      // =========================
      // /lock
      // =========================
      else if (command === "/lock") {
        if (!id) {
          reply = "❌ Ví dụ: /lock 123";
        } else {
          const data = await callAPI(
            `${apiDomain}/user?target=${id}&action=lock`,
            "POST"
          );

          reply = data?.success
            ? `🔒 Đã khóa user ${id}`
            : `❌ Lỗi: ${data?.message || "Unknown"}`;
        }
      }

      // =========================
      // /unlock
      // =========================
      else if (command === "/unlock") {
        if (!id) {
          reply = "❌ Ví dụ: /unlock 123";
        } else {
          const data = await callAPI(
            `${apiDomain}/user?target=${id}&action=unlock`,
            "POST"
          );

          reply = data?.success
            ? `🔓 Đã mở khóa user ${id}`
            : `❌ Lỗi: ${data?.message || "Unknown"}`;
        }
      }

      // =========================
      // 📤 gửi Telegram
      // =========================
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: reply
        })
      });

      return new Response("ok", { status: 200 });

    } catch (err) {
      console.error("Worker Error:", err);
      return new Response("error", { status: 200 });
    }
  }
};
