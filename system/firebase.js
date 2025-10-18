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
            
            // File is in the same directory as this script (system directory)
            const firebaseKeyPath = path.join(__dirname, 'firebase-key.json');
            console.log(chalk.blue(`📁 Looking for: ${firebaseKeyPath}`));
            
            if (!fs.existsSync(firebaseKeyPath)) {
                console.log(chalk.red('❌ firebase-key.json not found in system directory!'));
                return;
            }

            console.log(chalk.green('✅ firebase-key.json found in system directory!'));
            
            let serviceAccount;
            try {
                // Read and parse the file directly
                const fileContent = fs.readFileSync(firebaseKeyPath, 'utf8');
                serviceAccount = JSON.parse(fileContent);
                console.log(chalk.green('✅ firebase-key.json parsed successfully'));
            } catch (parseError) {
                console.log(chalk.red('❌ Error parsing firebase-key.json:'), parseError.message);
                return;
            }

            // Validate service account
            if (!serviceAccount.project_id || !serviceAccount.private_key || !serviceAccount.client_email) {
                console.log(chalk.red('❌ Invalid firebase-key.json structure'));
                return;
            }

            console.log(chalk.green(`📁 Project: ${serviceAccount.project_id}`));
            console.log(chalk.green(`📧 Client: ${serviceAccount.client_email}`));

            // Fix private key format
            if (serviceAccount.private_key) {
                serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
            }

            // Initialize Firebase
            if (admin.apps.length === 0) {
                console.log(chalk.blue('📦 Creating new Firebase app instance...'));
                admin.initializeApp({
                    credential: admin.credential.cert(serviceAccount),
                    databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`
                });
            }

            this.db = admin.firestore();
            console.log(chalk.green('✅ Firestore database instance created'));
            
            // Test connection
            setTimeout(async () => {
                const result = await this.testConnection();
                if (result.success) {
                    this.isConnected = true;
                    console.log(chalk.green('🎉 Firebase connected successfully!'));
                } else {
                    console.log(chalk.yellow('⚠️ Firebase connection test failed:'), result.error);
                }
            }, 2000);
            
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
}

module.exports = new FirebaseManager();
