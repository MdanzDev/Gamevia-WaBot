const firebaseManager = require('./firebase');

class FirebaseDB {
    constructor() {
        this.db = firebaseManager.getDB();
    }

    // Check if Firebase is ready
    isReady() {
        return this.db !== null;
    }

    // User Management
    async createUser(userId, userData) {
        if (!this.isReady()) return false;
        
        try {
            await this.db.collection('users').doc(userId).set({
                ...userData,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            return true;
        } catch (error) {
            console.error('Error creating user:', error.message);
            return false;
        }
    }

    async getUser(userId) {
        if (!this.isReady()) return null;
        
        try {
            const doc = await this.db.collection('users').doc(userId).get();
            return doc.exists ? doc.data() : null;
        } catch (error) {
            console.error('Error getting user:', error.message);
            return null;
        }
    }

    // Get pricing settings
    async getPricing() {
        if (!this.isReady()) return null;
        
        try {
            const doc = await this.db.collection('settings').doc('pricing').get();
            return doc.exists ? doc.data() : null;
        } catch (error) {
            console.error('Error getting pricing:', error.message);
            return null;
        }
    }
}

module.exports = new FirebaseDB();
