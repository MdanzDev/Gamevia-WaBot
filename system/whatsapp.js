require('./config')
const { 
    default: baileys,
    proto,
    getContentType,
    generateWAMessage,
    generateWAMessageFromContent,
    generateWAMessageContent,
    prepareWAMessageMedia,
    downloadContentFromMessage
} = require("@whiskeysockets/baileys");
const fs = require('fs-extra');
const chalk = require('chalk');
const fetch = require('node-fetch');

const API_KEY = "API-GVCDEAD0E38EA13632";
const API_BASE_URL = "https://api.gamevia.shop/v1";

// Load or initialize data
const loadJSON = (path) => {
    try {
        return fs.existsSync(path) ? JSON.parse(fs.readFileSync(path)) : {};
    } catch (error) {
        return {};
    }
};

const saveJSON = (path, data) => {
    try {
        fs.ensureFileSync(path);
        fs.writeFileSync(path, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error saving file:', error);
    }
};

let userRegistry = loadJSON('./system/database/users.json');
let resellers = loadJSON('./system/database/resellers.json');
let orders = loadJSON('./system/database/orders.json');
let orderSessions = {};
let gamesList = {};

// Load games from API on startup
const loadGames = async () => {
    try {
        const response = await fetch(`${API_BASE_URL}/check_games.php`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": API_KEY
            }
        });
        const data = await response.json();
        if (data.success) {
            gamesList = data.games.reduce((acc, game) => {
                acc[game.slug] = game;
                return acc;
            }, {});
            console.log(chalk.green('✓ Games loaded successfully'));
        }
    } catch (error) {
        console.error(chalk.red('✗ Failed to load games:'), error);
    }
};

loadGames();

