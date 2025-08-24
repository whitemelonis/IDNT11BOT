// index.js — Bot Telegram IDNT® para Fly.io
// Usa: BOT_TOKEN y BOT_SECRET (opcional).
import http from "node:http";

const API = "https://api.telegram.org/bot";
const PORT = process.env.PORT || 8080;
const BOT_TOKEN = process.env.BOT_TOKEN;
const BOT_SECRET = process.env.BOT_SECRET || "";
const SITE_BASE = "https://idnt.es";
const SEUR_TRACK = "https://www.seur.com/track-and-trace?tracking=";

if (!BOT_TOKEN) {
  console.error("Falta BOT_TOKEN");
  process.exit(1);
}

// memoria cache simple
let CACHE = { ts: 0, urls: [] };

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "text/plain" });
    return res.end("ok");
  }
  if (req.method !== "POST" || req.url !== "/") {
    res.writeHead(405, { "content-type": "text/plain" });
    return res.end("Use POST");
  }
  if (BOT_SECRET) {
    const hdr = req.headers["x-telegram-bot-api-secret-token"] || "";
    if (hdr !== BOT_SECRET) {
      res.writeHead(401).end("bad secret");
      return;
    }
  }

  let body = "";
  req.on("data", c => body += c);
  req.on("end", async () => {
    try {
      const update = JSON.parse(body);

      // === Mensajes ===
      if (update.message) {
        const m = update.message;
        const chatId = m.chat.id;
        const text = (m.text || "").trim();

        if (/^\/start\b/.test(text)) {
          return send(chatId,
`Bienvenido a *IDNT®* 👕  
Moda conceptual *sutil, energética, real*.  

Comandos:
/catalogo /novedades /buscar <texto>  
/horarios /direccion /envios /track <nº> /contacto`);
        }

        if (/^\/help\b/.test(text)) {
          return send(chatId,"Comandos: /catalogo /novedades /buscar /horarios /direccion /envios /track /contacto");
        }

        if (/^\/ping\b/.test(text)) return send(chatId,"pong 🏓");

        if (/^\/catalogo\b/.test(text)) {
          const urls = await getUrls();
          const prods = urls.filter(u=>/\/(product|collections)\//.test(u)).slice(0,6);
          return sendList(chatId,"Catálogo destacado:",prods);
        }

        if (/^\/novedades\b/.test(text)) {
          const urls = (await getUrls()).slice(0,6);
          return sendList(chatId,"Novedades:",urls);
        }

        if (/^\/buscar\b/.test(text)) {
          const q = text.split(/\s+/).slice(1).join(" ");
          if (!q) return send(chatId,"Uso: /buscar sudadera");
          const urls = (await getUrls()).filter(u=>u.toLowerCase().includes(q.toLowerCase())).slice(0,6);
          if (!urls.length) return send(chatId,`Nada encontrado para “${q}”`);
          return sendList(chatId,`Resultados para “${q}”:`,urls);
        }

        if (/^\/horarios\b/.test(text)) {
          return send(chatId,"Horario tienda IDNT® (Barcelona):\nL-S: 11–20h\nDomingos: cerrado");
        }

        if (/^\/direccion\b/.test(text)) {
          return buttons(chatId,"Estamos en Barcelona 📍",[
            [{ text:"Abrir en Google Maps", url:"https://maps.google.com/?q=IDNT%20Barcelona"}]
          ]);
        }

        if (/^\/envios\b/.test(text)) {
          return send(chatId,"Envíos con SEUR 🚚\nTracking con /track <número>\nPolítica de cambios en IDNT.es");
        }

        if (/^\/track\b/.test(text)) {
          const num = text.split(/\s+/)[1];
          if (!num) return send(chatId,"Uso: /track 123456");
          return buttons(chatId,`Seguimiento SEUR para ${num}`,[
            [{ text:"Ver tracking", url: SEUR_TRACK+num }]
          ]);
        }

        if (/^\/contacto\b/.test(text)) {
          return buttons(chatId,"Contacto IDNT®:",[
            [{ text:"Web IDNT®", url:"https://idnt.es"}],
            [{ text:"Instagram", url:"https://instagram.com/idntclth"}]
          ]);
        }

        return send(chatId,"Comando no reconocido 🤷‍♂️");
      }

      // === Inline queries ===
      if (update.inline_query) {
        const q = (update.inline_query.query||"").trim();
        const urls = await getUrls();
        const results = (q ? urls.filter(u=>u.toLowerCase().includes(q.toLowerCase())) : urls).slice(0,5)
          .map((u,i)=>({
            type:"article",
            id:String(i+1),
            title:u.replace(/^https?:\/\//,""),
            input_message_content:{message_text:`${u}`},
            reply_markup:{inline_keyboard:[[ { text:"Ver en web", url:u } ]]}
          }));
        return tg("answerInlineQuery",{ inline_query_id:update.inline_query.id, results });
      }

      res.writeHead(200).end("ok");
    } catch(e) {
      console.error(e);
      res.writeHead(500).end("error");
    }
  });
});

server.listen(PORT,()=>console.log("Bot escuchando",PORT));

async function send(chatId,text){
  return tg("sendMessage",{ chat_id:chatId,text,parse_mode:"Markdown" });
}
async function buttons(chatId,text,kb){
  return tg("sendMessage",{ chat_id:chatId,text,reply_markup:{inline_keyboard:kb}});
}
async function sendList(chatId,header,urls){
  const txt = header+"\n"+urls.map(u=>"• "+u).join("\n");
  return send(chatId,txt);
}
async function tg(method,body){
  await fetch(`${API}${BOT_TOKEN}/${method}`,{
    method:"POST",headers:{ "content-type":"application/json" },
    body:JSON.stringify(body)
  });
}

// === sitemap ===
async function getUrls(){
  const now = Date.now();
  if (CACHE.urls.length && now - CACHE.ts < 10*60*1000) return CACHE.urls;
  try{
    const r = await fetch(`${SITE_BASE}/sitemap.xml`);
    const xml = await r.text();
    const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m=>m[1]);
    CACHE={ ts:now, urls };
    return urls;
  }catch{
    return [SITE_BASE];
  }
}