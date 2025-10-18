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
            
            // Try different possible file locations
            const possiblePaths = [
                './firebase-key.json',
                './system/firebase-key.json', 
                '../firebase-key.json',
                'firebase-key.json',
                path.join(__dirname, 'firebase-key.json'),
                path.join(__dirname, '../firebase-key.json'),
                path.join(__dirname, '../../firebase-key.json')
            ];

            let serviceAccountPath = null;
            let serviceAccount = null;

            // Find the file
            for (const filePath of possiblePaths) {
                if (fs.existsSync(filePath)) {
                    serviceAccountPath = filePath;
                    console.log(chalk.green(`📁 Found firebase-key.json at: ${filePath}`));
                    break;
                }
            }

            if (!serviceAccountPath) {
                console.log(chalk.red('❌ firebase-key.json not found in any common locations!'));
                console.log(chalk.yellow('🔍 Searching for JSON files...'));
                
                // List all JSON files to help debug
                const jsonFiles = this.findJSONFiles();
                if (jsonFiles.length > 0) {
                    console.log(chalk.yellow('📄 Found JSON files:'), jsonFiles);
                }
                
                return;
            }

            try {
                serviceAccount = require(serviceAccountPath);
                console.log(chalk.green('✅ firebase-key.json loaded successfully'));
            } catch (parseError) {
                console.log(chalk.red('❌ Error parsing firebase-key.json:'), parseError.message);
                return;
            }

            // Validate service account
            if (!serviceAccount.project_id || !serviceAccount.private_key || !serviceAccount.client_email) {
                console.log(chalk.red('❌ Invalid firebase-key.json structure'));
                console.log(chalk.yellow('📋 File content:'), JSON.stringify(serviceAccount, null, 2));
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

    findJSONFiles() {
        const searchPaths = ['.', './system', '../'];
        const jsonFiles = [];
        
        for (const searchPath of searchPaths) {
            try {
                if (fs.existsSync(searchPath)) {
                    const files = fs.readdirSync(searchPath);
                    const jsonFilesInPath = files.filter(file => 
                        file.endsWith('.json') && 
                        !file.includes('node_modules') &&
                        !file.includes('package-lock')
                    );
                    jsonFiles.push(...jsonFilesInPath.map(file => path.join(searchPath, file)));
                }
            } catch (error) {
                // Skip inaccessible directories
            }
        }
        
        return jsonFiles;
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

    // Method to manually set file path
    setConfigPath(filePath) {
        if (fs.existsSync(filePath)) {
            console.log(chalk.green(`📁 Using custom config path: ${filePath}`));
            this.serviceAccountPath = filePath;
            this.init();
        } else {
            console.log(chalk.red(`❌ File not found: ${filePath}`));
        }
    }
}

module.exports = new FirebaseManager();
