export type Lang = "he" | "en" | "si" | "hi" | "ta" | "bn" | "te" | "ml" | "pa";

export const LANGS: { code: Lang; label: string; dir: "rtl" | "ltr" }[] = [
  { code: "he", label: "עברית", dir: "rtl" },
  { code: "en", label: "English", dir: "ltr" },
  { code: "si", label: "සිංහල", dir: "ltr" },
  { code: "hi", label: "हिन्दी", dir: "ltr" },
  { code: "ta", label: "தமிழ்", dir: "ltr" },
  { code: "bn", label: "বাংলা", dir: "ltr" },
  { code: "te", label: "తెలుగు", dir: "ltr" },
  { code: "ml", label: "മലയാളം", dir: "ltr" },
  { code: "pa", label: "ਪੰਜਾਬੀ", dir: "ltr" },
];

type Entry = Record<Lang, string>;
type Dict = Record<string, Entry>;

// Helper to build entry: provide he, en, si and optional overrides; missing langs fall back to English
const e = (
  he: string,
  en: string,
  si: string,
  overrides: Partial<Record<Lang, string>> = {}
): Entry => ({
  he, en, si,
  hi: overrides.hi ?? en,
  ta: overrides.ta ?? en,
  bn: overrides.bn ?? en,
  te: overrides.te ?? en,
  ml: overrides.ml ?? en,
  pa: overrides.pa ?? en,
});

