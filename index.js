import got from "got";
import { JSDOM } from "jsdom";
import TelegramBot from "node-telegram-bot-api";

// توكن البوت
const botToken = "8180869779:AAHHB07pAJ0pNtbjyrS0MWSNbGeCbu7uO-o";
const bot = new TelegramBot(botToken, { polling: true });
const adminChatId = process.env.ADMIN_CHAT_ID || '123456789232'; // معرف المسؤول

// الردود المخصصة
const customResponses = {
  "/start": "👋 أهلاً وسهلاً! ارسل رابط السنابه عشان ابدا اشتغل \n 🛑 تنويه: مايشتغل سحب السنابات على كل الحسابات \n \n telegram : https://t.me/pzll0 \n insta : https://www.instagram.com/_pzll0 \n snap : https://snapchat.com/t/DII2BMDw",
};

// متغيرات الحالة
let waitingForLink = true;
let isProcessing = false;
let currentUrl = "";
let currentSnapIndexes = [];
let currentMediaUrls = [];
let waitingForSnapNumber = false;

// دالة البحث في JSON
function findSnapIndexAndMediaUrl(obj) {
  let snapIndexes = [];
  let mediaUrls = [];

  function deepSearch(object) {
    if (typeof object !== "object" || object === null) return;
    if (object.snapIndex !== undefined) snapIndexes.push(object.snapIndex);
    if (object.mediaUrl !== undefined) mediaUrls.push(object.mediaUrl);
    for (const key in object) {
      if (object.hasOwnProperty(key) && typeof object[key] === "object") {
        deepSearch(object[key]);
      }
    }
  }

  deepSearch(obj);
  return { snapIndexes, mediaUrls };
}

// جلب وتحليل HTML
async function fetchAndParseHtml(url) {
  try {
    const response = await got(url);
    if (response.statusCode !== 200) {
      throw new Error("الرابط غير صالح أو غير قابل للتحميل.");
    }
    const dom = new JSDOM(response.body);
    const jsonData = JSON.parse(dom.window.document.querySelector('script[type="application/json"]').textContent);
    const { snapIndexes, mediaUrls } = findSnapIndexAndMediaUrl(jsonData);
    return { snapIndexes, mediaUrls };
  } catch (error) {
    await bot.sendMessage(adminChatId, `⚠️ خطأ في البوت: ${error.message}`);
    return { error: error.message };
  }
}

// التعامل مع الرسائل
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const messageText = msg.text;

  try {
    // الردود المخصصة
    if (customResponses[messageText]) {
      await bot.sendMessage(chatId, customResponses[messageText]);
      return;
    }

      if (["وقف", "قف", "stop"].includes(messageText)) {
         if (isProcessing) {
           isProcessing = false;
           waitingForLink = true;
           currentUrl = "";
           currentSnapIndexes = [];
           currentMediaUrls = [];
           await bot.sendMessage(chatId, "❌ تم إلغاء العملية.");
         } else {
           await bot.sendMessage(chatId, "❗ لا توجد عملية قيد التنفيذ.");
         }
         return;
       }
      
    // التحقق من الرابط
    const urlRegex = /^(https?:\/\/)?(?:www\.)?snapchat\.com[^\s]*$/;
    
    if (urlRegex.test(messageText)) {
      // إعادة تعيين الحالة لمعالجة رابط جديد
      waitingForLink = false;
      isProcessing = true;
      currentUrl = messageText;
      currentSnapIndexes = [];
      currentMediaUrls = [];

      await bot.sendMessage(chatId, "🔄 جاري سحب السنابات... يرجى الانتظار");
      const result = await fetchAndParseHtml(messageText);

      if (result.error) {
        await bot.sendMessage(chatId, `❌ حدث خطأ أثناء استخراج البيانات: ${result.error}`);
        waitingForLink = true;
        isProcessing = false;
      } else {
        currentSnapIndexes = result.snapIndexes;
        currentMediaUrls = result.mediaUrls;

        if (currentSnapIndexes.length === 0) {
          await bot.sendMessage(chatId, "❌ لم يتم العثور على أي سنابات. يرجى التحقق من الرابط.");
          waitingForLink = true;
          isProcessing = false;
        } else {
          await bot.sendMessage(chatId, `📝 تم العثور على ${currentSnapIndexes.length} سنابة. اختر من الخيارات التالية:`, {
            reply_markup: {
              inline_keyboard: [
                [{ text: "📥 تنزيل الكل", callback_data: "download_all" }],
                [{ text: "📩 تحميل سنابة برقم", callback_data: "download_by_number" }], // زر تحميل السنابة برقم
                [{ text: "❌ إلغاء", callback_data: "cancel" }],
                [{ text: "🤴🏻 المدير", callback_data: "Manager" }]
              ]
            }
          });
        }
      }
      return;
    }

    // إذا كان البوت في حالة انتظار لرقم السنابة
    if (waitingForSnapNumber) {
      const snapNumber = parseInt(messageText, 10);
      if (isNaN(snapNumber) || snapNumber < 1 || snapNumber > currentSnapIndexes.length) {
        await bot.sendMessage(chatId, "❗ الرقم غير صحيح. يرجى إدخال رقم سنابة صحيح.");
        return;
      }

      // إرسال السنابة المطلوبة
      await bot.sendMessage(chatId, `📌 تم العثور على السنابة رقم ${snapNumber}:\n🔗 MediaUrl: ${currentMediaUrls[snapNumber - 1]}`);
      waitingForSnapNumber = false; // إيقاف انتظار الرقم
      return;
    }

    await bot.sendMessage(chatId,  "ارسل رابط السنابه يا دلخ🤬");
  } catch (error) {
    console.error("خطأ في البوت:", error);
    await bot.sendMessage(adminChatId, `⚠️ خطأ في البوت: ${error.message}`);
  }
});

// التعامل مع ضغط الأزرار
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  try {
    if (data === "download_all") {
      if (currentSnapIndexes.length > 0) {
        await bot.sendMessage(chatId, "📥 جاري تنزيل جميع السنابات...");
        for (let i = 0; i < currentSnapIndexes.length; i++) {
          await bot.sendMessage(chatId, `📌 SnapIndex: ${currentSnapIndexes[i]}\n🔗 MediaUrl: ${currentMediaUrls[i]}`);
        }
      } else {
        await bot.sendMessage(chatId, "❌ لا يوجد سنابات للتنزيل.");
      }
    }else if (data === "Manager") {
       
        await bot.sendMessage(chatId, `https://t.me/pzll0`);

    }else if (data === "cancel") {
      waitingForLink = true;
      isProcessing = false;
      await bot.sendMessage(chatId, "❌ تم إلغاء العملية.");
    } else if (data === "download_by_number") {
      // بدء انتظار رقم السنابة
      waitingForSnapNumber = true;
      await bot.sendMessage(chatId, "📝 يرجى إدخال رقم السنابة التي ترغب في تحميلها.");
    }
  } catch (error) {
    console.error("خطأ في التعامل مع الضغط:", error);
    await bot.sendMessage(adminChatId, `⚠️ خطأ في التعامل مع الضغط: ${error.message}`);
  }
});
