require("dotenv").config();

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const crypto = require("crypto");

/* =========================================================
   APP
========================================================= */

const app = express();

const PORT = process.env.PORT || 3000;

const BOT_TOKEN = process.env.BOT_TOKEN || "";

const TELEGRAM_CHAT_ID = String(
  process.env.TELEGRAM_CHAT_ID || "-1004330203694"
);

const ADMIN_TELEGRAM_ID = String(
  process.env.ADMIN_TELEGRAM_ID || "8458244469"
);

const FIREBASE_DATABASE_URL = (
  process.env.FIREBASE_DATABASE_URL ||
  "https://hyuuu-732f9-default-rtdb.firebaseio.com"
).replace(/\/$/, "");

const FIREBASE_AUTH_TOKEN =
  process.env.FIREBASE_AUTH_TOKEN || "";

/*
  IMPORTANT:
  Existing HRRY test app expects this exact app name.
*/
const APP_NAME = "hrry.test";

if (!BOT_TOKEN) {
  console.error("❌ BOT_TOKEN missing");
  process.exit(1);
}

/* =========================================================
   EXPRESS
========================================================= */

app.use(
  cors({
    origin: "*",
    methods: [
      "GET",
      "POST",
      "PATCH",
      "PUT",
      "OPTIONS"
    ],
    allowedHeaders: [
      "Content-Type",
      "Authorization"
    ]
  })
);

app.use(
  express.json({
    limit: "10mb"
  })
);

app.use(
  express.urlencoded({
    extended: true
  })
);

/* =========================================================
   MULTER
========================================================= */

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 5 * 1024 * 1024
  },

  fileFilter: (req, file, cb) => {
    const allowed = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp"
    ];

    if (!allowed.includes(file.mimetype)) {
      return cb(
        new Error(
          "Only JPG, PNG and WEBP images are allowed."
        )
      );
    }

    cb(null, true);
  }
});

/* =========================================================
   BASIC HELPERS
========================================================= */

function nowISO() {
  return new Date().toISOString();
}

function readableTime(date = new Date()) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  }).format(date);
}

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function cleanPhone(value) {
  return String(value || "")
    .replace(/[^\d+]/g, "")
    .trim();
}

function generateRequestId() {
  return (
    "REQ-" +
    Date.now().toString(36).toUpperCase() +
    "-" +
    crypto.randomBytes(4).toString("hex").toUpperCase()
  );
}

/*
  EXACT SAME KEY STYLE AS HRRY TEST APP

  HRRY-XXXX-XXXX-XXXX
*/

function generateKey() {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  let key = "HRRY-";

  for (let block = 0; block < 4; block++) {
    if (block > 0) {
      key += "-";
    }

    for (let i = 0; i < 4; i++) {
      key +=
        chars[
          Math.floor(
            Math.random() * chars.length
          )
        ];
    }
  }

  return key;
}

/* =========================================================
   FIREBASE
========================================================= */

function firebaseURL(path) {
  let url =
    FIREBASE_DATABASE_URL +
    "/" +
    path.replace(/^\/+/, "") +
    ".json";

  if (FIREBASE_AUTH_TOKEN) {
    url +=
      "?auth=" +
      encodeURIComponent(
        FIREBASE_AUTH_TOKEN
      );
  }

  return url;
}

async function firebase(method, path, body) {
  const options = {
    method,
    headers: {
      "Content-Type": "application/json"
    }
  };

  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(
    firebaseURL(path),
    options
  );

  const text = await response.text();

  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    throw new Error(
      `Firebase ${response.status}: ${text}`
    );
  }

  return data;
}

/* =========================================================
   TELEGRAM API
========================================================= */

const TELEGRAM_API =
  `https://api.telegram.org/bot${BOT_TOKEN}`;

