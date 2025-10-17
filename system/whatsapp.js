require('./config')
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

// ==================== ADVANCED SESSION MANAGER ====================
class SessionManager {
    constructor() {
        this.sessions = new Map();
        this.setupCleanupInterval();
        console.log(chalk.green('✓ Session Manager initialized'));
    }

    createSession(userId, data) {
        const sessionId = `${userId}-${Date.now()}`;
        const session = {
            id: sessionId,
            userId: userId,
            ...data,
            createdAt: Date.now(),
            lastActivity: Date.now(),
            timeout: setTimeout(() => {
                console.log(chalk.yellow(`Session timeout for ${userId}`));
                this.clearSession(userId);
            }, 15 * 60 * 1000)
        };
        
        this.sessions.set(userId, session);
        return session;
    }

    getSession(userId) {
        const session = this.sessions.get(userId);
        if (session) {
            session.lastActivity = Date.now();
        }
        return session;
    }

    updateSession(userId, updates) {
        const session = this.sessions.get(userId);
        if (session) {
            Object.assign(session, updates);
            session.lastActivity = Date.now();
            return true;
        }
        return false;
    }

    clearSession(userId) {
        const session = this.sessions.get(userId);
        if (session) {
            if (session.timeout) {
                clearTimeout(session.timeout);
            }
            this.sessions.delete(userId);
        }
    }

    setupCleanupInterval() {
        setInterval(() => {
            const now = Date.now();
            for (const [userId, session] of this.sessions) {
                if (now - session.lastActivity > 15 * 60 * 1000) {
                    this.clearSession(userId);
                }
            }
        }, 5 * 60 * 1000);
    }
}

const sessionManager = new SessionManager();

// ==================== GAME CATEGORY MANAGER ====================
class GameCategoryManager {
    constructor() {
        this.categories = {
            'malaysia': {
                name: '🇲🇾 Malaysia Games',
                description: 'Best rates for Malaysian gamers',
                games: ['mlbb', 'mlbbfrmy', 'mlbbitem', 'mlbbflashmy', 'ffsgmy', 'ffsgmyitem', 'codmmy', 'valomy']
            },
            'indonesia': {
                name: '🇮🇩 Indonesia Games', 
                description: 'Specialized for Indonesian market',
                games: ['mlbbid', 'mlbbfrid', 'mlbbiditem', 'mcggid', 'valoid']
            },
            'global': {
                name: '🌍 Global Games',
                description: 'Worldwide game coverage',
                games: ['mlbbgb', 'mlbbgbitem', 'mlbbbrazil', 'pubg', 'dragonrise']
            }
        };
    }

    getGameCategory(gameSlug) {
        for (const [category, data] of Object.entries(this.categories)) {
            if (data.games.includes(gameSlug)) {
                return category;
            }
        }
        return 'global';
    }

    getCategoryGames(category) {
        return this.categories[category]?.games || [];
    }

    getAllCategories() {
        return this.categories;
    }
}

const gameCategories = new GameCategoryManager();

// ==================== AUTOMATED MARKETING SYSTEM ====================
class MarketingAutomation {
    constructor() {
        this.campaigns = new Map();
        this.setupAutomatedCampaigns();
        console.log(chalk.green('✓ Marketing Automation initialized'));
    }

    setupAutomatedCampaigns() {
        this.campaigns.set('welcome', {
            trigger: 'user_registered',
            delay: 2 * 60 * 1000,
            message: `🎮 *Welcome to GameVia Bot!* 🎮

Ready to top up your favorite games? 

*Quick Start:*
1. Use *.price* - See all game categories
2. Choose your region/game
3. Select product & provide ID
4. Confirm order!

*Popular Games:*
• Mobile Legends Malaysia
• Free Fire SG/MY  
• Valorant Malaysia
• COD Mobile MY/SG

Need help? Use *.help* anytime!`,
            enabled: true
        });

        this.campaigns.set('abandoned_cart', {
            trigger: 'order_abandoned', 
            delay: 10 * 60 * 1000,
            message: `🛒 *Complete Your Order!*

Your order is waiting! Use *.history* to see pending orders.

*Why choose us?*
✅ Best regional rates
✅ Instant processing 
✅ 24/7 support

Finish your order now! 🎯`,
            enabled: true
        });
    }

