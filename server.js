"use strict";

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const crypto = require("crypto");
const TelegramBot = require("node-telegram-bot-api");


/* =========================================================
   CONFIG
========================================================= */

const PORT =
  Number(process.env.PORT || 10000);

const BOT_TOKEN =
  process.env.BOT_TOKEN;

const TELEGRAM_CHAT_ID =
  process.env.TELEGRAM_CHAT_ID;

const ADMIN_TELEGRAM_ID =
  String(
    process.env.ADMIN_TELEGRAM_ID || ""
  ).trim();

const FIREBASE_URL =
  (
    process.env.FIREBASE_DATABASE_URL ||
    ""
  ).replace(/\/+$/, "");

const FIREBASE_AUTH_TOKEN =
  process.env.FIREBASE_AUTH_TOKEN || "";

const APP_NAME =
  process.env.APP_NAME ||
  "HRRY TEST";

const MAX_FILE_SIZE =
  5 * 1024 * 1024;


/* =========================================================
   VALIDATION
========================================================= */

if (!BOT_TOKEN) {
  console.error(
    "❌ BOT_TOKEN is missing."
  );
}

if (!TELEGRAM_CHAT_ID) {
  console.error(
    "❌ TELEGRAM_CHAT_ID is missing."
  );
}

if (!FIREBASE_URL) {
  console.error(
    "❌ FIREBASE_DATABASE_URL is missing."
  );
}


/* =========================================================
   APP
========================================================= */

const app =
  express();


app.use(
  cors({
    origin: "*",
    methods: [
      "GET",
      "POST",
      "PATCH",
      "OPTIONS"
    ],
    allowedHeaders: [
      "Content-Type"
    ]
  })
);


app.use(
  express.json({
    limit: "1mb"
  })
);


/* =========================================================
   MULTER
   Screenshot max 5 MB
========================================================= */

const upload =
  multer({

    storage:
      multer.memoryStorage(),

    limits: {
      fileSize:
        MAX_FILE_SIZE
    },

    fileFilter:
      (req, file, callback) => {

        const allowed = [
          "image/jpeg",
          "image/png",
          "image/webp"
        ];

        if (
          !allowed.includes(
            file.mimetype
          )
        ) {

          return callback(
            new Error(
              "Only JPG, PNG and WEBP images are allowed."
            )
          );

        }

        callback(
          null,
          true
        );

      }

  });


/* =========================================================
   TELEGRAM BOT
========================================================= */

let bot = null;

if (BOT_TOKEN) {

  bot =
    new TelegramBot(
      BOT_TOKEN,
      {
        polling: true
      }
    );

}


/* =========================================================
   HELPERS
========================================================= */

function makeId() {

  return crypto
    .randomUUID();

}


function makeKey() {

  const a =
    crypto
      .randomBytes(3)
      .toString("hex")
      .toUpperCase();

  const b =
    crypto
      .randomBytes(3)
      .toString("hex")
      .toUpperCase();

  const c =
    crypto
      .randomBytes(3)
      .toString("hex")
      .toUpperCase();

  return (
    "HRRY-" +
    a +
    "-" +
    b +
    "-" +
    c
  );

}


function escapeHtml(value) {

  return String(
    value ?? ""
  )
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );

}


function cleanText(
  value,
  max = 500
) {

  return String(
    value ?? ""
  )
    .trim()
    .slice(
      0,
      max
    );

}


function firebasePath(
  path
) {

  return (
    FIREBASE_URL +
    "/" +
    path
      .split("/")
      .map(
        encodeURIComponent
      )
      .join("/") +
    ".json"
  );

}


function firebaseUrl(
  path
) {

  let url =
    firebasePath(path);

  if (FIREBASE_AUTH_TOKEN) {

    url +=
      "?auth=" +
      encodeURIComponent(
        FIREBASE_AUTH_TOKEN
      );

  }

  return url;

}


/* =========================================================
   FIREBASE REST
========================================================= */

async function firebaseGet(
  path
) {

  const response =
    await fetch(
      firebaseUrl(path)
    );

  if (!response.ok) {

    const text =
      await response.text();

    throw new Error(
      `Firebase GET failed ${response.status}: ${text}`
    );

  }

  return response.json();

}


async function firebasePut(
  path,
  data
) {

  const response =
    await fetch(
      firebaseUrl(path),
      {
        method: "PUT",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify(data)
      }
    );

  if (!response.ok) {

    const text =
      await response.text();

    throw new Error(
      `Firebase PUT failed ${response.status}: ${text}`
    );

  }

  return response.json();

}


