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
const path = require('path');
const { createCanvas, loadImage, registerFont } = require('canvas');
const axios = require('axios');

// ==================== LOCAL DATABASE SYSTEM ====================
const auth = require('./auth');
const localDB = require('./local-db');
// Admin configuration
global.Chatadmin = ["60137345871@s.whatsapp.net","60148090301@s.whatsapp.net"] 

global.adminChat = "60148090301@s.whatsapp.net";  // Same as your admin number

// ==================== UTILITY FUNCTIONS ====================
const API_KEY = "API-GVCDEAD0E38EA13632";
const API_BASE_URL = "https://api.gamevia.shop/v1";


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

// ==================== CONFIGURATION ====================

const CONFIG = {
    SESSION_TIMEOUT: 15 * 60 * 1000, // 15 minutes
    CACHE_TTL: 5 * 60 * 1000, // 5 minutes
    BROADCAST_DELAY: 500, // ms between broadcast messages
    MAX_REQUESTS_PER_MINUTE: 15,
    RETRY_ATTEMPTS: 3,
    BACKUP_INTERVAL: 12 * 60 * 60 * 1000, // 12 hours
    LOW_BALANCE_THRESHOLD: 10, // RM
    STOCK_CHECK_INTERVAL: 60 * 60 * 1000 // 1 hour
};

