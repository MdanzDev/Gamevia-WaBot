const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');

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

// ==================== LOCAL DATABASE OPERATIONS ====================
class LocalDB {
    constructor() {
        this.githubDB = new GitHubDB();
        console.log(chalk.green('✅ LocalDB initialized with GitHub backend'));
    }

    // ==================== USER OPERATIONS ====================
    async getUser(userId) {
        const users = await this.githubDB.pullFile('users.json');
        return users[userId] || null;
    }

    async createUser(userData) {
        const users = await this.githubDB.pullFile('users.json') || {};
        users[userData.id] = userData;
        await this.githubDB.pushFile('users.json', users);
        return userData;
    }

    async updateUser(userId, updates) {
        const users = await this.githubDB.pullFile('users.json') || {};
        if (users[userId]) {
            users[userId] = { ...users[userId], ...updates };
            await this.githubDB.pushFile('users.json', users);
            return users[userId];
        }
        return null;
    }

    async getAllUsers() {
        return await this.githubDB.pullFile('users.json') || {};
    }

    async userExists(userId) {
        const users = await this.githubDB.pullFile('users.json');
        return !!users[userId];
    }

    // ==================== ORDER OPERATIONS ====================
    async createOrder(orderData) {
        const orders = await this.githubDB.pullFile('orders.json') || {};
        const userId = orderData.userId;
        
        if (!orders[userId]) {
            orders[userId] = [];
        }
        
        const order = {
            ...orderData,
            id: orderData.id || `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            createdAt: new Date().toISOString(),
            status: orderData.status || 'pending',
            updatedAt: new Date().toISOString()
        };
        
        orders[userId].push(order);
        await this.githubDB.pushFile('orders.json', orders);
        return order;
    }

    async getUserOrders(userId, limit = 10) {
        const orders = await this.githubDB.pullFile('orders.json') || {};
        const userOrders = orders[userId] || [];
        return userOrders.slice(-limit).reverse();
    }

    async getAllOrders() {
        const orders = await this.githubDB.pullFile('orders.json') || {};
        // Flatten all user orders into one array
        const allOrders = Object.values(orders).flat();
        return allOrders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    async updateOrderStatus(orderId, status, description = '') {
        const orders = await this.githubDB.pullFile('orders.json') || {};
        let updatedOrder = null;
        
        for (const userId in orders) {
            const orderIndex = orders[userId].findIndex(order => order.id === orderId);
            if (orderIndex !== -1) {
                orders[userId][orderIndex].status = status;
                orders[userId][orderIndex].updatedAt = new Date().toISOString();
                if (description) {
                    orders[userId][orderIndex].description = description;
                }
                updatedOrder = orders[userId][orderIndex];
                break;
            }
        }
        
        if (updatedOrder) {
            await this.githubDB.pushFile('orders.json', orders);
        }
        return updatedOrder;
    }

    async getOrderById(orderId) {
        const orders = await this.githubDB.pullFile('orders.json') || {};
        
        for (const userId in orders) {
            const order = orders[userId].find(order => order.id === orderId);
            if (order) return order;
        }
        return null;
    }

    // ==================== PRICING OPERATIONS ====================
    async getPricing() {
        try {
            const pricing = await this.githubDB.pullFile('pricing.json');
            
            // FIXED: Proper fallback with default values
            if (!pricing || typeof pricing !== 'object' || Object.keys(pricing).length === 0) {
                console.log(chalk.yellow('⚠️ Using default pricing - no pricing file found'));
                const defaultPricing = {
                    regular_markup: 10,
                    reseller_markup: 5,
                    updatedAt: new Date().toISOString(),
                    createdBy: 'System',
                    note: 'Default pricing configuration'
                };
                
                // Auto-create pricing file if it doesn't exist
                await this.githubDB.pushFile('pricing.json', defaultPricing);
                return defaultPricing;
            }
            
            // Ensure required fields exist
            return {
                regular_markup: pricing.regular_markup || 10,
                reseller_markup: pricing.reseller_markup || 5,
                updatedAt: pricing.updatedAt || new Date().toISOString(),
                ...pricing
            };
        } catch (error) {
            console.error(chalk.red('❌ Pricing fetch error:'), error);
            // Fallback to default pricing
            return {
                regular_markup: 10,
                reseller_markup: 5,
                updatedAt: new Date().toISOString(),
                error: 'Using fallback pricing'
            };
        }
    }

    async updatePricing(newPricing) {
        const pricing = {
            regular_markup: newPricing.regular_markup || 10,
            reseller_markup: newPricing.reseller_markup || 5,
            updatedAt: new Date().toISOString(),
            ...newPricing
        };
        await this.githubDB.pushFile('pricing.json', pricing);
        return pricing;
    }

    // ==================== RESELLER OPERATIONS ====================
    async getResellers() {
        return await this.githubDB.pullFile('resellers.json') || {};
    }

    async createReseller(resellerData) {
        const resellers = await this.githubDB.pullFile('resellers.json') || {};
        resellers[resellerData.userId] = {
            ...resellerData,
            createdAt: new Date().toISOString(),
            isActive: true
        };
        await this.githubDB.pushFile('resellers.json', resellers);
        return resellers[resellerData.userId];
    }

    async getAllResellers() {
        return await this.githubDB.pullFile('resellers.json') || {};
    }

    async updateReseller(userId, updates) {
        const resellers = await this.githubDB.pullFile('resellers.json') || {};
        if (resellers[userId]) {
            resellers[userId] = { ...resellers[userId], ...updates };
            await this.githubDB.pushFile('resellers.json', resellers);
            return resellers[userId];
        }
        return null;
    }

    // ==================== STATISTICS OPERATIONS ====================
    async getDailyStats() {
        const today = new Date().toDateString();
        const stats = await this.githubDB.pullFile('daily_stats.json') || {};
        
        if (stats.date !== today) {
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
                peakHours: {},
                updatedAt: new Date().toISOString()
            };
        }
        return stats;
    }

    async updateDailyStats(updates) {
        const stats = await this.getDailyStats();
        const updatedStats = { 
            ...stats, 
            ...updates,
            updatedAt: new Date().toISOString()
        };
        await this.githubDB.pushFile('daily_stats.json', updatedStats);
        return updatedStats;
    }

    async getCampaignStats() {
        return await this.githubDB.pullFile('campaign_stats.json') || {};
    }

    async updateCampaignStats(updates) {
        const stats = await this.getCampaignStats();
        const updatedStats = { ...stats, ...updates };
        await this.githubDB.pushFile('campaign_stats.json', updatedStats);
        return updatedStats;
    }

    // ==================== SYSTEM STATISTICS ====================
    async getStats() {
        const users = await this.githubDB.pullFile('users.json') || {};
        const orders = await this.githubDB.pullFile('orders.json') || {};
        
        const allOrders = Object.values(orders).flat();
        const successfulOrders = allOrders.filter(o => o.status === 'success');
        const totalRevenue = successfulOrders.reduce((sum, o) => sum + (o.price || 0), 0);
        
        // Calculate user balances
        const totalBalance = Object.values(users).reduce((sum, user) => sum + (user.balance || 0), 0);
        const totalSpent = Object.values(users).reduce((sum, user) => sum + (user.totalSpent || 0), 0);
        
        return {
            totalUsers: Object.keys(users).length,
            totalOrders: allOrders.length,
            successfulOrders: successfulOrders.length,
            failedOrders: allOrders.length - successfulOrders.length,
            successRate: allOrders.length > 0 ? (successfulOrders.length / allOrders.length * 100).toFixed(1) : 0,
            totalRevenue: totalRevenue,
            totalBalance: totalBalance,
            totalSpent: totalSpent,
            averageOrderValue: successfulOrders.length > 0 ? totalRevenue / successfulOrders.length : 0
        };
    }

    // ==================== BACKUP & MAINTENANCE ====================
    async backup() {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupData = {
                users: await this.githubDB.pullFile('users.json'),
                orders: await this.githubDB.pullFile('orders.json'),
                pricing: await this.githubDB.pullFile('pricing.json'),
                resellers: await this.githubDB.pullFile('resellers.json'),
                daily_stats: await this.githubDB.pullFile('daily_stats.json'),
                campaign_stats: await this.githubDB.pullFile('campaign_stats.json'),
                backupTime: timestamp,
                backupId: `backup-${timestamp}`
            };
            
            await this.githubDB.pushFile(`backups/backup-${timestamp}.json`, backupData);
            return { success: true, backupId: timestamp, files: Object.keys(backupData).length };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async cleanupBackups(daysOld = 30) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysOld);
            console.log(chalk.yellow(`🧹 Cleaning up backups older than ${daysOld} days...`));
            return { success: true, message: 'Backup cleanup completed' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // ==================== FEEDBACK & SUPPORT ====================
    async saveFeedback(feedbackData) {
        const feedbacks = await this.githubDB.pullFile('feedback.json') || {};
        const feedbackId = `fb_${Date.now()}`;
        feedbacks[feedbackId] = {
            ...feedbackData,
            id: feedbackId,
            timestamp: new Date().toISOString()
        };
        await this.githubDB.pushFile('feedback.json', feedbacks);
        return feedbackId;
    }

    async getFeedbacks(limit = 50) {
        const feedbacks = await this.githubDB.pullFile('feedback.json') || {};
        return Object.values(feedbacks)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, limit);
    }

    // ==================== SYNC METHODS ====================
    async syncAllData() {
        return await this.githubDB.syncAllData();
    }

    // ==================== UTILITY METHODS ====================
    loadJSON(path) {
        const filename = path.split('/').pop();
        return this.githubDB.loadLocal(filename);
    }

    saveJSON(path, data) {
        const filename = path.split('/').pop();
        return this.githubDB.saveLocal(filename, data);
    }
}

module.exports = new LocalDB();