async function firebasePatch(
  path,
  data
) {

  const response =
    await fetch(
      firebaseUrl(path),
      {
        method: "PATCH",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify(data)
      }
    );

  if (!response.ok) {

    const text =
      await response.text();

    throw new Error(
      `Firebase PATCH failed ${response.status}: ${text}`
    );

  }

  return response.json();

}


/* =========================================================
   FIREBASE PATHS
========================================================= */

function requestPath(
  requestId
) {

  return (
    "hrryKeyRequests/" +
    requestId
  );

}


function uploadPath(
  uploadId
) {

  return (
    "hrryKeyUploads/" +
    uploadId
  );

}


/* =========================================================
   TELEGRAM CAPTION
========================================================= */

function makeRequestCaption(
  request
) {

  const status =
    String(
      request.status ||
      "pending"
    ).toUpperCase();

  return (

    `🔔 <b>${escapeHtml(APP_NAME)} — KEY REQUEST</b>\n\n` +

    `🆔 <b>Request ID:</b>\n` +
    `<code>${escapeHtml(request.id)}</code>\n\n` +

    `👤 <b>Student Name:</b>\n` +
    `${escapeHtml(request.name)}\n\n` +

    `📱 <b>WhatsApp:</b>\n` +
    `${escapeHtml(request.whatsapp)}\n\n` +

    `✈️ <b>Telegram ID:</b>\n` +
    `${escapeHtml(request.telegramId)}\n\n` +

    `💳 <b>UTR / Transaction ID:</b>\n` +
    `<code>${escapeHtml(request.utr)}</code>\n\n` +

    `💰 <b>Amount:</b>\n` +
    `₹${escapeHtml(request.amount || "—")}\n\n` +

    `📱 <b>Device ID:</b>\n` +
    `<code>${escapeHtml(request.deviceId)}</code>\n\n` +

    `📌 <b>Status:</b> ${status}\n\n` +

    `🕒 <b>Submitted:</b>\n` +
    `${new Date(
      request.createdAt
    ).toLocaleString("en-IN")}` +

    (
      request.status === "accepted"
        ? `\n\n🔑 <b>KEY:</b>\n<code>${escapeHtml(request.key)}</code>`
        : ""
    ) +

    (
      request.status === "rejected"
        ? `\n\n❌ <b>Request rejected.</b>`
        : ""
    )

  );

}


/* =========================================================
   TELEGRAM KEYBOARD
========================================================= */

function pendingKeyboard(
  requestId
) {

  return {

    inline_keyboard: [

      [
        {
          text:
            "✅ ACCEPT",
          callback_data:
            `accept:${requestId}`
        },

        {
          text:
            "❌ REJECT",
          callback_data:
            `reject:${requestId}`
        }
      ]

    ]

  };

}


function acceptedKeyboard() {

  return {

    inline_keyboard: [

      [
        {
          text:
            "✅ ACCEPTED",
          callback_data:
            "noop"
        }
      ]

    ]

  };

}


function rejectedKeyboard(
  requestId
) {

  return {

    inline_keyboard: [

      [
        {
          text:
            "❌ REJECTED",
          callback_data:
            "noop"
        }
      ]

    ]

  };

}


/* =========================================================
   HEALTH
========================================================= */

app.get(
  "/",
  (req, res) => {

    res.json({

      ok: true,

      app:
        APP_NAME,

      service:
        "HRRY Key Bot",

      time:
        new Date().toISOString(),

      telegram:
        Boolean(bot),

      firebase:
        Boolean(FIREBASE_URL)

    });

  }
);


/* =========================================================
   HEALTH CHECK
========================================================= */

app.get(
  "/health",
  (req, res) => {

    res.json({

      ok: true,

      uptime:
        process.uptime(),

      telegram:
        Boolean(bot),

      firebase:
        Boolean(FIREBASE_URL)

    });

  }
);


/* =========================================================
   UPLOAD SCREENSHOT
=========================================================

   Frontend:
   POST /api/upload-screenshot

   field:
   screenshot

   This immediately uploads the screenshot to Telegram.
   Then /api/key-request attaches all details to
   the same Telegram photo message.
========================================================= */

