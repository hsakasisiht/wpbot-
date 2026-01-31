const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

// Initialize WhatsApp client with local authentication
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--disable-gpu'
        ]
    }
});

// ==================== SUBSCRIPTION STORAGE ====================
const SUBS_FILE = path.join(__dirname, 'subscriptions.json');

function loadSubscriptions() {
    try {
        if (fs.existsSync(SUBS_FILE)) {
            return JSON.parse(fs.readFileSync(SUBS_FILE, 'utf8'));
        }
    } catch (error) {
        console.error('Error loading subscriptions:', error);
    }
    return { subscriptions: [] };
}

function saveSubscriptions(data) {
    try {
        fs.writeFileSync(SUBS_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error saving subscriptions:', error);
    }
}

// ==================== QR & AUTH EVENTS ====================
client.on('qr', (qr) => {
    console.log('\n📱 Scan this QR code with WhatsApp to login:\n');
    qrcode.generate(qr, { small: true });
    console.log('\nWaiting for authentication...\n');
});

client.on('authenticated', () => {
    console.log('✅ Authentication successful!');
});

client.on('ready', () => {
    console.log('🚀 Konoha WhatsApp Bot is ready!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Commands:');
    console.log('  .everyone   - Tag all group members');
    console.log('  .addsub     - Add subscription');
    console.log('  .modsub     - Modify subscription');
    console.log('  .delsub     - Delete subscription');
    console.log('  .listsubs   - List all subscriptions');
    console.log('  .help       - Show help message');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Start subscription checker
    checkSubscriptions();
    setInterval(checkSubscriptions, 60 * 60 * 1000); // Check every hour
});

// ==================== SUBSCRIPTION NOTIFICATION ====================
async function checkSubscriptions() {
    const data = loadSubscriptions();
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    console.log(`📅 Checking subscriptions... (${today})`);

    for (const sub of data.subscriptions) {
        if (sub.expiryDate === today && !sub.notified) {
            try {
                // Send notification to buyer
                const chatId = sub.id.includes('@c.us') ? sub.id : `${sub.id}@c.us`;
                await client.sendMessage(chatId,
                    `⚠️ *Subscription Expiry Notice*\n\n` +
                    `Hi ${sub.name}!\n\n` +
                    `Your subscription for *${sub.botName}* expires today (${sub.expiryDate}).\n\n` +
                    `Please renew to continue using the service.`
                );

                // Mark as notified
                sub.notified = true;
                saveSubscriptions(data);

                console.log(`✅ Notified ${sub.name} about ${sub.botName} expiry`);
            } catch (error) {
                console.error(`Failed to notify ${sub.name}:`, error.message);
            }
        }
    }
}

// ==================== MESSAGE HANDLER ====================
client.on('message', async (message) => {
    try {
        const chat = await message.getChat();
        const body = message.body.trim();
        const bodyLower = body.toLowerCase();

        // Tag all command
        if (bodyLower === '.everyone' || bodyLower === '@everyone' || bodyLower === '.tagall') {
            await handleTagAll(message, chat);
        }
        // Subscription commands
        else if (bodyLower.startsWith('.addsub ')) {
            await handleAddSub(message, body);
        }
        else if (bodyLower.startsWith('.modsub ')) {
            await handleModSub(message, body);
        }
        else if (bodyLower.startsWith('.delsub ')) {
            await handleDelSub(message, body);
        }
        else if (bodyLower === '.listsubs') {
            await handleListSubs(message);
        }
        else if (bodyLower === '.help') {
            await handleHelp(message);
        }
    } catch (error) {
        console.error('Error handling message:', error);
    }
});

// ==================== TAG ALL ====================
async function handleTagAll(message, chat) {
    if (!chat.isGroup) {
        await message.reply('❌ This command only works in group chats!');
        return;
    }

    try {
        const participants = chat.participants;
        if (!participants || participants.length === 0) {
            await message.reply('❌ Could not fetch group members.');
            return;
        }

        let mentions = [];
        let mentionText = '📢 *Attention Everyone!*\n\n';

        for (const participant of participants) {
            const contact = await client.getContactById(participant.id._serialized);
            mentions.push(contact);
            mentionText += `@${participant.id.user} `;
        }

        await chat.sendMessage(mentionText, { mentions });
        console.log(`✅ Tagged ${mentions.length} members in "${chat.name}"`);
    } catch (error) {
        console.error('Error in tagall:', error);
        await message.reply('❌ An error occurred while tagging members.');
    }
}

// ==================== ADD SUBSCRIPTION ====================
// Usage: .addsub 919876543210 John Doe | Bot Name | 2026-02-15
async function handleAddSub(message, body) {
    const args = body.slice(8).trim(); // Remove ".addsub "
    const parts = args.split('|').map(p => p.trim());

    if (parts.length !== 3) {
        await message.reply(
            '❌ *Invalid format!*\n\n' +
            '*Usage:* `.addsub <phone> <name> | <bot_name> | <expiry_date>`\n\n' +
            '*Example:*\n`.addsub 919876543210 John Doe | Trading Bot | 2026-02-15`'
        );
        return;
    }

    // Parse phone and name from first part
    const firstPart = parts[0];
    const spaceIndex = firstPart.indexOf(' ');
    if (spaceIndex === -1) {
        await message.reply('❌ Please provide both phone number and name.');
        return;
    }

    const phone = firstPart.slice(0, spaceIndex).replace(/[^0-9]/g, '');
    const name = firstPart.slice(spaceIndex + 1).trim();
    const botName = parts[1];
    const expiryDate = parts[2];

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) {
        await message.reply('❌ Date must be in YYYY-MM-DD format (e.g., 2026-02-15)');
        return;
    }

    const data = loadSubscriptions();

    // Check if already exists
    const existing = data.subscriptions.find(s => s.id === phone && s.botName === botName);
    if (existing) {
        await message.reply(`❌ Subscription already exists for ${name} - ${botName}. Use \`.modsub\` to modify.`);
        return;
    }

    // Add new subscription
    data.subscriptions.push({
        id: phone,
        name: name,
        botName: botName,
        expiryDate: expiryDate,
        notified: false
    });

    saveSubscriptions(data);

    await message.reply(
        `✅ *Subscription Added!*\n\n` +
        `👤 *Name:* ${name}\n` +
        `📱 *Phone:* ${phone}\n` +
        `🤖 *Bot:* ${botName}\n` +
        `📅 *Expires:* ${expiryDate}`
    );

    console.log(`✅ Added subscription: ${name} - ${botName} (${expiryDate})`);
}

