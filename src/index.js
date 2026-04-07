export default {
    async fetch(request, env) {
        if (request.method !== "POST") {
            return new Response("OK", { status: 200 });
        }

        try {
            const body = await safeJson(request);
            if (!body) return ok();

            const isCallback = !!body.callback_query;

            const chatId = isCallback
                ? body.callback_query?.message?.chat?.id
                : body.message?.chat?.id;

            const messageId = isCallback
                ? body.callback_query?.message?.message_id
                : null;

            const callbackQueryId = isCallback
                ? body.callback_query?.id
                : null;

            const text = isCallback
                ? ""
                : (body.message?.text || "").trim();

            const callbackData = isCallback
                ? body.callback_query?.data
                : null;

            if (!chatId && !callbackQueryId) return ok();

            // =========================
            // ENV
            // =========================
            const {
                API_DOMAIN,
                API_USERNAME,
                API_PASSWORD,
                API_SECRET,
                BOT_TOKEN
            } = env;

            const basicAuth = base64Encode(`${API_USERNAME}:${API_PASSWORD}`);

            const commonHeaders = {
                "Authorization": `Basic ${basicAuth}`,
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0",
                ...(API_SECRET && { "X-RVKH-Secret": API_SECRET })
            };

            // =========================
            // Telegram API
            // =========================
            const tg = (method, params) =>
                fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(params)
                });

            // =========================
            // API CALL (có timeout + retry)
            // =========================
            async function callAPI(url, method = "GET", retry = 1) {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 8000);

                try {
                    const res = await fetch(url, {
                        method,
                        headers: commonHeaders,
                        signal: controller.signal
                    });

                    const text = await res.text();

                    if (!res.ok) throw new Error(`HTTP ${res.status}`);

                    if (
                        text.includes("Just a moment") ||
                        text.includes("Attention Required")
                    ) {
                        throw new Error("Cloudflare block");
                    }

                    try {
                        return JSON.parse(text);
                    } catch {
                        throw new Error("Invalid JSON response");
                    }
                } catch (err) {
                    if (retry > 0) {
                        await sleep(500);
                        return callAPI(url, method, retry - 1);
                    }
                    console.error("API ERROR:", err);
                    throw err;
                } finally {
                    clearTimeout(timeout);
                }
            }

            // =========================
            // CALLBACK HANDLER
            // =========================
            if (isCallback && callbackData) {
                // trả lời ngay để tránh timeout Telegram
                await tg("answerCallbackQuery", {
                    callback_query_id: callbackQueryId
                });

                const [action, targetId] = callbackData.split(":");

                try {
                    const data = await callAPI(
                        `${API_DOMAIN}/user?target=${targetId}&action=${action}`,
                        "POST"
                    );

                    if (data?.success) {
                        const isLock = action === "lock";

                        const newText =
                            `✅ ${isLock ? "KHÓA" : "MỞ KHÓA"} thành công\n` +
                            `👤 User: ${targetId}\n` +
                            `📊 Status: ${isLock ? "🔒 Locked" : "✅ Active"}`;

                        const nextAction = isLock ? "unlock" : "lock";

                        await tg("editMessageText", {
                            chat_id: chatId,
                            message_id: messageId,
                            text: newText,
                            reply_markup: {
                                inline_keyboard: [[
                                    {
                                        text: `${isLock ? "🔓 Unlock" : "🔒 Lock"} ${targetId}`,
                                        callback_data: `${nextAction}:${targetId}`
                                    }
                                ]]
                            }
                        });
                    } else {
                        await tg("sendMessage", {
                            chat_id: chatId,
                            text: `❌ Lỗi: ${data?.message || "Unknown"}`
                        });
                    }
                } catch (err) {
                    console.error("Callback error:", err);
                    await tg("sendMessage", {
                        chat_id: chatId,
                        text: "❌ Lỗi kết nối API"
                    });
                }

                return ok();
            }

            // =========================
            // COMMAND HANDLER
            // =========================
            if (!text) return ok();

            const parts = text.split(/\s+/);
            const command = parts[0];
            const id = parts[1];

            let reply = "";
            let replyMarkup;

            try {
                if (command === "/user") {
                    if (!id) {
                        reply = "❌ Ví dụ: /user 123";
                    } else {
                        const data = await callAPI(`${API_DOMAIN}/user?target=${id}`);

                        if (data?.id) {
                            const isLocked = data.status === "locked";

                            reply =
                                `👤 User Info:\n` +
                                `- ID: ${data.id}\n` +
                                `- Email: ${data.email}\n` +
                                `- Status: ${isLocked ? "🔒 Locked" : "✅ Active"}`;

                            replyMarkup = {
                                inline_keyboard: [[
                                    {
                                        text: isLocked
                                            ? `🔓 Unlock ${data.id}`
                                            : `🔒 Lock ${data.id}`,
                                        callback_data: isLocked
                                            ? `unlock:${data.id}`
                                            : `lock:${data.id}`
                                    }
                                ]]
                            };
                        } else {
                            reply = `❌ Không tìm thấy user ${id}`;
                        }
                    }
                }

                else if (command === "/lock" || command === "/unlock") {
                    const action = command.replace("/", "");

                    if (!id) {
                        reply = `❌ Ví dụ: /${action} 123`;
                    } else {
                        const data = await callAPI(
                            `${API_DOMAIN}/user?target=${id}&action=${action}`,
                            "POST"
                        );

                        reply = data?.success
                            ? `✅ Đã ${action === "lock" ? "khóa" : "mở khóa"} ${id}`
                            : `❌ ${data?.message || "Lỗi"} `;
                    }
                }

                if (reply) {
                    await tg("sendMessage", {
                        chat_id: chatId,
                        text: reply,
                        ...(replyMarkup && { reply_markup: replyMarkup })
                    });
                }

            } catch (err) {
                console.error("Command error:", err);

                await tg("sendMessage", {
                    chat_id: chatId,
                    text: "❌ Lỗi xử lý, vui lòng thử lại"
                });
            }

            return ok();

        } catch (err) {
            console.error("Worker error:", err);
            return ok();
        }
    }
};

// =========================
// HELPERS
// =========================
function ok() {
    return new Response("ok", { status: 200 });
}

async function safeJson(request) {
    try {
        return await request.json();
    } catch {
        return null;
    }
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function base64Encode(str) {
    return btoa(unescape(encodeURIComponent(str)));
}
