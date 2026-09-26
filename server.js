const express = require('express');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

// आपके Bot की डिटेल्स
const BOT_TOKEN = '8929869494:AAHX4SySbvp3QDljpwZYefdA4Q1qW_m2mzE';
const BOT_USERNAME = 'HRStudyPublishedBot';
const CHANNEL_USERNAME = '@hrbseb10thallcorse'; // आपका Telegram Channel

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Data Stores (अभी के लिए Memory में सेव हो रहा है)
const pendingBinds = new Map(); 
const activeSessions = new Map(); 

// 1. जब यूज़र Bot को /start <token> भेजेगा
bot.onText(/\/start (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const bindToken = match[1];

    if (pendingBinds.has(bindToken)) {
        let photoUrl = '';
        try {
            const photos = await bot.getUserProfilePhotos(msg.from.id);
            if (photos.total_count > 0) {
                const fileId = photos.photos[0][0].file_id;
                photoUrl = await bot.getFileLink(fileId);
            }
        } catch (e) {
            console.log("Photo fetch error:", e.message);
        }

        const userData = {
            telegramId: msg.from.id.toString(),
            firstName: msg.from.first_name,
            username: msg.from.username || 'No Username',
            photoUrl: photoUrl
        };

        pendingBinds.set(bindToken, {
            status: 'bound',
            telegramData: userData,
            sessionToken: crypto.randomBytes(16).toString('hex')
        });

        bot.sendMessage(chatId, "✅ Account successfully bound! \n\nअब वापस App/Website में जाएँ और 'Check Subscription' बटन पर क्लिक करें।");
    } else {
        bot.sendMessage(chatId, "❌ Invalid या Expired Link. कृपया App से दोबारा कोशिश करें।");
    }
});

// 2. Frontend के लिए API Routes

// Start Binding: नया Token जनरेट करता है
app.post('/api/bind/start', (req, res) => {
    const bindToken = crypto.randomBytes(8).toString('hex');
    pendingBinds.set(bindToken, { status: 'pending' });

    // 5 मिनट बाद Token Expire कर दें
    setTimeout(() => pendingBinds.delete(bindToken), 5 * 60 * 1000);

    res.json({
        success: true,
        token: bindToken,
        telegramUrl: `https://t.me/${BOT_USERNAME}?start=${bindToken}`
    });
});

// Check Status: Frontend बार-बार चेक करेगा कि यूज़र ने Bot को मैसेज किया या नहीं
app.post('/api/bind/status', (req, res) => {
    const { token } = req.body;
    const bindData = pendingBinds.get(token);

    if (!bindData) return res.json({ status: 'expired' });

    if (bindData.status === 'bound') {
        res.json({
            status: 'bound',
            subscribed: false, 
            telegramData: bindData.telegramData
        });
    } else {
        res.json({ status: 'pending' });
    }
});

// Check Subscription: चैनल join किया है या नहीं
app.post('/api/bind/check', async (req, res) => {
    const { token } = req.body;
    const bindData = pendingBinds.get(token);

    if (!bindData || bindData.status !== 'bound') {
        return res.json({ success: false, error: 'Invalid or Expired Session' });
    }

    try {
        const chatMember = await bot.getChatMember(CHANNEL_USERNAME, bindData.telegramData.telegramId);
        const isSubscribed = ['member', 'administrator', 'creator'].includes(chatMember.status);

        if (isSubscribed) {
            activeSessions.set(bindData.sessionToken, bindData.telegramData);
            pendingBinds.delete(token); // Cleanup

            res.json({
                success: true,
                subscribed: true,
                telegramData: bindData.telegramData,
                sessionToken: bindData.sessionToken
            });
        } else {
            res.json({ success: true, subscribed: false });
        }
    } catch (error) {
        console.log("Channel Check Error:", error.message);
        res.json({ success: false, error: 'Could not verify channel subscription. Ensure bot is admin in the channel.' });
    }
});

// Verify Session (जब यूज़र दोबारा App खोलेगा)
app.post('/api/bind/session', (req, res) => {
    const { sessionToken } = req.body;
    const userData = activeSessions.get(sessionToken);

    if (userData) {
        res.json({ success: true, subscribed: true, telegramData: userData });
    } else {
        res.json({ success: false, subscribed: false });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Telegram Bot Backend running on port ${PORT}`));
