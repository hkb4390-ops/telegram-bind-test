/* =========================================================
   TELEGRAM BINDING SYSTEM
========================================================= */

const BOT_USERNAME =
  String(process.env.BOT_USERNAME || "")
    .replace(/^@/, "")
    .trim();

const TELEGRAM_BIND_EXPIRY =
  10 * 60 * 1000; // 10 minutes

const TELEGRAM_SESSION_EXPIRY =
  30 * 24 * 60 * 60 * 1000; // 30 days


function generateTelegramBindToken() {
  return (
    "bind_" +
    crypto.randomBytes(24).toString("hex")
  );
}


function generateTelegramSessionToken() {
  return crypto.randomBytes(48).toString("hex");
}


async function getTelegramProfilePhoto(userId) {
  try {
    const photos =
      await telegram(
        "getUserProfilePhotos",
        {
          user_id: Number(userId),
          limit: 1
        }
      );

    if (
      !photos ||
      !photos.photos ||
      !photos.photos.length
    ) {
      return null;
    }

    const sizes =
      photos.photos[0];

    const largest =
      sizes[sizes.length - 1];

    return {
      fileId: largest.file_id,
      width: largest.width,
      height: largest.height
    };

  } catch (error) {
    console.error(
      "Telegram profile photo error:",
      error.message
    );

    return null;
  }
}


async function createTelegramProfile(user) {

  const telegramId =
    String(user.id);

  const firstName =
    String(user.first_name || "")
      .trim();

  const lastName =
    String(user.last_name || "")
      .trim();

  const fullName =
    `${firstName} ${lastName}`
      .trim();

  const username =
    user.username
      ? String(user.username)
      : "";

  const photo =
    await getTelegramProfilePhoto(
      telegramId
    );

  return {
    telegramId,

    username,

    name:
      fullName ||
      username ||
      telegramId,

    firstName,

    lastName,

    photoFileId:
      photo?.fileId || null,

    photoWidth:
      photo?.width || null,

    photoHeight:
      photo?.height || null,

    updatedAt:
      nowISO()
  };
}


/* =========================================================
   START TELEGRAM BINDING
========================================================= */

app.post(
  "/api/telegram/bind-start",
  async (req, res) => {

    try {

      if (!BOT_USERNAME) {
        return res.status(500).json({
          ok: false,
          error:
            "BOT_USERNAME is not configured."
        });
      }

      const bindToken =
        generateTelegramBindToken();

      const createdAt =
        Date.now();

      const expiresAt =
        createdAt +
        TELEGRAM_BIND_EXPIRY;

      await firebase(
        "PUT",
        `telegramBindTokens/${bindToken}`,
        {
          token: bindToken,

          status: "pending",

          createdAt,

          expiresAt,

          telegramId: null,

          profile: null
        }
      );

      const botLink =
        `https://t.me/${BOT_USERNAME}?start=${encodeURIComponent(bindToken)}`;

      return res.json({
        ok: true,

        token: bindToken,

        botLink,

        expiresAt
      });

    } catch (error) {

      console.error(
        "Telegram bind-start error:",
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          error.message ||
          "Could not start Telegram binding."
      });
    }
  }
);


/* =========================================================
   TELEGRAM BIND STATUS
========================================================= */

app.get(
  "/api/telegram/bind-status/:token",
  async (req, res) => {

    try {

      const token =
        String(
          req.params.token || ""
        ).trim();

      if (!token) {
        return res.status(400).json({
          ok: false,
          error:
            "Binding token is required."
        });
      }

      const data =
        await firebase(
          "GET",
          `telegramBindTokens/${token}`
        );

      if (!data) {
        return res.status(404).json({
          ok: false,
          error:
            "Binding session not found."
        });
      }

      if (
        data.expiresAt &&
        Date.now() > Number(data.expiresAt)
      ) {

        return res.json({
          ok: true,
          status: "expired"
        });
      }

      if (
        data.status !== "bound" ||
        !data.profile
      ) {

        return res.json({
          ok: true,
          status: "pending"
        });
      }

      /*
        Create permanent session
        after Telegram binding.
      */

      const sessionToken =
        generateTelegramSessionToken();

      const sessionCreated =
        Date.now();

      const sessionExpires =
        sessionCreated +
        TELEGRAM_SESSION_EXPIRY;

      await firebase(
        "PUT",
        `telegramSessions/${sessionToken}`,
        {
          sessionToken,

          telegramId:
            data.profile.telegramId,

          profile:
            data.profile,

          createdAt:
            sessionCreated,

          expiresAt:
            sessionExpires,

          active: true
        }
      );

      /*
        Remove bind token after
        successful session creation.
      */

      await firebase(
        "PATCH",
        `telegramBindTokens/${token}`,
        {
          status: "completed",

          sessionCreatedAt:
            nowISO(),

          sessionToken: null
        }
      );

      return res.json({
        ok: true,

        status: "verified",

        sessionToken,

        profile:
          data.profile
      });

    } catch (error) {

      console.error(
        "Telegram bind-status error:",
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          error.message ||
          "Binding status check failed."
      });
    }
  }
);


