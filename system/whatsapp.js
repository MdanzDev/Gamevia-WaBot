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
            }, 15 * 60 * 1000) // 15 minutes timeout
        };
        
        this.sessions.set(userId, session);
        console.log(chalk.blue(`New session created for ${userId}`));
        return session;
    }

    getSession(userId) {
        const session = this.sessions.get(userId);
        if (session) {
            session.lastActivity = Date.now(); // Update activity on access
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
            console.log(chalk.yellow(`Session cleared for ${userId}`));
        }
    }

    setupCleanupInterval() {
        // Clean up expired sessions every 5 minutes
        setInterval(() => {
            const now = Date.now();
            let cleanedCount = 0;
            
            for (const [userId, session] of this.sessions) {
                if (now - session.lastActivity > 15 * 60 * 1000) { // 15 minutes inactivity
                    this.clearSession(userId);
                    cleanedCount++;
                }
            }
            
            if (cleanedCount > 0) {
                console.log(chalk.yellow(`Cleaned up ${cleanedCount} expired sessions`));
            }
        }, 5 * 60 * 1000); // Check every 5 minutes
    }

    getStats() {
        return {
            totalSessions: this.sessions.size,
            activeSessions: Array.from(this.sessions.values()).filter(s => 
                Date.now() - s.lastActivity < 5 * 60 * 1000
            ).length
        };
    }
}

const sessionManager = new SessionManager();

// ==================== MULTI-CURRENCY SUPPORT ====================
const exchangeRates = {
    MYR: 1.00,    // Base currency
    USD: 0.21,     // 1 MYR = 0.21 USD
    SGD: 0.29,     // 1 MYR = 0.29 SGD
    IDR: 3325.50,  // 1 MYR = 3325.50 IDR
    THB: 7.65,     // 1 MYR = 7.65 THB
    PHP: 12.30,    // 1 MYR = 12.30 PHP
    VND: 5250.00   // 1 MYR = 5250.00 VND
};

const currencySymbols = {
    MYR: 'RM',
    USD: '$',
    SGD: 'S$',
    IDR: 'Rp',
    THB: '฿',
    PHP: '₱',
    VND: '₫'
};

const convertPrice = (priceMYR, currency) => {
    const rate = exchangeRates[currency] || 1;
    const converted = priceMYR * rate;
    
    // Format based on currency
    if (['IDR', 'VND'].includes(currency)) {
        return Math.round(converted).toLocaleString();
    }
    return converted.toFixed(2);
};

const formatPrice = (priceMYR, currency) => {
    const converted = convertPrice(priceMYR, currency);
    const symbol = currencySymbols[currency] || '';
    return `${symbol}${converted}`;
};

// ==================== ANALYTICS SYSTEM ====================
class AnalyticsSystem {
    constructor() {
        this.dailyStats = this.loadDailyStats();
        this.setupDailyReset();
    }

    loadDailyStats() {
        const today = new Date().toDateString();
        const statsFile = './system/database/daily_stats.json';
        
        if (fs.existsSync(statsFile)) {
            const stats = JSON.parse(fs.readFileSync(statsFile));
            if (stats.date === today) {
                return stats;
            }
        }
        
        // Reset for new day
        return {
            date: today,
            commands: 0,
            orders: 0,
            successfulOrders: 0,
            failedOrders: 0,
            revenue: 0,
            newUsers: 0,
            popularGames: {},
            peakHours: {}
        };
    }

    saveDailyStats() {
        const statsFile = './system/database/daily_stats.json';
        fs.ensureFileSync(statsFile);
        fs.writeFileSync(statsFile, JSON.stringify(this.dailyStats, null, 2));
    }

    trackCommand(command, userId) {
        this.dailyStats.commands++;
        
        const hour = new Date().getHours();
        this.dailyStats.peakHours[hour] = (this.dailyStats.peakHours[hour] || 0) + 1;
        
        this.saveDailyStats();
    }

    trackOrder(order, status) {
        this.dailyStats.orders++;
        
        if (status === 'success') {
            this.dailyStats.successfulOrders++;
            this.dailyStats.revenue += order.price || 0;
        } else {
            this.dailyStats.failedOrders++;
        }
        
        // Track popular games
        const game = order.gameSlug;
        this.dailyStats.popularGames[game] = (this.dailyStats.popularGames[game] || 0) + 1;
        
        this.saveDailyStats();
    }

    trackNewUser() {
        this.dailyStats.newUsers++;
        this.saveDailyStats();
    }

    getDailyAnalytics() {
        return this.dailyStats;
    }

