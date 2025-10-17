//========HELO FRIEND========//
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
const fs = require('fs-extra')
const util = require('util')
const chalk = require('chalk')
const { addPremiumUser, delPremiumUser } = require("./lib/premiun");
const { getBuffer, getGroupAdmins, getSizeMedia, fetchJson, sleep, isUrl, runtime } = require('./lib/myfunction');

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
m.mtype === "messageContextInfo" ?
m.message.buttonsResponseMessage?.selectedButtonId ||
m.message.listResponseMessage?.singleSelectReply.selectedRowId ||
m.message.InteractiveResponseMessage.NativeFlowResponseMessage ||
m.text : "");
const prefix = (typeof body === "string" ? global.prefix.find(p => body.startsWith(p)) : null) || "";  
const isCmd = !!prefix;  
const args = isCmd ? body.slice(prefix.length).trim().split(/ +/).slice(1) : []; 
const command = isCmd ? body.slice(prefix.length).trim().split(/ +/)[0].toLowerCase() : "";
const text = q = args.join(" ")//hard
const fatkuns = m.quoted || m;
const quoted = ["buttonsMessage", "templateMessage", "product"].includes(fatkuns.mtype)
? fatkuns[Object.keys(fatkuns)[1] || Object.keys(fatkuns)[0]]
: fatkuns;
//======================
const botNumber = await rikz.decodeJid(rikz.user.id);
const premuser = JSON.parse(fs.readFileSync("./system/database/premium.json"));
const isCreator = [botNumber, ...global.owner].map(v => v.replace(/[^0-9]/g, "") + "@s.whatsapp.net").includes(m.sender);
const isPremium = [botNumber, ...global.owner, ...premuser.map(user => user.id.replace(/[^0-9]/g, "") + "@s.whatsapp.net")].includes(m.sender);
if (!rikz.public && !isCreator) return;
//======================
const isGroup = m.chat.endsWith("@g.us");
const groupMetadata = isGroup ? await rikz.groupMetadata(m.chat).catch(() => ({})) : {};
const participants = groupMetadata.participants || [];
const groupAdmins = participants.filter(v => v.admin).map(v => v.id);
const isBotAdmins = groupAdmins.includes(botNumber);
const isAdmins = groupAdmins.includes(m.sender);
const groupName = groupMetadata.subject || "";
    // In-memory storage for sessions and registry
global.orderSessions = {};



const gamesInfo = {
    mlbb: { name: "Mobile Legends Malaysia", required: ["user_id", "server_id"] },
    mlbbbrazil: { name: "Mobile Legends Brazil", required: ["user_id", "server_id"] },
    mlbbgb: { name: "Mobile Legends Global", required: ["user_id", "server_id"] },
    mlbbfrmy: { name: "MLBB First Recharge MY", required: ["user_id", "server_id"] },
    mlbbfrid: { name: "MLBB First Recharge ID", required: ["user_id", "server_id"] },
    mlbbflashmy: { name: "MLBB Malaysia FS", required: ["user_id", "server_id"] },
    mlbbid: { name: "MLBB Indonesia", required: ["user_id", "server_id"] },
    mlbbiditem: { name: "MLBB Indonesia Item", required: ["user_id", "server_id"] },
    mlbbitem: { name: "MLBB Malaysia Item", required: ["user_id", "server_id"] },
    mlbbgbitem: { name: "MLBB Global Item", required: ["user_id", "server_id"] },
    ffsgmyitem: { name: "Free Fire SG/MY Item", required: ["user_id"] },
    ffsgmy: { name: "Free Fire SG/MY", required: ["user_id"] },
    mcggid: { name: "Magic Chess Go Go ID", required: ["user_id"] },
    valomy: { name: "Valorant PC MY", required: ["user_id"] },
    valoid: { name: "Valorant PC ID", required: ["user_id"] },
    codmmy: { name: "CODM MY/SG", required: ["user_id"] },
    dragonrise: { name: "Dragon Raja Rerise SEA", required: ["user_id"] },
    pubg: { name: "PUBG Mobile", required: ["user_id"] }}

    
const pathResellers = './system/database/resellers.json';
    const pathUsers = './system/database/users.json';

// Load users & resellers
let userRegistry = fs.existsSync(pathUsers) ? JSON.parse(fs.readFileSync(pathUsers)) : {};
let resellers = fs.existsSync(pathResellers) ? JSON.parse(fs.readFileSync(pathResellers)) : {};
let orderSessions = {};



//======================
if (m.message) {
rikz.readMessages([m.key]);
console.log("┏━━━━━━━━━━━━━━━━━━━━━━━=");
console.log(`┃¤ ${chalk.hex("#FFD700").bold("📩 NEW MESSAGE")} ${chalk.hex("#00FFFF").bold(`[${new Date().toLocaleTimeString()}]`)} `);
console.log(`┃¤ ${chalk.hex("#FF69B4")("💌 Dari:")} ${chalk.hex("#FFFFFF")(`${m.pushName} (${m.sender})`)} `);
console.log(`┃¤ ${chalk.hex("#FFA500")("📍 Di:")} ${chalk.hex("#FFFFFF")(`${groupName || "Private Chat"}`)} `);
console.log(`┃¤ ${chalk.hex("#00FF00")("📝 Pesan:")} ${chalk.hex("#FFFFFF")(`${body || m?.mtype || "Unknown"}`)} `);
console.log("┗━━━━━━━━━━━━━━━━━━━━━━━=")}

