const admin = require('firebase-admin');
const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');

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
            console.log(chalk.blue('🔥 Initializing Firebase...'));
            
            // Your exact file location
            const firebaseKeyPath = './firebase-key.json';
            console.log(chalk.blue(`📁 Looking for: ${firebaseKeyPath}`));
            console.log(chalk.blue(`📁 Current directory: ${process.cwd()}`));
            
            if (!fs.existsSync(firebaseKeyPath)) {
                console.log(chalk.red('❌ firebase-key.json not found!'));
                console.log(chalk.yellow('📋 Files in current directory:'));
                
                try {
                    const files = fs.readdirSync('.');
                    const jsonFiles = files.filter(f => f.endsWith('.json'));
                    console.log(chalk.yellow('JSON files:'), jsonFiles);
                    console.log(chalk.yellow('All files:'), files.slice(0, 10));
                } catch (e) {
                    console.log(chalk.red('Cannot read directory:', e.message));
                }
                return;
            }

            console.log(chalk.green('✅ firebase-key.json found!'));
            
            let serviceAccount;
            try {
                serviceAccount = require(firebaseKeyPath);
                console.log(chalk.green('✅ firebase-key.json loaded successfully'));
            } catch (parseError) {
                console.log(chalk.red('❌ Error parsing firebase-key.json:'), parseError.message);
                return;
            }

            // Validate service account
            if (!serviceAccount.project_id) {
                console.log(chalk.red('❌ Missing project_id in firebase-key.json'));
                return;
            }
            if (!serviceAccount.private_key) {
                console.log(chalk.red('❌ Missing private_key in firebase-key.json'));
                return;
            }
            if (!serviceAccount.client_email) {
                console.log(chalk.red('❌ Missing client_email in firebase-key.json'));
                return;
            }

            console.log(chalk.green(`📁 Project: ${serviceAccount.project_id}`));
            console.log(chalk.green(`📧 Client: ${serviceAccount.client_email}`));

            // Fix private key format if needed
            if (serviceAccount.private_key && !serviceAccount.private_key.includes('BEGIN PRIVATE KEY')) {
                console.log(chalk.yellow('⚠️ Private key format might be incorrect'));
            }

            // Check if already initialized
            if (admin.apps.length === 0) {
                console.log(chalk.blue('📦 Creating new Firebase app instance...'));
                try {
                    admin.initializeApp({
                        credential: admin.credential.cert(serviceAccount),
                        databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`
                    });
                    console.log(chalk.green('✅ Firebase app initialized'));
                } catch (initError) {
                    console.log(chalk.red('❌ Firebase app initialization failed:'), initError.message);
                    return;
                }
            }

            this.db = admin.firestore();
            console.log(chalk.green('✅ Firestore database instance created'));
            
            // Test connection
            setTimeout(async () => {
                const result = await this.testConnection();
                if (result.success) {
                    this.isConnected = true;
                    console.log(chalk.green('🎉 Firebase connected successfully!'));
                    console.log(chalk.blue(`📁 Available collections: ${result.collections?.join(', ') || 'None'}`));
                } else {
                    console.log(chalk.yellow('⚠️ Firebase connection test failed:'), result.error);
                }
            }, 1000);
            
        } catch (error) {
            console.log(chalk.red('❌ Firebase initialization failed:'), error.message);
            console.log(chalk.red('Stack:'), error.stack);
            this.handleConnectionError(error);
        }
    }

    async testConnection() {
        if (!this.db) {
            return { success: false, error: 'Database not initialized' };
        }
        
        try {
            // Simple test - list collections
            const collections = await this.db.listCollections();
            return {
                success: true,
                collections: collections.map(col => col.id),
                message: 'Firestore is connected and working'
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                code: error.code
            };
        }
    }

    handleConnectionError(error) {
        this.connectionAttempts++;
        console.log(chalk.yellow(`🔄 Connection attempt ${this.connectionAttempts}/${this.maxRetries}`));
        
        if (this.connectionAttempts < this.maxRetries) {
            setTimeout(() => this.init(), 3000);
        }
    }

    getDB() {
        if (!this.db) {
            throw new Error('Firebase not initialized');
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
            timestamp: new Date().toISOString()
        };
    }

    async reconnect() {
        console.log(chalk.blue('🔄 Reconnecting to Firebase...'));
        this.connectionAttempts = 0;
        this.init();
        await new Promise(resolve => setTimeout(resolve, 3000));
        return this.testConnection();
    }
}

module.exports = new FirebaseManager();
