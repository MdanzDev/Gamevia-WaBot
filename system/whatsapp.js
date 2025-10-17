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

        const pathUsers = './system/database/users.json';
        const pathResellers = './system/database/resellers.json';

        let userRegistry = fs.existsSync(pathUsers) ? JSON.parse(fs.readFileSync(pathUsers)) : {};
        let resellers = fs.existsSync(pathResellers) ? JSON.parse(fs.readFileSync(pathResellers)) : {};
        let orderSessions = {};
        let orders = {}; // orders per user { sender: [ {id, slug, srv_code, user_id, zone_id, price, status} ] }
        let lastSelectedProduct = {}; // { sender: product_code }

        const gamesInfo = {
            mlbb: { name: "Mobile Legends Malaysia", required: ["user_id", "zone_id"] },
            mlbbbrazil: { name: "Mobile Legends Brazil", required: ["user_id", "zone_id"] },
            mlbbgb: { name: "Mobile Legends Global", required: ["user_id", "zone_id"] },
            // Add more games as needed
        };



        //================ SWITCH COMMAND =================//
        switch (true) {
            case command === 'register':
                if(userRegistry[m.sender]) return rikz.sendMessage(m.chat, { text: "You're already registered." }, { quoted: m });
                userRegistry[m.sender] = { name: m.pushName || "User", role: "User" };
                fs.writeFileSync(pathUsers, JSON.stringify(userRegistry, null, 2));
                rikz.sendMessage(m.chat, { text: `Registered successfully as ${userRegistry[m.sender].name}` }, { quoted: m });
            break;

            


            case command === 'menu':
                rikz.sendMessage(m.chat, {
                    text: `Hello ${m.pushName || "User"}! Choose an option:`,
                    footer: 'Powered by GameVia',
                    buttons: [
                        { buttonId: '.help', buttonText: { displayText: 'Help' }, type: 1 },
                        { buttonId: '.price', buttonText: { displayText: 'Top-Up Prices' }, type: 1 }
                    ],
                    headerType: 1
                }, { quoted: m });
            break;

            case command === 'help':
                rikz.sendMessage(m.chat, {
                    text: "Commands:\n• menu\n• help\n• price\n• register\n• addreseller (owner)\n• addbalance (owner)\n• history (reseller)",
                    footer: 'Traxc Bot 4.0',
                    buttons: [{ buttonId: '.menu', buttonText: { displayText: 'Main Menu' }, type: 1 }],
                    headerType: 1
                }, { quoted: m });
            break;

            case command === 'price':
                if(!userRegistry[m.sender]) return rikz.sendMessage(m.chat, { text: "Please register first using register" }, { quoted: m });
                let buttons = [];
                for(let slug in gamesInfo){
                    buttons.push({ buttonId: `.select-${slug}`, buttonText: { displayText: gamesInfo[slug].name }, type: 1 });
                }
                rikz.sendMessage(m.chat, { text: "Select a game to view prices:", footer: "Powered by GameVia", buttons, headerType: 1 }, { quoted: m });
            break;

            // Select game products
            //==================== ORDER FLOW ====================//

// 1️⃣ Show products when a game is selected
case command.startsWith('select-') && command:
{
    const slug = command.replace('select-', '');
    if(!gamesInfo[slug]) break;

    try {
        const res = await fetch("https://api.gamevia.shop/v1/get_products.php", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
            body: JSON.stringify({ slug })
        });
        const data = await res.json();
        if(!data.success || !data.products?.length) return rikz.sendMessage(m.chat, { text: "No products found." }, { quoted: m });

        const productButtons = data.products.map(p => {
            const profitPrice = (p.price * 1.02).toFixed(2);
            return { buttonId: `order-${slug}-${p.srv_code}`, buttonText: { displayText: `${p.name} - RM${profitPrice}` }, type: 1 };
        });

        rikz.sendMessage(m.chat, {
            text: `🎮 ${gamesInfo[slug].name} Products (2% profit included)`,
            footer: 'Select a product to order',
            buttons: productButtons,
            headerType: 1
        }, { quoted: m });

    } catch(err){
        console.log(err);
        rikz.sendMessage(m.chat, { text: "Failed to fetch products." }, { quoted: m });
    }
}
break;

// 2️⃣ When product is clicked
case command.startsWith('order-') && command:
{
    const [slug, srvCode] = command.replace('order-', '').split('-');
    if(!gamesInfo[slug]) break;

    orderSessions[m.sender] = {
        step: "awaiting_ids",
        gameSlug: slug,
        product: srvCode
    };

    rikz.sendMessage(m.chat, { text: "Please provide USER_ID and ZONE_ID separated by space (e.g., 12345 1):" }, { quoted: m });
}
break;

// 3️⃣ Manual .id command shortcut
case command === 'id':
{
    if(args.length < 3) return rikz.sendMessage(m.chat, { text: "Provide USER_ID ZONE_ID SRV_CODE" }, { quoted: m });
    const [userId, zoneId, srvCode] = args;

    // Optionally: verify srvCode exists in any game
    let slugFound = null;
    for(let slug in gamesInfo){
        slugFound = slug; // for simplicity
        break;
    }

    if(!slugFound) return rikz.sendMessage(m.chat, { text: "❌ Invalid product code" }, { quoted: m });

    orderSessions[m.sender] = {
        step: "awaiting_confirmation",
        gameSlug: slugFound,
        product: srvCode,
        orderData: { user_id: userId, zone_id: zoneId }
    };

    rikz.sendMessage(m.chat, {
        text: `✅ Order Info Received\nGame: ${gamesInfo[slugFound].name}\nProduct: ${srvCode}\nUSER_ID: ${userId}\nZONE_ID: ${zoneId}`,
        footer: "Confirm or change your order",
        buttons: [
            { buttonId: 'confirm', buttonText: { displayText: 'Confirm' }, type: 1 },
            { buttonId: 'change', buttonText: { displayText: 'Change Info' }, type: 1 }
        ],
        headerType: 1
    }, { quoted: m });
}
break;