    triggerCampaign(userId, campaignKey) {
        const campaign = this.campaigns.get(campaignKey);
        if (!campaign || !campaign.enabled) return;

        setTimeout(async () => {
            try {
                await rikz.sendMessage(userId, { text: campaign.message });
            } catch (error) {
                console.log(chalk.red(`Failed to send campaign to ${userId}`));
            }
        }, campaign.delay);
    }

    scheduleBroadcast(message, targetUsers = null) {
        const users = targetUsers || Object.keys(loadJSON('./system/database/users.json'));
        let successCount = 0;

        users.forEach(async (userId, index) => {
            setTimeout(async () => {
                try {
                    await rikz.sendMessage(userId, { text: message });
                    successCount++;
                } catch (error) {
                    // Silent fail for broadcasts
                }
            }, index * 500);
        });

        return { total: users.length, success: successCount };
    }
}

const marketing = new MarketingAutomation();

// ==================== UTILITY FUNCTIONS ====================
const loadJSON = (path) => {
    try {
        return fs.existsSync(path) ? JSON.parse(fs.readFileSync(path)) : {};
    } catch (error) {
        return {};
    }
};

const saveJSON = (path, data) => {
    try {
        fs.ensureFileSync(path);
        fs.writeFileSync(path, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error(`Error saving ${path}:`, error);
    }
};

const apiCall = async (endpoint, body = null) => {
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
        return { success: false, message: "API connection failed" };
    }
};

