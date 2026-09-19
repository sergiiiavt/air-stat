import fs from 'node:fs';

const file = 'data/reference/kyiv-50km-settlements.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

if (data.schemaVersion !== 1) throw new Error('Settlement catalogue schemaVersion must be 1');
if (data.reference?.radiusKm !== 50) throw new Error('Settlement catalogue radius must be 50 km');
if (!Array.isArray(data.settlements) || data.settlements.length === 0) {
  throw new Error('Settlement catalogue must contain settlements');
}

const keys = new Set();
for (const item of data.settlements) {
  if (!item.name || !item.raion || !item.hromada) throw new Error('Settlement identity fields are required');
  if (![item.lat, item.lng, item.distanceKm].every(Number.isFinite)) {
    throw new Error(`Invalid coordinates/distance for ${item.name}`);
  }
  if (item.distanceKm > 50.05) throw new Error(`Out-of-radius settlement: ${item.name} (${item.distanceKm} km)`);
  const key = [item.raion, item.hromada, item.name].join('|');
  if (keys.has(key)) throw new Error(`Duplicate settlement identity: ${key}`);
  keys.add(key);
}

const regressionNames = [
  'Буча','Ірпінь','Гостомель','Ворзель','Коцюбинське','Немішаєве','Бородянка',
  'Клавдієво-Тарасове','Микуличі','Михайлівка-Рубежівка','Забуччя','Горенка',
  'Мощун','Блиставиця','Мироцьке','Озера','Мила','Дмитрівка','Бузова','Шпитьки',
  'Капітанівка','Личанка','Петрушки','Гурівщина','Мрія','Горбовичі','Мотижин',
  'Білогородка','Гореничі','Стоянка','Бобриця','Музичі','Святопетрівське',
  'Чайки','Петропавлівська Борщагівка','Софіївська Борщагівка','Вишневе',
  'Крюківщина','Боярка','Гатне','Віта-Поштова','Юрівка','Тарасівка','Чабани',
  'Новосілки','Хотів','Глеваха','Калинівка','Малютянка','Забір’я','Васильків',
  'Путрівка','Плесецьке','Борова','Вишгород','Нові Петрівці','Старі Петрівці',
  'Лютіж','Гута-Межигірська','Демидів','Козаровичі','Димер','Бровари','Княжичі',
  'Требухів','Скибин','Красилівка','Велика Димерка','Богданівка','Гоголів',
  'Зазим’я','Погреби','Пухівка','Рожни','Літки','Літочки','Семиполки','Бориспіль',
  'Гора','Чубинське','Проліски','Щасливе','Велика Олександрівка','Мала Олександрівка',
  'Дударків','Гнідин','Вишеньки','Ревне','Мартусівка','Іванків','Рогозів','Козин',
  'Лісники','Ходосівка','Підгірці','Романків','Нові Безрадичі','Старі Безрадичі',
  'Плюти','Обухів','Українка','Таценки','Трипілля','Халеп’я','Витачів','Гвоздів'
];

const names = new Set(data.settlements.map((item) => item.name));
const missing = regressionNames.filter((name) => !names.has(name));
if (missing.length) throw new Error(`Missing 50 km regression settlements: ${missing.join(', ')}`);

console.log(
  `Validated ${data.settlements.length} 50 km settlement records and ${regressionNames.length} regression names.`,
);
