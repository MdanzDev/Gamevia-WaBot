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

// ==================== UTILITY FUNCTIONS - MOVE THESE TO TOP ====================
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
// ==================== END UTILITY FUNCTIONS ====================


const API_KEY = "API-GVCDEAD0E38EA13632";
const API_BASE_URL = "https://api.gamevia.shop/v1";

const db = require('./database');




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

    setupCleanupInterval() {
        setInterval(() => {
            const now = Date.now();
            let cleanedCount = 0;
            
            for (const [userId, session] of this.sessions) {
                if (now - session.lastActivity > CONFIG.SESSION_TIMEOUT) {
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

// ==================== SMART CACHE SYSTEM ====================
class SmartCache {
    constructor() {
        this.cache = new Map();
        this.setupCleanup();
    }

    set(key, value, ttl = CONFIG.CACHE_TTL) {
        this.cache.set(key, {
            value,
            expiry: Date.now() + ttl,
            accessCount: 0
        });
    }

    get(key) {
        const item = this.cache.get(key);
        if (!item) return null;
        
        if (Date.now() > item.expiry) {
            this.cache.delete(key);
            return null;
        }
        
        item.accessCount++;
        return item.value;
    }

    async getOrSet(key, fetchFunction, ttl = CONFIG.CACHE_TTL) {
        const cached = this.get(key);
        if (cached) return cached;
        
        const freshData = await fetchFunction();
        this.set(key, freshData, ttl);
        return freshData;
    }

    getStats() {
        const now = Date.now();
        let active = 0, expired = 0, totalAccess = 0;
        
        for (const [key, item] of this.cache) {
            if (now > item.expiry) {
                expired++;
            } else {
                active++;
                totalAccess += item.accessCount;
            }
        }
        
        return {
            total: this.cache.size,
            active,
            expired,
            hitRate: totalAccess > 0 ? (totalAccess / (totalAccess + this.cache.size)) : 0
        };
    }

    setupCleanup() {
        setInterval(() => {
            const now = Date.now();
            let cleaned = 0;
            
            for (const [key, item] of this.cache) {
                if (now > item.expiry) {
                    this.cache.delete(key);
                    cleaned++;
                }
            }
            
            if (cleaned > 0) {
                console.log(chalk.yellow(`🧹 Cleaned ${cleaned} expired cache entries`));
            }
        }, 60000);
    }
}

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

// ==================== AUTOMATED MARKETING SYSTEM ====================
class MarketingAutomation {
    constructor() {
        this.campaigns = new Map();
        this.userSegments = new Map();
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

        this.campaigns.set('re_engagement', {
            trigger: 'user_inactive_7d',
            delay: 0,
            message: `🎮 *We Miss You!* 🎮

Ready for more gaming? Check out our latest products with *.price*

Special treat: Fast processing & best rates! ⚡`,
            enabled: true
        });
    }

    triggerCampaign(userId, campaignKey) {
        const campaign = this.campaigns.get(campaignKey);
        if (!campaign || !campaign.enabled) return;

        console.log(chalk.blue(`📧 Triggering campaign ${campaignKey} for ${userId}`));

        setTimeout(async () => {
            try {
                await rikz.sendMessage(userId, { text: campaign.message });
                console.log(chalk.green(`✅ Campaign ${campaignKey} sent to ${userId}`));
                this.trackCampaignDelivery(campaignKey, userId, true);
            } catch (error) {
                console.log(chalk.red(`❌ Failed to send campaign ${campaignKey} to ${userId}`));
                this.trackCampaignDelivery(campaignKey, userId, false);
            }
        }, campaign.delay);
    }

    trackCampaignDelivery(campaignKey, userId, success) {
        const campaignFile = './system/database/campaign_stats.json';
        const stats = this.loadJSON(campaignFile);
        
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
        this.saveJSON(campaignFile, stats);
    }

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

    scheduleSegmentBroadcast(message, segments = ['all']) {
        let targetUsers = new Set();

        if (segments.includes('all')) {
            targetUsers = new Set(Object.keys(this.loadJSON('./system/database/users.json')));
        } else {
            segments.forEach(segment => {
                if (this.userSegments[segment]) {
                    this.userSegments[segment].forEach(user => targetUsers.add(user));
                }
            });
        }

        return this.scheduleBroadcast(message, Array.from(targetUsers));
    }

    scheduleBroadcast(message, targetUsers = null) {
        const users = targetUsers || Object.keys(this.loadJSON('./system/database/users.json'));
        let successCount = 0;
        let failCount = 0;

        console.log(chalk.blue(`📢 Starting broadcast to ${users.length} users`));

        users.forEach(async (userId, index) => {
            setTimeout(async () => {
                try {
                    await rikz.sendMessage(userId, { text: message });
                    successCount++;
                    
                    if ((successCount + failCount) % 20 === 0) {
                        console.log(chalk.blue(`📊 Broadcast progress: ${successCount + failCount}/${users.length}`));
                    }
                } catch (error) {
                    failCount++;
                }
            }, index * CONFIG.BROADCAST_DELAY);
        });

        setTimeout(() => {
            console.log(chalk.green(`📊 Broadcast completed: ${successCount} sent, ${failCount} failed`));
        }, users.length * CONFIG.BROADCAST_DELAY + 5000);

        return { total: users.length, success: successCount, failed: failCount };
    }

    getCampaignStats() {
        const campaignFile = './system/database/campaign_stats.json';
        return this.loadJSON(campaignFile);
    }

    loadJSON(path) {
        try {
            return fs.existsSync(path) ? JSON.parse(fs.readFileSync(path)) : {};
        } catch (error) {
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
}

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
        const userRegistry = this.loadJSON('./system/database/users.json');
        const orders = this.loadJSON('./system/database/orders.json');
        const resellers = this.loadJSON('./system/database/resellers.json');
        
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
            totalUsers: Object.keys(userRegistry).length,
            totalOrders: allOrders.length,
            successfulOrders: successfulOrders.length,
            successRate: allOrders.length > 0 ? (successfulOrders.length / allOrders.length * 100).toFixed(1) : 0,
            totalRevenue: totalRevenue,
            averageOrderValue: successfulOrders.length > 0 ? totalRevenue / successfulOrders.length : 0,
            popularGames: popularGames,
            resellerCount: Object.keys(resellers).length
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

    loadJSON(path) {
        try {
            return fs.existsSync(path) ? JSON.parse(fs.readFileSync(path)) : {};
        } catch (error) {
            return {};
        }
    }
}

// ==================== INVENTORY MANAGEMENT ====================
class InventoryManager {
    constructor() {
        this.lowStockAlerts = new Set();
        this.setupStockMonitoring();
    }

    async checkProductStock(gameSlug, productCode) {
        try {
            const data = await apiCall('get_products.php', { slug: gameSlug });
            if (data.success && data.products) {
                const product = data.products.find(p => p.srv_code === productCode);
                return {
                    available: product && product.stock !== 'empty',
                    stock: product?.stock || 'unknown',
                    name: product?.name,
                    price: product?.vprice
                };
            }
        } catch (error) {
            console.error('Stock check failed:', error);
        }
        return { available: true, stock: 'unknown' };
    }

    async checkGameStock(gameSlug) {
        try {
            const data = await apiCall('get_products.php', { slug: gameSlug });
            if (data.success && data.products) {
                return data.products.map(product => ({
                    code: product.srv_code,
                    name: product.name,
                    stock: product.stock,
                    price: product.vprice
                }));
            }
        } catch (error) {
            console.error('Game stock check failed:', error);
        }
        return [];
    }

    setupStockMonitoring() {
        setInterval(async () => {
            console.log(chalk.blue('📦 Checking stock levels...'));
            
            const gamesData = await apiCall('check_games.php');
            if (!gamesData.success) return;

            for (const game of gamesData.games.slice(0, 10)) {
                const products = await this.checkGameStock(game.slug);
                const lowStockProducts = products.filter(p => p.stock === 'low' || p.stock === 'empty');
                
                if (lowStockProducts.length > 0 && global.adminChat) {
                    const alertKey = `${game.slug}-${lowStockProducts.length}`;
                    if (!this.lowStockAlerts.has(alertKey)) {
                        this.lowStockAlerts.add(alertKey);
                        
                        const alertMessage = `⚠️ *Low Stock Alert*\n\nGame: ${game.name}\n\n${lowStockProducts.map(p => 
                            `• ${p.name} (${p.code}): ${p.stock === 'empty' ? 'OUT OF STOCK' : 'LOW STOCK'}`
                        ).join('\n')}`;
                        
                        await rikz.sendMessage(global.adminChat, { text: alertMessage });
                    }
                }
            }
        }, CONFIG.STOCK_CHECK_INTERVAL);
    }
}

// ==================== ORDER TRACKING SYSTEM ====================
class OrderTracker {
    constructor() {
        this.pendingOrders = new Map();
        this.setupOrderChecking();
    }

    async checkOrderStatus(orderId) {
        try {
            const result = await apiCall('get_history.php', { custom_order_id: orderId });
            if (result.success && result.history && result.history.length > 0) {
                return {
                    status: result.history[0].status_order,
                    description: result.history[0].description,
                    createdAt: result.history[0].created_at
                };
            }
        } catch (error) {
            console.error('Order status check failed:', error);
        }
        return null;
    }

    async trackOrder(orderId, userId, gameSlug, productCode) {
        this.pendingOrders.set(orderId, { userId, gameSlug, productCode, checked: 0 });
        
        const checkInterval = setInterval(async () => {
            const orderInfo = this.pendingOrders.get(orderId);
            if (!orderInfo || orderInfo.checked >= 10) {
                clearInterval(checkInterval);
                this.pendingOrders.delete(orderId);
                return;
            }
            
            const status = await this.checkOrderStatus(orderId);
            if (status && status.status !== 'Pending') {
                clearInterval(checkInterval);
                this.pendingOrders.delete(orderId);
                
                try {
                    await rikz.sendMessage(userId, {
                        text: `🔄 *Order Status Update*\n\nOrder ID: ${orderId}\nGame: ${gameSlug}\nProduct: ${productCode}\nStatus: ${status.status}\nDescription: ${status.description}\n\nThank you for using GameVia!`
                    });
                } catch (error) {
                    console.error('Failed to notify user:', error);
                }
            } else {
                orderInfo.checked++;
            }
        }, 30000);
    }

    setupOrderChecking() {
        const allOrders = Object.values(loadJSON('./system/database/orders.json')).flat();
        const pending = allOrders.filter(o => o.status === 'Pending' || o.status === 'Processing');
        
        pending.forEach(order => {
            this.trackOrder(order.id, order.userId, order.gameSlug, order.product);
        });
    }
}

// ==================== FRAUD PREVENTION SYSTEM ====================
class FraudPrevention {
    constructor() {
        this.suspiciousPatterns = [
            /(card|credit|debit)\s*[0-9]{13,16}/i,
            /[0-9]{3,4}\s*(cvv|cvc)/i,
            /expiry?\s*[0-9]{2}\/?[0-9]{2,4}/i,
            /(login|sign in|password|verify)\s*(here|now|click)/i,
            /(http|https|www\.|t\.me|bit\.ly)/i,
            /([A-Z0-9]{10,})/g,
            /(winner|won|prize|reward).*(claim|collect)/i,
            /([0-9]{5,}\s+[0-9]{2,}){3,}/g
        ];
        
        this.userBehavior = new Map();
        this.blockedUsers = new Set();
    }

    analyzeMessage(message, userData, context) {
        const analysis = {
            riskScore: 0,
            flags: [],
            isSuspicious: false,
            action: 'allow'
        };

        this.suspiciousPatterns.forEach(pattern => {
            if (pattern.test(message)) {
                analysis.riskScore += 10;
                analysis.flags.push(`Suspicious pattern: ${pattern}`);
            }
        });

        const userBehavior = this.getUserBehavior(userData.userId);
        if (userBehavior.messagesLastMinute > 15) {
            analysis.riskScore += 15;
            analysis.flags.push('High message frequency');
        }

        if (userBehavior.orderAttempts > 5 && context.isOrderAttempt) {
            analysis.riskScore += 20;
            analysis.flags.push('Multiple order attempts');
        }

        if (userData.orders && userData.orders.length === 0 && analysis.riskScore > 0) {
            analysis.riskScore += 10;
        }

        if (analysis.riskScore >= 40) {
            analysis.action = 'block';
            analysis.isSuspicious = true;
            this.blockedUsers.add(userData.userId);
        } else if (analysis.riskScore >= 20) {
            analysis.action = 'slow';
            analysis.isSuspicious = true;
        }

        this.updateUserBehavior(userData.userId, context);

        return analysis;
    }

    getUserBehavior(userId) {
        if (!this.userBehavior.has(userId)) {
            this.userBehavior.set(userId, {
                messagesLastMinute: 0,
                orderAttempts: 0,
                lastMessageTime: Date.now(),
                warningCount: 0
            });
        }
        return this.userBehavior.get(userId);
    }

    updateUserBehavior(userId, context) {
        const behavior = this.getUserBehavior(userId);
        const now = Date.now();
        
        if (now - behavior.lastMessageTime > 60000) {
            behavior.messagesLastMinute = 0;
        }
        
        behavior.messagesLastMinute++;
        behavior.lastMessageTime = now;
        
        if (context.isOrderAttempt) {
            behavior.orderAttempts++;
        }
    }

    isUserBlocked(userId) {
        return this.blockedUsers.has(userId);
    }

    getFraudStats() {
        return {
            totalBlocked: this.blockedUsers.size,
            totalMonitored: this.userBehavior.size,
            highRiskUsers: Array.from(this.userBehavior.entries())
                .filter(([_, behavior]) => behavior.warningCount > 2).length
        };
    }
}

// ==================== PERFORMANCE MONITORING ====================
class PerformanceMonitor {
    constructor() {
        this.metrics = {
            responseTimes: [],
            apiCalls: { total: 0, failed: 0 },
            commands: {},
            errors: [],
            startTime: Date.now()
        };
        this.setupMonitoring();
    }

    trackCommand(command, duration) {
        if (!this.metrics.commands[command]) {
            this.metrics.commands[command] = { count: 0, totalTime: 0 };
        }
        this.metrics.commands[command].count++;
        this.metrics.commands[command].totalTime += duration;
        
        this.metrics.responseTimes.push(duration);
        if (this.metrics.responseTimes.length > 1000) {
            this.metrics.responseTimes.shift();
        }
    }

    trackApiCall(endpoint, success, duration) {
        this.metrics.apiCalls.total++;
        if (!success) this.metrics.apiCalls.failed++;
    }

    trackError(error, context) {
        this.metrics.errors.push({
            error: error.message,
            context,
            timestamp: new Date().toISOString(),
            stack: error.stack
        });
        
        if (this.metrics.errors.length > 100) {
            this.metrics.errors.shift();
        }
    }

    getPerformanceMetrics() {
        const uptime = Date.now() - this.metrics.startTime;
        const avgResponseTime = this.metrics.responseTimes.length > 0 ?
            this.metrics.responseTimes.reduce((a, b) => a + b) / this.metrics.responseTimes.length : 0;
        
        const commandStats = Object.entries(this.metrics.commands).map(([cmd, data]) => ({
            command: cmd,
            count: data.count,
            avgTime: data.totalTime / data.count,
            frequency: data.count / (uptime / 1000 / 60 / 60) // per hour
        })).sort((a, b) => b.count - a.count);

        const errorRate = this.metrics.errors.length / (uptime / 1000 / 60 / 60); // errors per hour
        const apiSuccessRate = this.metrics.apiCalls.total > 0 ?
            ((this.metrics.apiCalls.total - this.metrics.apiCalls.failed) / this.metrics.apiCalls.total) * 100 : 100;

        return {
            uptime: this.formatUptime(uptime),
            averageResponseTime: avgResponseTime.toFixed(2),
            totalCommands: Object.values(this.metrics.commands).reduce((sum, cmd) => sum + cmd.count, 0),
            apiSuccessRate: apiSuccessRate.toFixed(1),
            errorRate: errorRate.toFixed(2),
            popularCommands: commandStats.slice(0, 5),
            recentErrors: this.metrics.errors.slice(-5),
            memoryUsage: process.memoryUsage()
        };
    }

    formatUptime(ms) {
        const days = Math.floor(ms / (24 * 60 * 60 * 1000));
        const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
        const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
        return `${days}d ${hours}h ${minutes}m`;
    }

    setupMonitoring() {
        setInterval(() => {
            const metrics = this.getPerformanceMetrics();
            if (metrics.averageResponseTime > 1000) {
                console.log(chalk.yellow('⚠️  Performance warning: High response times'));
            }
            
            if (metrics.apiSuccessRate < 95) {
                console.log(chalk.red('⚠️  API warning: Low success rate'));
            }
        }, 5 * 60 * 1000);
    }
}
// ==================== DATABASE MAINTENANCE ====================
class DatabaseMaintenance {
    constructor() {
        this.setupMaintenanceTasks();
    }

    async cleanupOldSessions() {
        const sessions = sessionManager.sessions;
        let cleaned = 0;
        const now = Date.now();
        
        for (const [userId, session] of sessions) {
            if (now - session.lastActivity > 24 * 60 * 60 * 1000) {
                sessionManager.clearSession(userId);
                cleaned++;
            }
        }
        
        if (cleaned > 0) {
            console.log(chalk.green(`🧹 Cleaned ${cleaned} old sessions`));
        }
    }

    async optimizeOrdersDatabase() {
        const orders = loadJSON('./system/database/orders.json');
        let optimized = 0;
        
        for (const userId in orders) {
            const userOrders = orders[userId];
            if (userOrders.length > 100) {
                orders[userId] = userOrders.slice(-100);
                optimized += userOrders.length - 100;
            }
        }
        
        if (optimized > 0) {
            saveJSON('./system/database/orders.json', orders);
            console.log(chalk.green(`🗃️  Optimized orders database, removed ${optimized} old records`));
        }
    }

    async backupDatabases() {
        const timestamp = new Date().toISOString().split('T')[0];
        const backupDir = `./system/backups/${timestamp}/`;
        
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }
        
        const files = [
            './system/database/users.json',
            './system/database/orders.json',
            './system/database/resellers.json',
            './system/database/daily_stats.json'
        ];
        
        let backedUp = 0;
        files.forEach(file => {
            if (fs.existsSync(file)) {
                const backupFile = `${backupDir}${path.basename(file)}`;
                fs.copySync(file, backupFile);
                backedUp++;
            }
        });
        
        console.log(chalk.green(`💾 Backed up ${backedUp} database files`));
        this.cleanOldBackups();
    }

    cleanOldBackups() {
        const backupBaseDir = './system/backups/';
        if (!fs.existsSync(backupBaseDir)) return;
        
        const backups = fs.readdirSync(backupBaseDir);
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        
        backups.forEach(backup => {
            const backupPath = path.join(backupBaseDir, backup);
            const stat = fs.statSync(backupPath);
            if (stat.mtime < weekAgo) {
                fs.removeSync(backupPath);
                console.log(chalk.yellow(`🧹 Removed old backup: ${backup}`));
            }
        });
    }

    setupMaintenanceTasks() {
        setInterval(() => this.cleanupOldSessions(), 60 * 60 * 1000);
        setInterval(() => this.optimizeOrdersDatabase(), 6 * 60 * 60 * 1000);
        setInterval(() => this.backupDatabases(), CONFIG.BACKUP_INTERVAL);
        
        setTimeout(() => {
            this.cleanupOldSessions();
            this.optimizeOrdersDatabase();
            this.backupDatabases();
        }, 10000);
    }
}

// ==================== SMART RETRY SYSTEM ====================
class SmartRetrySystem {
    constructor() {
        this.failedOrders = new Map();
        this.setupRetryMonitoring();
    }

    async retryFailedOrder(orderId, userId, orderData) {
        if (this.failedOrders.has(orderId)) {
            const attempts = this.failedOrders.get(orderId);
            if (attempts >= CONFIG.RETRY_ATTEMPTS) {
                console.log(chalk.red(`Max retries reached for order ${orderId}`));
                return false;
            }
        }

        console.log(chalk.yellow(`🔄 Retrying order ${orderId} (attempt ${(this.failedOrders.get(orderId) || 0) + 1})`));
        
        try {
            const result = await apiCall('order.php', orderData);
            
            if (result.success) {
                console.log(chalk.green(`✅ Order ${orderId} succeeded on retry`));
                this.failedOrders.delete(orderId);
                
                const orders = loadJSON('./system/database/orders.json');
                const userOrders = orders[userId] || [];
                const orderIndex = userOrders.findIndex(o => o.id === orderId);
                if (orderIndex !== -1) {
                    userOrders[orderIndex].status = 'success';
                    userOrders[orderIndex].id = result.custom_order_id;
                    userOrders[orderIndex].retried = true;
                    saveJSON('./system/database/orders.json', orders);
                    
                    await rikz.sendMessage(userId, {
                        text: `🔄 *Order Auto-Retry Success!*\n\nYour previous failed order has been processed successfully!\nNew Order ID: ${result.custom_order_id}\n\nThank you for your patience! 🎮`
                    });
                }
                
                return true;
            } else {
                this.failedOrders.set(orderId, (this.failedOrders.get(orderId) || 0) + 1);
                return false;
            }
        } catch (error) {
            this.failedOrders.set(orderId, (this.failedOrders.get(orderId) || 0) + 1);
            return false;
        }
    }

    setupRetryMonitoring() {
        setInterval(async () => {
            const orders = loadJSON('./system/database/orders.json');
            const now = Date.now();
            
            for (const userId in orders) {
                const userOrders = orders[userId];
                const failedOrders = userOrders.filter(o => 
                    o.status === 'failed' && 
                    !o.retried &&
                    (now - new Date(o.timestamp).getTime()) < 30 * 60 * 1000
                );
                
                for (const order of failedOrders) {
                    await this.retryFailedOrder(order.id, userId, {
                        srv_code: order.product,
                        user_id: order.user_id,
                        zone_id: order.zone_id
                    });
                    
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
        }, 5 * 60 * 1000);
    }
}

        // ==================== INITIALIZE ALL SYSTEMS ====================
const sessionManager = new SessionManager();
const cache = new SmartCache();
const gameCategories = new GameCategoryManager();
const marketing = new MarketingAutomation();
const analytics = new AnalyticsSystem();
const inventory = new InventoryManager();
const orderTracker = new OrderTracker();
const fraudPrevention = new FraudPrevention();
const performanceMonitor = new PerformanceMonitor();
const databaseMaintenance = new DatabaseMaintenance();
const retrySystem = new SmartRetrySystem();


// ==================== MAIN BOT HANDLER ====================
module.exports = rikz = async (rikz, m, chatUpdate, store) => {
    const startTime = Date.now();
    
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
        const premuser = loadJSON("./system/database/premium.json");
        const isCreator = [botNumber, ...global.owner].map(v => v.replace(/[^0-9]/g, "") + "@s.whatsapp.net").includes(m.sender);

        let userRegistry = loadJSON('./system/database/users.json');
        let resellers = loadJSON('./system/database/resellers.json');
        let orders = loadJSON('./system/database/orders.json');

        // Fraud detection
        const fraudAnalysis = fraudPrevention.analyzeMessage(body, {
            userId: m.sender,
            orders: orders[m.sender] || [],
            isRegistered: !!userRegistry[m.sender]
        }, {
            isOrderAttempt: command.startsWith('order-') || command === 'confirm',
            isAdmin: isCreator
        });

        if (fraudAnalysis.action === 'block') {
            console.log(chalk.red(`🚨 BLOCKED user ${m.sender} for suspicious activity: ${fraudAnalysis.flags.join(', ')}`));
            return rikz.sendMessage(m.chat, { 
                text: "❌ Your message was flagged for suspicious activity. Please contact support if this is an error." 
            }, { quoted: m });
        } else if (fraudAnalysis.action === 'slow') {
            await new Promise(resolve => setTimeout(resolve, 5000));
        }

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
                        { buttonId: '.promo', buttonText: { displayText: '🎉 Promo' }, type: 1 },
                        { buttonId: '.stats', buttonText: { displayText: '📊 My Stats' }, type: 1 }
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
            case 'promotions':
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

            case 'help':
                const helpText = `🎮 *GameVia Bot Commands* 🌍

*Basic Commands:*
• .menu - Main menu
• .help - Show help  
• .register - Register account
• .price - Browse all games by region
• .promo - Current promotions
• .history - Order history
• .stats - Your statistics

*Order Commands:*
• Use .price to start ordering
• Provide USER_ID & ZONE_ID when asked
• Confirm your order

*Admin Commands:*
• .broadcast <message> - Send to all users
• .segmentbroadcast <segment> <message> - Targeted broadcast
• .analytics - Business analytics
• .performance - System performance
• .campaignstats - Marketing stats

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

            case 'broadcast':
                if (!isCreator) break;
                const broadcastMessage = text;
                if (!broadcastMessage) return rikz.sendMessage(m.chat, { text: "Usage: .broadcast <message>" }, { quoted: m });
                
                rikz.sendMessage(m.chat, { text: "📢 Starting broadcast to all users..." }, { quoted: m });
                const result = marketing.scheduleBroadcast(`📢 *Announcement*\n\n${broadcastMessage}`);
                setTimeout(() => {
                    rikz.sendMessage(m.chat, { 
                        text: `📊 Broadcast Completed:\nTotal: ${result.total}\nSuccessful: ${result.success}\nFailed: ${result.failed}` 
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
📍 Region: Multi-Region 🌍`;

                rikz.sendMessage(m.chat, { text: statsTextUser }, { quoted: m });
                break;

case 'testfirebase':
    try {
        console.log('🧪 Starting comprehensive Firebase test...');
        
        // Test 1: Connection status
        const connectionInfo = db.getConnectionInfo();
        console.log('Connection Info:', connectionInfo);

        // Test 2: Detailed connection test
        const connectionTest = await firebaseManager.testConnection(true);
        console.log('Connection Test:', connectionTest);

        if (!connectionTest.success) {
            return rikz.sendMessage(m.chat, { 
                text: `❌ *Firebase Connection Failed* 🔴\n\n*Error:* ${connectionTest.error}\n*Code:* ${connectionTest.code || 'N/A'}\n\n💡 Try .fixfirebase to reconnect` 
            }, { quoted: m });
        }

        // Test 3: User operations
        const userExists = await db.userExists(m.sender);
        console.log(`User exists: ${userExists}`);

        let userResult = { success: false };
        if (!userExists) {
            userResult = await db.createUser(m.sender, {
                name: m.pushName,
                role: 'user',
                status: 'active',
                phone: m.sender,
                registeredVia: 'whatsapp_bot'
            });
        } else {
            const userData = await db.getUser(m.sender);
            userResult = { success: true, action: 'exists', data: userData };
        }

        // Test 4: Pricing operations
        const pricing = await db.getPricing();
        
        // Test 5: System stats
        const systemStats = await db.getSystemStats();

        const resultText = `🔥 *Firebase Comprehensive Test Results* 🔥

📡 *Connection Status:*
✅ Connected: ${connectionInfo.isConnected ? 'YES' : 'NO'}
🔄 Attempts: ${connectionInfo.connectionAttempts}
📁 Collections: ${connectionTest.collections?.join(', ') || 'None'}

👤 *User Operations:*
✅ User Check: ${userExists ? 'EXISTS' : 'NEW'}
✅ User Action: ${userResult.action || 'N/A'}
✅ User Name: ${userResult.data?.name || 'N/A'}
✅ User Role: ${userResult.data?.role || 'N/A'}

💰 *Pricing System:*
✅ Loaded: ${pricing ? 'YES' : 'NO'}
📊 Regular Markup: ${pricing?.regular_markup || 'N/A'}%
📊 Reseller Markup: ${pricing?.reseller_markup || 'N/A'}%
💵 Min Topup: RM${pricing?.min_topup || 'N/A'}

📈 *System Stats:*
👥 Total Users: ${systemStats?.totalUsers || 'N/A'}
🛒 Total Orders: ${systemStats?.totalOrders || 'N/A'}
✅ Success Rate: ${systemStats?.successRate || 'N/A'}%
💰 Total Revenue: RM${systemStats?.totalRevenue || '0'}

🎯 *Status:* Firebase is fully operational! 🚀`;

        rikz.sendMessage(m.chat, { text: resultText }, { quoted: m });
        
    } catch (error) {
        console.error('❌ Comprehensive test error:', error);
        rikz.sendMessage(m.chat, { 
            text: `❌ *Comprehensive Test Failed* 💥\n\n*Error:* ${error.message}\n\n*Stack:* ${error.stack}` 
        }, { quoted: m });
    }
    break;

case 'initfirebase':
    try {
        console.log('🚀 Initializing Firebase with full setup...');
        
        // Test connection first
        const connectionTest = await firebaseManager.testConnection(true);
        if (!connectionTest.success) {
            return rikz.sendMessage(m.chat, { 
                text: `❌ *Cannot Initialize* 🔴\n\nFirebase connection failed:\n${connectionTest.error}\n\nUse .fixfirebase first` 
            }, { quoted: m });
        }

        // Step 1: Ensure pricing settings
        console.log('⚙️ Step 1: Ensuring pricing settings...');
        const pricing = await db.ensureSettings();
        
        // Step 2: Create/update user
        console.log('👤 Step 2: Setting up user account...');
        const userResult = await db.createUser(m.sender, {
            name: m.pushName,
            role: 'user',
            status: 'active',
            phone: m.sender,
            registeredVia: 'whatsapp_bot',
            initialization: 'full_setup'
        });

        // Step 3: Create sample order to test order system
        console.log('🛒 Step 3: Testing order system...');
        const sampleOrder = {
            id: `test_${Date.now()}`,
            userId: m.sender,
            gameSlug: 'mlbb',
            product: 'diamond_5',
            user_id: '12345',
            zone_id: '1',
            price: 5.00,
            status: 'success',
            description: 'Initialization test order'
        };
        
        const orderResult = await db.createOrder(sampleOrder);

        // Step 4: Create backup
        console.log('💾 Step 4: Creating initial backup...');
        const backupResult = await db.backupData();

        const resultText = `✅ *Firebase Full Initialization Complete!* 🎉

📊 *Settings Configured:*
• Regular Markup: ${pricing.regular_markup}%
• Reseller Markup: ${pricing.reseller_markup}%
• Registration Fee: RM${pricing.registration_fee}
• Min Topup: RM${pricing.min_topup}
• Regional Adjustments: MY:${pricing.malaysia_adjustment}x, ID:${pricing.indonesia_adjustment}x

👤 *User Account:*
• Action: ${userResult.action}
• Name: ${userResult.data?.name}
• Role: ${userResult.data?.role}
• Status: ${userResult.data?.status}

🛒 *Order System:*
• Test Order: ${orderResult.success ? 'CREATED' : 'FAILED'}
• Order ID: ${orderResult.orderId}

💾 *Backup System:*
• Backup: ${backupResult.success ? 'CREATED' : 'FAILED'}
• Backup ID: ${backupResult.backupId}

🎯 *All Systems Ready for Production!* 🚀`;

        rikz.sendMessage(m.chat, { text: resultText }, { quoted: m });
        
    } catch (error) {
        console.error('❌ Full initialization error:', error);
        rikz.sendMessage(m.chat, { 
            text: `❌ *Initialization Failed* 💥\n\n*Error:* ${error.message}\n\n*Step:* Check Firebase configuration` 
        }, { quoted: m });
    }
    break;

case 'firebasestats':
    try {
        const connectionInfo = db.getConnectionInfo();
        const systemStats = await db.getSystemStats();
        const pricing = await db.getPricing();

        const statsText = `📊 *Firebase Live Statistics* 📊

🔗 *Connection:*
✅ Status: ${connectionInfo.isConnected ? 'CONNECTED' : 'DISCONNECTED'}
🔄 Attempts: ${connectionInfo.connectionAttempts}
⏰ Last Check: ${new Date(connectionInfo.timestamp).toLocaleTimeString()}

👥 *User Statistics:*
• Total Users: ${systemStats?.totalUsers || 0}
• Active Users: ${systemStats?.totalUsers || 0} (all)

🛒 *Order Statistics:*
• Total Orders: ${systemStats?.totalOrders || 0}
• Successful: ${systemStats?.successfulOrders || 0}
• Pending: ${systemStats?.pendingOrders || 0}
• Success Rate: ${systemStats?.successRate || 0}%

💰 *Financials:*
• Total Revenue: RM${systemStats?.totalRevenue?.toFixed(2) || '0.00'}
• Avg Order: RM${systemStats?.totalOrders > 0 ? (systemStats.totalRevenue / systemStats.totalOrders).toFixed(2) : '0.00'}

⚙️ *Pricing Settings:*
• Markup: ${pricing?.regular_markup || 0}% Regular, ${pricing?.reseller_markup || 0}% Reseller
• Min Topup: RM${pricing?.min_topup || 0}
• Fees: RM${pricing?.registration_fee || 0} Registration`;

        rikz.sendMessage(m.chat, { text: statsText }, { quoted: m });
        
    } catch (error) {
        rikz.sendMessage(m.chat, { 
            text: `❌ Stats failed: ${error.message}` 
        }, { quoted: m });
    }
    break;

case 'fixfirebase':
    try {
        console.log('🛠️ Starting comprehensive Firebase repair...');
        
        // Clear cache
        delete require.cache[require.resolve('./firebase')];
        delete require.cache[require.resolve('./database')];
        delete require.cache[require.resolve('./firebase-key.json')];
        
        // Reinitialize
        const FirebaseManager = require('./firebase');
        const FirebaseDB = require('./database');
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const reconnectResult = await FirebaseManager.reconnect();
        
        if (reconnectResult.success) {
            rikz.sendMessage(m.chat, { 
                text: `✅ *Firebase Repair Successful!* 🔧\n\nConnection reestablished with ${reconnectResult.collections?.length || 0} collections available.\n\nUse .testfirebase to verify full functionality.` 
            }, { quoted: m });
        } else {
            rikz.sendMessage(m.chat, { 
                text: `❌ *Repair Failed* 🔴\n\nFailed to reconnect: ${reconnectResult.error}\n\nPlease check your firebase-key.json configuration.` 
            }, { quoted: m });
        }
        
    } catch (error) {
        rikz.sendMessage(m.chat, { 
            text: `💥 *Repair Critical Error*\n\n${error.message}\n\nPlease restart the bot completely.` 
        }, { quoted: m });
    }
    break;

case 'backupdata':
    try {
        rikz.sendMessage(m.chat, { text: '💾 Starting data backup...' }, { quoted: m });
        
        const backupResult = await db.backupData();
        
        if (backupResult.success) {
            rikz.sendMessage(m.chat, { 
                text: `✅ *Backup Completed!* 📦\n\nBackup ID: ${backupResult.backupId}\n\nAll user data, orders, and settings have been securely backed up.` 
            }, { quoted: m });
        } else {
            rikz.sendMessage(m.chat, { 
                text: `❌ Backup failed. Please check Firebase connection.` 
            }, { quoted: m });
        }
    } catch (error) {
        rikz.sendMessage(m.chat, { 
            text: `❌ Backup error: ${error.message}` 
        }, { quoted: m });
    }
    break;

                
            case 'history':
                let historyText = "";
                if(resellers[m.sender]){
                    let hist = resellers[m.sender].history || [];
                    historyText = hist.length ? 
                        hist.map(o => `• ${o.id || o.type} | ${o.amount || ''} | ${o.status || 'Completed'}`).join("\n") 
                        : "No order history yet.";
                    historyText = `📜 *Reseller Order History*\n\n${historyText}`;
                } else {
                    let userHist = orders[m.sender] || [];
                    if(!userHist.length) return rikz.sendMessage(m.chat, { text: "No orders yet." }, { quoted: m });
                    historyText = userHist.map(o => 
                        `• ${o.id} | ${o.product} | RM${o.price || '0.00'} | ${o.status}`
                    ).join("\n");
                    historyText = `📜 *Your Order History*\n\n${historyText}`;
                }
                rikz.sendMessage(m.chat, { text: historyText }, { quoted: m });
                break;

            case 'analytics':
                if (!isCreator) break;
                const comprehensiveStats = analytics.getComprehensiveAnalytics();
                const dailyStats = analytics.getDailyAnalytics();
                const segments = marketing.segmentUsers(userRegistry, orders);
                const fraudStats = fraudPrevention.getFraudStats();
                
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
• Avg Order: RM${comprehensiveStats.averageOrderValue.toFixed(2)}

👥 *User Segments:*
• New Users: ${segments.new_users.length}
• Active Buyers: ${segments.active_buyers.length} 
• Power Users: ${segments.power_users.length}
• Inactive Users: ${segments.inactive_users.length}

🛡️ *Security Stats:*
• Blocked Users: ${fraudStats.totalBlocked}
• Monitored Users: ${fraudStats.totalMonitored}
• High Risk Users: ${fraudStats.highRiskUsers}

🎮 *Top Games:*
${comprehensiveStats.popularGames.map(([game, count]) => `• ${game}: ${count} orders`).join('\n')}`;

                rikz.sendMessage(m.chat, { text: analyticsText }, { quoted: m });
                break;

            case 'performance':
                if (!isCreator) break;
                const metrics = performanceMonitor.getPerformanceMetrics();
                const cacheStats = cache.getStats();
                const sessionStats = sessionManager.getStats();
                
                const performanceText = `🚀 *Performance Metrics*\n
⏰ *Uptime:* ${metrics.uptime}
⚡ *Avg Response:* ${metrics.averageResponseTime}ms
📊 *API Success:* ${metrics.apiSuccessRate}%
📝 *Total Commands:* ${metrics.totalCommands}
❌ *Error Rate:* ${metrics.errorRate}/hour

💾 *Memory Usage:*
• RSS: ${Math.round(metrics.memoryUsage.rss / 1024 / 1024)}MB
• Heap: ${Math.round(metrics.memoryUsage.heapUsed / 1024 / 1024)}MB

🗃️ *Cache Stats:*
• Total: ${cacheStats.total} | Active: ${cacheStats.active}
• Hit Rate: ${(cacheStats.hitRate * 100).toFixed(1)}%

🔄 *Session Stats:*
• Active: ${sessionStats.activeSessions}
• Total: ${sessionStats.totalSessions}

🎯 *Top Commands:*
${metrics.popularCommands.map(cmd => 
    `• ${cmd.command}: ${cmd.count} (${cmd.avgTime.toFixed(0)}ms avg)`
).join('\n')}`;

                rikz.sendMessage(m.chat, { text: performanceText }, { quoted: m });
                break;

            case 'status':
                const orderId = args[0];
                if (!orderId) return rikz.sendMessage(m.chat, { text: "Usage: .status <order_id>" }, { quoted: m });
                
                const status = await orderTracker.checkOrderStatus(orderId);
                if (status) {
                    rikz.sendMessage(m.chat, { 
                        text: `📦 *Order Status*\n\nOrder ID: ${orderId}\nStatus: ${status.status}\nDescription: ${status.description}\nCreated: ${status.createdAt}` 
                    }, { quoted: m });
                } else {
                    rikz.sendMessage(m.chat, { text: "Order not found or status unavailable." }, { quoted: m });
                }
                break;

            case 'addreseller':
                if(!isCreator) break;
                const resellerId = args[0];
                if(!resellerId) return rikz.sendMessage(m.chat, { text: "Usage: .addreseller <reseller_id>" }, { quoted: m });
                if(!resellers[resellerId]) {
                    resellers[resellerId] = { 
                        balance: 0, 
                        history: [],
                        addedAt: new Date().toISOString()
                    };
                    saveJSON('./system/database/resellers.json', resellers);
                    rikz.sendMessage(m.chat, { text: `✅ Reseller ${resellerId} added with RM0 balance` }, { quoted: m });
                } else {
                    rikz.sendMessage(m.chat, { text: "Reseller already exists." }, { quoted: m });
                }
                break;

            case 'addbalance':
                if(!isCreator) break;
                const [resellerId2, amount] = args;
                if(!resellerId2 || !amount || isNaN(amount)) return rikz.sendMessage(m.chat, { text: "Usage: .addbalance <reseller_id> <amount>" }, { quoted: m });
                if(!resellers[resellerId2]) resellers[resellerId2] = { balance: 0, history: [] };
                resellers[resellerId2].balance += parseFloat(amount);
                resellers[resellerId2].history.push({
                    type: 'balance_added',
                    amount: parseFloat(amount),
                    timestamp: new Date().toISOString(),
                    addedBy: m.sender
                });
                saveJSON('./system/database/resellers.json', resellers);
                rikz.sendMessage(m.chat, { text: `✅ Added RM${amount} to ${resellerId2}. Total: RM${resellers[resellerId2].balance}` }, { quoted: m });
                break;

            case 'sessioninfo':
                const session = sessionManager.getSession(m.sender);
                if (session) {
                    const sessionAge = Math.round((Date.now() - session.createdAt) / 1000);
                    const lastActivity = Math.round((Date.now() - session.lastActivity) / 1000);
                    
                    rikz.sendMessage(m.chat, { 
                        text: `🔍 *Session Info*\n\nStep: ${session.step}\nGame: ${session.gameSlug}\nProduct: ${session.productCode}\nAge: ${sessionAge}s\nLast Activity: ${lastActivity}s ago` 
                    }, { quoted: m });
                } else {
                    rikz.sendMessage(m.chat, { text: "No active session." }, { quoted: m });
                }
                break;

            default:
        }
        // =============== DYNAMIC COMMANDS ===============
             if(command.startsWith('category-')) {
            const categoryKey = command.replace('category-', '');
            const category = gameCategories.getAllCategories()[categoryKey];
            
            if (!category) return;

            try {
                // Use apiCall instead of cachedApiCall for debugging
                const gamesData = await apiCall('check_games.php');
                console.log('Games API Response:', gamesData); // Log the response

                if (!gamesData.success) {
                    console.log('Games API failed:', gamesData);
                    return rikz.sendMessage(m.chat, { text: "Failed to load games from API." }, { quoted: m });
                }

                const categoryGames = gamesData.games.filter(game => 
                    category.games.includes(game.slug)
                );

                console.log('Category games:', categoryGames); // Log the filtered games

                if (categoryGames.length === 0) {
                    return rikz.sendMessage(m.chat, { text: "No games found in this category." }, { quoted: m });
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
                    const profitPrice = (product.vprice * 1.02).toFixed(2);
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
                // Check stock before processing
                const stockInfo = await inventory.checkProductStock(session.gameSlug, session.productCode);
                if (!stockInfo.available) {
                    return rikz.sendMessage(m.chat, { 
                        text: `❌ *Product Unavailable*\n\n${stockInfo.name || session.productCode} is currently out of stock.\n\nPlease try a different product or check back later.` 
                    }, { quoted: m });
                }

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
                    orderTracker.trackOrder(result.custom_order_id, m.sender, session.gameSlug, session.productCode);

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
                performanceMonitor.trackError(error, 'order_confirmation');
            }

            sessionManager.clearSession(m.sender);
        }

        else if(command === 'change') {
            const session = sessionManager.getSession(m.sender);
            if(!session || session.step !== "awaiting_confirmation") return;
            session.step = "awaiting_ids";
            rikz.sendMessage(m.chat, { 
                text: "🔄 *Change Order Information*\n\nPlease provide your new USER_ID and ZONE_ID:\nFormat: user_id zone_id" 
            }, { quoted: m });
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
            
            if (!userId || !zoneId || isNaN(userId) || isNaN(zoneId)) {
                return rikz.sendMessage(m.chat, { 
                    text: "❌ *Invalid Format*\n\nUSER_ID and ZONE_ID must be numbers\n\nExample: 123456789 1234" 
                }, { quoted: m });
            }

            sessionManager.updateSession(m.sender, {
                step: "awaiting_confirmation",
                orderData: { user_id: userId, zone_id: zoneId }
            });

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
                    { buttonId: '.change', buttonText: { displayText: '✏️ Change Info' }, type: 1 }
                ],
                headerType: 1
          }, { quoted: m });
        }

        // Track abandoned carts for marketing
        if (sessionManager.getSession(m.sender) && body.toLowerCase().includes('cancel')) {
            marketing.triggerCampaign(m.sender, 'abandoned_cart');
            sessionManager.clearSession(m.sender);
        }

        // Track performance
        const duration = Date.now() - startTime;
        performanceMonitor.trackCommand(command, duration);

    } catch(err) {
        const duration = Date.now() - startTime;
        performanceMonitor.trackError(err, 'main_handler');
        performanceMonitor.trackCommand('ERROR', duration);
        console.log('\x1b[1;31m' + err + '\x1b[0m');
        
        // Send user-friendly error message
        try {
            await rikz.sendMessage(m.chat, { 
                text: "❌ An unexpected error occurred. Please try again later." 
            }, { quoted: m });
        } catch (sendError) {
            console.log('Failed to send error message:', sendError);
        }
    }
}

console.log(chalk.green('🎮 GameVia Bot fully loaded with all advanced features!'));