// ==================== MODIFY SUBSCRIPTION ====================
// Usage: .modsub 919876543210 | 2026-03-15
// or: .modsub 919876543210 | Bot Name | 2026-03-15
async function handleModSub(message, body) {
    const args = body.slice(8).trim(); // Remove ".modsub "
    const parts = args.split('|').map(p => p.trim());

    if (parts.length < 2) {
        await message.reply(
            '❌ *Invalid format!*\n\n' +
            '*Usage:* `.modsub <phone> | <new_expiry_date>`\n' +
            '*Or:* `.modsub <phone> | <bot_name> | <new_expiry_date>`\n\n' +
            '*Example:*\n`.modsub 919876543210 | 2026-03-15`'
        );
        return;
    }

    const phone = parts[0].replace(/[^0-9]/g, '');
    let botName = null;
    let newDate;

    if (parts.length === 2) {
        newDate = parts[1];
    } else {
        botName = parts[1];
        newDate = parts[2];
    }

    // Validate date
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
        await message.reply('❌ Date must be in YYYY-MM-DD format (e.g., 2026-03-15)');
        return;
    }

    const data = loadSubscriptions();
    let found = false;
    let modifiedSub = null;

    for (const sub of data.subscriptions) {
        if (sub.id === phone && (!botName || sub.botName === botName)) {
            sub.expiryDate = newDate;
            sub.notified = false; // Reset notification
            found = true;
            modifiedSub = sub;
            break;
        }
    }

    if (!found) {
        await message.reply(`❌ No subscription found for phone: ${phone}`);
        return;
    }

    saveSubscriptions(data);

    await message.reply(
        `✅ *Subscription Modified!*\n\n` +
        `👤 *Name:* ${modifiedSub.name}\n` +
        `🤖 *Bot:* ${modifiedSub.botName}\n` +
        `📅 *New Expiry:* ${newDate}`
    );

    console.log(`✅ Modified subscription: ${modifiedSub.name} - ${newDate}`);
}

