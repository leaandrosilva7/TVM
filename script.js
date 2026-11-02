const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const COR = {
  verde: '#3ddc6a',
  claro: '#cfe9d6',
  suave: '#7fa88a',
  vermelho: '#ff6b6b',
  amarelo: '#ffd54a',
  grade: '#14301c',
};

let dados = null;   // { D, T, vmed, limite }
let quadro = null;  // id do requestAnimationFrame
let gPos = null;    // gráfico de posição
let gVel = null;    // gráfico de velocidade

function segundos(hora) {
  const [h, m, s] = hora.split(':').map(Number);
  return h * 3600 + m * 60 + (s || 0);
}

function fmt(n, casas = 2) {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: casas });
}

function mostrarErro(msg) {
  if (quadro) cancelAnimationFrame(quadro);
  $('conta').textContent = '';
  $('velocidade').textContent = '–';
  $('situacao').textContent = msg;
  $('situacao').className = 'erro';
  $('animacao').classList.add('velho');
}

/* ---------- curva ilustrativa ----------
   u = t/T vai de 0 a 1.
   posição (fração da ponte): p(u) = u - A*sin(2*pi*u)/(2*pi)
   velocidade relativa:       p'(u) = 1 - A*cos(2*pi*u)
   A (irregularidade) vem do controle deslizante: 0 = velocidade constante.
   A velocidade é igual à média quando cos(2*pi*u) = 0, ou seja u = 0,25 e u = 0,75. */
let A = 0.5;
const posicao = (u) => u - (A * Math.sin(2 * Math.PI * u)) / (2 * Math.PI);
const velRel = (u) => 1 - A * Math.cos(2 * Math.PI * u);
const C1 = 0.25;
const C2 = 0.75;

function el(nome, attrs, pai) {
  const e = document.createElementNS(NS, nome);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (pai) pai.appendChild(e);
  return e;
}

/* ---------- gráficos ---------- */
const M = { l: 62, r: 20, t: 14, b: 42, w: 600, h: 300 };

// Cria eixos, grade e rótulos. Eixo X: tempo em s (u de 0 a 1). Eixo Y: de 0 até ymax.
function criarGrafico(svgId, { T, ymax, ytitulo }) {
  const svg = $(svgId);
  svg.innerHTML = '';
  const gx = (u) => M.l + u * (M.w - M.l - M.r);
  const gy = (v) => M.h - M.b - (v / ymax) * (M.h - M.t - M.b);

  const texto = (x, y, s, anchor = 'middle', cor = COR.claro) => {
    const t = el('text', { x, y, fill: cor, 'font-size': 13, 'text-anchor': anchor, 'font-family': 'Arial' }, svg);
    t.textContent = s;
  };

  const casas = ymax >= 100 ? 0 : ymax >= 10 ? 1 : 2;
  for (let k = 0; k <= 4; k++) {
    const v = (ymax * k) / 4;
    el('line', { x1: M.l, y1: gy(v), x2: M.w - M.r, y2: gy(v), stroke: k ? COR.grade : COR.suave }, svg);
    texto(M.l - 6, gy(v) + 4, fmt(v, casas), 'end');
  }
  el('line', { x1: M.l, y1: M.t, x2: M.l, y2: M.h - M.b, stroke: COR.suave }, svg);
  [0, 0.5, 1].forEach((u) => texto(gx(u), M.h - M.b + 16, fmt(u * T, 1)));
  texto((M.l + M.w - M.r) / 2, M.h - 8, 'tempo (s)');
  const ylab = el('text', {
    x: 14, y: M.h / 2, fill: COR.claro, 'font-size': 13, 'text-anchor': 'middle',
    'font-family': 'Arial', transform: `rotate(-90 14 ${M.h / 2})`,
  }, svg);
  ylab.textContent = ytitulo;

  return { svg, gx, gy, texto, bolinha: null };
}

