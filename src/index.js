export default {
    // Telegram bot reviewkhoahoc
    async fetch(request, env) {
        if (request.method !== "POST") {
            return new Response("OK", { status: 200 });
        }

        try {
            const body = await request.json();
            const isCallback = !!body.callback_query;

            // Lấy thông tin cơ bản
            const chatId = isCallback ? body.callback_query.message.chat.id : body.message?.chat?.id;
            const messageId = isCallback ? body.callback_query.message.message_id : null;
            const callbackQueryId = isCallback ? body.callback_query.id : null;
            const text = (isCallback ? "" : body.message?.text || "").trim();
            const callbackData = isCallback ? body.callback_query.data : null;

            if (!chatId && !callbackQueryId) return new Response("ok", { status: 200 });

            const apiDomain = env.API_DOMAIN;
            const apiUsername = env.API_USERNAME;
            const apiPassword = env.API_PASSWORD;
            const apiSecret = env.API_SECRET;
            const botToken = env.BOT_TOKEN;

            const basicAuth = btoa(`${apiUsername}:${apiPassword}`);
            const commonHeaders = {
                "Authorization": `Basic ${basicAuth}`,
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0",
                ...(apiSecret && { "X-RVKH-Secret": apiSecret })
            };

            // =========================
            // 🔥 Helpers
            // =========================
            async function callAPI(url, method = "GET") {
                const res = await fetch(url, {
                    method,
                    headers: commonHeaders,
                    redirect: "follow"
                });
                const text = await res.text();
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                if (text.includes("Just a moment")) throw new Error("Bị Cloudflare chặn");
                return JSON.parse(text);
            }

            async function sendToTelegram(method, params) {
                return fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(params)
                });
            }

            let reply = "";
            let replyMarkup = null;

            // =========================
            // 🖱️ Xử lý Callback Query (Nút bấm)
            // =========================
            if (isCallback && callbackData) {
                const [action, targetId] = callbackData.split(":");

                try {
                    const data = await callAPI(`${apiDomain}/user?target=${targetId}&action=${action}`, "POST");

                    if (data?.success) {
                        const statusText = action === "lock" ? "🔒 Locked" : "✅ Active";
                        const nextAction = action === "lock" ? "unlock" : "lock";
                        const nextLabel = action === "lock" ? "🔓 Unlock" : "🔒 Lock";

                        // Cập nhật nội dung tin nhắn cũ
                        const newText = `✅ Đã thực hiện: ${action === "lock" ? "KHÓA" : "MỞ KHÓA"} thành công.\n` +
                            `👤 User: ${targetId}\n` +
                            `📊 Hiện tại: ${statusText}`;

                        await sendToTelegram("editMessageText", {
                            chat_id: chatId,
                            message_id: messageId,
                            text: newText,
                            reply_markup: {
                                inline_keyboard: [[{ text: `${nextLabel} ${targetId}`, callback_data: `${nextAction}:${targetId}` }]]
                            }
                        });

                        await sendToTelegram("answerCallbackQuery", {
                            callback_query_id: callbackQueryId,
                            text: `Thành công: ${action}`
                        });
                    } else {
                        await sendToTelegram("answerCallbackQuery", {
                            callback_query_id: callbackQueryId,
                            text: `Lỗi: ${data?.message || "Unknown"}`,
                            show_alert: true
                        });
                    }
                } catch (err) {
                    await sendToTelegram("answerCallbackQuery", {
                        callback_query_id: callbackQueryId,
                        text: "Lỗi kết nối API",
                        show_alert: true
                    });
                }
                return new Response("ok", { status: 200 });
            }

            // =========================
            // ⌨️ Xử lý Tin nhắn (Commands)
            // =========================
            const parts = text.split(" ");
            const command = parts[0];
            const id = parts[1];

            if (command === "/user") {
                if (!id) {
                    reply = "❌ Ví dụ: /user 123";
                } else {
                    const data = await callAPI(`${apiDomain}/user?target=${id}`);
                    if (data?.id) {
                        const isLocked = data.status === 'locked';
                        reply = `👤 User Info:\n` +
                            `- ID: ${data.id}\n` +
                            `- Email: ${data.email}\n` +
                            `- Status: ${isLocked ? '🔒 Locked' : '✅ Active'}`;

                        // Thêm nút bấm tùy theo trạng thái
                        replyMarkup = {
                            inline_keyboard: [[
                                {
                                    text: isLocked ? `🔓 Unlock ${data.id}` : `🔒 Lock ${data.id}`,
                                    callback_data: isLocked ? `unlock:${data.id}` : `lock:${data.id}`
                                }
                            ]]
                        };
                    } else {
                        reply = `❌ Không tìm thấy user ${id}`;
                    }
                }
            } else if (command === "/lock" || command === "/unlock") {
                const action = command.replace("/", "");
                if (!id) {
                    reply = `❌ Ví dụ: /${action} 123`;
                } else {
                    const data = await callAPI(`${apiDomain}/user?target=${id}&action=${action}`, "POST");
                    reply = data?.success ? `✅ Đã ${action === 'lock' ? 'khóa' : 'mở khóa'} user ${id}` : `❌ Lỗi: ${data?.message}`;
                }
            }

            if (reply) {
                await sendToTelegram("sendMessage", {
                    chat_id: chatId,
                    text: reply,
                    reply_markup: replyMarkup
                });
            }

            return new Response("ok", { status: 200 });

        } catch (err) {
            console.error("Worker Error:", err);
            return new Response("error", { status: 200 });
        }
    }
};