/* =========================================================
   VERIFY SAVED TELEGRAM SESSION
========================================================= */

app.post(
  "/api/telegram/verify-session",
  async (req, res) => {

    try {

      const sessionToken =
        String(
          req.body?.sessionToken || ""
        ).trim();

      if (!sessionToken) {
        return res.status(401).json({
          ok: false,
          verified: false,
          error:
            "Telegram session missing."
        });
      }

      const session =
        await firebase(
          "GET",
          `telegramSessions/${sessionToken}`
        );

      if (!session) {
        return res.status(401).json({
          ok: false,
          verified: false,
          error:
            "Telegram session not found."
        });
      }

      if (
        session.active !== true
      ) {
        return res.status(401).json({
          ok: false,
          verified: false,
          error:
            "Telegram session is inactive."
        });
      }

      if (
        session.expiresAt &&
        Date.now() >
          Number(session.expiresAt)
      ) {

        await firebase(
          "PATCH",
          `telegramSessions/${sessionToken}`,
          {
            active: false
          }
        );

        return res.status(401).json({
          ok: false,
          verified: false,
          error:
            "Telegram session expired."
        });
      }

      /*
        Refresh expiry.
      */

      const newExpiry =
        Date.now() +
        TELEGRAM_SESSION_EXPIRY;

      await firebase(
        "PATCH",
        `telegramSessions/${sessionToken}`,
        {
          expiresAt: newExpiry,
          lastVerifiedAt: nowISO()
        }
      );

      return res.json({
        ok: true,

        verified: true,

        profile:
          session.profile,

        expiresAt:
          newExpiry
      });

    } catch (error) {

      console.error(
        "Telegram session verify error:",
        error
      );

      return res.status(500).json({
        ok: false,
        verified: false,
        error:
          error.message ||
          "Telegram verification failed."
      });
    }
  }
);


/* =========================================================
   TELEGRAM PROFILE PHOTO PROXY
========================================================= */

app.get(
  "/api/telegram/photo/:fileId",
  async (req, res) => {

    try {

      const fileId =
        String(
          req.params.fileId || ""
        ).trim();

      if (!fileId) {
        return res.status(400).end();
      }

      const file =
        await telegram(
          "getFile",
          {
            file_id: fileId
          }
        );

      if (
        !file ||
        !file.file_path
      ) {
        return res.status(404).end();
      }

      const photoResponse =
        await fetch(
          `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`
        );

      if (!photoResponse.ok) {
        return res.status(404).end();
      }

      const contentType =
        photoResponse.headers.get(
          "content-type"
        ) ||
        "image/jpeg";

      res.setHeader(
        "Content-Type",
        contentType
      );

      res.setHeader(
        "Cache-Control",
        "public, max-age=86400"
      );

      const buffer =
        Buffer.from(
          await photoResponse.arrayBuffer()
        );

      return res.send(buffer);

    } catch (error) {

      console.error(
        "Telegram photo proxy error:",
        error.message
      );

      return res.status(404).end();
    }
  }
);


/* =========================================================
   TELEGRAM BIND MESSAGE
========================================================= */