// Desenha a curva em trechos: verde enquanto a velocidade está no limite, vermelha quando passa.
function curvaColorida(svg, ponto, vel, limite) {
  const N = 120;
  let pts = [];
  let cor = null;
  const fechar = () => {
    if (pts.length > 1) {
      el('polyline', {
        points: pts.join(' '), fill: 'none', stroke: cor, 'stroke-width': 3,
        'stroke-linejoin': 'round', 'stroke-linecap': 'round',
      }, svg);
    }
  };
  for (let i = 0; i < N; i++) {
    const c = vel((i + 0.5) / N) > limite ? COR.vermelho : COR.verde;
    if (c !== cor) {
      fechar();
      cor = c;
      pts = [ponto(i / N)];
    }
    pts.push(ponto((i + 1) / N));
  }
  fechar();
}

function criarBolinha(g) {
  g.bolinha = el('circle', { r: 6, fill: '#fff', stroke: COR.verde, 'stroke-width': 2 }, g.svg);
}

function desenharPosicao(D, T, vmed, limite) {
  const limKm = (limite * T) / 3600; // km que o limite permitiria no tempo T
  const g = criarGrafico('grafico-pos', { T, ymax: Math.max(D, limKm) * 1.1, ytitulo: 'posição (km)' });
  const { svg, gx, gy, texto } = g;

  // reta da velocidade média (secante)
  el('line', { x1: gx(0), y1: gy(0), x2: gx(1), y2: gy(D), stroke: COR.claro, 'stroke-width': 2, 'stroke-dasharray': '6 5' }, svg);
  // reta com a inclinação do limite
  el('line', { x1: gx(0), y1: gy(0), x2: gx(1), y2: gy(limKm), stroke: COR.vermelho, 'stroke-width': 2 }, svg);

  // curva s(t)
  curvaColorida(
    svg,
    (u) => `${gx(u).toFixed(1)},${gy(posicao(u) * D).toFixed(1)}`,
    (u) => vmed * velRel(u),
    limite
  );

  // tangentes nos pontos c (paralelas à secante: dp/du = 1)
  [C1, C2].forEach((c, i) => {
    const pc = posicao(c) * D;
    const dx = 0.13;
    el('line', { x1: gx(c - dx), y1: gy(pc - dx * D), x2: gx(c + dx), y2: gy(pc + dx * D), stroke: COR.amarelo, 'stroke-width': 2 }, svg);
    el('circle', { cx: gx(c), cy: gy(pc), r: 5, fill: COR.amarelo }, svg);
    texto(gx(c) + (i ? -14 : 16), gy(pc) + (i ? -12 : 22), 'c' + (i + 1), 'middle', COR.amarelo);
  });

  // pontos A e B
  el('circle', { cx: gx(0), cy: gy(0), r: 5, fill: COR.verde }, svg);
  el('circle', { cx: gx(1), cy: gy(D), r: 5, fill: COR.verde }, svg);
  texto(gx(0) + 10, gy(0) - 8, 'A', 'middle', COR.verde);
  texto(gx(1) - 8, gy(D) - 10, 'B', 'middle', COR.verde);

  criarBolinha(g);
  return g;
}

function desenharVelocidade(T, vmed, limite) {
  const vmax = Math.max(vmed * (1 + A), limite, vmed) * 1.1;
  const g = criarGrafico('grafico-vel', { T, ymax: vmax, ytitulo: 'velocidade (km/h)' });
  const { svg, gx, gy, texto } = g;

  // velocidade média e limite
  el('line', { x1: gx(0), y1: gy(vmed), x2: gx(1), y2: gy(vmed), stroke: COR.claro, 'stroke-width': 2, 'stroke-dasharray': '6 5' }, svg);
  el('line', { x1: gx(0), y1: gy(limite), x2: gx(1), y2: gy(limite), stroke: COR.vermelho, 'stroke-width': 2 }, svg);

  // curva v(t)
  curvaColorida(
    svg,
    (u) => `${gx(u).toFixed(1)},${gy(vmed * velRel(u)).toFixed(1)}`,
    (u) => vmed * velRel(u),
    limite
  );

  // instantes c: a velocidade cruza a média
  [C1, C2].forEach((c, i) => {
    el('circle', { cx: gx(c), cy: gy(vmed), r: 5, fill: COR.amarelo }, svg);
    texto(gx(c) + (i ? 14 : -14), gy(vmed) - 12, 'c' + (i + 1), 'middle', COR.amarelo);
  });

  criarBolinha(g);
  return g;
}