app.post(
  "/api/upload-screenshot",

  (req, res, next) => {

    upload.single(
      "screenshot"
    )(req, res, err => {

      if (err) {

        console.error(
          "Upload middleware error:",
          err
        );

        return res.status(
          400
        ).json({

          ok: false,

          error:
            err.message ||
            "File upload failed."

        });

      }

      next();

    });

  },

  async (req, res) => {

    try {

      if (!bot) {

        return res.status(
          500
        ).json({

          ok: false,

          error:
            "Telegram bot is not configured."

        });

      }


      if (!req.file) {

        return res.status(
          400
        ).json({

          ok: false,

          error:
            "Screenshot is required."

        });

      }


      if (
        req.file.size >
        MAX_FILE_SIZE
      ) {

        return res.status(
          400
        ).json({

          ok: false,

          error:
            "Screenshot maximum size is 5 MB."

        });

      }


      const uploadId =
        makeId();


      const temporaryCaption =
        `📸 <b>Payment Screenshot Received</b>\n\n` +
        `⏳ Waiting for student details...\n\n` +
        `<code>${uploadId}</code>`;


      const telegramMessage =
        await bot.sendPhoto(

          TELEGRAM_CHAT_ID,

          req.file.buffer,

          {
            caption:
              temporaryCaption,

            parse_mode:
              "HTML",

            protect_content:
              true
          }

        );


      const messageId =
        telegramMessage.message_id;


      await firebasePut(

        uploadPath(
          uploadId
        ),

        {

          uploadId,

          telegramFileId:
            telegramMessage.photo[
              telegramMessage.photo.length - 1
            ].file_id,

          telegramMessageId:
            messageId,

          telegramChatId:
            String(
              TELEGRAM_CHAT_ID
            ),

          createdAt:
            Date.now(),

          used:
            false

        }

      );


      return res.json({

        ok: true,

        uploadId,

        fileId:
          telegramMessage.photo[
            telegramMessage.photo.length - 1
          ].file_id,

        messageId

      });


    } catch (error) {

      console.error(
        "Screenshot upload error:",
        error
      );


      return res.status(
        500
      ).json({

        ok: false,

        error:
          error.message ||
          "Network/server error during upload."

      });

    }

  }

);


/* =========================================================
   CREATE KEY REQUEST
=========================================================

   POST /api/key-request

   Body:
   {
      name,
      whatsapp,
      telegramId,
      utr,
      amount,
      deviceId,
      telegramFileId
   }

========================================================= */

app.post(
  "/api/key-request",
  async (req, res) => {

    try {

      if (!bot) {

        return res.status(
          500
        ).json({

          ok: false,

          error:
            "Telegram bot is not configured."

        });

      }


      const name =
        cleanText(
          req.body.name,
          100
        );

      const whatsapp =
        cleanText(
          req.body.whatsapp,
          30
        );

      const telegramId =
        cleanText(
          req.body.telegramId,
          100
        );

      const utr =
        cleanText(
          req.body.utr,
          120
        );

      const amount =
        cleanText(
          req.body.amount,
          30
        );

      const deviceId =
        cleanText(
          req.body.deviceId,
          150
        );

      const uploadId =
        cleanText(
          req.body.telegramFileId,
          150
        );


      if (!name) {

        return res.status(
          400
        ).json({

          ok: false,

          error:
            "Student name is required."

        });

      }


      if (!whatsapp) {

        return res.status(
          400
        ).json({

          ok: false,

          error:
            "WhatsApp number is required."

        });

      }


      if (!telegramId) {

        return res.status(
          400
        ).json({

          ok: false,

          error:
            "Telegram ID is required."

        });

      }


      if (!utr) {

        return res.status(
          400
        ).json({

          ok: false,

          error:
            "UTR / Transaction ID is required."

        });

      }


      if (!deviceId) {

        return res.status(
          400
        ).json({

          ok: false,

          error:
            "Device ID is required."

        });

      }


      if (!uploadId) {

        return res.status(
          400
        ).json({

          ok: false,

          error:
            "Screenshot upload ID is missing."

        });

      }


      /*
       * Find uploaded screenshot
       */

      const uploadData =
        await firebaseGet(
          uploadPath(
            uploadId
          )
        );


      if (!uploadData) {

        return res.status(
          400
        ).json({

          ok: false,

          error:
            "Screenshot upload not found or expired."

        });

      }


      if (uploadData.used) {

        return res.status(
          400
        ).json({

          ok: false,

          error:
            "This screenshot has already been submitted."

        });

      }


      /*
       * Create request
       */

      const requestId =
        "REQ-" +
        Date.now().toString(36).toUpperCase() +
        "-" +
        crypto
          .randomBytes(3)
          .toString("hex")
          .toUpperCase();


      const request = {

        id:
          requestId,

        name,

        whatsapp,

        telegramId,

        utr,

        amount,

        deviceId,

        status:
          "pending",

        key:
          null,

        createdAt:
          Date.now(),

        acceptedAt:
          null,

        rejectedAt:
          null,

        telegramChatId:
          String(
            TELEGRAM_CHAT_ID
          ),

        telegramMessageId:
          Number(
            uploadData.telegramMessageId
          ),

        telegramFileId:
          uploadData.telegramFileId,

        uploadId

      };


      /*
       * Save request first
       */

      await firebasePut(

        requestPath(
          requestId
        ),

        request

      );


      /*
       * Mark upload as used
       */

      await firebasePatch(

        uploadPath(
          uploadId
        ),

        {

          used:
            true,

          requestId

        }

      );


      /*
       * Edit the SAME Telegram photo message.
       */

      await bot.editMessageCaption(

        makeRequestCaption(
          request
        ),

        {

          chat_id:
            TELEGRAM_CHAT_ID,

          message_id:
            request.telegramMessageId,

          parse_mode:
            "HTML",

          reply_markup:
            pendingKeyboard(
              requestId
            )

        }

      );


      return res.json({

        ok: true,

        requestId,

        status:
          "pending"

      });


    } catch (error) {

      console.error(
        "Key request error:",
        error
      );


      return res.status(
        500
      ).json({

        ok: false,

        error:
          error.message ||
          "Failed to submit request."

      });

    }

  }

);


