/* Модуль «forms» живого слоя снимков.
 *
 * Что здесь живёт и зачем:
 *   1. Телефонная маска Tilda с настоящим выбором страны. Разметку поля
 *      (флаг, треугольник, «+7») генератор снимков уже кладёт в HTML, но
 *      поведение ей давал вырезанный `tilda-phone-mask-1.1.min.js`: без него
 *      флаг — картинка-обманка, список стран не открывается, маски нет.
 *   2. Календарь для поля даты — то же самое с `tilda-date-picker-1.0.min.js`:
 *      в снимке остаётся поле с иконкой, а нажатие по нему ничего не делает.
 *   3. Проверка формы перед отправкой — из `tilda-forms-1.0.min.js`: пустое имя,
 *      пустой или мусорный телефон и неотмеченное согласие должны подсвечиваться
 *      красной рамкой с подсказкой «Обязательное поле», а не улетать в «Спасибо».
 *
 * Таблицы стран, масок, позиций флагов в спрайте и правила проверки сняты
 * один в один с оригинальных скриптов Tilda (архив
 * `work/tester-report/origin/js/`), чтобы поведение совпадало с чезаквест.рф.
 */

// Страна: [название в списке, телефонный код, маска, позиция флага в спрайте flags7.png].
const COUNTRIES = {
  af: ['Afghanistan (افغانستان)', '+93', '+93-00-000-0000', '-61px -5px'],
  al: ['Albania (Shqipëri)', '+355', '+355(000) 000-000', '-117px -5px'],
  dz: ['Algeria (الجزائر)', '+213', '+213-00-000-0000', '-61px -97px'],
  ad: ['Andorra', '+376', '+376-000-000', '-5px -5px'],
  ao: ['Angola', '+244', '+244(000) 000-000', '-173px -5px'],
  am: ['Armenia (Հայաստան)', '+374', '+374-00-000-000', '-145px -5px'],
  ag: ['Antigua and Barbuda', '+1 (268)', '+1 (268)000-0000', '-89px -5px'],
  ar: ['Argentina', '+54', '+54(000) 0000-0000', '-201px -5px'],
  au: ['Australia', '+61', '+61-00-0000-0000', '-257px -5px'],
  at: ['Austria (Österreich)', '+43', '+43(000) 000-00000', '-229px -5px'],
  az: ['Azerbaijan (Azərbaycan)', '+994', '+994-00-000-00-00', '-285px -5px'],
  bs: ['Bahamas', '+1 (242)', '+1 (242)000-0000', '-5px -51px'],
  bh: ['Bahrain (البحرين)', '+973', '+973-0000-0000', '-145px -28px'],
  bd: ['Bangladesh (বাংলাদেশ)', '+880', '+880-0000-000000', '-33px -28px'],
  bb: ['Barbados', '+1 (246)', '+1 (246)000-0000', '-5px -28px'],
  by: ['Belarus (Беларусь)', '+375', '+375(00) 000-00-00', '-89px -51px'],
  be: ['Belgium (België)', '+32', '+32(000) 000-000', '-61px -28px'],
  bz: ['Belize', '+501', '+501-000-0000', '-117px -51px'],
  bj: ['Benin (Bénin)', '+229', '+229-00-00-0000', '-201px -28px'],
  bt: ['Bhutan (འབྲུག)', '+975', '+975-0-000-0000', '-33px -51px'],
  bo: ['Bolivia', '+591', '+591-0-000-0000', '-285px -28px'],
  ba: ['Bosnia and Herzegovina', '+387', '+387-00-000-0000', '-313px -5px'],
  bw: ['Botswana', '+267', '+267-00-000-000', '-61px -51px'],
  br: ['Brazil (Brasil)', '+55', '+55(00) 00000-0000', '-313px -28px'],
  bn: ['Brunei', '+673', '+673-000-0000', '-257px -28px'],
  bg: ['Bulgaria (България)', '+359', '+359(000) 000-000', '-117px -28px'],
  bf: ['Burkina Faso', '+226', '+226-00-00-0000', '-89px -28px'],
  bi: ['Burundi (Uburundi)', '+257', '+257-00-00-0000', '-173px -28px'],
  kh: ['Cambodia (កម្ពុជា)', '+855', '+855-00-000-000', '-229px -166px'],
  cm: ['Cameroon (Cameroun)', '+237', '+237-0-00-00-00-00', '-33px -74px'],
  ca: ['Canada', '+1', '+1(000) 000-0000', '-145px -51px'],
  cv: ['Cape Verde (Kabu Verdi)', '+238', '+238(000) 00-00', '-173px -74px'],
  bq: ['Caribbean Netherlands', '+599', '+599-0-000-0000', '-89px -258px'],
  ky: ['Cayman Islands', '+1', '+1(000) 000-0000', '-367px -28px'],
  cf: ['Central African Republic (République centrafricaine)', '+236', '+236-00-00-0000', '-201px -51px'],
  td: ['Chad (Tchad)', '+235', '+235-00-00-00-00', '-173px -327px'],
  cl: ['Chile', '+56', '+56-0-0000-0000', '-5px -74px'],
  cn: ['China (中国)', '+86', '+86(000) 0000-0000', '-61px -74px'],
  co: ['Colombia', '+57', '+57(000) 000-0000', '-89px -74px'],
  km: ['Comoros (جزر القمر)', '+269', '+269-00-00000', '-285px -166px'],
  cd: ['Congo (DRC) (Jamhuri ya Kidemokrasia ya Kongo)', '+243', '+243(000) 000-000', '-173px -51px'],
  cg: ['Congo (Republic) (Congo-Brazzaville)', '+242', '+242-00-000-0000', '-229px -51px'],
  ck: ['Cook Islands', '+682', '+682-00-000', '-313px -51px'],
  cr: ['Costa Rica', '+506', '+506-0000-0000', '-117px -74px'],
  ci: ['Cote d’Ivoire', '+225', '+225-00-00-00-0000', '-285px -51px'],
  hr: ['Croatia (Hrvatska)', '+385', '+385-00-000-0000', '-117px -143px'],
  cu: ['Cuba', '+53', '+53-0-000-0000', '-145px -74px'],
  cy: ['Cyprus (Κύπρος)', '+357', '+357-00-000-000', '-201px -74px'],
  cz: ['Czech Republic (Česká republika)', '+420', '+420-000-000-000', '-229px -74px'],
  dk: ['Denmark (Danmark)', '+45', '+45-00-00-00-00', '-313px -74px'],
  dj: ['Djibouti', '+253', '+253-00-00-00-00', '-285px -74px'],
  dm: ['Dominica', '+1 (767)', '+1 (767)000-0000', '-5px -97px'],
  do: ['Dominican Republic (República Dominicana)', '+1', '+1(000) 000-0000', '-33px -97px'],
  ec: ['Ecuador', '+593', '+593-00-000-0000', '-89px -97px'],
  eg: ['Egypt (مصر)', '+20', '+20(000) 000-0000', '-145px -97px'],
  sv: ['El Salvador', '+503', '+503-00-00-0000', '-89px -327px'],
  gq: ['Equatorial Guinea (Guinea Ecuatorial)', '+240', '+240-00-000-0000', '-257px -120px'],
  er: ['Eritrea', '+291', '+291-0-000-000', '-201px -97px'],
  ee: ['Estonia (Eesti)', '+372', '+372-0000-0000', '-117px -97px'],
  et: ['Ethiopia', '+251', '+251-00-000-0000', '-257px -97px'],
  fj: ['Fiji', '+679', '+679-000-0000', '-313px -97px'],
  fi: ['Finland (Suomi)', '+358', '+358-000-0000000', '-285px -97px'],
  fr: ['France', '+33', '+33(000) 00-00-00', '-33px -120px'],
  ga: ['Gabon', '+241', '+241-0-00-00-00', '-61px -120px'],
  gm: ['Gambia', '+220', '+220(000) 00-00', '-201px -120px'],
  ge: ['Georgia (საქართველო)', '+995', '+995(000) 000-000', '-145px -120px'],
  de: ['Germany (Deutschland)', '+49', '+49(000) 000-000000', '-257px -74px'],
  gh: ['Ghana (Gaana)', '+233', '+233(000) 000-000', '-173px -120px'],
  gr: ['Greece (Ελλάδα)', '+30', '+30(000) 000-0000', '-285px -120px'],
  gd: ['Grenada', '+1 (473)', '+1 (473)000-0000', '-117px -120px'],
  gt: ['Guatemala', '+502', '+502-0-000-0000', '-313px -120px'],
  gn: ['Guinea (Guinée)', '+224', '+224-000-00-00-00', '-229px -120px'],
  gw: ['Guinea-Bissau (Guiné Bissau)', '+245', '+245-0-000000', '-5px -143px'],
  gy: ['Guyana', '+592', '+592-000-0000', '-33px -143px'],
  ht: ['Haiti', '+509', '+509-00-00-0000', '-145px -143px'],
  hn: ['Honduras', '+504', '+504-0000-0000', '-89px -143px'],
  hk: ['Hong Kong (香港)', '+852', '+852-0000-0000', '-61px -143px'],
  hu: ['Hungary (Magyarország)', '+36', '+36(000) 000-000', '-173px -143px'],
  is: ['Iceland (Ísland)', '+354', '+354-000-0000', '-33px -166px'],
  in: ['India (भारत)', '+91', '+91(0000) 000-000', '-285px -143px'],
  id: ['Indonesia', '+62', '+62(000) 000-00-0000', '-201px -143px'],
  ir: ['Iran (ایران)', '+98', '+98(000) 000-0000', '-5px -166px'],
  iq: ['Iraq (العراق)', '+964', '+964(000) 000-0000', '-313px -143px'],
  ie: ['Ireland', '+353', '+353(000) 000-000', '-229px -143px'],
  il: ['Israel (ישראל)', '+972', '+972-000-000-0000', '-257px -143px'],
  it: ['Italy (Italia)', '+39', '+39(000) 0000-000', '-61px -166px'],
  jm: ['Jamaica', '+1', '+1(000) 000-0000', '-89px -166px'],
  jp: ['Japan (日本)', '+81', '+81-00-0000-0000', '-145px -166px'],
  jo: ['Jordan (الأردن)', '+962', '+962-0-0000-0000', '-117px -166px'],
  kz: ['Kazakhstan (Казахстан)', '+7', '+7(000) 000-00-00', '-117px -189px'],
  ke: ['Kenya', '+254', '+254-000-000000', '-173px -166px'],
  ki: ['Kiribati', '+686', '+686-0000-0000', '-257px -166px'],
  xk: ['Kosovo (Republic)', '+383', '+383-00-000-000', '-89px -350px'],
  kw: ['Kuwait (الكويت)', '+965', '+965-0000-0000', '-89px -189px'],
  kg: ['Kyrgyzstan (Кыргызстан)', '+996', '+996(000) 000-000', '-201px -166px'],
  la: ['Laos (ລາວ)', '+856', '+856-00-000-000', '-145px -189px'],
  lv: ['Latvia (Latvija)', '+371', '+371-00-000-000', '-61px -212px'],
  lb: ['Lebanon (لبنان)', '+961', '+961-00-000-000', '-173px -189px'],
  ls: ['Lesotho', '+266', '+266-0-000-0000', '-313px -189px'],
  lr: ['Liberia', '+231', '+231-00-000-0000', '-285px -189px'],
  ly: ['Libya (ليبيا)', '+218', '+218-00-000-000', '-89px -212px'],
  li: ['Liechtenstein', '+423', '+423-000-00-00', '-229px -189px'],
  lt: ['Lithuania (Lietuva)', '+370', '+370(000) 00-000', '-5px -212px'],
  lu: ['Luxembourg', '+352', '+352(000) 000-000', '-33px -212px'],
  mo: ['Macao', '+853', '+853-0000-0000', '-61px -235px'],
  mk: ['Macedonia (FYROM) (Македонија)', '+389', '+389-00-000-000', '-285px -212px'],
  mg: ['Madagascar (Madagasikara)', '+261', '+261-00-00-00000', '-229px -212px'],
  mw: ['Malawi', '+265', '+265-0-0000-0000', '-201px -235px'],
  my: ['Malaysia', '+60', '+60-00-0000-0000', '-257px -235px'],
  mv: ['Maldives', '+960', '+960-000-0000', '-173px -235px'],
  ml: ['Mali', '+223', '+223-00-00-0000', '-313px -212px'],
  mt: ['Malta', '+356', '+356-0000-0000', '-117px -235px'],
  mh: ['Marshall Islands', '+692', '+692-000-0000', '-257px -212px'],
  mr: ['Mauritania (موريتانيا)', '+222', '+222-00-00-0000', '-89px -235px'],
  mu: ['Mauritius (Moris)', '+230', '+230-000-00000', '-145px -235px'],
  mx: ['Mexico (México)', '+52', '+52(000) 000-0000', '-229px -235px'],
  mb: ['Mexico (México)', '+521', '+521(000) 000-0000', '-229px -235px'],
  fm: ['Micronesia', '+691', '+691-000-0000', '-5px -120px'],
  md: ['Moldova (Republica Moldova)', '+373', '+373-0000-0000', '-173px -212px'],
  mc: ['Monaco', '+377', '+377-00-000-000', '-145px -212px'],
  mn: ['Mongolia (Монгол)', '+976', '+976-00-00-0000', '-33px -235px'],
  me: ['Montenegro (Crna Gora)', '+382', '+382-00-000-000', '-201px -212px'],
  ma: ['Morocco (المغرب)', '+212', '+212-00-0000-000', '-117px -212px'],
  mz: ['Mozambique (Moçambique)', '+258', '+258-000-000-000', '-285px -235px'],
  mm: ['Myanmar (Burma) (မြန်မာ)', '+95', '+95-00-000-000', '-5px -235px'],
  na: ['Namibia (Namibië)', '+264', '+264-00-000-0000', '-313px -235px'],
  nr: ['Nauru', '+674', '+674-000-0000', '-145px -258px'],
  np: ['Nepal (नेपाल)', '+977', '+977-000-000-0000', '-341px -5px'],
  nl: ['Netherlands (Nederland)', '+31', '+31-00-000-0000', '-89px -258px'],
  nc: ['New Caledonia', '+687', '+687 00-00-00', '-229px -350px'],
  nz: ['New Zealand', '+64', '+64(000)000-0000', '-201px -258px'],
  ni: ['Nicaragua', '+505', '+505-0000-0000', '-61px -258px'],
  ne: ['Niger (Nijar)', '+227', '+227-00-00-0000', '-5px -258px'],
  ng: ['Nigeria', '+234', '+234-000-000-0000', '-33px -258px'],
  nu: ['Niue', '+683', '+683-0000', '-173px -258px'],
  kp: ['North Korea (조선 민주주의 인민 공화국)', '+850', '+850-00-000-000', '-5px -189px'],
  no: ['Norway (Norge)', '+47', '+47(000) 00-000', '-117px -258px'],
  om: ['Oman (عُمان)', '+968', '+968-00-000-000', '-229px -258px'],
  pa: ['Panama', '+507', '+507-0000-0000', '-257px -258px'],
  pk: ['Pakistan (پاکستان)', '+92', '+92(000) 000-0000', '-33px -281px'],
  pw: ['Palau', '+680', '+680-000-0000', '-145px -281px'],
  ps: ['Palestinian Territory', '+970', '+970-00 000 0000', '-89px -281px'],
  pg: ['Papua New Guinea', '+675', '+675(000) 00-000', '-313px -258px'],
  py: ['Paraguay', '+595', '+595(000) 000-000', '-173px -281px'],
  pe: ['Peru (Perú)', '+51', '+51(000) 000-000', '-285px -258px'],
  ph: ['Philippines', '+63', '+63(000) 000-0000', '-5px -281px'],
  pl: ['Poland (Polska)', '+48', '+48(000) 000-000', '-61px -281px'],
  pt: ['Portugal', '+351', '+351-00-000-0000', '-117px -281px'],
  qa: ['Qatar (قطر)', '+974', '+974-0000-0000', '-201px -281px'],
  ro: ['Romania (România)', '+40', '+40-00-000-0000', '-229px -281px'],
  ru: ['Russian Federation (Российская Федерация)', '+7', '+7(000) 000-00-00', '-285px -281px'],
  rw: ['Rwanda', '+250', '+250(000) 000-000', '-313px -281px'],
  kn: ['Saint Kitts and Nevis', '+1 (869)', '+1 (869)000-0000', '-313px -166px'],
  lc: ['Saint Lucia', '+1 (758)', '+1 (758)000-0000', '-201px -189px'],
  vc: ['Saint Vincent and the Grenadines', '+1 (784)', '+1 (784)000-0000', '-341px -304px'],
  ws: ['Samoa', '+685', '+685-00-0000', '-61px -350px'],
  sm: ['San Marino', '+378', '+378-0000-000000', '-257px -304px'],
  st: ['Sao Tome and Principe (São Tomé e Príncipe)', '+239', '+239-00-00000', '-61px -327px'],
  sa: ['Saudi Arabia (المملكة العربية السعودية)', '+966', '+966-0-0000-0000', '-5px -304px'],
  sn: ['Senegal (Sénégal)', '+221', '+221-00-000-0000', '-285px -304px'],
  rs: ['Serbia (Србија)', '+381', '+381-00-000-0000', '-257px -281px'],
  sc: ['Seychelles', '+248', '+248-0-000-000', '-61px -304px'],
  sl: ['Sierra Leone', '+232', '+232-00-000000', '-229px -304px'],
  sg: ['Singapore', '+65', '+65-0000-0000', '-145px -304px'],
  sk: ['Slovakia (Slovensko)', '+421', '+421(000) 000-000', '-201px -304px'],
  si: ['Slovenia (Slovenija)', '+386', '+386-00-000-000', '-173px -304px'],
  sb: ['Solomon Islands', '+677', '+677-000-0000', '-33px -304px'],
  so: ['Somalia (Soomaaliya)', '+252', '+252-000-000-000', '-313px -304px'],
  za: ['South Africa', '+27', '+27-00-000-0000', '-145px -350px'],
  kr: ['South Korea (대한민국)', '+82', '+82-00-0000-0000', '-33px -189px'],
  ss: ['South Sudan (جنوب السودان)', '+211', '+211-00-000-0000', '-33px -327px'],
  es: ['Spain (España)', '+34', '+34(000) 000-000', '-229px -97px'],
  lk: ['Sri Lanka (ශ්‍රී ලංකාව)', '+94', '+94-00-000-0000', '-257px -189px'],
  sd: ['Sudan (السودان)', '+249', '+249-00-000-0000', '-89px -304px'],
  sr: ['Suriname', '+597', '+597-000-0000', '-5px -327px'],
  sz: ['Swaziland', '+268', '+268-00-00-0000', '-145px -327px'],
  se: ['Sweden (Sverige)', '+46', '+46-00-000-0000', '-117px -304px'],
  ch: ['Switzerland (Schweiz)', '+41', '+41-00-000-0000', '-257px -51px'],
  sy: ['Syria (سوريا)', '+963', '+963-00-0000-000', '-117px -327px'],
  tw: ['Taiwan (台灣)', '+886', '+886-0000-0000', '-341px -120px'],
  tj: ['Tajikistan', '+992', '+992-00-000-0000', '-257px -327px'],
  tz: ['Tanzania', '+255', '+255-00-000-0000', '-341px -143px'],
  th: ['Thailand (ไทย)', '+66', '+66-00-000-0000', '-229px -327px'],
  tg: ['Togo', '+228', '+228-00-000-000', '-201px -327px'],
  to: ['Tonga', '+676', '+676-00000', '-341px -28px'],
  tt: ['Trinidad and Tobago', '+1 (868)', '+1 (868)000-0000', '-341px -74px'],
  tn: ['Tunisia (تونس)', '+216', '+216-00-000-000', '-367px -5px'],
  tr: ['Turkey (Türkiye)', '+90', '+90(000) 000-0000', '-341px -51px'],
  tm: ['Turkmenistan', '+993', '+993-0-000-0000', '-313px -327px'],
  tv: ['Tuvalu', '+688', '+688-000000', '-341px -97px'],
  ug: ['Uganda', '+256', '+256(000) 000-000', '-341px -189px'],
  ua: ['Ukraine (Україна)', '+380', '+380(00) 000-00-00', '-341px -166px'],
  ae: ['United Arab Emirates (الإمارات العربية المتحدة)', '+971', '+971-00-000-00000', '-33px -5px'],
  gb: ['United Kingdom', '+44', '+44-00-0000-00000', '-89px -120px'],
  us: ['USA', '+1', '+1(000) 000-0000', '-341px -212px'],
  uy: ['Uruguay', '+598', '+598-0-000-00-00', '-341px -235px'],
  uz: ['Uzbekistan (Oʻzbekiston)', '+998', '+998-00-000-0000', '-341px -258px'],
  vu: ['Vanuatu', '+678', '+678-00-00000', '-33px -350px'],
  va: ['Vatican City (Città del Vaticano)', '+39', '+39-0-000-00000', '-341px -281px'],
  ve: ['Venezuela', '+58', '+58(000) 000-0000', '-341px -327px'],
  vn: ['Vietnam (Việt Nam)', '+84', '+84-00-0000-000', '-5px -350px'],
  ye: ['Yemen (اليمن)', '+967', '+967-0-000-000', '-117px -350px'],
  zm: ['Zambia', '+260', '+260-00-000-0000', '-173px -350px'],
  zw: ['Zimbabwe', '+263', '+263-0-00-0000000', '-201px -350px'],
  gp: ['Guadeloupe', '+590', '+590-000-00-00-00', '-367px -51px'],
};

