const rules = [
  [/^\d+\s*[-–]\s*\d+$|игрок|человек|гост|команд|участник/iu, 'users'],
  [/мин|час|врем|прийти|приезжа|заранее/iu, 'clock'],
  [/\d+\s*\+$|возраст|лет(?:\s|$)/iu, 'user-round-check'],
  [/ул\.|пр-т|пер\.|адрес/iu, 'map-pin'],
  [/\d+.*(?:площад|зал)/iu, 'building-2'],
  [/сложност|уровн/iu, 'gauge'],
  [/родител|ожидани|комнат|отдых/iu, 'armchair'],
  [/актёр|актер|костюм/iu, 'drama'],
  [/инструктор|ведущ|присмотр|безопас/iu, 'shield-check'],
  [/обув|надеть|одежд/iu, 'footprints'],
  [/торт/iu, 'cake'],
  [/перекус|банкет|меню|сервировк|чай|кофе|посуд/iu, 'utensils'],
  [/шоу|программ|под ключ|праздник/iu, 'party-popper'],
  [/квест|игр|VR/iu, 'puzzle'],
  [/пригласительн/iu, 'mail'],
  [/организац|менеджер/iu, 'clipboard-check'],
  [/стоимост|цен/iu, 'receipt-russian-ruble'],
  [/оплат|налич|перевод/iu, 'wallet'],
];
export const pickIcon = (text, fallback = 'sparkles') => rules.find(([pattern]) => pattern.test(String(text).replace(/«[^»]*»|"[^"]*"/gu, '')))?.[1] || fallback;
export const factLabel = (icon) => ({ users: 'Игроков:', clock: 'Длительность:', 'user-round-check': 'Возраст:', 'map-pin': 'Адрес:', 'party-popper': 'Формат:', 'building-2': 'Площадок:' })[icon] || '';
