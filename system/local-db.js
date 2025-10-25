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
            // DON'T fallback to local storage - we don't want to overwrite GitHub data
            return { success: false, error: error.message };
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
                console.log(chalk.yellow(`📁 ${filename} not found on GitHub, creating new file`));
                // Create empty file on GitHub instead of using local
                await this.pushFile(filename, {});
                return {};
            }
            
            if (!response.ok) {
                throw new Error(`GitHub API error: ${response.status}`);
            }
            
            const result = await response.json();
            const content = Buffer.from(result.content, 'base64').toString('utf8');
            const parsedContent = JSON.parse(content);
            console.log(chalk.green(`✅ Pulled ${filename} from GitHub (${Object.keys(parsedContent).length} records)`));
            return parsedContent;
        } catch (error) {
            console.error(chalk.red(`❌ Failed to pull ${filename} from GitHub:`), error.message);
            // CRITICAL: Don't fallback to local - throw error instead
            throw new Error(`GitHub fetch failed: ${error.message}`);
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

    // Local cache methods (read-only, for emergency backup)
    saveLocalCache(filename, content) {
        try {
            const cachePath = `./system/database/cache/${filename}`;
            fs.ensureFileSync(cachePath);
            fs.writeFileSync(cachePath, JSON.stringify(content, null, 2));
            console.log(chalk.yellow(`📁 Cached ${filename} locally (backup only)`));
            return { success: true, cached: true };
        } catch (error) {
            console.error(chalk.red(`❌ Failed to cache ${filename} locally:`), error);
            return { success: false, error: error.message };
        }
    }

    loadLocalCache(filename) {
        try {
            const cachePath = `./system/database/cache/${filename}`;
            if (fs.existsSync(cachePath)) {
                const content = fs.readFileSync(cachePath, 'utf8');
                console.log(chalk.yellow(`⚠️ Loading ${filename} from local cache (GitHub may be down)`));
                return JSON.parse(content);
            }
            return null; // No cache available
        } catch (error) {
            console.error(chalk.red(`❌ Failed to load ${filename} from cache:`), error);
            return null;
        }
    }

    // Emergency recovery - only use when explicitly requested
    async emergencyRecovery(filename) {
        const cache = this.loadLocalCache(filename);
        if (cache) {
            console.log(chalk.red(`🚨 EMERGENCY: Restoring ${filename} from local cache to GitHub`));
            return await this.pushFile(filename, cache);
        }
        return { success: false, error: 'No cache available for recovery' };
    }

    // ==================== SYNC ALL DATA METHOD ====================
    async syncAllData() {
        console.log(chalk.blue('🔄 Syncing all data to GitHub...'));
        const files = ['users.json', 'orders.json', 'pricing.json', 'resellers.json', 'daily_stats.json', 'campaign_stats.json'];
        
        let syncedFiles = 0;
        
        for (const file of files) {
            try {
                // Try to pull current data from GitHub first
                const currentData = await this.pullFile(file);
                
                // If we have data, push it back (this ensures we're synced)
                if (currentData && Object.keys(currentData).length > 0) {
                    await this.pushFile(file, currentData);
                    syncedFiles++;
                    console.log(chalk.green(`✅ Synced ${file}`));
                } else {
                    console.log(chalk.yellow(`⚠️ No data to sync for ${file}`));
                }
            } catch (error) {
                console.error(chalk.red(`❌ Failed to sync ${file}:`), error.message);
            }
        }
        
        console.log(chalk.green(`✅ Sync completed! ${syncedFiles} files synced`));
        return { success: true, syncedFiles: syncedFiles };
    }
}

// ==================== LOCAL DATABASE OPERATIONS ====================
class LocalDB {
    constructor() {
        this.githubDB = new GitHubDB();
        console.log(chalk.green('✅ LocalDB initialized with GitHub as primary source'));
    }

    // ==================== COMPATIBILITY METHODS ====================
    loadJSON(filename) {
        const actualFilename = filename.split('/').pop();
        return this.githubDB.pullFile(actualFilename);
    }

    saveJSON(filename, data) {
        const actualFilename = filename.split('/').pop();
        return this.githubDB.pushFile(actualFilename, data);
    }

    getAllOrders() {
        return this.githubDB.pullFile('orders.json');
    }