const DEFAULT_ISO = 'ru';

// У Tilda минимальная длина номера считается как максимальная минус поправка
// по стране: где-то номер бывает на цифру-две короче полной маски.
const MIN_LENGTH_TOLERANCE = {
  '+49': 3, '+372': 1, '+355': 1, '+213': 1, '+975': 1, '+267': 1, '+359': 1,
  '+53': 1, '+36': 1, '+961': 1, '+54': 1, '+82': 1, '+880': 1, '+970': 1,
  '+385': 1, '+43': 1, '+357': 1, '+61': 1, '+507': 1, '+55': 1, '+593': 1,
  '+383': 1, '+39': 1, '+86': 1, '+977': 1, '+230': 1, '+63': 1, '+258': 1,
  '+381': 1, '+252': 1, '+971': 1, '+387': 1, '+972': 2, '+234': 2, '+60': 2,
  '+64': 2, '+62': 3, '+44': 4, '+358': 4, '+263': 3,
};

// Страны, где ведущий ноль — внутренний префикс и в международный номер не идёт.
const TRUNK_PREFIX_CODES = [
  '+33', '+380', '+373', '+44', '+49', '+31', '+32', '+41', '+43', '+90',
  '+40', '+48', '+971',
];

// Тексты ошибок — русский словарь из tilda-forms-1.0.min.js. Подсказка у поля
// и сообщение в общей плашке у Tilda разные: у поля «Обязательное поле»,
// в плашке «Пожалуйста, заполните все обязательные поля».
const MESSAGES = {
  req: 'Обязательное поле',
  phone: 'Укажите, пожалуйста, корректный номер телефона',
  email: 'Укажите, пожалуйста, корректный email',
  name: 'Укажите, пожалуйста, имя',
  date: 'Укажите, пожалуйста, корректную дату',
  number: 'Укажите, пожалуйста, корректный номер',
  minlength: 'Слишком короткое значение',
  maxlength: 'Слишком длинное',
};

