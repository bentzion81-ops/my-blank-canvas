export type Lang = "he" | "en" | "si";

export const LANGS: { code: Lang; label: string; dir: "rtl" | "ltr" }[] = [
  { code: "he", label: "עברית", dir: "rtl" },
  { code: "en", label: "English", dir: "ltr" },
  { code: "si", label: "සිංහල", dir: "ltr" },
];

type Dict = Record<string, { he: string; en: string; si: string }>;

const dict: Dict = {
  chooseLanguage: { he: "בחר שפה", en: "Choose language", si: "භාෂාව තෝරන්න" },
  start: { he: "המשך", en: "Continue", si: "ඉදිරියට" },
  passportNumber: { he: "מספר דרכון", en: "Passport number", si: "ගමන් බලපත්‍ර අංකය" },
  enterPassport: { he: "הזן את מספר הדרכון שלך", en: "Enter your passport number", si: "ඔබගේ ගමන් බලපත්‍ර අංකය ඇතුළත් කරන්න" },
  identify: { he: "המשך", en: "Continue", si: "ඉදිරියට" },
  newWorkerTitle: { he: "הרשמה ראשונית", en: "First-time registration", si: "පළමු ලියාපදිංචිය" },
  newWorkerHelp: { he: "לא מצאנו אותך במערכת. נא להירשם פעם אחת.", en: "We didn't find you. Please register once.", si: "ඔබව සොයාගත නොහැකි විය. කරුණාකර ලියාපදිංචි වන්න." },
  fullName: { he: "שם מלא", en: "Full name", si: "සම්පූර්ණ නම" },
  phone: { he: "טלפון", en: "Phone", si: "දුරකථන" },
  language: { he: "שפה מועדפת", en: "Preferred language", si: "භාෂාව" },
  register: { he: "הרשם", en: "Register", si: "ලියාපදිංචි වන්න" },
  hello: { he: "שלום", en: "Hello", si: "ආයුබෝවන්" },
  newReport: { he: "דיווח שעות חדש", en: "New hours report", si: "නව වාර්තාවක්" },
  myReports: { he: "הדיווחים שלי", en: "My reports", si: "මගේ වාර්තා" },
  workDate: { he: "תאריך עבודה", en: "Work date", si: "වැඩ දිනය" },
  checkIn: { he: "שעת כניסה", en: "Check-in time", si: "ආරම්භ වේලාව" },
  checkOut: { he: "שעת יציאה", en: "Check-out time", si: "අවසන් වේලාව" },
  workplaceDesc: { he: "תיאור מקום העבודה", en: "Workplace description", si: "වැඩ ස්ථානයේ විස්තරය" },
  workplaceDescHelp: { he: "למשל: סופרמרקט / משרד / בניין", en: "e.g. supermarket / office / building", si: "උදා: සුපිරි වෙළඳසැල / කාර්යාලය" },
  address: { he: "כתובת", en: "Address", si: "ලිපිනය" },
  addressPlaceholder: { he: "רחוב, מספר, עיר", en: "Street, number, city", si: "වීදිය, අංකය, නගරය" },
  mapsLink: { he: "קישור Google Maps", en: "Google Maps link", si: "Google Maps සබැඳිය" },
  locationSection: { he: "מיקום מקום העבודה", en: "Workplace location", si: "වැඩ ස්ථාන ස්ථානය" },
  locationHelp: { he: "חובה למלא לפחות אחד: כתובת ידנית או קישור מ-Google Maps", en: "Required: enter an address OR paste a Google Maps link", si: "අවශ්‍ය: ලිපිනයක් හෝ Google Maps සබැඳියක්" },
  locationRequired: { he: "יש להזין כתובת או קישור Google Maps", en: "Please enter an address or a Google Maps link", si: "කරුණාකර ලිපිනයක් හෝ Google Maps සබැඳියක් ඇතුළත් කරන්න" },
  openMaps: { he: "פתח את Google Maps להעתקת קישור", en: "Open Google Maps to copy a link", si: "Google Maps විවෘත කරන්න" },
  hourlyWage: { he: "שכר לשעה", en: "Hourly wage", si: "පැයකට වේතනය" },
  notes: { he: "הערות", en: "Notes", si: "සටහන්" },
  submit: { he: "שלח דיווח", en: "Submit report", si: "ඉදිරිපත් කරන්න" },
  submitted: { he: "הדיווח נשלח! ממתין לאישור הנהלה.", en: "Submitted! Waiting for manager approval.", si: "ඉදිරිපත් කරන ලදී!" },
  back: { he: "חזרה", en: "Back", si: "ආපසු" },
  logout: { he: "התנתק", en: "Log out", si: "ඉවත් වන්න" },
  totalHours: { he: "סך שעות", en: "Total hours", si: "මුළු පැය" },
  totalPayment: { he: "סכום לתשלום", en: "Total payment", si: "මුළු ගෙවීම" },
  status: { he: "סטטוס", en: "Status", si: "තත්ත්වය" },
  pending: { he: "ממתין לאישור", en: "Pending", si: "අපේක්ෂිතයි" },
  approved: { he: "מאושר", en: "Approved", si: "අනුමතයි" },
  rejected: { he: "נדחה", en: "Rejected", si: "ප්‍රතික්ෂේපිතයි" },
  needs_clarification: { he: "ממתין לבירור", en: "Needs clarification", si: "පැහැදිලි කිරීම අවශ්‍යයි" },
  requestChange: { he: "בקשת שינוי", en: "Request change", si: "වෙනස්කම් ඉල්ලන්න" },
  changeDescription: { he: "מה צריך לתקן?", en: "What needs to be fixed?", si: "කුමක්ද නිවැරදි කළ යුත්තේ?" },
  send: { he: "שלח", en: "Send", si: "යවන්න" },
  cancel: { he: "ביטול", en: "Cancel", si: "අවලංගු" },
  required: { he: "שדה חובה", en: "Required", si: "අවශ්‍ය" },
  invalidPassport: { he: "מספר דרכון לא תקין", en: "Invalid passport number", si: "වලංගු නොවේ" },
  workerNotFound: { he: "עובד לא נמצא", en: "Worker not found", si: "සොයාගත නොහැක" },
  changeRequested: { he: "בקשת השינוי נשלחה", en: "Change request sent", si: "ඉල්ලීම යවන ලදී" },
  noReports: { he: "אין דיווחים עדיין", en: "No reports yet", si: "තවම වාර්තා නැත" },
  workplace: { he: "מקום עבודה", en: "Workplace", si: "වැඩ ස්ථානය" },
};

export function t(key: keyof typeof dict, lang: Lang): string {
  return dict[key]?.[lang] ?? key;
}

export const dirFor = (lang: Lang): "rtl" | "ltr" => (lang === "he" ? "rtl" : "ltr");
