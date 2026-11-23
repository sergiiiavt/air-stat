// Source of the static editorial pages in public/. Run
// `npm run build:seo-pages` after editing; `npm run test:seo` fails when the
// generated files are stale. The dashboard home (index.html) is edited by hand.
import { ALERT_COVERAGE } from './alert-coverage.mjs';
import { absoluteUrl, esc, formatDate, REPOSITORY_URL, SITE_NAME } from './seo-layout.mjs';

export const CONTENT_UPDATED = '2026-11-24';

const city = ALERT_COVERAGE.find((entry) => entry.scope === 'kyiv-city');
const oblast = ALERT_COVERAGE.find((entry) => entry.scope === 'kyiv-oblast');
const sourceFrom = (entry, key) => entry.sources.find((source) => source.key === key);

const home = { uk: { name: 'Головна', path: '/' }, en: { name: 'Home', path: '/en/' } };

function datasetJsonLd(lang) {
  const en = lang === 'en';
  return {
    '@type': 'Dataset',
    '@id': `${absoluteUrl(en ? '/en/open-data' : '/open-data')}#dataset`,
    name: en
      ? 'Air raid alert history for Kyiv City and Kyiv Oblast (daily counts and durations)'
      : 'Історія повітряних тривог у Києві та Київській області (кількість і тривалість по днях)',
    description: en
      ? `Daily number of air raid alerts and total alert time for Kyiv City (from ${city.from}) and Kyiv Oblast (from ${oblast.from}), calculated from official alert intervals on the Europe/Kyiv calendar. Overlapping reports are merged; overnight alerts are split at midnight. Updated continuously.`
      : `Кількість повітряних тривог і загальна тривалість тривог по днях для міста Києва (з ${city.from}) та Київської області (з ${oblast.from}), розраховані з офіційних інтервалів тривог за київським календарем. Перекриття об’єднуються; нічні тривоги діляться по опівночі. Оновлюється постійно.`,
    url: absoluteUrl(en ? '/en/open-data' : '/open-data'),
    inLanguage: lang,
    isAccessibleForFree: true,
    keywords: en
      ? ['air raid alerts', 'Kyiv', 'Kyiv Oblast', 'Ukraine', 'war', 'civil protection', 'time series']
      : ['повітряні тривоги', 'Київ', 'Київська область', 'Україна', 'війна', 'цивільний захист', 'часовий ряд'],
    creator: { '@id': 'https://air-alert-stat.com/#organization' },
    temporalCoverage: `${city.from}/..`,
    spatialCoverage: [
      { '@type': 'Place', name: en ? 'Kyiv, Ukraine' : 'Київ, Україна' },
      { '@type': 'Place', name: en ? 'Kyiv Oblast, Ukraine' : 'Київська область, Україна' },
    ],
    variableMeasured: en
      ? ['Number of air raid alerts that started on the day', 'Air raid alert time within the day (seconds)']
      : ['Кількість повітряних тривог, що почалися в цей день', 'Час повітряних тривог у межах дня (секунди)'],
    measurementTechnique: en
      ? 'Union of official alert intervals per area; counts follow the start date, durations are split at Kyiv midnight.'
      : 'Об’єднання офіційних інтервалів тривог; кількість — за датою початку, тривалість ділиться по опівночі за Києвом.',
    isBasedOn: [
      'https://kyivcity.gov.ua/',
      'https://github.com/Vadimkin/ukrainian-air-raid-sirens-dataset',
      'https://alerts.in.ua/',
    ],
    distribution: [
      { '@type': 'DataDownload', encodingFormat: 'text/csv', contentUrl: absoluteUrl('/open-data/kyiv-city-daily.csv'), name: en ? 'Kyiv City, daily' : 'Київ, по днях' },
      { '@type': 'DataDownload', encodingFormat: 'text/csv', contentUrl: absoluteUrl('/open-data/kyiv-oblast-daily.csv'), name: en ? 'Kyiv Oblast, daily' : 'Київська область, по днях' },
    ],
  };
}

