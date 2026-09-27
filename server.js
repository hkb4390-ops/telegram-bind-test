require("dotenv").config();

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const crypto = require("crypto");
const TelegramBot = require("node-telegram-bot-api");

const app = express();

/* =========================================================
   CONFIG
========================================================= */

const PORT = process.env.PORT || 3000;

const BOT_TOKEN = process.env.BOT_TOKEN;

const TELEGRAM_CHAT_ID =
  process.env.TELEGRAM_CHAT_ID || "-1004330203694";

const ADMIN_TELEGRAM_ID =
  String(process.env.ADMIN_TELEGRAM_ID || "8458244469");

const FIREBASE_DATABASE_URL =
  process.env.FIREBASE_DATABASE_URL ||
  "https://hyuuu-732f9-default-rtdb.firebaseio.com";

const FIREBASE_AUTH_TOKEN =
  process.env.FIREBASE_AUTH_TOKEN || "";

const APP_NAME =
  process.env.APP_NAME || "hrry.test";

if (!BOT_TOKEN) {
  console.error("❌ BOT_TOKEN is missing");
  process.exit(1);
}

/* =========================================================
   EXPRESS
========================================================= */

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PATCH", "PUT", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

/* =========================================================
   MULTER
   Maximum screenshot size = 5 MB
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
        new Error("Only JPG, PNG and WEBP images are allowed.")
      );
    }

    cb(null, true);
  }
});

/* =========================================================
   TELEGRAM BOT
========================================================= */

const bot = new TelegramBot(BOT_TOKEN, {
  polling: true
});

console.log("🤖 Telegram bot started");

/* =========================================================
   FIREBASE REST HELPERS
========================================================= */

function firebaseUrl(path) {
  let url =
    FIREBASE_DATABASE_URL.replace(/\/$/, "") +
    "/" +
    path.replace(/^\/+/, "") +
    ".json";

  if (FIREBASE_AUTH_TOKEN) {
    url += "?auth=" + encodeURIComponent(FIREBASE_AUTH_TOKEN);
  }

  return url;
}

async function firebaseRequest(
  method,
  path,
  body = undefined
) {
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
    firebaseUrl(path),
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
      `Firebase ${method} ${path} failed: ${response.status} ${text}`
    );
  }

  return data;
}

/* =========================================================
   HELPERS
========================================================= */

function nowISO() {
  return new Date().toISOString();
}

function readableTime(date = new Date()) {
  return new Intl.DateTimeFormat(
    "en-IN",
    {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    }
  ).format(date);
}

function generateRequestId() {
  return (
    "REQ-" +
    Date.now().toString(36).toUpperCase() +
    "-" +
    crypto.randomBytes(4).toString("hex").toUpperCase()
  );
}