// ==================== SESSION MANAGER ====================
class SessionManager {
    constructor() {
        this.sessions = new Map();
        this.setupCleanupInterval();
        console.log(chalk.green('âœ“ Session Manager initialized'));
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
            }, CONFIG.SESSION_TIMEOUT)
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
// In SessionManager class - enhance the cleanup
setupCleanupInterval() {
    setInterval(() => {
        const now = Date.now();
        let cleanedCount = 0;
        let cancelledOrders = 0;
        
        for (const [userId, session] of this.sessions) {
            // Auto-cancel sessions older than 30 minutes
            if (now - session.lastActivity > 10 * 60 * 1000) {
                console.log(chalk.yellow(`⏰ Auto-cancelling inactive session for ${userId}`));
                this.clearSession(userId);
                cleanedCount++;
                cancelledOrders++;
                
                // Notify user about auto-cancellation
                try {
                    rikz.sendMessage(userId, {
                        text: `⏰ *Session Timeout*\n\nYour order session has been automatically cancelled due to inactivity (30 minutes).\n\nUse *.price* to start a new order when you're ready!`
                    });
                } catch (error) {
                    console.log('Failed to notify user about auto-cancel:', error);
                }
            }
        }
        
        if (cleanedCount > 0) {
            console.log(chalk.yellow(`🧹 Auto-cleaned ${cleanedCount} inactive sessions (${cancelledOrders} orders cancelled)`));
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

// ==================== GAME CATEGORY MANAGER ====================
class GameCategoryManager {
    constructor() {
        this.categories = {
            'malaysia': {
                name: 'ðŸ‡²ðŸ‡¾ Malaysia Games',
                description: 'Best rates for Malaysian gamers',
                games: ['mlbb', 'mlbbfrmy', 'mlbbitem', 'mlbbflashmy', 'ffsgmy', 'ffsgmyitem', 'codmmy', 'valomy']
            },
            'indonesia': {
                name: 'ðŸ‡®ðŸ‡© Indonesia Games', 
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


// ==================== GITHUB DATABASE SYSTEM ====================
class GitHubDB {
    constructor() {
        this.owner = 'MdanzDev';
        this.repo = 'gamevia.topup.db';
        this.token = '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';
        this.baseURL = 'https://api.github.com';
        this.branch = 'main';
    }

    async pushFile(filename, content) {
        try {
            // Get current SHA for update
            const currentSHA = await this.getFileSHA(filename);
            
            const response = await fetch(`${this.baseURL}/repos/${this.owner}/${this.repo}/contents/database/${filename}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/vnd.github.v3+json'
                },
                body: JSON.stringify({
                    message: `🤖 Auto-update ${filename} - ${new Date().toLocaleString()}`,
                    content: Buffer.from(JSON.stringify(content, null, 2)).toString('base64'),
                    sha: currentSHA,
                    branch: this.branch
                })
            });
            
            if (!response.ok) {
                throw new Error(`GitHub API error: ${response.status} ${await response.text()}`);
            }
            
            const result = await response.json();
            console.log(chalk.green(`✅ Pushed ${filename} to GitHub (${Object.keys(content).length} records)`));
            return { success: true, data: result };
        } catch (error) {
            console.error(chalk.red(`❌ Failed to push ${filename}:`), error.message);
            // Fallback to local storage
            return this.saveLocal(filename, content);
        }
    }

    async pullFile(filename) {
        try {
            const response = await fetch(`${this.baseURL}/repos/${this.owner}/${this.repo}/contents/database/${filename}?ref=${this.branch}`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'GameVia-Bot'
                }
            });
            
            if (response.status === 404) {
                console.log(chalk.yellow(`📁 ${filename} not found on GitHub, using local`));
                return this.loadLocal(filename);
            }
            
            if (!response.ok) {
                throw new Error(`GitHub API error: ${response.status}`);
            }
            
            const result = await response.json();
            const content = Buffer.from(result.content, 'base64').toString('utf8');
            console.log(chalk.green(`✅ Pulled ${filename} from GitHub`));
            return JSON.parse(content);
        } catch (error) {
            console.error(chalk.red(`❌ Failed to pull ${filename}:`), error.message);
            return this.loadLocal(filename);
        }
    }

    async getFileSHA(filename) {
        try {
            const response = await fetch(`${this.baseURL}/repos/${this.owner}/${this.repo}/contents/database/${filename}?ref=${this.branch}`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });
            
            if (response.status === 200) {
                const result = await response.json();
                return result.sha;
            }
            return null; // File doesn't exist yet
        } catch (error) {
            return null;
        }
    }

    // Local fallback methods
    saveLocal(filename, content) {
        try {
            const path = `./system/database/${filename}`;
            fs.ensureFileSync(path);
            fs.writeFileSync(path, JSON.stringify(content, null, 2));
            console.log(chalk.yellow(`📁 Saved ${filename} locally (fallback)`));
            return { success: true, local: true };
        } catch (error) {
            console.error(chalk.red(`❌ Failed to save ${filename} locally:`), error);
            return { success: false, error: error.message };
        }
    }

    loadLocal(filename) {
        try {
            const path = `./system/database/${filename}`;
            if (fs.existsSync(path)) {
                const content = fs.readFileSync(path, 'utf8');
                return JSON.parse(content);
            }
            return {}; // Return empty object if file doesn't exist
        } catch (error) {
            console.error(chalk.red(`❌ Failed to load ${filename} locally:`), error);
            return {};
        }
    }

    // Sync all data to GitHub
    async syncAllData() {
        console.log(chalk.blue('🔄 Syncing all data to GitHub...'));
        const files = ['users.json', 'orders.json', 'pricing.json', 'resellers.json', 'daily_stats.json', 'campaign_stats.json'];
        
        for (const file of files) {
            try {
                const localData = this.loadLocal(file);
                if (Object.keys(localData).length > 0) {
                    await this.pushFile(file, localData);
                }
            } catch (error) {
                console.error(chalk.red(`❌ Failed to sync ${file}:`), error.message);
            }
        }
        console.log(chalk.green('✅ All data synced to GitHub!'));
    }
}

// ==================== INITIALIZE GITHUB DATABASE ====================
const githubDB = new GitHubDB();

// Replace your existing loadJSON/saveJSON functions:
const loadJSON = async (path) => {
    const filename = path.split('/').pop();
    return await githubDB.pullFile(filename);
};

const saveJSON = async (path, data) => {
    const filename = path.split('/').pop();
    const result = await githubDB.pushFile(filename, data);
    return result.success;
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
        const systemStats = localDB.getStats();
        const dailyStats = this.getDailyAnalytics();
        
        return {
            totalUsers: systemStats.totalUsers,
            totalOrders: systemStats.totalOrders,
            successfulOrders: systemStats.successfulOrders,
            successRate: systemStats.successRate,
            totalRevenue: systemStats.totalRevenue,
            averageOrderValue: systemStats.successfulOrders > 0 ? systemStats.totalRevenue / systemStats.successfulOrders : 0,
            dailyStats: dailyStats
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
// ==================== ORDER PROCESSING SYSTEM ====================
// ==================== ORDER PROCESSING SYSTEM ====================
class OrderProcessor {
    constructor(rikzInstance) {
        this.rikz = rikzInstance; // Store the rikz instance
        this.pendingOrders = new Map();
        this.setupOrderChecking();
    }

    async processOrder(userId, orderData) {
        const user = auth.getUser(userId);
        if (!user) {
            return { success: false, error: 'User not found' };
        }

        // FIXED: Use the price from orderData (already includes markup)
        const finalPrice = orderData.price || 0;

        // Check balance with integer conversion to avoid floating point errors
        const userBalance = user.balance || 0;
        const userBalanceCents = Math.round(userBalance * 100);
        const finalPriceCents = Math.round(finalPrice * 100);

        if (userBalanceCents < finalPriceCents) {
            return { 
                success: false, 
                error: `Insufficient balance. Need RM${finalPrice.toFixed(2)}, have RM${userBalance.toFixed(2)}` 
            };
        }

        try {
            console.log(`🔄 Processing order: ${orderData.productCode} for ${userId}, Amount: RM${finalPrice.toFixed(2)}`);

            // Call GameVia API
            const apiResult = await apiCall('order.php', {
                srv_code: orderData.productCode,
                user_id: orderData.user_id,
                zone_id: orderData.zone_id
            });

            console.log(`📡 API Response:`, apiResult);

            if (apiResult.success) {
                // Deduct balance from user
                const balanceResult = await auth.deductBalance(userId, finalPrice, `Order: ${orderData.productCode}`);
                
                if (!balanceResult.success) {
                    return { success: false, error: balanceResult.error };
                }

                // Record order in user stats
                await auth.recordOrder(userId, {
                    id: apiResult.custom_order_id,
                    gameSlug: orderData.gameSlug,
                    product: orderData.productCode,
                    price: finalPrice,
                    status: 'success'
                });

                // Save order to database
                const orderResult = await localDB.createOrder({
                    id: apiResult.custom_order_id,
                    userId: userId,
                    gameSlug: orderData.gameSlug,
                    product: orderData.productCode,
                    user_id: orderData.user_id,
                    zone_id: orderData.zone_id,
                    price: finalPrice,
                    status: 'success',
                    description: apiResult.description,
                    apiResponse: apiResult,
                    timestamp: new Date().toISOString()
                });

                // Track order status
                this.trackOrder(apiResult.custom_order_id, userId, orderData.gameSlug, orderData.productCode);

                // Record analytics
                analytics.trackOrder(orderData, 'success');

                console.log(`✅ Order successful: ${apiResult.custom_order_id} for ${userId}`);

                return {
                    success: true,
                    orderId: apiResult.custom_order_id,
                    amount: finalPrice,
                    description: apiResult.description,
                    newBalance: balanceResult.newBalance
                };

            } else {
                // Record failed order in analytics
                analytics.trackOrder(orderData, 'failed');
                
                console.log(`❌ Order failed: ${apiResult.message}`);
                return {
                    success: false,
                    error: apiResult.message || 'Order failed'
                };
            }

        } catch (error) {
            console.error('Order API error:', error);
            // Record failed order in analytics
            analytics.trackOrder(orderData, 'failed');
            
            return {
                success: false,
                error: 'API connection failed'
            };
        }
    }

    async trackOrder(orderId, userId, gameSlug, productCode) {
        this.pendingOrders.set(orderId, { 
            userId, 
            gameSlug, 
            productCode, 
            checked: 0,
            startTime: Date.now()
        });
        
        const checkInterval = setInterval(async () => {
            const orderInfo = this.pendingOrders.get(orderId);
            
            // Stop checking after 10 attempts or 5 minutes
            if (!orderInfo || orderInfo.checked >= 10 || (Date.now() - orderInfo.startTime) > 5 * 60 * 1000) {
                clearInterval(checkInterval);
                this.pendingOrders.delete(orderId);
                return;
            }
            
            const status = await this.checkOrderStatus(orderId);
            if (status && status.status !== 'Pending') {
                clearInterval(checkInterval);
                this.pendingOrders.delete(orderId);
                
                // Update order status in database
                const orders = await localDB.getAllOrders();
                let orderUpdated = false;
                
                for (const userOrders of Object.values(orders)) {
                    const order = userOrders.find(o => o.id === orderId);
                    if (order) {
                        order.status = status.status;
                        order.updatedAt = new Date().toISOString();
                        orderUpdated = true;
                        break;
                    }
                }
                
                if (orderUpdated) {
                    // Save updated orders
                    await localDB.saveJSON('orders.json', orders);
                }

                // Send status update to user
                try {
                    await this.rikz.sendMessage(userId, {
                        text: `🔄 *Order Status Update*\n\nOrder ID: ${orderId}\nGame: ${gameSlug}\nProduct: ${productCode}\nStatus: ${status.status}\nDescription: ${status.description}\n\nThank you for using GameVia!`
                    });
                } catch (error) {
                    console.error('Failed to notify user:', error);
                }
            } else {
                orderInfo.checked++;
            }
        }, 30000); // Check every 30 seconds
    }

    async checkOrderStatus(orderId) {
        try {
            const result = await apiCall('get_history.php', { custom_order_id: orderId });
            if (result.success && result.history && result.history.length > 0) {
                const order = result.history[0];
                return {
                    status: order.status_order,
                    description: order.description,
                    createdAt: order.created_at
                };
            }
        } catch (error) {
            console.error('Order status check failed:', error);
        }
        return null;
    }

    setupOrderChecking() {
        try {
            const allOrders = Object.values(localDB.loadJSON('orders.json')).flat();
            const pending = allOrders.filter(o => o.status === 'Pending' || o.status === 'Processing');
            
            console.log(`🔄 Setting up order tracking for ${pending.length} pending orders`);
            
            pending.forEach(order => {
                // Only track orders from last 24 hours to avoid old stuck orders
                const orderTime = new Date(order.timestamp || order.createdAt).getTime();
                if (Date.now() - orderTime < 24 * 60 * 60 * 1000) {
                    this.trackOrder(order.id, order.userId, order.gameSlug, order.product);
                }
            });
        } catch (error) {
            console.error('Failed to setup order checking:', error);
        }
    }

    // Get stats for admin
    getStats() {
        return {
            pendingOrders: this.pendingOrders.size,
            trackedOrders: Array.from(this.pendingOrders.entries()).map(([id, info]) => ({
                id,
                userId: info.userId,
                game: info.gameSlug,
                checked: info.checked,
                duration: Math.round((Date.now() - info.startTime) / 1000) + 's'
            }))
        };
    }

    // Force check a specific order (admin function)
    async forceCheckOrder(orderId) {
        const status = await this.checkOrderStatus(orderId);
        if (status) {
            // Find and update order in database
            const orders = localDB.loadJSON('orders.json');
            for (const userOrders of Object.values(orders)) {
                const order = userOrders.find(o => o.id === orderId);
                if (order) {
                    order.status = status.status;
                    order.updatedAt = new Date().toISOString();
                    break;
                }
            }
            localDB.saveJSON('orders.json', orders);
        }
        return status;
    }
}
 







const sessionManager = new SessionManager();
const gameCategories = new GameCategoryManager();

module.exports = rikz = async (rikz, m, chatUpdate, store) => {
    const startTime = Date.now();
    const orderProcessor = new OrderProcessor(rikz);

    
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
        const isCreator = [botNumber, ...global.owner].map(v => v.replace(/[^0-9]/g, "") + "@s.whatsapp.net").includes(m.sender);

        const user = auth.getUser(m.sender);
        const [amountStr] = args;




        // =============== COMMAND HANDLER ===============
      // =============== COMMAND HANDLER ===============
    switch(command) {
    case 'register':
        if (auth.userExists(m.sender)) {
            return rikz.sendMessage(m.chat, { text: "You're already registered." }, { quoted: m });
        }
        
        const registerResult = auth.registerUser(m.sender, {  // Changed variable name
            name: m.pushName,
            phone: m.sender,
            registeredVia: 'whatsapp_bot'
        });
        
        if (registerResult.success) {  // Changed variable name
            analytics.trackNewUser();
            rikz.sendMessage(m.chat, { 
                text: `âœ… *Registration Successful!*\n\nWelcome ${m.pushName}!\n\nYour account has been created with RM0.00 balance.\nUse .topup to add funds and start ordering!` 
            }, { quoted: m });
        } else {
            rikz.sendMessage(m.chat, { text: `âŒ Registration failed: ${registerResult.error}` }, { quoted: m });  // Changed variable name
        }
        break;

    case 'menu':
        
        const welcomeName = user ? user.name : "User";
        const userRole = user ? user.role : 'user';
        
        let menuText = `🎮 *GameVia Bot - Multi-Region* 🌍\n\nHello ${welcomeName}! `;
        
        if (userRole === 'reseller') {
            menuText += `👑 (Reseller)\n\nEnjoy special reseller rates!`;
        } else {
            menuText += `\n\nBest rates for all regions!`;
        }

        const menuButtons = [
            { buttonId: '.price', buttonText: { displayText: '🎮 All Games' }, type: 1 },
            { buttonId: '.help', buttonText: { displayText: '📖– Help' }, type: 1 },
            { buttonId: '.balance', buttonText: { displayText: '💰 Balance' }, type: 1 }
        ];

        if (userRole === 'reseller') {
            menuButtons.push({ buttonId: '.reseller', buttonText: { displayText: '👑 Reseller' }, type: 1 });
        } else {
            menuButtons.push({ buttonId: '.promo', buttonText: { displayText: '🎉 Promo' }, type: 1 });
        }

        rikz.sendMessage(m.chat, {
            text: menuText,
            footer: userRole === 'reseller' ? 'Reseller Rates â€¢ Special Benefits' : 'Malaysia â€¢ Indonesia â€¢ Global â€¢ Best Prices',
            buttons: menuButtons,
            headerType: 1
        }, { quoted: m });
        break;

    case 'price':
    case 'games':
        if (!auth.userExists(m.sender)) {
            return rikz.sendMessage(m.chat, { text: "Please register first using .register" }, { quoted: m });
        }
        
        const categories = gameCategories.getAllCategories();
        const categoryButtons = Object.entries(categories).map(([key, category]) => ({
            buttonId: `.category-${key}`,
            buttonText: { displayText: category.name },
            type: 1
        }));

        const userRoleText = auth.isReseller(m.sender) ? 
            "👑 Reseller Pricing - Special Rates!" : 
            "Regular Pricing - Best Market Rates";

        rikz.sendMessage(m.chat, {
            text: `🎮 *Game Categories* 🌍\n\n${userRoleText}\n\nChoose your region:`,
            footer: auth.isReseller(m.sender) ? "Special reseller rates applied" : "Best prices for all regions",
            buttons: categoryButtons,
            headerType: 1
        }, { quoted: m });
        break;

    case 'balance':
    if (!auth.userExists(m.sender)) {
        return rikz.sendMessage(m.chat, { text: "Please register first using .register" }, { quoted: m });
    }
    
    const currentUser = auth.getUser(m.sender);
    const transactions = auth.getUserTransactions(m.sender, 5);
    
    let balanceText = `💰 *Your Balance*\n\n`;
    balanceText += `💵 Current Balance: *RM${(currentUser.balance || 0).toFixed(2)}*\n`;
    balanceText += `ðŸ›’ Total Orders: ${currentUser.totalOrders || 0}\n`;
    balanceText += `💳 Total Spent: RM${(currentUser.totalSpent || 0).toFixed(2)}\n`;
    
    if (auth.isReseller(m.sender)) {
        balanceText += `👑 Status: Reseller (Wholesale Pricing)\n`;
    }
    
    balanceText += `\n`;
    
    if (transactions.length > 0) {
        balanceText += `📖‹ Recent Transactions:\n`;
        transactions.forEach(tx => {
            const sign = tx.amount > 0 ? '+' : '';
            const typeEmoji = tx.type === 'balance_add' ? 'ðŸ’¹' : 'ðŸ›’';
            balanceText += `${typeEmoji} ${sign}RM${Math.abs(tx.amount).toFixed(2)} - ${tx.reason || tx.type}\n`;
        });
    } else {
        balanceText += `No transactions yet. Use .topup to add funds!`;
    }

    rikz.sendMessage(m.chat, { text: balanceText }, { quoted: m });
    break;

    case 'topup':
        if (!auth.userExists(m.sender)) {
            return rikz.sendMessage(m.chat, { text: "Please register first using .register" }, { quoted: m });
        }

        const topupText = `💳 *Top Up Balance*\n\nTo add funds to your account, please contact admin for payment instructions.\n\n*Payment Methods:*\nâ€¢ Bank Transfer\nâ€¢ E-Wallet\nâ€¢ Cryptocurrency\n\nAfter payment, send receipt to admin for instant balance update!\n\n*Current Balance:* RM${auth.getUser(m.sender).balance.toFixed(2)}`;

        rikz.sendMessage(m.chat, { text: topupText }, { quoted: m });
        break;

    case 'topupmethods':
        try {
            const methodsText = `💳 *Top Up Methods Available*\n\n` +
                `ðŸ¦ *Bank Transfer*\n` +
                `â€¢ Maybank: 1234 5678 9012\n` +
                `â€¢ CIMB: 9876 5432 1098\n` +
                `â€¢ Name: GAMEVIA ENTERPRISE\n\n` +
                `📖± *E-Wallet*\n` +
                `â€¢ Touch 'n Go: 012-345 6789\n` +
                `â€¢ Boost: 012-345 6789\n` +
                `â€¢ GrabPay: 012-345 6789\n\n` +
                `â‚¿ *Cryptocurrency*\n` +
                `â€¢ USDT (TRC20): TAbc123...\n` +
                `â€¢ Bitcoin: 1ABC...\n\n` +
                `*Instructions:*\n` +
                `1. Transfer to any method above\n` +
                `2. Take screenshot of receipt\n` +
                `3. Send to admin with your user ID\n` +
                `4. Balance updated within 5 minutes!\n\n` +
                `*Minimum Topup: RM5*`;

            rikz.sendMessage(m.chat, { text: methodsText }, { quoted: m });
        } catch (error) {
            rikz.sendMessage(m.chat, { text: "âŒ Failed to load methods." }, { quoted: m });
        }
        break;

    case 'withdraw':
    if (!auth.userExists(m.sender)) {
        return rikz.sendMessage(m.chat, { text: "Please register first using .register" }, { quoted: m });
    }

    const [withdrawAmountStr] = args;
    const withdrawAmount = parseFloat(withdrawAmountStr);
    const withdrawUser = auth.getUser(m.sender);

    if (!withdrawAmount || isNaN(withdrawAmount) || withdrawAmount <= 0) {
        return rikz.sendMessage(m.chat, { 
            text: "Usage: .withdraw <amount>\nExample: .withdraw 50\n\nMinimum withdrawal: RM10" 
        }, { quoted: m });
    }

    if (withdrawAmount < 10) {
        return rikz.sendMessage(m.chat, { text: "âŒ Minimum withdrawal amount is RM10." }, { quoted: m });
    }

    if (withdrawUser.balance < withdrawAmount) {
        return rikz.sendMessage(m.chat, { 
            text: `âŒ Insufficient balance. You have RM${withdrawUser.balance.toFixed(2)}, requested RM${withdrawAmount.toFixed(2)}` 
        }, { quoted: m });
    }

    const withdrawText = `💸 *Withdrawal Request*\n\n` +
        `ðŸ‘¤ User: ${withdrawUser.name}\n` +
        `📖± ID: ${m.sender}\n` +
        `💰 Amount: RM${withdrawAmount.toFixed(2)}\n` +
        `💳 Current Balance: RM${withdrawUser.balance.toFixed(2)}\n\n` +
        `*Please contact admin to complete withdrawal.*\n` +
        `*Processing time: 1-24 hours*`;

    rikz.sendMessage(m.chat, { text: withdrawText }, { quoted: m });
    
    // Fixed admin notification with proper checks
    if (global.adminChat && typeof global.adminChat === 'string' && global.adminChat.includes('@s.whatsapp.net')) {
        try {
            await rikz.sendMessage(global.adminChat, {
                text: `ðŸ”„ *New Withdrawal Request*\n\n` +
                    `ðŸ‘¤ User: ${withdrawUser.name}\n` +
                    `📖± ID: ${m.sender}\n` +
                    `💰 Amount: RM${withdrawAmount.toFixed(2)}\n` +
                    `💳 Balance Before: RM${withdrawUser.balance.toFixed(2)}\n` +
                    `💳 Balance After: RM${(withdrawUser.balance - withdrawAmount).toFixed(2)}\n` +
                    `â° Time: ${new Date().toLocaleString()}\n\n` +
                    `*Use .addbalance ${m.sender.replace('@s.whatsapp.net', '')} -${withdrawAmount} to deduct balance*`
            });
        } catch (error) {
            console.log('Failed to notify admin:', error);
        }
    } else {
        console.log('Admin chat not configured properly:', global.adminChat);
    }
    break;

    case 'transfer':
        if (!auth.userExists(m.sender)) {
            return rikz.sendMessage(m.chat, { text: "Please register first using .register" }, { quoted: m });
        }

        const [transferTargetPhone, transferAmountStr] = args;  // Changed variable name
        const transferAmount = parseFloat(transferAmountStr);  // Changed variable name
        const transferSenderUser = auth.getUser(m.sender);  // Changed variable name

        if (!transferTargetPhone || !transferAmount || isNaN(transferAmount) || transferAmount <= 0) {  // Changed variable name
            return rikz.sendMessage(m.chat, { 
                text: "Usage: .transfer <phone_number> <amount>\nExample: .transfer 60123456789 25" 
            }, { quoted: m });
        }

        if (transferAmount < 1) {  // Changed variable name
            return rikz.sendMessage(m.chat, { text: "âŒ Minimum transfer amount is RM1." }, { quoted: m });
        }

        if (transferSenderUser.balance < transferAmount) {  // Changed variable name
            return rikz.sendMessage(m.chat, { 
                text: `âŒ Insufficient balance. You have RM${transferSenderUser.balance.toFixed(2)}`  // Changed variable name
            }, { quoted: m });
        }

        const transferTargetUserId = transferTargetPhone.includes('@s.whatsapp.net') ? transferTargetPhone : `${transferTargetPhone}@s.whatsapp.net`;  // Changed variable name
        
        if (!auth.userExists(transferTargetUserId)) {  // Changed variable name
            return rikz.sendMessage(m.chat, { text: "âŒ Recipient not found. They need to register first." }, { quoted: m });
        }

        if (transferTargetUserId === m.sender) {  // Changed variable name
            return rikz.sendMessage(m.chat, { text: "âŒ Cannot transfer to yourself." }, { quoted: m });
        }

        // Deduct from sender
        const transferSenderResult = auth.addBalance(m.sender, -transferAmount, `Transfer to ${transferTargetPhone}`);  // Changed variable name
        
        // Add to recipient
        const transferRecipientResult = auth.addBalance(transferTargetUserId, transferAmount, `Transfer from ${m.sender}`);  // Changed variable name

        if (transferSenderResult.success && transferRecipientResult.success) {  // Changed variable names
            rikz.sendMessage(m.chat, { 
                text: `âœ… *Transfer Successful!*\n\n` +
                    `💰 Amount: RM${transferAmount.toFixed(2)}\n` +  // Changed variable name
                    `📖± To: ${transferTargetPhone}\n` +  // Changed variable name
                    `💳 Your New Balance: RM${transferSenderResult.newBalance.toFixed(2)}\n\n` +  // Changed variable name
                    `*Transaction completed instantly!*`
            }, { quoted: m });

            // Notify recipient
            try {
                await rikz.sendMessage(transferTargetUserId, {  // Changed variable name
                    text: `💸 *Money Received!*\n\n` +
                        `💰 Amount: RM${transferAmount.toFixed(2)}\n` +  // Changed variable name
                        `📖± From: ${transferSenderUser.name}\n` +  // Changed variable name
                        `💳 Your New Balance: RM${transferRecipientResult.newBalance.toFixed(2)}\n\n` +  // Changed variable name
                        `Thank you for using GameVia! 🎮`
                });
            } catch (error) {
                console.log('Failed to notify recipient:', error);
            }
        } else {
            rikz.sendMessage(m.chat, { text: "âŒ Transfer failed. Please try again." }, { quoted: m });
        }
        break;

   case 'history':
    if (!auth.userExists(m.sender)) {
        return rikz.sendMessage(m.chat, { text: "Please register first using .register" }, { quoted: m });
    }

    const orders = await localDB.getUserOrders(m.sender, 10);
    
    // FIXED: orders is already an array from getUserOrders
    if (orders.length === 0) {
        return rikz.sendMessage(m.chat, { text: "No orders yet. Use .price to start ordering!" }, { quoted: m });
    }

    let historyText = `📖 *Order History* (Last 10)\n\n`;
    orders.forEach((order, index) => {
        const date = new Date(order.createdAt).toLocaleDateString();
        const statusEmoji = order.status === 'success' ? '✅' : order.status === 'pending' ? '⏳' : '❌';
        historyText += `${index + 1}. ${statusEmoji} ${order.id}\n`;
        historyText += `   🎮 ${order.gameSlug} - ${order.product}\n`;
        historyText += `   💰 RM${order.price?.toFixed(2) || '0.00'}\n`;
        historyText += `   📅 ${date}\n   ──────────────\n`;
    });

    rikz.sendMessage(m.chat, { text: historyText }, { quoted: m });
    break;

    case 'stats':
        if (!auth.userExists(m.sender)) {
            return rikz.sendMessage(m.chat, { text: "Please register first using .register" }, { quoted: m });
        }
        
        const userStats = auth.getUser(m.sender);
        const systemStats = localDB.getStats();
        
        const statsText = `📖Š *Your Statistics*\n\n` +
            `ðŸ‘¤ *Personal Stats:*\n` +
            `ðŸ›’ Total Orders: ${userStats.totalOrders || 0}\n` +
            `💳 Total Spent: RM${userStats.totalSpent?.toFixed(2) || '0.00'}\n` +
            `💵 Current Balance: RM${userStats.balance.toFixed(2)}\n\n` +
            `📖ˆ *System Stats:*\n` +
            `ðŸ‘¥ Total Users: ${systemStats.totalUsers}\n` +
            `âœ… Success Rate: ${systemStats.successRate}%\n` +
            `💰 Total Revenue: RM${systemStats.totalRevenue?.toFixed(2) || '0.00'}`;
        
        rikz.sendMessage(m.chat, { text: statsText }, { quoted: m });
        break;

    case 'mystats':
    if (!auth.userExists(m.sender)) {
        return rikz.sendMessage(m.chat, { text: "Please register first using .register" }, { quoted: m });
    }

    const myUser = auth.getUser(m.sender);
    const myOrders = localDB.getUserOrders(m.sender, 100);

    const successfulOrders = myOrders.filter(o => o.status === 'success').length;
    const totalSpent = myOrders.filter(o => o.status === 'success')
        .reduce((sum, o) => sum + (o.price || 0), 0);
    
    const gameStats = {};
    myOrders.forEach(order => {
        if (order.status === 'success') {
            gameStats[order.gameSlug] = (gameStats[order.gameSlug] || 0) + 1;
        }
    });

    const favoriteGame = Object.entries(gameStats)
        .sort((a, b) => b[1] - a[1])[0];

    let mystatsText = `📖ˆ *Your Statistics*\n\n` +
        `ðŸ‘¤ *Account Info*\n` +
        `👑 Role: ${myUser.role}\n` +
        `📖… Member Since: ${new Date(myUser.createdAt).toLocaleDateString()}\n\n` +
        `💰 *Financial Stats*\n` +
        `💵 Current Balance: RM${(myUser.balance || 0).toFixed(2)}\n` +
        `ðŸ›’ Total Orders: ${myUser.totalOrders || 0}\n` +
        `âœ… Successful Orders: ${successfulOrders}\n` +
        `💳 Total Spent: RM${totalSpent.toFixed(2)}\n` +
        `📖Š Success Rate: ${myUser.totalOrders > 0 ? ((successfulOrders / myUser.totalOrders) * 100).toFixed(1) : 0}%\n\n`;

    if (favoriteGame) {
        mystatsText += `🎮 *Favorite Game*\n` +
            `â­ ${favoriteGame[0]}: ${favoriteGame[1]} orders\n\n`;
    }

    if (auth.isReseller(m.sender)) {
        mystatsText += `👑 *Reseller Benefits*\n` +
            `âœ… Wholesale pricing\n` +
            `âœ… Lower markup rates\n` +
            `âœ… Keep 100% profit\n` +
            `âœ… Priority support\n`;
    }

    rikz.sendMessage(m.chat, { text: mystatsText }, { quoted: m });
    break;
    
    
    case 'promo':
    case 'promotions':
        const promoText = `ðŸŽŠ *Current Promotions* ðŸŽŠ

ðŸ”¥ *Regional Special Offers:*
â€¢ *Malaysia:* Best rates for MLBB, Free Fire, Valorant
â€¢ *Indonesia:* Special prices for MLBB ID, Magic Chess
â€¢ *Global:* Competitive pricing worldwide

💎 *Why Choose GameVia?*
âœ… Regional specialization
âœ… Instant processing 
âœ… 24/7 customer support
âœ… Secure & reliable service

🎮 *Popular Right Now:*
â€¢ Mobile Legends Malaysia - From RM0.97
â€¢ Free Fire SG/MY - Best rates
â€¢ Valorant Malaysia - Instant delivery
â€¢ COD Mobile MY/SG - Fast processing

Use *.price* to explore all games!`;
        rikz.sendMessage(m.chat, { text: promoText }, { quoted: m });
        break;

    case 'hotdeals':
        try {
            const dealsText = `ðŸ”¥ *HOT DEALS OF THE WEEK* ðŸ”¥\n\n` +
                `🎮 *Mobile Legends Malaysia*\n` +
                `   💎 5 Diamonds - RM0.97 (SAVE 10%)\n` +
                `   💎 11 Diamonds - RM2.15 (SAVE 15%)\n` +
                `   👑 Starlight Member - RM14.90\n\n` +
                `ðŸŽ¯ *Free Fire SG/MY*\n` +
                `   💰 5 Diamonds - RM1.05\n` +
                `   💰 50 Diamonds - RM9.80\n\n` +
                `ðŸ”« *COD Mobile MY/SG*\n` +
                `   âš¡ 80 CP - RM3.90\n` +
                `   âš¡ 425 CP - RM19.90\n\n` +
                `*Limited time offers! Use .price to order!*`;

            rikz.sendMessage(m.chat, { text: dealsText }, { quoted: m });
        } catch (error) {
            rikz.sendMessage(m.chat, { text: "âŒ Failed to load deals." }, { quoted: m });
        }
        break;

    case 'stock':
        try {
            const [gameSlug] = args;
            if (!gameSlug) {
                return rikz.sendMessage(m.chat, { 
                    text: "Usage: .stock <game_slug>\nExample: .stock mlbb\n\nUse .games to see available games." 
                }, { quoted: m });
            }

            const stockData = await apiCall('get_products.php', { slug: gameSlug });
            
            if (!stockData.success || !stockData.products) {
                return rikz.sendMessage(m.chat, { text: "âŒ Failed to fetch stock or game not found." }, { quoted: m });
            }

            let stockText = `📖¦ *Stock Check - ${stockData.game_name || gameSlug}*\n\n`;
            
            const categories = {};
            stockData.products.forEach(product => {
                if (!categories[product.category]) {
                    categories[product.category] = [];
                }
                categories[product.category].push(product);
            });

            Object.entries(categories).forEach(([category, products]) => {
                stockText += `*${category.toUpperCase()}*\n`;
                products.slice(0, 8).forEach(product => {
                    const status = product.stock === 'empty' ? 'âŒ' : product.stock === 'low' ? 'âš ï¸' : 'âœ…';
                    stockText += `${status} ${product.name} - RM${product.vprice}\n`;
                });
                stockText += '\n';
            });

            stockText += `📖Š Total Products: ${stockData.products.length}`;

            rikz.sendMessage(m.chat, { text: stockText }, { quoted: m });
        } catch (error) {
            rikz.sendMessage(m.chat, { text: "âŒ Failed to check stock." }, { quoted: m });
        }
        break;

    case 'search':
        try {
            const searchQuery = text.toLowerCase();
            if (!searchQuery) {
                return rikz.sendMessage(m.chat, { 
                    text: "Usage: .search <product_name>\nExample: .search diamond" 
                }, { quoted: m });
            }

            const gamesData = await apiCall('check_games.php');
            if (!gamesData.success) {
                return rikz.sendMessage(m.chat, { text: "âŒ Failed to search products." }, { quoted: m });
            }

            let searchResults = [];
            
            for (const game of gamesData.games.slice(0, 5)) {
                const productsData = await apiCall('get_products.php', { slug: game.slug });
                if (productsData.success && productsData.products) {
                    const matchingProducts = productsData.products.filter(product => 
                        product.name.toLowerCase().includes(searchQuery) ||
                        product.category.toLowerCase().includes(searchQuery)
                    ).slice(0, 3);
                    
                    matchingProducts.forEach(product => {
                        searchResults.push({
                            game: game.name,
                            product: product
                        });
                    });
                }
            }

            if (searchResults.length === 0) {
                return rikz.sendMessage(m.chat, { text: "âŒ No products found matching your search." }, { quoted: m });
            }

            let searchText = `ðŸ” *Search Results for "${searchQuery}"*\n\n`;
            
            searchResults.forEach((result, index) => {
                const pricing = localDB.getPricing();
                const finalPrice = result.product.vprice * (1 + pricing.regular_markup / 100);
                searchText += `${index + 1}. *${result.product.name}*\n`;
                searchText += `   🎮 ${result.game}\n`;
                searchText += `   💰 RM${finalPrice.toFixed(2)}\n`;
                searchText += `   📖¦ ${result.product.stock === 'empty' ? 'Out of Stock' : 'Available'}\n\n`;
            });

            searchText += `ðŸ’¡ Use .order-<game_slug>-<product_code> to order`;

            rikz.sendMessage(m.chat, { text: searchText }, { quoted: m });
        } catch (error) {
            rikz.sendMessage(m.chat, { text: "âŒ Search failed." }, { quoted: m });
        }
        break;
            
            
case 'mlposter':
    if (!auth.isReseller(m.sender)) {
        return rikz.sendMessage(m.chat, { text: "âŒ Reseller feature only." }, { quoted: m });
    }

    try {
        rikz.sendMessage(m.chat, { text: "ðŸŽ¨ Creating EPIC MLBB poster with real background..." }, { quoted: m });

        const productsData = await apiCall('get_products.php', { slug: 'mlbb' });
        if (!productsData.success || !productsData.products?.length) {
            throw new Error('No MLBB products available at the moment');
        }

        const pricing = localDB.getPricing();
        const userData = auth.getUser(m.sender);

        // Generate professional poster
        const posterBuffer = await realPosterGenerator.generateMLBBPoster(userData, productsData, pricing);
        
        await rikz.sendMessage(m.chat, {
            image: posterBuffer,
            caption: `🎮 *EPIC MLBB POSTER READY!* ðŸš€\n\n` +
                    `ðŸ”¥ *Professional Design with Real MLBB Background*\n` +
                    `💎 *All Diamond Packages Displayed*\n` +
                    `👑 *Your Branding Included*\n\n` +
                    `*Perfect for social media sharing!* 📖±`
        }, { quoted: m });

    } catch (error) {
        console.error('ML Poster error:', error);
        rikz.sendMessage(m.chat, { 
            text: `âŒ Failed to create poster: ${error.message}\n\nPlease try again in a moment.` 
        }, { quoted: m });
    }
    break;
            
    case 'reseller':
    if (!auth.userExists(m.sender)) {
        return rikz.sendMessage(m.chat, { text: "Please register first using .register" }, { quoted: m });
    }

    if (auth.isReseller(m.sender)) {
        
        const resellerText = `👑 *Reseller Dashboard*\n\n` +
            `ðŸ’¼ Your Account:\n` +
            `💰 Balance: RM${(user.balance || 0).toFixed(2)}\n` +
            `ðŸ›’ Total Orders: ${user.totalOrders || 0}\n` +
            `💳 Total Spent: RM${(user.totalSpent || 0).toFixed(2)}\n\n` +
            `*Wholesale Benefits:*\n` +
            `âœ… Lower markup rates\n` +
            `âœ… Buy at wholesale prices\n` +
            `âœ… Sell to your customers at retail\n` +
            `âœ… Keep 100% of your profit\n\n` +
            `Use .price to access wholesale pricing!`;

        rikz.sendMessage(m.chat, {
            text: resellerText,
            footer: "Wholesale prices available",
            buttons: [
                { buttonId: '.price', buttonText: { displayText: '🎮 Shop' }, type: 1 },
                { buttonId: '.balance', buttonText: { displayText: '💰 Balance' }, type: 1 },
                { buttonId: '.mystats', buttonText: { displayText: '📖Š Stats' }, type: 1 }
            ],
            headerType: 1
        }, { quoted: m });
    } else {
        const resellerApplyText = `👑 *Become a Reseller*\n\n` +
            `Join our reseller program and enjoy:\n\n` +
            `âœ… Wholesale pricing (lower markup)\n` +
            `âœ… Buy at cost + small margin\n` +
            `âœ… Sell to your customers at retail price\n` +
            `âœ… Keep 100% of your profit\n` +
            `âœ… Priority support\n\n` +
            `*How it works:*\n` +
            `1. You buy from us at wholesale price\n` +
            `2. You sell to your customers at retail price\n` +
            `3. You keep the difference as profit\n\n` +
            `Contact admin to apply!`;

        rikz.sendMessage(m.chat, { text: resellerApplyText }, { quoted: m });
    }
    break;

    case 'resellerstats':
    if (!auth.isReseller(m.sender)) {
        return rikz.sendMessage(m.chat, { text: "You are not a reseller." }, { quoted: m });
    }

    
    const resellerStatsText = `📖Š *Reseller Statistics*\n\n` +
        `💰 Current Balance: RM${(user.balance || 0).toFixed(2)}\n` +
        `ðŸ›’ Total Orders: ${user.totalOrders || 0}\n` +
        `💳 Total Spent: RM${(user.totalSpent || 0).toFixed(2)}\n` +
        `📖… Member Since: ${new Date(user.createdAt).toLocaleDateString()}\n\n` +
        `*Wholesale Advantage:*\n` +
        `â€¢ Buy at lower prices\n` +
        `â€¢ Set your own retail prices\n` +
        `â€¢ Keep all your profit\n` +
        `â€¢ Build your customer base`;

    rikz.sendMessage(m.chat, { text: resellerStatsText }, { quoted: m });
    break;

    case 'rewards':
        if (!auth.userExists(m.sender)) {
            return rikz.sendMessage(m.chat, { text: "Please register first using .register" }, { quoted: m });
        }

        const userForRewards = auth.getUser(m.sender);
        const userOrders = localDB.getUserOrders(m.sender, 100);
        const successfulOrdersCount = userOrders.filter(o => o.status === 'success').length;

        const rewardsText = `ðŸŽ *REWARDS & ACHIEVEMENTS* ðŸŽ\n\n` +
            `â­ *Your Progress*\n` +
            `ðŸ›’ Orders Completed: ${successfulOrdersCount}\n` +
            `💰 Total Spent: RM${(userForRewards.totalSpent || 0).toFixed(2)}\n\n` +
            `ðŸ† *Available Rewards*\n` +
            `ðŸŽ¯ 10 Orders - RM5 Bonus\n` +
            `ðŸŽ¯ 50 Orders - RM25 Bonus\n` +
            `ðŸŽ¯ 100 Orders - RM60 Bonus\n` +
            `ðŸŽ¯ RM500 Spent - VIP Status\n` +
            `ðŸŽ¯ RM1000 Spent - Premium Support\n\n` +
            `*Next Reward:* ${successfulOrdersCount >= 100 ? 'MAX LEVEL!' : 
                             successfulOrdersCount >= 50 ? '100 Orders - RM60' :
                             successfulOrdersCount >= 10 ? '50 Orders - RM25' : 
                             '10 Orders - RM5'}`;

        rikz.sendMessage(m.chat, { text: rewardsText }, { quoted: m });
        break;

    case 'claimreward':
        if (!auth.userExists(m.sender)) {
            return rikz.sendMessage(m.chat, { text: "Please register first using .register" }, { quoted: m });
        }

        const userForClaim = auth.getUser(m.sender);
        const userOrdersForClaim = localDB.getUserOrders(m.sender, 1000);
        const successfulOrdersForClaim = userOrdersForClaim.filter(o => o.status === 'success').length;

        let rewardAmount = 0;
        let rewardMessage = '';

        if (successfulOrdersForClaim >= 100 && !userForClaim.reward100) {
            rewardAmount = 60;
            rewardMessage = '🎉 CONGRATULATIONS! 100 Orders Milestone!';
            auth.updateUser(m.sender, { reward100: true });
        } else if (successfulOrdersForClaim >= 50 && !userForClaim.reward50) {
            rewardAmount = 25;
            rewardMessage = '🎉 CONGRATULATIONS! 50 Orders Milestone!';
            auth.updateUser(m.sender, { reward50: true });
        } else if (successfulOrdersForClaim >= 10 && !userForClaim.reward10) {
            rewardAmount = 5;
            rewardMessage = '🎉 CONGRATULATIONS! 10 Orders Milestone!';
            auth.updateUser(m.sender, { reward10: true });
        } else {
            return rikz.sendMessage(m.chat, { 
                text: "âŒ No rewards available to claim.\nUse .rewards to see available rewards." 
            }, { quoted: m });
        }

        auth.addBalance(m.sender, rewardAmount, `Milestone Reward - ${successfulOrdersForClaim} orders`);

        const claimText = `${rewardMessage}\n\n` +
            `💰 Reward: RM${rewardAmount.toFixed(2)}\n` +
            `ðŸ›’ Your Orders: ${successfulOrdersForClaim}\n` +
            `💳 New Balance: RM${(userForClaim.balance + rewardAmount).toFixed(2)}\n\n` +
            `Thank you for being a loyal customer! 🎮`;

        rikz.sendMessage(m.chat, { text: claimText }, { quoted: m });
        break;

    case 'vip':
        if (!auth.userExists(m.sender)) {
            return rikz.sendMessage(m.chat, { text: "Please register first using .register" }, { quoted: m });
        }

        const vipUser = auth.getUser(m.sender);
        const vipSpent = vipUser.totalSpent || 0;

        const vipText = `👑 *VIP PROGRAM* 👑\n\n` +
            `💰 Your Total Spent: RM${vipSpent.toFixed(2)}\n\n` +
            `*VIP Tiers:*\n` +
            `ðŸ¥‰ Bronze (RM100+)\n` +
            `   â€¢ 2% discount on all orders\n` +
            `   â€¢ Priority support\n\n` +
            `ðŸ¥ˆ Silver (RM500+)\n` +
            `   â€¢ 5% discount on all orders\n` +
            `   â€¢ Dedicated support agent\n` +
            `   â€¢ Early access to new games\n\n` +
            `ðŸ¥‡ Gold (RM1000+)\n` +
            `   â€¢ 8% discount on all orders\n` +
            `   â€¢ 24/7 priority support\n` +
            `   â€¢ Custom payment terms\n` +
            `   â€¢ Beta feature access\n\n` +
            `*Your Tier:* ${vipSpent >= 1000 ? 'ðŸ¥‡ GOLD' : 
                           vipSpent >= 500 ? 'ðŸ¥ˆ SILVER' : 
                           vipSpent >= 100 ? 'ðŸ¥‰ BRONZE' : 
                           'ðŸš€ STANDARD'}\n\n` +
            `*Next Tier:* ${vipSpent >= 1000 ? 'MAXIMUM!' : 
                            vipSpent >= 500 ? 'GOLD - RM' + (1000 - vipSpent).toFixed(2) + ' more' :
                            vipSpent >= 100 ? 'SILVER - RM' + (500 - vipSpent).toFixed(2) + ' more' :
                            'BRONZE - RM' + (100 - vipSpent).toFixed(2) + ' more'}`;

        rikz.sendMessage(m.chat, { text: vipText }, { quoted: m });
        break;

    case 'leaderboard':
        try {
            const users = auth.getAllUsers();
            const userArray = Object.entries(users)
                .filter(([_, user]) => user.totalOrders > 0)
                .sort((a, b) => (b[1].totalSpent || 0) - (a[1].totalSpent || 0))
                .slice(0, 10);

            let leaderboardText = `ðŸ† *TOP CUSTOMERS LEADERBOARD* ðŸ†\n\n`;

            userArray.forEach(([userId, user], index) => {
                const rankEmoji = index === 0 ? 'ðŸ¥‡' : index === 1 ? 'ðŸ¥ˆ' : index === 2 ? 'ðŸ¥‰' : 'ðŸ”¸';
                leaderboardText += `${rankEmoji} ${user.name}\n`;
                leaderboardText += `   💰 Spent: RM${(user.totalSpent || 0).toFixed(2)}\n`;
                leaderboardText += `  🛒 Orders: ${user.totalOrders || 0}\n`;
                
                if (user.role === 'reseller') {
                    leaderboardText += `   👑 Reseller\n`;
                }
                leaderboardText += '\n';
            });

            if (userArray.length === 0) {
                leaderboardText += `No orders yet. Be the first to top the leaderboard! 🎮`;
            }

            rikz.sendMessage(m.chat, { text: leaderboardText }, { quoted: m });
        } catch (error) {
            rikz.sendMessage(m.chat, { text: "âŒ Failed to load leaderboard." }, { quoted: m });
        }
        break;

    case 'help':
        const helpText = `🎮 *GameVia Bot Commands* 🌍

*Basic Commands:*
â€¢ .menu - Main menu
â€¢ .help - Show help  
â€¢ .register - Register account
â€¢ .price / .games - Browse games
â€¢ .balance - Check balance
â€¢ .topup - Add funds
â€¢ .topupmethods - Payment methods
â€¢ .withdraw - Withdraw funds
â€¢ .transfer - Transfer to user
â€¢ .history - Order history
â€¢ .stats - Basic statistics
â€¢ .mystats - Detailed statistics
â€¢ .promo - Current promotions
â€¢ .hotdeals - Weekly deals

*Gaming Commands:*
â€¢ .stock <game> - Check stock
â€¢ .search <product> - Search products
â€¢ .status - System status

*Reseller Commands:*
â€¢ .reseller - Reseller dashboard
â€¢ .resellerstats - Reseller statistics

*Rewards & VIP:*
â€¢ .rewards - Reward program
â€¢ .claimreward - Claim rewards
â€¢ .vip - VIP program
â€¢ .leaderboard - Top customers

*Support & Info:*
â€¢ .tutorial - How to use bot
â€¢ .support - Contact support
â€¢ .feedback - Send feedback
â€¢ .quote - Daily motivation
â€¢ .funfact - Interesting facts

*Admin Commands:*
â€¢ .broadcast - Send to all users
â€¢ .addbalance - Add user balance
â€¢ .analytics - Business analytics
â€¢ .users - List all users
â€¢ .addreseller - Add reseller
â€¢ .listresellers - List resellers
â€¢ .dailyreport - Daily report
â€¢ .system - System status
â€¢ .cleanup - System cleanup
â€¢ .backup - Database backup

*Popular Regions:*
ðŸ‡²ðŸ‡¾ *Malaysia:* MLBB, Free Fire, Valorant, COD
ðŸ‡®ðŸ‡© *Indonesia:* MLBB ID, Magic Chess, Valorant ID  
🌍 *Global:* MLBB Global, PUBG, Brazil, Dragon Raja

*Why Choose Us?*
âœ… Regional specialization = Best rates
âœ… Fast & secure processing
âœ… 24/7 reliable service`;

        rikz.sendMessage(m.chat, { text: helpText }, { quoted: m });
        break;

    case 'tutorial':
        const tutorialText = `ðŸŽ“ *GAMEVIA BOT TUTORIAL* ðŸŽ“\n\n` +
            `📖 *Getting Started:*\n` +
            `1. Use .register to create account\n` +
            `2. Use .topupmethods to see payment options\n` +
            `3. Use .price to browse games\n` +
            `4. Follow order instructions\n\n` +
            `ðŸ›’ *How to Order:*\n` +
            `â€¢ Use .price to see categories\n` +
            `â€¢ Select your region\n` +
            `â€¢ Choose a game\n` +
            `â€¢ Select product\n` +
            `â€¢ Provide USER_ID & ZONE_ID\n` +
            `â€¢ Confirm order\n\n` +
            `ðŸ’¡ *Pro Tips:*\n` +
            `â€¢ Use .stock to check availability\n` +
            `â€¢ Use .search to find products\n` +
            `â€¢ Use .hotdeals for best prices\n` +
            `â€¢ Contact admin for bulk orders\n\n` +
            `â“ *Need Help?*\n` +
            `Use .support to contact admin`;

        rikz.sendMessage(m.chat, { text: tutorialText }, { quoted: m });
        break;

    case 'support':
        const supportText = `ðŸ†˜ *SUPPORT & CONTACT* ðŸ†˜\n\n` +
            `📖ž *Customer Support*\n` +
            `â€¢ WhatsApp: +60 12-345 6789\n` +
            `â€¢ Telegram: @gameviasupport\n` +
            `â€¢ Email: support@gamevia.com\n\n` +
            `ðŸ•’ *Operating Hours*\n` +
            `â€¢ Monday-Sunday: 9AM - 12AM\n` +
            `â€¢ Emergency: 24/7 for urgent issues\n\n` +
            `ðŸ”§ *Common Issues*\n` +
            `â€¢ Order not processed? Contact us!\n` +
            `â€¢ Wrong USER_ID/ZONE_ID? We can help!\n` +
            `â€¢ Payment issues? Send receipt\n\n` +
            `â­ *Priority Support for:*\n` +
            `â€¢ Resellers\n` +
            `â€¢ VIP Members\n` +
            `â€¢ Bulk Orders\n\n` +
            `*We're here to help!* 🎮`;

        rikz.sendMessage(m.chat, { text: supportText }, { quoted: m });
        break;

    case 'status':
        try {
            const statusCheck = await apiCall('check_games.php');
            const systemStatus = statusCheck.success ? 'âœ… OPERATIONAL' : 'âš ï¸ DEGRADED';
            
            const statusText = `📖Š *SYSTEM STATUS* 📖Š\n\n` +
                `ðŸ¤– Bot: âœ… ONLINE\n` +
                `ðŸŒ API: ${systemStatus}\n` +
                `ðŸ’¾ Database: âœ… LOCAL\n` +
                `📖¡ Services: âœ… RUNNING\n\n` +
                `ðŸ•’ Last Check: ${new Date().toLocaleTimeString()}\n` +
                `âš¡ Response: ${statusCheck.success ? 'Fast' : 'Slow'}\n\n` +
                `*All systems are go! Ready to serve!* ðŸš€`;

            rikz.sendMessage(m.chat, { text: statusText }, { quoted: m });
        } catch (error) {
            rikz.sendMessage(m.chat, { text: "âŒ Status check failed." }, { quoted: m });
        }
        break;

    case 'feedback':
    const feedbackMessage = body.replace('.feedback', '').trim(); // Fixed: remove command
    if (!feedbackMessage) {
        return rikz.sendMessage(m.chat, { 
            text: "Usage: .feedback <your_message>\nExample: .feedback The bot is amazing but could use more games!" 
        }, { quoted: m });
    }

    const userForFeedback = auth.getUser(m.sender);
    const feedbackText = `📖 *NEW FEEDBACK*\n\n` +
        `ðŸ‘¤ From: ${userForFeedback.name}\n` +
        `📖± User ID: ${m.sender}\n` +
        `ðŸ’¬ Message: ${feedbackMessage}\n` +
        `â° Time: ${new Date().toLocaleString()}`;

    // Save feedback to database
    const feedbacks = localDB.loadJSON('feedback.json');
    const feedbackId = `fb_${Date.now()}`;
    feedbacks[feedbackId] = {
        userId: m.sender,
        userName: userForFeedback.name,
        message: feedbackMessage,
        timestamp: new Date().toISOString()
    };
    localDB.saveJSON('feedback.json', feedbacks);

    rikz.sendMessage(m.chat, { 
        text: `âœ… *Thank you for your feedback!*\n\nWe've received your message and will review it soon.\n\nYour opinion helps us improve! ðŸŒŸ` 
    }, { quoted: m });

    // Notify all admins
    if (global.Chatadmin && Array.isArray(global.Chatadmin)) {
        try {
            for (const admin of global.Chatadmin) {
                await rikz.sendMessage(admin, { text: feedbackText });
            }
        } catch (error) {
            console.log('Failed to notify admins of feedback:', error);
        }
    }
    break;

    case 'quote':
        try {
            const quotes = [
                "🎮 The game is not over until you win! - GameVia",
                "💎 Diamonds are forever, so are our prices!",
                "ðŸš€ Level up your gaming with GameVia!",
                "👑 Kings shop at GameVia for the best deals!",
                "âš¡ Fast delivery? We're lightning speed!",
                "💰 Save more, game more with GameVia!",
                "ðŸŽ¯ Your satisfaction is our victory!",
                "ðŸ”¥ Hot deals for cool gamers!",
                "ðŸŒŸ The stars align for GameVia customers!",
                "ðŸ›¡ï¸ Your trusted gaming partner since day one!"
            ];
            
            const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
            rikz.sendMessage(m.chat, { text: `ðŸ’« *DAILY QUOTE*\n\n"${randomQuote}"` }, { quoted: m });
        } catch (error) {
            rikz.sendMessage(m.chat, { text: "âŒ Failed to get quote." }, { quoted: m });
        }
        break;

    case 'funfact':
        try {
            const funFacts = [
                "Did you know? GameVia processes over 1000 orders daily!",
                "Fun Fact: Our fastest delivery was 3 seconds!",
                "Interesting: We support games from 15+ countries!",
                "Wow: Some customers have saved over RM500 with our deals!",
                "Amazing: We've been serving gamers since 2020!",
                "Cool: Our system runs 24/7 without downtime!",
                "Fact: We offer the best rates in Malaysia!",
                "Did you know? We have special deals every Friday!",
                "Fun: Our most popular game is Mobile Legends!",
                "Interesting: We support 5 different payment methods!"
            ];
            
            const randomFact = funFacts[Math.floor(Math.random() * funFacts.length)];
            rikz.sendMessage(m.chat, { text: `ðŸ¤” *FUN FACT*\n\n${randomFact}` }, { quoted: m });
        } catch (error) {
            rikz.sendMessage(m.chat, { text: "âŒ Failed to get fun fact." }, { quoted: m });
        }
        break;

    // =============== ADMIN COMMANDS ===============
    case 'broadcast':
        if (!isCreator) break;
        const broadcastMessage = text;
        if (!broadcastMessage) return rikz.sendMessage(m.chat, { text: "Usage: .broadcast <message>" }, { quoted: m });
        
        rikz.sendMessage(m.chat, { text: "📖¢ Starting broadcast to all users..." }, { quoted: m });
        
        const users = auth.getAllUsers();
        let successCount = 0;
        let failCount = 0;
        
        Object.keys(users).forEach(async (userId, index) => {
            setTimeout(async () => {
                try {
                    await rikz.sendMessage(userId, { 
                        text: `📖¢ *Announcement*\n\n${broadcastMessage}` 
                    });
                    successCount++;
                } catch (error) {
                    failCount++;
                }
            }, index * CONFIG.BROADCAST_DELAY);
        });

        setTimeout(() => {
            rikz.sendMessage(m.chat, { 
                text: `📖Š Broadcast Completed:\nTotal: ${Object.keys(users).length}\nSuccessful: ${successCount}\nFailed: ${failCount}` 
            }, { quoted: m });
        }, Object.keys(users).length * CONFIG.BROADCAST_DELAY + 5000);
        break;

    case 'broadcastimage':
        if (!isCreator) break;
        
        if (!m.quoted || !m.quoted.imageMessage) {
            return rikz.sendMessage(m.chat, { 
                text: "Usage: Reply to an image with .broadcastimage <caption>" 
            }, { quoted: m });
        }

        const broadcastCaption = text;
        const broadcastUsers = auth.getAllUsers();
        
        rikz.sendMessage(m.chat, { text: `📖¢ Broadcasting image to ${Object.keys(broadcastUsers).length} users...` }, { quoted: m });

        let imageSuccessCount = 0;
        let imageFailCount = 0;

        Object.keys(broadcastUsers).forEach(async (userId, index) => {
            setTimeout(async () => {
                try {
                    await rikz.sendMessage(userId, {
                        image: { url: m.quoted.imageMessage.url },
                        caption: broadcastCaption || "📖¢ Announcement from GameVia!",
                        contextInfo: {
                            mentionedJid: [userId]
                        }
                    });
                    imageSuccessCount++;
                } catch (error) {
                    imageFailCount++;
                }
            }, index * 1000);
        });

        setTimeout(() => {
            rikz.sendMessage(m.chat, { 
                text: `📖Š Image Broadcast Complete:\nTotal: ${Object.keys(broadcastUsers).length}\nâœ… Successful: ${imageSuccessCount}\nâŒ Failed: ${imageFailCount}` 
            }, { quoted: m });
        }, Object.keys(broadcastUsers).length * 1000 + 5000);
        break;

    case 'addbalance':
    if (!isCreator) break;
    const [addBalanceTargetUser, addBalanceAmountStr] = args;
    const addBalanceAmount = parseFloat(addBalanceAmountStr);
    
    if (!addBalanceTargetUser || isNaN(addBalanceAmount)) {
        return rikz.sendMessage(m.chat, { 
            text: "Usage: .addbalance <user_id> <amount>\nExample: .addbalance 60123456789 50" 
        }, { quoted: m });
    }

    const addBalanceTargetUserId = addBalanceTargetUser.includes('@s.whatsapp.net') ? addBalanceTargetUser : `${addBalanceTargetUser}@s.whatsapp.net`;
    const addBalanceResult = await auth.addBalance(addBalanceTargetUserId, addBalanceAmount, 'Admin topup');
    
    if (addBalanceResult.success) {
        rikz.sendMessage(m.chat, { 
            text: `✅ Added RM${addBalanceAmount.toFixed(2)} to ${addBalanceTargetUserId}\nNew Balance: RM${addBalanceResult.newBalance.toFixed(2)}` 
        }, { quoted: m });
        
        try {
            await rikz.sendMessage(addBalanceTargetUserId, {
                text: `💳 *Balance Updated!*\n\nAdded: RM${addBalanceAmount.toFixed(2)}\nNew Balance: RM${addBalanceResult.newBalance.toFixed(2)}\nReason: Admin topup\n\nThank you! 🎮`
            });
        } catch (error) {
            console.log('Failed to notify user:', error);
        }
    } else {
        rikz.sendMessage(m.chat, { 
            text: `❌ Failed: ${addBalanceResult.error || 'Unknown error'}` 
        }, { quoted: m });
    }
    break;

case 'addreseller':
    if (!isCreator) break;
    const [addResellerUser] = args;
    
    if (!addResellerUser) {
        return rikz.sendMessage(m.chat, { 
            text: "Usage: .addreseller <user_id>\nExample: .addreseller 60123456789\n\nPlease enter the user ID you want to make reseller." 
        }, { quoted: m });
    }

    const addResellerUserId = addResellerUser.includes('@s.whatsapp.net') ? addResellerUser : `${addResellerUser}@s.whatsapp.net`;
    
    if (!auth.userExists(addResellerUserId)) {
        return rikz.sendMessage(m.chat, { 
            text: "❌ User not found. Please ask them to register first using .register" 
        }, { quoted: m });
    }

    const targetUser = auth.getUser(addResellerUserId);
    if (!targetUser) {
        return rikz.sendMessage(m.chat, { 
            text: "❌ User data not found. Please try again." 
        }, { quoted: m });
    }

    const addResellerResult = await auth.createReseller(addResellerUserId, {  
        name: targetUser.name || "Unknown User"
    });

    if (addResellerResult.success) {
        rikz.sendMessage(m.chat, { 
            text: `✅ *Reseller Added!*\n\nUser: ${targetUser.name}\nID: ${addResellerUserId}\n\nThey now have access to reseller pricing.` 
        }, { quoted: m });
        
        try {
            await rikz.sendMessage(addResellerUserId, { 
                text: `🎉 *Congratulations!*\n\nYou have been added as a reseller!\n\n*Benefits:*\n• Special reseller pricing\n• Priority support\n\nUse .reseller to access your dashboard!` 
            });
        } catch (error) {
            console.log('Failed to notify new reseller:', error);
        }
    } else {
        rikz.sendMessage(m.chat, { 
            text: `❌ Failed: ${addResellerResult.error || 'Unknown error'}` 
        }, { quoted: m });
    }
    break;

// ==================== NEW REMOVE RESELLER COMMAND ====================
case 'removereseller':
    if (!isCreator) break;
    const [removeResellerUser] = args;
    
    if (!removeResellerUser) {
        return rikz.sendMessage(m.chat, { 
            text: "Usage: .removereseller <user_id>\nExample: .removereseller 60123456789\n\nPlease enter the user ID you want to remove from resellers." 
        }, { quoted: m });
    }

    const removeResellerUserId = removeResellerUser.includes('@s.whatsapp.net') ? removeResellerUser : `${removeResellerUser}@s.whatsapp.net`;
    
    // Check if user exists
    if (!auth.userExists(removeResellerUserId)) {
        return rikz.sendMessage(m.chat, { 
            text: "❌ User not found." 
        }, { quoted: m });
    }

    // Check if user is actually a reseller
    if (!auth.isReseller(removeResellerUserId)) {
        return rikz.sendMessage(m.chat, { 
            text: "❌ User is not a reseller." 
        }, { quoted: m });
    }

    const userToRemove = auth.getUser(removeResellerUserId);
    
    try {
        // Remove from resellers and update user role
        const removeResellerResult = await auth.updateUserRole(removeResellerUserId, 'user');
        
        if (removeResellerResult.success) {
            rikz.sendMessage(m.chat, { 
                text: `✅ *Reseller Removed!*\n\nUser: ${userToRemove.name}\nID: ${removeResellerUserId}\n\nThey no longer have reseller privileges.` 
            }, { quoted: m });
            
            try {
                await rikz.sendMessage(removeResellerUserId, { 
                    text: `ℹ️ *Reseller Status Update*\n\nYour reseller privileges have been removed.\n\nYou can still use the bot with regular pricing.\n\nContact admin if you have any questions.` 
                });
            } catch (error) {
                console.log('Failed to notify removed reseller:', error);
            }
        } else {
            rikz.sendMessage(m.chat, { 
                text: `❌ Failed to remove reseller: ${removeResellerResult.error || 'Unknown error'}` 
            }, { quoted: m });
        }
    } catch (error) {
        rikz.sendMessage(m.chat, { 
            text: `❌ Error removing reseller: ${error.message}` 
        }, { quoted: m });
    }
    break;

            case 'session':
    const userSession = sessionManager.getSession(m.sender);
    
    if (!userSession) {
        return rikz.sendMessage(m.chat, { 
            text: "📊 *No Active Session*\n\nYou don't have any active order session.\n\nUse *.price* to start ordering!" 
        }, { quoted: m });
    }
    
    let sessionText = `📊 *Your Active Session*\n\n`;
    sessionText += `🎮 Game: ${userSession.gameSlug || 'Unknown'}\n`;
    sessionText += `📦 Product: ${userSession.productCode || 'Unknown'}\n`;
    sessionText += `📝 Step: ${userSession.step || 'Unknown'}\n`;
    sessionText += `⏰ Last Active: ${new Date(userSession.lastActivity).toLocaleTimeString()}\n\n`;
    
    if (userSession.orderData) {
        sessionText += `👤 USER_ID: ${userSession.orderData.user_id}\n`;
        sessionText += `📍 ZONE_ID: ${userSession.orderData.zone_id}\n`;
        sessionText += `💰 Amount: RM${userSession.orderData.price?.toFixed(2) || '0.00'}\n`;
    }
    
    sessionText += `\n💡 *Actions:*\n`;
    sessionText += `• Use *.cancel* to cancel this order\n`;
    sessionText += `• Continue with your order\n`;
    
    if (userSession.step === 'awaiting_confirmation') {
        sessionText += `• Use *.confirm* to complete order\n`;
    }
    
    rikz.sendMessage(m.chat, { text: sessionText }, { quoted: m });
    break;
            
    case 'analytics':
        if (!isCreator) break;
        const comprehensiveStats = analytics.getComprehensiveAnalytics();
        const dailyStats = analytics.getDailyAnalytics();
        const userStatsAll = auth.getUserStats();
        
        const analyticsText = `📖ˆ *Business Analytics*\n
📖… *Today's Stats:*
â€¢ Commands: ${dailyStats.commands}
â€¢ Orders: ${dailyStats.orders}
â€¢ Revenue: RM${dailyStats.revenue.toFixed(2)}
â€¢ New Users: ${dailyStats.newUsers}

📖Š *Overall Stats:*
â€¢ Total Users: ${comprehensiveStats.totalUsers}
â€¢ Total Orders: ${comprehensiveStats.totalOrders}
â€¢ Success Rate: ${comprehensiveStats.successRate}%
â€¢ Total Revenue: RM${comprehensiveStats.totalRevenue.toFixed(2)}
â€¢ Avg Order: RM${comprehensiveStats.averageOrderValue.toFixed(2)}

💰 *Financial Stats:*
â€¢ Total User Balance: RM${userStatsAll.totalBalance.toFixed(2)}
â€¢ Total Spent: RM${userStatsAll.totalSpent.toFixed(2)}

🎮 *Popular Games Today:*
${Object.entries(dailyStats.popularGames)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([game, count]) => `â€¢ ${game}: ${count} orders`)
    .join('\n')}`;

        rikz.sendMessage(m.chat, { text: analyticsText }, { quoted: m });
        break;

    case 'dailyreport':
        if (!isCreator) break;
        
        try {
            const dailyReportStats = analytics.getDailyAnalytics();
            const systemReportStats = localDB.getStats();
            const userReportStats = auth.getUserStats();

            const reportText = `📖Š *DAILY REPORT* 📖Š\n\n` +
                `📖… Date: ${new Date().toLocaleDateString()}\n` +
                `â° Generated: ${new Date().toLocaleTimeString()}\n\n` +
                `📖ˆ *Today's Performance*\n` +
                `📖 Commands: ${dailyReportStats.commands}\n` +
                `ðŸ›’ Orders: ${dailyReportStats.orders}\n` +
                `âœ… Successful: ${dailyReportStats.successfulOrders}\n` +
                `âŒ Failed: ${dailyReportStats.failedOrders}\n` +
                `💰 Revenue: RM${dailyReportStats.revenue.toFixed(2)}\n` +
                `ðŸ‘¤ New Users: ${dailyReportStats.newUsers}\n\n` +
                `📖Š *Overall Statistics*\n` +
                `ðŸ‘¥ Total Users: ${systemReportStats.totalUsers}\n` +
                `ðŸ›’ Total Orders: ${systemReportStats.totalOrders}\n` +
                `📖ˆ Success Rate: ${systemReportStats.successRate}%\n` +
                `💵 Total Revenue: RM${systemReportStats.totalRevenue.toFixed(2)}\n\n` +
                `💳 *Financial Overview*\n` +
                `💰 User Balances: RM${userReportStats.totalBalance.toFixed(2)}\n` +
                `💸 Total Spent: RM${userReportStats.totalSpent.toFixed(2)}`;

            rikz.sendMessage(m.chat, { text: reportText }, { quoted: m });
        } catch (error) {
            rikz.sendMessage(m.chat, { text: "âŒ Failed to generate report." }, { quoted: m });
        }
        break;

            case 'sync':
    if (!isCreator) break;
    rikz.sendMessage(m.chat, { text: "🔄 Syncing all data to GitHub..." }, { quoted: m });
    await githubDB.syncAllData();
    rikz.sendMessage(m.chat, { text: "✅ All data synced to GitHub!" }, { quoted: m });
    break;
            
   // ==================== FIXED USERS COMMAND ====================
case 'users':
    if (!isCreator) break;
    
    try {
        const allUsers = auth.getAllUsers();
        const userList = Object.entries(allUsers)
            .sort((a, b) => new Date(b[1].createdAt) - new Date(a[1].createdAt))
            .slice(0, 15); // Show last 15 users
        
        let usersText = `👥 *Recent Users* (Last 15 of ${Object.keys(allUsers).length} total)\n\n`;
        userList.forEach(([userId, user], index) => {
            const date = new Date(user.createdAt).toLocaleDateString();
            const roleEmoji = user.role === 'reseller' ? '👑' : '👤';
            usersText += `${index + 1}. ${roleEmoji} ${user.name}\n`;
            usersText += `   📱 ${userId}\n`;
            usersText += `   💰 RM${user.balance?.toFixed(2) || '0.00'}\n`;
            usersText += `   🛒 ${user.totalOrders || 0} orders\n`;
            usersText += `   📅 ${date}\n`;
            
            // Add quick actions for resellers
            if (user.role === 'reseller') {
                usersText += `   ⚡ Remove: .removereseller ${userId.replace('@s.whatsapp.net', '')}\n`;
            } else {
                usersText += `   ⚡ Make Reseller: .addreseller ${userId.replace('@s.whatsapp.net', '')}\n`;
            }
            usersText += `   ──────────────\n`;
        });

        rikz.sendMessage(m.chat, { text: usersText }, { quoted: m });
    } catch (error) {
        console.error('Users command error:', error);
        rikz.sendMessage(m.chat, { 
            text: `❌ Failed to load users: ${error.message}` 
        }, { quoted: m });
    }
    break;


  case 'listresellers':
    if (!isCreator) break;
    
    try {
        const allResellers = auth.getAllResellers();
        const resellerList = Object.entries(allResellers)
            .sort((a, b) => new Date(b[1].createdAt) - new Date(a[1].createdAt));

        let resellersText = `👑 *Resellers List* (${resellerList.length} total)\n\n`;
        
        if (resellerList.length === 0) {
            resellersText += `No resellers found.\nUse .addreseller to add resellers.`;
        } else {
            resellerList.forEach(([userId, reseller], index) => {
                const user = auth.getUser(userId);
                const date = new Date(reseller.createdAt).toLocaleDateString();
                
                resellersText += `${index + 1}. ${reseller.name}\n`;
                resellersText += `   📱 ID: ${userId}\n`;
                resellersText += `   💰 Balance: RM${(user?.balance || 0).toFixed(2)}\n`;
                resellersText += `   🛒 Orders: ${user?.totalOrders || 0}\n`;
                resellersText += `   📅 Since: ${date}\n`;
                
                // Add quick actions
                resellersText += `   ⚡ Actions: .removereseller ${userId.replace('@s.whatsapp.net', '')}\n`;
                resellersText += `   ──────────────\n`;
            });
        }

        // Add summary
        const totalResellerSpent = Object.keys(allResellers).reduce((sum, userId) => {
            const user = auth.getUser(userId);
            return sum + (user?.totalSpent || 0);
        }, 0);
        
        resellersText += `\n💰 Total Revenue from Resellers: RM${totalResellerSpent.toFixed(2)}`;

        rikz.sendMessage(m.chat, { text: resellersText }, { quoted: m });
    } catch (error) {
        console.error('List resellers error:', error);
        rikz.sendMessage(m.chat, { 
            text: `❌ Failed to load resellers: ${error.message}` 
        }, { quoted: m });
    }
    break;


    case 'system':
        if (!isCreator) break;
        
        try {
            const os = require('os');
            const usage = process.memoryUsage();
            
            const systemText = `ðŸ–¥ï¸ *SYSTEM STATUS* ðŸ–¥ï¸\n\n` +
                `ðŸ¤– *Bot Info*\n` +
                `â° Uptime: ${Math.floor(process.uptime() / 60)} minutes\n` +
                `📖Š Memory: ${Math.round(usage.heapUsed / 1024 / 1024)}MB / ${Math.round(usage.heapTotal / 1024 / 1024)}MB\n` +
                `ðŸ”„ Node.js: ${process.version}\n\n` +
                `ðŸ’¾ *Database Stats*\n` +
                `ðŸ‘¥ Users: ${Object.keys(auth.getAllUsers()).length}\n` +
                `ðŸ›’ Orders: ${localDB.getStats().totalOrders}\n` +
                `ðŸ’¿ Storage: Checking...\n\n` +
                `📖ˆ *Performance*\n` +
                `âš¡ CPU: ${os.cpus().length} cores\n` +
                `ðŸ’¾ RAM: ${Math.round(os.totalmem() / 1024 / 1024 / 1024)}GB total\n` +
                `📖¡ Platform: ${os.platform()} ${os.arch()}`;

            rikz.sendMessage(m.chat, { text: systemText }, { quoted: m });
        } catch (error) {
            rikz.sendMessage(m.chat, { text: "âŒ Failed to get system info." }, { quoted: m });
        }
        break;

    case 'cleanup':
        if (!isCreator) break;
        
        try {
            const sessionStats = sessionManager.getStats();
            sessionManager.setupCleanupInterval();
            localDB.cleanupBackups();
            auth.cleanupSessions();
            
            const cleanupText = `ðŸ§¹ *SYSTEM CLEANUP COMPLETE* ðŸ§¹\n\n` +
                `ðŸ—‘ï¸ Sessions: ${sessionStats.totalSessions} total\n` +
                `ðŸ”„ Active: ${sessionStats.activeSessions} active\n` +
                `ðŸ’¾ Backups: Cleaned old backups\n` +
                `ðŸ” Auth: Cleaned expired sessions\n\n` +
                `âœ… System optimized and ready!`;

            rikz.sendMessage(m.chat, { text: cleanupText }, { quoted: m });
        } catch (error) {
            rikz.sendMessage(m.chat, { text: "âŒ Cleanup failed." }, { quoted: m });
        }
        break;
        
        case 'debugprice':
    const pricing = localDB.getPricing();
    const testProduct = { vprice: 0.97 };
    
    const regularPrice = testProduct.vprice * (1 + pricing.regular_markup / 100);
    const resellerPrice = testProduct.vprice * (1 + pricing.reseller_markup / 100);
    
    rikz.sendMessage(m.chat, {
        text: `💰 *Pricing Debug*\n\n` +
              `Base Cost: RM${testProduct.vprice.toFixed(2)}\n` +
              `Regular Markup: ${pricing.regular_markup}% â†’ RM${regularPrice.toFixed(2)}\n` +
              `Reseller Markup: ${pricing.reseller_markup}% â†’ RM${resellerPrice.toFixed(2)}`
    }, { quoted: m });
    break;

case 'testapi':
    const testUrl = 'https://api.ryzumi.vip/api/stalk/mobile-legends?userId=1579831626&zoneId=16637';
    
    try {
        rikz.sendMessage(m.chat, { text: `ðŸ”§ Testing API: ${testUrl}` }, { quoted: m });
        
        const response = await fetch(testUrl);
        const status = response.status;
        const headers = Object.fromEntries(response.headers.entries());
        
        const result = await response.json();
        
        const debugText = `📖Š *API Debug Results*\n\n` +
            `ðŸ”— URL: ${testUrl}\n` +
            `📖¡ Status: ${status}\n` +
            `📖¦ Response: ${JSON.stringify(result, null, 2)}\n` +
            `📖‹ Headers: ${JSON.stringify(headers, null, 2)}`;
            
        rikz.sendMessage(m.chat, { text: debugText }, { quoted: m });
        
    } catch (error) {
        rikz.sendMessage(m.chat, { 
            text: `âŒ *API Error*\n\n${error.message}\n\nStack: ${error.stack}` 
        }, { quoted: m });
    }
    break;

    case 'backup':
        if (!isCreator) break;
        rikz.sendMessage(m.chat, { text: 'ðŸ’¾ Starting database backup...' }, { quoted: m });
        
        const backupResult = await localDB.backup();
        if (backupResult.success) {
            rikz.sendMessage(m.chat, { 
                text: `âœ… Backup completed!\nBackup ID: ${backupResult.backupId}\nFiles: ${backupResult.files}` 
            }, { quoted: m });
        } else {
            rikz.sendMessage(m.chat, { text: 'âŒ Backup failed' }, { quoted: m });
        }
        break;

// =============== DYNAMIC COMMANDS ===============
default:
    if (command.startsWith('category-')) {
        const categoryKey = command.replace('category-', '');
        const category = gameCategories.getAllCategories()[categoryKey];
        
        if (!category) return;

        try {
            const gamesData = await apiCall('check_games.php');
            if (!gamesData?.success) {
                return rikz.sendMessage(m.chat, { text: "❌ Failed to load games from API." }, { quoted: m });
            }

            const categoryGames = gamesData.games.filter(game => 
                category.games.includes(game.slug)
            );

            if (categoryGames.length === 0) {
                return rikz.sendMessage(m.chat, { text: "❌ No games found in this category." }, { quoted: m });
            }

            const gameButtons = categoryGames.map(game => ({
                buttonId: `.select-${game.slug}`,
                buttonText: { displayText: game.name },
                type: 1
            }));

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
            console.error('Error in category command:', err);
            rikz.sendMessage(m.chat, { text: "❌ Failed to load games." }, { quoted: m });
        }
    }
else if (command.startsWith('select-')) {
    const slug = command.replace('select-', '');
    
    try {
        const productData = await apiCall('get_products.php', { slug });
        if(!productData.success || !productData.products?.length) {
            return rikz.sendMessage(m.chat, { text: "No products available for this game." }, { quoted: m });
        }

        const category = gameCategories.getGameCategory(slug);
        const categoryInfo = gameCategories.getAllCategories()[category];
        
        // FIXED: Get pricing with proper await
        const pricing = await localDB.getPricing();
        
        const productButtons = productData.products.map(product => {
            let markup = pricing.regular_markup;
            if (auth.isReseller(m.sender)) {
                markup = pricing.reseller_markup;
            }
            
            // FIXED: Use base price with markup
            const basePrice = product.pricing_status === 'custom' ? product.custom_price : product.vprice;
            const profitPrice = (basePrice * (1 + markup / 100)).toFixed(2);
            
            console.log(`💰 Select Debug: ${product.name} - Base: ${basePrice}, Markup: ${markup}%, Final: ${profitPrice}`);
            
            return {
                buttonId: `.order-${slug}-${product.srv_code}`,
                buttonText: { displayText: `${product.name} - RM${profitPrice}` },
                type: 1
            };
        });

        productButtons.push({
            buttonId: `.category-${category}`,
            buttonText: { displayText: '⬅️ Back' },
            type: 1
        });

        const roleText = auth.isReseller(m.sender) ? '👑 Reseller Pricing' : 'Regular Pricing';
        
        rikz.sendMessage(m.chat, {
            text: `🎮 *${productData.game_name || slug}* ${categoryInfo?.name.includes('Malaysia') ? '🇲🇾' : categoryInfo?.name.includes('Indonesia') ? '🇮🇩' : '🌍'}\n*${roleText} - Best rates included*\n\n*Category:* ${categoryInfo?.name || 'General'}`,
            footer: "Select a product to order",
            buttons: productButtons,
            headerType: 1
        }, { quoted: m });

    } catch(err){
        console.log('Select error:', err);
        rikz.sendMessage(m.chat, { text: "Failed to fetch products." }, { quoted: m });
    }
}

    else if (command.startsWith('order-')) {
    if (!auth.userExists(m.sender)) {
        return rikz.sendMessage(m.chat, { text: "❌ Please register first using .register" }, { quoted: m });
    }

    const [_, orderSlug, orderSrvCode] = command.split('-');
    
    // FIXED: Create session with proper data
    sessionManager.createSession(m.sender, {
        step: "awaiting_ids",
        gameSlug: orderSlug,
        productCode: orderSrvCode
    });
    
    let orderGameName = orderSlug;
    try {
        const orderGamesData = await apiCall('check_games.php');
        if (orderGamesData.success) {
            const game = orderGamesData.games.find(g => g.slug === orderSlug);
            if (game) orderGameName = game.name;
        }
    } catch (e) {
        console.log('Failed to fetch game name:', e);
    }
    
    // Special instruction for MLBB
    const isMLBB = orderSlug.includes('mobile_legends') || orderSlug.includes('mlbb');
    const extraInfo = isMLBB ? 
        `\n💡 *Pro Tip:* Use .mlinfo <user_id> <zone_id> to verify your account first!` : '';
        
    // FIXED: Show product price in the order setup message
    let productPriceInfo = '';
    try {
        const productData = await apiCall('get_products.php', { slug: orderSlug });
        if (productData.success && productData.products) {
            const product = productData.products.find(p => 
                p.srv_code.toLowerCase() === orderSrvCode.toLowerCase()
            );
            if (product) {
                // FIXED: Calculate price with markup
                const pricing = await localDB.getPricing();
                let markup = pricing.regular_markup;
                if (auth.isReseller(m.sender)) {
                    markup = pricing.reseller_markup;
                }
                
                const basePrice = product.pricing_status === 'custom' ? product.custom_price : product.vprice;
                const finalPrice = basePrice * (1 + markup / 100);
                
                productPriceInfo = `\n💰 *Price:* RM${finalPrice.toFixed(2)}`;
            }
        }
    } catch (e) {
        console.log('Failed to get product price for order message:', e);
    }
        
    rikz.sendMessage(m.chat, { 
        text: `📝 *Order Setup for ${orderGameName}*${productPriceInfo}\n\nPlease provide your:\n*USER_ID* and *ZONE_ID*\n\nFormat: user_id zone_id\nExample: 12345 1${extraInfo}` 
    }, { quoted: m });
}


        else if (command === 'cancel') {
    const session = sessionManager.getSession(m.sender);
    
    if (!session) {
        return rikz.sendMessage(m.chat, { 
            text: "❌ *No Active Order*\n\nThere's no order in progress to cancel.\n\nUse *.price* to start a new order." 
        }, { quoted: m });
    }

    // Get session details for better feedback
    const gameSlug = session.gameSlug || 'Unknown Game';
    const productCode = session.productCode || 'Unknown Product';
    const step = session.step || 'unknown';
    
    // Clear the session
    sessionManager.clearSession(m.sender);
    
    let cancelMessage = `❌ *Order Cancelled*\n\n`;
    
    // Add specific details based on what step was cancelled
    switch(step) {
        case 'awaiting_ids':
            cancelMessage += `*Order Setup Cancelled*\n`;
            cancelMessage += `🎮 Game: ${gameSlug}\n`;
            cancelMessage += `📦 Product: ${productCode}\n\n`;
            cancelMessage += `You were about to provide your USER_ID and ZONE_ID.\n`;
            break;
            
        case 'awaiting_confirmation':
            cancelMessage += `*Order Confirmation Cancelled*\n`;
            cancelMessage += `🎮 Game: ${gameSlug}\n`;
            cancelMessage += `📦 Product: ${productCode}\n`;
            if (session.orderData) {
                cancelMessage += `👤 USER_ID: ${session.orderData.user_id}\n`;
                cancelMessage += `📍 ZONE_ID: ${session.orderData.zone_id}\n`;
                cancelMessage += `💰 Amount: RM${session.orderData.price?.toFixed(2) || '0.00'}\n`;
            }
            cancelMessage += `\nThe order was ready for confirmation.\n`;
            break;
            
        default:
            cancelMessage += `*Active Session Cancelled*\n`;
            cancelMessage += `🎮 Game: ${gameSlug}\n`;
            cancelMessage += `📦 Product: ${productCode}\n\n`;
    }
    
    cancelMessage += `\n💡 *What to do next?*\n`;
    cancelMessage += `• Use *.price* to browse games again\n`;
    cancelMessage += `• Use *.balance* to check your balance\n`;
    cancelMessage += `• Use *.help* for more commands\n\n`;
    cancelMessage += `*Your balance was NOT charged.* ✅`;

    // Send cancellation message with quick action buttons
    await rikz.sendMessage(m.chat, {
        text: cancelMessage,
        footer: "Order cancelled successfully • Start fresh anytime",
        buttons: [
            { buttonId: '.price', buttonText: { displayText: '🎮 Browse Games' }, type: 1 },
            { buttonId: '.balance', buttonText: { displayText: '💰 Check Balance' }, type: 1 },
            { buttonId: '.menu', buttonText: { displayText: '🏠 Main Menu' }, type: 1 }
        ],
        headerType: 1
    }, { quoted: m });
    
    console.log(`❌ Order cancelled for ${m.sender} - Game: ${gameSlug}, Step: ${step}`);
}

// ==================== FIXED SESSION HANDLING ====================
else if (sessionManager.getSession(m.sender)?.step === 'awaiting_ids') {
    const session = sessionManager.getSession(m.sender);
    
    const inputParts = body.trim().split(/ +/);
    
    if(inputParts.length < 2) {
        return rikz.sendMessage(m.chat, { 
            text: "❌ *Incomplete Information*\n\nPlease provide both USER_ID and ZONE_ID\nFormat: user_id zone_id\n\nExample: 1579831626 16637" 
        }, { quoted: m });
    }

    const inputUserId = inputParts[0];
    const inputZoneId = inputParts[1];
    
    if (!inputUserId || !inputZoneId || isNaN(inputUserId) || isNaN(inputZoneId)) {
        return rikz.sendMessage(m.chat, { 
            text: "❌ *Invalid Format*\n\nUSER_ID and ZONE_ID must be numbers\n\nExample: 1579831626 16637" 
        }, { quoted: m });
    }

    // Auto-verify MLBB account if it's an MLBB order
    let verificationResult = null;
    const isMLBB = session.gameSlug.includes('mobile_legends') || session.gameSlug.includes('mlbb');
    
    if (isMLBB) {
        try {
            rikz.sendMessage(m.chat, { text: "🔍 Verifying MLBB account..." }, { quoted: m });
            
            const response = await apiCall('ml-check.php', {
                user_id: inputUserId,
                zone_id: inputZoneId
            });
            
            verificationResult = response;
            
            if (!verificationResult.success) {
                return rikz.sendMessage(m.chat, { 
                    text: `❌ *MLBB Account Not Found*\n\nUser ID: ${inputUserId}\nZone ID: ${inputZoneId}\n\nError: ${verificationResult.data?.message || 'Account not found'}\n\nPlease check your User ID and Zone ID and try again.\n\nUse .mlinfo ${inputUserId} ${inputZoneId} to verify manually.` 
                }, { quoted: m });
            }
        } catch (error) {
            console.log('MLBB verification failed, continuing without verification:', error);
        }
    }

    // FIXED: Get product price WITH PROPER MARKUP
    let sessionProductName = session.productCode;
    let sessionPrice = 0;
    try {
        const sessionProductData = await apiCall('get_products.php', { slug: session.gameSlug });
        
        // FIXED: Better product matching
        const sessionProduct = sessionProductData.products?.find(p => {
            // Exact match first
            if (p.srv_code === session.productCode) return true;
            
            // Case-insensitive match
            if (p.srv_code.toLowerCase() === session.productCode.toLowerCase()) return true;
            
            // Handle MLMYX vs MLMY_ format differences
            const normalizedProductCode = session.productCode.replace(/[_-]/g, '').toLowerCase();
            const normalizedSrvCode = p.srv_code.replace(/[_-]/g, '').toLowerCase();
            if (normalizedProductCode === normalizedSrvCode) return true;
            
            return false;
        });
        
        if (sessionProduct) {
            sessionProductName = sessionProduct.name;
            
            // FIXED: Get pricing with proper await
            const pricing = await localDB.getPricing();
            let markup = pricing.regular_markup;
            if (auth.isReseller(m.sender)) {
                markup = pricing.reseller_markup;
            }
            
            // FIXED: Use base price with markup (same logic as select- section)
            const basePrice = sessionProduct.pricing_status === 'custom' ? sessionProduct.custom_price : sessionProduct.vprice;
            sessionPrice = basePrice * (1 + markup / 100);
            
            console.log(`💰 Session Debug: ${sessionProduct.name} - base: RM${basePrice}, markup: ${markup}%, final: RM${sessionPrice.toFixed(2)}`);
        } else {
            console.log('❌ Product not found:', session.productCode, 'Available:', sessionProductData.products?.map(p => p.srv_code));
            return rikz.sendMessage(m.chat, { 
                text: "❌ Product not available. Please select a different product." 
            }, { quoted: m });
        }
    } catch (e) {
        console.log('Failed to get product price:', e);
        return rikz.sendMessage(m.chat, { 
            text: "❌ Failed to get product information. Please try again." 
        }, { quoted: m });
    }

    // Balance check
    const sessionUser = auth.getUser(m.sender);
    const userBalanceCents = Math.round((sessionUser.balance || 0) * 100);
    const sessionPriceCents = Math.round(sessionPrice * 100);

    if (userBalanceCents < sessionPriceCents) {
        sessionManager.clearSession(m.sender);
        return rikz.sendMessage(m.chat, { 
            text: `❌ *Insufficient Balance*\n\nOrder Amount: RM${sessionPrice.toFixed(2)}\nYour Balance: RM${sessionUser.balance.toFixed(2)}\n\nYou need RM${(sessionPrice - sessionUser.balance).toFixed(2)} more.\n\nUse .topup to add funds.` 
        }, { quoted: m });
    }

    // Only proceed if balance is sufficient
    sessionManager.updateSession(m.sender, {
        step: "awaiting_confirmation",
        orderData: { 
            user_id: inputUserId,
            zone_id: inputZoneId,
            price: sessionPrice,
            verifiedName: verificationResult?.data?.data?.nickname || null,
            verifiedRegion: verificationResult?.data?.data?.account_created_from || null
        }
    });

    const category = gameCategories.getGameCategory(session.gameSlug);
    const regionFlag = category === 'malaysia' ? '🇲🇾' : category === 'indonesia' ? '🇮🇩' : '🌍';

    let confirmationText = `✅ *Order Information Received* ${regionFlag}\n\n` +
        `🎮 *Game:* ${session.gameSlug}\n` +
        `📦 *Product:* ${sessionProductName}\n` +
        `👤 *USER_ID:* ${inputUserId}\n` +
        `📍 *ZONE_ID:* ${inputZoneId}\n`;
    
    // Add verified username and region if available
    if (verificationResult?.data?.data?.nickname) {
        confirmationText += `🔹 *Verified Nickname:* ${verificationResult.data.data.nickname}\n`;
    }
    if (verificationResult?.data?.data?.account_created_from) {
        confirmationText += `🌍 *Region:* ${verificationResult.data.data.account_created_from}\n`;
    }
    
    confirmationText += `💰 *Amount:* RM${sessionPrice.toFixed(2)}\n` +
        `💳 *Your Balance:* RM${sessionUser.balance.toFixed(2)}\n\n` +
        `Please confirm your order:`;

    const footerText = verificationResult?.data?.data?.nickname ? 
        `✅ Account Verified • ${verificationResult.data.data.account_created_from || ''} • Secure & Fast` : 
        "Best regional rates • Secure & Fast";

    await rikz.sendMessage(m.chat, {
        text: confirmationText,
        footer: footerText,
        buttons: [
            { buttonId: '.confirm', buttonText: { displayText: '✅ Confirm Order' }, type: 1 },
            { buttonId: '.change', buttonText: { displayText: '✏️ Change Info' }, type: 1 },
            { buttonId: '.cancel', buttonText: { displayText: '❌ Cancel Order' }, type: 1 }
        ],
        headerType: 1
    }, { quoted: m });
}

    } // End of switch statement
        
        if (isCmd) {
            analytics.trackCommand(command, m.sender);
        }



    } catch(err) {
        console.log('\x1b[1;31m' + err + '\x1b[0m');
        
        // Send user-friendly error message
        try {
            await rikz.sendMessage(m.chat, { 
                text: "âŒ An unexpected error occurred. Please try again later." 
            }, { quoted: m });
        } catch (sendError) {
            console.log('Failed to send error message:', sendError);
        }
    }
}

console.log(chalk.green('🎮 GameVia Bot fully loaded with Local Database & Reseller System!')); 