const FORM_MESSAGES = { ...MESSAGES, req: 'Пожалуйста, заполните все обязательные поля' };

const digits = (value) => (String(value).match(/\d+/gu) || []).join('');

/* ------------------------------------------------------------------ *
 *  Телефонная маска                                                    *
 * ------------------------------------------------------------------ */

/** Длины номера с кодом страны: как в t_form_phonemask__getMinMaxLength. */
function phoneLengths(placeholder, code) {
  if (!placeholder || !code) return { minLength: 1, maxLength: 20 };
  const maxLength = code.length + 1 + placeholder.length;
  return { maxLength, minLength: maxLength - (MIN_LENGTH_TOLERANCE[code] || 0) };
}

/** Хвост маски без кода страны: «+7(000) 000-00-00» → «(000) 000-00-00». */
const maskTail = (mask, code) => mask.slice(code.length).replace(/^-+/u, '');

/** Раскладывает введённые цифры по маске страны (t_form_phonemask__addNumberMask). */
function applyNumberMask(rawValue, input) {
  const code = input.getAttribute('data-phonemask-code') || '';
  const mask = (input.getAttribute('data-phonemask-mask') || '').slice(code.length);
  const parts = mask.match(/(\+|\d+|[\s()-]|0+)/gu);
  if (!parts) return;
  const pool = digits(rawValue).split('');
  let result = '';
  for (const part of parts) {
    if (part[0] === '0') {
      result += pool.splice(0, part.length).join('');
    } else {
      result += part;
    }
  }
  input.value = result.replace(/[\s()-]+$/u, '').replace(/^-+/u, '');
}

