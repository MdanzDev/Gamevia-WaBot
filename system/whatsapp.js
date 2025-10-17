require('./config');
const { 
    default: baileys,
    proto,
    getContentType,
    generateWAMessage,
    generateWAMessageFromContent,
    generateWAMessageContent,
    prepareWAMessageMedia,
    downloadContentFromMessage
} = require("@whiskeysockets/baileys");
const fs = require('fs-extra');
const chalk = require('chalk');
const fetch = require('node-fetch');

const API_KEY = "API-GVCDEAD0E38EA13632";
const API_BASE_URL = "https://api.gamevia.shop/v1";

class GameViaBot {
    constructor() {
        this.userRegistry = this.loadJSON('./system/database/users.json');
        this.resellers = this.loadJSON('./system/database/resellers.json');
        this.premiumUsers = this.loadJSON('./system/database/premium.json');
        this.orderSessions = {};
        this.orders = this.loadJSON('./system/database/orders.json');
        
        // Game configuration
        this.games = {};
        this.loadGames();
    }

    loadJSON(path) {
        try {
            return fs.existsSync(path) ? JSON.parse(fs.readFileSync(path)) : {};
        } catch (error) {
            console.error(`Error loading ${path}:`, error);
            return {};
        }
    }

    saveJSON(path, data) {
        try {
            fs.ensureFileSync(path);
            fs.writeFileSync(path, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error(`Error saving ${path}:`, error);
        }
    }

    async loadGames() {
        try {
            const response = await this.apiCall('check_games.php');
            if (response.success) {
                this.games = response.games.reduce((acc, game) => {
                    acc[game.slug] = game;
                    return acc;
                }, {});
                console.log(chalk.green('✓ Games loaded successfully'));
            }
        } catch (error) {
            console.error(chalk.red('✗ Failed to load games:'), error);
        }
    }

    async apiCall(endpoint, body = null) {
        try {
            const response = await fetch(`${API_BASE_URL}/${endpoint}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-api-key": API_KEY
                },
                body: body ? JSON.stringify(body) : undefined
            });
            return await response.json();
        } catch (error) {
            console.error(`API call failed for ${endpoint}:`, error);
            return { success: false, message: "API connection failed" };
        }
    }

    async handleMessage(rikz, m, chatUpdate, store) {
        try {
            const body = this.getMessageBody(m);
            await this.logMessage(m, body);
            
            if (m.message) {
                rikz.readMessages([m.key]);
            }

            const { prefix, isCmd, command, args, text } = this.parseCommand(body);
            
            if (!isCmd) return;

            const botNumber = await rikz.decodeJid(rikz.user.id);
            const isCreator = this.isCreator(m.sender, botNumber);

            // Update data from files
            this.userRegistry = this.loadJSON('./system/database/users.json');
            this.resellers = this.loadJSON('./system/database/resellers.json');

            await this.handleCommand(rikz, m, { prefix, command, args, text, isCreator });
            
        } catch (error) {
            console.error(chalk.red('Error in handleMessage:'), error);
        }
    }

    getMessageBody(m) {
        const messageTypes = {
            "conversation": m.message?.conversation,
            "imageMessage": m.message?.imageMessage?.caption,
            "videoMessage": m.message?.videoMessage?.caption,
            "extendedTextMessage": m.message?.extendedTextMessage?.text,
            "buttonsResponseMessage": m.message?.buttonsResponseMessage?.selectedButtonId,
            "listResponseMessage": m.message?.listResponseMessage?.singleSelectReply?.selectedRowId,
            "interactiveResponseMessage": m.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson 
                ? JSON.parse(m.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson).id 
                : null,
            "templateButtonReplyMessage": m.message?.templateButtonReplyMessage?.selectedId
        };

        return messageTypes[m.mtype] || m.text || "";
    }

    parseCommand(body) {
        if (typeof body !== "string") {
            return { prefix: "", isCmd: false, command: "", args: [], text: "" };
        }

        const prefix = global.prefix.find(p => body.startsWith(p)) || "";
        const isCmd = !!prefix;
        const commandStr = isCmd ? body.slice(prefix.length).trim() : "";
        const [command, ...args] = commandStr.split(/ +/);
        
        return {
            prefix,
            isCmd,
            command: command?.toLowerCase() || "",
            args,
            text: args.join(" ")
        };
    }

    isCreator(sender, botNumber) {
        const creatorNumbers = [botNumber, ...global.owner].map(v => 
            v.replace(/[^0-9]/g, "") + "@s.whatsapp.net"
        );
        return creatorNumbers.includes(sender);
    }

    async logMessage(m, body) {
        const groupName = m.chat.endsWith("@g.us") 
            ? (await this.getGroupMetadata(m.chat)) 
            : "";

        console.log("┏━━━━━━━━━━━━━━━━━━━━━━━=");
        console.log(`┃¤ ${chalk.hex("#FFD700").bold("📩 NEW MESSAGE")} ${chalk.hex("#00FFFF").bold(`[${new Date().toLocaleTimeString()}]`)}`);
        console.log(`┃¤ ${chalk.hex("#FF69B4")("💌 From:")} ${chalk.hex("#FFFFFF")(`${m.pushName} (${m.sender})`)}`);
        console.log(`┃¤ ${chalk.hex("#FFA500")("📍 In:")} ${chalk.hex("#FFFFFF")(`${groupName || "Private Chat"}`)}`);
        console.log(`┃¤ ${chalk.hex("#00FF00")("📝 Message:")} ${chalk.hex("#FFFFFF")(`${body || m?.mtype || "Unknown"}`)}`);
        console.log("┗━━━━━━━━━━━━━━━━━━━━━━━=");
    }

    async getGroupMetadata(chatId) {
        try {
            // This would need to be implemented based on your baileys setup
            return "Group Chat";
        } catch (error) {
            return "Group Chat";
        }
    }

    async handleCommand(rikz, m, { command, args, text, isCreator }) {
        const commandHandlers = {
            'register': () => this.handleRegister(rikz, m),
            'menu': () => this.showMainMenu(rikz, m),
            'help': () => this.showHelp(rikz, m),
            'price': () => this.showGameList(rikz, m),
            'addreseller': () => this.handleAddReseller(rikz, m, args, isCreator),
            'addbalance': () => this.handleAddBalance(rikz, m, args, isCreator),
            'history': () => this.showHistory(rikz, m),
            'account': () => this.showAccountInfo(rikz, m),
            'games': () => this.showAvailableGames(rikz, m)
        };

        // Dynamic command handlers
        if (command.startsWith('select-')) {
            await this.handleGameSelection(rikz, m, command);
        } else if (command.startsWith('order-')) {
            await this.handleProductSelection(rikz, m, command);
        } else if (command === 'id') {
            await this.handleQuickOrder(rikz, m, args);
        } else if (command === 'confirm') {
            await this.handleOrderConfirmation(rikz, m);
        } else if (command === 'change') {
            await this.handleOrderChange(rikz, m);
        } else if (this.orderSessions[m.sender]?.step === 'awaiting_ids') {
            await this.handleUserInput(rikz, m, args);
        } else if (commandHandlers[command]) {
            await commandHandlers[command]();
        }
    }

    // Command Handlers
    async handleRegister(rikz, m) {
        if (this.userRegistry[m.sender]) {
            return rikz.sendMessage(m.chat, { text: "You're already registered." }, { quoted: m });
        }

        this.userRegistry[m.sender] = {
            name: m.pushName || "User",
            role: "User",
            registeredAt: new Date().toISOString()
        };

        this.saveJSON('./system/database/users.json', this.userRegistry);
        
        rikz.sendMessage(m.chat, { 
            text: `✅ Registered successfully as ${this.userRegistry[m.sender].name}` 
        }, { quoted: m });
    }

    async showMainMenu(rikz, m) {
        const buttons = [
            { buttonId: '.help', buttonText: { displayText: '📖 Help' }, type: 1 },
            { buttonId: '.price', buttonText: { displayText: '💰 Prices' }, type: 1 },
            { buttonId: '.games', buttonText: { displayText: '🎮 Games' }, type: 1 },
            { buttonId: '.account', buttonText: { displayText: '👤 Account' }, type: 1 }
        ];

        rikz.sendMessage(m.chat, {
            text: `🎮 *GameVia Bot*\n\nHello ${m.pushName || "User"}! Welcome to our top-up service.`,
            footer: 'Powered by GameVia API',
            buttons,
            headerType: 1
        }, { quoted: m });
    }

    async showHelp(rikz, m) {
        const helpText = `*🤖 GameVia Bot Commands*

*Basic Commands:*
• .menu - Main menu
• .help - Show this help
• .register - Register your account
• .price - View game prices
• .games - List available games

*Order Commands:*
• .id <user_id> <zone_id> <product_code> - Quick order
• .history - View order history
• .account - Account information

*Reseller Commands (Owner):*
• .addreseller <id> - Add reseller
• .addbalance <id> <amount> - Add balance

*How to Order:*
1. Use .price to see available games
2. Select a game and product
3. Provide your game ID and zone ID
4. Confirm your order`;

        rikz.sendMessage(m.chat, {
            text: helpText,
            footer: 'Traxc Bot 4.0 - GameVia Integration',
            buttons: [{ buttonId: '.menu', buttonText: { displayText: '🏠 Main Menu' }, type: 1 }],
            headerType: 1
        }, { quoted: m });
    }

    async showAvailableGames(rikz, m) {
        if (Object.keys(this.games).length === 0) {
            await this.loadGames();
        }

        const buttons = Object.values(this.games).map(game => ({
            buttonId: `select-${game.slug}`,
            buttonText: { displayText: game.name },
            type: 1
        }));

        rikz.sendMessage(m.chat, {
            text: "🎮 *Available Games*\nSelect a game to view products:",
            footer: "Powered by GameVia",
            buttons,
            headerType: 1
        }, { quoted: m });
    }

    async showGameList(rikz, m) {
        if (!this.userRegistry[m.sender]) {
            return rikz.sendMessage(m.chat, { 
                text: "Please register first using .register" 
            }, { quoted: m });
        }

        await this.showAvailableGames(rikz, m);
    }

    async handleGameSelection(rikz, m, command) {
        const slug = command.replace('select-', '');
        
        if (!this.games[slug]) {
            return rikz.sendMessage(m.chat, { text: "Game not found." }, { quoted: m });
        }

        try {
            const data = await this.apiCall('get_products.php', { slug });
            
            if (!data.success || !data.products?.length) {
                return rikz.sendMessage(m.chat, { text: "No products available for this game." }, { quoted: m });
            }

            const productButtons = data.products.map(product => {
                const profitPrice = (product.price * 1.02).toFixed(2); // 2% profit
                return {
                    buttonId: `order-${slug}-${product.srv_code}`,
                    buttonText: { displayText: `${product.name} - RM${profitPrice}` },
                    type: 1
                };
            });

            // Add back button
            productButtons.push({
                buttonId: '.price',
                buttonText: { displayText: '⬅️ Back' },
                type: 1
            });

            rikz.sendMessage(m.chat, {
                text: `🎮 *${data.game_name} Products*\n*Prices include 2% service fee*`,
                footer: 'Select a product to order',
                buttons: productButtons,
                headerType: 1
            }, { quoted: m });

        } catch (error) {
            console.error(error);
            rikz.sendMessage(m.chat, { text: "Failed to fetch products." }, { quoted: m });
        }
    }

    async handleProductSelection(rikz, m, command) {
        const [_, slug, srvCode] = command.split('-');
        
        if (!this.games[slug]) {
            return rikz.sendMessage(m.chat, { text: "Invalid game selection." }, { quoted: m });
        }

        this.orderSessions[m.sender] = {
            step: "awaiting_ids",
            gameSlug: slug,
            productCode: srvCode,
            timestamp: Date.now()
        };

        const gameName = this.games[slug]?.name || slug;
        rikz.sendMessage(m.chat, { 
            text: `📝 *Order Setup for ${gameName}*\n\nPlease provide your:\n*USER_ID* and *ZONE_ID*\n\nFormat: user_id zone_id\nExample: 12345 1` 
        }, { quoted: m });
    }

    async handleQuickOrder(rikz, m, args) {
        if (args.length < 3) {
            return rikz.sendMessage(m.chat, { 
                text: "❌ *Incorrect Format*\n\nUsage: .id USER_ID ZONE_ID PRODUCT_CODE\nExample: .id 12345 1 ML12" 
            }, { quoted: m });
        }

        const [userId, zoneId, productCode] = args;
        
        this.orderSessions[m.sender] = {
            step: "awaiting_confirmation",
            gameSlug: "mlbb", // Default to MLBB for quick orders
            productCode: productCode,
            orderData: { user_id: userId, zone_id: zoneId },
            timestamp: Date.now()
        };

        await this.showOrderConfirmation(rikz, m);
    }

    async handleUserInput(rikz, m, args) {
        const session = this.orderSessions[m.sender];
        
        if (args.length < 2) {
            return rikz.sendMessage(m.chat, { 
                text: "❌ *Incomplete Information*\n\nPlease provide both USER_ID and ZONE_ID\nFormat: user_id zone_id" 
            }, { quoted: m });
        }

        session.step = "awaiting_confirmation";
        session.orderData = { user_id: args[0], zone_id: args[1] };

        await this.showOrderConfirmation(rikz, m);
    }

    async showOrderConfirmation(rikz, m) {
        const session = this.orderSessions[m.sender];
        const gameName = this.games[session.gameSlug]?.name || session.gameSlug;

        const confirmationText = `✅ *Order Information Received*\n
🎮 *Game:* ${gameName}
📦 *Product:* ${session.productCode}
👤 *USER_ID:* ${session.orderData.user_id}
📍 *ZONE_ID:* ${session.orderData.zone_id}\n
Please confirm your order:`;

        rikz.sendMessage(m.chat, {
            text: confirmationText,
            footer: "Check the information above before confirming",
            buttons: [
                { buttonId: 'confirm', buttonText: { displayText: '✅ Confirm Order' }, type: 1 },
                { buttonId: 'change', buttonText: { displayText: '✏️ Change Info' }, type: 1 }
            ],
            headerType: 1
        }, { quoted: m });
    }

    async handleOrderConfirmation(rikz, m) {
        const session = this.orderSessions[m.sender];
        
        if (!session || session.step !== "awaiting_confirmation") {
            return rikz.sendMessage(m.chat, { text: "No pending order to confirm." }, { quoted: m });
        }

        try {
            // Place order via API
            const orderData = {
                srv_code: session.productCode,
                user_id: session.orderData.user_id,
                zone_id: session.orderData.zone_id
            };

            const result = await this.apiCall('order.php', orderData);

            if (result.success) {
                const orderId = result.custom_order_id;
                
                // Save order to database
                if (!this.orders[m.sender]) this.orders[m.sender] = [];
                this.orders[m.sender].push({
                    id: orderId,
                    gameSlug: session.gameSlug,
                    product: session.productCode,
                    ...session.orderData,
                    price: result.amount,
                    status: result.status,
                    timestamp: new Date().toISOString(),
                    description: result.description
                });

                this.saveJSON('./system/database/orders.json', this.orders);

                const successText = `🎉 *Order Successful!*\n
📦 *Order ID:* ${orderId}
🎮 *Game:* ${this.games[session.gameSlug]?.name || session.gameSlug}
💎 *Product:* ${session.productCode}
👤 *USER_ID:* ${session.orderData.user_id}
💰 *Amount:* RM${result.amount}
📊 *Status:* ${result.status}\n
Thank you for your order!`;

                rikz.sendMessage(m.chat, { text: successText }, { quoted: m });

            } else {
                rikz.sendMessage(m.chat, { 
                    text: `❌ *Order Failed*\n\nReason: ${result.message || "Unknown error"}` 
                }, { quoted: m });
            }

        } catch (error) {
            console.error('Order placement error:', error);
            rikz.sendMessage(m.chat, { 
                text: "❌ *Order Failed*\n\nThere was an error processing your order. Please try again." 
            }, { quoted: m });
        }

        delete this.orderSessions[m.sender];
    }

    async handleOrderChange(rikz, m) {
        const session = this.orderSessions[m.sender];
        
        if (!session || session.step !== "awaiting_confirmation") {
            return rikz.sendMessage(m.chat, { text: "No order to change." }, { quoted: m });
        }

        session.step = "awaiting_ids";
        rikz.sendMessage(m.chat, { 
            text: "🔄 *Change Order Information*\n\nPlease provide your new USER_ID and ZONE_ID:\nFormat: user_id zone_id" 
        }, { quoted: m });
    }

    async handleAddReseller(rikz, m, args, isCreator) {
        if (!isCreator) return;

        const resellerId = args[0];
        if (!resellerId) {
            return rikz.sendMessage(m.chat, { text: "Usage: .addreseller <reseller_id>" }, { quoted: m });
        }

        if (!this.resellers[resellerId]) {
            this.resellers[resellerId] = {
                balance: 0,
                history: [],
                addedAt: new Date().toISOString()
            };
            
            this.saveJSON('./system/database/resellers.json', this.resellers);
            rikz.sendMessage(m.chat, { 
                text: `✅ Reseller ${resellerId} added with RM0 balance` 
            }, { quoted: m });
        } else {
            rikz.sendMessage(m.chat, { text: "Reseller already exists." }, { quoted: m });
        }
    }

    async handleAddBalance(rikz, m, args, isCreator) {
        if (!isCreator) return;

        const [resellerId, amount] = args;
        if (!resellerId || !amount || isNaN(amount)) {
            return rikz.sendMessage(m.chat, { 
                text: "Usage: .addbalance <reseller_id> <amount>" 
            }, { quoted: m });
        }

        if (!this.resellers[resellerId]) {
            this.resellers[resellerId] = { balance: 0, history: [] };
        }

        this.resellers[resellerId].balance += parseFloat(amount);
        this.resellers[resellerId].history.push({
            type: 'balance_added',
            amount: parseFloat(amount),
            timestamp: new Date().toISOString(),
            addedBy: m.sender
        });

        this.saveJSON('./system/database/resellers.json', this.resellers);
        
        rikz.sendMessage(m.chat, { 
            text: `✅ Added RM${amount} to ${resellerId}\nNew Balance: RM${this.resellers[resellerId].balance}` 
        }, { quoted: m });
    }

    async showHistory(rikz, m) {
        let historyText = "";

        if (this.resellers[m.sender]) {
            // Reseller history
            const hist = this.resellers[m.sender].history || [];
            historyText = hist.length ? 
                hist.map(o => `• ${o.id || o.type} | ${o.amount || ''} | ${o.status || 'Completed'}`).join("\n") 
                : "No order history yet.";
            
            historyText = `📜 *Reseller Order History*\n\n${historyText}`;
        } else {
            // User history
            const userHist = this.orders[m.sender] || [];
            if (!userHist.length) {
                return rikz.sendMessage(m.chat, { text: "No orders yet." }, { quoted: m });
            }
            
            historyText = userHist.map(o => 
                `• ${o.id} | ${o.product} | RM${o.price} | ${o.status}`
            ).join("\n");
            
            historyText = `📜 *Your Order History*\n\n${historyText}`;
        }

        rikz.sendMessage(m.chat, { text: historyText }, { quoted: m });
    }

    async showAccountInfo(rikz, m) {
        try {
            const accountInfo = await this.apiCall('check_account.php');
            
            if (accountInfo.success) {
                const account = accountInfo.account;
                const accountText = `👤 *Account Information*\n
📧 *Username:* ${account.username}
📞 *Phone:* ${account.phone}
💰 *Balance:* RM${account.balance}
🎯 *Role:* ${account.role}
✅ *KYC Status:* ${account.kyc_status}
📅 *Joined:* ${account.joined_date}`;

                rikz.sendMessage(m.chat, { text: accountText }, { quoted: m });
            } else {
                rikz.sendMessage(m.chat, { 
                    text: "❌ Failed to fetch account information" 
                }, { quoted: m });
            }
        } catch (error) {
            console.error('Account info error:', error);
            rikz.sendMessage(m.chat, { 
                text: "❌ Error fetching account information" 
            }, { quoted: m });
        }
    }
}

// Initialize the bot
const gameViaBot = new GameViaBot();

// Export the handler function
module.exports = async (rikz, m, chatUpdate, store) => {
    await gameViaBot.handleMessage(rikz, m, chatUpdate, store);
};
