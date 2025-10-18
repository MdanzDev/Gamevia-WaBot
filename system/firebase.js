const admin = require('firebase-admin');

class FirebaseManager {
    constructor() {
        this.db = null;
        this.admin = admin;
        this.isConnected = false;
        this.connectionAttempts = 0;
        this.maxRetries = 3;
        this.init();
    }

    init() {
        try {
            console.log('🔥 Initializing Firebase...');
            
            const serviceAccount = require('./firebase-key.json');
            
            // Check if already initialized
            if (admin.apps.length === 0) {
                console.log('📦 Creating new Firebase app instance...');
                admin.initializeApp({
                    credential: admin.credential.cert(serviceAccount),
                    databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`,
                    projectId: serviceAccount.project_id
                });
            } else {
                console.log('🔄 Using existing Firebase app instance...');
            }

            this.db = admin.firestore();
            
            // Enhanced Firestore settings
            this.db.settings({
                ignoreUndefinedProperties: true,
                timeout: 30000,
                maxIdleChannels: 5
            });

            // Test connection immediately
            this.testConnection(true).then(result => {
                if (result.success) {
                    this.isConnected = true;
                    this.connectionAttempts = 0;
                    console.log('🎉 Firebase fully initialized and connected!');
                    console.log(`📊 Project: ${serviceAccount.project_id}`);
                    console.log(`📧 Client: ${serviceAccount.client_email}`);
                } else {
                    console.log('⚠️ Firebase initialized but connection test failed');
                }
            });
            
        } catch (error) {
            console.log('❌ Firebase initialization failed:', error.message);
            this.handleConnectionError(error);
        }
    }

    async testConnection(verbose = false) {
        if (!this.db) {
            return { success: false, error: 'Database not initialized' };
        }
        
        try {
            if (verbose) console.log('🔍 Testing Firestore connection...');
            
            // Test 1: List collections
            const collections = await this.db.listCollections();
            if (verbose) console.log(`📁 Available collections: ${collections.map(c => c.id).join(', ') || 'None'}`);
            
            // Test 2: Create and read a test document
            const testRef = this.db.collection('connection_tests').doc('latest');
            const testData = {
                timestamp: this.admin.firestore.FieldValue.serverTimestamp(),
                message: 'Connection test from GameVia Bot',
                status: 'success'
            };
            
            await testRef.set(testData);
            if (verbose) console.log('✅ Test document written');
            
            const doc = await testRef.get();
            if (verbose) console.log('✅ Test document read back');
            
            // Clean up test document
            await testRef.delete();
            if (verbose) console.log('✅ Test document cleaned up');
            
            this.isConnected = true;
            return {
                success: true,
                collections: collections.map(col => col.id),
                testedAt: new Date().toISOString(),
                message: 'Firestore is fully operational'
            };
            
        } catch (error) {
            this.isConnected = false;
            console.error('🔴 Connection test failed:', error.message);
            return {
                success: false,
                error: error.message,
                code: error.code,
                testedAt: new Date().toISOString()
            };
        }
    }

    handleConnectionError(error) {
        this.connectionAttempts++;
        console.error(`🔥 Connection error (attempt ${this.connectionAttempts}):`, error.message);
        
        if (this.connectionAttempts < this.maxRetries) {
            console.log(`🔄 Retrying connection in 5 seconds...`);
            setTimeout(() => {
                this.init();
            }, 5000);
        } else {
            console.error('💥 Max connection attempts reached. Firebase is unavailable.');
            this.db = null;
            this.isConnected = false;
        }
    }

    getDB() {
        if (!this.db) {
            throw new Error('Firebase database not available. Please check connection.');
        }
        return this.db;
    }

    getAdmin() {
        return this.admin;
    }

    getConnectionStatus() {
        return {
            isConnected: this.isConnected,
            connectionAttempts: this.connectionAttempts,
            maxRetries: this.maxRetries,
            timestamp: new Date().toISOString()
        };
    }

    // Reconnect method
    async reconnect() {
        console.log('🔄 Attempting Firebase reconnection...');
        this.connectionAttempts = 0;
        this.init();
        
        // Wait for connection
        await new Promise(resolve => setTimeout(resolve, 3000));
        return this.testConnection();
    }
}

module.exports = new FirebaseManager();
