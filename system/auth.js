const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const localDB = require('./local-db');

class AuthSystem {
    constructor() {
        this.secretKey = this.generateOrLoadSecret();
        this.tokens = new Map();
        this.sessions = new Map();
        this.users = {};
        this.resellers = {};
        this.init();
        console.log(chalk.green('🔐 Authentication system initialized'));
    }

    async init() {
        try {
            this.users = await localDB.getAllUsers();
            this.resellers = await localDB.getAllResellers();
            console.log(chalk.green(`✅ AuthSystem loaded ${Object.keys(this.users).length} users and ${Object.keys(this.resellers).length} resellers`));
        } catch (error) {
            console.error(chalk.red('❌ Failed to initialize AuthSystem:'), error);
            this.users = {};
            this.resellers = {};
        }
    }

    generateOrLoadSecret() {
        const secretPath = './system/database/auth-secret.json';
        
        try {
            if (fs.existsSync(secretPath)) {
                const secretData = fs.readFileSync(secretPath, 'utf8');
                return JSON.parse(secretData).secret;
            }
            
            // Generate new secret
            const newSecret = crypto.randomBytes(64).toString('hex');
            fs.ensureFileSync(secretPath);
            fs.writeFileSync(secretPath, JSON.stringify({ 
                secret: newSecret,
                created: new Date().toISOString()
            }, null, 2));
            
            console.log(chalk.green('🔑 New secret key generated'));
            return newSecret;
        } catch (error) {
            console.log(chalk.red('❌ Failed to load/generate secret:'), error.message);
            return 'fallback-secret-key-change-in-production';
        }
    }

    // ==================== JWT TOKEN MANAGEMENT ====================
    generateToken(userId, userData) {
        const payload = {
            userId: userId,
            name: userData.name,
            role: userData.role,
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
        };

        const token = jwt.sign(payload, this.secretKey);
        this.tokens.set(token, { userId, createdAt: new Date() });
        
        return token;
    }

    verifyToken(token) {
        try {
            if (!this.tokens.has(token)) {
                return { valid: false, error: 'Token not found' };
            }

            const decoded = jwt.verify(token, this.secretKey);
            return { valid: true, user: decoded };
        } catch (error) {
            this.tokens.delete(token);
            return { valid: false, error: error.message };
        }
    }

    revokeToken(token) {
        this.tokens.delete(token);
        return { success: true };
    }

    // ==================== SESSION MANAGEMENT ====================
    createSession(userId, sessionData = {}) {
        const sessionId = crypto.randomBytes(16).toString('hex');
        const session = {
            sessionId,
            userId,
            createdAt: new Date().toISOString(),
            lastActive: new Date().toISOString(),
            ip: sessionData.ip || 'unknown',
            userAgent: sessionData.userAgent || 'unknown',
            isActive: true
        };

        this.sessions.set(sessionId, session);
        return session;
    }

    getSession(sessionId) {
        return this.sessions.get(sessionId);
    }

    updateSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.lastActive = new Date().toISOString();
            return session;
        }
        return null;
    }

    destroySession(sessionId) {
        this.sessions.delete(sessionId);
        return { success: true };
    }

    cleanupExpiredSessions(maxAgeHours = 24) {
        const now = new Date();
        let cleanedCount = 0;

        this.sessions.forEach((session, sessionId) => {
            const sessionAge = now - new Date(session.lastActive);
            const maxAgeMs = maxAgeHours * 60 * 60 * 1000;

            if (sessionAge > maxAgeMs) {
                this.sessions.delete(sessionId);
                cleanedCount++;
            }
        });

        console.log(chalk.yellow(`🧹 Cleaned ${cleanedCount} expired sessions`));
        return cleanedCount;
    }

    // ==================== USER MANAGEMENT ====================
    async registerUser(userId, userData) {
        try {
            if (this.users[userId]) {
                return { success: false, error: 'User already exists' };
            }

            const user = {
                id: userId,
                name: userData.name || 'Unknown User',
                phone: userData.phone || userId,
                balance: 0,
                totalOrders: 0,
                totalSpent: 0,
                role: 'user',
                status: 'active',
                registeredVia: userData.registeredVia || 'whatsapp_bot',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                lastLogin: new Date().toISOString(),
                transactions: [],
                isActive: true
            };
            
            await localDB.createUser(user);
            this.users[userId] = user;
            
            // Generate token and session
            const token = this.generateToken(userId, user);
            const session = this.createSession(userId, userData.session);
            
            console.log(chalk.blue(`👤 New user registered: ${user.name} (${userId})`));
            return { 
                success: true, 
                user: user,
                token: token,
                session: session
            };
        } catch (error) {
            console.error(chalk.red(`❌ Failed to register user ${userId}:`), error);
            return { success: false, error: 'Registration failed' };
        }
    }

    getUser(userId) {
        return this.users[userId] || null;
    }

    userExists(userId) {
        return !!this.users[userId];
    }

    getAllUsers() {
        return this.users;
    }

    async updateUser(userId, updates) {
        try {
            const user = this.users[userId];
            if (!user) {
                return { success: false, error: 'User not found' };
            }

            // Don't allow updating protected fields
            const protectedFields = ['id', 'userId', 'createdAt'];
            protectedFields.forEach(field => {
                if (updates[field]) delete updates[field];
            });

            const updatedUser = {
                ...user,
                ...updates,
                updatedAt: new Date().toISOString()
            };

            await localDB.updateUser(userId, updatedUser);
            this.users[userId] = updatedUser;

            return { success: true, user: updatedUser };
        } catch (error) {
            console.error(chalk.red(`❌ Failed to update user ${userId}:`), error);
            return { success: false, error: 'User update failed' };
        }
    }

    // ==================== BALANCE MANAGEMENT ====================
    async addBalance(userId, amount, reason = '') {
        try {
            const user = this.users[userId];
            if (!user) {
                return { success: false, error: 'User not found' };
            }

            const oldBalance = user.balance || 0;
            user.balance = oldBalance + amount;
            user.updatedAt = new Date().toISOString();
            
            // Add transaction record
            user.transactions = user.transactions || [];
            user.transactions.push({
                id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                amount: amount,
                type: amount > 0 ? 'balance_add' : 'balance_deduct',
                reason: reason,
                timestamp: new Date().toISOString(),
                balanceBefore: oldBalance,
                balanceAfter: user.balance,
                description: reason || (amount > 0 ? 'Balance topup' : 'Balance deduction')
            });

            // Update total spent if it's a deduction
            if (amount < 0) {
                user.totalSpent = (user.totalSpent || 0) + Math.abs(amount);
            }

            await localDB.updateUser(userId, user);
            
            console.log(chalk.blue(`💰 Balance updated for ${user.name}: ${amount > 0 ? '+' : ''}RM${amount.toFixed(2)} (New: RM${user.balance.toFixed(2)})`));
            return { 
                success: true, 
                newBalance: user.balance, 
                oldBalance: oldBalance,
                transactionId: user.transactions[user.transactions.length - 1].id
            };
        } catch (error) {
            console.error(chalk.red(`❌ Failed to update balance for ${userId}:`), error);
            return { success: false, error: 'Balance update failed' };
        }
    }

    async deductBalance(userId, amount, reason = '') {
        const user = this.users[userId];
        if (!user) {
            return { success: false, error: 'User not found' };
        }

        const userBalanceCents = Math.round((user.balance || 0) * 100);
        const amountCents = Math.round(amount * 100);

        if (userBalanceCents < amountCents) {
            return { 
                success: false, 
                error: `Insufficient balance. Need RM${amount.toFixed(2)}, have RM${user.balance.toFixed(2)}` 
            };
        }

        return await this.addBalance(userId, -amount, reason);
    }

    // ==================== ORDER MANAGEMENT ====================
    async recordOrder(userId, orderData) {
        try {
            const user = this.users[userId];
            if (!user) {
                return { success: false, error: 'User not found' };
            }

            // Update user stats
            user.totalOrders = (user.totalOrders || 0) + 1;
            
            if (orderData.status === 'success' && orderData.price) {
                user.totalSpent = (user.totalSpent || 0) + orderData.price;
            }

            user.updatedAt = new Date().toISOString();

            // Record transaction
            this.recordTransaction(userId, {
                type: 'order_payment',
                amount: -(orderData.price || 0),
                orderId: orderData.id,
                game: orderData.gameSlug,
                product: orderData.product,
                status: orderData.status,
                timestamp: new Date().toISOString(),
                balanceAfter: user.balance
            });

            await localDB.updateUser(userId, user);
            
            console.log(chalk.blue(`🛒 Order recorded for ${user.name}: ${orderData.id} (RM${orderData.price?.toFixed(2) || '0.00'})`));
            return { success: true, user: user };
        } catch (error) {
            console.error(chalk.red(`❌ Failed to record order for ${userId}:`), error);
            return { success: false, error: 'Order recording failed' };
        }
    }

    // ==================== RESELLER MANAGEMENT ====================
    async createReseller(userId, resellerData) {
        try {
            if (this.resellers[userId]) {
                return { success: false, error: 'User is already a reseller' };
            }

            if (!this.users[userId]) {
                return { success: false, error: 'User not found. Please register first.' };
            }

            const reseller = {
                userId: userId,
                name: resellerData.name || this.users[userId].name,
                phone: this.users[userId].phone,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                isActive: true,
                commissionRate: resellerData.commissionRate || 8,
                totalSales: 0,
                totalCommission: 0,
                balance: 0,
                customers: [],
                performance: {
                    monthlySales: 0,
                    totalCustomers: 0,
                    successRate: 100
                }
            };

            await localDB.createReseller(reseller);
            this.resellers[userId] = reseller;

            // Update user role
            this.users[userId].role = 'reseller';
            await localDB.updateUser(userId, { role: 'reseller' });

            console.log(chalk.blue(`👑 New reseller created: ${reseller.name} (${userId})`));
            return { success: true, reseller: reseller };
        } catch (error) {
            console.error(chalk.red(`❌ Failed to create reseller ${userId}:`), error);
            return { success: false, error: 'Reseller creation failed' };
        }
    }

    isReseller(userId) {
        return !!this.resellers[userId];
    }

    getReseller(userId) {
        return this.resellers[userId] || null;
    }

    getAllResellers() {
        return this.resellers;
    }

    async recordResellerSale(resellerId, saleData) {
        try {
            const reseller = this.resellers[resellerId];
            if (!reseller) {
                return { success: false, error: 'Reseller not found' };
            }

            const commission = (saleData.amount * reseller.commissionRate) / 100;
            
            reseller.totalSales += saleData.amount;
            reseller.totalCommission += commission;
            reseller.balance += commission;
            reseller.updatedAt = new Date().toISOString();

            // Add customer if new
            if (saleData.customerId && !reseller.customers.includes(saleData.customerId)) {
                reseller.customers.push(saleData.customerId);
                reseller.performance.totalCustomers = reseller.customers.length;
            }

            // Update performance
            reseller.performance.monthlySales = reseller.totalSales; // Simplified

            // Record transaction for reseller
            await this.addBalance(resellerId, commission, `Commission from sale to ${saleData.customerId}`);

            await localDB.updateReseller(resellerId, reseller);
            
            console.log(chalk.blue(`💰 Reseller commission: ${reseller.name} earned RM${commission.toFixed(2)} from sale`));
            return { 
                success: true, 
                commission: commission,
                newBalance: reseller.balance,
                reseller: reseller
            };
        } catch (error) {
            console.error(chalk.red(`❌ Failed to record reseller sale for ${resellerId}:`), error);
            return { success: false, error: 'Sale recording failed' };
        }
    }

    // ==================== TRANSACTION HISTORY ====================
    recordTransaction(userId, transaction) {
        const user = this.users[userId];
        if (!user) return;

        user.transactions = user.transactions || [];
        user.transactions.push({
            id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            ...transaction
        });

        // Keep only last 100 transactions per user
        if (user.transactions.length > 100) {
            user.transactions = user.transactions.slice(-100);
        }

        // Update user in memory (DB will be updated on next user update)
        this.users[userId] = user;
    }

    getUserTransactions(userId, limit = 10) {
        const user = this.users[userId];
        if (!user || !user.transactions) {
            return [];
        }
        return user.transactions
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, limit);
    }

    // ==================== USER STATISTICS ====================
    getUserStats() {
        const userArray = Object.values(this.users);
        
        const totalBalance = userArray.reduce((sum, user) => sum + (user.balance || 0), 0);
        const totalSpent = userArray.reduce((sum, user) => sum + (user.totalSpent || 0), 0);
        const totalOrders = userArray.reduce((sum, user) => sum + (user.totalOrders || 0), 0);
        const activeUsers = userArray.filter(user => user.status === 'active').length;

        return {
            totalUsers: userArray.length,
            activeUsers: activeUsers,
            totalResellers: Object.keys(this.resellers).length,
            totalBalance: totalBalance,
            totalSpent: totalSpent,
            totalOrders: totalOrders,
            averageBalance: totalBalance / userArray.length,
            averageSpent: totalSpent / userArray.length,
            revenue: totalSpent
        };
    }

    getResellerStats() {
        const resellerArray = Object.values(this.resellers);
        
        return {
            totalResellers: resellerArray.length,
            activeResellers: resellerArray.filter(r => r.isActive).length,
            totalSales: resellerArray.reduce((sum, r) => sum + (r.totalSales || 0), 0),
            totalCommission: resellerArray.reduce((sum, r) => sum + (r.totalCommission || 0), 0),
            averageCommissionRate: resellerArray.reduce((sum, r) => sum + (r.commissionRate || 0), 0) / resellerArray.length,
            totalCustomers: resellerArray.reduce((sum, r) => sum + (r.customers?.length || 0), 0)
        };
    }

    // ==================== ADMIN METHODS ====================
    async updateUserRole(userId, newRole) {
        try {
            const user = this.users[userId];
            if (!user) {
                return { success: false, error: 'User not found' };
            }

            user.role = newRole;
            user.updatedAt = new Date().toISOString();

            // Update reseller status
            if (newRole === 'reseller' && !this.resellers[userId]) {
                await this.createReseller(userId, { name: user.name });
            } else if (newRole !== 'reseller' && this.resellers[userId]) {
                // Deactivate reseller but keep record
                this.resellers[userId].isActive = false;
                await localDB.updateReseller(userId, { isActive: false });
            }

            await localDB.updateUser(userId, { role: newRole });
            return { success: true, user: user };
        } catch (error) {
            console.error(chalk.red(`❌ Failed to update user role for ${userId}:`), error);
            return { success: false, error: 'Role update failed' };
        }
    }

    async suspendUser(userId, reason = '') {
        try {
            const user = this.users[userId];
            if (!user) {
                return { success: false, error: 'User not found' };
            }

            user.status = 'suspended';
            user.updatedAt = new Date().toISOString();
            user.suspensionReason = reason;
            user.suspendedAt = new Date().toISOString();

            // Revoke all active sessions
            this.sessions.forEach((session, sessionId) => {
                if (session.userId === userId) {
                    this.sessions.delete(sessionId);
                }
            });

            await localDB.updateUser(userId, user);
            return { success: true, user: user };
        } catch (error) {
            console.error(chalk.red(`❌ Failed to suspend user ${userId}:`), error);
            return { success: false, error: 'Suspension failed' };
        }
    }

    async activateUser(userId) {
        try {
            const user = this.users[userId];
            if (!user) {
                return { success: false, error: 'User not found' };
            }

            user.status = 'active';
            user.updatedAt = new Date().toISOString();
            delete user.suspensionReason;
            delete user.suspendedAt;

            await localDB.updateUser(userId, user);
            return { success: true, user: user };
        } catch (error) {
            console.error(chalk.red(`❌ Failed to activate user ${userId}:`), error);
            return { success: false, error: 'Activation failed' };
        }
    }

    // ==================== CLEANUP METHODS ====================
    async cleanupSessions(maxAgeHours = 24) {
        const cleaned = this.cleanupExpiredSessions(maxAgeHours);
        console.log(chalk.yellow(`🧹 Cleaned up ${cleaned} expired sessions`));
        return { success: true, cleaned: cleaned };
    }

    async cleanupExpiredTokens() {
        const now = Math.floor(Date.now() / 1000);
        let cleanedCount = 0;

        this.tokens.forEach((tokenData, token) => {
            try {
                const decoded = jwt.verify(token, this.secretKey);
                if (decoded.exp < now) {
                    this.tokens.delete(token);
                    cleanedCount++;
                }
            } catch (error) {
                this.tokens.delete(token);
                cleanedCount++;
            }
        });

        console.log(chalk.yellow(`🧹 Cleaned ${cleanedCount} expired tokens`));
        return cleanedCount;
    }

    // ==================== SYNC METHODS ====================
    async syncData() {
        try {
            this.users = await localDB.getAllUsers();
            this.resellers = await localDB.getAllResellers();
            console.log(chalk.green('✅ Auth data synced successfully'));
            return { 
                success: true, 
                users: Object.keys(this.users).length, 
                resellers: Object.keys(this.resellers).length 
            };
        } catch (error) {
            console.error(chalk.red('❌ Failed to sync auth data:'), error);
            return { success: false, error: error.message };
        }
    }

    // ==================== BACKUP METHODS ====================
    async createBackup() {
        try {
            const backupData = {
                users: this.users,
                resellers: this.resellers,
                sessions: Array.from(this.sessions.entries()),
                tokens: Array.from(this.tokens.entries()),
                backupCreated: new Date().toISOString()
            };

            const backupPath = `./system/backups/auth-backup-${Date.now()}.json`;
            await fs.ensureFile(backupPath);
            await fs.writeFile(backupPath, JSON.stringify(backupData, null, 2));
            
            console.log(chalk.green(`✅ Auth backup created: ${backupPath}`));
            return { success: true, path: backupPath };
        } catch (error) {
            console.error(chalk.red('❌ Failed to create auth backup:'), error);
            return { success: false, error: error.message };
        }
    }

    // ==================== HEALTH CHECK ====================
    getSystemHealth() {
        return {
            status: 'healthy',
            users: Object.keys(this.users).length,
            resellers: Object.keys(this.resellers).length,
            activeSessions: this.sessions.size,
            activeTokens: this.tokens.size,
            memoryUsage: process.memoryUsage(),
            uptime: process.uptime(),
            lastSync: new Date().toISOString()
        };
    }
}

module.exports = new AuthSystem();