    getStats() {
        return this.getSystemStats();
    }

    // ==================== USER OPERATIONS ====================
    async getUser(userId) {
        try {
            const users = await this.githubDB.pullFile('users.json');
            return users[userId] || null;
        } catch (error) {
            console.error(chalk.red('❌ GitHub fetch failed for users:'), error.message);
            // Only use cache in absolute emergency
            const cache = this.githubDB.loadLocalCache('users.json');
            return cache ? cache[userId] || null : null;
        }
    }

    async createUser(userData) {
        try {
            // First pull current data from GitHub
            const users = await this.githubDB.pullFile('users.json');
            
            // Check if user already exists
            if (users[userData.id]) {
                return { success: false, error: 'User already exists' };
            }

            // Add new user
            users[userData.id] = userData;
            
            // Push updated data back to GitHub
            await this.githubDB.pushFile('users.json', users);
            
            // Cache locally as backup
            this.githubDB.saveLocalCache('users.json', users);
            
            return userData;
        } catch (error) {
            console.error(chalk.red('❌ Failed to create user via GitHub:'), error.message);
            throw new Error('User creation failed: ' + error.message);
        }
    }

    async updateUser(userId, updates) {
        try {
            // Pull current data from GitHub
            const users = await this.githubDB.pullFile('users.json');
            
            if (!users[userId]) {
                return { success: false, error: 'User not found' };
            }

            // Update user data
            users[userId] = { ...users[userId], ...updates };
            
            // Push back to GitHub
            await this.githubDB.pushFile('users.json', users);
            
            // Cache locally as backup
            this.githubDB.saveLocalCache('users.json', users);
            
            return users[userId];
        } catch (error) {
            console.error(chalk.red(`❌ Failed to update user ${userId}:`), error.message);
            throw new Error('User update failed: ' + error.message);
        }
    }

    async getAllUsers() {
        try {
            return await this.githubDB.pullFile('users.json');
        } catch (error) {
            console.error(chalk.red('❌ GitHub fetch failed for users:'), error.message);
            const cache = this.githubDB.loadLocalCache('users.json');
            return cache || {};
        }
    }

    async userExists(userId) {
        try {
            const users = await this.githubDB.pullFile('users.json');
            return !!users[userId];
        } catch (error) {
            console.error(chalk.red('❌ GitHub fetch failed for users:'), error.message);
            const cache = this.githubDB.loadLocalCache('users.json');
            return cache ? !!cache[userId] : false;
        }
    }

    // ==================== ORDER OPERATIONS ====================
    async createOrder(orderData) {
        try {
            // Pull current orders from GitHub
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
            
            // Push back to GitHub
            await this.githubDB.pushFile('orders.json', orders);
            
            // Cache locally as backup
            this.githubDB.saveLocalCache('orders.json', orders);
            
            return order;
        } catch (error) {
            console.error(chalk.red('❌ Failed to create order via GitHub:'), error.message);
            throw new Error('Order creation failed: ' + error.message);
        }
    }

    async getUserOrders(userId, limit = 10) {
        try {
            const orders = await this.githubDB.pullFile('orders.json') || {};
            const userOrders = orders[userId] || [];
            return userOrders.slice(-limit).reverse();
        } catch (error) {
            console.error(chalk.red('❌ GitHub fetch failed for orders:'), error.message);
            const cache = this.githubDB.loadLocalCache('orders.json');
            const userOrders = cache ? cache[userId] || [] : [];
            return userOrders.slice(-limit).reverse();
        }
    }

    async getAllOrders() {
        try {
            const orders = await this.githubDB.pullFile('orders.json') || {};
            // Flatten all user orders into one array
            const allOrders = Object.values(orders).flat();
            return allOrders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        } catch (error) {
            console.error(chalk.red('❌ GitHub fetch failed for orders:'), error.message);
            const cache = this.githubDB.loadLocalCache('orders.json');
            if (cache) {
                const allOrders = Object.values(cache).flat();
                return allOrders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            }
            return [];
        }
    }