const apiCall = async (endpoint, body = null) => {
    try {
        const response = await fetch(`${API_BASE_URL}/${endpoint}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": API_KEY
            },
            body: body ? JSON.stringify(body) : undefined
        });
        return await response.json();
    } catch (error) {
        return { success: false, message: "API connection failed" };
    }
};

module.exports = rikz = async (rikz, m, chatUpdate, store) => {
    try {
        const body = (
            m.mtype === "conversation" ? m.message.conversation :
            m.mtype === "imageMessage" ? m.message.imageMessage.caption :
            m.mtype === "videoMessage" ? m.message.videoMessage.caption :
            m.mtype === "extendedTextMessage" ? m.message.extendedTextMessage.text :
            m.mtype === "buttonsResponseMessage" ? m.message.buttonsResponseMessage.selectedButtonId :
            m.mtype === "listResponseMessage" ? m.message.listResponseMessage.singleSelectReply.selectedRowId :
            m.mtype === "interactiveResponseMessage" ? JSON.parse(m.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson).id :
            m.mtype === "templateButtonReplyMessage" ? m.message.templateButtonReplyMessage.selectedId :
            m.text || ""
        );

        if (m.message) {
            rikz.readMessages([m.key]);
            const groupName = m.chat.endsWith("@g.us") ? (await rikz.groupMetadata(m.chat).catch(() => ({}))).subject || "" : "";
            console.log("┏━━━━━━━━━━━━━━━━━━━━━━━=");
            console.log(`┃¤ ${chalk.hex("#FFD700").bold("📩 NEW MESSAGE")} ${chalk.hex("#00FFFF").bold(`[${new Date().toLocaleTimeString()}]`)} `);
            console.log(`┃¤ ${chalk.hex("#FF69B4")("💌 From:")} ${chalk.hex("#FFFFFF")(`${m.pushName} (${m.sender})`)} `);
            console.log(`┃¤ ${chalk.hex("#FFA500")("📍 In:")} ${chalk.hex("#FFFFFF")(`${groupName || "Private Chat"}`)} `);
            console.log(`┃¤ ${chalk.hex("#00FF00")("📝 Message:")} ${chalk.hex("#FFFFFF")(`${body || m?.mtype || "Unknown"}`)} `);
            console.log("┗━━━━━━━━━━━━━━━━━━━━━━━=");
        }

        const prefix = typeof body === "string" ? global.prefix.find(p => body.startsWith(p)) : "";
        const isCmd = !!prefix;
        const args = isCmd ? body.slice(prefix.length).trim().split(/ +/).slice(1) : [];
        const command = isCmd ? body.slice(prefix.length).trim().split(/ +/)[0].toLowerCase() : "";
        const text = args.join(" ");

        const botNumber = await rikz.decodeJid(rikz.user.id);
        const premuser = fs.existsSync("./system/database/premium.json") ? JSON.parse(fs.readFileSync("./system/database/premium.json")) : [];
        const isCreator = [botNumber, ...global.owner].map(v => v.replace(/[^0-9]/g, "") + "@s.whatsapp.net").includes(m.sender);

        // Reload data from files
        userRegistry = loadJSON('./system/database/users.json');
        resellers = loadJSON('./system/database/resellers.json');
        orders = loadJSON('./system/database/orders.json');

        //================ SWITCH COMMAND =================//
        switch(command) {
            case 'register':
                if(userRegistry[m.sender]) return rikz.sendMessage(m.chat, { text: "You're already registered." }, { quoted: m });
                userRegistry[m.sender] = { 
                    name: m.pushName || "User", 
                    role: "User",
                    registeredAt: new Date().toISOString()
                };
                saveJSON('./system/database/users.json', userRegistry);
                rikz.sendMessage(m.chat, { text: `✅ Registered successfully as ${userRegistry[m.sender].name}` }, { quoted: m });
                break;

            case 'menu':
                rikz.sendMessage(m.chat, {
                    text: `🎮 *GameVia Bot*\n\nHello ${m.pushName || "User"}! Welcome to our top-up service.`,
                    footer: 'Powered by GameVia API',
                    buttons: [
                        { buttonId: '.help', buttonText: { displayText: '📖 Help' }, type: 1 },
                        { buttonId: '.price', buttonText: { displayText: '💰 Prices' }, type: 1 },
                        { buttonId: '.games', buttonText: { displayText: '🎮 Games' }, type: 1 },
                        { buttonId: '.account', buttonText: { displayText: '👤 Account' }, type: 1 }
                    ],
                    headerType: 1
                }, { quoted: m });
                break;

            case 'help':
                const helpText = `*🤖 GameVia Bot Commands*

*Basic Commands:*
• .menu - Main menu
• .help - Show this help
• .register - Register your account
• .price - View game prices
• .games - List available games

*Order Commands:*
• .id <user_id> <zone_id> <product_code> - Quick order
• .history - View order history
• .account - Account information

*Reseller Commands (Owner):*
• .addreseller <id> - Add reseller
• .addbalance <id> <amount> - Add balance

*How to Order:*
1. Use .price to see available games
2. Select a game and product
3. Provide your game ID and zone ID
4. Confirm your order`;

                rikz.sendMessage(m.chat, {
                    text: helpText,
                    footer: 'Traxc Bot 4.0 - GameVia Integration',
                    buttons: [{ buttonId: '.menu', buttonText: { displayText: '🏠 Main Menu' }, type: 1 }],
                    headerType: 1
                }, { quoted: m });
                break;

            case 'price':
            case 'games':
                if(!userRegistry[m.sender]) return rikz.sendMessage(m.chat, { text: "Please register first using .register" }, { quoted: m });
                
                if (Object.keys(gamesList).length === 0) {
                    await loadGames();
                }

                const buttons = Object.values(gamesList).map(game => ({
                    buttonId: `.select-${game.slug}`,
                    buttonText: { displayText: game.name },
                    type: 1
                }));

                rikz.sendMessage(m.chat, {
                    text: "🎮 *Available Games*\nSelect a game to view products:",
                    footer: "Powered by GameVia",
                    buttons,
                    headerType: 1
                }, { quoted: m });
                break;

            case 'addreseller':
                if(!isCreator) break;
                const resellerId = args[0];
                if(!resellerId) return rikz.sendMessage(m.chat, { text: "Usage: .addreseller <reseller_id>" }, { quoted: m });
                if(!resellers[resellerId]) {
                    resellers[resellerId] = { 
                        balance: 0, 
                        history: [],
                        addedAt: new Date().toISOString()
                    };
                    saveJSON('./system/database/resellers.json', resellers);
                    rikz.sendMessage(m.chat, { text: `✅ Reseller ${resellerId} added with RM0 balance` }, { quoted: m });
                } else {
                    rikz.sendMessage(m.chat, { text: "Reseller already exists." }, { quoted: m });
                }
                break;

            case 'addbalance':
                if(!isCreator) break;
                const [resellerId2, amount] = args;
                if(!resellerId2 || !amount || isNaN(amount)) return rikz.sendMessage(m.chat, { text: "Usage: .addbalance <reseller_id> <amount>" }, { quoted: m });
                if(!resellers[resellerId2]) resellers[resellerId2] = { balance: 0, history: [] };
                resellers[resellerId2].balance += parseFloat(amount);
                resellers[resellerId2].history.push({
                    type: 'balance_added',
                    amount: parseFloat(amount),
                    timestamp: new Date().toISOString(),
                    addedBy: m.sender
                });
                saveJSON('./system/database/resellers.json', resellers);
                rikz.sendMessage(m.chat, { text: `✅ Added RM${amount} to ${resellerId2}. Total: RM${resellers[resellerId2].balance}` }, { quoted: m });
                break;

            case 'history':
                let historyText = "";
                if(resellers[m.sender]){
                    let hist = resellers[m.sender].history || [];
                    historyText = hist.length ? 
                        hist.map(o => `• ${o.id || o.type} | ${o.amount || ''} | ${o.status || 'Completed'}`).join("\n") 
                        : "No order history yet.";
                    historyText = `📜 *Reseller Order History*\n\n${historyText}`;
                } else {
                    let userHist = orders[m.sender] || [];
                    if(!userHist.length) return rikz.sendMessage(m.chat, { text: "No orders yet." }, { quoted: m });
                    historyText = userHist.map(o => 
                        `• ${o.id} | ${o.product} | RM${o.price} | ${o.status}`
                    ).join("\n");
                    historyText = `📜 *Your Order History*\n\n${historyText}`;
                }
                rikz.sendMessage(m.chat, { text: historyText }, { quoted: m });
                break;

            case 'account':
                const accountInfo = await apiCall('check_account.php');
                if(accountInfo.success) {
                    const account = accountInfo.account;
                    const accountText = `👤 *Account Information*\n
📧 *Username:* ${account.username}
📞 *Phone:* ${account.phone}
💰 *Balance:* RM${account.balance}
🎯 *Role:* ${account.role}
✅ *KYC Status:* ${account.kyc_status}
📅 *Joined:* ${account.joined_date}`;
                    rikz.sendMessage(m.chat, { text: accountText }, { quoted: m });
                } else {
                    rikz.sendMessage(m.chat, { text: "❌ Failed to fetch account information" }, { quoted: m });
                }
                break;

            default:
                // Handle dynamic commands outside switch
                break;
        }

        // ==================== DYNAMIC COMMANDS ====================
        if(command.startsWith('select-')) {
            const slug = command.replace('select-', '');
            if(!gamesList[slug]) return;
            
            try {
                const data = await apiCall('get_products.php', { slug });
                if(!data.success || !data.products?.length) return rikz.sendMessage(m.chat, { text: "No products available for this game." }, { quoted: m });

                const productButtons = data.products.map(product => {
                    const profitPrice = (product.vprice * 1.02).toFixed(2);
                    return {
                        buttonId: `.order-${slug}-${product.srv_code}`,
                        buttonText: { displayText: `${product.name} - RM${profitPrice}` },
                        type: 1
                    };
                });

                // Add back button
                productButtons.push({
                    buttonId: '.price',
                    buttonText: { displayText: '⬅️ Back' },
                    type: 1
                });

                rikz.sendMessage(m.chat, {
                    text: `🎮 *${data.game_name} Products*\n*Prices include 2% service fee*`,
                    footer: 'Select a product to order',
                    buttons: productButtons,
                    headerType: 1
                }, { quoted: m });
            } catch(err){
                console.log(err);
                rikz.sendMessage(m.chat, { text: "Failed to fetch products." }, { quoted: m });
            }
        }

        else if(command.startsWith('order-')) {
            const [_, slug, srvCode] = command.split('-');
            if(!gamesList[slug]) return;
            
            orderSessions[m.sender] = { 
                step: "awaiting_ids", 
                gameSlug: slug, 
                productCode: srvCode,
                timestamp: Date.now()
            };
            
            const gameName = gamesList[slug]?.name || slug;
            rikz.sendMessage(m.chat, { 
                text: `📝 *Order Setup for ${gameName}*\n\nPlease provide your:\n*USER_ID* and *ZONE_ID*\n\nFormat: user_id zone_id\nExample: 12345 1` 
            }, { quoted: m });
        }

        else if(command === 'id') {
            if(args.length < 3) return rikz.sendMessage(m.chat, { 
                text: "❌ *Incorrect Format*\n\nUsage: .id USER_ID ZONE_ID PRODUCT_CODE\nExample: .id 12345 1 ML12" 
            }, { quoted: m });
            
            const [userId, zoneId, productCode] = args;
            orderSessions[m.sender] = { 
                step: "awaiting_confirmation", 
                gameSlug: "mlbb", // Default to MLBB for quick orders
                productCode: productCode, 
                orderData: { user_id: userId, zone_id: zoneId },
                timestamp: Date.now()
            };
            
            // Show confirmation
            const confirmationText = `✅ *Order Information Received*\n
🎮 *Game:* Mobile Legends
📦 *Product:* ${productCode}
👤 *USER_ID:* ${userId}
📍 *ZONE_ID:* ${zoneId}\n
Please confirm your order:`;

            rikz.sendMessage(m.chat, {
                text: confirmationText,
                footer: "Check the information above before confirming",
                buttons: [
                    { buttonId: '.confirm', buttonText: { displayText: '✅ Confirm Order' }, type: 1 },
                    { buttonId: '.change', buttonText: { displayText: '✏️ Change Info' }, type: 1 }
                ],
                headerType: 1
            }, { quoted: m });
        }

        else if(command === 'confirm') {
            const session = orderSessions[m.sender];
            if(!session || session.step !== "awaiting_confirmation") return;
            
            try {
                const orderData = {
                    srv_code: session.productCode,
                    user_id: session.orderData.user_id,
                    zone_id: session.orderData.zone_id
                };

                const result = await apiCall('order.php', orderData);

                if(result.success) {
                    const orderId = result.custom_order_id;
                    
                    // Save order
                    if(!orders[m.sender]) orders[m.sender] = [];
                    orders[m.sender].push({
                        id: orderId,
                        gameSlug: session.gameSlug,
                        product: session.productCode,
                        ...session.orderData,
                        price: result.amount,
                        status: result.status,
                        timestamp: new Date().toISOString(),
                        description: result.description
                    });
                    saveJSON('./system/database/orders.json', orders);

                    const successText = `🎉 *Order Successful!*\n
📦 *Order ID:* ${orderId}
🎮 *Game:* ${gamesList[session.gameSlug]?.name || session.gameSlug}
💎 *Product:* ${session.productCode}
👤 *USER_ID:* ${session.orderData.user_id}
💰 *Amount:* RM${result.amount}
📊 *Status:* ${result.status}\n
Thank you for your order!`;

                    rikz.sendMessage(m.chat, { text: successText }, { quoted: m });
                } else {
                    rikz.sendMessage(m.chat, { 
                        text: `❌ *Order Failed*\n\nReason: ${result.message || "Unknown error"}` 
                    }, { quoted: m });
                }
            } catch(error) {
                rikz.sendMessage(m.chat, { 
                    text: "❌ *Order Failed*\n\nThere was an error processing your order. Please try again." 
                }, { quoted: m });
            }

            delete orderSessions[m.sender];
        }

        else if(command === 'change') {
            const session = orderSessions[m.sender];
            if(!session || session.step !== "awaiting_confirmation") return;
            session.step = "awaiting_ids";
            rikz.sendMessage(m.chat, { 
                text: "🔄 *Change Order Information*\n\nPlease provide your new USER_ID and ZONE_ID:\nFormat: user_id zone_id" 
            }, { quoted: m });
        }

      else if(orderSessions[m.sender]?.step === 'awaiting_ids') {
    const session = orderSessions[m.sender];
    
    // DEBUG: Log the session and received data
    console.log('DEBUG - Session:', session);
    console.log('DEBUG - Body:', body);
    console.log('DEBUG - Args:', args);
    console.log('DEBUG - Raw input:', body.trim());
    
    // Parse the input directly from body instead of relying on args
    const inputParts = body.trim().split(/ +/);
    console.log('DEBUG - Input parts:', inputParts);
    
    if(inputParts.length < 2) {
        return rikz.sendMessage(m.chat, { 
            text: "❌ *Incomplete Information*\n\nPlease provide both USER_ID and ZONE_ID\nFormat: user_id zone_id\n\nExample: 123456789 1234" 
        }, { quoted: m });
    }

    const userId = inputParts[0];
    const zoneId = inputParts[1];
    
    // Validate that they are numbers
    if (!userId || !zoneId || isNaN(userId) || isNaN(zoneId)) {
        return rikz.sendMessage(m.chat, { 
            text: "❌ *Invalid Format*\n\nUSER_ID and ZONE_ID must be numbers\n\nExample: 123456789 1234" 
        }, { quoted: m });
    }

    session.step = "awaiting_confirmation";
    session.orderData = { 
        user_id: userId.trim(), 
        zone_id: zoneId.trim() 
    };
    
    // Generate a temporary order ID for tracking
    session.orderId = `TEMP-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

    // Show confirmation
    const gameName = gamesList[session.gameSlug]?.name || session.gameSlug;
    const confirmationText = `✅ *Order Information Received*\n
🎮 *Game:* ${gameName}
📦 *Product:* ${session.productCode}
👤 *USER_ID:* ${userId}
📍 *ZONE_ID:* ${zoneId}\n
Please confirm your order:`;

    await rikz.sendMessage(m.chat, {
        text: confirmationText,
        footer: "Check the information above before confirming",
        buttons: [
            { buttonId: 'confirm', buttonText: { displayText: '✅ Confirm Order' }, type: 1 },
            { buttonId: 'change', buttonText: { displayText: '✏️ Change Info' }, type: 1 }
        ],
        headerType: 1
    }, { quoted: m });
    
    console.log('DEBUG - Session updated:', orderSessions[m.sender]);
}

    } catch(err) {
        console.log('\x1b[1;31m' + err + '\x1b[0m');
    }
}
