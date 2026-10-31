import * as THREE from 'three';

/** Local artwork, generated once; no network fonts, logos or downloaded scripts. */
export function createToolTextures() {
  const owned = [];
  function paint(draw, w = 512, h = 512) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    draw(canvas.getContext('2d'), w, h);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
    owned.push(texture); return texture;
  }
  const newspaper = paint((c, w, h) => {
    c.fillStyle = '#c9c1a7'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#34362f'; c.font = 'bold 48px Georgia'; c.fillText('ВЕЧЕРНИЙ ГОРОД', 24, 64);
    c.font = '14px monospace'; c.fillText('№ 38   •   СРЕДА, 28 ОКТЯБРЯ   •   ГОРОДСКОЕ ИЗДАНИЕ', 26, 91);
    c.fillRect(24, 106, w - 48, 3);
    c.font = 'bold 27px Georgia'; c.fillText('Свет в окнах', 26, 145);
    for (let col = 0; col < 3; col++) for (let row = 0; row < 29; row++) {
      const x = 26 + col * 158, y = 170 + row * 10;
      c.fillStyle = row % 4 ? '#656253' : '#47493e';
      c.fillRect(x, y, 106 + ((row * 17 + col * 13) % 35), 2);
    }
    c.fillStyle = '#78776b'; c.fillRect(26, 180, 135, 95);
    c.fillStyle = '#aaa58f';
    for (let n = 0; n < 5; n++) c.fillRect(32 + n * 25, 198 + (n % 3) * 13, 20, 73 - (n % 3) * 13);
  });
  const label = (title, sub, color) => paint((c, w, h) => {
    c.fillStyle = '#d6d1b7'; c.fillRect(0, 0, w, h);
    c.fillStyle = color; c.fillRect(0, 20, w, 120);
    c.fillStyle = '#ebe6d3'; c.font = 'bold 44px sans-serif'; c.textAlign = 'center'; c.fillText(title, w / 2, 96);
    c.fillStyle = '#333932'; c.font = '22px monospace'; c.fillText(sub, w / 2, 185);
    c.font = '18px monospace'; c.fillText('БЫТОВОЕ ПРИМЕНЕНИЕ', w / 2, 228);
    c.lineWidth = 4; c.beginPath(); c.moveTo(256, 265); c.lineTo(315, 366); c.lineTo(197, 366); c.closePath(); c.stroke();
    c.font = 'bold 58px sans-serif'; c.fillText('!', 256, 353);
    for (let n = 0; n < 9; n++) c.fillRect(60 + n * 9, 410, n % 2 ? 3 : 5, 50);
    c.font = '19px monospace'; c.fillText('ХРАНИТЬ В СУХОМ МЕСТЕ', 295, 446);
  });
  const fabric = paint((c, w, h) => {
    c.fillStyle = '#858475'; c.fillRect(0, 0, w, h);
    for (let n = 0; n < w; n += 4) {
      c.fillStyle = n % 8 ? '#9c9988' : '#66685f'; c.fillRect(n, 0, 1, h);
      c.fillStyle = '#737668'; c.fillRect(0, n, w, 1);
    }
  }, 128, 128);
  if (fabric) { fabric.wrapS = fabric.wrapT = THREE.RepeatWrapping; fabric.repeat.set(3, 3); }
  return { newspaper, fabric, spray: label('ДИХЛОФОС', 'ОТ ПОЛЗАЮЩИХ НАСЕКОМЫХ', '#616c49'),
    extinguisher: label('ОП–2', 'ОГНЕТУШИТЕЛЬ ПОРОШКОВЫЙ', '#8f3026'),
    dispose() { owned.forEach(t => t.dispose()); } };
}