// ==================== MAIN BOT HANDLER ====================
module.exports = rikz = async (rikz, m, chatUpdate, store) => {
    try {
        const body = (
            m.mtype === "conversation" ? m.message.conversation :
            m.mtype === "imageMessage" ? m.message.imageMessage.caption :
            m.mtype === "videoMessage" ? m.message.videoMessage.caption :
            m.mtype === "extendedTextMessage" ? m.message.extendedTextMessage.text :
            m.mtype === "buttonsResponseMessage" ? m.message.buttonsResponseMessage.selectedButtonId :
            m.mtype === "listResponseMessage" ? m.message.listResponseMessage.singleSelectReply.selectedRowId :
            m.mtype === "interactiveResponseMessage" ? JSON.parse(m.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson).id :
            m.mtype === "templateButtonReplyMessage" ? m.message.templateButtonReplyMessage.selectedId :
            m.text || ""
        );

        if (m.message) {
            rikz.readMessages([m.key]);
            console.log("┏━━━━━━━━━━━━━━━━━━━━━━━=");
            console.log(`┃¤ ${chalk.hex("#FFD700").bold("📩 NEW MESSAGE")} ${chalk.hex("#00FFFF").bold(`[${new Date().toLocaleTimeString()}]`)} `);
            console.log(`┃¤ ${chalk.hex("#FF69B4")("💌 From:")} ${chalk.hex("#FFFFFF")(`${m.pushName} (${m.sender})`)} `);
            console.log(`┃¤ ${chalk.hex("#00FF00")("📝 Message:")} ${chalk.hex("#FFFFFF")(`${body || m?.mtype || "Unknown"}`)} `);
            console.log("┗━━━━━━━━━━━━━━━━━━━━━━━=");
        }

        const prefix = typeof body === "string" ? global.prefix.find(p => body.startsWith(p)) : "";
        const isCmd = !!prefix;
        const args = isCmd ? body.slice(prefix.length).trim().split(/ +/).slice(1) : [];
        const command = isCmd ? body.slice(prefix.length).trim().split(/ +/)[0].toLowerCase() : "";
        const text = args.join(" ");

        const botNumber = await rikz.decodeJid(rikz.user.id);
        const isCreator = [botNumber, ...global.owner].map(v => v.replace(/[^0-9]/g, "") + "@s.whatsapp.net").includes(m.sender);

        let userRegistry = loadJSON('./system/database/users.json');
        let orders = loadJSON('./system/database/orders.json');

        // =============== SWITCH COMMANDS ===============
        switch(command) {
            case 'register':
                if(userRegistry[m.sender]) return rikz.sendMessage(m.chat, { text: "You're already registered." }, { quoted: m });
                userRegistry[m.sender] = { 
                    name: m.pushName || "User", 
                    role: "User",
                    registeredAt: new Date().toISOString()
                };
                saveJSON('./system/database/users.json', userRegistry);
                marketing.triggerCampaign(m.sender, 'welcome');
                rikz.sendMessage(m.chat, { text: `✅ Registered successfully as ${userRegistry[m.sender].name}` }, { quoted: m });
                break;

            case 'menu':
                rikz.sendMessage(m.chat, {
                    text: `🎮 *GameVia Bot - Multi-Region* 🌍\n\nHello ${m.pushName || "User"}! Best rates for all regions!`,
                    footer: 'Malaysia • Indonesia • Global • Best Prices',
                    buttons: [
                        { buttonId: '.price', buttonText: { displayText: '🎮 All Games' }, type: 1 },
                        { buttonId: '.help', buttonText: { displayText: '📖 Help' }, type: 1 },
                        { buttonId: '.promo', buttonText: { displayText: '🎉 Promo' }, type: 1 }
                    ],
                    headerType: 1
                }, { quoted: m });
                break;

            case 'price':
            case 'games':
                if(!userRegistry[m.sender]) return rikz.sendMessage(m.chat, { text: "Please register first using .register" }, { quoted: m });
                
                const categories = gameCategories.getAllCategories();
                const categoryButtons = Object.entries(categories).map(([key, category]) => ({
                    buttonId: `.category-${key}`,
                    buttonText: { displayText: category.name },
                    type: 1
                }));

                rikz.sendMessage(m.chat, {
                    text: `🎮 *Game Categories* 🌍\n\nChoose your region to see available games:`,
                    footer: "Specialized pricing for each region",
                    buttons: categoryButtons,
                    headerType: 1
                }, { quoted: m });
                break;

            case 'promo':
                const promoText = `🎊 *Current Promotions* 🎊

🔥 *Regional Special Offers:*
• *Malaysia:* Best rates for MLBB, Free Fire, Valorant
• *Indonesia:* Special prices for MLBB ID, Magic Chess
• *Global:* Competitive pricing worldwide

💎 *Why Choose GameVia?*
✅ Regional specialization
✅ Instant processing 
✅ 24/7 customer support
✅ Secure & reliable service

🎮 *Popular Right Now:*
• Mobile Legends Malaysia - From RM0.97
• Free Fire SG/MY - Best rates
• Valorant Malaysia - Instant delivery
• COD Mobile MY/SG - Fast processing

Use *.price* to explore all games!`;
                rikz.sendMessage(m.chat, { text: promoText }, { quoted: m });
                break;

            case 'broadcast':
                if (!isCreator) break;
                const broadcastMessage = text;
                if (!broadcastMessage) return rikz.sendMessage(m.chat, { text: "Usage: .broadcast <message>" }, { quoted: m });
                
                rikz.sendMessage(m.chat, { text: "📢 Starting broadcast to all users..." }, { quoted: m });
                const result = marketing.scheduleBroadcast(`📢 *Announcement*\n\n${broadcastMessage}`);
                setTimeout(() => {
                    rikz.sendMessage(m.chat, { 
                        text: `📊 Broadcast Sent:\nTotal: ${result.total}\nSuccessful: ${result.success}` 
                    }, { quoted: m });
                }, 5000);
                break;

            case 'help':
                const helpText = `🎮 *GameVia Bot Commands* 🌍

*Basic Commands:*
• .menu - Main menu
• .help - Show help  
• .register - Register account
• .price - Browse all games by region
• .promo - Current promotions

*Order Commands:*
• Use .price to start ordering
• Provide USER_ID & ZONE_ID when asked
• Confirm your order

*Popular Regions:*
🇲🇾 *Malaysia:* MLBB, Free Fire, Valorant, COD
🇮🇩 *Indonesia:* MLBB ID, Magic Chess, Valorant ID  
🌍 *Global:* MLBB Global, PUBG, Brazil, Dragon Raja

*Why Choose Us?*
✅ Regional specialization = Best rates
✅ Fast & secure processing
✅ 24/7 reliable service`;

                rikz.sendMessage(m.chat, { text: helpText }, { quoted: m });
                break;

            // ... other existing commands like history, stats, etc.
        }

        // =============== DYNAMIC COMMANDS ===============
        if(command.startsWith('category-')) {
            const categoryKey = command.replace('category-', '');
            const category = gameCategories.getAllCategories()[categoryKey];
            
            if (!category) return;

            // Load games from API
            try {
                const gamesData = await apiCall('check_games.php');
                if (!gamesData.success) return;

                const categoryGames = gamesData.games.filter(game => 
                    category.games.includes(game.slug)
                );

                const gameButtons = categoryGames.map(game => ({
                    buttonId: `select-${game.slug}`,
                    buttonText: { displayText: game.name },
                    type: 1
                }));

                // Add back button
                gameButtons.push({
                    buttonId: '.price',
                    buttonText: { displayText: '⬅️ Back' },
                    type: 1
                });

                rikz.sendMessage(m.chat, {
                    text: `🎮 *${category.name}* 📍\n\n${category.description}\n\nSelect a game:`,
                    footer: `Specialized ${category.name.replace(/[🇲🇾🇮🇩🌍]/g, '').trim()} pricing`,
                    buttons: gameButtons,
                    headerType: 1
                }, { quoted: m });

            } catch(err) {
                rikz.sendMessage(m.chat, { text: "Failed to load games." }, { quoted: m });
            }
        }

        else if(command.startsWith('select-')) {
            const slug = command.replace('select-', '');
            
            try {
                const data = await apiCall('get_products.php', { slug });
                if(!data.success || !data.products?.length) {
                    return rikz.sendMessage(m.chat, { text: "No products available for this game." }, { quoted: m });
                }

                const category = gameCategories.getGameCategory(slug);
                const categoryInfo = gameCategories.getAllCategories()[category];
                
                const productButtons = data.products.map(product => {
                    const profitPrice = (product.vprice * 1.02).toFixed(2); // 2% profit from vprice
                    return {
                        buttonId: `order-${slug}-${product.srv_code}`,
                        buttonText: { displayText: `${product.name} - RM${profitPrice}` },
                        type: 1
                    };
                });

                // Add back button
                productButtons.push({
                    buttonId: `category-${category}`,
                    buttonText: { displayText: '⬅️ Back' },
                    type: 1
                });

                rikz.sendMessage(m.chat, {
                    text: `🎮 *${data.game_name || slug}* ${categoryInfo?.name.includes('Malaysia') ? '🇲🇾' : categoryInfo?.name.includes('Indonesia') ? '🇮🇩' : '🌍'}\n*Best rates with 2% service fee included*\n\n*Category:* ${categoryInfo?.name || 'General'}`,
                    footer: "Select a product to order",
                    buttons: productButtons,
                    headerType: 1
                }, { quoted: m });

            } catch(err){
                console.log(err);
                rikz.sendMessage(m.chat, { text: "Failed to fetch products." }, { quoted: m });
            }
        }

        else if(command.startsWith('order-')) {
            const [_, slug, srvCode] = command.split('-');
            
            sessionManager.createSession(m.sender, {
                step: "awaiting_ids",
                gameSlug: slug,
                productCode: srvCode
            });
            
            // Get game name for better UX
            let gameName = slug;
            try {
                const gamesData = await apiCall('check_games.php');
                if (gamesData.success) {
                    const game = gamesData.games.find(g => g.slug === slug);
                    if (game) gameName = game.name;
                }
            } catch (e) {}
            
            rikz.sendMessage(m.chat, { 
                text: `📝 *Order Setup for ${gameName}*\n\nPlease provide your:\n*USER_ID* and *ZONE_ID*\n\nFormat: user_id zone_id\nExample: 12345 1` 
            }, { quoted: m });
        }

        else if(command === 'confirm') {
            const session = sessionManager.getSession(m.sender);
            if(!session || session.step !== "awaiting_confirmation") return;
            
            try {
                const orderData = {
                    srv_code: session.productCode,
                    user_id: session.orderData.user_id,
                    zone_id: session.orderData.zone_id
                };

                const result = await apiCall('order.php', orderData);

                if(result.success) {
                    if(!orders[m.sender]) orders[m.sender] = [];
                    const orderDetails = {
                        id: result.custom_order_id,
                        gameSlug: session.gameSlug,
                        product: session.productCode,
                        ...session.orderData,
                        price: result.amount,
                        status: result.status,
                        timestamp: new Date().toISOString(),
                        description: result.description
                    };
                    
                    orders[m.sender].push(orderDetails);
                    saveJSON('./system/database/orders.json', orders);

                    const category = gameCategories.getGameCategory(session.gameSlug);
                    const regionFlag = category === 'malaysia' ? '🇲🇾' : category === 'indonesia' ? '🇮🇩' : '🌍';

                    const successText = `🎉 *Order Successful!* ${regionFlag}\n
📦 *Order ID:* ${result.custom_order_id}
🎮 *Game:* ${session.gameSlug}
💎 *Product:* ${session.productCode}
👤 *USER_ID:* ${session.orderData.user_id}
📍 *ZONE_ID:* ${session.orderData.zone_id}
💰 *Amount:* RM${result.amount}
📊 *Status:* ${result.status}\n
*Thank you for choosing GameVia!* 🎮`;

                    rikz.sendMessage(m.chat, { text: successText }, { quoted: m });
                } else {
                    rikz.sendMessage(m.chat, { 
                        text: `❌ *Order Failed*\n\nReason: ${result.message || "Unknown error"}` 
                    }, { quoted: m });
                }
            } catch(error) {
                rikz.sendMessage(m.chat, { 
                    text: "❌ *Order Failed*\n\nThere was an error processing your order. Please try again." 
                }, { quoted: m });
            }

            sessionManager.clearSession(m.sender);
        }

        else if(sessionManager.getSession(m.sender)?.step === 'awaiting_ids') {
            const session = sessionManager.getSession(m.sender);
            
            const inputParts = body.trim().split(/ +/);
            
            if(inputParts.length < 2) {
                return rikz.sendMessage(m.chat, { 
                    text: "❌ *Incomplete Information*\n\nPlease provide both USER_ID and ZONE_ID\nFormat: user_id zone_id\n\nExample: 123456789 1234" 
                }, { quoted: m });
            }

            const userId = inputParts[0];
            const zoneId = inputParts[1];
            
            sessionManager.updateSession(m.sender, {
                step: "awaiting_confirmation",
                orderData: { user_id: userId, zone_id: zoneId }
            });

            // Get product price for confirmation
            let productName = session.productCode;
            let price = "0.00";
            try {
                const productData = await apiCall('get_products.php', { slug: session.gameSlug });
                const product = productData.products?.find(p => p.srv_code === session.productCode);
                if (product) {
                    productName = product.name;
                    price = (product.vprice * 1.02).toFixed(2);
                }
            } catch (e) {}

            const category = gameCategories.getGameCategory(session.gameSlug);
            const regionFlag = category === 'malaysia' ? '🇲🇾' : category === 'indonesia' ? '🇮🇩' : '🌍';

            const confirmationText = `✅ *Order Information Received* ${regionFlag}\n
🎮 *Game:* ${session.gameSlug}
📦 *Product:* ${productName}
👤 *USER_ID:* ${userId}
📍 *ZONE_ID:* ${zoneId}
💰 *Amount:* RM${price}\n
Please confirm your order:`;

            await rikz.sendMessage(m.chat, {
                text: confirmationText,
                footer: "Best regional rates • Secure & Fast",
                buttons: [
                    { buttonId: '.confirm', buttonText: { displayText: '✅ Confirm Order' }, type: 1 },
                    { buttonId: '.change', buttonText: { displayText: '✏️ Change Info' }, type: 1 }],
                headerType: 1
            }, { quoted: m });
        

        // Track abandoned carts
        if (sessionManager.getSession(m.sender) && body.toLowerCase().includes('cancel')) {
            marketing.triggerCampaign(m.sender, 'abandoned_cart');
            sessionManager.clearSession(m.sender);
        }

    } catch(err) {
        console.log('\x1b[1;31m' + err + '\x1b[0m');
    }
}