// ==================== DELETE SUBSCRIPTION ====================
// Usage: .delsub 919876543210
// or: .delsub 919876543210 | Bot Name
async function handleDelSub(message, body) {
    const args = body.slice(8).trim(); // Remove ".delsub "
    const parts = args.split('|').map(p => p.trim());

    const phone = parts[0].replace(/[^0-9]/g, '');
    const botName = parts[1] || null;

    if (!phone) {
        await message.reply(
            '❌ *Invalid format!*\n\n' +
            '*Usage:* `.delsub <phone>`\n' +
            '*Or:* `.delsub <phone> | <bot_name>`\n\n' +
            '*Example:*\n`.delsub 919876543210`'
        );
        return;
    }

    const data = loadSubscriptions();
    const initialLength = data.subscriptions.length;

    if (botName) {
        data.subscriptions = data.subscriptions.filter(
            s => !(s.id === phone && s.botName === botName)
        );
    } else {
        data.subscriptions = data.subscriptions.filter(s => s.id !== phone);
    }

    const deleted = initialLength - data.subscriptions.length;

    if (deleted === 0) {
        await message.reply(`❌ No subscription found for phone: ${phone}`);
        return;
    }

    saveSubscriptions(data);

    await message.reply(`✅ Deleted ${deleted} subscription(s) for phone: ${phone}`);
    console.log(`✅ Deleted ${deleted} subscription(s) for ${phone}`);
}

// ==================== LIST SUBSCRIPTIONS ====================
async function handleListSubs(message) {
    const data = loadSubscriptions();

    if (data.subscriptions.length === 0) {
        await message.reply('📋 No subscriptions found.');
        return;
    }

    // Sort by expiry date
    const sorted = [...data.subscriptions].sort((a, b) =>
        new Date(a.expiryDate) - new Date(b.expiryDate)
    );

    let text = `📋 *Subscriptions (${sorted.length})*\n\n`;

    for (const sub of sorted) {
        const isExpired = new Date(sub.expiryDate) < new Date();
        const status = isExpired ? '🔴' : '🟢';
        text += `${status} *${sub.name}*\n`;
        text += `   📱 ${sub.id}\n`;
        text += `   🤖 ${sub.botName}\n`;
        text += `   📅 ${sub.expiryDate}${isExpired ? ' (EXPIRED)' : ''}\n\n`;
    }

    await message.reply(text);
}

// ==================== HELP ====================
async function handleHelp(message) {
    const helpText = `
🤖 *Konoha WhatsApp Bot - Commands*

📢 *Tag Everyone:*
• \`.everyone\` - Tag all group members
• \`.tagall\` - Tag all group members
• \`@everyone\` - Tag all group members

📋 *Subscription Management:*
• \`.addsub <phone> <name> | <bot> | <date>\`
  _Add a new subscription_
• \`.modsub <phone> | <new_date>\`
  _Modify expiry date_
• \`.delsub <phone>\`
  _Delete subscription_
• \`.listsubs\`
  _List all subscriptions_

ℹ️ *Info:*
• \`.help\` - Show this message

_Date format: YYYY-MM-DD (e.g., 2026-02-15)_
`;
    await message.reply(helpText);
}

// ==================== ERROR HANDLERS ====================
client.on('disconnected', (reason) => {
    console.log('❌ Client disconnected:', reason);
    console.log('Attempting to reconnect...');
    client.initialize();
});

client.on('auth_failure', (error) => {
    console.error('❌ Authentication failed:', error);
});

// ==================== START ====================
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  🍃 Konoha WhatsApp Bot');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('\n⏳ Initializing...\n');

client.initialize();