    getComprehensiveAnalytics() {
        const userRegistry = loadJSON('./system/database/users.json');
        const orders = loadJSON('./system/database/orders.json');
        const resellers = loadJSON('./system/database/resellers.json');
        
        const allOrders = Object.values(orders).flat();
        const successfulOrders = allOrders.filter(o => o.status === 'success');
        const totalRevenue = successfulOrders.reduce((sum, o) => sum + (o.price || 0), 0);
        
        // Calculate popular games
        const gameStats = {};
        allOrders.forEach(order => {
            gameStats[order.gameSlug] = (gameStats[order.gameSlug] || 0) + 1;
        });
        
        const popularGames = Object.entries(gameStats)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);
        
        // Calculate user growth
        const userGrowth = Object.values(userRegistry).length;
        
        return {
            totalUsers: userGrowth,
            totalOrders: allOrders.length,
            successfulOrders: successfulOrders.length,
            successRate: all.length > 0 ? (successfulOrders.length / allOrders.length * 100).toFixed(1) : 0,
            totalRevenue: totalRevenue,
            averageOrderValue: successfulOrders.length > 0 ? totalRevenue / successfulOrders.length : 0,
            popularGames: popularGames,
            resellerCount: Object.keys(resellers).length,
            sessionStats: sessionManager.getStats()
        };
    }

    setupDailyReset() {
        // Reset daily stats at midnight
        const now = new Date();
        const midnight = new Date(now);
        midnight.setHours(24, 0, 0, 0);
        
        setTimeout(() => {
            this.dailyStats = this.loadDailyStats(); // This will create new day stats
            setInterval(() => {
                this.dailyStats = this.loadDailyStats();
            }, 24 * 60 * 60 * 1000); // Daily
        }, midnight - now);
    }
}

const analytics = new AnalyticsSystem();

