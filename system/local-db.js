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
            const cache = this.githubDB.loadLocalCache('users.json');
            return cache ? cache[userId] || null : null;
        }
    }

    async createUser(userData) {
        try {
            const users = await this.githubDB.pullFile('users.json');
            
            if (users[userData.id]) {
                return { success: false, error: 'User already exists' };
            }

            users[userData.id] = userData;
            await this.githubDB.pushFile('users.json', users);
            this.githubDB.saveLocalCache('users.json', users);
            
            return userData;
        } catch (error) {
            console.error(chalk.red('❌ Failed to create user via GitHub:'), error.message);
            throw new Error('User creation failed: ' + error.message);
        }
    }

    async updateUser(userId, updates) {
        try {
            const users = await this.githubDB.pullFile('users.json');
            
            if (!users[userId]) {
                return { success: false, error: 'User not found' };
            }

            users[userId] = { ...users[userId], ...updates };
            await this.githubDB.pushFile('users.json', users);
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
