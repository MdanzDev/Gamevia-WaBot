const { db } = require('./firebase');

class FirebaseDB {
    // User Management
    async createUser(userId, userData) {
        try {
            console.log(`📝 Creating user: ${userId}`);
            await db.collection('users').doc(userId).set({
                ...userData,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
            console.log(`✅ User created successfully: ${userId}`);
            return true;
        } catch (error) {
            console.error('❌ Error creating user:', error);
            return false;
        }
    }

    async getUser(userId) {
        try {
            console.log(`🔍 Getting user: ${userId}`);
            const doc = await db.collection('users').doc(userId).get();
            const userData = doc.exists ? doc.data() : null;
            console.log(`📊 User data:`, userData);
            return userData;
        } catch (error) {
            console.error('❌ Error getting user:', error);
            return null;
        }
    }

    async updateUser(userId, updates) {
        try {
            await db.collection('users').doc(userId).update({
                ...updates,
                updatedAt: new Date().toISOString()
            });
            return true;
        } catch (error) {
            console.error('Error updating user:', error);
            return false;
        }
    }

    // Reseller Management
    async createReseller(userId, resellerData) {
        try {
            await db.collection('resellers').doc(userId).set({
                ...resellerData,
                balance: 0,
                totalOrders: 0,
                totalSpent: 0,
                totalProfit: 0,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
            return true;
        } catch (error) {
            console.error('Error creating reseller:', error);
            return false;
        }
    }

    async getReseller(userId) {
        try {
            const doc = await db.collection('resellers').doc(userId).get();
            return doc.exists ? doc.data() : null;
        } catch (error) {
            console.error('Error getting reseller:', error);
            return null;
        }
    }

    async updateResellerBalance(userId, amount) {
        try {
            const reseller = await this.getReseller(userId);
            if (!reseller) return false;

            const newBalance = (reseller.balance || 0) + amount;
            
            await db.collection('resellers').doc(userId).update({
                balance: newBalance,
                updatedAt: new Date().toISOString()
            });
            
            return newBalance;
        } catch (error) {
            console.error('Error updating balance:', error);
            return false;
        }
    }

    // Get pricing settings
    async getPricing() {
        try {
            const doc = await db.collection('settings').doc('pricing').get();
            return doc.exists ? doc.data() : null;
        } catch (error) {
            console.error('Error getting pricing:', error);
            return null;
        }
    }

    // Check if user exists (simple version)
    async userExists(userId) {
        try {
            const doc = await db.collection('users').doc(userId).get();
            return doc.exists;
        } catch (error) {
            console.error('Error checking user:', error);
            return false;
        }
    }
}

module.exports = new FirebaseDB();