function generateKey() {
  const a = crypto
    .randomBytes(3)
    .toString("hex")
    .toUpperCase();

  const b = crypto
    .randomBytes(3)
    .toString("hex")
    .toUpperCase();

  const c = crypto
    .randomBytes(3)
    .toString("hex")
    .toUpperCase();

  return `HRRY-${a}-${b}-${c}`;
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

/* =========================================================
   TELEGRAM MESSAGE CAPTION
========================================================= */

function buildPendingCaption(request) {
  return `
<b>💳 PAYMENT KEY REQUEST RECEIVED</b>

━━━━━━━━━━━━━━━━━━━━

👤 <b>Student Name:</b>
${escapeHTML(request.name)}

📱 <b>WhatsApp Number:</b>
${escapeHTML(request.whatsapp)}

💰 <b>Payment Amount:</b>
₹${escapeHTML(request.amount)}

🔢 <b>UTR / Transaction ID:</b>
<code>${escapeHTML(request.utr)}</code>

🆔 <b>Request ID:</b>
<code>${escapeHTML(request.requestId)}</code>

📅 <b>Time:</b>
${escapeHTML(request.createdAtReadable)}

━━━━━━━━━━━━━━━━━━━━

⏳ <b>Status:</b> 🟡 WAITING FOR ADMIN ACTION

👇 <b>Choose an action:</b>
`.trim();
}

/* =========================================================
   ACCEPTED MESSAGE
========================================================= */

function buildAcceptedCaption(request) {
  return `
<b>💳 PAYMENT KEY REQUEST</b>

━━━━━━━━━━━━━━━━━━━━

👤 <b>Student Name:</b>
${escapeHTML(request.name)}

📱 <b>WhatsApp Number:</b>
${escapeHTML(request.whatsapp)}

💰 <b>Payment Amount:</b>
₹${escapeHTML(request.amount)}

🔢 <b>UTR / Transaction ID:</b>
<code>${escapeHTML(request.utr)}</code>

🆔 <b>Request ID:</b>
<code>${escapeHTML(request.requestId)}</code>

━━━━━━━━━━━━━━━━━━━━

🟢 <b>STATUS: ACCEPTED</b>

🔑 <b>Generated Key:</b>
<code>${escapeHTML(request.key)}</code>

👤 <b>Accepted By Admin</b>

🕐 <b>Action Time:</b>
${escapeHTML(request.actionTime)}

━━━━━━━━━━━━━━━━━━━━

✅ <b>KEY GENERATED SUCCESSFULLY</b>
`.trim();
}

/* =========================================================
   REJECTED MESSAGE
========================================================= */

function buildRejectedCaption(request) {
  return `
<b>💳 PAYMENT KEY REQUEST</b>

━━━━━━━━━━━━━━━━━━━━

👤 <b>Student Name:</b>
${escapeHTML(request.name)}

📱 <b>WhatsApp Number:</b>
${escapeHTML(request.whatsapp)}

💰 <b>Payment Amount:</b>
₹${escapeHTML(request.amount)}

🔢 <b>UTR / Transaction ID:</b>
<code>${escapeHTML(request.utr)}</code>

🆔 <b>Request ID:</b>
<code>${escapeHTML(request.requestId)}</code>

━━━━━━━━━━━━━━━━━━━━

🔴 <b>STATUS: REJECTED</b>

❌ <b>REJECTED BY ADMIN ON TELEGRAM</b>

🕐 <b>Action Time:</b>
${escapeHTML(request.actionTime)}

━━━━━━━━━━━━━━━━━━━━

❌ <b>REQUEST REJECTED</b>
`.trim();
}

/* =========================================================
   INLINE BUTTONS
========================================================= */

function pendingButtons(requestId) {
  return {
    inline_keyboard: [
      [
        {
          text: "✅ ACCEPT",
          callback_data: `accept:${requestId}`
        },
        {
          text: "❌ REJECT",
          callback_data: `reject:${requestId}`
        }
      ]
    ]
  };
}

/* =========================================================
   HOME / HEALTH
========================================================= */

app.get("/", (req, res) => {
  res.send(`
    <html>
      <head>
        <title>${APP_NAME}</title>
      </head>
      <body style="font-family:Arial;background:#111;color:white;text-align:center;padding:50px">
        <h1>HRRY KEY SERVER</h1>
        <p>Telegram bot is running.</p>
        <p>Server: ONLINE ✅</p>
      </body>
    </html>
  `);
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    server: "online",
    bot: "online",
    app: APP_NAME,
    time: nowISO()
  });
});

/* =========================================================
   UPLOAD PAYMENT SCREENSHOT
========================================================= */