async function telegram(method, body = {}) {
  const response = await fetch(
    `${TELEGRAM_API}/${method}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    }
  );

  const data = await response.json();

  if (!data.ok) {
    throw new Error(
      `Telegram ${method} failed: ` +
      JSON.stringify(data)
    );
  }

  return data.result;
}

/* =========================================================
   SEND PHOTO
========================================================= */

async function sendTelegramPhoto(
  buffer,
  filename,
  mimeType,
  caption
) {
  const form = new FormData();

  const blob = new Blob(
    [buffer],
    {
      type:
        mimeType ||
        "image/jpeg"
    }
  );

  form.append(
    "chat_id",
    TELEGRAM_CHAT_ID
  );

  form.append(
    "photo",
    blob,
    filename || "payment.jpg"
  );

  form.append(
    "caption",
    caption
  );

  form.append(
    "parse_mode",
    "HTML"
  );

  const response = await fetch(
    `${TELEGRAM_API}/sendPhoto`,
    {
      method: "POST",
      body: form
    }
  );

  const data = await response.json();

  if (!data.ok) {
    throw new Error(
      "Telegram sendPhoto failed: " +
      JSON.stringify(data)
    );
  }

  return data.result;
}

/* =========================================================
   TELEGRAM CAPTIONS
========================================================= */

function pendingCaption(r) {
  return `
<b>💳 PAYMENT KEY REQUEST RECEIVED</b>

━━━━━━━━━━━━━━━━━━━━

👤 <b>Student Name:</b>
${escapeHTML(r.name)}

📱 <b>WhatsApp Number:</b>
${escapeHTML(r.whatsapp)}

💰 <b>Payment Amount:</b>
₹${escapeHTML(r.amount)}

🔢 <b>UTR / Transaction ID:</b>
<code>${escapeHTML(r.utr)}</code>

🆔 <b>Request ID:</b>
<code>${escapeHTML(r.requestId)}</code>

📅 <b>Time:</b>
${escapeHTML(r.createdAtReadable)}

━━━━━━━━━━━━━━━━━━━━

⏳ <b>Status:</b>
🟡 WAITING FOR ADMIN ACTION

👇 <b>Choose an action:</b>
`.trim();
}

function acceptedCaption(r) {
  return `
<b>💳 PAYMENT KEY REQUEST RECEIVED</b>

━━━━━━━━━━━━━━━━━━━━

👤 <b>Student Name:</b>
${escapeHTML(r.name)}

📱 <b>WhatsApp Number:</b>
${escapeHTML(r.whatsapp)}

💰 <b>Payment Amount:</b>
₹${escapeHTML(r.amount)}

🔢 <b>UTR / Transaction ID:</b>
<code>${escapeHTML(r.utr)}</code>

🆔 <b>Request ID:</b>
<code>${escapeHTML(r.requestId)}</code>

📅 <b>Request Time:</b>
${escapeHTML(r.createdAtReadable)}

━━━━━━━━━━━━━━━━━━━━

🟢 <b>ACCEPTED BY ADMIN</b>

🔑 <b>GENERATED KEY:</b>

<code>${escapeHTML(r.key)}</code>

👑 <b>Accepted by Admin</b>

🕐 <b>Action Time:</b>
${escapeHTML(r.actionTime)}

━━━━━━━━━━━━━━━━━━━━

✅ <b>PAYMENT VERIFIED</b>
`.trim();
}

function rejectedCaption(r) {
  return `
<b>💳 PAYMENT KEY REQUEST RECEIVED</b>

━━━━━━━━━━━━━━━━━━━━

👤 <b>Student Name:</b>
${escapeHTML(r.name)}

📱 <b>WhatsApp Number:</b>
${escapeHTML(r.whatsapp)}

💰 <b>Payment Amount:</b>
₹${escapeHTML(r.amount)}

🔢 <b>UTR / Transaction ID:</b>
<code>${escapeHTML(r.utr)}</code>

🆔 <b>Request ID:</b>
<code>${escapeHTML(r.requestId)}</code>

📅 <b>Request Time:</b>
${escapeHTML(r.createdAtReadable)}

━━━━━━━━━━━━━━━━━━━━

🔴 <b>REJECTED BY ADMIN</b>

❌ <b>Payment request rejected.</b>

🕐 <b>Action Time:</b>
${escapeHTML(r.actionTime)}

━━━━━━━━━━━━━━━━━━━━

❌ <b>REQUEST REJECTED</b>
`.trim();
}

/* =========================================================
   TELEGRAM BUTTONS
========================================================= */

function pendingKeyboard(requestId) {
  return {
    inline_keyboard: [
      [
        {
          text: "✅ ACCEPT",
          callback_data:
            `accept:${requestId}`
        },
        {
          text: "❌ REJECT",
          callback_data:
            `reject:${requestId}`
        }
      ]
    ]
  };
}

function acceptedKeyboard(requestId) {
  return {
    inline_keyboard: [
      [
        {
          text: "🟢 ACCEPTED BY ADMIN",
          callback_data:
            `status:accepted:${requestId}`
        }
      ]
    ]
  };
}

function rejectedKeyboard(requestId) {
  return {
    inline_keyboard: [
      [
        {
          text: "🔴 REJECTED BY ADMIN",
          callback_data:
            `status:rejected:${requestId}`
        }
      ]
    ]
  };
}

/* =========================================================
   EDIT TELEGRAM MESSAGE
========================================================= */

async function editTelegramMessage(
  chatId,
  messageId,
  caption,
  keyboard
) {
  return telegram(
    "editMessageCaption",
    {
      chat_id: chatId,
      message_id: Number(messageId),
      caption,
      parse_mode: "HTML",
      reply_markup: keyboard
    }
  );
}

/* =========================================================
   HOME
========================================================= */

app.get("/", (req, res) => {
  res.send(`
<!doctype html>
<html>
<head>
<title>${escapeHTML(APP_NAME)}</title>
<meta name="viewport"
content="width=device-width,initial-scale=1">
</head>

<body style="
margin:0;
padding:40px;
background:#090b10;
color:white;
font-family:Arial;
text-align:center;
">

<h1>HRRY KEY SERVER</h1>

<p>Server is running ✅</p>

<p>
Telegram callback system:
ACTIVE
</p>

</body>
</html>
`);
});

/* =========================================================
   HEALTH
========================================================= */

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    server: "online",
    telegram: "direct-api-polling",
    callbacks: "enabled",
    app: APP_NAME,
    time: nowISO()
  });
});

/* =========================================================
   UPLOAD SCREENSHOT
========================================================= */

app.post(
  "/api/upload-screenshot",
  upload.single("screenshot"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          ok: false,
          error:
            "Payment screenshot is required."
        });
      }

      const uploadId =
        crypto.randomUUID();

      const initialCaption = `
<b>📸 PAYMENT SCREENSHOT RECEIVED</b>

━━━━━━━━━━━━━━━━━━━━

⏳ <b>Waiting for student details...</b>

🆔 Upload ID:

<code>${uploadId}</code>
`.trim();

      const message =
        await sendTelegramPhoto(
          req.file.buffer,
          req.file.originalname ||
            "payment.jpg",
          req.file.mimetype,
          initialCaption
        );

      const telegramFileId =
        message.photo?.length
          ? message.photo[
              message.photo.length - 1
            ].file_id
          : null;

      await firebase(
        "PUT",
        `hrryKeyUploads/${uploadId}`,
        {
          uploadId,

          telegramChatId:
            TELEGRAM_CHAT_ID,

          telegramMessageId:
            message.message_id,

          telegramFileId,

          originalName:
            req.file.originalname,

          mimeType:
            req.file.mimetype,

          size:
            req.file.size,

          used: false,

          createdAt:
            nowISO()
        }
      );

      console.log(
        "📸 SCREENSHOT RECEIVED",
        uploadId
      );

      return res.json({
        ok: true,
        uploadId,
        telegramMessageId:
          message.message_id,
        message:
          "Screenshot uploaded successfully."
      });

    } catch (error) {
      console.error(
        "❌ Screenshot error:",
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          error.message ||
          "Screenshot upload failed."
      });
    }
  }
);

/* =========================================================
   CREATE KEY REQUEST
========================================================= */

app.post(
  "/api/key-request",
  async (req, res) => {
    try {
      const {
        name,
        whatsapp,
        utr,
        amount,
        deviceId,
        telegramFileId
      } = req.body;

      if (
        !name ||
        !String(name).trim()
      ) {
        return res.status(400).json({
          ok: false,
          error:
            "Student name is required."
        });
      }

      if (
        !whatsapp ||
        !String(whatsapp).trim()
      ) {
        return res.status(400).json({
          ok: false,
          error:
            "WhatsApp number is required."
        });
      }

      if (
        !utr ||
        !String(utr).trim()
      ) {
        return res.status(400).json({
          ok: false,
          error:
            "UTR / Transaction ID is required."
        });
      }

      if (!telegramFileId) {
        return res.status(400).json({
          ok: false,
          error:
            "Payment screenshot is missing."
        });
      }

      /*
        Frontend field name is telegramFileId,
        but actual value is uploadId.
      */

      const uploadId =
        String(telegramFileId).trim();

      const uploadData =
        await firebase(
          "GET",
          `hrryKeyUploads/${uploadId}`
        );

      if (!uploadData) {
        return res.status(404).json({
          ok: false,
          error:
            "Screenshot upload not found."
        });
      }

      if (uploadData.used) {
        return res.status(400).json({
          ok: false,
          error:
            "This screenshot has already been used."
        });
      }

      const requestId =
        generateRequestId();

      const request = {
        requestId,

        name:
          String(name).trim(),

        whatsapp:
          cleanPhone(whatsapp),

        utr:
          String(utr).trim(),

        amount:
          Number(amount) || 20,

        deviceId:
          String(deviceId || "").trim(),

        uploadId,

        telegramChatId:
          String(
            uploadData.telegramChatId ||
            TELEGRAM_CHAT_ID
          ),

        telegramMessageId:
          uploadData.telegramMessageId,

        telegramFileId:
          uploadData.telegramFileId ||
          null,

        status: "pending",

        key: null,

        createdAt:
          nowISO(),

        createdAtReadable:
          readableTime(),

        actionTime: null,

        acceptedAt: null,

        rejectedAt: null
      };

      await firebase(
        "PUT",
        `hrryKeyRequests/${requestId}`,
        request
      );

      await firebase(
        "PATCH",
        `hrryKeyUploads/${uploadId}`,
        {
          used: true,
          requestId
        }
      );

      await editTelegramMessage(
        request.telegramChatId,
        request.telegramMessageId,
        pendingCaption(request),
        pendingKeyboard(requestId)
      );

      console.log(
        "🔘 ACCEPT / REJECT BUTTONS ADDED:",
        requestId
      );

      return res.json({
        ok: true,
        requestId,
        status: "pending"
      });

    } catch (error) {
      console.error(
        "❌ Key request error:",
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          error.message ||
          "Key request failed."
      });
    }
  }
);

/* =========================================================
   GET REQUEST
========================================================= */

app.get(
  "/api/key-request/:id",
  async (req, res) => {
    try {
      const request =
        await firebase(
          "GET",
          `hrryKeyRequests/${req.params.id}`
        );

      if (!request) {
        return res.status(404).json({
          ok: false,
          error:
            "Request not found."
        });
      }

      return res.json({
        ok: true,
        request
      });

    } catch (error) {
      console.error(error);

      return res.status(500).json({
        ok: false,
        error: error.message
      });
    }
  }
);

/* =========================================================
   HISTORY BY DEVICE
========================================================= */

app.get(
  "/api/key-requests/device/:deviceId",
  async (req, res) => {
    try {
      const all =
        await firebase(
          "GET",
          "hrryKeyRequests"
        );

      if (!all) {
        return res.json({
          ok: true,
          requests: []
        });
      }

      const deviceId =
        String(req.params.deviceId);

      const requests =
        Object.values(all)
          .filter(
            item =>
              String(
                item.deviceId || ""
              ) === deviceId
          )
          .sort(
            (a, b) =>
              new Date(b.createdAt) -
              new Date(a.createdAt)
          );

      return res.json({
        ok: true,
        requests
      });

    } catch (error) {
      console.error(error);

      return res.status(500).json({
        ok: false,
        error: error.message
      });
    }
  }
);

/* =========================================================
   ACCEPT REQUEST
========================================================= */

async function acceptRequest(
  requestId,
  callbackQueryId
) {
  const request =
    await firebase(
      "GET",
      `hrryKeyRequests/${requestId}`
    );

  if (!request) {
    await answerCallback(
      callbackQueryId,
      "❌ Request not found.",
      true
    );
    return;
  }

  if (request.status !== "pending") {
    await answerCallback(
      callbackQueryId,
      `Already ${String(
        request.status
      ).toUpperCase()}.`,
      true
    );
    return;
  }

  /* -----------------------------------------------
     GENERATE UNIQUE KEY
  ------------------------------------------------ */

  let key = generateKey();

  let unique = false;

  for (let i = 0; i < 10; i++) {
    const exists =
      await firebase(
        "GET",
        `licenseKeys/${encodeURIComponent(key)}`
      );

    if (!exists) {
      unique = true;
      break;
    }

    key = generateKey();
  }

  if (!unique) {
    throw new Error(
      "Could not generate a unique license key."
    );
  }

  const actionTime =
    readableTime();

  /* -----------------------------------------------
     SAVE KEY IN EXISTING HRRY TEST APP SYSTEM
  ------------------------------------------------ */

  const licenseData = {
    appName: "hrry.test",

    status: "active",

    blocked: false,

    used: false,

    boundDeviceId: null,

    usedAt: null,

    createdAt: Date.now(),

    lastVerifiedAt: null
  };

  /*
    THIS IS THE IMPORTANT PART.

    The existing HRRY test app checks:

      licenseKeys/{key}

    and expects:

      appName = hrry.test
      status = active
      blocked != true
      unused/unbound key

    So we save exactly that structure.
  */

  await firebase(
    "PUT",
    `licenseKeys/${encodeURIComponent(key)}`,
    licenseData
  );

  /* -----------------------------------------------
     UPDATE REQUEST
  ------------------------------------------------ */

  const update = {
    status: "accepted",

    key,

    acceptedAt:
      nowISO(),

    actionTime
  };

  await firebase(
    "PATCH",
    `hrryKeyRequests/${requestId}`,
    update
  );

  const finalRequest = {
    ...request,
    ...update
  };

  /* -----------------------------------------------
     UPDATE SAME TELEGRAM MESSAGE
  ------------------------------------------------ */

  await editTelegramMessage(
    request.telegramChatId,
    request.telegramMessageId,
    acceptedCaption(finalRequest),
    acceptedKeyboard(requestId)
  );

  await answerCallback(
    callbackQueryId,
    "✅ ACCEPTED — KEY GENERATED",
    false
  );

  console.log(
    "================================"
  );

  console.log(
    "✅ PAYMENT ACCEPTED"
  );

  console.log(
    "Request:",
    requestId
  );

  console.log(
    "Key:",
    key
  );

  console.log(
    "Student:",
    request.name
  );

  console.log(
    "Firebase path:",
    `licenseKeys/${key}`
  );

  console.log(
    "================================"
  );
}

/* =========================================================
   REJECT REQUEST
========================================================= */

async function rejectRequest(
  requestId,
  callbackQueryId
) {
  const request =
    await firebase(
      "GET",
      `hrryKeyRequests/${requestId}`
    );

  if (!request) {
    await answerCallback(
      callbackQueryId,
      "❌ Request not found.",
      true
    );
    return;
  }

  if (request.status !== "pending") {
    await answerCallback(
      callbackQueryId,
      `Already ${String(
        request.status
      ).toUpperCase()}.`,
      true
    );
    return;
  }

  const actionTime =
    readableTime();

  const update = {
    status: "rejected",

    key: null,

    rejectedAt:
      nowISO(),

    actionTime
  };

  await firebase(
    "PATCH",
    `hrryKeyRequests/${requestId}`,
    update
  );

  const finalRequest = {
    ...request,
    ...update
  };

  await editTelegramMessage(
    request.telegramChatId,
    request.telegramMessageId,
    rejectedCaption(finalRequest),
    rejectedKeyboard(requestId)
  );

  await answerCallback(
    callbackQueryId,
    "❌ REQUEST REJECTED",
    false
  );

  console.log(
    "================================"
  );

  console.log(
    "❌ PAYMENT REJECTED"
  );

  console.log(
    "Request:",
    requestId
  );

  console.log(
    "Student:",
    request.name
  );

  console.log(
    "================================"
  );
}

/* =========================================================
   ANSWER CALLBACK
========================================================= */

async function answerCallback(
  callbackQueryId,
  text,
  showAlert
) {
  try {
    await telegram(
      "answerCallbackQuery",
      {
        callback_query_id:
          callbackQueryId,

        text,

        show_alert:
          !!showAlert
      }
    );
  } catch (error) {
    console.error(
      "Callback answer error:",
      error.message
    );
  }
}

/* =========================================================
   CALLBACK HANDLER
========================================================= */

async function handleCallback(callback) {
  const callbackId =
    callback.id;

  const fromId =
    String(
      callback.from?.id || ""
    );

  const data =
    String(
      callback.data || ""
    );

  console.log(
    "--------------------------------"
  );

  console.log(
    "🔘 TELEGRAM CALLBACK RECEIVED"
  );

  console.log(
    "Admin/User ID:",
    fromId
  );

  console.log(
    "Callback:",
    data
  );

  console.log(
    "Expected Admin:",
    ADMIN_TELEGRAM_ID
  );

  console.log(
    "--------------------------------"
  );

  /* -----------------------------------------------
     ADMIN SECURITY
  ------------------------------------------------ */

  if (
    fromId !==
    ADMIN_TELEGRAM_ID
  ) {
    console.log(
      "❌ UNAUTHORIZED CALLBACK:",
      fromId
    );

    await answerCallback(
      callbackId,
      "❌ You are not authorized as admin.",
      true
    );

    return;
  }

  /* -----------------------------------------------
     ACCEPT
  ------------------------------------------------ */

  if (
    data.startsWith("accept:")
  ) {
    const requestId =
      data.substring(
        "accept:".length
      );

    try {
      await acceptRequest(
        requestId,
        callbackId
      );
    } catch (error) {
      console.error(
        "❌ ACCEPT ERROR:",
        error
      );

      await answerCallback(
        callbackId,
        "❌ Accept failed. Check Render logs.",
        true
      );
    }

    return;
  }

  /* -----------------------------------------------
     REJECT
  ------------------------------------------------ */

  if (
    data.startsWith("reject:")
  ) {
    const requestId =
      data.substring(
        "reject:".length
      );

    try {
      await rejectRequest(
        requestId,
        callbackId
      );
    } catch (error) {
      console.error(
        "❌ REJECT ERROR:",
        error
      );

      await answerCallback(
        callbackId,
        "❌ Reject failed. Check Render logs.",
        true
      );
    }

    return;
  }

  /* -----------------------------------------------
     STATUS BUTTON
  ------------------------------------------------ */

  if (
    data.startsWith(
      "status:accepted:"
    )
  ) {
    await answerCallback(
      callbackId,
      "🟢 Already accepted by admin.",
      false
    );

    return;
  }

  if (
    data.startsWith(
      "status:rejected:"
    )
  ) {
    await answerCallback(
      callbackId,
      "🔴 Already rejected by admin.",
      false
    );

    return;
  }

  await answerCallback(
    callbackId,
    "Unknown action.",
    false
  );
}

/* =========================================================
   TELEGRAM POLLING
========================================================= */

let pollingOffset = 0;

let pollingRunning = false;

async function prepareTelegram() {
  try {
    const result =
      await telegram(
        "deleteWebhook",
        {
          drop_pending_updates:
            false
        }
      );

    console.log(
      "🧹 Telegram webhook removed:",
      result
    );

  } catch (error) {
    console.error(
      "❌ deleteWebhook error:",
      error.message
    );
  }
}

/* =========================================================
   POLLING LOOP
========================================================= */

async function telegramPolling() {
  if (pollingRunning) {
    return;
  }

  pollingRunning = true;

  console.log(
    "🤖 TELEGRAM CALLBACK POLLING STARTED"
  );

  while (pollingRunning) {
    try {
      const url =
        TELEGRAM_API +
        "/getUpdates?timeout=30" +
        "&offset=" +
        encodeURIComponent(
          pollingOffset
        ) +
        "&allowed_updates=" +
        encodeURIComponent(
          JSON.stringify([
            "callback_query"
          ])
        );

      const response =
        await fetch(
          url,
          {
            method: "GET",

            signal:
              AbortSignal.timeout(
                40000
              )
          }
        );

      const data =
        await response.json();

      if (!data.ok) {
        console.error(
          "❌ Telegram getUpdates:",
          data
        );

        if (
          data.error_code === 409
        ) {
          console.error(
            "🚨 TELEGRAM 409 CONFLICT"
          );

          console.error(
            "Another server is polling this bot."
          );

          console.error(
            "Keep only ONE Render instance."
          );

          await new Promise(
            resolve =>
              setTimeout(
                resolve,
                5000
              )
          );
        }

        continue;
      }

      const updates =
        data.result || [];

      for (
        const update
        of updates
      ) {
        /*
          Advance offset before processing
          to prevent duplicate callbacks.
        */

        pollingOffset =
          update.update_id + 1;

        if (
          update.callback_query
        ) {
          await handleCallback(
            update.callback_query
          );
        }
      }

    } catch (error) {
      console.error(
        "❌ Telegram polling error:",
        error.message
      );

      await new Promise(
        resolve =>
          setTimeout(
            resolve,
            2500
          )
      );
    }
  }
}

/* =========================================================
   GENERAL ERROR
========================================================= */

app.use(
  (
    error,
    req,
    res,
    next
  ) => {
    console.error(
      "❌ SERVER ERROR:",
      error
    );

    if (
      error.code ===
      "LIMIT_FILE_SIZE"
    ) {
      return res
        .status(400)
        .json({
          ok: false,
          error:
            "Screenshot must be 5 MB or smaller."
        });
    }

    return res
      .status(500)
      .json({
        ok: false,
        error:
          error.message ||
          "Internal server error."
      });
  }
);

/* =========================================================
   START
========================================================= */

app.listen(
  PORT,
  "0.0.0.0",
  async () => {
    console.log(
      "======================================"
    );

    console.log(
      `🚀 ${APP_NAME} SERVER ONLINE`
    );

    console.log(
      `🌐 PORT: ${PORT}`
    );

    console.log(
      `📢 TELEGRAM CHAT: ${TELEGRAM_CHAT_ID}`
    );

    console.log(
      `👑 ADMIN TELEGRAM ID: ${ADMIN_TELEGRAM_ID}`
    );

    console.log(
      "💰 PAYMENT: ₹20"
    );

    console.log(
      "🔘 ACCEPT / REJECT CALLBACK: ENABLED"
    );

    console.log(
      "🔑 LICENSE KEY SAVE: ENABLED"
    );

    console.log(
      "======================================"
    );

    /*
      Telegram webhook हटाकर
      polling शुरू किया जाएगा.
    */

    await prepareTelegram();

    telegramPolling();
  }
);
