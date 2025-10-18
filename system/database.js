const { db } = require('./firebase');

class FirebaseDB {
    // User Management
    async createUser(userId, userData) {
        try {
            await db.collection('users').doc(userId).set({
                ...userData,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
            console.log('✅ User created:', userId);
            return true;
        } catch (error) {
            console.error('Error creating user:', error);
            return false;
        }
    }

    async getUser(userId) {
        try {
            const doc = await db.collection('users').doc(userId).get();
            console.log('📖 Getting user:', userId, 'Exists:', doc.exists);
            return doc.exists ? doc.data() : null;
        } catch (error) {
            console.error('Error getting user:', error);
            return null;
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
            console.log('✅ Reseller created:', userId);
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
            
            console.log('💰 Balance updated:', userId, 'New balance:', newBalance);
            return newBalance;
        } catch (error) {
            console.error('Error updating balance:', error);
            return false;
        }
    }

    // Get pricing settings - FIXED VERSION
    async getPricing() {
        try {
            const doc = await db.collection('settings').doc('pricing').get();
            
            // If pricing doesn't exist, create it
            if (!doc.exists) {
                console.log('📊 Creating default pricing...');
                const defaultPricing = {
                    regular_markup: 20,
                    reseller_markup: 8,
                    registration_fee: 5,
                    min_topup: 1,
                    createdAt: new Date().toISOString()
                };
                
                await db.collection('settings').doc('pricing').set(defaultPricing);
                return defaultPricing;
            }
            
            console.log('📊 Pricing found:', doc.data());
            return doc.data();
        } catch (error) {
            console.error('Error getting pricing:', error);
            // Return defaults if error
            return {
                regular_markup: 20,
                reseller_markup: 8,
                registration_fee: 5,
                min_topup: 1
            };
        }
    }

    // Create settings if missing
    async ensureSettings() {
        try {
            const pricing = await this.getPricing();
            console.log('✅ Settings ensured');
            return pricing;
        } catch (error) {
            console.error('Error ensuring settings:', error);
            return null;
        }
    }
}

module.exports = new FirebaseDB();