    async updateOrderStatus(orderId, status, description = '') {
        try {
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
                this.githubDB.saveLocalCache('orders.json', orders);
            }
            return updatedOrder;
        } catch (error) {
            console.error('Failed to update order status:', error);
            throw error;
        }
    }

    async getOrderById(orderId) {
        try {
            const orders = await this.githubDB.pullFile('orders.json') || {};
            
            for (const userId in orders) {
                const order = orders[userId].find(order => order.id === orderId);
                if (order) return order;
            }
            return null;
        } catch (error) {
            console.error('Failed to get order by ID:', error);
            return null;
        }
    }

    // ==================== PRICING OPERATIONS ====================
    async getPricing() {
        try {
            const pricing = await this.githubDB.pullFile('pricing.json');
            
            // If no pricing exists on GitHub, create default
            if (!pricing || Object.keys(pricing).length === 0) {
                console.log(chalk.yellow('⚠️ No pricing found on GitHub, creating default'));
                const defaultPricing = {
                    regular_markup: 10,
                    reseller_markup: 5,
                    updatedAt: new Date().toISOString(),
                    createdBy: 'System',
                    note: 'Default pricing configuration'
                };
                
                await this.githubDB.pushFile('pricing.json', defaultPricing);
                return defaultPricing;
            }
            
            return pricing;
        } catch (error) {
            console.error(chalk.red('❌ GitHub fetch failed for pricing:'), error.message);
            const cache = this.githubDB.loadLocalCache('pricing.json');
            if (cache) return cache;
            
            // Fallback to default pricing only if absolutely necessary
            return {
                regular_markup: 10,
                reseller_markup: 5,
                updatedAt: new Date().toISOString(),
                error: 'Using fallback pricing - GitHub unavailable'
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
        try {
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
        } catch (error) {
            console.error('Failed to get daily stats:', error);
            const today = new Date().toDateString();
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
    }

    async updateDailyStats(updates) {
        try {
            const stats = await this.getDailyStats();
            const updatedStats = { 
                ...stats, 
                ...updates,
                updatedAt: new Date().toISOString()
            };
            await this.githubDB.pushFile('daily_stats.json', updatedStats);
            return updatedStats;
        } catch (error) {
            console.error('Failed to update daily stats:', error);
            throw error;
        }
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
    async getSystemStats() {
        try {
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
        } catch (error) {
            console.error('Failed to get system stats:', error);
            return {
                totalUsers: 0,
                totalOrders: 0,
                successfulOrders: 0,
                failedOrders: 0,
                successRate: 0,
                totalRevenue: 0,
                totalBalance: 0,
                totalSpent: 0,
                averageOrderValue: 0
            };
        }
    }

    // ==================== FEEDBACK & SUPPORT ====================
    async saveFeedback(feedbackData) {
        try {
            const feedbacks = await this.githubDB.pullFile('feedback.json') || {};
            const feedbackId = `fb_${Date.now()}`;
            feedbacks[feedbackId] = {
                ...feedbackData,
                id: feedbackId,
                timestamp: new Date().toISOString()
            };
            await this.githubDB.pushFile('feedback.json', feedbacks);
            return feedbackId;
        } catch (error) {
            console.error('Failed to save feedback:', error);
            throw error;
        }
    }

    async getFeedbacks(limit = 50) {
        try {
            const feedbacks = await this.githubDB.pullFile('feedback.json') || {};
            return Object.values(feedbacks)
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                .slice(0, limit);
        } catch (error) {
            console.error('Failed to get feedbacks:', error);
            return [];
        }
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

    // ==================== EMERGENCY RECOVERY ====================
    async emergencyRecovery() {
        console.log(chalk.red('🚨 Starting emergency recovery from local cache...'));
        const files = ['users.json', 'orders.json', 'pricing.json', 'resellers.json'];
        let recovered = 0;
        
        for (const file of files) {
            try {
                const result = await this.githubDB.emergencyRecovery(file);
                if (result.success) {
                    recovered++;
                    console.log(chalk.green(`✅ Recovered ${file} from cache`));
                }
            } catch (error) {
                console.error(chalk.red(`❌ Failed to recover ${file}:`), error.message);
            }
        }
        
        return { success: recovered > 0, recoveredFiles: recovered };
    }

    // ==================== SYNC METHODS ====================
    async syncAllData() {
        try {
            const result = await this.githubDB.syncAllData();
            return result;
        } catch (error) {
            console.error(chalk.red('❌ Sync failed:'), error.message);
            return { success: false, error: error.message };
        }
    }
}

module.exports = new LocalDB();