// 4️⃣ Receive USER_ID & ZONE_ID from button flow
case command.match(/^.+$/)?.input:
{
    if(orderSessions[m.sender]?.step === "awaiting_ids"){
        const session = orderSessions[m.sender];
        const values = args;
        if(values.length < 2) return rikz.sendMessage(m.chat, { text: "Incomplete info. Provide USER_ID and ZONE_ID." }, { quoted: m });

        session.step = "awaiting_confirmation";
        session.orderData = { user_id: values[0], zone_id: values[1] };

        rikz.sendMessage(m.chat, {
            text: `✅ Order Info Received\nGame: ${gamesInfo[session.gameSlug].name}\nProduct: ${session.product}\nUSER_ID: ${values[0]}\nZONE_ID: ${values[1]}`,
            footer: "Confirm or change your order",
            buttons: [
                { buttonId: 'confirm', buttonText: { displayText: 'Confirm' }, type: 1 },
                { buttonId: 'change', buttonText: { displayText: 'Change Info' }, type: 1 }
            ],
            headerType: 1
        }, { quoted: m });
    }
}
break;

// 5️⃣ Confirm order
case command == 'confirm':
{
    const session = orderSessions[m.sender];
    if(!session || session.step !== "awaiting_confirmation") break;

    const orderId = `PENDING-${Date.now()}`;
    if(!orders[m.sender]) orders[m.sender] = [];

    const productPrice = 0; // can fetch from product API if needed
    orders[m.sender].push({
        id: orderId,
        gameSlug: session.gameSlug,
        product: session.product,
        ...session.orderData,
        price: productPrice,
        status: "Pending"
    });

    rikz.sendMessage(m.chat, { text: `✅ Order placed and pending\nOrder ID: ${orderId}` }, { quoted: m });
    delete orderSessions[m.sender];
}
break;

// 6️⃣ Change order info
case command == 'change':
{
    const session = orderSessions[m.sender];
    if(!session || session.step !== "awaiting_confirmation") break;

    session.step = "awaiting_ids";
    rikz.sendMessage(m.chat, { text: "Please provide USER_ID and ZONE_ID:" }, { quoted: m });
}
break;

// 7️⃣ View order history (reseller only)
case command == 'history':
{
    const history = orders[m.sender] || [];
    if(history.length === 0) return rikz.sendMessage(m.chat, { text: "No orders yet." }, { quoted: m });

    const historyText = history.map(o => `• ID: ${o.id}\nGame: ${gamesInfo[o.gameSlug].name}\nProduct: ${o.product}\nUSER_ID: ${o.user_id}\nZONE_ID: ${o.zone_id}\nPrice: RM${o.price}\nStatus: ${o.status}`).join('\n\n');

    rikz.sendMessage(m.chat, { text: `📜 Your Orders:\n\n${historyText}` }, { quoted: m });
}
break;
            // Creator only: Add reseller
            case command === 'addreseller':
                if(!isCreator) break;
                const resellerId = args[0];
                if(!resellerId) return rikz.sendMessage(m.chat, { text: "Provide reseller ID" }, { quoted: m });
                if(!resellers[resellerId]) resellers[resellerId] = { balance: 0, history: [] };
                fs.writeFileSync(pathResellers, JSON.stringify(resellers, null, 2));
                rikz.sendMessage(m.chat, { text: `✅ Reseller ${resellerId} added with 0 balance` }, { quoted: m });
            break;

            // Creator only: Add balance
            case command === 'addbalance':
                if(!isCreator) break;
                const [resellerId2, amount] = args;
                if(!resellerId2 || !amount) return rikz.sendMessage(m.chat, { text: "Provide reseller ID and amount" }, { quoted: m });
                if(!resellers[resellerId2]) resellers[resellerId2] = { balance: 0, history: [] };
                resellers[resellerId2].balance += parseFloat(amount);
                fs.writeFileSync(pathResellers, JSON.stringify(resellers, null, 2));
                rikz.sendMessage(m.chat, { text: `✅ Added RM${amount} to ${resellerId2}. Total: RM${resellers[resellerId2].balance}` }, { quoted: m });
            break;

            // Reseller order history
            case command === 'history':
                if(!resellers[m.sender]) return rikz.sendMessage(m.chat, { text: "You are not a reseller." }, { quoted: m });
                let hist = resellers[m.sender].history || [];
                let histText = hist.length ? hist.map(o => `• ${o.id} | ${o.product} | ${o.status}`).join("\n") : "No order history yet.";
                rikz.sendMessage(m.chat, { text: `📜 Your Order History:\n${histText}` }, { quoted: m });
            break;


default:
  

  // Handle dynamic buttons
  if(command.startsWith('select-')) {
    const slug = command.replace('select-', '');
    if(!gamesInfo[slug]) return;
    // Fetch products & show buttons
    return;
  } 

 if(command.startsWith('order-')) {
    const [slug, srvCode] = command.replace('order-', '').split('-');
    if(!gamesInfo[slug]) return;
    
    orderSessions[m.sender] = { step: "awaiting_ids", gameSlug: slug, product: srvCode };

    rikz.sendMessage(m.chat, { text: "Please provide USER_ID and ZONE_ID separated by space (e.g., 12345 1):" }, { quoted: m });
}


break;

} // switch ends here

} catch (err) {
  console.log('\x1b[1;31m' + err + '\x1b[0m');
} // try ends here

} // async function ends here
