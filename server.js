/*
========================================================
 HRRY KEY BOT SERVER
 Telegram + Firebase + Payment Request System
========================================================

IMPORTANT:
1. Bot token GitHub में कभी मत डालना.
2. सभी secrets Render Environment Variables में डालना.
3. Telegram private channel में Bot को ADMIN बनाना जरूरी है.
4. PAYMENT_QR_URL में अपने PhonePe QR की image URL डालना.
*/

require("dotenv").config();

const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const crypto = require("crypto");

const app = express();

app.use(express.json({ limit: "1mb" }));

// ======================================================
// CONFIG
// ======================================================

const PORT = process.env.PORT || 10000;

const BOT_TOKEN = process.env.BOT_TOKEN;

const TELEGRAM_CHAT_ID =
  process.env.TELEGRAM_CHAT_ID || "-1004330203694";

const FIREBASE_URL =
  process.env.FIREBASE_URL ||
  "https://hyuuu-732f9-default-rtdb.firebaseio.com";

const APP_NAME =
  process.env.APP_NAME || "hrry.test";

const PAYMENT_QR_URL =
  process.env.PAYMENT_QR_URL || "";

const MAX_UPLOAD_MB = 5;

if (!BOT_TOKEN) {
  console.error("❌ BOT_TOKEN is missing.");
  process.exit(1);
}

// ======================================================
// TELEGRAM BOT
// ======================================================

const bot = new TelegramBot(BOT_TOKEN, {
  polling: true
});

console.log("🤖 HRRY Key Bot started");

// ======================================================
// FIREBASE REST HELPERS
// ======================================================