async function handleTelegramBindMessage(
  message
) {

  try {

    if (!message) {
      return;
    }

    const text =
      String(
        message.text || ""
      ).trim();

    if (!text) {
      return;
    }

    /*
      Only /start bind_xxx
    */

    const match =
      text.match(
        /^\/start(?:@\w+)?\s+(bind_[A-Za-z0-9]+)$/i
      );

    if (!match) {
      return;
    }

    const bindToken =
      match[1];

    const telegramUser =
      message.from;

    if (!telegramUser?.id) {
      return;
    }

    const bindData =
      await firebase(
        "GET",
        `telegramBindTokens/${bindToken}`
      );

    if (!bindData) {

      await telegram(
        "sendMessage",
        {
          chat_id:
            message.chat.id,

          text:
            "❌ Binding session not found.\n\nPlease go back to the website and press Bind Telegram again."
        }
      );

      return;
    }

    if (
      bindData.status !==
      "pending"
    ) {

      await telegram(
        "sendMessage",
        {
          chat_id:
            message.chat.id,

          text:
            "⚠️ This binding session has already been used or completed."
        }
      );

      return;
    }

    if (
      bindData.expiresAt &&
      Date.now() >
        Number(bindData.expiresAt)
    ) {

      await firebase(
        "PATCH",
        `telegramBindTokens/${bindToken}`,
        {
          status: "expired"
        }
      );

      await telegram(
        "sendMessage",
        {
          chat_id:
            message.chat.id,

          text:
            "⌛ This binding session expired.\n\nPlease start a new binding from the website."
        }
      );

      return;
    }

    const profile =
      await createTelegramProfile(
        telegramUser
      );

    await firebase(
      "PATCH",
      `telegramBindTokens/${bindToken}`,
      {
        status: "bound",

        telegramId:
          profile.telegramId,

        profile,

        boundAt:
          nowISO(),

        telegramChatId:
          String(
            message.chat.id
          )
      }
    );

    /*
      Permanent Telegram user record.
    */

    await firebase(
      "PUT",
      `telegramUsers/${profile.telegramId}`,
      {
        ...profile,

        telegramChatId:
          String(
            message.chat.id
          ),

        lastBoundAt:
          nowISO(),

        active: true
      }
    );

    /*
      Confirmation inside Telegram.
    */

    const usernameText =
      profile.username
        ? `@${profile.username}`
        : "No username";

    await telegram(
      "sendMessage",
      {
        chat_id:
          message.chat.id,

        text:
`✅ Telegram Binding Successful

👤 Name: ${profile.name}
🔹 Username: ${usernameText}
🆔 Telegram ID: ${profile.telegramId}

You can now return to the website.

Your Telegram account has been verified automatically.`
      }
    );

    /*
      ADMIN NOTIFICATION
    */

    const adminText =
`<b>🔗 NEW TELEGRAM BINDING</b>

━━━━━━━━━━━━━━━━━━━━

👤 <b>Name:</b>
${escapeHTML(profile.name)}

🔹 <b>Username:</b>
${escapeHTML(
  profile.username
    ? "@" + profile.username
    : "No username"
)}

🆔 <b>Telegram ID:</b>
<code>${escapeHTML(
  profile.telegramId
)}</code>

📸 <b>Profile Photo:</b>
${
  profile.photoFileId
    ? "Available"
    : "Not available"
}

🕐 <b>Time:</b>
${escapeHTML(
  readableTime()
)}

━━━━━━━━━━━━━━━━━━━━`;

    try {

      if (
        profile.photoFileId
      ) {

        const file =
          await telegram(
            "getFile",
            {
              file_id:
                profile.photoFileId
            }
          );

        if (
          file?.file_path
        ) {

          const photoResponse =
            await fetch(
              `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`
            );

          if (
            photoResponse.ok
          ) {

            const buffer =
              Buffer.from(
                await photoResponse.arrayBuffer()
              );

            await sendTelegramPhoto(
              buffer,
              "telegram-profile.jpg",
              photoResponse.headers.get(
                "content-type"
              ) ||
                "image/jpeg",
              adminText
            );

          } else {

            await telegram(
              "sendMessage",
              {
                chat_id:
                  ADMIN_TELEGRAM_ID,

                text:
                  adminText,

                parse_mode:
                  "HTML"
              }
            );
          }

        } else {

          await telegram(
            "sendMessage",
            {
              chat_id:
                ADMIN_TELEGRAM_ID,

              text:
                adminText,

              parse_mode:
                "HTML"
            }
          );
        }

      } else {

        await telegram(
          "sendMessage",
          {
            chat_id:
              ADMIN_TELEGRAM_ID,

            text:
              adminText,

            parse_mode:
              "HTML"
          }
        );
      }

    } catch (adminError) {

      console.error(
        "Admin Telegram binding notification error:",
        adminError.message
      );
    }

    console.log(
      "================================"
    );

    console.log(
      "🔗 TELEGRAM ACCOUNT BOUND"
    );

    console.log(
      "Name:",
      profile.name
    );

    console.log(
      "Username:",
      profile.username
    );

    console.log(
      "Telegram ID:",
      profile.telegramId
    );

    console.log(
      "================================"
    );

  } catch (error) {

    console.error(
      "❌ Telegram bind message error:",
      error
    );
  }
}
