const firebaseManager = require('./firebase');
const fs = require('fs-extra');
const chalk = require('chalk');
const fetch = require('node-fetch');
const path = require('path');
class FirebaseDB {
    constructor() {
        this.db = null;
        this.admin = null;
        this.initialize();
    }

    initialize() {
        try {
            this.db = firebaseManager.getDB();
            this.admin = firebaseManager.getAdmin();
            console.log('💾 FirebaseDB initialized successfully');
        } catch (error) {
            console.error('💥 FirebaseDB initialization failed:', error.message);
            this.db = null;
            this.admin = null;
        }
    }

    // Enhanced readiness check
    isReady() {
        const isReady = this.db !== null && firebaseManager.isConnected;
        if (!isReady) {
            console.log('⚠️ FirebaseDB not ready - db:', !!this.db, 'connected:', firebaseManager.isConnected);
        }
        return isReady;
    }

    // Wait for connection helper
    async waitForConnection(timeout = 10000) {
        const startTime = Date.now();
        while (!this.isReady() && (Date.now() - startTime) < timeout) {
            console.log('⏳ Waiting for Firebase connection...');
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        return this.isReady();
    }

    // User Management with enhanced features
    async createUser(userId, userData) {
        if (!(await this.waitForConnection())) {
            throw new Error('Firebase not ready. Please try again.');
        }
        
        try {
            const userRef = this.db.collection('users').doc(userId);
            const userDoc = await userRef.get();
            
            if (userDoc.exists) {
                console.log(`👤 User ${userId} already exists, updating...`);
                await userRef.update({
                    ...userData,
                    updatedAt: this.admin.firestore.FieldValue.serverTimestamp(),
                    lastLogin: this.admin.firestore.FieldValue.serverTimestamp()
                });
                return { success: true, action: 'updated', userId };
            } else {
                const userRecord = {
                    ...userData,
                    userId: userId,
                    createdAt: this.admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: this.admin.firestore.FieldValue.serverTimestamp(),
                    lastLogin: this.admin.firestore.FieldValue.serverTimestamp(),
                    status: 'active',
                    totalOrders: 0,
                    totalSpent: 0
                };
                
                await userRef.set(userRecord);
                console.log(`✅ User ${userId} created successfully`);
                return { success: true, action: 'created', userId, data: userRecord };
            }
        } catch (error) {
            console.error(`❌ Error in createUser for ${userId}:`, error);
            throw new Error(`Failed to create/update user: ${error.message}`);
        }
    }

    async getUser(userId) {
        if (!(await this.waitForConnection())) {
            return null;
        }
        
        try {
            const doc = await this.db.collection('users').doc(userId).get();
            if (doc.exists) {
                console.log(`📊 Retrieved user ${userId}`);
                return { id: doc.id, ...doc.data() };
            }
            console.log(`👻 User ${userId} not found`);
            return null;
        } catch (error) {
            console.error(`❌ Error getting user ${userId}:`, error);
            return null;
        }
    }

    async userExists(userId) {
        if (!(await this.waitForConnection())) {
            return false;
        }
        
        try {
            const doc = await this.db.collection('users').doc(userId).get();
            return doc.exists;
        } catch (error) {
            console.error(`❌ Error checking user existence ${userId}:`, error);
            return false;
        }
    }

    // Enhanced pricing management
    async getPricing() {
        if (!(await this.waitForConnection())) {
            throw new Error('Firebase not ready for pricing data');
        }
        
        try {
            const doc = await this.db.collection('settings').doc('pricing').get();
            if (doc.exists) {
                console.log('💰 Pricing settings loaded');
                return doc.data();
            } else {
                console.log('⚠️ No pricing settings found, creating defaults...');
                return await this.ensureSettings();
            }
        } catch (error) {
            console.error('❌ Error getting pricing:', error);
            throw new Error(`Pricing data unavailable: ${error.message}`);
        }
    }

    async ensureSettings() {
        if (!(await this.waitForConnection())) {
            throw new Error('Firebase not ready for settings');
        }
        
        try {
            const pricingRef = this.db.collection('settings').doc('pricing');
            const doc = await pricingRef.get();
            
            if (!doc.exists) {
                console.log('⚙️ Creating comprehensive default settings...');
                
                const defaultPricing = {
                    // Markup percentages
                    regular_markup: 20,
                    reseller_markup: 8,
                    premium_markup: 15,
                    
                    // Fees
                    registration_fee: 5,
                    transaction_fee: 0.5,
                    withdrawal_fee: 1,
                    
                    // Limits
                    min_topup: 1,
                    max_topup: 1000,
                    daily_limit: 5000,
                    
                    // Regional pricing adjustments
                    malaysia_adjustment: 1.0,
                    indonesia_adjustment: 1.1,
                    global_adjustment: 1.05,
                    
                    // Game-specific markups
                    mlbb_markup: 2,
                    ff_markup: 3,
                    valorant_markup: 2.5,
                    
                    // Metadata
                    created_at: this.admin.firestore.FieldValue.serverTimestamp(),
                    updated_at: this.admin.firestore.FieldValue.serverTimestamp(),
                    version: '1.0.0',
                    active: true
                };
                
                await pricingRef.set(defaultPricing);
                console.log('✅ Default pricing settings created');
                return defaultPricing;
            }
            
            console.log('✅ Existing pricing settings loaded');
            return doc.data();
        } catch (error) {
            console.error('❌ Error ensuring settings:', error);
            throw new Error(`Settings initialization failed: ${error.message}`);
        }
    }

    // Order management
    async createOrder(orderData) {
        if (!(await this.waitForConnection())) {
            throw new Error('Firebase not ready for orders');
        }
        
        try {
            const orderId = orderData.id || `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const orderRef = this.db.collection('orders').doc(orderId);
            
            const completeOrder = {
                ...orderData,
                orderId: orderId,
                createdAt: this.admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: this.admin.firestore.FieldValue.serverTimestamp(),
                status: orderData.status || 'pending',
                firebaseId: orderId
            };
            
            await orderRef.set(completeOrder);
            console.log(`✅ Order ${orderId} created in Firebase`);
            
            // Update user stats
            if (orderData.userId) {
                await this.updateUserStats(orderData.userId, completeOrder);
            }
            
            return { success: true, orderId, firebaseId: orderId };
        } catch (error) {
            console.error('❌ Error creating order:', error);
            throw new Error(`Order creation failed: ${error.message}`);
        }
    }

    async updateUserStats(userId, order) {
        if (!(await this.waitForConnection())) return;
        
        try {
            const userRef = this.db.collection('users').doc(userId);
            const userDoc = await userRef.get();
            
            if (userDoc.exists) {
                const userData = userDoc.data();
                const newTotalOrders = (userData.totalOrders || 0) + 1;
                const newTotalSpent = (userData.totalSpent || 0) + (order.price || 0);
                
                await userRef.update({
                    totalOrders: newTotalOrders,
                    totalSpent: newTotalSpent,
                    lastOrderAt: this.admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: this.admin.firestore.FieldValue.serverTimestamp()
                });
                
                console.log(`📊 Updated stats for user ${userId}: ${newTotalOrders} orders, RM${newTotalSpent} spent`);
            }
        } catch (error) {
            console.error(`❌ Error updating user stats for ${userId}:`, error);
        }
    }

    // Advanced query methods
    async getUserOrders(userId, limit = 50) {
        if (!(await this.waitForConnection())) {
            return [];
        }
        
        try {
            const snapshot = await this.db.collection('orders')
                .where('userId', '==', userId)
                .orderBy('createdAt', 'desc')
                .limit(limit)
                .get();
            
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error(`❌ Error getting orders for ${userId}:`, error);
            return [];
        }
    }

    // System statistics
    async getSystemStats() {
        if (!(await this.waitForConnection())) {
            return null;
        }
        
        try {
            // Get user count
            const usersSnapshot = await this.db.collection('users').get();
            const userCount = usersSnapshot.size;
            
            // Get order count by status
            const ordersSnapshot = await this.db.collection('orders').get();
            const orders = ordersSnapshot.docs.map(doc => doc.data());
            
            const stats = {
                totalUsers: userCount,
                totalOrders: orders.length,
                successfulOrders: orders.filter(o => o.status === 'success').length,
                pendingOrders: orders.filter(o => o.status === 'pending').length,
                totalRevenue: orders.filter(o => o.status === 'success').reduce((sum, o) => sum + (o.price || 0), 0),
                timestamp: new Date().toISOString()
            };
            
            stats.successRate = stats.totalOrders > 0 ? (stats.successfulOrders / stats.totalOrders * 100).toFixed(1) : 0;
            
            return stats;
        } catch (error) {
            console.error('❌ Error getting system stats:', error);
            return null;
        }
    }

    // Backup and maintenance
    async backupData() {
        if (!(await this.waitForConnection())) {
            throw new Error('Firebase not ready for backup');
        }
        
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupRef = this.db.collection('backups').doc(timestamp);
            
            const usersSnapshot = await this.db.collection('users').get();
            const ordersSnapshot = await this.db.collection('orders').get();
            const settingsSnapshot = await this.db.collection('settings').get();
            
            const backupData = {
                timestamp: this.admin.firestore.FieldValue.serverTimestamp(),
                users: usersSnapshot.docs.map(doc => doc.data()),
                orders: ordersSnapshot.docs.map(doc => doc.data()),
                settings: settingsSnapshot.docs.map(doc => doc.data()),
                totalUsers: usersSnapshot.size,
                totalOrders: ordersSnapshot.size,
                backupId: timestamp
            };
            
            await backupRef.set(backupData);
            console.log(`💾 Backup created: ${timestamp}`);
            return { success: true, backupId: timestamp };
        } catch (error) {
            console.error('❌ Backup failed:', error);
            throw new Error(`Backup failed: ${error.message}`);
        }
    }

    // Get connection info
    getConnectionInfo() {
        const status = firebaseManager.getConnectionStatus();
        return {
            ...status,
            dbInitialized: !!this.db,
            adminInitialized: !!this.admin,
            collections: this.db ? 'Available' : 'None'
        };
    }
}

module.exports = new FirebaseDB();
