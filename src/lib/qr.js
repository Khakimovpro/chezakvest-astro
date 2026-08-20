// Генератор QR-кода без внешних сервисов и зависимостей.
// Нужен окну мессенджеров: на оригинале там нарисован QR, а любой публичный
// генератор картинок — это запрос на чужой сервер прямо с открытой страницы.
// Режим один — байтовый (ссылки), уровень коррекции M, версии 1–10: этого
// хватает на ссылки до 271 символа.

// Логарифмы поля GF(256) с образующим многочленом 0x11D — на них держится
// вся арифметика кодов Рида — Соломона.
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i += 1) {
  EXP[i] = x;
  LOG[x] = i;
  x <<= 1;
  if (x & 0x100) x ^= 0x11d;
}
for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];

const multiply = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

// Число кодовых слов на версию: всего, коррекции на блок, блоков (уровень M).
const VERSIONS = [
  { total: 26, ecPerBlock: 10, blocks: 1, align: [] },
  { total: 44, ecPerBlock: 16, blocks: 1, align: [6, 18] },
  { total: 70, ecPerBlock: 26, blocks: 1, align: [6, 22] },
  { total: 100, ecPerBlock: 18, blocks: 2, align: [6, 26] },
  { total: 134, ecPerBlock: 24, blocks: 2, align: [6, 30] },
  { total: 172, ecPerBlock: 16, blocks: 4, align: [6, 34] },
  { total: 196, ecPerBlock: 18, blocks: 4, align: [6, 22, 38] },
  { total: 242, ecPerBlock: 22, blocks: 4, align: [6, 24, 42] },
  { total: 292, ecPerBlock: 22, blocks: 5, align: [6, 26, 46] },
  { total: 346, ecPerBlock: 26, blocks: 5, align: [6, 28, 50] },
];

function generatorPolynomial(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i += 1) {
    const next = new Array(poly.length + 1).fill(0);
    // Умножение на (x + α^i): старший коэффициент едет влево, α-кратный — вправо.
    poly.forEach((value, index) => {
      next[index] ^= value;
      next[index + 1] ^= multiply(value, EXP[i]);
    });
    poly = next;
  }
  return poly;
}

function errorCorrection(data, degree) {
  const generator = generatorPolynomial(degree);
  const remainder = new Array(degree).fill(0);
  data.forEach((byte) => {
    const factor = byte ^ remainder.shift();
    remainder.push(0);
    generator.slice(1).forEach((coefficient, index) => {
      remainder[index] ^= multiply(coefficient, factor);
    });
  });
  return remainder;
}