/** Синхронизирует скрытые поля с видимым — оттуда значение и берёт проверка. */
function syncPhoneResult(wrap, input) {
  const result = wrap.querySelector('.js-phonemask-result');
  const resultIso = wrap.querySelector('.js-phonemask-result-iso');
  if (!input.value) return;
  if (result) result.value = `${input.getAttribute('data-phonemask-code')} ${input.value}`;
  if (resultIso) resultIso.value = input.getAttribute('data-phonemask-code') || '';
}

/** Вставленный номер может прийти с кодом страны — срезаем его. */
function stripCountryCode(value, code) {
  const normalised = String(value).replace('+', '').replace(/^8/u, '7');
  const bare = String(code).replace('+', '');
  return normalised.startsWith(bare) ? normalised.slice(bare.length).trim() : value;
}

function handlePhoneInput(wrap, input) {
  const value = input.value;
  if (!value || value === '(') {
    input.value = '';
    const result = wrap.querySelector('.js-phonemask-result');
    const resultIso = wrap.querySelector('.js-phonemask-result-iso');
    if (result) result.value = '';
    if (resultIso) resultIso.value = '';
  }
  const code = input.getAttribute('data-phonemask-code');
  // «89…» и «79…» в российском номере — это тот же номер с городским префиксом.
  if (code === '+7' && (value.indexOf('89') === 1 || value.indexOf('79') === 1)) {
    input.value = value.replace(/^.(8|7)9/u, '9');
  }
  if (TRUNK_PREFIX_CODES.includes(code) && value.startsWith('0')) {
    input.value = value.replace(/^0/u, '');
  }
  const withoutCode = input.getAttribute('data-phonemask-without-code') || '';
  const typed = digits(input.value);
  const source = typed.length > digits(withoutCode).length
    ? stripCountryCode(input.value, code)
    : input.value;
  applyNumberMask(source, input);
  syncPhoneResult(wrap, input);
  input.setAttribute('data-phonemask-current', input.value);
}

/** Ставит на поле выбранную страну: код, флаг, маску, плейсхолдер и длины. */
function applyCountry(wrap, iso, options = {}) {
  const country = COUNTRIES[iso] || COUNTRIES[DEFAULT_ISO];
  const [, code, mask, flagPosition] = country;
  const input = wrap.querySelector('.t-input-phonemask');
  const codeLabel = wrap.querySelector('.t-input-phonemask__select-code');
  const flag = wrap.querySelector('.t-input-phonemask__select-flag');
  if (!input) return;

  const previous = input.getAttribute('data-phonemask-current');
  const tail = maskTail(mask, code);
  input.setAttribute('data-phonemask-iso', iso);
  input.setAttribute('data-phonemask-code', code);
  input.setAttribute('data-phonemask-mask', mask);
  input.setAttribute('data-phonemask-without-code', tail);
  input.setAttribute('placeholder', tail);
  input.setAttribute('maxlength', String(tail.length));
  if (codeLabel) codeLabel.textContent = code;
  if (flag) {
    flag.setAttribute('data-phonemask-flag', iso);
    flag.style.backgroundPosition = flagPosition;
  }

  const result = wrap.querySelector('.js-phonemask-result');
  if (result) {
    result.setAttribute('data-tilda-rule-minlength', String(phoneLengths(tail, code).minLength));
  }
  if (previous) applyNumberMask(previous, input);
  syncPhoneResult(wrap, input);
  if (!options.noFocus) input.focus();
}

/* --- выпадающий список стран --- */

