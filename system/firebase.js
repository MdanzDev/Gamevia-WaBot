const admin = require('firebase-admin');
const fs = require('fs-extra');
const chalk = require('chalk');
const fetch = require('node-fetch');
const path = require('path');
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
            
            // Check if service account file exists
            if (!fs.existsSync('./firebase-key.json')) {
                console.log(chalk.red('❌ firebase-key.json not found!'));
                return;
            }

            const serviceAccount = require('./firebase-key.json');
            
            // Validate service account
            if (!serviceAccount.project_id || !serviceAccount.private_key || !serviceAccount.client_email) {
                console.log(chalk.red('❌ Invalid firebase-key.json structure'));
                return;
            }

            console.log(chalk.green(`📁 Project: ${serviceAccount.project_id}`));
            console.log(chalk.green(`📧 Client: ${serviceAccount.client_email}`));

            // Check if already initialized
            if (admin.apps.length === 0) {
                console.log(chalk.blue('📦 Creating new Firebase app instance...'));
                admin.initializeApp({
                    credential: admin.credential.cert(serviceAccount),
                    databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`
                });
            }

            this.db = admin.firestore();
            
            // Test connection
            this.testConnection().then(result => {
                if (result.success) {
                    this.isConnected = true;
                    console.log(chalk.green('🎉 Firebase connected successfully!'));
                } else {
                    console.log(chalk.yellow('⚠️ Firebase connected but test failed'));
                }
            }).catch(error => {
                console.log(chalk.red('❌ Firebase connection test error:'), error.message);
            });
            
        } catch (error) {
            console.log(chalk.red('❌ Firebase initialization failed:'), error.message);
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
