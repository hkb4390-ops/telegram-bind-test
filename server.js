require("dotenv").config();

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const crypto = require("crypto");

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

const APP_NAME = "hrry.test";

const MAX_SCREENSHOT_SIZE = 5 * 1024 * 1024;
const BINDING_TTL = 10 * 60 * 1000;
const SESSION_TTL = 180 * 24 * 60 * 60 * 1000;

app.use(cors({ origin: true, credentials: false }));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_SCREENSHOT_SIZE
  },
  fileFilter: (req, file, cb) => {
    const allowed = [
      "image/jpeg",
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
   HELPERS
========================================================= */

function randomToken(bytes = 32) {
  return crypto
    .randomBytes(bytes)
    .toString("hex");
}

function now() {
  return Date.now();
}

function cleanString(value, max = 500) {
  return String(value == null ? "" : value)
    .trim()
    .slice(0, max);
}

function cleanTelegramName(messageFrom) {

  const first =
    cleanString(
      messageFrom?.first_name,
      100
    );

  const last =
    cleanString(
      messageFrom?.last_name,
      100
    );

  const full =
    `${first} ${last}`.trim();

  return (
    full ||
    cleanString(
      messageFrom?.username,
      100
    ) ||
    "Telegram User"
  );
}

function escapeHtml(value) {

  return String(
    value == null ? "" : value
  )
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function firebaseUrl(path) {

  let url =
    FIREBASE_DATABASE_URL +
    "/" +
    String(path)
      .split("/")
      .map(
        part =>
          encodeURIComponent(part)
      )
      .join("/") +
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

async function firebaseRequest(
  method,
  path,
  body
) {

  const response =
    await fetch(
      firebaseUrl(path),
      {
        method,

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          method === "GET" ||
          method === "DELETE"
            ? undefined
            : JSON.stringify(body)
      }
    );

  const text =
    await response.text();

  let data = null;

  try {

    data =
      text
        ? JSON.parse(text)
        : null;

  } catch (_) {

    data = text;
  }

  if (!response.ok) {

    const error =
      new Error(
        data?.error ||
        `Firebase request failed (${response.status})`
      );

    error.status =
      response.status;

    throw error;
  }

  return data;
}

async function firebaseGet(path) {
  return firebaseRequest(
    "GET",
    path
  );
}

async function firebasePut(
  path,
  data
) {
  return firebaseRequest(
    "PUT",
    path,
    data
  );
}

async function firebasePatch(
  path,
  data
) {
  return firebaseRequest(
    "PATCH",
    path,
    data
  );
}

async function firebaseDelete(path) {
  return firebaseRequest(
    "DELETE",
    path
  );
}


/* =========================================================
   PREVENT DUPLICATE PENDING REQUEST
========================================================= */

async function findPendingRequest(
  telegramId
) {

  if (!telegramId) {
    return null;
  }

  const all =
    await firebaseGet(
      "hrryKeyRequests"
    );

  const id =
    String(telegramId);

  const pending =
    Object.values(
      all || {}
    )
      .filter(
        item =>
          String(
            item?.telegramId || ""
          ) === id &&
          String(
            item?.status || ""
          ) === "pending"
      )
      .sort(
        (a, b) =>
          Number(
            b.createdAt || 0
          ) -
          Number(
            a.createdAt || 0
          )
      );

  return pending[0] || null;
}


/* =========================================================
   TELEGRAM API
========================================================= */

async function telegram(
  method,
  params = {}
) {

  if (!BOT_TOKEN) {
    throw new Error(
      "BOT_TOKEN is missing."
    );
  }

  const response =
    await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/${method}`,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify(params)
      }
    );

  const data =
    await response.json();

  if (!data.ok) {

    const error =
      new Error(
        data.description ||
        `Telegram API error in ${method}`
      );

    error.telegram = data;

    throw error;
  }

  return data.result;
}

async function sendTelegramMessage(
  chatId,
  text,
  extra = {}
) {

  return telegram(
    "sendMessage",
    {
      chat_id: chatId,
      text,
      ...extra
    }
  );
}

async function editTelegramMessageCaption(
  chatId,
  messageId,
  caption,
  extra = {}
) {

  return telegram(
    "editMessageCaption",
    {
      chat_id: chatId,
      message_id: messageId,
      caption,
      ...extra
    }
  );
}

async function sendTelegramPhoto(
  chatId,
  buffer,
  filename,
  mimeType,
  caption = ""
) {

  const form =
    new FormData();

  form.append(
    "chat_id",
    String(chatId)
  );

  if (caption) {

    form.append(
      "caption",
      caption
    );
  }

  const blob =
    new Blob(
      [buffer],
      {
        type:
          mimeType ||
          "image/jpeg"
      }
    );

  form.append(
    "photo",
    blob,
    filename ||
      "photo.jpg"
  );

  const response =
    await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`,
      {
        method: "POST",
        body: form
      }
    );

  const data =
    await response.json();

  if (!data.ok) {

    throw new Error(
      data.description ||
      "Telegram sendPhoto failed."
    );
  }

  return data.result;
}


/* =========================================================
   TELEGRAM PROFILE / PHOTO
========================================================= */

async function getTelegramProfile(
  telegramUser
) {

  const telegramId =
    String(
      telegramUser.id
    );

  let photoFileId = "";

  try {

    const photos =
      await telegram(
        "getUserProfilePhotos",
        {
          user_id:
            telegramUser.id,

          offset: 0,

          limit: 1
        }
      );

    if (
      photos &&
      Array.isArray(
        photos.photos
      ) &&
      photos.photos.length > 0
    ) {

      const firstSet =
        photos.photos[0];

      if (
        Array.isArray(
          firstSet
        ) &&
        firstSet.length > 0
      ) {

        const largest =
          firstSet[
            firstSet.length - 1
          ];

        photoFileId =
          largest?.file_id ||
          "";
      }
    }

  } catch (error) {

    console.warn(
      "Could not load Telegram profile photo:",
      error.message
    );
  }

  return {

    telegramId,

    username:
      cleanString(
        telegramUser.username,
        100
      ),

    name:
      cleanTelegramName(
        telegramUser
      ),

    photoFileId
  };
}

async function downloadTelegramFile(
  fileId
) {

  const file =
    await telegram(
      "getFile",
      {
        file_id: fileId
      }
    );

  if (!file?.file_path) {

    throw new Error(
      "Telegram file path not found."
    );
  }

  const response =
    await fetch(
      `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`
    );

  if (!response.ok) {

    throw new Error(
      "Could not download Telegram profile photo."
    );
  }

  return {

    buffer:
      Buffer.from(
        await response.arrayBuffer()
      ),

    mimeType:
      response.headers.get(
        "content-type"
      ) ||
      "image/jpeg",

    filePath:
      file.file_path
  };
}


/* =========================================================
   TELEGRAM BINDING
========================================================= */

async function createTelegramBinding() {

  const token =
    randomToken(24);

  const createdAt =
    now();

  const expiresAt =
    createdAt +
    BINDING_TTL;

  await firebasePut(
    `hrryTelegramBindings/${token}`,
    {
      appName:
        APP_NAME,

      status:
        "pending",

      createdAt,

      expiresAt,

      sessionToken:
        null,

      profile:
        null
    }
  );

  return {
    token,
    expiresAt
  };
}

async function createTelegramSession(
  profile
) {

  const sessionToken =
    randomToken(48);

  const createdAt =
    now();

  const expiresAt =
    createdAt +
    SESSION_TTL;

  await firebasePut(
    `hrryTelegramSessions/${sessionToken}`,
    {

      appName:
        APP_NAME,

      telegramId:
        String(
          profile.telegramId
        ),

      username:
        profile.username ||
        "",

      name:
        profile.name ||
        "Telegram User",

      photoFileId:
        profile.photoFileId ||
        "",

      createdAt,

      lastVerifiedAt:
        createdAt,

      expiresAt
    }
  );

  return {
    sessionToken,
    expiresAt
  };
}

async function getTelegramSession(
  sessionToken
) {

  if (!sessionToken) {
    return null;
  }

  const session =
    await firebaseGet(
      `hrryTelegramSessions/${encodeURIComponent(sessionToken)}`
    );

  if (!session) {
    return null;
  }

  if (
    session.expiresAt &&
    Number(
      session.expiresAt
    ) < now()
  ) {

    try {

      await firebaseDelete(
        `hrryTelegramSessions/${encodeURIComponent(sessionToken)}`
      );

    } catch (_) {}

    return null;
  }

  return session;
}

async function handleTelegramBindingMessage(
  message
) {

  if (!message) {
    return;
  }

  if (
    message.chat?.type !==
    "private"
  ) {
    return;
  }

  const text =
    String(
      message.text || ""
    )
    .trim();

  const match =
    text.match(
      /^\/start(?:@[^\s]+)?(?:[\s\n\r]+([^\s]+))?\s*$/i
    );

  if (!match) {
    return;
  }

  const payload =
    String(
      match[1] || ""
    )
    .trim();

  if (
    !/^bind_[A-Za-z0-9]+$/i.test(
      payload
    )
  ) {

    await sendTelegramMessage(
      message.chat.id,

      "👋 Telegram binding के लिए website से Connect Telegram दबाएँ."
    );

    return;
  }

  const bindToken =
    payload.slice(5);

  if (!bindToken) {
    return;
  }

  let binding;

  try {

    binding =
      await firebaseGet(
        `hrryTelegramBindings/${encodeURIComponent(bindToken)}`
      );

  } catch (error) {

    console.error(
      "Binding lookup error:",
      error
    );

    await sendTelegramMessage(
      message.chat.id,

      "❌ Binding server में temporary error आया है. कुछ देर बाद फिर कोशिश करें."
    );

    return;
  }

  if (!binding) {

    await sendTelegramMessage(
      message.chat.id,

      "❌ यह Telegram binding link valid नहीं है. Website से नया link बनाएँ."
    );

    return;
  }

  if (
    binding.status ===
    "verified"
  ) {

    await sendTelegramMessage(
      message.chat.id,

      "✅ यह binding पहले ही complete हो चुकी है. Website पर वापस जाएँ."
    );

    return;
  }

  if (
    binding.expiresAt &&
    Number(
      binding.expiresAt
    ) < now()
  ) {

    await firebasePatch(
      `hrryTelegramBindings/${encodeURIComponent(bindToken)}`,

      {
        status:
          "expired"
      }
    );

    await sendTelegramMessage(
      message.chat.id,

      "⏰ Binding link expire हो गया है. Website से फिर से Connect Telegram करें."
    );

    return;
  }

  try {

    const profile =
      await getTelegramProfile(
        message.from
      );

    const session =
      await createTelegramSession(
        profile
      );

    await firebasePatch(
      `hrryTelegramBindings/${encodeURIComponent(bindToken)}`,

      {
        status:
          "verified",

        verifiedAt:
          now(),

        telegramId:
          profile.telegramId,

        profile,

        sessionToken:
          session.sessionToken
      }
    );

    const usernameText =
      profile.username
        ? `@${profile.username}`
        : "No username";

    await sendTelegramMessage(
      message.chat.id,

      [
        "✅ Telegram binding successful!",
        "",
        `👤 Name: ${profile.name}`,
        `🔹 Username: ${usernameText}`,
        `🆔 Telegram ID: ${profile.telegramId}`,
        "",
        "अब website पर वापस जाएँ. Verification automatically complete हो जाएगी."
      ].join("\n")
    );

    console.log(
      "Telegram bound successfully:",
      profile.telegramId
    );

  } catch (error) {

    console.error(
      "Telegram binding error:",
      error
    );

    await sendTelegramMessage(
      message.chat.id,

      "❌ Telegram binding complete नहीं हो पाई. Please website से फिर try करें."
    );
  }
}


/* =========================================================
   BIND START
========================================================= */

app.post(
  "/api/telegram/bind-start",

  async (req, res) => {

    try {

      const binding =
        await createTelegramBinding();

      const bot =
        await telegram(
          "getMe"
        );

      const username =
        bot?.username;

      if (!username) {

        throw new Error(
          "Telegram bot username could not be detected."
        );
      }

      const startPayload =
        `bind_${binding.token}`;

      const botLink =
        `https://t.me/${username}?start=${encodeURIComponent(startPayload)}`;

      res.json({

        ok: true,

        token:
          binding.token,

        botLink,

        expiresAt:
          binding.expiresAt
      });

    } catch (error) {

      console.error(
        "bind-start error:",
        error
      );

      res.status(500).json({

        ok: false,

        error:
          error.message ||
          "Could not create Telegram binding session."
      });
    }
  }
);


/* =========================================================
   BIND STATUS
========================================================= */

app.get(
  "/api/telegram/bind-status/:token",

  async (req, res) => {

    const token =
      cleanString(
        req.params.token,
        200
      );

    if (!token) {

      return res.status(400).json({
        ok: false,
        status: "invalid"
      });
    }

    try {

      const binding =
        await firebaseGet(
          `hrryTelegramBindings/${encodeURIComponent(token)}`
        );

      if (!binding) {

        return res.json({
          ok: true,
          status:
            "not_found"
        });
      }

      if (
        binding.status ===
          "pending" &&
        binding.expiresAt &&
        Number(
          binding.expiresAt
        ) < now()
      ) {

        await firebasePatch(
          `hrryTelegramBindings/${encodeURIComponent(token)}`,

          {
            status:
              "expired"
          }
        );

        return res.json({
          ok: true,
          status:
            "expired"
        });
      }

      if (
        binding.status ===
        "verified"
      ) {

        return res.json({

          ok: true,

          status:
            "verified",

          sessionToken:
            binding.sessionToken,

          profile:
            binding.profile
        });
      }

      res.json({

        ok: true,

        status:
          binding.status ||
          "pending"
      });

    } catch (error) {

      console.error(
        "bind-status error:",
        error
      );

      res.status(500).json({

        ok: false,

        error:
          "Could not check Telegram binding."
      });
    }
  }
);


/* =========================================================
   SAVED SESSION VERIFY
========================================================= */

app.post(
  "/api/telegram/verify-session",

  async (req, res) => {

    try {

      const sessionToken =
        cleanString(
          req.body?.sessionToken,
          300
        );

      if (!sessionToken) {

        return res.status(401).json({
          ok: false,
          verified: false
        });
      }

      const session =
        await getTelegramSession(
          sessionToken
        );

      if (!session) {

        return res.status(401).json({
          ok: false,
          verified: false
        });
      }

      await firebasePatch(
        `hrryTelegramSessions/${encodeURIComponent(sessionToken)}`,

        {
          lastVerifiedAt:
            now()
        }
      );

      res.json({

        ok: true,

        verified:
          true,

        profile: {

          telegramId:
            String(
              session.telegramId ||
              ""
            ),

          username:
            session.username ||
            "",

          name:
            session.name ||
            "Telegram User",

          photoFileId:
            session.photoFileId ||
            ""
        }
      });

    } catch (error) {

      console.error(
        "verify-session error:",
        error
      );

      res.status(500).json({

        ok: false,

        verified:
          false
      });
    }
  }
);


/* =========================================================
   TELEGRAM PHOTO PROXY
========================================================= */

app.get(
  "/api/telegram/photo/:fileId",

  async (req, res) => {

    const fileId =
      cleanString(
        req.params.fileId,
        500
      );

    if (!fileId) {
      return res
        .status(400)
        .end();
    }

    try {

      const file =
        await downloadTelegramFile(
          fileId
        );

      res.setHeader(
        "Content-Type",
        file.mimeType
      );

      res.setHeader(
        "Cache-Control",
        "public, max-age=3600"
      );

      res.send(
        file.buffer
      );

    } catch (error) {

      console.error(
        "Telegram photo proxy error:",
        error.message
      );

      res.status(404).end();
    }
  }
);


/* =========================================================
   PAYMENT SCREENSHOT UPLOAD
========================================================= */

app.post(
  "/api/upload-screenshot",

  upload.single(
    "screenshot"
  ),

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
        `pay_${Date.now()}_${randomToken(8)}`;

      const telegramMessage =
        await sendTelegramPhoto(

          TELEGRAM_CHAT_ID,

          req.file.buffer,

          req.file.originalname ||
            "payment.jpg",

          req.file.mimetype,

          [
            "💳 PAYMENT SCREENSHOT",
            "",
            "⏳ Waiting for payment request details...",
            `📦 Upload ID: ${uploadId}`,
            `🕐 ${new Date().toLocaleString("en-IN")}`
          ].join("\n")
        );

      await firebasePut(
        `hrryKeyUploads/${uploadId}`,

        {

          uploadId,

          telegramChatId:
            String(
              TELEGRAM_CHAT_ID
            ),

          telegramMessageId:
            telegramMessage.message_id,

          originalName:
            cleanString(
              req.file.originalname,
              200
            ),

          mimeType:
            req.file.mimetype,

          size:
            req.file.size,

          createdAt:
            now()
        }
      );

      res.json({

        ok: true,

        uploadId
      });

    } catch (error) {

      console.error(
        "Screenshot upload error:",
        error
      );

      res.status(500).json({

        ok: false,

        error:
          error.message ||
          "Screenshot upload failed."
      });
    }
  }
);


/* =========================================================
   ADMIN REQUEST CAPTION
========================================================= */

function buildRequestCaption(
  request
) {

  const telegramUsername =
    request.telegramUsername
      ? `@${request.telegramUsername}`
      : "No username";

  const status =
    String(
      request.status ||
      "pending"
    );

  const lines = [

    "💳 <b>HRRY TEST — PAYMENT KEY REQUEST</b>",

    "",

    `👤 <b>Telegram Username:</b> ${escapeHtml(telegramUsername)}`,

    `🆔 <b>Telegram ID:</b> <code>${escapeHtml(request.telegramId || "—")}</code>`,

    `👨‍💻 <b>Telegram Name:</b> ${escapeHtml(request.telegramName || "—")}`,

    "",

    `💰 <b>Payment Amount:</b> ₹${escapeHtml(request.amount || "20")}`,

    `🧾 <b>UTR / Transaction ID:</b> ${escapeHtml(request.utr || "—")}`,

    `🆔 <b>Request ID:</b> <code>${escapeHtml(request.requestId || "—")}</code>`,

    `🕐 <b>Time:</b> ${escapeHtml(
      new Date(
        Number(
          request.createdAt ||
          now()
        )
      ).toLocaleString(
        "en-IN"
      )
    )}`,

    ""
  ];

  if (
    status ===
    "accepted"
  ) {

    lines.push(

      "🟢 <b>Status: ACCEPTED BY ADMIN</b>",

      "",

      `🔑 <b>Generated Key:</b> <code>${escapeHtml(request.generatedKey || "—")}</code>`,

      "",

      "✅ <b>Accepted by Admin</b>"
    );

  } else if (
    status ===
    "rejected"
  ) {

    lines.push(

      "🔴 <b>Status: REJECTED BY ADMIN</b>",

      "",

      "❌ <b>Rejected by Admin</b>"
    );

  } else {

    lines.push(

      "🟡 <b>Status: WAITING FOR ADMIN ACTION</b>",

      "",

      "👇 <b>Choose an action:</b>"
    );
  }

  return lines.join(
    "\n"
  );
}

function getRequestReplyMarkup(
  request
) {

  if (
    String(
      request.status ||
      "pending"
    ) !== "pending"
  ) {

    return {
      inline_keyboard: []
    };
  }

  return {

    inline_keyboard: [

      [

        {
          text:
            "✅ ACCEPT",

          callback_data:
            `ACCEPT:${request.requestId}`
        },

        {
          text:
            "❌ REJECT",

          callback_data:
            `REJECT:${request.requestId}`
        }

      ]
    ]
  };
}


/* =========================================================
   ADMIN TELEGRAM PROFILE NOTIFICATION
========================================================= */

async function notifyAdminTelegramProfile(
  request
) {

  if (
    !request.telegramPhotoFileId
  ) {
    return;
  }

  try {

    const photo =
      await downloadTelegramFile(
        request.telegramPhotoFileId
      );

    await sendTelegramPhoto(

      TELEGRAM_CHAT_ID,

      photo.buffer,

      "telegram-profile.jpg",

      photo.mimeType,

      [

        "👤 <b>TELEGRAM PROFILE</b>",

        "",

        `Name: ${escapeHtml(
          request.telegramName ||
          "—"
        )}`,

        `Username: ${escapeHtml(
          request.telegramUsername
            ? "@" +
              request.telegramUsername
            : "No username"
        )}`,

        `Telegram ID: <code>${escapeHtml(
          request.telegramId ||
          "—"
        )}</code>`,

        "",

        `Request ID: <code>${escapeHtml(
          request.requestId
        )}</code>`

      ].join("\n")
    );

  } catch (error) {

    console.warn(
      "Admin Telegram profile photo notification failed:",
      error.message
    );
  }
}


/* =========================================================
   KEY REQUEST
========================================================= */

app.post(
  "/api/key-request",

  async (req, res) => {

    try {

      const body =
        req.body ||
        {};

      const utr =
        cleanString(
          body.utr,
          200
        );

      const amount =
        Number(
          body.amount ||
          20
        );

      const deviceId =
        cleanString(
          body.deviceId,
          300
        );

      const uploadId =
        cleanString(
          body.telegramFileId,
          300
        );

      const sessionToken =
        cleanString(
          body.telegramSessionToken,
          300
        );

      if (!utr) {

        return res.status(400).json({

          ok: false,

          error:
            "UTR / Transaction ID is required."
        });
      }

      if (!uploadId) {

        return res.status(400).json({

          ok: false,

          error:
            "Payment screenshot must be uploaded first."
        });
      }

      if (!deviceId) {

        return res.status(400).json({

          ok: false,

          error:
            "Device ID is required."
        });
      }

      const whatsapp =
        cleanString(
          body.whatsapp,
          100
        );

      if (
        whatsapp &&
        !/^[6-9]\d{9}$/.test(
          whatsapp
        )
      ) {

        return res.status(400).json({

          ok: false,

          error:
            "Invalid WhatsApp number. Enter exactly 10 digits."
        });
      }

      let telegramProfile =
        null;

      if (sessionToken) {

        const session =
          await getTelegramSession(
            sessionToken
          );

        if (session) {

          telegramProfile = {

            telegramId:
              String(
                session.telegramId ||
                ""
              ),

            username:
              session.username ||
              "",

            name:
              session.name ||
              "Telegram User",

            photoFileId:
              session.photoFileId ||
              ""
          };
        }
      }

      if (!telegramProfile) {

        return res.status(401).json({

          ok: false,

          error:
            "Telegram session is not verified. Please connect Telegram again."
        });
      }

      const existingPending =
        await findPendingRequest(
          telegramProfile.telegramId
        );

      if (existingPending) {

        return res.status(409).json({

          ok: false,

          error:
            "Your previous payment request is still under admin review. You cannot submit another request yet.",

          existingRequestId:
            existingPending.requestId,

          request:
            existingPending
        });
      }

      const upload =
        await firebaseGet(
          `hrryKeyUploads/${encodeURIComponent(uploadId)}`
        );

      if (!upload) {

        return res.status(400).json({

          ok: false,

          error:
            "Uploaded screenshot was not found."
        });
      }

      const requestId =
        `REQ-${Date.now()}-${randomToken(6).toUpperCase()}`;

      const request = {

        requestId,

        appName:
          APP_NAME,

        name:
          telegramProfile.name,

        whatsapp,

        utr,

        amount:
          Number.isFinite(
            amount
          )
            ? amount
            : 20,

        deviceId,

        telegramId:
          telegramProfile.telegramId,

        telegramUsername:
          telegramProfile.username,

        telegramName:
          telegramProfile.name,

        telegramPhotoFileId:
          telegramProfile.photoFileId,

        uploadId,

        status:
          "pending",

        createdAt:
          now(),

        updatedAt:
          now(),

        adminTelegramChatId:
          String(
            TELEGRAM_CHAT_ID
          ),

        adminTelegramMessageId:
          upload.telegramMessageId ||
          null
      };

      await firebasePut(
        `hrryKeyRequests/${requestId}`,

        request
      );

      if (
        upload.telegramMessageId
      ) {

        try {

          const caption =
            buildRequestCaption(
              request
            );

          await editTelegramMessageCaption(

            TELEGRAM_CHAT_ID,

            upload.telegramMessageId,

            caption,

            {
              parse_mode:
                "HTML",

              reply_markup:
                getRequestReplyMarkup(
                  request
                )
            }
          );

        } catch (error) {

          console.warn(
            "Could not edit payment screenshot caption:",
            error.message
          );
        }
      }

      await notifyAdminTelegramProfile(
        request
      );

      res.json({

        ok: true,

        requestId
      });

    } catch (error) {

      console.error(
        "Key request error:",
        error
      );

      res.status(500).json({

        ok: false,

        error:
          error.message ||
          "Request submission failed."
      });
    }
  }
);


/* =========================================================
   GET REQUEST
========================================================= */

app.get(
  "/api/key-request/:requestId",

  async (req, res) => {

    try {

      const requestId =
        cleanString(
          req.params.requestId,
          300
        );

      const request =
        await firebaseGet(
          `hrryKeyRequests/${encodeURIComponent(requestId)}`
        );

      if (!request) {

        return res.status(404).json({

          ok: false,

          error:
            "Request not found."
        });
      }

      res.json({

        ok: true,

        request
      });

    } catch (error) {

      console.error(
        "Get request error:",
        error
      );

      res.status(500).json({

        ok: false,

        error:
          "Could not load request."
      });
    }
  }
);


/* =========================================================
   REQUEST HISTORY
========================================================= */

app.get(
  "/api/key-requests/device/:deviceId",

  async (req, res) => {

    try {

      const deviceId =
        cleanString(
          req.params.deviceId,
          300
        );

      const all =
        await firebaseGet(
          "hrryKeyRequests"
        );

      const list =
        Object.values(
          all || {}
        )
          .filter(
            item =>
              String(
                item?.deviceId ||
                ""
              ) === deviceId
          )
          .sort(
            (a, b) =>
              Number(
                b.createdAt ||
                0
              ) -
              Number(
                a.createdAt ||
                0
              )
          );

      res.json({

        ok: true,

        requests:
          list
      });

    } catch (error) {

      console.error(
        "History error:",
        error
      );

      res.status(500).json({

        ok: false,

        error:
          "Could not load request history."
      });
    }
  }
);


/* =========================================================
   GENERATE LICENSE KEY
========================================================= */

function generateLicenseKey() {

  const part = () =>
    crypto
      .randomBytes(2)
      .toString("hex")
      .toUpperCase();

  return `HRRY-${part()}-${part()}-${part()}`;
}


/* =========================================================
   ACCEPT / REJECT CALLBACKS
========================================================= */

async function answerCallbackQuery(
  callbackQueryId,
  text,
  showAlert = false
) {

  try {

    await telegram(
      "answerCallbackQuery",
      {

        callback_query_id:
          callbackQueryId,

        text,

        show_alert:
          showAlert
      }
    );

  } catch (error) {

    console.warn(
      "answerCallbackQuery failed:",
      error.message
    );
  }
}

async function handleAdminCallback(
  callback
) {

  if (!callback) {
    return;
  }

  const adminId =
    String(
      callback.from?.id ||
      ""
    );

  if (
    adminId !==
    ADMIN_TELEGRAM_ID
  ) {

    await answerCallbackQuery(

      callback.id,

      "You are not authorized.",

      true
    );

    return;
  }

  const data =
    String(
      callback.data ||
      ""
    );

  const match =
    data.match(
      /^(ACCEPT|REJECT):(.+)$/
    );

  if (!match) {
    return;
  }

  const action =
    match[1];

  const requestId =
    match[2];

  try {

    const request =
      await firebaseGet(
        `hrryKeyRequests/${encodeURIComponent(requestId)}`
      );

    if (!request) {

      await answerCallbackQuery(

        callback.id,

        "Request not found.",

        true
      );

      return;
    }

    if (
      request.status ===
      "accepted"
    ) {

      await answerCallbackQuery(

        callback.id,

        "This request is already accepted."
      );

      return;
    }

    if (
      request.status ===
      "rejected"
    ) {

      await answerCallbackQuery(

        callback.id,

        "This request is already rejected."
      );

      return;
    }

    if (
      action ===
      "REJECT"
    ) {

      const rejectedAt =
        now();

      const rejectedRequest = {

        ...request,

        status:
          "rejected",

        updatedAt:
          rejectedAt,

        rejectedAt,

        rejectedBy:
          ADMIN_TELEGRAM_ID
      };

      await firebasePatch(

        `hrryKeyRequests/${encodeURIComponent(requestId)}`,

        {

          status:
            "rejected",

          updatedAt:
            rejectedAt,

          rejectedAt,

          rejectedBy:
            ADMIN_TELEGRAM_ID
        }
      );

      try {

        await editTelegramMessageCaption(

          callback.message.chat.id,

          callback.message.message_id,

          buildRequestCaption(
            rejectedRequest
          ),

          {

            parse_mode:
              "HTML",

            reply_markup: {
              inline_keyboard: []
            }
          }
        );

      } catch (error) {

        console.warn(
          "Could not update rejected request message:",
          error.message
        );
      }

      await answerCallbackQuery(

        callback.id,

        "Request rejected."
      );

      return;
    }


    /* =====================================================
       ACCEPT
    ===================================================== */

    const key =
      generateLicenseKey();

    const createdAt =
      now();

    const expiresAt =
      createdAt +
      24 *
      60 *
      60 *
      1000;

    const licenseRecord = {

      key,

      appName:
        APP_NAME,

      status:
        "active",

      active:
        true,

      blocked:
        false,

      used:
        false,

      boundDeviceId:
        null,

      usedBy:
        null,

      createdAt,

      expiresAt,

      requestId,

      telegramId:
        request.telegramId ||
        null,

      telegramUsername:
        request.telegramUsername ||
        "",

      telegramName:
        request.telegramName ||
        ""
    };

    await firebasePut(

      `licenseKeys/${encodeURIComponent(key)}`,

      licenseRecord
    );

    const acceptedAt =
      now();

    const acceptedRequest = {

      ...request,

      status:
        "accepted",

      updatedAt:
        acceptedAt,

      acceptedAt,

      acceptedBy:
        ADMIN_TELEGRAM_ID,

      generatedKey:
        key,

      keyExpiresAt:
        expiresAt
    };

    await firebasePatch(

      `hrryKeyRequests/${encodeURIComponent(requestId)}`,

      {

        status:
          "accepted",

        updatedAt:
          acceptedAt,

        acceptedAt,

        acceptedBy:
          ADMIN_TELEGRAM_ID,

        generatedKey:
          key,

        keyExpiresAt:
          expiresAt
      }
    );

    try {

      await editTelegramMessageCaption(

        callback.message.chat.id,

        callback.message.message_id,

        buildRequestCaption(
          acceptedRequest
        ),

        {

          parse_mode:
            "HTML",

          reply_markup: {
            inline_keyboard: []
          }
        }
      );

    } catch (error) {

      console.warn(
        "Could not update accepted request message:",
        error.message
      );
    }

    await answerCallbackQuery(

      callback.id,

      "Key generated successfully."
    );

    try {

      await sendTelegramMessage(

        TELEGRAM_CHAT_ID,

        [

          "✅ <b>KEY GENERATED</b>",

          "",

          `👤 ${escapeHtml(
            request.telegramName ||
            request.name ||
            "User"
          )}`,

          `🆔 <code>${escapeHtml(
            request.telegramId ||
            "—"
          )}</code>`,

          `📦 Request: <code>${escapeHtml(
            requestId
          )}</code>`,

          "",

          `🔑 <code>${escapeHtml(
            key
          )}</code>`,

          "",

          "⏰ Valid for 24 hours."

        ].join("\n"),

        {
          parse_mode:
            "HTML"
        }
      );

    } catch (error) {

      console.warn(
        "Could not send generated key message:",
        error.message
      );
    }

  } catch (error) {

    console.error(
      "Admin callback error:",
      error
    );

    await answerCallbackQuery(

      callback.id,

      "Server error. Please try again.",

      true
    );
  }
}


/* =========================================================
   TELEGRAM LONG POLLING
========================================================= */

let telegramOffset = 0;

let telegramPollingRunning =
  false;

async function telegramPolling() {

  if (
    telegramPollingRunning
  ) {
    return;
  }

  telegramPollingRunning =
    true;

  while (true) {

    try {

      const updates =
        await telegram(
          "getUpdates",
          {

            offset:
              telegramOffset,

            timeout:
              30,

            allowed_updates: [

              "message",

              "callback_query"

            ]
          }
        );

      if (
        !Array.isArray(
          updates
        )
      ) {
        continue;
      }

      for (
        const update
        of updates
      ) {

        telegramOffset =
          Number(
            update.update_id
          ) +
          1;

        try {

          if (
            update.message?.text
          ) {

            console.log(

              "Telegram message received:",

              update.message.text
            );
          }

          if (
            update.message
          ) {

            await handleTelegramBindingMessage(
              update.message
            );
          }

          if (
            update.callback_query
          ) {

            await handleAdminCallback(
              update.callback_query
            );
          }

        } catch (error) {

          console.error(

            "Telegram update handler error:",

            error
          );
        }
      }

    } catch (error) {

      console.error(

        "Telegram polling error:",

        error.message
      );

      await new Promise(
        resolve =>
          setTimeout(
            resolve,
            3000
          )
      );
    }
  }
}


/* =========================================================
   TELEGRAM PREPARE
========================================================= */

async function prepareTelegram() {

  if (!BOT_TOKEN) {

    console.warn(
      "BOT_TOKEN is missing. Telegram features are disabled."
    );

    return;
  }

  try {

    await telegram(
      "deleteWebhook",
      {
        drop_pending_updates:
          false
      }
    );

    const bot =
      await telegram(
        "getMe"
      );

    try {

      await telegram(
        "setMyCommands",
        {

          commands: [

            {
              command:
                "start",

              description:
                "Start Telegram binding"
            }

          ]
        }
      );

    } catch (error) {

      console.warn(
        "Could not set Telegram bot commands:",
        error.message
      );
    }

    console.log(
      `Telegram bot ready: @${bot.username}`
    );

  } catch (error) {

    console.error(
      "Telegram prepare error:",
      error.message
    );
  }
}


/* =========================================================
   HEALTH
========================================================= */

app.get(
  "/health",

  (req, res) => {

    res.json({

      ok:
        true,

      online:
        true,

      appName:
        APP_NAME,

      telegram:
        Boolean(
          BOT_TOKEN
        ),

      telegramMode:
        "direct-api-polling",

      callbacks:
        true,

      telegramBinding:
        true,

      time:
        new Date().toISOString()
    });
  }
);


/* =========================================================
   ERROR HANDLER
========================================================= */

app.use(

  (error, req, res, next) => {

    console.error(
      "Unhandled server error:",
      error
    );

    if (
      error instanceof
      multer.MulterError
    ) {

      return res.status(400).json({

        ok:
          false,

        error:
          error.message ||
          "Upload error."
      });
    }

    res.status(500).json({

      ok:
        false,

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

  async () => {

    console.log(
      `HRRY TEST server running on port ${PORT}`
    );

    await prepareTelegram();

    if (BOT_TOKEN) {
      telegramPolling();
    }
  }
);