let optionsWrap = null;
let searchBuffer = '';
let searchTimer = 0;
let activeWrap = null;

function countryListMarkup() {
  return Object.entries(COUNTRIES).map(([iso, [name, code, mask, flagPosition]]) => (
    `<div class="t-input-phonemask__options-item" id="t-phonemask_${iso}"`
    + ` data-phonemask-name="${name.replace(/"/gu, '&quot;')}" data-phonemask-mask="${mask}"`
    + ` data-phonemask-country-code="${iso}" data-phonemask-code="${code}" role="option">`
    + `<div class="t-input-phonemask__options-name">${name}</div>`
    + '<div class="t-input-phonemask__options-right">'
    + `<span class="t-input-phonemask__options-code">${code}</span>`
    + `<span class="t-input-phonemask__options-flag" style="background-position:${flagPosition}"></span>`
    + '</div></div>'
  )).join('');
}

function ensureOptionsWrap() {
  if (optionsWrap) return optionsWrap;
  optionsWrap = document.createElement('div');
  optionsWrap.className = 't-input-phonemask__options-wrap';
  optionsWrap.setAttribute('data-nosnippet', '');
  optionsWrap.setAttribute('role', 'listbox');
  optionsWrap.setAttribute('aria-label', 'Выбор страны');
  optionsWrap.innerHTML = countryListMarkup();
  // Спрайт флагов приходит переменной на .source-snapshot-shell, а список висит
  // в body и наследовать её не может — переносим значение руками.
  const shell = document.querySelector('.source-snapshot-shell');
  const flagsUrl = shell ? getComputedStyle(shell).getPropertyValue('--source-flags-url') : '';
  if (flagsUrl.trim()) optionsWrap.style.setProperty('--source-flags-url', flagsUrl.trim());
  document.body.append(optionsWrap);
  optionsWrap.addEventListener('click', (event) => {
    const item = event.target instanceof Element
      ? event.target.closest('.t-input-phonemask__options-item')
      : null;
    if (!item || !activeWrap) return;
    applyCountry(activeWrap, item.getAttribute('data-phonemask-country-code'));
    closeCountryList();
  });
  return optionsWrap;
}

/** Список висит в body с position:fixed — держим его под своим полем. */
function positionOptions() {
  if (!optionsWrap || !activeWrap) return;
  const box = activeWrap.getBoundingClientRect();
  const listWidth = optionsWrap.getBoundingClientRect().width;
  const viewport = document.documentElement.clientWidth;
  if (listWidth + box.x < viewport) {
    optionsWrap.style.right = 'unset';
    optionsWrap.style.left = `${box.x}px`;
  } else {
    optionsWrap.style.left = 'unset';
    optionsWrap.style.right = `${viewport - (box.x + box.width)}px`;
  }
  optionsWrap.style.top = `${box.y + box.height + 5}px`;
}

const repositionOptions = () => requestAnimationFrame(positionOptions);

function closeCountryList() {
  if (!optionsWrap) return;
  optionsWrap.classList.remove('t-input-phonemask__options-wrap_open');
  activeWrap = null;
  window.removeEventListener('resize', repositionOptions);
  document.removeEventListener('scroll', repositionOptions, true);
}

function openCountryList(wrap) {
  const list = ensureOptionsWrap();
  if (activeWrap === wrap && list.classList.contains('t-input-phonemask__options-wrap_open')) {
    closeCountryList();
    return;
  }
  closeCountryList();
  activeWrap = wrap;
  list.classList.add('t-input-phonemask__options-wrap_open');
  const chosen = list.querySelector('.t-input-phonemask__options-item_chosen');
  if (chosen) chosen.classList.remove('t-input-phonemask__options-item_chosen');
  positionOptions();
  // прокручиваем к текущей стране, чтобы список открывался «на своём месте»
  const iso = wrap.querySelector('.t-input-phonemask')?.getAttribute('data-phonemask-iso');
  const current = iso ? list.querySelector(`#t-phonemask_${iso}`) : null;
  list.scrollTop = current ? current.offsetTop - list.clientHeight / 2 : 0;
  window.addEventListener('resize', repositionOptions);
  document.addEventListener('scroll', repositionOptions, true);
}

/** Поиск по списку с клавиатуры: цифры ищут по коду, буквы — по названию. */
function searchCountry(event) {
  if (!optionsWrap || !optionsWrap.classList.contains('t-input-phonemask__options-wrap_open')) return;
  const isDigit = /^[0-9]$/u.test(event.key);
  const isLetter = /^[a-zA-Zа-яА-ЯёЁ]$/u.test(event.key);
  if (!isDigit && !isLetter) return;
  const previous = optionsWrap.querySelector('.t-input-phonemask__options-item_chosen');
  if (previous) previous.classList.remove('t-input-phonemask__options-item_chosen');
  searchBuffer += event.key;
  const needle = searchBuffer.replace(/[-[\]/{}()*+?.\\^$|]/gu, '\\$&');
  const matcher = isDigit
    ? new RegExp(needle)
    : new RegExp(`(^|\\()${needle}`, 'iu');
  const found = Object.entries(COUNTRIES)
    .filter(([, [name, code]]) => matcher.test(isDigit ? code : name))
    .map(([iso, [, code]]) => ({ iso, code }))
    .sort((a, b) => a.code.length - b.code.length)[0];
  if (found) {
    const item = optionsWrap.querySelector(`#t-phonemask_${found.iso}`);
    if (item) {
      item.classList.add('t-input-phonemask__options-item_chosen');
      optionsWrap.scrollTop = item.offsetTop - optionsWrap.clientHeight / 2;
    }
  }
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => { searchBuffer = ''; }, 1500);
}

/** Готовит одно поле телефона: скрытые поля-результаты, маска, обработчики. */
function initPhoneField(wrap) {
  if (wrap.dataset.sourcePhonemask === 'ready') return;
  const input = wrap.querySelector('input.t-input-phonemask');
  if (!input) return;
  wrap.dataset.sourcePhonemask = 'ready';

  // Тень оригинала: видимое поле хранит только «хвост» номера, а проверяется
  // и уходит в форму скрытое поле с полным номером — там же лежит правило.
  // Часть снимков снята уже с готовой маской (home.html), там скрытые поля
  // на месте и второй комплект сломал бы проверку — пустой дубль всегда
  // ругался бы «Обязательное поле».
  if (!wrap.querySelector('.js-phonemask-result-iso')) {
    const resultIso = document.createElement('input');
    resultIso.type = 'hidden';
    resultIso.className = 'js-phonemask-result-iso';
    resultIso.name = 'tildaspec-phone-part[]-iso';
    resultIso.tabIndex = -1;
    input.before(resultIso);
  }

  if (!wrap.querySelector('.js-phonemask-result')) {
    const required = input.hasAttribute('required')
      || input.getAttribute('data-tilda-req') === '1';
    const result = document.createElement('input');
    result.type = 'hidden';
    result.className = 'js-phonemask-result js-tilda-rule';
    result.setAttribute('data-tilda-rule', 'phone');
    result.name = input.getAttribute('name') || 'phone';
    result.tabIndex = -1;
    if (required) result.setAttribute('data-tilda-req', '1');
    input.after(result);

    input.classList.remove('js-tilda-rule');
    input.removeAttribute('required');
    input.setAttribute('name', 'tildaspec-phone-part[]');
  }
  input.setAttribute('type', 'tel');
  input.setAttribute('autocomplete', 'tel');

  // Подсказка об ошибке абсолютная — блоку поля нужен видимый перехлёст.
  const block = wrap.closest('.t-input-block');
  if (block instanceof HTMLElement) block.style.overflow = 'visible';

  applyCountry(wrap, DEFAULT_ISO, { noFocus: true });

  input.addEventListener('input', () => handlePhoneInput(wrap, input));
  input.addEventListener('paste', (event) => {
    const text = (event.clipboardData || window.clipboardData)?.getData('text');
    if (!text) return;
    event.preventDefault();
    input.value = text.replace(/[^0-9+]/gu, '');
    handlePhoneInput(wrap, input);
  });

  const select = wrap.querySelector('.t-input-phonemask__select');
  if (select) {
    select.setAttribute('role', 'button');
    select.setAttribute('tabindex', '0');
    select.setAttribute('aria-label', 'Выбрать страну');
    select.addEventListener('click', () => openCountryList(wrap));
    select.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      openCountryList(wrap);
    });
  }
}

