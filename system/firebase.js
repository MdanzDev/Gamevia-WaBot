const admin = require('firebase-admin');

class FirebaseManager {
    constructor() {
        this.db = null;
        this.init();
    }

    init() {
        try {
            const serviceAccount = require('./firebase-key.json');
            
            // Check if already initialized
            if (admin.apps.length === 0) {
                admin.initializeApp({
                    credential: admin.credential.cert(serviceAccount),
                    databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`
                });
            }

            this.db = admin.firestore();
            
            // Configure Firestore settings
            this.db.settings({
                ignoreUndefinedProperties: true
            });
            
            console.log('✅ Firebase connected successfully!');
            console.log(`📁 Project: ${serviceAccount.project_id}`);
            
        } catch (error) {
            console.log('❌ Firebase setup failed:', error.message);
            this.db = null;
        }
    }

    getDB() {
        return this.db;
    }

    // Test connection
    async testConnection() {
        if (!this.db) return { success: false, error: 'No database connection' };
        
        try {
            // Simple test - get the pricing document
            const doc = await this.db.collection('settings').doc('pricing').get();
            return { 
                success: true, 
                exists: doc.exists,
                data: doc.exists ? doc.data() : null
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

module.exports = new FirebaseManager();