const dict: Dict = {
  chooseLanguage: e("בחר שפה", "Choose language", "භාෂාව තෝරන්න", {
    hi: "भाषा चुनें", ta: "மொழியைத் தேர்ந்தெடுக்கவும்", bn: "ভাষা নির্বাচন করুন",
    te: "భాషను ఎంచుకోండి", ml: "ഭാഷ തിരഞ്ഞെടുക്കുക", pa: "ਭਾਸ਼ਾ ਚੁਣੋ",
  }),
  start: e("המשך", "Continue", "ඉදිරියට", {
    hi: "जारी रखें", ta: "தொடரவும்", bn: "চালিয়ে যান", te: "కొనసాగించు", ml: "തുടരുക", pa: "ਜਾਰੀ ਰੱਖੋ",
  }),
  passportNumber: e("מספר דרכון", "Passport number", "ගමන් බලපත්‍ර අංකය", {
    hi: "पासपोर्ट नंबर", ta: "கடவுச்சீட்டு எண்", bn: "পাসপোর্ট নম্বর",
    te: "పాస్‌పోర్ట్ నంబర్", ml: "പാസ്‌പോർട്ട് നമ്പർ", pa: "ਪਾਸਪੋਰਟ ਨੰਬਰ",
  }),
  enterPassport: e("הזן את מספר הדרכון שלך", "Enter your passport number", "ඔබගේ ගමන් බලපත්‍ර අංකය ඇතුළත් කරන්න", {
    hi: "अपना पासपोर्ट नंबर दर्ज करें", ta: "உங்கள் கடவுச்சீட்டு எண்ணை உள்ளிடவும்",
    bn: "আপনার পাসপোর্ট নম্বর লিখুন", te: "మీ పాస్‌పోర్ట్ నంబర్ నమోదు చేయండి",
    ml: "നിങ്ങളുടെ പാസ്‌പോർട്ട് നമ്പർ നൽകുക", pa: "ਆਪਣਾ ਪਾਸਪੋਰਟ ਨੰਬਰ ਦਰਜ ਕਰੋ",
  }),
  identify: e("המשך", "Continue", "ඉදිරියට", {
    hi: "जारी रखें", ta: "தொடரவும்", bn: "চালিয়ে যান", te: "కొనసాగించు", ml: "തുടരുക", pa: "ਜਾਰੀ ਰੱਖੋ",
  }),
  newWorkerTitle: e("הרשמה ראשונית", "First-time registration", "පළමු ලියාපදිංචිය", {
    hi: "पहली बार पंजीकरण", ta: "முதல் முறை பதிவு", bn: "প্রথমবার নিবন্ধন",
    te: "మొదటిసారి నమోదు", ml: "ആദ്യ രജിസ്ട്രേഷൻ", pa: "ਪਹਿਲੀ ਵਾਰ ਰਜਿਸਟ੍ਰੇਸ਼ਨ",
  }),
  newWorkerHelp: e("לא מצאנו אותך במערכת. נא להירשם פעם אחת.", "We didn't find you. Please register once.", "ඔබව සොයාගත නොහැකි විය. කරුණාකර ලියාපදිංචි වන්න.", {
    hi: "हमने आपको नहीं पाया। कृपया एक बार पंजीकरण करें।",
    ta: "உங்களைக் கண்டுபிடிக்க முடியவில்லை. ஒருமுறை பதிவு செய்யவும்.",
    bn: "আমরা আপনাকে পাইনি। অনুগ্রহ করে একবার নিবন্ধন করুন।",
    te: "మిమ్మల్ని కనుగొనలేకపోయాము. దయచేసి ఒకసారి నమోదు చేయండి.",
    ml: "നിങ്ങളെ കണ്ടെത്താനായില്ല. ദയവായി ഒരുതവണ രജിസ്റ്റർ ചെയ്യുക.",
    pa: "ਅਸੀਂ ਤੁਹਾਨੂੰ ਨਹੀਂ ਲੱਭਿਆ। ਕਿਰਪਾ ਕਰਕੇ ਇੱਕ ਵਾਰ ਰਜਿਸਟਰ ਕਰੋ।",
  }),
  fullName: e("שם מלא", "Full name", "සම්පූර්ණ නම", {
    hi: "पूरा नाम", ta: "முழு பெயர்", bn: "পুরো নাম", te: "పూర్తి పేరు", ml: "മുഴുവൻ പേര്", pa: "ਪੂਰਾ ਨਾਮ",
  }),
  firstName: e("שם פרטי (באנגלית)", "First name (in English)", "මුල් නම (ඉංග්‍රීසියෙන්)", {
    hi: "पहला नाम (अंग्रेज़ी में)", ta: "முதல் பெயர் (ஆங்கிலத்தில்)", bn: "প্রথম নাম (ইংরেজিতে)",
    te: "మొదటి పేరు (ఇంగ్లీష్‌లో)", ml: "ആദ്യ നാമം (ഇംഗ്ലീഷിൽ)", pa: "ਪਹਿਲਾ ਨਾਮ (ਅੰਗਰੇਜ਼ੀ ਵਿੱਚ)",
  }),
  lastName: e("שם משפחה (באנגלית)", "Last name (in English)", "අවසන් නම (ඉංග්‍රීසියෙන්)", {
    hi: "उपनाम (अंग्रेज़ी में)", ta: "கடைசி பெயர் (ஆங்கிலத்தில்)", bn: "পদবি (ইংরেজিতে)",
    te: "ఇంటిపేరు (ఇంగ్లీష్‌లో)", ml: "അവസാന നാമം (ഇംഗ്ലീഷിൽ)", pa: "ਆਖਰੀ ਨਾਮ (ਅੰਗਰੇਜ਼ੀ ਵਿੱਚ)",
  }),
  englishOnly: e("יש להזין באותיות אנגליות בלבד", "English letters only", "ඉංග්‍රීසි අකුරු පමණි", {
    hi: "केवल अंग्रेज़ी अक्षर", ta: "ஆங்கில எழுத்துக்கள் மட்டும்", bn: "শুধু ইংরেজি অক্ষর",
    te: "ఇంగ్లీష్ అక్షరాలు మాత్రమే", ml: "ഇംഗ്ലീഷ് അക്ഷരങ്ങൾ മാത്രം", pa: "ਸਿਰਫ਼ ਅੰਗਰੇਜ਼ੀ ਅੱਖਰ",
  }),
  passportMinLen: e("מספר דרכון חייב להיות לפחות 8 תווים", "Passport must be at least 8 characters", "ගමන් බලපත්‍රය අවම අකුරු 8 විය යුතුය", {
    hi: "पासपोर्ट कम से कम 8 अक्षर का होना चाहिए",
    ta: "கடவுச்சீட்டு குறைந்தது 8 எழுத்துகள் இருக்க வேண்டும்",
    bn: "পাসপোর্ট কমপক্ষে ৮ অক্ষরের হতে হবে",
    te: "పాస్‌పోర్ట్ కనీసం 8 అక్షరాలు ఉండాలి",
    ml: "പാസ്‌പോർട്ട് കുറഞ്ഞത് 8 പ്രതീകങ്ങൾ വേണം",
    pa: "ਪਾਸਪੋਰਟ ਘੱਟੋ-ਘੱਟ 8 ਅੱਖਰਾਂ ਦਾ ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ",
  }),
  phone: e("טלפון", "Phone", "දුරකථන", {
    hi: "फ़ोन", ta: "தொலைபேசி", bn: "ফোন", te: "ఫోన్", ml: "ഫോൺ", pa: "ਫ਼ੋਨ",
  }),
  language: e("שפה מועדפת", "Preferred language", "භාෂාව", {
    hi: "पसंदीदा भाषा", ta: "விருப்ப மொழி", bn: "পছন্দের ভাষা",
    te: "ఇష్టమైన భాష", ml: "ഇഷ്ടഭാഷ", pa: "ਪਸੰਦੀਦਾ ਭਾਸ਼ਾ",
  }),
  register: e("הרשם", "Register", "ලියාපදිංචි වන්න", {
    hi: "पंजीकरण करें", ta: "பதிவு செய்க", bn: "নিবন্ধন করুন",
    te: "నమోదు చేయండి", ml: "രജിസ്റ്റർ ചെയ്യുക", pa: "ਰਜਿਸਟਰ ਕਰੋ",
  }),
  hello: e("שלום", "Hello", "ආයුබෝවන්", {
    hi: "नमस्ते", ta: "வணக்கம்", bn: "নমস্কার", te: "నమస్కారం", ml: "നമസ്കാരം", pa: "ਸਤ ਸ੍ਰੀ ਅਕਾਲ",
  }),
  newReport: e("דיווח שעות חדש", "New hours report", "නව වාර්තාවක්", {
    hi: "नई घंटे रिपोर्ट", ta: "புதிய மணிநேர அறிக்கை", bn: "নতুন ঘণ্টার রিপোর্ট",
    te: "కొత్త గంటల నివేదిక", ml: "പുതിയ മണിക്കൂർ റിപ്പോർട്ട്", pa: "ਨਵੀਂ ਘੰਟੇ ਰਿਪੋਰਟ",
  }),
  myReports: e("הדיווחים שלי", "My reports", "මගේ වාර්තා", {
    hi: "मेरी रिपोर्ट्स", ta: "என் அறிக்கைகள்", bn: "আমার রিপোর্ট",
    te: "నా నివేదికలు", ml: "എന്റെ റിപ്പോർട്ടുകൾ", pa: "ਮੇਰੀਆਂ ਰਿਪੋਰਟਾਂ",
  }),
  workDate: e("תאריך עבודה", "Work date", "වැඩ දිනය"),
  checkIn: e("שעת כניסה", "Check-in time", "ආරම්භ වේලාව"),
  checkOut: e("שעת יציאה", "Check-out time", "අවසන් වේලාව"),
  workplaceDesc: e("תיאור מקום העבודה", "Workplace description", "වැඩ ස්ථානයේ විස්තරය"),
  workplaceDescHelp: e("למשל: סופרמרקט / משרד / בניין", "e.g. supermarket / office / building", "උදා: සුපිරි වෙළඳසැල / කාර්යාලය"),
  address: e("כתובת", "Address", "ලිපිනය"),
  addressPlaceholder: e("רחוב, מספר, עיר", "Street, number, city", "වීදිය, අංකය, නගරය"),
  mapsLink: e("קישור Google Maps", "Google Maps link", "Google Maps සබැඳිය"),
  locationSection: e("מיקום מקום העבודה", "Workplace location", "වැඩ ස්ථාන ස්ථානය"),
  locationHelp: e("חובה למלא לפחות אחד: כתובת ידנית או קישור מ-Google Maps", "Required: enter an address OR paste a Google Maps link", "අවශ්‍ය: ලිපිනයක් හෝ Google Maps සබැඳියක්"),
  locationRequired: e("יש להזין כתובת או קישור Google Maps", "Please enter an address or a Google Maps link", "කරුණාකර ලිපිනයක් හෝ Google Maps සබැඳියක් ඇතුළත් කරන්න"),
  openMaps: e("פתח את Google Maps להעתקת קישור", "Open Google Maps to copy a link", "Google Maps විවෘත කරන්න"),
  hourlyWage: e("שכר לשעה", "Hourly wage", "පැයකට වේතනය"),
  notes: e("הערות", "Notes", "සටහන්"),
  submit: e("שלח דיווח", "Submit report", "ඉදිරිපත් කරන්න"),
  submitted: e("הדיווח נשלח! ממתין לאישור הנהלה.", "Submitted! Waiting for manager approval.", "ඉදිරිපත් කරන ලදී!"),
  back: e("חזרה", "Back", "ආපසු"),
  logout: e("התנתק", "Log out", "ඉවත් වන්න"),
  totalHours: e("סך שעות", "Total hours", "මුළු පැය"),
  totalPayment: e("סכום לתשלום", "Total payment", "මුළු ගෙවීම"),
  status: e("סטטוס", "Status", "තත්ත්වය"),
  pending: e("ממתין לאישור", "Pending", "අපේක්ෂිතයි"),
  approved: e("מאושר", "Approved", "අනුමතයි"),
  rejected: e("נדחה", "Rejected", "ප්‍රතික්ෂේපිතයි"),
  needs_clarification: e("ממתין לבירור", "Needs clarification", "පැහැදිලි කිරීම අවශ්‍යයි"),
  requestChange: e("בקשת שינוי", "Request change", "වෙනස්කම් ඉල්ලන්න"),
  changeDescription: e("מה צריך לתקן?", "What needs to be fixed?", "කුමක්ද නිවැරදි කළ යුත්තේ?"),
  send: e("שלח", "Send", "යවන්න"),
  cancel: e("ביטול", "Cancel", "අවලංගු"),
  required: e("שדה חובה", "Required", "අවශ්‍ය"),
  phoneRequired: e("יש להזין מספר טלפון", "Phone number is required", "දුරකථන අංකය අවශ්‍යයි", {
    hi: "फ़ोन नंबर आवश्यक है", ta: "தொலைபேசி எண் தேவை", bn: "ফোন নম্বর প্রয়োজন",
    te: "ఫోన్ నంబర్ అవసరం", ml: "ഫോൺ നമ്പർ ആവശ്യമാണ്", pa: "ਫ਼ੋਨ ਨੰਬਰ ਲੋੜੀਂਦਾ ਹੈ",
  }),
  invalidPassport: e("מספר דרכון לא תקין", "Invalid passport number", "වලංගු නොවේ"),
  workerNotFound: e("עובד לא נמצא", "Worker not found", "සොයාගත නොහැක"),
  changeRequested: e("בקשת השינוי נשלחה", "Change request sent", "ඉල්ලීම යවන ලදී"),
  noReports: e("אין דיווחים עדיין", "No reports yet", "තවම වාර්තා නැත"),
  workplace: e("מקום עבודה", "Workplace", "වැඩ ස්ථානය"),
};

export function t(key: keyof typeof dict, lang: Lang): string {
  return dict[key]?.[lang] ?? key;
}

export const dirFor = (lang: Lang): "rtl" | "ltr" => (lang === "he" ? "rtl" : "ltr");