/* ------------------------------------------------------------------ *
 *  Календарь для поля даты                                             *
 * ------------------------------------------------------------------ */

const pageLang = () => (document.documentElement.getAttribute('lang') || 'ru').slice(0, 2);

function monthNames() {
  const lang = pageLang();
  return Array.from({ length: 12 }, (_, index) => (
    new Date(Date.UTC(2006, index, 1)).toLocaleDateString(lang, { month: 'long', timeZone: 'UTC' })
  ));
}

function weekDayNames() {
  const lang = pageLang();
  // 1..7 января 2006 — это воскресенье…суббота; неделю начинаем с понедельника.
  const week = Array.from({ length: 7 }, (_, index) => (
    new Date(Date.UTC(2006, 0, index + 1)).toLocaleDateString(lang, { weekday: 'short', timeZone: 'UTC' }).slice(0, 2)
  ));
  return [...week.slice(1), week[0]];
}

const DATE_DIVIDERS = { dash: '-', slash: '/', dot: '.' };
const dateDivider = (input) => DATE_DIVIDERS[input.getAttribute('data-tilda-datediv')] || '.';

/** Разбирает значение поля в объект по формату Tilda. */
function readDateFromInput(input) {
  const parts = input.value.split(dateDivider(input));
  const format = input.getAttribute('data-tilda-dateformat') || 'DD-MM-YYYY';
  let raw = { day: parts[0], month: parts[1], year: parts[2] };
  if (format === 'MM-DD-YYYY') raw = { day: parts[1], month: parts[0], year: parts[2] };
  if (format === 'YYYY-MM-DD') raw = { day: parts[2], month: parts[1], year: parts[0] };
  return {
    day: parseInt(raw.day, 10),
    month: parseInt(raw.month, 10) - 1,
    year: parseInt(raw.year, 10),
  };
}

function isDateValid({ day, month, year }) {
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) return false;
  if (String(year).length !== 4 || month < 0 || month > 11 || day < 1) return false;
  const probe = new Date(year, month, day);
  return probe.getFullYear() === year && probe.getMonth() === month && probe.getDate() === day;
}

