// 弹幕库：每一种弹幕不只是换个字，而是换一套行为逻辑。
// 这是《弹幕靶场》区别于普通打飞机的核心 —— 弹幕有「语义」。

export const DANMU_TYPES = {
  // 普通弹幕：直线下落，最基础的靶子
  normal: {
    id: 'normal', text: '哈哈', hp: 1, speed: 1.0, size: 15,
    color: '#dbe6ff', glow: 'rgba(180,205,255,.55)', score: 10, weight: 26,
  },

  // 哈哈哈哈哈哈：被打中后分裂成三条小「哈」，笑声会传染
  haha: {
    id: 'haha', text: '哈哈哈哈哈哈', hp: 1, speed: 0.92, size: 16,
    color: '#fff3b0', glow: 'rgba(255,225,120,.55)', score: 20, weight: 14,
    onDeath: 'split', splitCount: 3,
  },

  // 就这？：高机动，会主动左右闪避你的子弹，最难打
  jiuzhe: {
    id: 'jiuzhe', text: '就这？', hp: 1, speed: 1.75, size: 19,
    color: '#ff9d9d', glow: 'rgba(255,110,110,.7)', score: 45, weight: 11,
    evade: true, evadeStrength: 210,
  },

  // 前排：成群结队出现，一队 5 条，考验清场效率
  qianpai: {
    id: 'qianpai', text: '前排', hp: 1, speed: 1.25, size: 16,
    color: '#9ee7ff', glow: 'rgba(120,220,255,.6)', score: 15, weight: 10,
    group: 5, groupSpread: 62,
  },

  // ？？？？：随机变向，轨迹不可预测
  wenhao: {
    id: 'wenhao', text: '？？？？', hp: 1, speed: 1.05, size: 18,
    color: '#d6b3ff', glow: 'rgba(190,140,255,.6)', score: 25, weight: 10,
    chaos: true, chaosStrength: 130,
  },

  // 下次一定：假动作，靠近后会突然倒退逃跑
  xiaci: {
    id: 'xiaci', text: '下次一定', hp: 1, speed: 1.1, size: 16,
    color: '#ffd28a', glow: 'rgba(255,200,120,.6)', score: 30, weight: 10,
    fake: true,
  },

  // 太长不看：超长条弹幕，一枪打不碎，要连续命中同一位置
  taichang: {
    id: 'taichang', text: '太长不看', hp: 5, speed: 0.72, size: 17,
    color: '#b6ffb6', glow: 'rgba(140,255,150,.6)', score: 65, weight: 8,
    long: true,
  },

  // 已三连：金色稀有，击碎后掉落回血 / 能量道具
  yisanlian: {
    id: 'yisanlian', text: '已三连', hp: 2, speed: 1.3, size: 16,
    color: '#ffd94a', glow: 'rgba(255,210,60,.85)', score: 55, weight: 6,
    gold: true, drop: true,
  },

  // 老粉报道：移动慢但血厚，顶着你的火力推进
  laofen: {
    id: 'laofen', text: '老粉报道', hp: 4, speed: 0.6, size: 17,
    color: '#8fa8ff', glow: 'rgba(130,160,255,.6)', score: 50, weight: 5,
    tank: true,
  },
};

// 开局前 20 秒只放这些温和的，避免一上来就劝退
export const EASY_POOL = ['normal', 'qianpai', 'haha', 'yisanlian'];
export const ALL_POOL = Object.keys(DANMU_TYPES);

// 按权重从池子里随机挑一种
export function pickType(pool, rng = Math.random) {
  const list = pool.map((id) => DANMU_TYPES[id]);
  const total = list.reduce((s, d) => s + (d.weight || 1), 0);
  let r = rng() * total;
  for (const d of list) {
    r -= (d.weight || 1);
    if (r <= 0) return d;
  }
  return list[list.length - 1];
}

const DEFAULTS = {
  maxMiss: 30,          // 漏掉多少条弹幕就糊满 100%
  fireInterval: 0.13,   // 自动开火间隔（秒）
  bulletSpeed: 760,     // 子弹速度 px/s
  bulletW: 3,
  bulletH: 16,
  playerW: 46,
  playerH: 30,
  playerLerp: 14,       // 走位跟手程度
  baseFall: 130,        // 弹幕基础下落速度 px/s
  ultCost: 100,         // 反弹所需能量
  ultGain: 1.2,         // 每次击碎获得能量（数值由难度扫描标定）
  splitHp: 1,
  difficultyTime: 150,  // 多少秒后下落速度拉满
  spawnStart: 0.75,     // 开局生成间隔（秒）
  spawnEnd: 0.18,       // 拉满后的生成间隔（秒）
  spawnRamp: 120,       // 多少秒把生成间隔拉满
  ultRelief: 5,         // 反弹一次清掉几条糊屏
};

// 允许外部注入覆盖（用于难度参数扫描；生产环境不传即为默认值）
export const CONFIG = Object.assign({}, DEFAULTS, globalThis.__TOY_CONFIG__ || {});