function encodeData(bytes, version) {
  const { total, ecPerBlock, blocks } = VERSIONS[version - 1];
  const dataCount = total - ecPerBlock * blocks;
  const bits = [];
  const push = (value, length) => {
    for (let i = length - 1; i >= 0; i -= 1) bits.push((value >> i) & 1);
  };
  push(0b0100, 4);
  push(bytes.length, version < 10 ? 8 : 16);
  bytes.forEach((byte) => push(byte, 8));
  // Ограничитель, добивка до целого байта и чередующиеся байты-заполнители.
  push(0, Math.min(4, dataCount * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const codewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    codewords.push(bits.slice(i, i + 8).reduce((sum, bit) => (sum << 1) | bit, 0));
  }
  for (let i = 0; codewords.length < dataCount; i += 1) codewords.push(i % 2 ? 0x11 : 0xec);

  // Данные режутся на блоки: короткие идут первыми, длинные — с хвоста.
  const shortLength = Math.floor(dataCount / blocks);
  const longBlocks = dataCount % blocks;
  const dataBlocks = [];
  const ecBlocks = [];
  let offset = 0;
  for (let block = 0; block < blocks; block += 1) {
    const length = shortLength + (block >= blocks - longBlocks ? 1 : 0);
    const chunk = codewords.slice(offset, offset + length);
    offset += length;
    dataBlocks.push(chunk);
    ecBlocks.push(errorCorrection(chunk, ecPerBlock));
  }
  // Перемежение: сначала по столбцу из каждого блока данных, потом коррекция.
  const result = [];
  const maxData = Math.max(...dataBlocks.map((block) => block.length));
  for (let i = 0; i < maxData; i += 1) {
    dataBlocks.forEach((block) => { if (i < block.length) result.push(block[i]); });
  }
  for (let i = 0; i < ecPerBlock; i += 1) {
    ecBlocks.forEach((block) => result.push(block[i]));
  }
  return result;
}

const FORMAT_MASK = 0b101010000010010;

function formatBits(mask) {
  // Уровень M — это 00 в двух старших битах, дальше пятибитный BCH(15,5).
  let value = mask;
  let rest = value << 10;
  for (let i = 4; i >= 0; i -= 1) {
    if (rest & (1 << (i + 10))) rest ^= 0b10100110111 << i;
  }
  return (((value << 10) | rest) ^ FORMAT_MASK);
}

function versionBits(version) {
  let rest = version << 12;
  for (let i = 5; i >= 0; i -= 1) {
    if (rest & (1 << (i + 12))) rest ^= 0b1111100100101 << i;
  }
  return (version << 12) | rest;
}

const MASKS = [
  (row, column) => (row + column) % 2 === 0,
  (row) => row % 2 === 0,
  (row, column) => column % 3 === 0,
  (row, column) => (row + column) % 3 === 0,
  (row, column) => (Math.floor(row / 2) + Math.floor(column / 3)) % 2 === 0,
  (row, column) => ((row * column) % 2) + ((row * column) % 3) === 0,
  (row, column) => (((row * column) % 2) + ((row * column) % 3)) % 2 === 0,
  (row, column) => (((row + column) % 2) + ((row * column) % 3)) % 2 === 0,
];

function buildMatrix(version, codewords, mask) {
  const size = version * 4 + 17;
  const modules = Array.from({ length: size }, () => new Array(size).fill(null));
  const reserved = Array.from({ length: size }, () => new Array(size).fill(false));

  const setFunction = (row, column, value) => {
    modules[row][column] = value;
    reserved[row][column] = true;
  };

  const finder = (top, left) => {
    for (let row = -1; row <= 7; row += 1) {
      for (let column = -1; column <= 7; column += 1) {
        const y = top + row;
        const x = left + column;
        if (y < 0 || y >= size || x < 0 || x >= size) continue;
        const inner = row >= 0 && row <= 6 && column >= 0 && column <= 6
          && (row === 0 || row === 6 || column === 0 || column === 6
            || (row >= 2 && row <= 4 && column >= 2 && column <= 4));
        setFunction(y, x, inner);
      }
    }
  };
  finder(0, 0);
  finder(0, size - 7);
  finder(size - 7, 0);

  // Синхродорожки.
  for (let i = 8; i < size - 8; i += 1) {
    setFunction(6, i, i % 2 === 0);
    setFunction(i, 6, i % 2 === 0);
  }

  // Выравнивающие квадраты — везде, кроме углов с поисковыми узорами.
  const centers = VERSIONS[version - 1].align;
  centers.forEach((row) => {
    centers.forEach((column) => {
      const corner = (row === 6 && column === 6)
        || (row === 6 && column === size - 7)
        || (row === size - 7 && column === 6);
      if (corner) return;
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          setFunction(row + dy, column + dx, Math.max(Math.abs(dy), Math.abs(dx)) !== 1);
        }
      }
    });
  });

  // Места под сведения о формате и версии.
  for (let i = 0; i < 9; i += 1) {
    if (i !== 6) setFunction(8, i, false);
    if (i !== 6) setFunction(i, 8, false);
  }
  for (let i = 0; i < 8; i += 1) {
    setFunction(8, size - 1 - i, false);
    setFunction(size - 1 - i, 8, false);
  }
  setFunction(size - 8, 8, true);
  if (version >= 7) {
    for (let i = 0; i < 18; i += 1) {
      setFunction(Math.floor(i / 3), size - 11 + (i % 3), false);
      setFunction(size - 11 + (i % 3), Math.floor(i / 3), false);
    }
  }

  // Укладка данных змейкой снизу справа.
  const bits = [];
  codewords.forEach((byte) => {
    for (let i = 7; i >= 0; i -= 1) bits.push((byte >> i) & 1);
  });
  let index = 0;
  let upward = true;
  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right -= 1;
    for (let step = 0; step < size; step += 1) {
      const row = upward ? size - 1 - step : step;
      for (let column = right; column > right - 2; column -= 1) {
        if (reserved[row][column]) continue;
        const bit = index < bits.length ? bits[index] : 0;
        index += 1;
        modules[row][column] = Boolean(bit) !== MASKS[mask](row, column) ? true : false;
      }
    }
    upward = !upward;
  }

  // Сведения о формате: те же 15 бит в двух местах.
  const format = formatBits(mask);
  for (let i = 0; i < 15; i += 1) {
    const bit = ((format >> i) & 1) === 1;
    // Первая копия обходит верхний левый поисковый узор: сверху вниз по столбцу 8,
    // затем справа налево по строке 8.
    if (i < 6) modules[i][8] = bit;
    else if (i === 6) modules[7][8] = bit;
    else if (i === 7) modules[8][8] = bit;
    else if (i === 8) modules[8][7] = bit;
    else modules[8][14 - i] = bit;
    // Вторая копия: правый край строки 8, затем низ столбца 8.
    if (i < 8) modules[8][size - 1 - i] = bit;
    else modules[size - 15 + i][8] = bit;
  }
  modules[size - 8][8] = true;
  if (version >= 7) {
    const info = versionBits(version);
    for (let i = 0; i < 18; i += 1) {
      const bit = ((info >> i) & 1) === 1;
      modules[Math.floor(i / 3)][size - 11 + (i % 3)] = bit;
      modules[size - 11 + (i % 3)][Math.floor(i / 3)] = bit;
    }
  }
  return modules;
}