const ukSources = `<ul>
<li>Місто Київ: відкриті дані «Київ Цифровий» — з ${formatDate(sourceFrom(city, 'kyiv_open_data').from, 'uk')}; alerts.in.ua — з ${formatDate(sourceFrom(city, 'alerts_in_ua').from, 'uk')} як додаткове джерело.</li>
<li>Київська область: національний канал повітряних тривог через відкритий набір <a href="https://github.com/Vadimkin/ukrainian-air-raid-sirens-dataset">ukrainian-air-raid-sirens-dataset</a> — з ${formatDate(sourceFrom(oblast, 'air_raid_sirens_dataset').from, 'uk')} по ${formatDate(sourceFrom(oblast, 'air_raid_sirens_dataset').to, 'uk')}; Telegram-канал Київської обласної військової адміністрації — з ${formatDate(sourceFrom(oblast, 'kova_telegram').from, 'uk')}; alerts.in.ua — з ${formatDate(sourceFrom(oblast, 'alerts_in_ua').from, 'uk')}.</li>
</ul>`;

const enSources = `<ul>
<li>Kyiv City: Kyiv Digital open data from ${formatDate(sourceFrom(city, 'kyiv_open_data').from, 'en')}; alerts.in.ua from ${formatDate(sourceFrom(city, 'alerts_in_ua').from, 'en')} as an additional source.</li>
<li>Kyiv Oblast: the national air-alert channel via the open <a href="https://github.com/Vadimkin/ukrainian-air-raid-sirens-dataset">ukrainian-air-raid-sirens-dataset</a> from ${formatDate(sourceFrom(oblast, 'air_raid_sirens_dataset').from, 'en')} to ${formatDate(sourceFrom(oblast, 'air_raid_sirens_dataset').to, 'en')}; the Kyiv Oblast Military Administration Telegram channel from ${formatDate(sourceFrom(oblast, 'kova_telegram').from, 'en')}; alerts.in.ua from ${formatDate(sourceFrom(oblast, 'alerts_in_ua').from, 'en')}.</li>
</ul>`;