// ==================== UTILITY FUNCTIONS ====================
const loadJSON = (path) => {
    try {
        return fs.existsSync(path) ? JSON.parse(fs.readFileSync(path)) : {};
    } catch (error) {
        console.error(`Error loading ${path}:`, error);
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
            const groupName = m.chat.endsWith("@g.us") ? (await rikz.groupMetadata(m.chat).catch(() => ({}))).subject || "" : "";
            console.log("┏━━━━━━━━━━━━━━━━━━━━━━━=");
            console.log(`┃¤ ${chalk.hex("#FFD700").bold("📩 NEW MESSAGE")} ${chalk.hex("#00FFFF").bold(`[${new Date().toLocaleTimeString()}]`)} `);
            console.log(`┃¤ ${chalk.hex("#FF69B4")("💌 From:")} ${chalk.hex("#FFFFFF")(`${m.pushName} (${m.sender})`)} `);
            console.log(`┃¤ ${chalk.hex("#FFA500")("📍 In:")} ${chalk.hex("#FFFFFF")(`${groupName || "Private Chat"}`)} `);
            console.log(`┃¤ ${chalk.hex("#00FF00")("📝 Message:")} ${chalk.hex("#FFFFFF")(`${body || m?.mtype || "Unknown"}`)} `);
            console.log("┗━━━━━━━━━━━━━━━━━━━━━━━=");
        }

        const prefix = typeof body === "string" ? global.prefix.find(p => body.startsWith(p)) : "";
        const isCmd = !!prefix;
        const args = isCmd ? body.slice(prefix.length).trim().split(/ +/).slice(1) : [];
        const command = isCmd ? body.slice(prefix.length).trim().split(/ +/)[0].toLowerCase() : "";
        const text = args.join(" ");

        const botNumber = await rikz.decodeJid(rikz.user.id);
        const premuser = fs.existsSync("./system/database/premium.json") ? JSON.parse(fs.readFileSync("./system/database/premium.json")) : [];
        const isCreator = [botNumber, ...global.owner].map(v => v.replace(/[^0-9]/g, "") + "@s.whatsapp.net").includes(m.sender);

        // Load data
        let userRegistry = loadJSON('./system/database/users.json');
        let resellers = loadJSON('./system/database/resellers.json');
        let orders = loadJSON('./system/database/orders.json');
        let gamesList = loadJSON('./system/database/games_cache.json');

        // Track command in analytics
        if (isCmd) {
            analytics.trackCommand(command, m.sender);
        }

        // =============== SWITCH COMMANDS ===============
        switch(command) {
            case 'register':
                if(userRegistry[m.sender]) return rikz.sendMessage(m.chat, { text: "You're already registered." }, { quoted: m });
                userRegistry[m.sender] = { 
                    name: m.pushName || "User", 
                    role: "User",
                    registeredAt: new Date().toISOString(),
                    currency: 'MYR' // Default currency
                };
                saveJSON('./system/database/users.json', userRegistry);
                analytics.trackNewUser();
                rikz.sendMessage(m.chat, { text: `✅ Registered successfully as ${userRegistry[m.sender].name}` }, { quoted: m });
                break;

            case 'menu':
                const userCurrency = userRegistry[m.sender]?.currency || 'MYR';
                rikz.sendMessage(m.chat, {
                    text: `🎮 *GameVia Bot* • ${userCurrency}\n\nHello ${m.pushName || "User"}! Welcome to our top-up service.`,
                    footer: 'Powered by GameVia API',
                    buttons: [
                        { buttonId: '.help', buttonText: { displayText: '📖 Help' }, type: 1 },
                        { buttonId: '.price', buttonText: { displayText: '💰 Prices' }, type: 1 },
                        { buttonId: '.currency', buttonText: { displayText: '💱 Currency' }, type: 1 },
                        { buttonId: '.stats', buttonText: { displayText: '📊 My Stats' }, type: 1 }
                    ],
                    headerType: 1
                }, { quoted: m });
                break;

            // =============== MULTI-CURRENCY COMMANDS ===============
            case 'currency':
            case 'setcurrency':
                const availableCurrencies = Object.keys(exchangeRates).join(', ');
                if (args.length === 0) {
                    const currentCurrency = userRegistry[m.sender]?.currency || 'MYR';
                    return rikz.sendMessage(m.chat, { 
                        text: `💱 *Currency Settings*\n\nCurrent: ${currentCurrency}\nAvailable: ${availableCurrencies}\n\nUsage: .currency USD` 
                    }, { quoted: m });
                }
                
                const newCurrency = args[0].toUpperCase();
                if (!exchangeRates[newCurrency]) {
                    return rikz.sendMessage(m.chat, { 
                        text: `❌ Invalid currency. Available: ${availableCurrencies}` 
                    }, { quoted: m });
                }
                
                if (!userRegistry[m.sender]) {
                    userRegistry[m.sender] = { name: m.pushName || "User", role: "User" };
                }
                
                userRegistry[m.sender].currency = newCurrency;
                saveJSON('./system/database/users.json', userRegistry);
                
                rikz.sendMessage(m.chat, { 
                    text: `✅ Currency set to ${newCurrency} ${currencySymbols[newCurrency]}\n\nAll prices will now be shown in ${newCurrency}.` 
                }, { quoted: m });
                break;

            case 'rates':
                const ratesText = Object.entries(exchangeRates)
                    .map(([curr, rate]) => 
                        `• 1 MYR = ${curr === 'MYR' ? '1.00 MYR' : `${convertPrice(1, curr)} ${curr}`}`
                    )
                    .join('\n');
                
                rikz.sendMessage(m.chat, { 
                    text: `💱 *Exchange Rates*\n\n${ratesText}\n\nBase currency: MYR` 
                }, { quoted: m });
                break;

            // =============== ANALYTICS COMMANDS ===============
            case 'stats':
                if (!userRegistry[m.sender]) return rikz.sendMessage(m.chat, { text: "Please register first using .register" }, { quoted: m });
                
                const userOrders = orders[m.sender] || [];
                const successfulUserOrders = userOrders.filter(o => o.status === 'success');
                const totalSpent = successfulUserOrders.reduce((sum, o) => sum + (o.price || 0), 0);
                const userCurrencyStat = userRegistry[m.sender]?.currency || 'MYR';
                
                const statsText = `📊 *Your Statistics*\n
🛒 Total Orders: ${userOrders.length}
✅ Successful: ${successfulUserOrders.length}
💰 Total Spent: ${formatPrice(totalSpent, userCurrencyStat)}
🎯 Success Rate: ${userOrders.length > 0 ? ((successfulUserOrders.length / userOrders.length) * 100).toFixed(1) : 0}%
💱 Currency: ${userCurrencyStat}`;

                rikz.sendMessage(m.chat, { text: statsText }, { quoted: m });
                break;

            case 'analytics':
                if (!isCreator) break;
                
                const comprehensiveStats = analytics.getComprehensiveAnalytics();
                const dailyStats = analytics.getDailyAnalytics();
                
                const analyticsText = `📈 *Advanced Analytics*\n
📅 *Today's Stats:*
• Commands: ${dailyStats.commands}
• Orders: ${dailyStats.orders}
• Success Rate: ${dailyStats.orders > 0 ? ((dailyStats.successfulOrders / dailyStats.orders) * 100).toFixed(1) : 0}%
• Revenue: RM${dailyStats.revenue.toFixed(2)}
• New Users: ${dailyStats.newUsers}

📊 *Overall Stats:*
• Total Users: ${comprehensiveStats.totalUsers}
• Total Orders: ${comprehensiveStats.totalOrders}
• Success Rate: ${comprehensiveStats.successRate}%
• Total Revenue: RM${comprehensiveStats.totalRevenue.toFixed(2)}
• Avg Order: RM${comprehensiveStats.averageOrderValue.toFixed(2)}

🕒 *Session Stats:*
• Active Sessions: ${comprehensiveStats.sessionStats.activeSessions}
• Total Sessions: ${comprehensiveStats.sessionStats.totalSessions}

🎮 *Top Games:*
${comprehensiveStats.popularGames.map(([game, count]) => `• ${game}: ${count} orders`).join('\n')}`;

                rikz.sendMessage(m.chat, { text: analyticsText }, { quoted: m });
                break;

            case 'dailystats':
                if (!isCreator) break;
                
                const dailyStatsData = analytics.getDailyAnalytics();
                const peakHour = Object.entries(dailyStatsData.peakHours)
                    .sort((a, b) => b[1] - a[1])[0];
                
                const dailyText = `📊 *Daily Statistics - ${dailyStatsData.date}*\n
📞 Commands: ${dailyStatsData.commands}
🛒 Orders: ${dailyStatsData.orders}
✅ Successful: ${dailyStatsData.successfulOrders}
❌ Failed: ${dailyStatsData.failedOrders}
💰 Revenue: RM${dailyStatsData.revenue.toFixed(2)}
👥 New Users: ${dailyStatsData.newUsers}
🏆 Peak Hour: ${peakHour ? `Hour ${peakHour[0]}:00 (${peakHour[1]} commands)` : 'No data'}

🎮 Popular Games:
${Object.entries(dailyStatsData.popularGames)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([game, count]) => `• ${game}: ${count} orders`)
    .join('\n')}`;

                rikz.sendMessage(m.chat, { text: dailyText }, { quoted: m });
                break;

            // ... (your existing commands like price, help, etc.)

            case 'price':
                if(!userRegistry[m.sender]) return rikz.sendMessage(m.chat, { text: "Please register first using .register" }, { quoted: m });
                
                // Show available games for selection
                const gameButtons = [
                    { buttonId: '.select-mlbb', buttonText: { displayText: 'Mobile Legends' }, type: 1 },
                    { buttonId: '.select-ff', buttonText: { displayText: 'Free Fire' }, type: 1 },
                    { buttonId: '.select-pubg', buttonText: { displayText: 'PUBG Mobile' }, type: 1 },
                    { buttonId: '.select-cod', buttonText: { displayText: 'Call of Duty' }, type: 1 }
                ];

                const userCurrencyPrice = userRegistry[m.sender]?.currency || 'MYR';
                rikz.sendMessage(m.chat, {
                    text: `💰 *Game Prices • ${userCurrencyPrice}*\n\nSelect a game to view products:`,
                    footer: "Prices include 2% service fee",
                    buttons: gameButtons,
                    headerType: 1
                }, { quoted: m });
                break;

            // ... (other existing commands)
        }

        // =============== DYNAMIC COMMANDS WITH SESSION MANAGEMENT ===============
        if(command.startsWith('select-')) {
            const slug = command.replace('select-', '');
            
            try {
                const data = await apiCall('get_products.php', { slug });
                if(!data.success || !data.products?.length) return rikz.sendMessage(m.chat, { text: "No products available for this game." }, { quoted: m });

                const userCurrency = userRegistry[m.sender]?.currency || 'MYR';
                const productButtons = data.products.map(product => {
                    const profitPrice = (product.vprice * 1.02); // 2% profit
                    const displayPrice = formatPrice(profitPrice, userCurrency);
                    return {
                        buttonId: `.order-${slug}-${product.srv_code}`,
                        buttonText: { displayText: `${product.name} - ${displayPrice}` },
                        type: 1
                    };
                });

                // Add currency change button
                productButtons.push({
                    buttonId: '.currency',
                    buttonText: { displayText: `💱 Change Currency` },
                    type: 1
                });

                rikz.sendMessage(m.chat, {
                    text: `🎮 *${data.game_name} Products • ${userCurrency}*\n*Prices include 2% service fee*`,
                    footer: `Currency: ${userCurrency}`,
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
            
            // Create session with timeout
            sessionManager.createSession(m.sender, {
                step: "awaiting_ids",
                gameSlug: slug,
                productCode: srvCode,
                userCurrency: userRegistry[m.sender]?.currency || 'MYR'
            });
            
            const gameName = "Mobile Legends"; // You can map this from your games list
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
                    // Save order
                    if(!orders[m.sender]) orders[m.sender] = [];
                    const orderDetails = {
                        id: result.custom_order_id,
                        gameSlug: session.gameSlug,
                        product: session.productCode,
                        ...session.orderData,
                        price: result.amount,
                        status: result.status,
                        timestamp: new Date().toISOString(),
                        description: result.description,
                        currency: session.userCurrency
                    };
                    
                    orders[m.sender].push(orderDetails);
                    saveJSON('./system/database/orders.json', orders);
                    
                    // Track in analytics
                    analytics.trackOrder(orderDetails, result.status);

                    const userCurrency = session.userCurrency;
                    const successText = `🎉 *Order Successful!*\n
📦 *Order ID:* ${result.custom_order_id}
🎮 *Game:* ${session.gameSlug}
💎 *Product:* ${session.productCode}
👤 *USER_ID:* ${session.orderData.user_id}
📍 *ZONE_ID:* ${session.orderData.zone_id}
💰 *Amount:* ${formatPrice(result.amount, userCurrency)}
📊 *Status:* ${result.status}
💱 *Currency:* ${userCurrency}\n
Thank you for your order!`;

                    rikz.sendMessage(m.chat, { text: successText }, { quoted: m });
                } else {
                    rikz.sendMessage(m.chat, { 
                        text: `❌ *Order Failed*\n\nReason: ${result.message || "Unknown error"}` 
                    }, { quoted: m });
                    
                    // Track failed order in analytics
                    analytics.trackOrder({
                        gameSlug: session.gameSlug,
                        product: session.productCode,
                        price: 0
                    }, 'failed');
                }
            } catch(error) {
                rikz.sendMessage(m.chat, { 
                    text: "❌ *Order Failed*\n\nThere was an error processing your order. Please try again." 
                }, { quoted: m });
            }

            // Clear session after order completion
            sessionManager.clearSession(m.sender);
        }

        else if(sessionManager.getSession(m.sender)?.step === 'awaiting_ids') {
            const session = sessionManager.getSession(m.sender);
            
            // Parse the input
            const inputParts = body.trim().split(/ +/);
            
            if(inputParts.length < 2) {
                return rikz.sendMessage(m.chat, { 
                    text: "❌ *Incomplete Information*\n\nPlease provide both USER_ID and ZONE_ID\nFormat: user_id zone_id\n\nExample: 123456789 1234" 
                }, { quoted: m });
            }

            const userId = inputParts[0];
            const zoneId = inputParts[1];
            
            // Update session
            sessionManager.updateSession(m.sender, {
                step: "awaiting_confirmation",
                orderData: { user_id: userId, zone_id: zoneId }
            });

            // Get product price for confirmation display
            const productData = await apiCall('get_products.php', { slug: session.gameSlug });
            const product = productData.products?.find(p => p.srv_code === session.productCode);
            const price = product ? (product.price * 1.02) : 0;
            const displayPrice = formatPrice(price, session.userCurrency);

            const confirmationText = `✅ *Order Information Received • ${session.userCurrency}*\n
🎮 *Game:* ${session.gameSlug}
📦 *Product:* ${session.productCode}
👤 *USER_ID:* ${userId}
📍 *ZONE_ID:* ${zoneId}
💰 *Amount:* ${displayPrice}\n
Please confirm your order:`;

            await rikz.sendMessage(m.chat, {
                text: confirmationText,
                footer: "Check the information above before confirming",
                buttons: [
                    { buttonId: '.confirm', buttonText: { displayText: '✅ Confirm Order' }, type: 1 },
                    { buttonId: '.change', buttonText: { displayText: '✏️ Change Info' }, type: 1 }
                ],
                headerType: 1
            }, { quoted: m });
        }

        else if(command === 'sessioninfo') {
            // Debug command to check session status
            const session = sessionManager.getSession(m.sender);
            if (session) {
                const sessionAge = Math.round((Date.now() - session.createdAt) / 1000);
                const lastActivity = Math.round((Date.now() - session.lastActivity) / 1000);
                
                rikz.sendMessage(m.chat, { 
                    text: `🔍 *Session Info*\n\nStep: ${session.step}\nGame: ${session.gameSlug}\nProduct: ${session.productCode}\nAge: ${sessionAge}s\nLast Activity: ${lastActivity}s ago\nCurrency: ${session.userCurrency}` 
                }, { quoted: m });
            } else {
                rikz.sendMessage(m.chat, { text: "No active session." }, { quoted: m });
            }
        }

    } catch(err) {
        console.log('\x1b[1;31m' + err + '\x1b[0m');
    }
}