function penalty(modules) {
  const size = modules.length;
  let score = 0;
  // Правило 1 — цепочки одного цвета длиной от пяти.
  const runs = (get) => {
    for (let a = 0; a < size; a += 1) {
      let run = 1;
      for (let b = 1; b < size; b += 1) {
        if (get(a, b) === get(a, b - 1)) {
          run += 1;
          if (run === 5) score += 3;
          else if (run > 5) score += 1;
        } else run = 1;
      }
    }
  };
  runs((row, column) => modules[row][column]);
  runs((column, row) => modules[row][column]);
  // Правило 2 — однотонные квадраты 2×2.
  for (let row = 0; row < size - 1; row += 1) {
    for (let column = 0; column < size - 1; column += 1) {
      const value = modules[row][column];
      if (value === modules[row][column + 1] && value === modules[row + 1][column]
        && value === modules[row + 1][column + 1]) score += 3;
    }
  }
  // Правило 3 — узор 1:1:3:1:1 с широким светлым полем.
  const pattern = [true, false, true, true, true, false, true];
  const hasPattern = (get, a, b) => pattern.every((value, index) => get(a, b + index) === value);
  const light = (get, a, b) => {
    for (let i = 0; i < 4; i += 1) if (get(a, b + i) !== false) return false;
    return true;
  };
  const scan = (get) => {
    for (let a = 0; a < size; a += 1) {
      for (let b = 0; b + 6 < size; b += 1) {
        if (!hasPattern(get, a, b)) continue;
        if (b >= 4 && light(get, a, b - 4)) score += 40;
        if (b + 10 < size && light(get, a, b + 7)) score += 40;
      }
    }
  };
  scan((row, column) => (column >= 0 && column < size ? modules[row][column] : false));
  scan((column, row) => (row >= 0 && row < size ? modules[row][column] : false));
  // Правило 4 — перекос доли тёмных модулей.
  const dark = modules.flat().filter(Boolean).length;
  const percent = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;
  return score;
}

/** Матрица QR-кода: массив строк из булевых модулей (true — тёмный). */
export function qrMatrix(text) {
  const bytes = [...new TextEncoder().encode(text)];
  // В версиях 1–9 длина строки занимает 8 бит, с десятой — 16; вместе с четырьмя
  // битами режима это два или три кодовых слова, которые данным уже не достанутся.
  const version = VERSIONS.findIndex(({ total, ecPerBlock, blocks }, index) => (
    bytes.length <= total - ecPerBlock * blocks - (index < 9 ? 2 : 3)
  )) + 1;
  if (!version) throw new Error(`Строка длиннее, чем берёт QR версии 10: ${bytes.length} байт`);
  const codewords = encodeData(bytes, version);
  let best = null;
  for (let mask = 0; mask < 8; mask += 1) {
    const modules = buildMatrix(version, codewords, mask);
    const score = penalty(modules);
    if (!best || score < best.score) best = { modules, score };
  }
  return best.modules;
}

/** Готовый квадратный SVG с QR-кодом — вставляется в разметку как есть. */
export function qrSvg(text, { size = 168, margin = 2, label = '' } = {}) {
  const modules = qrMatrix(text);
  const side = modules.length + margin * 2;
  let path = '';
  modules.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value) path += `M${x + margin} ${y + margin}h1v1h-1z`;
    });
  });
  const title = label ? `<title>${label}</title>` : '';
  return `<svg class="mfab__qr" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}" width="${size}" height="${size}" role="img" aria-label="${label}" shape-rendering="crispEdges">${title}<rect width="${side}" height="${side}" fill="#fff"/><path d="${path}" fill="#111"/></svg>`;
}
