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
            console.log(chalk.yellow(`Session cleared for ${userId}`));
        }
    }

    setupCleanupInterval() {
        setInterval(() => {
            const now = Date.now();
            let cleanedCount = 0;
            
            for (const [userId, session] of this.sessions) {
                if (now - session.lastActivity > 15 * 60 * 1000) {
                    this.clearSession(userId);
                    cleanedCount++;
                }
            }
            
            if (cleanedCount > 0) {
                console.log(chalk.yellow(`Cleaned up ${cleanedCount} expired sessions`));
            }
        }, 5 * 60 * 1000);
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

// ==================== AUTOMATED MARKETING SYSTEM ====================
class MarketingAutomation {
    constructor() {
        this.campaigns = new Map();
        this.userSegments = new Map();
        this.setupAutomatedCampaigns();
        console.log(chalk.green('✓ Marketing Automation initialized'));
    }

    setupAutomatedCampaigns() {
        // Welcome campaign for new users
        this.campaigns.set('welcome', {
            trigger: 'user_registered',
            delay: 2 * 60 * 1000, // 2 minutes after registration
            message: `🎮 *Welcome to GameVia Bot!* 🎮

Ready to top up your favorite games? 

Here's how to get started:
1. Use *.price* to see available games
2. Select your game and product
3. Provide your game ID & zone ID
4. Confirm your order!

Need help? Use *.help* anytime!`,
            enabled: true
        });

        // Abandoned cart campaign
        this.campaigns.set('abandoned_cart', {
            trigger: 'order_abandoned', 
            delay: 10 * 60 * 1000, // 10 minutes after abandonment
            message: `🛒 *Complete Your Order!*

Looks like you didn't finish your order! 

Use *.history* to see pending orders or start over with *.price*

Need help? We're here to assist! 🎯`,
            enabled: true
        });

        // Inactive user re-engagement
        this.campaigns.set('re_engagement', {
            trigger: 'user_inactive_7d',
            delay: 0,
            message: `🎮 *We Miss You!* 🎮

It's been a while! Ready for more gaming?

Check out our latest products with *.price*

Special treat: Fast processing & best rates! ⚡`,
            enabled: true
        });

        // New game announcement
        this.campaigns.set('new_game', {
            trigger: 'new_game_added',
            delay: 0,
            message: `🎉 *NEW GAME AVAILABLE!* 🎉

We've added new games to our platform! 

Use *.price* to check them out and get your first top-up at special rates! 🚀`,
            enabled: true
        });
    }

    triggerCampaign(userId, campaignKey, customData = {}) {
        const campaign = this.campaigns.get(campaignKey);
        if (!campaign || !campaign.enabled) return;

        console.log(chalk.blue(`📧 Triggering campaign ${campaignKey} for ${userId}`));

        setTimeout(async () => {
            try {
                await rikz.sendMessage(userId, { text: campaign.message });
                console.log(chalk.green(`✅ Campaign ${campaignKey} sent to ${userId}`));
                
                // Track campaign performance
                this.trackCampaignDelivery(campaignKey, userId, true);
            } catch (error) {
                console.log(chalk.red(`❌ Failed to send campaign ${campaignKey} to ${userId}`));
                this.trackCampaignDelivery(campaignKey, userId, false);
            }
        }, campaign.delay);
    }

    trackCampaignDelivery(campaignKey, userId, success) {
        const campaignFile = './system/database/campaign_stats.json';
        const stats = fs.existsSync(campaignFile) ? JSON.parse(fs.readFileSync(campaignFile)) : {};
        
        if (!stats[campaignKey]) {
            stats[campaignKey] = { sent: 0, delivered: 0, failed: 0, users: [] };
        }
        
        stats[campaignKey].sent++;
        if (success) {
            stats[campaignKey].delivered++;
            if (!stats[campaignKey].users.includes(userId)) {
                stats[campaignKey].users.push(userId);
            }
        } else {
            stats[campaignKey].failed++;
        }
        
        stats[campaignKey].lastSent = new Date().toISOString();
        fs.writeFileSync(campaignFile, JSON.stringify(stats, null, 2));
    }

    // Segment users for targeted marketing
    segmentUsers(userRegistry, orders) {
        const segments = {
            new_users: [],
            active_buyers: [],
            power_users: [],
            inactive_users: []
        };

        const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        for (const userId in userRegistry) {
            const userOrders = orders[userId] || [];
            const successfulOrders = userOrders.filter(o => o.status === 'success');
            const lastOrder = successfulOrders.length > 0 ? 
                new Date(successfulOrders[successfulOrders.length - 1].timestamp) : null;

            if (successfulOrders.length >= 10) {
                segments.power_users.push(userId);
            } else if (successfulOrders.length >= 3) {
                segments.active_buyers.push(userId);
            } else if (successfulOrders.length === 0 && 
                      new Date(userRegistry[userId].registeredAt) > oneWeekAgo) {
                segments.new_users.push(userId);
            } else if (lastOrder && lastOrder < oneWeekAgo) {
                segments.inactive_users.push(userId);
            }
        }

        this.userSegments = segments;
        return segments;
    }

    // Schedule broadcast to specific segments
    scheduleSegmentBroadcast(message, segments = ['all']) {
        let targetUsers = new Set();

        if (segments.includes('all')) {
            targetUsers = new Set(Object.keys(userRegistry));
        } else {
            segments.forEach(segment => {
                if (this.userSegments[segment]) {
                    this.userSegments[segment].forEach(user => targetUsers.add(user));
                }
            });
        }

        return this.scheduleBroadcast(message, Array.from(targetUsers));
    }

    // Main broadcast function with rate limiting
    scheduleBroadcast(message, targetUsers = null) {
        const users = targetUsers || Object.keys(userRegistry);
        let successCount = 0;
        let failCount = 0;

        console.log(chalk.blue(`📢 Starting broadcast to ${users.length} users`));

        users.forEach(async (userId, index) => {
            setTimeout(async () => {
                try {
                    await rikz.sendMessage(userId, { text: message });
                    successCount++;
                    
                    // Log progress every 20 messages
                    if ((successCount + failCount) % 20 === 0) {
                        console.log(chalk.blue(`📊 Broadcast progress: ${successCount + failCount}/${users.length}`));
                    }
                } catch (error) {
                    failCount++;
                    console.log(chalk.red(`Failed to send to ${userId}`));
                }
            }, index * 500); // 500ms delay between messages
        });

        // Return stats after completion
        setTimeout(() => {
            console.log(chalk.green(`📊 Broadcast completed: ${successCount} sent, ${failCount} failed`));
        }, users.length * 500 + 5000);

        return { total: users.length, success: successCount, failed: failCount };
    }

    getCampaignStats() {
        const campaignFile = './system/database/campaign_stats.json';
        return fs.existsSync(campaignFile) ? JSON.parse(fs.readFileSync(campaignFile)) : {};
    }
}

const marketing = new MarketingAutomation();

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
        
        const gameStats = {};
        allOrders.forEach(order => {
            gameStats[order.gameSlug] = (gameStats[order.gameSlug] || 0) + 1;
        });
        
        const popularGames = Object.entries(gameStats)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);
        
        return {
            totalUsers: Object.values(userRegistry).length,
            totalOrders: allOrders.length,
            successfulOrders: successfulOrders.length,
            successRate: allOrders.length > 0 ? (successfulOrders.length / allOrders.length * 100).toFixed(1) : 0,
            totalRevenue: totalRevenue,
            averageOrderValue: successfulOrders.length > 0 ? totalRevenue / successfulOrders.length : 0,
            popularGames: popularGames,
            resellerCount: Object.keys(resellers).length,
            sessionStats: sessionManager.getStats()
        };
    }

    setupDailyReset() {
        const now = new Date();
        const midnight = new Date(now);
        midnight.setHours(24, 0, 0, 0);
        
        setTimeout(() => {
            this.dailyStats = this.loadDailyStats();
            setInterval(() => {
                this.dailyStats = this.loadDailyStats();
            }, 24 * 60 * 60 * 1000);
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
                    registeredAt: new Date().toISOString()
                };
                saveJSON('./system/database/users.json', userRegistry);
                analytics.trackNewUser();
                
                // Trigger welcome campaign
                marketing.triggerCampaign(m.sender, 'welcome');
                
                rikz.sendMessage(m.chat, { text: `✅ Registered successfully as ${userRegistry[m.sender].name}` }, { quoted: m });
                break;

            case 'menu':
                rikz.sendMessage(m.chat, {
                    text: `🎮 *GameVia Bot - Malaysia Region* 🇲🇾\n\nHello ${m.pushName || "User"}! Best prices for Malaysian gamers!`,
                    footer: 'Specialized for Malaysian Region • Best Rates',
                    buttons: [
                        { buttonId: '.help', buttonText: { displayText: '📖 Help' }, type: 1 },
                        { buttonId: '.price', buttonText: { displayText: '💰 Prices' }, type: 1 },
                        { buttonId: '.promo', buttonText: { displayText: '🎉 Promotions' }, type: 1 },
                        { buttonId: '.stats', buttonText: { displayText: '📊 My Stats' }, type: 1 }
                    ],
                    headerType: 1
                }, { quoted: m });
                break;

            // =============== MARKETING & PROMOTION COMMANDS ===============
            case 'promo':
            case 'promotions':
                const promoText = `🎊 *Current Promotions* 🎊

🔥 *Hot Deals for Malaysian Gamers:*
• First-time users: Extra fast processing ⚡
• Bulk orders: Special rates available
• Regular promotions: Watch this space!

💎 *Why choose us?*
✅ Best rates for Malaysia region
✅ Instant processing 
✅ 24/7 customer support
✅ Secure & reliable

Use *.price* to see all available games and start ordering!`;

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
                        text: `📊 Broadcast Completed:\nTotal: ${result.total}\nSent: ${result.success}\nFailed: ${result.failed}` 
                    }, { quoted: m });
                }, 5000);
                break;

            case 'segmentbroadcast':
                if (!isCreator) break;
                
                const [segment, ...messageParts] = args;
                const segmentMessage = messageParts.join(' ');
                
                if (!segment || !segmentMessage) {
                    return rikz.sendMessage(m.chat, { 
                        text: "Usage: .segmentbroadcast <segment> <message>\n\nSegments: new_users, active_buyers, power_users, inactive_users, all" 
                    }, { quoted: m });
                }

                // Update user segments
                marketing.segmentUsers(userRegistry, orders);
                
                rikz.sendMessage(m.chat, { text: `📢 Starting segment broadcast to ${segment}...` }, { quoted: m });
                
                const segmentResult = marketing.scheduleSegmentBroadcast(
                    `🎯 *Special Offer*\n\n${segmentMessage}`, 
                    [segment]
                );
                
                setTimeout(() => {
                    rikz.sendMessage(m.chat, { 
                        text: `📊 Segment Broadcast Completed:\nSegment: ${segment}\nTotal: ${segmentResult.total}\nSent: ${segmentResult.success}\nFailed: ${segmentResult.failed}` 
                    }, { quoted: m });
                }, 5000);
                break;

            case 'campaignstats':
                if (!isCreator) break;
                
                const campaignStats = marketing.getCampaignStats();
                let statsText = "📈 *Campaign Statistics*\n\n";
                
                for (const [campaign, data] of Object.entries(campaignStats)) {
                    const deliveryRate = data.sent > 0 ? ((data.delivered / data.sent) * 100).toFixed(1) : 0;
                    statsText += `*${campaign}:*\n` +
                                `Sent: ${data.sent} | Delivered: ${data.delivered} | Failed: ${data.failed}\n` +
                                `Success Rate: ${deliveryRate}% | Unique Users: ${data.users?.length || 0}\n` +
                                `Last Sent: ${data.lastSent ? new Date(data.lastSent).toLocaleDateString() : 'Never'}\n\n`;
                }
                
                rikz.sendMessage(m.chat, { text: statsText }, { quoted: m });
                break;

            // =============== ANALYTICS COMMANDS ===============
            case 'stats':
                if (!userRegistry[m.sender]) return rikz.sendMessage(m.chat, { text: "Please register first using .register" }, { quoted: m });
                
                const userOrders = orders[m.sender] || [];
                const successfulUserOrders = userOrders.filter(o => o.status === 'success');
                const totalSpent = successfulUserOrders.reduce((sum, o) => sum + (o.price || 0), 0);
                
                const statsTextUser = `📊 *Your Statistics*\n
🛒 Total Orders: ${userOrders.length}
✅ Successful: ${successfulUserOrders.length}
💰 Total Spent: RM${totalSpent.toFixed(2)}
🎯 Success Rate: ${userOrders.length > 0 ? ((successfulUserOrders.length / userOrders.length) * 100).toFixed(1) : 0}%
📍 Region: Malaysia 🇲🇾`;

                rikz.sendMessage(m.chat, { text: statsTextUser }, { quoted: m });
                break;

            case 'analytics':
                if (!isCreator) break;
                
                const comprehensiveStats = analytics.getComprehensiveAnalytics();
                const dailyStats = analytics.getDailyAnalytics();
                
                // Update user segments for marketing
                const segments = marketing.segmentUsers(userRegistry, orders);
                
                const analyticsText = `📈 *Business Analytics*\n
📅 *Today's Stats:*
• Commands: ${dailyStats.commands}
• Orders: ${dailyStats.orders}
• Revenue: RM${dailyStats.revenue.toFixed(2)}
• New Users: ${dailyStats.newUsers}

📊 *Overall Stats:*
• Total Users: ${comprehensiveStats.totalUsers}
• Total Orders: ${comprehensiveStats.totalOrders}
• Success Rate: ${comprehensiveStats.successRate}%
• Total Revenue: RM${comprehensiveStats.totalRevenue.toFixed(2)}

👥 *User Segments:*
• New Users: ${segments.new_users.length}
• Active Buyers: ${segments.active_buyers.length} 
• Power Users: ${segments.power_users.length}
• Inactive Users: ${segments.inactive_users.length}

🎮 *Top Games:*
${comprehensiveStats.popularGames.map(([game, count]) => `• ${game}: ${count} orders`).join('\n')}`;

                rikz.sendMessage(m.chat, { text: analyticsText }, { quoted: m });
                break;

            // ... (your existing commands like price, help, addreseller, etc.)
            case 'price':
                if(!userRegistry[m.sender]) return rikz.sendMessage(m.chat, { text: "Please register first using .register" }, { quoted: m });
                
                const gameButtons = [
                    { buttonId: '.select-mlbb', buttonText: { displayText: 'Mobile Legends' }, type: 1 },
                    { buttonId: '.select-ffsg', buttonText: { displayText: 'Free Fire' }, type: 1 },
                    { buttonId: '.select-pubg', buttonText: { displayText: 'PUBG Mobile' }, type: 1 },
                    { buttonId: '.select-cod', buttonText: { displayText: 'Call of Duty' }, type: 1 }
                ];

                rikz.sendMessage(m.chat, {
                    text: `💰 *Game Prices - Malaysia Region* 🇲🇾\n\nBest rates for Malaysian gamers! Select a game:`,
                    footer: "Specialized pricing for Malaysia • Includes 2% service fee",
                    buttons: gameButtons,
                    headerType: 1
                }, { quoted: m });
                break;

            case 'help':
                const helpText = `🎮 *GameVia Bot Commands* 🇲🇾

*Basic Commands:*
• .menu - Main menu
• .help - Show this help  
• .register - Register your account
• .price - View game prices
• .promo - Current promotions

*Order Commands:*
• .id <user_id> <zone_id> <product_code> - Quick order
• .history - View order history
• .stats - Your statistics

*Marketing Commands (Admin):*
• .broadcast <message> - Broadcast to all users
• .segmentbroadcast <segment> <message> - Targeted broadcast
• .campaignstats - Campaign performance
• .analytics - Business analytics

*Why Choose Us?*
✅ Best rates for Malaysia region
✅ Fast & secure processing
✅ 24/7 reliable service
✅ Specialized for Malaysian gamers`;

                rikz.sendMessage(m.chat, {
                    text: helpText,
                    footer: 'GameVia Bot • Specialized for Malaysia',
                    buttons: [{ buttonId: '.menu', buttonText: { displayText: '🏠 Main Menu' }, type: 1 }],
                    headerType: 1
                }, { quoted: m });
                break;

            // ... (other existing commands like addreseller, addbalance, history)
        }

        // =============== DYNAMIC COMMANDS ===============
        if(command.startsWith('select-')) {
            const slug = command.replace('select-', '');
            
            try {
                const data = await apiCall('get_products.php', { slug });
                if(!data.success || !data.products?.length) return rikz.sendMessage(m.chat, { text: "No products available for this game." }, { quoted: m });

                const productButtons = data.products.map(product => {
                    const profitPrice = (product.vprice * 1.02).toFixed(2); // 2% profit
                    return {
                        buttonId: `.order-${slug}-${product.srv_code}`,
                        buttonText: { displayText: `${product.name} - RM${profitPrice}` },
                        type: 1
                    };
                });

                rikz.sendMessage(m.chat, {
                    text: `🎮 *${data.game_name} - Malaysia Prices* 🇲🇾\n*Best rates with 2% service fee included*`,
                    footer: "Specialized pricing for Malaysian region",
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
            
            const gameName = "Mobile Legends Malaysia"; // Dynamic based on slug
            rikz.sendMessage(m.chat, { 
                text: `📝 *Order Setup for ${gameName}* 🇲🇾\n\nPlease provide your:\n*USER_ID* and *ZONE_ID*\n\nFormat: user_id zone_id\nExample: 12345 1` 
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
                    
                    analytics.trackOrder(orderDetails, result.status);

                    const successText = `🎉 *Order Successful!* 🇲🇾\n
📦 *Order ID:* ${result.custom_order_id}
🎮 *Game:* ${session.gameSlug}
💎 *Product:* ${session.productCode}
👤 *USER_ID:* ${session.orderData.user_id}
📍 *ZONE_ID:* ${session.orderData.zone_id}
💰 *Amount:* RM${result.amount}
📊 *Status:* ${result.status}\n
*Thank you for choosing GameVia Malaysia!* 🎮`;

                    rikz.sendMessage(m.chat, { text: successText }, { quoted: m });
                } else {
                    rikz.sendMessage(m.chat, { 
                        text: `❌ *Order Failed*\n\nReason: ${result.message || "Unknown error"}` 
                    }, { quoted: m });
                    
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

            // Get product price
            const productData = await apiCall('get_products.php', { slug: session.gameSlug });
            const product = productData.products?.find(p => p.srv_code === session.productCode);
            const price = product ? (product.vprice * 1.02).toFixed(2) : "0.00";

            const confirmationText = `✅ *Order Information Received* 🇲🇾\n
🎮 *Game:* ${session.gameSlug}
📦 *Product:* ${session.productCode}
👤 *USER_ID:* ${userId}
📍 *ZONE_ID:* ${zoneId}
💰 *Amount:* RM${price}\n
Please confirm your order:`;

            await rikz.sendMessage(m.chat, {
                text: confirmationText,
                footer: "Best rates for Malaysia • Secure & Fast",
                buttons: [
                    { buttonId: '.confirm', buttonText: { displayText: '✅ Confirm Order' }, type: 1 },
                    { buttonId: '.change', buttonText: { displayText: '✏️ Change Info' }, type: 1 }
                ],
                headerType: 1
            }, { quoted: m ]);
        }

        // Track abandoned carts for marketing
        if (sessionManager.getSession(m.sender) && body.toLowerCase().includes('cancel')) {
            marketing.triggerCampaign(m.sender, 'abandoned_cart');
            sessionManager.clearSession(m.sender);
        }

    } catch(err) {
        console.log('\x1b[1;31m' + err + '\x1b[0m');
    }
}