export const STATIC_PAGES = [
  // ------------------------------------------------------------------ Kyiv
  {
    file: 'kyiv-air-alerts.html',
    lang: 'uk',
    path: '/kyiv-air-alerts',
    alternates: { uk: '/kyiv-air-alerts', en: '/en/kyiv-air-alerts' },
    title: `Повітряні тривоги в Києві: історія та статистика | ${SITE_NAME}`,
    h1: 'Повітряні тривоги в Києві: історія та статистика',
    description: 'Скільки було повітряних тривог у Києві та скільки вони тривали: статистика з 2022 року по днях, місяцях і роках, графіки, рекорди та досліджені наслідки атак із джерелами.',
    breadcrumbs: [home.uk, { name: 'Повітряні тривоги в Києві', path: '/kyiv-air-alerts' }],
    main: `<h1>Повітряні тривоги в Києві: історія та статистика</h1>
<p class="lead">Air Alert Stat збирає історію повітряних тривог у Києві з ${formatDate(city.from, 'uk')}: скільки тривог було за день, місяць чи рік, скільки часу місто провело під тривогою і в яку пору доби тривоги лунають найчастіше.</p>
<h2>Швидкі відповіді</h2>
<ul>
<li><strong>Скільки було тривог у Києві з початку повномасштабної війни?</strong> Актуальні підсумки, рекорди та таблиці по роках — на сторінці <a href="/stats/kyiv">статистики тривог у Києві</a>.</li>
<li><strong>Скільки тривог було цього місяця?</strong> У <a href="/stats/kyiv">архіві по місяцях</a> є окрема сторінка для кожного місяця з таблицею по днях і порівнянням з попереднім місяцем.</li>
<li><strong>Як довго тривала найдовша тривога?</strong> Рекорди (найдовша безперервна тривога, найбільше тривог за добу) розраховуються автоматично з усього архіву.</li>
<li><strong>Де взяти сирі дані?</strong> Щоденні значення можна завантажити як <a href="/open-data">відкриті дані CSV</a>.</li>
</ul>
<a class="cta" href="/stats/kyiv">Статистика тривог у Києві по роках і місяцях</a>
<h2>Інтерактивний дашборд</h2>
<p>На головній сторінці є щоденна статистика, 24-годинна шкала інтервалів тривог і тренди за однакові проміжки часу. На карті показані агреговані повідомлення про наслідки атак за адміністративними районами Києва. Натисніть на район, щоб побачити пов’язані з ним досліджені записи та їхні джерела.</p>
<p>За замовчуванням показано останні сім днів. Можна вибрати 3, 7, 30, 90 або 180 днів чи власний календарний проміжок. Посилання на вибраний режим і період можна поширити з адресного рядка.</p>
<a class="cta" rel="nofollow" href="/?view=daily&amp;days=30">Відкрити статистику Києва за 30 днів</a>
<h2>Повітряна тривога та наслідки атаки — не одне й те саме</h2>
<p>Інтервал повітряної тривоги походить із повідомлень систем оповіщення. Інформація про пошкодження, постраждалих або локації збирається окремо з публікацій і документується з посиланням на джерело. Одна тривога не означає один удар, а один удар не обов’язково відповідає окремій тривозі.</p>
<h2>Як читати графіки</h2>
<p>Кількість показує число інтервалів тривоги, що почалися в певний день. Тривалість підсумовує час тривог і ділиться по опівночі за київським часом. Тривоги в Києві оголошуються для всього міста. Відсутність інтервалу в архіві не доводить, що тривоги точно не було.</p>
<h2>Карта районів та безпека</h2>
<p>Агреговані маркери представляють район, а не точку влучання. Недавні точні місця ударів, об’єкти критичної інфраструктури та позиції ППО не публікуються. Для перевірки достовірності відкривайте джерела в картці інциденту.</p>
<p>Детальніше: <a href="/methodology">методологія збору й перевірки даних</a> та <a href="/kyiv-oblast-alerts">тривоги в Київській області</a>.</p>`,
  },
  {
    file: 'en/kyiv-air-alerts.html',
    lang: 'en',
    path: '/en/kyiv-air-alerts',
    alternates: { uk: '/kyiv-air-alerts', en: '/en/kyiv-air-alerts' },
    title: `Kyiv air raid alerts: history and statistics | ${SITE_NAME}`,
    h1: 'Air raid alerts in Kyiv: history and statistics',
    description: 'How many air raid alerts Kyiv has had and how long they lasted: statistics since 2022 by day, month and year, charts, records and researched attack consequences with sources.',
    breadcrumbs: [home.en, { name: 'Air raid alerts in Kyiv', path: '/en/kyiv-air-alerts' }],
    main: `<h1>Air raid alerts in Kyiv: history and statistics</h1>
<p class="lead">Air Alert Stat keeps a history of air raid alerts in Kyiv since ${formatDate(city.from, 'en')}: how many alerts there were in a day, month or year, how much time the city spent under alert and at what time of day alerts are most common.</p>
<h2>Quick answers</h2>
<ul>
<li><strong>How many air raid alerts has Kyiv had since the full-scale invasion?</strong> Current totals, records and yearly tables are on the <a href="/en/stats/kyiv">Kyiv alert statistics</a> page.</li>
<li><strong>How many alerts were there this month?</strong> The <a href="/en/stats/kyiv">monthly archive</a> has a page for every month with a day-by-day table and a comparison with the previous month.</li>
<li><strong>How long was the longest alert?</strong> Records such as the longest continuous alert and the most alerts in one day are calculated automatically from the whole archive.</li>
<li><strong>Where can I get the raw data?</strong> Daily values can be downloaded as <a href="/en/open-data">open CSV data</a>.</li>
</ul>
<a class="cta" href="/en/stats/kyiv">Kyiv air raid alert statistics by year and month</a>
<h2>Interactive dashboard</h2>
<p>The dashboard shows daily statistics, a 24-hour timeline of alert intervals and trends over equal periods. The map shows aggregated reports of attack consequences by Kyiv administrative district. Select a district to see the researched records linked to it and their sources.</p>
<p>The last seven days are shown by default. You can choose 3, 7, 30, 90 or 180 days or a custom calendar range, and share the selected view from the address bar.</p>
<a class="cta" rel="nofollow" href="/?view=daily&amp;days=30&amp;lang=en">Open Kyiv statistics for the last 30 days</a>
<h2>An air raid alert is not the same as an attack</h2>
<p>Alert intervals come from warning systems. Information about damage, casualties or locations is collected separately from publications and documented with a link to the source. One alert does not mean one strike, and one strike does not necessarily correspond to a separate alert.</p>
<h2>How to read the charts</h2>
<p>The count is the number of alert intervals that started on a given day. Alert time adds up the duration of alerts and is split at midnight Kyiv time. Alerts in Kyiv are declared for the whole city. A day without a stored interval is not proof that no alert happened.</p>
<h2>District map and safety</h2>
<p>Aggregated markers represent a district, not a point of impact. Recent exact strike locations, critical infrastructure and air-defence positions are not published. To check a record, open the sources in its incident card.</p>
<p>More: <a href="/en/methodology">how the data is collected and checked</a> and <a href="/en/kyiv-oblast-alerts">air raid alerts in Kyiv Oblast</a>.</p>`,
  },
  // ---------------------------------------------------------------- Oblast
  {
    file: 'kyiv-oblast-alerts.html',
    lang: 'uk',
    path: '/kyiv-oblast-alerts',
    alternates: { uk: '/kyiv-oblast-alerts', en: '/en/kyiv-oblast-alerts' },
    title: `Повітряні тривоги у Київській області: історія та карта | ${SITE_NAME}`,
    h1: 'Повітряні тривоги у Київській області',
    description: 'Статистика повітряних тривог у Київській області з 2022 року: кількість і тривалість по місяцях і роках, карта досліджених наслідків атак за громадами та районами, джерела й обмеження даних.',
    breadcrumbs: [home.uk, { name: 'Повітряні тривоги у Київській області', path: '/kyiv-oblast-alerts' }],
    main: `<h1>Повітряні тривоги у Київській області</h1>
<p class="lead">Архів тривог Київської області починається ${formatDate(oblast.from, 'uk')}. Окремо на карті можна дослідити повідомлення про наслідки атак за містами, районами та громадами області.</p>
<a class="cta" href="/stats/kyiv-oblast">Статистика тривог у Київській області по роках і місяцях</a>
<h2>Що означає «тривога в області»</h2>
<p>Тривоги в області оголошуються для всієї області, окремих районів або громад. У статистиці Air Alert Stat ці інтервали об’єднуються: тривалість показує час, коли тривога діяла хоча б на частині області. Тому тривалість для області зазвичай більша, ніж для Києва. Місто Київ у ці числа не входить.</p>
<h2>Як знайти потрібну місцевість</h2>
<p>На головній сторінці виберіть географію «Область» або «Разом», потім потрібний період. Клік на агрегованому маркері чи назві території відфільтрує досліджені інциденти лише для неї. Область охоплює населені пункти навколо Києва, але дані не підміняються записами самого міста.</p>
<a class="cta" rel="nofollow" href="/?view=map&amp;days=30&amp;scope=kyiv-oblast">Відкрити карту Київської області за 30 днів</a>
<h2>Що означає маркер</h2>
<p>Число на маркері — кількість досліджених інцидентів, віднесених до адміністративної території за вибраний час. Це не кількість ракет і не оцінка інтенсивності бойових дій. Коли джерело не містить достатньо точної географії, запис може бути доступний у загальній статистиці без точки на карті.</p>
<h2>Джерела та обмеження</h2>
${ukSources}
<p>Досліджені наслідки атак — окремий набір даних і не є повним реєстром усіх подій. Відкривайте першоджерела й звертайте увагу на позначки перевірки записів. Публічні точки можуть бути узагальнені задля безпеки; вони не є точною адресою удару.</p>
<p>Детальніше: <a href="/methodology">методологія</a>, <a href="/kyiv-air-alerts">тривоги в Києві</a>, <a href="/open-data">відкриті дані</a>.</p>`,
  },
  {
    file: 'en/kyiv-oblast-alerts.html',
    lang: 'en',
    path: '/en/kyiv-oblast-alerts',
    alternates: { uk: '/kyiv-oblast-alerts', en: '/en/kyiv-oblast-alerts' },
    title: `Kyiv Oblast air raid alerts: history and map | ${SITE_NAME}`,
    h1: 'Air raid alerts in Kyiv Oblast',
    description: 'Air raid alert statistics for Kyiv Oblast since 2022: number and duration of alerts by month and year, a map of researched attack consequences by community and district, sources and data limits.',
    breadcrumbs: [home.en, { name: 'Air raid alerts in Kyiv Oblast', path: '/en/kyiv-oblast-alerts' }],
    main: `<h1>Air raid alerts in Kyiv Oblast</h1>
<p class="lead">The Kyiv Oblast alert archive starts on ${formatDate(oblast.from, 'en')}. Separately, the map lets you explore reports of attack consequences by town, district and community.</p>
<a class="cta" href="/en/stats/kyiv-oblast">Kyiv Oblast air raid alert statistics by year and month</a>
<h2>What “an alert in the oblast” means</h2>
<p>Alerts in the oblast are declared for the whole oblast, for individual districts or for communities. Air Alert Stat merges these intervals: alert time is the time when an alert was active in at least part of the oblast. That is why oblast alert time is usually longer than Kyiv’s. Kyiv City is not included in these figures.</p>
<h2>Finding a place</h2>
<p>On the dashboard choose the “Oblast” or “Both” scope and a period. Clicking an aggregated marker or a territory name filters researched incidents to that territory only. The oblast covers settlements around Kyiv; its records are never replaced by records from the city.</p>
<a class="cta" rel="nofollow" href="/?view=map&amp;days=30&amp;scope=kyiv-oblast&amp;lang=en">Open the Kyiv Oblast map for the last 30 days</a>
<h2>What a marker means</h2>
<p>The number on a marker is the count of researched incidents assigned to an administrative territory in the selected period. It is not a number of missiles or an estimate of combat intensity. When a source does not give precise enough geography, the record can still appear in the totals without a map point.</p>
<h2>Sources and limits</h2>
${enSources}
<p>Researched attack consequences are a separate dataset and not a complete register of all events. Open the primary sources and check the verification labels. Public points can be generalized for safety; they are not exact impact addresses.</p>
<p>More: <a href="/en/methodology">methodology</a>, <a href="/en/kyiv-air-alerts">air raid alerts in Kyiv</a>, <a href="/en/open-data">open data</a>.</p>`,
  },
  // ----------------------------------------------------------- Methodology
  {
    file: 'methodology.html',
    lang: 'uk',
    path: '/methodology',
    alternates: { uk: '/methodology', en: '/en/methodology' },
    title: `Джерела даних і методологія статистики тривог | ${SITE_NAME}`,
    h1: 'Джерела даних та методологія',
    description: 'Як Air Alert Stat збирає історію повітряних тривог у Києві та області, рахує кількість і тривалість, досліджує наслідки атак, перевіряє джерела та безпечно показує дані на карті.',
    breadcrumbs: [home.uk, { name: 'Джерела даних та методологія', path: '/methodology' }],
    main: `<h1>Джерела даних та методологія</h1>
<p class="lead">Air Alert Stat поєднує історію сигналів повітряної тривоги та досліджені повідомлення про атаки й цивільні наслідки. Це два окремі процеси з різною повнотою та способами перевірки.</p>
<h2>1. Інтервали тривог</h2>
${ukSources}
<p>Дані зводяться в календарні дні за київським часом. Повідомлення різних джерел про ту саму тривогу, які перекриваються, об’єднуються.</p>
<h2>2. Як рахуються кількість і тривалість</h2>
<p><strong>Кількість</strong> — це інтервали тривоги, що почалися в календарний день; інтервали, які перекриваються, рахуються один раз. <strong>Тривалість</strong> — об’єднання всіх інтервалів, поділене по опівночі: тривога з 23:30 до 00:40 дає 30 хвилин одному дню й 40 хвилин наступному. <strong>Частка часу</strong> — тривалість, поділена на тривалість періоду (для поточного періоду — до моменту розрахунку). Для Київської області об’єднуються тривоги для всієї області, районів і громад. Ті самі правила використовують дашборд, <a href="/stats/kyiv">архів по місяцях</a> і <a href="/open-data">відкриті дані</a>.</p>
<h2>3. Повідомлення про наслідки атак</h2>
<p>Публікації медіа та офіційні матеріали слугують доказами для окремих записів про наслідки. Система автоматично шукає публікації, прив’язує повідомлення до дати самої події, формує структуровані факти й зберігає джерела. Запис про інцидент чи кількість постраждалих створюється лише з тексту публікації, а не з самого заголовка. Пізніші уточнення можуть змінити опис раніше відомої події.</p>
<h2>4. Достовірність і неповнота</h2>
<p>День, для якого завершився автоматичний пошук, <strong>не вважається незалежно підтвердженим повним реєстром</strong>. Нульова кількість знайдених новин чи інтервалів не означає, що атаки або тривоги точно не було. Відомості про постраждалих не виводяться з непрямих ознак; невідоме залишається невідомим. Перевіряйте джерела в деталях запису.</p>
<h2>5. Географія та безпечне відображення</h2>
<p>Маркери районів — це адміністративні агрегати, не координати ударів. Джерела можуть вказувати район чи загальну локацію, але точні адреси недавніх ударів, критичної інфраструктури та військових об’єктів не публікуються. Невизначена географія не маскується під точні координати центру міста.</p>
<h2>6. Як використовувати статистику</h2>
<p>Для аналізу тенденцій обирайте рівні часові періоди та враховуйте покриття джерел. Не порівнюйте кількість медійних повідомлень із числом тривог як однакові показники. Дані — інформаційний та дослідницький матеріал, а не система оперативного сповіщення. Для рішень про безпеку покладайтеся на офіційні сигнали тривоги й інструкції.</p>
<h2>7. Прозорість збору</h2>
<p>Стан автоматичного опрацювання, помилки та чергу історичних дат можна переглянути на <a href="/progress">сторінці прогресу</a>. Код і опис архітектури опубліковані у <a href="${REPOSITORY_URL}">відкритому репозиторії</a>.</p>
<p><a href="/kyiv-air-alerts">Тривоги в Києві</a> · <a href="/kyiv-oblast-alerts">Тривоги в Київській області</a> · <a href="/stats/kyiv">Архів по місяцях</a></p>`,
  },
  {
    file: 'en/methodology.html',
    lang: 'en',
    path: '/en/methodology',
    alternates: { uk: '/methodology', en: '/en/methodology' },
    title: `Data sources and methodology for air raid alert statistics | ${SITE_NAME}`,
    h1: 'Data sources and methodology',
    description: 'How Air Alert Stat collects the history of air raid alerts in Kyiv and Kyiv Oblast, counts their number and duration, researches attack consequences, checks sources and shows data safely on the map.',
    breadcrumbs: [home.en, { name: 'Data sources and methodology', path: '/en/methodology' }],
    main: `<h1>Data sources and methodology</h1>
<p class="lead">Air Alert Stat combines the history of air raid alert signals with researched reports of attacks and civilian consequences. These are two separate processes with different completeness and verification.</p>
<h2>1. Alert intervals</h2>
${enSources}
<p>Data is grouped into calendar days in Kyiv time. Overlapping reports of the same alert from different sources are merged.</p>
<h2>2. How count and duration are calculated</h2>
<p><strong>Alert count</strong> is the number of alert intervals that started on a calendar day; overlapping intervals are counted once. <strong>Alert time</strong> is the union of all intervals split at midnight: an alert from 23:30 to 00:40 adds 30 minutes to one day and 40 minutes to the next. <strong>Share of time</strong> is alert time divided by the length of the period (for the current period, up to the time of calculation). For Kyiv Oblast, oblast-wide, district and community alerts are merged. The dashboard, the <a href="/en/stats/kyiv">monthly archive</a> and the <a href="/en/open-data">open data</a> all use these rules.</p>
<h2>3. Reports of attack consequences</h2>
<p>Media publications and official materials serve as evidence for individual consequence records. The system searches for publications automatically, links reports to the date of the event, extracts structured facts and keeps the sources. An incident or casualty count is created only from the text of a publication, never from a headline alone. Later updates can change the description of an earlier event.</p>
<h2>4. Reliability and gaps</h2>
<p>A day for which automated research has finished is <strong>not an independently verified complete register</strong>. Zero found reports or intervals do not mean that no attack or alert happened. Casualties are never inferred from indirect signs; unknown stays unknown. Check the sources in each record.</p>
<h2>5. Geography and safe display</h2>
<p>District markers are administrative aggregates, not strike coordinates. Sources may name a district or a general location, but exact addresses of recent strikes, critical infrastructure and military sites are not published. Uncertain geography is never disguised as precise city-centre coordinates.</p>
<h2>6. Using the statistics</h2>
<p>To analyse trends, compare equal periods and take source coverage into account. Do not compare the number of media reports with the number of alerts as if they were the same measure. The data is for information and research, not a warning system. For safety decisions, rely on official alert signals and instructions.</p>
<h2>7. Transparency</h2>
<p>The state of automated processing, errors and the queue of historical dates are shown on the <a href="/progress">progress page</a>. The code and architecture are published in an <a href="${REPOSITORY_URL}">open repository</a>.</p>
<p><a href="/en/kyiv-air-alerts">Alerts in Kyiv</a> · <a href="/en/kyiv-oblast-alerts">Alerts in Kyiv Oblast</a> · <a href="/en/stats/kyiv">Monthly archive</a></p>`,
  },
  // ------------------------------------------------------------- Open data
  {
    file: 'open-data.html',
    lang: 'uk',
    path: '/open-data',
    alternates: { uk: '/open-data', en: '/en/open-data' },
    title: `Відкриті дані: повітряні тривоги в Києві та області (CSV) | ${SITE_NAME}`,
    h1: 'Відкриті дані про повітряні тривоги в Києві та Київській області',
    description: 'Завантажте щоденну кількість і тривалість повітряних тривог у Києві (з 2022 року) та Київській області у форматі CSV. Опис полів, методу розрахунку, джерел і способу цитування.',
    breadcrumbs: [home.uk, { name: 'Відкриті дані', path: '/open-data' }],
    jsonLd: [datasetJsonLd('uk')],
    main: `<h1>Відкриті дані про повітряні тривоги в Києві та Київській області</h1>
<p class="lead">Щоденні значення, з яких складаються дашборд і <a href="/stats/kyiv">архів по місяцях</a>, доступні для завантаження. Файли формуються автоматично з поточної бази й оновлюються щонайменше кожні кілька годин.</p>
<h2>Файли</h2>
<ul>
<li><a href="/open-data/kyiv-city-daily.csv">kyiv-city-daily.csv</a> — місто Київ, з ${formatDate(city.from, 'uk')}.</li>
<li><a href="/open-data/kyiv-oblast-daily.csv">kyiv-oblast-daily.csv</a> — Київська область (без міста Києва), з ${formatDate(oblast.from, 'uk')}.</li>
</ul>
<h2>Поля</h2>
<div class="table-wrap"><table class="data fields"><thead><tr><th scope="col">Поле</th><th scope="col">Значення</th></tr></thead><tbody>
<tr><th scope="row">date</th><td>Календарна дата за київським часом (YYYY-MM-DD)</td></tr>
<tr><th scope="row">alert_count</th><td>Кількість інтервалів тривоги, що почалися в цей день (перекриття рахуються один раз)</td></tr>
<tr><th scope="row">alert_seconds</th><td>Секунди тривоги в межах цього дня; нічні тривоги діляться по опівночі</td></tr>
<tr><th scope="row">alert_hours</th><td>Те саме в годинах, з двома знаками після коми</td></tr>
</tbody></table></div>
<p>Кодування UTF-8, роздільник — кома, перший рядок — заголовок. Останній рядок відповідає поточному дню й ще змінюється.</p>
<h2>Джерела</h2>
${ukSources}
<p>Метод розрахунку описаний у <a href="/methodology">методології</a>. Відсутність інтервалу в певний день не доводить, що тривоги не було. Перед повторною публікацією перевіряйте умови використання первинних джерел.</p>
<h2>Як цитувати</h2>
<p>${SITE_NAME}, «Відкриті дані про повітряні тривоги в Києві та Київській області», ${esc(absoluteUrl('/open-data'))}, дата завантаження. Код розрахунку відкритий у <a href="${REPOSITORY_URL}">репозиторії проєкту</a>.</p>`,
  },
  {
    file: 'en/open-data.html',
    lang: 'en',
    path: '/en/open-data',
    alternates: { uk: '/open-data', en: '/en/open-data' },
    title: `Open data: air raid alerts in Kyiv and Kyiv Oblast (CSV) | ${SITE_NAME}`,
    h1: 'Open data on air raid alerts in Kyiv and Kyiv Oblast',
    description: 'Download the daily number and duration of air raid alerts in Kyiv (since 2022) and Kyiv Oblast as CSV. Field descriptions, calculation method, sources and how to cite.',
    breadcrumbs: [home.en, { name: 'Open data', path: '/en/open-data' }],
    jsonLd: [datasetJsonLd('en')],
    main: `<h1>Open data on air raid alerts in Kyiv and Kyiv Oblast</h1>
<p class="lead">The daily values behind the dashboard and the <a href="/en/stats/kyiv">monthly archive</a> are available for download. Files are generated automatically from the current database and refreshed at least every few hours.</p>
<h2>Files</h2>
<ul>
<li><a href="/open-data/kyiv-city-daily.csv">kyiv-city-daily.csv</a> — Kyiv City, from ${formatDate(city.from, 'en')}.</li>
<li><a href="/open-data/kyiv-oblast-daily.csv">kyiv-oblast-daily.csv</a> — Kyiv Oblast (excluding Kyiv City), from ${formatDate(oblast.from, 'en')}.</li>
</ul>
<h2>Fields</h2>
<div class="table-wrap"><table class="data fields"><thead><tr><th scope="col">Field</th><th scope="col">Meaning</th></tr></thead><tbody>
<tr><th scope="row">date</th><td>Calendar date in Kyiv time (YYYY-MM-DD)</td></tr>
<tr><th scope="row">alert_count</th><td>Number of alert intervals that started on the day (overlaps counted once)</td></tr>
<tr><th scope="row">alert_seconds</th><td>Seconds of alert time within the day; overnight alerts are split at midnight</td></tr>
<tr><th scope="row">alert_hours</th><td>The same in hours, two decimal places</td></tr>
</tbody></table></div>
<p>UTF-8, comma-separated, with a header row. The last row is the current day and still changes.</p>
<h2>Sources</h2>
${enSources}
<p>The calculation is described in the <a href="/en/methodology">methodology</a>. A day without an interval is not proof that no alert happened. Check the terms of the primary sources before republishing.</p>
<h2>How to cite</h2>
<p>${SITE_NAME}, “Open data on air raid alerts in Kyiv and Kyiv Oblast”, ${esc(absoluteUrl('/en/open-data'))}, date of download. The calculation code is open in the <a href="${REPOSITORY_URL}">project repository</a>.</p>`,
  },
  // ------------------------------------------------------ English landing
  {
    file: 'en/index.html',
    lang: 'en',
    path: '/en/',
    alternates: { uk: '/', en: '/en/' },
    ogType: 'website',
    title: `Kyiv air raid alert statistics: history, duration and map | ${SITE_NAME}`,
    h1: 'Air raid alert statistics for Kyiv and Kyiv Oblast',
    description: 'Interactive history of air raid alerts in Kyiv and Kyiv Oblast since 2022: how many alerts, how long they lasted, monthly and yearly statistics, records, a district map of researched attack consequences and open data.',
    breadcrumbs: [],
    main: `<h1>Air raid alert statistics for Kyiv and Kyiv Oblast</h1>
<p class="lead">Air Alert Stat is an interactive history of air raid alerts in Kyiv and Kyiv Oblast and of researched reports of attack consequences. Choose a period, explore the district map, daily and 24-hour timelines and trends.</p>
<a class="cta" href="/?lang=en">Open the dashboard</a>
<h2>Statistics archive</h2>
<ul>
<li><a href="/en/stats/kyiv">Kyiv: alerts by year and month since ${city.from.slice(0, 4)}</a> — totals, records and a page for every month.</li>
<li><a href="/en/stats/kyiv-oblast">Kyiv Oblast: alerts by year and month since ${oblast.from.slice(0, 4)}</a>.</li>
<li><a href="/en/open-data">Open data (CSV)</a> with daily counts and durations.</li>
</ul>
<h2>What the dashboard shows</h2>
<ul>
<li><strong>Map</strong> — researched reports of attack consequences aggregated by Kyiv district or Kyiv Oblast community, with sources for every record.</li>
<li><strong>By day</strong> — the number of alerts and total alert time for each day of the selected period.</li>
<li><strong>24 hours</strong> — when exactly alerts started and ended during each day, in Kyiv time.</li>
<li><strong>Trends</strong> — equal periods compared side by side, so weeks or months can be compared fairly.</li>
<li><strong>Ballistics</strong> — episodes of ballistic missile attacks identified from sources.</li>
</ul>
<p>The map can show Kyiv City, Kyiv Oblast or both; the other views cover Kyiv City. Every view works with a preset or custom period, and the address bar keeps the selection so it can be shared. Monthly and yearly figures for both areas are in the <a href="/en/stats/kyiv">statistics archive</a>.</p>
<h2>Guides</h2>
<ul>
<li><a href="/en/kyiv-air-alerts">Air raid alerts in Kyiv: what the dashboard shows</a></li>
<li><a href="/en/kyiv-oblast-alerts">Air raid alerts in Kyiv Oblast</a></li>
<li><a href="/en/methodology">Data sources and methodology</a></li>
</ul>
<h2>Important</h2>
<p>Alert statistics and news reports about consequences are separate datasets. A missing record does not prove that nothing happened. Exact coordinates of recent strikes are not published. This is historical analytics, not a warning service: during an alert, follow official signals.</p>`,
  },
];

/** 404 page (served by Workers static assets for unknown paths). */
export const NOT_FOUND_PAGE = {
  file: '404.html',
  lang: 'uk',
  path: '/404',
  noCanonical: true,
  robots: 'noindex,follow',
  title: `Сторінку не знайдено / Page not found | ${SITE_NAME}`,
  h1: 'Сторінку не знайдено',
  description: 'Такої сторінки немає на Air Alert Stat. This page does not exist on Air Alert Stat.',
  breadcrumbs: [],
  main: `<h1>Сторінку не знайдено</h1>
<p class="lead">Можливо, адреса змінилася. Спробуйте <a href="/">дашборд</a>, <a href="/stats/kyiv">архів статистики по місяцях</a> або <a href="/methodology">методологію</a>.</p>
<h2 lang="en">Page not found</h2>
<p lang="en">The address may have changed. Try the <a href="/?lang=en">dashboard</a>, the <a href="/en/stats/kyiv">monthly statistics archive</a> or the <a href="/en/">English overview</a>.</p>`,
};