/* ---------- animação ---------- */
function posicionar(u) {
  const { D, vmed, limite } = dados;
  const frac = posicao(u);
  const v = vmed * velRel(u);
  const acima = v > limite;

  $('carro').style.left = frac * 100 + '%';

  gPos.bolinha.setAttribute('cx', gPos.gx(u));
  gPos.bolinha.setAttribute('cy', gPos.gy(frac * D));
  gVel.bolinha.setAttribute('cx', gVel.gx(u));
  gVel.bolinha.setAttribute('cy', gVel.gy(v));
  [gPos, gVel].forEach((g) => g.bolinha.setAttribute('fill', acima ? COR.vermelho : '#fff'));

  $('agora').textContent = `${fmt(v, 0)} km/h`;
  $('agora').classList.toggle('acima', acima);

  const perto = Math.abs(u - C1) < 0.03 ? 'c1' : Math.abs(u - C2) < 0.03 ? 'c2' : null;
  $('aviso-c').textContent = perto
    ? `Ponto ${perto}: velocidade do carro = velocidade média (${fmt(vmed)} km/h)`
    : '\u00A0';
}

function animar() {
  if (!dados) return;
  if (quadro) cancelAnimationFrame(quadro);
  const reduzir = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduzir) return posicionar(1);

  const duracao = 7000;
  const inicio = performance.now();
  function passo(agora) {
    const u = Math.min((agora - inicio) / duracao, 1);
    posicionar(u);
    if (u < 1) quadro = requestAnimationFrame(passo);
  }
  quadro = requestAnimationFrame(passo);
}

/* ---------- cálculo ---------- */
function calcular() {
  const km = Number($('distancia').value);
  const limite = Number($('limite').value);
  if (!(km > 0) || !(limite > 0) || !$('entrada').value || !$('saida').value) {
    return mostrarErro('Preencha todos os campos com valores válidos.');
  }

  const inicio = segundos($('entrada').value);
  let fim = segundos($('saida').value);
  if (fim < inicio) fim += 86400; // passou da meia-noite
  const tempo = fim - inicio;
  if (tempo <= 0) return mostrarErro('A saída precisa ser depois da entrada.');

  A = Number($('irreg').value);

  const v = (km / tempo) * 3600;
  const passou = v > limite;

  $('conta').textContent = `(${fmt(km)} km ÷ ${tempo} s) × 3600 =`;
  $('velocidade').textContent = `${fmt(v)} km/h`;
  $('situacao').className = passou ? 'erro' : '';
  $('situacao').textContent = passou
    ? `Média acima de ${fmt(limite)} km/h. Pelo TVM, em algum instante o carro estava a ${fmt(v)} km/h. Passou do limite!`
    : `Média abaixo de ${fmt(limite)} km/h. O TVM não garante que ele respeitou o limite o tempo todo.`;

  dados = { D: km, T: tempo, vmed: v, limite };
  $('animacao').classList.remove('velho');
  gPos = desenharPosicao(km, tempo, v, limite);
  gVel = desenharVelocidade(tempo, v, limite);
  animar();
}

/* ---------- eventos ---------- */
let timer = null;
function agendar() {
  clearTimeout(timer);
  timer = setTimeout(calcular, 250);
}

['distancia', 'limite', 'entrada', 'saida', 'irreg'].forEach((id) => $(id).addEventListener('input', agendar));
$('irreg').addEventListener('input', () => { $('irregVal').textContent = fmt(Number($('irreg').value)); });
$('repetir').addEventListener('click', animar);
calcular();