//======================
switch (command) {

  case 'register':
    if(userRegistry[m.sender]) return rikz.sendMessage(m.chat, { text: "You're already registered." }, { quoted: m });
    userRegistry[m.sender] = { name: m.pushName || "User", role: "User" };
    fs.writeFileSync(pathUsers, JSON.stringify(userRegistry, null, 2));
    rikz.sendMessage(m.chat, { text: `Registered successfully as ${userRegistry[m.sender].name}` }, { quoted: m });
  break;

  case 'menu':
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

  case 'help':
    rikz.sendMessage(m.chat, {
      text: "Commands:\n• menu\n• help\n• price\n• register\n• addreseller (owner)\n• addbalance (owner)",
      footer: 'Traxc Bot 4.0',
      buttons: [{ buttonId: '.menu', buttonText: { displayText: 'Main Menu' }, type: 1 }],
      headerType: 1
    }, { quoted: m });
  break;

  case 'price':
    if(!userRegistry[m.sender]) return rikz.sendMessage(m.chat, { text: "Please register first using register" }, { quoted: m });
    let buttons = [];
    for(let slug in gamesInfo){
      buttons.push({ buttonId: `select-${slug}`, buttonText: { displayText: gamesInfo[slug].name }, type: 1 });
    }
    rikz.sendMessage(m.chat, { text: "Select a game to view prices:", footer: "Powered by GameVia", buttons, headerType: 1 }, { quoted: m });
  break;

  // Select game products
  case command.startsWith('select-') && command:
    {
      const slug = command.replace('select-', '');
      if(!gamesInfo[slug]) break;
      orderSessions[m.sender] = { step: "awaiting_product", gameSlug: slug };
      try{
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
      } catch(err){ console.log(err); rikz.sendMessage(m.chat, { text: "Failed to fetch products." }, { quoted: m }); }
    }
  break;

  // Order button clicked
  case command.startsWith('order-') && command:
    {
      const [slug, srvCode] = command.replace('order-', '').split('-');
      if(!gamesInfo[slug]) break;
      orderSessions[m.sender] = { step: "awaiting_ids", gameSlug: slug, product: srvCode };
      rikz.sendMessage(m.chat, { text: "Please provide USER_ID and ZONE_ID separated by space (e.g., 12345 1):" }, { quoted: m });
    }
  break;

  // User sends order info
  case command.match(/^.+$/)?.input:
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
  break;

  case 'confirm':
    if(orderSessions[m.sender]?.step !== "awaiting_confirmation") break;
    {
      const session = orderSessions[m.sender];
      const { gameSlug, product, orderData } = session;
      const price = 0; // could fetch dynamically if needed
      const orderId = `PENDING-${Date.now()}`;
      if(!orders[m.sender]) orders[m.sender] = [];
      orders[m.sender].push({ id: orderId, gameSlug, product, ...orderData, price, status: "Pending" });
      rikz.sendMessage(m.chat, { text: `✅ Order placed and pending\nOrder ID: ${orderId}` }, { quoted: m });
      delete orderSessions[m.sender];
    }
  break;

  case 'change':
    if(orderSessions[m.sender]?.step === "awaiting_confirmation"){
      orderSessions[m.sender].step = "awaiting_ids";
      rikz.sendMessage(m.chat, { text: "Please provide USER_ID and ZONE_ID:" }, { quoted: m });
    }
  break;

  // Creator only: Add reseller
  case 'addreseller':
    if(!isCreator) break;
    const resellerId = args[0];
    if(!resellerId) return rikz.sendMessage(m.chat, { text: "Provide reseller ID" }, { quoted: m });
    if(!resellers[resellerId]) resellers[resellerId] = { balance: 0 };
    fs.writeFileSync(pathResellers, JSON.stringify(resellers, null, 2));
    rikz.sendMessage(m.chat, { text: `✅ Reseller ${resellerId} added with 0 balance` }, { quoted: m });
  break;

  // Creator only: Add balance
  case 'addbalance':
    if(!isCreator) break;
    const [resellerId2, amount] = args;
    if(!resellerId2 || !amount) return rikz.sendMessage(m.chat, { text: "Provide reseller ID and amount" }, { quoted: m });
    if(!resellers[resellerId2]) resellers[resellerId2] = { balance: 0 };
    resellers[resellerId2].balance += parseFloat(amount);
    fs.writeFileSync(pathResellers, JSON.stringify(resellers, null, 2));
    rikz.sendMessage(m.chat, { text: `✅ Added RM${amount} to ${resellerId2}. Total: RM${resellers[resellerId2].balance}` }, { quoted: m });
  break;

  default:
}