async function firebase(path, options = {}) {

  const url =
    FIREBASE_URL.replace(/\/$/, "") +
    "/" +
    path +
    ".json";

  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Firebase ${response.status}: ${text}`
    );
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

// ======================================================
// UTILITY
// ======================================================

function now() {
  return Date.now();
}

function makeId() {
  return (
    Date.now().toString(36) +
    "-" +
    crypto.randomBytes(5).toString("hex")
  );
}

function makeKey() {

  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  let key = "HRRY-";

  for (let i = 0; i < 4; i++) {

    if (i) key += "-";

    for (let j = 0; j < 4; j++) {
      key += chars[
        Math.floor(Math.random() * chars.length)
      ];
    }
  }

  return key;
}

function keyPath(key) {
  return encodeURIComponent(key).replace(/%2F/g, "/");
}

function escapeHtml(value) {

  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ======================================================
// GENERATE UNIQUE LICENSE KEY
// ======================================================

async function generateUniqueKey() {

  for (let i = 0; i < 20; i++) {

    const key = makeKey();

    const existing =
      await firebase(
        "licenseKeys/" + keyPath(key)
      );

    if (!existing) {

      const data = {
        appName: APP_NAME,
        status: "active",
        blocked: false,
        used: false,
        boundDeviceId: null,
        usedAt: null,
        createdAt: now(),
        lastVerifiedAt: null
      };

      await firebase(
        "licenseKeys/" + keyPath(key),
        {
          method: "PUT",
          body: JSON.stringify(data)
        }
      );

      return key;
    }
  }

  throw new Error("Unable to generate unique key");
}

// ======================================================
// TELEGRAM FORMAT
// ======================================================

function requestText(request) {

  return `
🆕 <b>NEW KEY REQUEST</b>

━━━━━━━━━━━━━━━━━━

👤 <b>Student Details</b>

<b>Name:</b> ${escapeHtml(request.name)}

<b>WhatsApp:</b> ${escapeHtml(
    request.whatsapp || "Not provided"
  )}

<b>Telegram ID:</b> <code>${escapeHtml(
    request.telegramId || "Not available"
  )}</code>

<b>Telegram Username:</b> ${
    request.telegramUsername
      ? "@" + escapeHtml(request.telegramUsername)
      : "Not provided"
  }

━━━━━━━━━━━━━━━━━━

💳 <b>Payment Details</b>

<b>UTR / Transaction ID:</b>
<code>${escapeHtml(request.utr)}</code>

<b>Amount:</b> ₹${escapeHtml(
    request.amount || "Not specified"
  )}

━━━━━━━━━━━━━━━━━━

🆔 <b>Request ID</b>

<code>${escapeHtml(request.id)}</code>

📅 <b>Submitted:</b>
${new Date(request.createdAt).toLocaleString("en-IN")}

📱 <b>Device ID:</b>
<code>${escapeHtml(request.deviceId)}</code>

━━━━━━━━━━━━━━━━━━

⏳ <b>Status:</b> PENDING

Please review the payment screenshot and choose an action.
`;
}

// ======================================================
// SEND REQUEST TO PRIVATE TELEGRAM CHANNEL
// ======================================================

async function sendRequestToAdmin(request) {

  const text = requestText(request);

  const keyboard = {
    inline_keyboard: [
      [
        {
          text: "✅ ACCEPT",
          callback_data:
            "accept:" + request.id
        },
        {
          text: "❌ REJECT",
          callback_data:
            "reject:" + request.id
        }
      ]
    ]
  };

  let sentMessage;

  // ----------------------------------------------------
  // If Telegram file_id exists, send screenshot
  // ----------------------------------------------------

  if (request.telegramFileId) {

    sentMessage =
      await bot.sendPhoto(
        TELEGRAM_CHAT_ID,
        request.telegramFileId,
        {
          caption: text,
          parse_mode: "HTML",
          reply_markup: keyboard
        }
      );

  } else {

    sentMessage =
      await bot.sendMessage(
        TELEGRAM_CHAT_ID,
        text,
        {
          parse_mode: "HTML",
          reply_markup: keyboard
        }
      );
  }

  // Save Telegram message information
  await firebase(
    "keyRequests/" + request.id,
    {
      method: "PATCH",
      body: JSON.stringify({
        telegramMessageId: sentMessage.message_id,
        telegramChatId: TELEGRAM_CHAT_ID,
        telegramSentAt: now()
      })
    }
  );

  return sentMessage;
}

// ======================================================
// TELEGRAM /START
// ======================================================

bot.onText(/^\/start(?:\s+(.+))?$/, async (msg, match) => {

  const chatId = msg.chat.id;

  const firstName =
    msg.from?.first_name || "Student";

  try {

    await bot.sendMessage(
      chatId,
      `👋 <b>Welcome to ${escapeHtml(APP_NAME)}</b>

This bot is used for key request notifications.

Your Telegram ID:

<code>${escapeHtml(
        String(msg.from?.id || "")
      )}</code>

You can now use the HRRY website to submit your key request.`,
      {
        parse_mode: "HTML"
      }
    );

  } catch (error) {

    console.error(
      "Start error:",
      error.message
    );
  }
});

// ======================================================
// TELEGRAM CALLBACK: ACCEPT / REJECT
// ======================================================

bot.on("callback_query", async query => {

  const data = query.data || "";

  if (
    !data.startsWith("accept:") &&
    !data.startsWith("reject:")
  ) {
    return;
  }

  const action =
    data.startsWith("accept:")
      ? "accept"
      : "reject";

  const requestId =
    data.split(":").slice(1).join(":");

  try {

    await bot.answerCallbackQuery(
      query.id,
      {
        text:
          action === "accept"
            ? "Processing acceptance..."
            : "Processing rejection..."
      }
    );

    const request =
      await firebase(
        "keyRequests/" + requestId
      );

    if (!request) {

      await bot.sendMessage(
        query.message.chat.id,
        "❌ Request not found."
      );

      return;
    }

    // --------------------------------------------------
    // Already processed
    // --------------------------------------------------

    if (
      request.status === "accepted" ||
      request.status === "rejected"
    ) {

      await bot.answerCallbackQuery(
        query.id,
        {
          text:
            "This request has already been processed.",
          show_alert: true
        }
      );

      return;
    }

    // ==================================================
    // ACCEPT
    // ==================================================

    if (action === "accept") {

      const key =
        await generateUniqueKey();

      await firebase(
        "keyRequests/" + requestId,
        {
          method: "PATCH",
          body: JSON.stringify({
            status: "accepted",
            key: key,
            acceptedAt: now(),
            processedBy:
              query.from?.username ||
              String(query.from?.id || "")
          })
        }
      );

      // Update Telegram message
      try {

        await bot.editMessageReplyMarkup(
          {
            inline_keyboard: []
          },
          {
            chat_id:
              query.message.chat.id,
            message_id:
              query.message.message_id
          }
        );

      } catch (e) {
        console.log(
          "Keyboard remove failed:",
          e.message
        );
      }

      await bot.sendMessage(
        query.message.chat.id,

        `✅ <b>REQUEST ACCEPTED</b>

👤 ${escapeHtml(request.name)}

💳 UTR:
<code>${escapeHtml(request.utr)}</code>

🔑 Generated Key:
<code>${escapeHtml(key)}</code>

The key has been generated successfully.`,

        {
          parse_mode: "HTML"
        }
      );

      return;
    }

    // ==================================================
    // REJECT
    // ==================================================

    if (action === "reject") {

      await firebase(
        "keyRequests/" + requestId,
        {
          method: "PATCH",
          body: JSON.stringify({
            status: "rejected",
            rejectedAt: now(),
            processedBy:
              query.from?.username ||
              String(query.from?.id || "")
          })
        }
      );

      try {

        await bot.editMessageReplyMarkup(
          {
            inline_keyboard: []
          },
          {
            chat_id:
              query.message.chat.id,
            message_id:
              query.message.message_id
          }
        );

      } catch (e) {
        console.log(
          "Keyboard remove failed:",
          e.message
        );
      }

      await bot.sendMessage(
        query.message.chat.id,

        `❌ <b>REQUEST REJECTED</b>

👤 ${escapeHtml(request.name)}

💳 UTR:
<code>${escapeHtml(request.utr)}</code>

The student can resubmit the request.`,

        {
          parse_mode: "HTML"
        }
      );

      return;
    }

  } catch (error) {

    console.error(
      "Callback error:",
      error
    );

    try {

      await bot.answerCallbackQuery(
        query.id,
        {
          text:
            "Something went wrong. Please try again.",
          show_alert: true
        }
      );

    } catch {}
  }
});

// ======================================================
// API: HEALTH
// ======================================================

app.get("/", (req, res) => {

  res.json({
    ok: true,
    app: APP_NAME,
    service: "HRRY Key Bot",
    time: now()
  });
});

// ======================================================
// API: CREATE KEY REQUEST
// ======================================================

app.post("/api/key-request", async (req, res) => {

  try {

    const {
      name,
      whatsapp,
      telegramId,
      telegramUsername,
      utr,
      amount,
      deviceId,
      telegramFileId
    } = req.body || {};

    // --------------------------------------------------
    // Validation
    // --------------------------------------------------

    if (!name || String(name).trim().length < 2) {

      return res.status(400).json({
        ok: false,
        error: "Student name is required."
      });
    }

    if (!utr || String(utr).trim().length < 4) {

      return res.status(400).json({
        ok: false,
        error: "UTR / Transaction ID is required."
      });
    }

    if (!deviceId) {

      return res.status(400).json({
        ok: false,
        error: "Device ID is required."
      });
    }

    if (!telegramFileId) {

      return res.status(400).json({
        ok: false,
        error:
          "Payment screenshot is required."
      });
    }

    // --------------------------------------------------
    // Check existing pending request
    // --------------------------------------------------

    const allRequests =
      await firebase("keyRequests");

    if (allRequests) {

      const existing =
        Object.values(allRequests).find(
          r =>
            r.deviceId === deviceId &&
            (
              r.status === "pending"
            )
        );

      if (existing) {

        return res.status(409).json({
          ok: false,
          error:
            "You already have a pending request.",
          requestId: existing.id,
          status: existing.status
        });
      }
    }

    // --------------------------------------------------
    // Create request
    // --------------------------------------------------

    const id = makeId();

    const request = {

      id,

      appName: APP_NAME,

      name:
        String(name).trim(),

      whatsapp:
        String(whatsapp || "").trim(),

      telegramId:
        String(telegramId || "").trim(),

      telegramUsername:
        String(
          telegramUsername || ""
        ).trim(),

      utr:
        String(utr).trim(),

      amount:
        String(amount || "").trim(),

      deviceId:
        String(deviceId).trim(),

      telegramFileId,

      status: "pending",

      key: null,

      createdAt: now(),

      updatedAt: now()
    };

    await firebase(
      "keyRequests/" + id,
      {
        method: "PUT",
        body: JSON.stringify(request)
      }
    );

    // --------------------------------------------------
    // Send to private Telegram channel
    // --------------------------------------------------

    await sendRequestToAdmin(request);

    return res.json({

      ok: true,

      requestId: id,

      status: "pending",

      message:
        "Request submitted successfully."
    });

  } catch (error) {

    console.error(
      "Create request error:",
      error
    );

    return res.status(500).json({
      ok: false,
      error:
        "Unable to submit request."
    });
  }
});

// ======================================================
// API: GET REQUEST STATUS
// ======================================================

app.get(
  "/api/key-request/:id",
  async (req, res) => {

    try {

      const id =
        String(req.params.id || "");

      if (!id) {

        return res.status(400).json({
          ok: false,
          error: "Request ID required."
        });
      }

      const request =
        await firebase(
          "keyRequests/" + id
        );

      if (!request) {

        return res.status(404).json({
          ok: false,
          error: "Request not found."
        });
      }

      return res.json({

        ok: true,

        request: {

          id: request.id,

          name: request.name,

          status: request.status,

          createdAt:
            request.createdAt,

          updatedAt:
            request.updatedAt,

          acceptedAt:
            request.acceptedAt || null,

          rejectedAt:
            request.rejectedAt || null,

          key:
            request.status === "accepted"
              ? request.key
              : null
        }
      });

    } catch (error) {

      console.error(
        "Status error:",
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          "Unable to get request status."
      });
    }
  }
);

// ======================================================
// API: GET USER REQUEST HISTORY
// ======================================================

app.get(
  "/api/key-requests/device/:deviceId",
  async (req, res) => {

    try {

      const deviceId =
        String(
          req.params.deviceId || ""
        );

      if (!deviceId) {

        return res.status(400).json({
          ok: false,
          error: "Device ID required."
        });
      }

      const allRequests =
        await firebase("keyRequests");

      const list = [];

      if (allRequests) {

        for (
          const [id, request]
          of Object.entries(allRequests)
        ) {

          if (
            request.deviceId === deviceId
          ) {

            list.push({

              id,

              name:
                request.name,

              status:
                request.status,

              utr:
                request.utr,

              createdAt:
                request.createdAt,

              acceptedAt:
                request.acceptedAt || null,

              rejectedAt:
                request.rejectedAt || null,

              key:
                request.status === "accepted"
                  ? request.key
                  : null
            });
          }
        }
      }

      list.sort(
        (a, b) =>
          Number(b.createdAt || 0) -
          Number(a.createdAt || 0)
      );

      return res.json({

        ok: true,

        requests: list
      });

    } catch (error) {

      console.error(
        "History error:",
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          "Unable to load history."
      });
    }
  }
);

// ======================================================
// API: TELEGRAM USER INFO
// ======================================================

app.get(
  "/api/telegram-user/:telegramId",
  async (req, res) => {

    try {

      const telegramId =
        String(
          req.params.telegramId || ""
        );

      if (!telegramId) {

        return res.status(400).json({
          ok: false
        });
      }

      return res.json({

        ok: true,

        telegramId
      });

    } catch {

      return res.status(500).json({
        ok: false
      });
    }
  }
);

// ======================================================
// START SERVER
// ======================================================

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `🚀 HRRY server running on port ${PORT}`
    );

    console.log(
      `📡 Firebase: ${FIREBASE_URL}`
    );

    console.log(
      `📢 Telegram Chat: ${TELEGRAM_CHAT_ID}`
    );
  }
);

// ======================================================
// ERROR HANDLERS
// ======================================================

process.on(
  "unhandledRejection",
  error => {

    console.error(
      "Unhandled rejection:",
      error
    );
  }
);

process.on(
  "uncaughtException",
  error => {

    console.error(
      "Uncaught exception:",
      error
    );
  }
);
