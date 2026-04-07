export default {
    async fetch(request, env) {
        if (request.method !== "POST") return new Response("OK", { status: 200 });

        try {
            const body = await request.json();
            const isCallback = !!body.callback_query;
            
            // 🆔 Basic parameters
            const chatId = isCallback ? body.callback_query.message.chat.id : body.message?.chat?.id;
            const messageId = isCallback ? body.callback_query.message.message_id : null;
            const cbId = isCallback ? body.callback_query.id : null;
            const text = (isCallback ? "" : body.message?.text || "").trim();
            const cbData = isCallback ? body.callback_query.data : null;

            if (!chatId && !cbId) return new Response("ok", { status: 200 });

            // 🔑 Credentials
            const { API_DOMAIN: domain, API_USERNAME: user, API_PASSWORD: pass, API_SECRET: secret, BOT_TOKEN: token } = env;
            const basicAuth = btoa(`${user}:${pass}`);
            const headers = {
                "Authorization": `Basic ${basicAuth}`,
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0",
                ...(secret && { "X-RVKH-Secret": secret })
            };

            // =========================
            // 🛠️ Modular Helpers
            // =========================
            async function callWP(url, method = "GET") {
                const res = await fetch(url, { method, headers, redirect: "follow" });
                const raw = await res.text();
                if (!res.ok) throw new Error(`WordPress API Error ${res.status}`);
                if (raw.includes("Just a moment")) throw new Error("Cloudflare WAF Blocked Request");
                return JSON.parse(raw);
            }

            async function tg(method, params) {
                return fetch(`https://api.telegram.org/bot${token}/${method}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(params)
                });
            }

            // Generate message content & keyboard based on user status
            function formatUserUI(userData) {
                const isLocked = userData.status === 'locked';
                const emoji = isLocked ? "🔒" : "✅";
                const label = isLocked ? "Locked" : "Active";
                
                const text = `👤 <b>Thông tin Người dùng:</b>\n` +
                             `━━━━━━━━━━━━━━\n` +
                             `🆔 <b>ID:</b> <code>${userData.id}</code>\n` +
                             `📧 <b>Email:</b> <code>${userData.email}</code>\n` +
                             `📊 <b>Trạng thái:</b> ${emoji} ${label}`;
                
                const keyboard = {
                    inline_keyboard: [[
                        { 
                            text: isLocked ? `🔓 Mở khóa cho ${userData.id}` : `🔒 Khóa user ${userData.id}`, 
                            callback_data: `${isLocked ? 'unlock' : 'lock'}:${userData.id}` 
                        }
                    ]]
                };

                return { text, keyboard };
            }

            // =========================
            // 🖱️ Callback Handling (Button Clicks)
            // =========================
            if (isCallback && cbData) {
                const [action, targetId] = cbData.split(":");
                
                try {
                    // Cập nhật WordPress
                    const result = await callWP(`${domain}/user?target=${targetId}&action=${action}`, "POST");
                    
                    if (result?.success) {
                        // Lấy trạng thái mới nhất để hiển thị
                        const updated = await callWP(`${domain}/user?target=${targetId}`);
                        const ui = formatUserUI(updated);

                        // Cập nhật lại tin nhắn cũ với trạng thái mới
                        await tg("editMessageText", {
                            chat_id: chatId,
                            message_id: messageId,
                            text: `✨ <b>Thành công: Đã ${action === 'lock' ? 'Khóa' : 'Mở khóa'}</b>\n\n` + ui.text,
                            parse_mode: "HTML",
                            reply_markup: ui.keyboard
                        });

                        await tg("answerCallbackQuery", { callback_query_id: cbId, text: "Thao tác thành công!" });
                    } else {
                        throw new Error(result?.message || "WordPress rejected action");
                    }
                } catch (err) {
                    await tg("answerCallbackQuery", { 
                        callback_query_id: cbId, 
                        text: `❌ Lỗi: ${err.message}`, 
                        show_alert: true 
                    });
                }
                return new Response("ok", { status: 200 });
            }

            // =========================
            // ⌨️ Command Handling
            // =========================
            const parts = text.split(" ");
            const command = parts[0];
            const targetId = parts[1];

            if (command === "/user") {
                if (!targetId) {
                    await tg("sendMessage", { chat_id: chatId, text: "❌ Cú pháp: <code>/user [ID hoặc Email]</code>", parse_mode: "HTML" });
                } else {
                    try {
                        const data = await callWP(`${domain}/user?target=${targetId}`);
                        if (data?.id) {
                            const ui = formatUserUI(data);
                            await tg("sendMessage", {
                                chat_id: chatId,
                                text: ui.text,
                                parse_mode: "HTML",
                                reply_markup: ui.keyboard
                            });
                        } else {
                            await tg("sendMessage", { chat_id: chatId, text: `❌ Không tìm thấy người dùng: <b>${targetId}</b>`, parse_mode: "HTML" });
                        }
                    } catch (err) {
                        await tg("sendMessage", { chat_id: chatId, text: `❌ Lỗi kết nối API: <code>${err.message}</code>`, parse_mode: "HTML" });
                    }
                }
            } else if (command === "/lock" || command === "/unlock") {
                const action = command.replace("/", "");
                if (!targetId) {
                    await tg("sendMessage", { chat_id: chatId, text: `❌ Cú pháp: <code>/${action} [ID]</code>`, parse_mode: "HTML" });
                } else {
                    try {
                        const data = await callWP(`${domain}/user?target=${targetId}&action=${action}`, "POST");
                        const statusEmoji = action === 'lock' ? '🔒' : '✅';
                        await tg("sendMessage", { 
                            chat_id: chatId, 
                            text: data?.success 
                                ? `${statusEmoji} <b>Đã ${action === 'lock' ? 'Khóa' : 'Mở khóa'} thành công user:</b> <code>${targetId}</code>` 
                                : `❌ <b>Lỗi:</b> ${data?.message}`,
                            parse_mode: "HTML"
                        });
                    } catch (err) {
                        await tg("sendMessage", { chat_id: chatId, text: `❌ Lỗi: <code>${err.message}</code>`, parse_mode: "HTML" });
                    }
                }
            } else if (command === "/start") {
                await tg("sendMessage", { chat_id: chatId, text: "👋 <b>Chào mừng quản trị viên!</b>\n\nSử dụng lệnh <code>/user [ID]</code> để quản lý người dùng.", parse_mode: "HTML" });
            }

            return new Response("ok", { status: 200 });

        } catch (err) {
            console.error("Worker Global Error:", err);
            return new Response("error", { status: 200 });
        }
    }
};