/** Пишет выбранную дату в поле в том формате, который просит разметка. */
function writeDateToInput(input, year, month, day) {
  const pad = (value) => String(value).padStart(2, '0');
  const divider = dateDivider(input);
  const format = input.getAttribute('data-tilda-dateformat') || 'DD-MM-YYYY';
  const parts = { DD: pad(day), MM: pad(month + 1), YYYY: String(year) };
  input.value = format.split('-').map((token) => parts[token]).join(divider);
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Маска ввода 99.99.9999 — цифры сами расставляются по разделителям. */
function applyDateMask(input) {
  const divider = dateDivider(input);
  const raw = digits(input.value).slice(0, 8);
  const groups = [raw.slice(0, 2), raw.slice(2, 4), raw.slice(4, 8)].filter(Boolean);
  input.value = groups.join(divider);
}

const CALENDAR_MIN_YEAR = 1940;
const CALENDAR_MAX_YEAR = 2040;

function buildCalendar() {
  const element = document.createElement('div');
  element.className = 't_datepicker__inner';
  element.style.display = 'none';
  document.body.append(element);
  return element;
}

/** Шапка календаря: стрелки и подписи месяца и года с невидимыми select'ами.
 *  У Tilda подпись кликабельна ровно так: select лежит поверх неё с opacity 0. */
function renderHeader(state) {
  const { year, month, months } = state;
  const years = [];
  for (let value = CALENDAR_MIN_YEAR; value <= CALENDAR_MAX_YEAR; value += 1) years.push(value);
  const options = (values, current) => values
    .map((value) => `<option value="${value}"${value === current ? ' selected' : ''}>${value}</option>`)
    .join('');
  return `<div class="t_datepicker__header">
      <button class="t_datepicker__arrow t_datepicker__arrow_prev" type="button" aria-label="Предыдущий месяц"></button>
      <button class="t_datepicker__arrow t_datepicker__arrow_next" type="button" aria-label="Следующий месяц"></button>
      <div class="t_datepicker__label t_datepicker__label_month"><span>${months[month]}</span>
        <select class="t_datepicker__select t_datepicker__select_month" aria-label="Месяц">${options(months, months[month])}</select>
      </div>
      <div class="t_datepicker__label t_datepicker__label_year"><span>${year}</span>
        <select class="t_datepicker__select t_datepicker__select_year" aria-label="Год">${options(years, year)}</select>
      </div>
    </div>
    <table class="t_datepicker__body"></table>`;
}

function renderMonth(state) {
  const { year, month, weekDays } = state;
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
  const first = new Date(year, month, 1);
  const shift = (first.getDay() + 6) % 7; // понедельник — первый столбец
  const cursor = new Date(year, month, 1 - shift);

  const cells = [];
  for (let index = 0; index < 42; index += 1) {
    const dayDate = new Date(cursor);
    const classes = ['t_datepicker__day-cell'];
    if (dayDate.getMonth() === month) classes.push('t_datepicker__current-month');
    else if (dayDate < first) classes.push('t_datepicker__previous-month');
    else classes.push('t_datepicker__next-month');
    const key = `${dayDate.getFullYear()}-${dayDate.getMonth()}-${dayDate.getDate()}`;
    if (key === todayKey) classes.push('t_datepicker__today');
    if (state.selectedKey === key) classes.push('t_datepicker__selected-day');
    const isPast = dayDate < new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (state.disablePast && isPast) classes.push('t_datepicker__day-cell--disabled');
    if (state.disableFuture && !isPast && key !== todayKey) classes.push('t_datepicker__day-cell--disabled');
    cells.push(
      `<td class="${classes.join(' ')}" data-picker="${dayDate.getFullYear()}-${dayDate.getMonth() + 1}-${dayDate.getDate()}">${dayDate.getDate()}</td>`,
    );
    cursor.setDate(cursor.getDate() + 1);
    if (index === 34 && cursor.getMonth() !== month) break; // шестая строка нужна не всегда
  }

  const head = weekDays
    .map((name, index) => `<th class="t_datepicker__week-day${index > 4 ? ' t_datepicker__week-end' : ''}">${name}</th>`)
    .join('');
  const rows = [];
  for (let index = 0; index < cells.length; index += 7) {
    rows.push(`<tr>${cells.slice(index, index + 7).join('')}</tr>`);
  }

  return `<thead><tr>${head}</tr></thead><tbody>${rows.join('')}</tbody>`;
}

/** Перерисовывает только сетку дней — шапку с открытым select'ом трогать нельзя. */
function refreshMonth(state) {
  const table = state.element.querySelector('.t_datepicker__body');
  if (table) table.innerHTML = renderMonth(state);
  const monthLabel = state.element.querySelector('.t_datepicker__label_month span');
  const yearLabel = state.element.querySelector('.t_datepicker__label_year span');
  if (monthLabel) monthLabel.textContent = state.months[state.month];
  if (yearLabel) yearLabel.textContent = String(state.year);
  const monthSelect = state.element.querySelector('.t_datepicker__select_month');
  const yearSelect = state.element.querySelector('.t_datepicker__select_year');
  if (monthSelect) monthSelect.value = state.months[state.month];
  if (yearSelect) yearSelect.value = String(state.year);
}

function positionCalendar(state) {
  const { input, element } = state;
  const box = input.getBoundingClientRect();
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  const height = element.getBoundingClientRect().height;
  const viewportHeight = document.documentElement.clientHeight;
  const viewportWidth = document.documentElement.clientWidth;
  const width = element.getBoundingClientRect().width;
  let top = box.top + scrollY + box.height;
  if (box.top + box.height + height > viewportHeight && box.top - height > 0) {
    top = box.top + scrollY - height;
  }
  element.style.top = `${top}px`;
  if (box.left + scrollX + width < viewportWidth) {
    element.style.right = 'unset';
    element.style.left = `${box.left + scrollX}px`;
  } else {
    element.style.left = 'unset';
    element.style.right = `${viewportWidth - (box.right + scrollX)}px`;
  }
}

let openCalendar = null;

function closeCalendar() {
  if (!openCalendar) return;
  openCalendar.element.style.display = 'none';
  openCalendar = null;
}

function showCalendar(state) {
  if (openCalendar && openCalendar !== state) closeCalendar();
  const parsed = readDateFromInput(state.input);
  if (isDateValid(parsed)) {
    state.year = parsed.year;
    state.month = parsed.month;
    state.selectedKey = `${parsed.year}-${parsed.month}-${parsed.day}`;
  }
  if (!state.element.firstChild) state.element.innerHTML = renderHeader(state);
  refreshMonth(state);
  state.element.style.display = 'block';
  openCalendar = state;
  positionCalendar(state);
}

function initDateField(input) {
  if (input.dataset.sourceDatepicker === 'ready') return;
  input.dataset.sourceDatepicker = 'ready';
  const today = new Date();
  const unavailable = (input.getAttribute('data-tilda-dateunvailable') || '').split(',');
  const state = {
    input,
    element: buildCalendar(),
    months: monthNames(),
    weekDays: weekDayNames(),
    year: today.getFullYear(),
    month: today.getMonth(),
    // Оригинал при открытии подсвечивает сегодняшнее число тёмным кружком.
    selectedKey: `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`,
    disablePast: unavailable.includes('past'),
    disableFuture: unavailable.includes('future'),
  };
  input.setAttribute('autocomplete', 'off');
  const block = input.closest('.t-input-block');
  if (block instanceof HTMLElement) {
    block.style.position = 'relative';
    block.style.overflow = 'visible';
  }

  // На оригинале в фокусе поле показывает скелет маски «__.__.____» —
  // его рисует внешняя маска Tilda (tilda-forms-custommask). Повторяем
  // подсказкой, чтобы не воевать с кареткой внутри значения.
  const restPlaceholder = input.getAttribute('placeholder') || '';
  const skeleton = (input.getAttribute('data-tilda-mask') || '99.99.9999').replace(/9/gu, '_');

  input.addEventListener('click', () => showCalendar(state));
  input.addEventListener('focus', () => {
    if (!input.value) input.setAttribute('placeholder', skeleton);
    showCalendar(state);
  });
  input.addEventListener('blur', () => {
    if (!input.value) input.setAttribute('placeholder', restPlaceholder);
  });
  input.addEventListener('input', () => applyDateMask(input));

  state.element.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.classList.contains('t_datepicker__arrow_prev')) {
      state.month -= 1;
      if (state.month < 0) { state.month = 11; state.year -= 1; }
      refreshMonth(state);
      return;
    }
    if (target.classList.contains('t_datepicker__arrow_next')) {
      state.month += 1;
      if (state.month > 11) { state.month = 0; state.year += 1; }
      refreshMonth(state);
      return;
    }
    const picked = target.getAttribute('data-picker');
    if (!picked) return;
    const [year, month, day] = picked.split('-').map((part) => parseInt(part, 10));
    state.selectedKey = `${year}-${month - 1}-${day}`;
    writeDateToInput(input, year, month - 1, day);
    closeCalendar();
  });

  state.element.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    if (target.classList.contains('t_datepicker__select_month')) {
      state.month = state.months.indexOf(target.value);
    } else if (target.classList.contains('t_datepicker__select_year')) {
      state.year = parseInt(target.value, 10);
    } else {
      return;
    }
    refreshMonth(state);
  });
}

/* ------------------------------------------------------------------ *
 *  Проверка формы перед отправкой                                      *
 * ------------------------------------------------------------------ */