app.post(
  "/api/upload-screenshot",
  upload.single("screenshot"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          ok: false,
          error: "Payment screenshot is required."
        });
      }

      console.log(
        "📸 Screenshot received:",
        req.file.originalname,
        req.file.size
      );

      /*
        Temporary upload ID.
        IMPORTANT:
        Frontend must send this uploadId later
        when creating the key request.
      */

      const uploadId = crypto.randomUUID();

      /*
        Send screenshot to Telegram first.
      */

      const telegramMessage =
        await bot.sendPhoto(
          TELEGRAM_CHAT_ID,
          req.file.buffer,
          {
            caption: `
<b>📸 Payment Screenshot Received</b>

⏳ <b>Waiting for student details...</b>

🆔 <code>${uploadId}</code>
`.trim(),
            parse_mode: "HTML"
          },
          {
            filename:
              req.file.originalname || "payment.jpg",
            contentType:
              req.file.mimetype
          }
        );

      /*
        Save upload information in Firebase.
      */

      await firebaseRequest(
        "PUT",
        `hrryKeyUploads/${uploadId}`,
        {
          uploadId,

          telegramChatId:
            String(TELEGRAM_CHAT_ID),

          telegramMessageId:
            telegramMessage.message_id,

          telegramFileId:
            telegramMessage.photo?.[
              telegramMessage.photo.length - 1
            ]?.file_id || null,

          originalName:
            req.file.originalname,

          mimeType:
            req.file.mimetype,

          size:
            req.file.size,

          used: false,

          createdAt: nowISO()
        }
      );

      console.log(
        "✅ Screenshot saved:",
        uploadId
      );

      return res.json({
        ok: true,
        uploadId,

        telegramMessageId:
          telegramMessage.message_id,

        message:
          "Screenshot uploaded successfully."
      });

    } catch (error) {
      console.error(
        "❌ Screenshot upload error:",
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

      /*
        telegramFileId here is actually uploadId.
        We keep the old field name so the existing
        frontend does not break.
      */

      if (!name || !String(name).trim()) {
        return res.status(400).json({
          ok: false,
          error: "Student name is required."
        });
      }

      if (!whatsapp || !String(whatsapp).trim()) {
        return res.status(400).json({
          ok: false,
          error: "WhatsApp number is required."
        });
      }

      if (!utr || !String(utr).trim()) {
        return res.status(400).json({
          ok: false,
          error: "UTR / Transaction ID is required."
        });
      }

      if (!telegramFileId) {
        return res.status(400).json({
          ok: false,
          error:
            "Payment screenshot upload is missing."
        });
      }

      /*
        Telegram ID is intentionally NOT required.
      */

      const uploadId =
        String(telegramFileId).trim();

      /*
        Get screenshot upload record.
      */

      const uploadData =
        await firebaseRequest(
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

      /*
        Create request ID.
      */

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

        status:
          "pending",

        key:
          null,

        createdAt:
          nowISO(),

        createdAtReadable:
          readableTime(),

        acceptedAt:
          null,

        rejectedAt:
          null,

        actionTime:
          null
      };

      /*
        Save request first.
      */

      await firebaseRequest(
        "PUT",
        `hrryKeyRequests/${requestId}`,
        request
      );

      /*
        Mark screenshot as used.
      */

      await firebaseRequest(
        "PATCH",
        `hrryKeyUploads/${uploadId}`,
        {
          used: true,
          requestId
        }
      );

      /*
        IMPORTANT:
        EDIT THE SAME TELEGRAM PHOTO MESSAGE.
        This is what makes ACCEPT + REJECT
        appear below the screenshot.
      */

      try {
        await bot.editMessageCaption(
          buildPendingCaption(request),
          {
            chat_id:
              request.telegramChatId,

            message_id:
              request.telegramMessageId,

            parse_mode:
              "HTML",

            reply_markup:
              pendingButtons(requestId)
          }
        );

        console.log(
          "✅ Telegram message updated with ACCEPT/REJECT:",
          requestId
        );

      } catch (telegramEditError) {
        console.error(
          "❌ Telegram message edit failed:",
          telegramEditError.response?.body ||
          telegramEditError.message
        );

        /*
          Do NOT delete the Firebase request.
          Return the request so the frontend can still track it.
        */
      }

      return res.json({
        ok: true,

        requestId,

        status:
          "pending",

        message:
          "Request submitted successfully."
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
   GET REQUEST STATUS
========================================================= */

app.get(
  "/api/key-request/:id",
  async (req, res) => {
    try {
      const request =
        await firebaseRequest(
          "GET",
          `hrryKeyRequests/${req.params.id}`
        );

      if (!request) {
        return res.status(404).json({
          ok: false,
          error: "Request not found."
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
        error:
          error.message ||
          "Could not get request."
      });
    }
  }
);

/* =========================================================
   GET REQUEST HISTORY BY DEVICE
========================================================= */

app.get(
  "/api/key-requests/device/:deviceId",
  async (req, res) => {
    try {
      const all =
        await firebaseRequest(
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
              String(item.deviceId || "") ===
              deviceId
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
        error:
          error.message ||
          "Could not load history."
      });
    }
  }
);

/* =========================================================
   TELEGRAM ACCEPT / REJECT CALLBACK
========================================================= */

bot.on(
  "callback_query",
  async callbackQuery => {

    const callbackId =
      callbackQuery.id;

    const fromId =
      String(
        callbackQuery.from?.id || ""
      );

    const data =
      String(
        callbackQuery.data || ""
      );

    console.log(
      "🔘 Telegram button clicked:",
      {
        fromId,
        data
      }
    );

    /*
      Only configured admin can press buttons.
    */

    if (
      fromId !==
      String(ADMIN_TELEGRAM_ID)
    ) {
      try {
        await bot.answerCallbackQuery(
          callbackId,
          {
            text:
              "❌ You are not authorized.",
            show_alert: true
          }
        );
      } catch {}

      return;
    }

    /*
      Validate callback format.
    */

    const match =
      data.match(
        /^(accept|reject):(.+)$/
      );

    if (!match) {
      try {
        await bot.answerCallbackQuery(
          callbackId,
          {
            text:
              "Invalid action."
          }
        );
      } catch {}

      return;
    }

    const action =
      match[1];

    const requestId =
      match[2];

    try {

      /*
        Get request.
      */

      const request =
        await firebaseRequest(
          "GET",
          `hrryKeyRequests/${requestId}`
        );

      if (!request) {

        await bot.answerCallbackQuery(
          callbackId,
          {
            text:
              "❌ Request not found.",
            show_alert: true
          }
        );

        return;
      }

      /*
        Prevent double processing.
      */

      if (
        request.status !==
        "pending"
      ) {

        await bot.answerCallbackQuery(
          callbackId,
          {
            text:
              `Already ${String(
                request.status
              ).toUpperCase()}.`,
            show_alert: true
          }
        );

        return;
      }

      const actionTime =
        readableTime();

      /* =====================================================
         ACCEPT
      ===================================================== */

      if (action === "accept") {

        const key =
          generateKey();

        const updated = {
          status:
            "accepted",

          key,

          acceptedAt:
            nowISO(),

          actionTime
        };

        /*
          Save accepted state.
        */

        await firebaseRequest(
          "PATCH",
          `hrryKeyRequests/${requestId}`,
          updated
        );

        /*
          Merge for Telegram caption.
        */

        const acceptedRequest = {
          ...request,
          ...updated
        };

        /*
          Remove buttons and update
          the SAME screenshot message.
        */

        try {

          await bot.editMessageCaption(
            buildAcceptedCaption(
              acceptedRequest
            ),
            {
              chat_id:
                request.telegramChatId,

              message_id:
                request.telegramMessageId,

              parse_mode:
                "HTML",

              reply_markup: {
                inline_keyboard: []
              }
            }
          );

        } catch (editError) {

          console.error(
            "❌ ACCEPT message update failed:",
            editError.response?.body ||
            editError.message
          );
        }

        /*
          Telegram popup.
        */

        await bot.answerCallbackQuery(
          callbackId,
          {
            text:
              "✅ Accepted! Key generated.",
            show_alert: true
          }
        );

        /*
          Optional private confirmation
          to admin.
        */

        try {

          await bot.sendMessage(
            ADMIN_TELEGRAM_ID,
            `
✅ <b>REQUEST ACCEPTED</b>

👤 ${escapeHTML(request.name)}

📱 ${escapeHTML(request.whatsapp)}

💰 ₹${escapeHTML(request.amount)}

🔑 <code>${escapeHTML(key)}</code>

🆔 <code>${escapeHTML(requestId)}</code>
`.trim(),
            {
              parse_mode: "HTML"
            }
          );

        } catch (dmError) {
          console.log(
            "Admin DM skipped:",
            dmError.message
          );
        }

        console.log(
          "✅ REQUEST ACCEPTED:",
          requestId,
          key
        );

        return;
      }

      /* =====================================================
         REJECT
      ===================================================== */

      if (action === "reject") {

        const updated = {

          status:
            "rejected",

          key:
            null,

          rejectedAt:
            nowISO(),

          actionTime
        };

        /*
          Save rejected state.
        */

        await firebaseRequest(
          "PATCH",
          `hrryKeyRequests/${requestId}`,
          updated
        );

        /*
          Merge for Telegram caption.
        */

        const rejectedRequest = {
          ...request,
          ...updated
        };

        /*
          Update SAME Telegram screenshot
          message and remove buttons.
        */

        try {

          await bot.editMessageCaption(
            buildRejectedCaption(
              rejectedRequest
            ),
            {
              chat_id:
                request.telegramChatId,

              message_id:
                request.telegramMessageId,

              parse_mode:
                "HTML",

              reply_markup: {
                inline_keyboard: []
              }
            }
          );

        } catch (editError) {

          console.error(
            "❌ REJECT message update failed:",
            editError.response?.body ||
            editError.message
          );
        }

        /*
          Telegram popup.
        */

        await bot.answerCallbackQuery(
          callbackId,
          {
            text:
              "❌ Request rejected.",
            show_alert: true
          }
        );

        console.log(
          "❌ REQUEST REJECTED:",
          requestId
        );

        return;
      }

    } catch (error) {

      console.error(
        "❌ Callback processing error:",
        error
      );

      try {

        await bot.answerCallbackQuery(
          callbackId,
          {
            text:
              "❌ Server error. Please try again.",
            show_alert: true
          }
        );

      } catch {}
    }
  }
);

/* =========================================================
   TELEGRAM POLLING ERROR
========================================================= */

bot.on(
  "polling_error",
  error => {
    console.error(
      "Telegram polling error:",
      error.code,
      error.message
    );
  }
);

/* =========================================================
   MULTER / GENERAL ERROR HANDLER
========================================================= */

app.use(
  (error, req, res, next) => {

    console.error(
      "❌ Server error:",
      error
    );

    if (
      error.code ===
      "LIMIT_FILE_SIZE"
    ) {
      return res.status(400).json({
        ok: false,
        error:
          "Screenshot must be 5 MB or smaller."
      });
    }

    return res.status(500).json({
      ok: false,
      error:
        error.message ||
        "Internal server error."
    });
  }
);

/* =========================================================
   START SERVER
========================================================= */

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    );

    console.log(
      `🚀 ${APP_NAME} SERVER ONLINE`
    );

    console.log(
      `🌐 PORT: ${PORT}`
    );

    console.log(
      `🤖 TELEGRAM CHAT: ${TELEGRAM_CHAT_ID}`
    );

    console.log(
      `👑 ADMIN ID: ${ADMIN_TELEGRAM_ID}`
    );

    console.log(
      "💳 Payment amount: ₹20"
    );

    console.log(
      "🔘 ACCEPT / REJECT: ENABLED"
    );

    console.log(
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    );
  }
);
