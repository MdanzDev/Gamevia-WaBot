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

            // FIX: Only fix escaped newlines, don't reformat the entire key
            console.log(chalk.blue('🔧 Checking private key format...'));
            serviceAccount.private_key = this.safeFormatPrivateKey(serviceAccount.private_key);
            
            // Log private key info for debugging
            const pk = serviceAccount.private_key;
            console.log(chalk.blue(`🔑 Private key length: ${pk.length} chars`));
            console.log(chalk.blue(`🔑 Has BEGIN: ${pk.includes('BEGIN PRIVATE KEY')}`));
            console.log(chalk.blue(`🔑 Has END: ${pk.includes('END PRIVATE KEY')}`));
            console.log(chalk.blue(`🔑 Line count: ${pk.split('\n').length}`));

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
                    console.log(chalk.yellow('💡 Tip: The private key format might be incorrect.'));
                    return;
                }
            }

            this.db = admin.firestore();
            console.log(chalk.green('✅ Firestore database instance created'));
            
            // Test connection
            setTimeout(async () => {
                await this.testConnectionWithRetry();
            }, 2000);
            
        } catch (error) {
            console.log(chalk.red('❌ Firebase initialization failed:'), error.message);
            this.handleConnectionError(error);
        }
    }

    safeFormatPrivateKey(privateKey) {
        if (!privateKey) return privateKey;
        
        console.log(chalk.blue('🔄 Original key format check...'));
        
        // If the key already has proper PEM format, just fix escaped newlines
        if (privateKey.includes('BEGIN PRIVATE KEY') && privateKey.includes('END PRIVATE KEY')) {
            console.log(chalk.green('✅ Key already has proper PEM format'));
            
            // Only replace escaped newlines, preserve everything else
            const fixedKey = privateKey.replace(/\\n/g, '\n');
            
            // Verify the key looks correct
            const lines = fixedKey.split('\n');
            console.log(chalk.blue(`📊 Key has ${lines.length} lines after processing`));
            
            return fixedKey;
        }
        
        // If key doesn't have proper format, try to fix it
        console.log(chalk.yellow('⚠️ Key missing proper PEM headers, attempting to fix...'));
        let formattedKey = privateKey.replace(/\\n/g, '\n').trim();
        
        // Add headers if missing
        if (!formattedKey.startsWith('-----BEGIN PRIVATE KEY-----')) {
            formattedKey = '-----BEGIN PRIVATE KEY-----\n' + formattedKey;
        }
        if (!formattedKey.endsWith('-----END PRIVATE KEY-----')) {
            formattedKey = formattedKey + '\n-----END PRIVATE KEY-----';
        }
        
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
                if (result.error.includes('UNAUTHENTICATED') || result.error.includes('Failed to parse private key')) {
                    console.log(chalk.red('🔑 Authentication issue detected. Check your private key format.'));
                    break;
                }
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
                code: error.code
            };
        }
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
}

module.exports = new FirebaseManager();