const EMAIL_RE = /^[^\s@]+@[^\s@.]+\.[^\s@]{2,}$/u;
// Имя у Tilda — буквы, пробелы, дефис и апостроф; цифры и служебные знаки — ошибка.
const NAME_RE = /^(?=.{2,80}$)\p{L}(?:[\p{L}\s'-]*\p{L})?$/u;

export function isValidSourceName(value) {
  return NAME_RE.test(String(value || '').trim());
}

/** Мусорные номера вида 111-11-11 — набор проверок из tilda-forms-1.0. */
function looksLikeSpamPhone(value) {
  const bare = digits(value);
  const startsWith = (needle) => bare.indexOf(needle) === 1;
  const first = bare.slice(0, 1);
  return startsWith('000')
    || (startsWith('111') && first !== '9')
    || (startsWith('222') && first !== '5')
    || startsWith('333')
    || startsWith('444')
    || (startsWith('5555') && first !== '0')
    || (startsWith('666') && first !== '0')
    || (startsWith('8888') && first !== '4');
}

function inputBoxOf(form, control) {
  const selector = form.getAttribute('data-inputbox') || '.t-input-group';
  return control.closest(selector) || control.closest('.t-input-group') || control.closest('.t-input-block');
}

function clearErrors(form) {
  form.querySelectorAll('.js-error-control-box').forEach((box) => {
    box.classList.remove('js-error-control-box');
  });
  form.querySelectorAll('.t-input-error').forEach((node) => { node.textContent = ''; });
  hideErrorPopup();
}

function showError(form, control, message) {
  const box = inputBoxOf(form, control);
  if (!box) return;
  box.classList.add('js-error-control-box');
  const block = box.querySelector('.t-input-block') || box;
  let node = box.querySelector('.t-input-error');
  if (!node) {
    node = document.createElement('div');
    node.className = 't-input-error';
    node.setAttribute('aria-live', 'polite');
    block.append(node);
  }
  node.textContent = message;
}

/* --- общая плашка «Пожалуйста, заполните все обязательные поля» --- */

let errorPopup = null;
let errorPopupTimer = 0;

function hideErrorPopup() {
  if (errorPopup) errorPopup.style.display = 'none';
  window.clearTimeout(errorPopupTimer);
}

/** Форма с `data-error-popup="y"` показывает у Tilda ещё и плашку в углу.
 *  Она сама уходит через 10 секунд — так же, как на оригинале. */
function showErrorPopup(types) {
  if (!errorPopup) {
    errorPopup = document.createElement('div');
    errorPopup.id = 'tilda-popup-for-error';
    errorPopup.className = 'js-form-popup-errorbox tn-form__errorbox-popup';
    errorPopup.innerHTML = '<div class="t-form__errorbox-text t-text t-text_xs"></div>'
      + '<button class="tn-form__errorbox-close js-errorbox-close" type="button" aria-label="Закрыть">'
      + '<span class="tn-form__errorbox-close-line tn-form__errorbox-close-line-left"></span>'
      + '<span class="tn-form__errorbox-close-line tn-form__errorbox-close-line-right"></span></button>';
    errorPopup.addEventListener('click', (event) => {
      if (event.target instanceof Element && event.target.closest('.js-errorbox-close')) hideErrorPopup();
    });
    document.body.append(errorPopup);
  }
  const text = [...new Set(types)]
    .map((type) => FORM_MESSAGES[type])
    .filter(Boolean)
    .map((message) => `<p class="t-form__errorbox-item">${message}</p>`)
    .join('');
  errorPopup.querySelector('.t-form__errorbox-text').innerHTML = text;
  errorPopup.style.display = 'block';
  window.clearTimeout(errorPopupTimer);
  errorPopupTimer = window.setTimeout(hideErrorPopup, 10000);
}

/** Возвращает список пар «поле → тип ошибки» по правилам Tilda. */
function collectErrors(form) {
  const errors = [];
  form.querySelectorAll('.js-tilda-rule').forEach((control) => {
    if (control.disabled) return;
    const required = control.getAttribute('data-tilda-req') === '1' || control.hasAttribute('required');
    const rule = control.getAttribute('data-tilda-rule') || 'none';
    const type = control.getAttribute('type');
    const isChoice = type === 'checkbox' || type === 'radio';
    const value = String(control.value || '').trim();
    const empty = isChoice ? !control.checked : !value.length;

    if (required && empty) {
      errors.push([control, 'req']);
      return;
    }
    if (empty || isChoice) return;

    if (rule === 'email' && !EMAIL_RE.test(value)) {
      errors.push([control, 'email']);
      return;
    }
    if (rule === 'name' && !isValidSourceName(value)) {
      errors.push([control, 'name']);
      return;
    }
    if (rule === 'number' && !/^\d+$/u.test(value)) {
      errors.push([control, 'number']);
      return;
    }
    if (rule === 'date' && !isDateValid(readDateFromInput(control))) {
      errors.push([control, 'date']);
      return;
    }
    if (rule === 'phone') {
      const compact = value.replace(/\s/gu, '');
      if (!/^[0-9()+-]+$/u.test(compact) || looksLikeSpamPhone(compact)) {
        errors.push([control, 'phone']);
        return;
      }
    }
    const minLength = parseInt(control.getAttribute('data-tilda-rule-minlength') || '0', 10);
    if (minLength > 0 && value.length < minLength) {
      errors.push([control, 'minlength']);
    }
  });
  return errors;
}

// Подсказки гаснут, когда человек снова берётся за поля. Свой же перевод фокуса
// на первое поле с ошибкой не должен их тут же и погасить — на время его помечаем.
let programmaticFocus = false;

/** Ставит фокус на первое поле с ошибкой — как оригинал после «Отправить». */
function focusFirstError(form, control) {
  const box = inputBoxOf(form, control);
  const visible = box?.querySelector('input:not([type=hidden]), textarea, select');
  if (!(visible instanceof HTMLElement)) return;
  programmaticFocus = true;
  visible.focus({ preventScroll: true });
  visible.scrollIntoView({ block: 'center', behavior: 'smooth' });
  window.setTimeout(() => { programmaticFocus = false; }, 0);
}

/** Снимает `required` в пользу правил Tilda: иначе браузер покажет свой пузырь. */
function normaliseForm(form) {
  if (form.dataset.sourceFormsReady === 'yes') return;
  form.dataset.sourceFormsReady = 'yes';
  form.setAttribute('novalidate', '');
  form.querySelectorAll('input[required], textarea[required], select[required]').forEach((control) => {
    control.removeAttribute('required');
    control.setAttribute('data-tilda-req', '1');
    control.classList.add('js-tilda-rule');
  });
}

/* ------------------------------------------------------------------ *
 *  Точка входа                                                         *
 * ------------------------------------------------------------------ */

let listenersBound = false;

/** Поднимает поведение форм внутри снимка; безопасно вызывать повторно. */
export function initSourceForms(root = document) {
  // Работаем только внутри снимка: у собственных страниц клона свои формы
  // со своей проверкой, их правила Tilda не касаются.
  const shell = root.querySelector?.('.source-snapshot-shell');
  if (!shell) return;

  shell.querySelectorAll('form').forEach((form) => normaliseForm(form));
  shell.querySelectorAll('div.t-input-phonemask__wrap').forEach((wrap) => initPhoneField(wrap));
  shell.querySelectorAll('input.t-datepicker').forEach((input) => initDateField(input));

  if (listenersBound) return;
  listenersBound = true;

  // Слушатель отправки вешаем на фазе перехвата: локальный обработчик снимка
  // (SourceSnapshotBody.astro) сидит на всплытии и иначе успел бы показать
  // «Спасибо» раньше проверки.
  document.addEventListener('submit', (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (!form.closest('.source-snapshot-shell')) return;
    const errors = collectErrors(form);
    clearErrors(form);
    if (!errors.length) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    errors.forEach(([control, type]) => showError(form, control, MESSAGES[type]));
    if (form.getAttribute('data-error-popup') === 'y') {
      showErrorPopup(errors.map(([, type]) => type));
    }
    focusFirstError(form, errors[0][0]);
  }, true);

  // Оригинал гасит подсказки, как только человек снова взялся за поля.
  document.addEventListener('focusin', (event) => {
    if (programmaticFocus) return;
    const form = event.target instanceof Element ? event.target.closest('form') : null;
    if (form && form.querySelector('.js-error-control-box')) clearErrors(form);
  });

  document.addEventListener('mouseup', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('.t-input-phonemask__options-wrap, .t-input-phonemask__select')) return;
    closeCountryList();
  });
  document.addEventListener('keyup', searchCountry);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { closeCountryList(); closeCalendar(); }
  });
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('.t_datepicker__inner') || target.classList.contains('t-datepicker')) return;
    closeCalendar();
  });
  window.addEventListener('resize', () => { if (openCalendar) positionCalendar(openCalendar); });
  document.addEventListener('scroll', () => { if (openCalendar) positionCalendar(openCalendar); }, true);
}
