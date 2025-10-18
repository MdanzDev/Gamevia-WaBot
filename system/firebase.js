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

            // FIX: Properly format the private key
            console.log(chalk.blue('🔧 Formatting private key...'));
            serviceAccount.private_key = this.formatPrivateKey(serviceAccount.private_key);
            
            // Log private key info (first/last chars for debugging)
            const pk = serviceAccount.private_key;
            console.log(chalk.blue(`🔑 Private key: ${pk.length} chars`));
            console.log(chalk.blue(`🔑 Starts with: ${pk.substring(0, 30)}...`));
            console.log(chalk.blue(`🔑 Ends with: ...${pk.substring(pk.length - 30)}`));

            // Initialize Firebase
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
            
            // Test connection with better error handling
            setTimeout(async () => {
                await this.testConnectionWithRetry();
            }, 2000);
            
        } catch (error) {
            console.log(chalk.red('❌ Firebase initialization failed:'), error.message);
            this.handleConnectionError(error);
        }
    }

    formatPrivateKey(privateKey) {
        if (!privateKey) return privateKey;
        
        // Remove any existing formatting and ensure proper PEM format
        let formattedKey = privateKey
            .replace(/\\n/g, '\n')  // Replace escaped newlines
            .replace(/"/g, '')      // Remove quotes if present
            .trim();
        
        // Ensure it has proper BEGIN/END headers
        if (!formattedKey.includes('BEGIN PRIVATE KEY')) {
            formattedKey = '-----BEGIN PRIVATE KEY-----\n' + formattedKey;
        }
        if (!formattedKey.includes('END PRIVATE KEY')) {
            formattedKey = formattedKey + '\n-----END PRIVATE KEY-----';
        }
        
        // Ensure proper line breaks (64 chars per line for PEM format)
        formattedKey = formattedKey.replace(/(.{64})/g, '$1\n');
        
        return formattedKey;
    }

    async testConnectionWithRetry() {
        console.log(chalk.blue('🔗 Testing Firebase connection...'));
        
        for (let i = 0; i < 3; i++) {
            const result = await this.testConnection();
            if (result.success) {
                this.isConnected = true;
                console.log(chalk.green('🎉 Firebase connected successfully!'));
                console.log(chalk.blue(`📁 Available collections: ${result.collections?.join(', ') || 'None'}`));
                return;
            } else {
                console.log(chalk.yellow(`⚠️ Connection test ${i + 1}/3 failed: ${result.error}`));
                if (i < 2) {
                    console.log(chalk.blue('🔄 Retrying in 3 seconds...'));
                    await new Promise(resolve => setTimeout(resolve, 3000));
                }
            }
        }
        
        console.log(chalk.red('💥 All connection attempts failed'));
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
                code: error.code,
                details: this.getErrorDetails(error)
            };
        }
    }

    getErrorDetails(error) {
        if (error.code === 16) { // UNAUTHENTICATED
            return 'Authentication failed. Check your service account credentials and ensure the key is properly formatted.';
        } else if (error.code === 7) { // PERMISSION_DENIED
            return 'Permission denied. Ensure your service account has proper Firestore permissions.';
        } else if (error.code === 13) { // INTERNAL
            return 'Internal Firebase error. Try again later.';
        }
        return 'Unknown error. Check your Firebase configuration.';
    }

    handleConnectionError(error) {
        this.connectionAttempts++;
        console.log(chalk.yellow(`🔄 Connection attempt ${this.connectionAttempts}/${this.maxRetries}`));
        
        if (this.connectionAttempts < this.maxRetries) {
            setTimeout(() => this.init(), 5000);
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
