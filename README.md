# Konoha WhatsApp Bot 🍃

A WhatsApp bot that can tag all members in a group chat.

## Installation

```bash
npm install
```

## Usage

1. **Start the bot:**
   ```bash
   npm start
   ```

2. **Authenticate:**
   - A QR code will appear in the terminal
   - Open WhatsApp on your phone
   - Go to Settings → Linked Devices → Link a Device
   - Scan the QR code

3. **Use in groups:**
   - `!everyone` - Tag all group members
   - `!tagall` - Tag all group members
   - `@everyone` - Tag all group members
   - `!help` - Show available commands

## Session Persistence

After the first QR scan, your session is saved in `.wwebjs_auth/`. You won't need to scan again unless you delete this folder.

## Notes

⚠️ **Use responsibly** - Avoid spamming to prevent account restrictions.
