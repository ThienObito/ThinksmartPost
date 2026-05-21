const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads');

const LIB_FILE = path.join(DATA_DIR, 'library.json');

// Read existing library
let lib = JSON.parse(fs.readFileSync(LIB_FILE, 'utf-8'));
lib.images = []; // Clear and rebuild

// Process all image files
const files = fs.readdirSync(UPLOAD_DIR).filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f) && !f.startsWith('thumb_'));

// Tag mapping based on filename keywords
const tagMap = [
  { patterns: ['aerospace', 'aircraft', 'wing', 'engine', 'blade', 'combustion', 'fuselage', 'landing-gear', 'inlet', 'piping', 'airplane', 'inspection'], tags: ['hàng không', 'aerospace', 'kiểm tra'] },
  { patterns: ['oto', 'automotive', 'ô tô', 'xe', 'car', 'dau-oto', 'suppercar', 'slider-automotive'], tags: ['ô tô', 'automotive'] },
  { patterns: ['3d', 'in-3d', 'in3d', 'printing', 'slm', 'sla', 'fdm', 'printer', 'print'], tags: ['in 3D', '3D printing'] },
  { patterns: ['medical', 'yte', 'y-tế', 'bio', 'implant', 'dental', 'nha-khoa'], tags: ['y tế', 'medical', 'implant'] },
  { patterns: ['mockup', 'mau-in', 'sample'], tags: ['mẫu', 'mockup'] },
  { patterns: ['scan', 'scanner', '3dscanner', 'quét'], tags: ['scan 3D', 'quét 3D'] },
  { patterns: ['khuon', 'mold', 'mould'], tags: ['khuôn', 'mold'] },
  { patterns: ['qc', 'kiem-tra', 'chat-luong', 'inspection', 'cmm'], tags: ['kiểm tra chất lượng', 'QC'] },
  { patterns: ['metal', 'kim-loai', 'titanium', 'steel'], tags: ['kim loại', 'metal'] },
  { patterns: ['formlabs', 'form', 'resin'], tags: ['Formlabs', 'resin'] },
  { patterns: ['altair', 'mo-phong', 'simulation', 'cae'], tags: ['mô phỏng', 'Altair', 'CAE'] },
  { patterns: ['eos', 'industrial'], tags: ['công nghiệp', 'EOS'] },
  { patterns: ['may-in', 'printer', 'sla-1900', 'ts500', 'culp'], tags: ['máy in 3D'] },
  { patterns: ['marine', 'tau', 'thuyen', 'ship'], tags: ['hàng hải', 'marine'] },
  { patterns: ['bamboo'], tags: ['bamboo', 'vật liệu'] },
  { patterns: ['xtar', 'box'], tags: ['bao bì', 'packaging'] },
];

function getTags(filename, folderHint) {
  const lower = filename.toLowerCase();
  const matched = new Set();
  matched.add('in 3D');
  for (const entry of tagMap) {
    if (entry.patterns.some(p => lower.includes(p))) {
      entry.tags.forEach(t => matched.add(t));
    }
  }
  if (folderHint) matched.add(folderHint.toLowerCase());
  return [...matched];
}

function getAlt(filename) {
  const base = path.basename(filename, path.extname(filename))
    .replace(/[_-]/g, ' ')
    .replace(/\d+/g, '')
    .trim();
  const parts = base.split(/\s+/).filter(p => p.length > 1);
  return parts.slice(0, 6).join(' ') || `Hình ảnh minh họa`;
}

let added = 0;
for (const f of files) {
  const filePath = path.join(UPLOAD_DIR, f);
  const stat = fs.statSync(filePath);
  const ext = path.extname(f).toLowerCase();
  const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/gif';
  
  lib.images.push({
    id: 'img-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    folderId: null,
    filename: f,
    originalName: f,
    url: '/uploads/' + f,
    thumb: '/uploads/' + f,
    alt: getAlt(f),
    tags: getTags(f),
    width: null,
    height: null,
    fileSize: stat.size,
    mimeType: mime,
    userId: 'admin-001',
    createdAt: new Date().toISOString(),
  });
  added++;
}

fs.writeFileSync(LIB_FILE, JSON.stringify(lib, null, 2), 'utf-8');
console.log(`Added ${added} images to library`);
console.log('Total images:', lib.images.length);
