const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
    model: 'gemini-1.5-flash',
    systemInstruction: "You are an automated assistant for Mr. Jayed. Answer the user's question directly, accurately, and concisely in 1 to 2 short sentences max."
});

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    const sock = makeWASocket({ auth: state });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`;
            console.log('\n==================================================');
            console.log('OPEN THIS LINK IN YOUR BROWSER TO SCAN QR CODE:');
            console.log(qrImageUrl);
            console.log('==================================================\n');
        }
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut);
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log('Bot connected successfully!');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        
        for (const msg of messages) {
            if (!msg.message || msg.key.fromMe) continue;
            
            const from = msg.key.remoteJid;
            const text = msg.message.conversation || msg.message.extendedTextMessage?.text;

            if (text) {
                try {
                    const result = await model.generateContent(text);
                    const aiResponse = await result.response.text();
                    
                    // Format response with intro message followed by Gemini's answer
                    const finalReply = `Currently Mr. Jayed is busy.\n\n${aiResponse}`;
                    await sock.sendMessage(from, { text: finalReply });
                } catch (error) {
                    console.error("Gemini Error:", error);
                    await sock.sendMessage(from, { text: "Currently Mr. Jayed is busy. Please try messaging again later." });
                }
            }
        }
    });
}

startBot();