/* =========================================================
   GET SINGLE REQUEST
========================================================= */

app.get(
  "/api/key-request/:id",
  async (req, res) => {

    try {

      const id =
        cleanText(
          req.params.id,
          150
        );


      const request =
        await firebaseGet(
          requestPath(id)
        );


      if (!request) {

        return res.status(
          404
        ).json({

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

      console.error(
        "Get request error:",
        error
      );


      return res.status(
        500
      ).json({

        ok: false,

        error:
          "Unable to get request."

      });

    }

  }

);


/* =========================================================
   GET DEVICE REQUESTS
========================================================= */

app.get(
  "/api/key-requests/device/:deviceId",
  async (req, res) => {

    try {

      const deviceId =
        cleanText(
          req.params.deviceId,
          150
        );


      const all =
        await firebaseGet(
          "hrryKeyRequests"
        );


      const requests =
        [];


      if (all && typeof all === "object") {

        for (
          const id of Object.keys(all)
        ) {

          const item =
            all[id];


          if (
            item &&
            item.deviceId ===
            deviceId
          ) {

            requests.push(
              item
            );

          }

        }

      }


      requests.sort(
        (
          a,
          b
        ) =>
          Number(
            b.createdAt || 0
          ) -
          Number(
            a.createdAt || 0
          )
      );


      return res.json({

        ok: true,

        requests:
          requests.slice(
            0,
            50
          )

      });


    } catch (error) {

      console.error(
        "Device history error:",
        error
      );


      return res.status(
        500
      ).json({

        ok: false,

        error:
          "Unable to load request history."

      });

    }

  }

);


/* =========================================================
   ADMIN CALLBACK
========================================================= */

if (bot) {

  bot.on(
    "callback_query",
    async callback => {

      try {

        const data =
          String(
            callback.data || ""
          );


        /*
         * Always answer callback
         */

        if (
          data === "noop"
        ) {

          await bot.answerCallbackQuery(
            callback.id
          );

          return;

        }


        /*
         * Security:
         * Only configured admin Telegram
         * account can accept/reject.
         */

        const clickerId =
          String(
            callback.from?.id || ""
          );


        if (
          ADMIN_TELEGRAM_ID &&
          clickerId !==
          ADMIN_TELEGRAM_ID
        ) {

          await bot.answerCallbackQuery(

            callback.id,

            {
              text:
                "⛔ You are not authorized.",

              show_alert:
                true
            }

          );

          return;

        }


        /*
         * If ADMIN_TELEGRAM_ID is not configured,
         * do not allow state-changing action.
         */

        if (!ADMIN_TELEGRAM_ID) {

          await bot.answerCallbackQuery(

            callback.id,

            {
              text:
                "ADMIN_TELEGRAM_ID is not configured.",

              show_alert:
                true
            }

          );

          return;

        }


        const parts =
          data.split(":");


        const action =
          parts[0];

        const requestId =
          parts.slice(1).join(":");


        if (
          ![
            "accept",
            "reject"
          ].includes(
            action
          )
        ) {

          await bot.answerCallbackQuery(
            callback.id
          );

          return;

        }


        if (!requestId) {

          await bot.answerCallbackQuery(

            callback.id,

            {
              text:
                "Invalid request.",

              show_alert:
                true
            }

          );

          return;

        }


        /*
         * Read request
         */

        const request =
          await firebaseGet(
            requestPath(
              requestId
            )
          );


        if (!request) {

          await bot.answerCallbackQuery(

            callback.id,

            {
              text:
                "Request not found.",

              show_alert:
                true
            }

          );

          return;

        }


        /*
         * Prevent double processing
         */

        if (
          request.status !==
          "pending"
        ) {

          await bot.answerCallbackQuery(

            callback.id,

            {
              text:
                `Already ${request.status}.`,

              show_alert:
                true
            }

          );

          return;

        }


        /*
         * ACCEPT
         */

        if (
          action ===
          "accept"
        ) {

          const key =
            makeKey();


          const updated = {

            ...request,

            status:
              "accepted",

            key,

            acceptedAt:
              Date.now()

          };


          await firebasePut(

            requestPath(
              requestId
            ),

            updated

          );


          /*
           * Update Telegram message
           */

          await bot.editMessageCaption(

            makeRequestCaption(
              updated
            ),

            {

              chat_id:
                request.telegramChatId,

              message_id:
                Number(
                  request.telegramMessageId
                ),

              parse_mode:
                "HTML",

              reply_markup:
                acceptedKeyboard()

            }

          );


          await bot.answerCallbackQuery(

            callback.id,

            {
              text:
                "✅ Request accepted. Key generated."
            }

          );


          /*
           * Send a private notification to admin
           * only if possible.
           */

          try {

            await bot.sendMessage(

              ADMIN_TELEGRAM_ID,

              `🎉 <b>KEY GENERATED</b>\n\n` +

              `👤 ${escapeHtml(request.name)}\n` +

              `🆔 <code>${escapeHtml(requestId)}</code>\n\n` +

              `🔑 <code>${escapeHtml(key)}</code>`,

              {
                parse_mode:
                  "HTML"
              }

            );

          } catch (
            notifyError
          ) {

            console.log(
              "Admin DM skipped:",
              notifyError.message
            );

          }


          return;

        }


        /*
         * REJECT
         */

        if (
          action ===
          "reject"
        ) {

          const updated = {

            ...request,

            status:
              "rejected",

            key:
              null,

            rejectedAt:
              Date.now()

          };


          await firebasePut(

            requestPath(
              requestId
            ),

            updated

          );


          await bot.editMessageCaption(

            makeRequestCaption(
              updated
            ),

            {

              chat_id:
                request.telegramChatId,

              message_id:
                Number(
                  request.telegramMessageId
                ),

              parse_mode:
                "HTML",

              reply_markup:
                rejectedKeyboard(
                  requestId
                )

            }

          );


          await bot.answerCallbackQuery(

            callback.id,

            {
              text:
                "❌ Request rejected."
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

            callback.id,

            {
              text:
                "Server error. Please try again.",

              show_alert:
                true
            }

          );

        } catch {}

      }

    }
  );


  /*
   * Telegram polling error
   */

  bot.on(
    "polling_error",
    error => {

      console.error(
        "Telegram polling error:",
        error.message
      );

    }
  );

}


/* =========================================================
   MULTER ERROR HANDLER
========================================================= */

app.use(
  (
    error,
    req,
    res,
    next
  ) => {

    if (
      error &&
      error.code ===
      "LIMIT_FILE_SIZE"
    ) {

      return res.status(
        413
      ).json({

        ok: false,

        error:
          "Screenshot maximum size is 5 MB."

      });

    }


    if (error) {

      console.error(
        "Server error:",
        error
      );


      return res.status(
        500
      ).json({

        ok: false,

        error:
          error.message ||
          "Internal server error."

      });

    }


    next();

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
      "======================================"
    );

    console.log(
      `${APP_NAME} server started`
    );

    console.log(
      `Port: ${PORT}`
    );

    console.log(
      `Telegram: ${bot ? "READY" : "NOT CONFIGURED"}`
    );

    console.log(
      `Firebase: ${FIREBASE_URL ? "READY" : "NOT CONFIGURED"}`
    );

    console.log(
      "======================================"

    );

  }
);
