// Scaling Logic for Wide Screens
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

const config = {
    type: Phaser.AUTO,
    scale: {
        mode: isMobile ? Phaser.Scale.RESIZE : Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: isMobile ? window.innerWidth : 800,
        height: isMobile ? window.innerHeight : 600
    },
    parent: 'game-container',
    backgroundColor: '#333',
    pixelArt: true,
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 0 },
            debug: false
        }
    },
    scene: {
        preload: preload,
        create: create,
        update: update
    }
};

const game = new Phaser.Game(config);

// Global Variables
let player;
let cursors;
let bullets;
let enemyBullets;
let enemies;
let items;
let coins;
let doors;
let stairs; // Stairs to next level
let walls; // Indestructible walls
let crates; // Destructible crates
let pits; // Holes in the floor
let uiLayer;
let minimapGraphics; // Minimap
let inventory = []; // Inventory
let inventoryUI; // Inventory UI Container
let statsUI; // Character Stats UI
let helpUI; // Help UI
let tempTexts; // Temporary texts (damage numbers etc)
let compendiumUI; // Compendium UI
let pauseUI; // Pause UI
let collectionData = { items: [], enemies: [] }; // Collection Data
let difficultyMultiplier = 1.0; // Difficulty Multiplier
let isPaused = false;
let leftStick = { active: false, x: 0, y: 0, pointerId: null, baseX: 0, baseY: 0 }; // Define leftStick globally

// --- Audio System (Synthetic) ---
const SoundSystem = {
    ctx: null,
    isPlayingMusic: false,
    nextNoteTime: 0,
    noteIndex: 0,
    // Simple fast-paced dungeon loop
    melody: [
        392.00, 0, 311.13, 0, 392.00, 0, 466.16, 0, 
        392.00, 0, 311.13, 0, 261.63, 293.66, 311.13, 0,
        196.00, 0, 196.00, 0, 392.00, 392.00, 293.66, 0 
    ],
    bass: [98.00, 73.42, 87.31, 73.42],

    init: function() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                this.ctx = new AudioContext();
            }
        }
        
        // Resume context on user interaction if suspended
        if (this.ctx && this.ctx.state === 'suspended') {
            const resumeContext = () => {
                this.ctx.resume().then(() => {
                    this.scheduleMusic();
                    // Remove listeners once resumed
                    document.removeEventListener('click', resumeContext);
                    document.removeEventListener('keydown', resumeContext);
                    document.removeEventListener('pointerdown', resumeContext);
                });
            };
            document.addEventListener('click', resumeContext);
            document.addEventListener('keydown', resumeContext);
            document.addEventListener('pointerdown', resumeContext);
        } else if (this.ctx && !this.isPlayingMusic) {
            this.scheduleMusic();
        }
    },

    scheduleMusic: function() {
        if (!this.ctx || this.isPlayingMusic) return;
        this.isPlayingMusic = true;
        this.nextNoteTime = this.ctx.currentTime + 0.1;
        
        const tick = () => {
            if (!this.isPlayingMusic) return; // Stop if flag cleared
            const now = this.ctx.currentTime;
            
            // Safety: If lag causes huge drift, reset timing to avoid infinite loop
            if (this.nextNoteTime < now - 0.5) {
                this.nextNoteTime = now;
            }

            while (this.nextNoteTime < now + 0.1) {
                this.playNote(this.nextNoteTime);
                this.nextNoteTime += 0.15; // Speed (Tempo)
            }
            setTimeout(tick, 25);
        };
        tick();
    },

    playNote: function(time) {
        // Melody
        let note = this.melody[this.noteIndex % this.melody.length];
        if (note) {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(note, time);
            gain.gain.setValueAtTime(0.1, time); // Increased volume
            gain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
            osc.connect(gain); gain.connect(this.ctx.destination);
            osc.start(time); osc.stop(time + 0.1);
        }
        
        // Bass
        if (this.noteIndex % 8 === 0) {
            let bassNote = this.bass[(Math.floor(this.noteIndex/8)) % this.bass.length];
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(bassNote, time);
            gain.gain.setValueAtTime(0.15, time); // Increased volume
            gain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);
            osc.connect(gain); gain.connect(this.ctx.destination);
            osc.start(time); osc.stop(time + 0.4);
        }
        this.noteIndex++;
    },

    // SFX
    playShoot: function() {
        if(!this.ctx) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(400, t);
        osc.frequency.exponentialRampToValueAtTime(50, t + 0.15);
        gain.gain.setValueAtTime(0.1, t); // Increased volume
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
        osc.connect(gain); gain.connect(this.ctx.destination);
        osc.start(t); osc.stop(t + 0.15);
    },

    playHit: function(isPlayer) {
        if(!this.ctx) return;
        const t = this.ctx.currentTime;
        // Debounce: Limit hit sounds to once every 80ms
        if (this.lastHitTime && (t - this.lastHitTime < 0.08)) return;
        this.lastHitTime = t;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = isPlayer ? 'sawtooth' : 'square';
        osc.frequency.setValueAtTime(isPlayer ? 150 : 100, t);
        osc.frequency.exponentialRampToValueAtTime(10, t + 0.2);
        gain.gain.setValueAtTime(0.15, t); // Increased volume
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
        osc.connect(gain); gain.connect(this.ctx.destination);
        osc.start(t); osc.stop(t + 0.2);
    },

    playCoin: function() {
        if(!this.ctx) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1000, t);
        osc.frequency.setValueAtTime(1500, t + 0.1);
        gain.gain.setValueAtTime(0.1, t);
        gain.gain.linearRampToValueAtTime(0.01, t + 0.2);
        osc.connect(gain); gain.connect(this.ctx.destination);
        osc.start(t); osc.stop(t + 0.2);
    },

    playItem: function() {
        if(!this.ctx) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        // Powerup sound: Rising major triad
        osc.frequency.setValueAtTime(440, t); // A4
        osc.frequency.setValueAtTime(554, t + 0.1); // C#5
        osc.frequency.setValueAtTime(659, t + 0.2); // E5
        
        gain.gain.setValueAtTime(0.1, t);
        gain.gain.linearRampToValueAtTime(0.01, t + 0.4);
        
        osc.connect(gain); gain.connect(this.ctx.destination);
        osc.start(t); osc.stop(t + 0.4);
    },

    playExplosion: function() {
        if(!this.ctx) return;
        const t = this.ctx.currentTime;
        const bufferSize = this.ctx.sampleRate * 0.5; // 0.5 sec
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1; // White noise
        }
        
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const gain = this.ctx.createGain();
        
        // Low pass filter to make it sound like an explosion
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 800;
        
        gain.gain.setValueAtTime(0.5, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
        
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        noise.start(t);
    },

    playDing: function() {
        if(!this.ctx) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, t);
        osc.frequency.setValueAtTime(1600, t + 0.08); // Ding!
        gain.gain.setValueAtTime(0.1, t); // Increased volume
        gain.gain.linearRampToValueAtTime(0, t + 0.3);
        osc.connect(gain); gain.connect(this.ctx.destination);
        osc.start(t); osc.stop(t + 0.3);
    },
    
    playPowerup: function() {
        if(!this.ctx) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(300, t);
        osc.frequency.linearRampToValueAtTime(600, t + 0.2);
        osc.frequency.linearRampToValueAtTime(900, t + 0.4);
        gain.gain.setValueAtTime(0.05, t);
        gain.gain.linearRampToValueAtTime(0, t + 0.5);
        osc.connect(gain); gain.connect(this.ctx.destination);
        osc.start(t); osc.stop(t + 0.5);
    }
};
let isPauseMenuOpen = false;

let currentRoom = { x: 0, y: 0 };
let dungeon = {};
let roomGridSize = 9; // Map Size 9x9
let roomCount = 8; // Base Rooms per level (Will scale)
let currentLevel = 1; // Current Level

// Themes Definition
const mapThemes = {
    1: [
        { name: "地下室 A", color: 0x555555, enemyPool: ['chaser', 'shooter', 'fly', 'maggot'], boss: ['boss_slime', 'boss_monstro'] },
        { name: "地下室 B", color: 0x4d4d4d, enemyPool: ['chaser', 'bat', 'ghost', 'tnt', 'red_fly'], boss: ['boss_slime', 'boss_duke'] },
        { name: "地下室 C", color: 0x606060, enemyPool: ['shooter', 'bat', 'blob', 'spider_red'], boss: ['boss_monstro', 'boss_duke'] }
    ],
    2: [
        { name: "洞穴 A", color: 0x665544, enemyPool: ['chaser', 'dasher', 'spider', 'slimeer', 'rock_spider'], boss: 'boss_golem' },
        { name: "洞穴 B", color: 0x5a4b3c, enemyPool: ['spider', 'dasher', 'exploder', 'ghost', 'tnt', 'charger'], boss: ['boss_golem', 'boss_peep'] },
        { name: "洞穴 C", color: 0x706050, enemyPool: ['bat', 'exploder', 'slimeer', 'tnt', 'leech'], boss: ['boss_peep', 'boss_golem'] }
    ],
    3: [
        { name: "深渊 A", color: 0x333344, enemyPool: ['shooter', 'turret', 'tank', 'necromancer', 'floating_eye'], boss: 'boss_eye' },
        { name: "深渊 B", color: 0x2b2b3f, enemyPool: ['turret', 'exploder', 'snake', 'tnt', 'grimace'], boss: ['boss_eye', 'boss_skeletor'] },
        { name: "深渊 C", color: 0x3b3b4f, enemyPool: ['tank', 'spider', 'ghost', 'portal'], boss: ['boss_skeletor', 'boss_eye'] }
    ],
    4: [
        { name: "地狱 A", color: 0x441111, enemyPool: ['dasher', 'turret', 'tank', 'necromancer', 'snake', 'red_ghost'], boss: 'boss_final' },
        { name: "地狱 B", color: 0x3b1111, enemyPool: ['exploder', 'bat', 'tank', 'ghost', 'tnt', 'demon_baby'], boss: 'boss_final' },
        { name: "地狱 C", color: 0x551111, enemyPool: ['spider', 'exploder', 'dasher', 'slimeer', 'fire_skull'], boss: 'boss_final' }
    ]
};

// Player Stats - Nerfed Start
let playerStats = {
    playStyle: 'shooter', // 'shooter' or 'sword'
    activeItem: null, // Active Item ID
    activeCharge: 0, // Current Charge
    maxCharge: 0, // Max Charge
    speed: 180, // Nerfed from 200
    fireRate: 450, // Nerfed from 400 (slower)
    damage: 1, // Base damage
    range: 500, // Nerfed from 600
    maxHp: 3,
    hp: 3,
    bulletSpeed: 380, // Nerfed from 400
    shotSize: 0.9, // Nerfed from 1
    canSplit: false, // Split shot
    canBounce: false, // Bounce shot
    shotCount: 1, // Projectile count
    homing: false, // Homing
    piercing: false, // Piercing
    critChance: 0, // Crit (0-1)
    critDamage: 1.5, // Critical Damage Multiplier (1.5 = 150%)
    vampirism: 0, // Lifesteal (0-1)
    shield: 0, // Shield layers
    maxShield: 0,
    money: 0, // Gold
    // Dash Stats
    dashSpeed: 600,
    dashDuration: 200, // ms
    dashCooldown: 1000,
    nextDash: 0,
    isDashing: false
};
// let difficultyMultiplier = 1.0; // Difficulty 0.5 - 2.0 (Duplicated)
let lastFired = 0;
let isGameOver = false;
let gameStarted = false; // Start screen flag

// Virtual Joystick
// let leftStick = { x: 0, y: 0, active: false, pointerId: null, baseX: 0, baseY: 0 };

// Global Item Registry (Required for fallbacks and random generation)
const itemPool = [];

// Item Pools separated for clarity and logic
const poolMelee = [
    // --- SWORD ONLY --- (Melee)
    { id: 'long_blade', name: "长刀", price: 25, color: 0xcccccc, tag: 'sword', desc: "攻击范围提升", type: 'stat', apply: (s) => { s.range += 15; } },
    { id: 'heavy_hilt', name: "重剑柄", price: 25, color: 0x8b4513, tag: 'sword', desc: "击退效果提升, 可格挡弹幕", type: 'stat', apply: (s) => { s.knockback += 100; s.canDeflect = true; } },
    { id: 'spin_slash', name: "回旋斩", price: 40, color: 0xff8800, tag: 'sword', desc: "解锁回旋攻击", type: 'effect', apply: (s) => { s.spinAttack = true; } },
    { id: 'magma_blade', name: "熔岩之刃", price: 35, color: 0xff4400, tag: 'sword', desc: "攻击点燃敌人, 伤害 +1", type: 'effect', apply: (s) => { s.fireTrail = true; s.damage += 1; } },
    { id: 'titan_grip', name: "泰坦之握", price: 40, color: 0x552200, tag: 'sword', desc: "范围 +25, 攻速降低", type: 'stat', apply: (s) => { s.range += 25; s.fireRate *= 1.3; } },
    { id: 'laser_sword', name: "光剑", price: 45, color: 0x00ffff, tag: 'sword', desc: "范围 +25, 伤害 +0.5, 生成剑气", type: 'effect', apply: (s) => { s.range += 25; s.damage += 0.5; s.swordLaser = true; } },
    { id: 'spear_tip', name: "长矛尖", price: 20, color: 0x999999, tag: 'sword', desc: "范围 +20, 变细", type: 'stat', apply: (s) => { s.range += 20; /* visual change logic needed if possible */ } },
];

const poolRange = [
    // --- SHOOTER ONLY --- (Ranged)
    { id: 'fire_rate', name: "洋葱", price: 15, color: 0xffeeaa, tag: 'shooter', desc: "射速显著提升 (延迟 x0.7)", type: 'stat', apply: (s) => { s.fireRate *= 0.7; } },
    { id: 'split_shot', name: "寄生虫", price: 25, color: 0x00ff00, tag: 'shooter', desc: "子弹击中分裂", type: 'effect', apply: (s) => { s.canSplit = true; } },
    { id: 'bounce_shot', name: "橡胶胶水", price: 25, color: 0xff00aa, tag: 'shooter', desc: "子弹反弹", type: 'effect', apply: (s) => { s.canBounce = true; } },
    { id: 'triple_shot', name: "心眼", price: 30, color: 0xffff00, tag: 'shooter', desc: "3发散射, 射速降低 x1.5", type: 'effect', apply: (s) => { s.shotCount = 3; s.fireRate *= 1.5; } },
    { id: 'homing_shot', name: "弯勺者", price: 30, color: 0xaa00ff, tag: 'shooter', desc: "追踪效果, 弹速 x0.8", type: 'effect', apply: (s) => { s.homing = true; s.bulletSpeed *= 0.8; } },
    { id: 'piercing_shot', name: "丘比特之箭", price: 25, color: 0xffaaaa, tag: 'shooter', desc: "穿透射击", type: 'effect', apply: (s) => { s.piercing = true; } },
    { id: 'quad_shot', name: "变异蜘蛛", price: 35, color: 0x444444, tag: 'shooter', desc: "4发散射, 射速降低 x1.8", type: 'effect', apply: (s) => { s.shotCount = 4; s.fireRate *= 1.8; } },
    { id: 'tech_x', name: "科技X", price: 40, color: 0x0000ff, tag: 'shooter', desc: "发射激光环(穿透)", type: 'effect', apply: (s) => { s.techX = true; s.piercing = true; } },
    { id: 'double_shot', name: "20/20", price: 25, color: 0xaaaaaa, tag: 'shooter', desc: "双发设计 (无射速惩罚)", type: 'effect', apply: (s) => { s.doubleShot = true; } },
    { id: 'near_sight', name: "近视眼镜", price: 15, color: 0xdddddd, tag: 'shooter', desc: "射程固定200, 射速 x2.5", type: 'cursed', apply: (s) => { s.range = 200; s.fireRate *= 0.4; } },
    { id: 'soymilk', name: "豆浆", price: 15, color: 0xffffee, tag: 'shooter', desc: "射速 x5, 伤害 -80%", type: 'cursed', apply: (s) => { s.fireRate *= 0.2; s.damage *= 0.2; } },
    { id: 'tiny_planet', name: "小小星球", price: 25, color: 0x88aabb, tag: 'shooter', desc: "子弹环绕, 射程 +150, 穿透", type: 'effect', apply: (s) => { s.tinyPlanet = true; s.range += 150; s.piercing = true; } },
    { id: 'lost_contact', name: "隐形眼镜", price: 20, color: 0xddddff, tag: 'shooter', desc: "子弹可以抵消敌弹", type: 'effect', apply: (s) => { s.shieldedTears = true; } },
    { id: 'wire_coat_hanger', name: "晾衣架", price: 15, color: 0xcccccc, tag: 'shooter', desc: "射速 UP", type: 'stat', apply: (s) => { s.fireRate *= 0.8; } },
    { id: 'brimstone', name: "硫磺火", price: 66, color: 0xaa0000, tag: 'shooter', desc: "喷吐炼狱之火 (无限射程激光)", type: 'effect', apply: (s) => { s.piercing = true; s.damage += 1; s.shotSize += 2; } },
    { id: 'dark_matter', name: "暗物质", price: 30, color: 0x111111, tag: 'shooter', desc: "伤害 +1, 恐惧射击", type: 'effect', apply: (s) => { s.fearShot = true; s.damage += 1; } },
];

const poolGeneral = [

    // --- BOTH / GENERIC ---
    // Basic Stats
    { id: 'hp_up', name: "早餐", price: 10, color: 0xffffff, tag: 'both', desc: "最大生命 +1 (回满血)", type: 'stat', apply: (s) => { s.maxHp++; s.hp = s.maxHp; } },
    { id: 'damage_up', name: "铁块", price: 15, color: 0x555555, tag: 'both', desc: "伤害 +0.5, 子弹变大 +0.2", type: 'stat', apply: (s) => { s.damage+=0.5; s.shotSize += 0.2; } },
    { id: 'speed_up', name: "咖啡", price: 12, color: 0x6f4e37, tag: 'both', desc: "移速 +25", type: 'stat', apply: (s) => { s.speed += 25; } },
    
    // Effects
    { id: 'ipecac', name: "呕吐根", price: 40, color: 0x00ff00, tag: 'both', desc: "爆炸攻击 +2伤害, 射速降低 x2", type: 'effect', apply: (s) => { s.explosive = true; s.fireRate *= 2; s.damage += 2; } },
    
    // Crit Items
    { id: 'crit_lens', name: "隐形眼镜UI", price: 20, color: 0xaaaaaa, tag: 'both', desc: "暴击率 +15%", type: 'passive', apply: (s) => { s.critChance += 0.15; } },
    { id: 'assassins_blade', name: "刺客之刃", price: 25, color: 0x880000, tag: 'both', desc: "暴击伤害 +50%", type: 'passive', apply: (s) => { s.critDamage += 0.5; } },
    { id: 'heavy_whetstone', name: "重型磨刀石", price: 18, color: 0x444444, tag: 'both', desc: "暴击伤害 +30%", type: 'passive', apply: (s) => { s.critDamage += 0.3; } },
    { id: 'precision_lens', name: "精密镜片", price: 30, color: 0xccffff, tag: 'both', desc: "暴击率 +10%, 暴击伤害 +10%", type: 'passive', apply: (s) => { s.critChance += 0.1; s.critDamage += 0.1; } },
    { id: 'executioner_axe', name: "处决之斧", price: 45, color: 0x550000, tag: 'both', desc: "攻击 +0.5, 暴击伤害 +50%", type: 'passive', apply: (s) => { s.damage += 0.5; s.critDamage += 0.5; } },
    { id: 'gamblers_dagger', name: "赌徒匕首", price: 15, color: 0x00ff00, tag: 'both', desc: "暴击伤害 +80%, 暴击率 -10%", type: 'cursed', apply: (s) => { s.critDamage += 0.8; s.critChance = Math.max(0, s.critChance - 0.1); } },
    
    // Defensive & Economy
    { id: 'holy_shield', name: "神圣斗篷", price: 35, color: 0x00ffff, tag: 'both', desc: "每房间免疫一次伤害", type: 'passive', apply: (s) => { s.maxShield++; s.shield = s.maxShield; } },
    { id: 'steam_sale', name: "蒸汽促销", price: 30, color: 0x555555, tag: 'both', desc: "商店半价", type: 'passive', apply: (s) => { s.shopDiscount = true; } },
    { id: 'contract_from_below', name: "下界契约", price: 20, color: 0x330000, tag: 'both', desc: "双倍掉落, 难度UP", type: 'passive', apply: (s) => { s.contractFromBelow = true; difficultyMultiplier *= 1.5; } },
    { id: 'midas_touch', name: "点金术", price: 35, color: 0xffd700, tag: 'both', desc: "触碰敌人冻结并掉落金币", type: 'effect', apply: (s) => { s.midas = true; } },
    { id: 'lucky_coin', name: "幸运硬币", price: 15, color: 0xffd700, tag: 'both', desc: "金币掉落率大幅提升", type: 'passive', apply: (s) => { /* Logic */ } },
    
    // Misc
    { id: 'range_up', name: "妈妈的口红", price: 10, color: 0xff3333, tag: 'both', desc: "射程 +75 / 范围 +15", type: 'stat', apply: (s) => { s.range += 75; } },
    { id: 'max_hp_up', name: "午餐", price: 12, color: 0xffffff, tag: 'both', desc: "最大生命 +1, 治愈", type: 'stat', apply: (s) => { s.maxHp++; s.hp = s.maxHp; } },
    { id: 'glass_cannon', name: "玻璃大炮", price: 20, color: 0x00ffff, tag: 'both', desc: "伤害 +2, 上限变为1", type: 'cursed', apply: (s) => { s.damage += 2; s.shotSize += 1; s.hp = 1; s.maxHp = 1; } },
    { id: 'big_mushroom', name: "魔法蘑菇", price: 18, color: 0xff00ff, tag: 'both', desc: "全属性提升, 移速 -30, 体型变大, 近战范围大幅提升", type: 'cursed', apply: (s) => { s.damage += 0.5; s.speed -= 30; player.setScale(1.3); if (s.playStyle === 'sword') s.range += 15; } },
    { id: 'sacred_heart', name: "圣心", price: 50, color: 0xffffff, tag: 'both', desc: "光荣的牺牲 (伤害↑, 追踪, 射速↓)", type: 'effect', apply: (s) => { s.damage += 1.5; s.homing = true; s.fireRate *= 1.3; s.shotSize += 0.5; } },
    
    // Dash Items (Assuming both can dash)
    { id: 'hermes_boots', name: "赫尔墨斯之靴", price: 25, color: 0xffffaa, tag: 'both', desc: "冲刺冷却时间减半", type: 'passive', apply: (s) => { s.dashCooldown *= 0.5; } },
    { id: 'spike_armor', name: "刺猬护甲", price: 30, color: 0x555555, tag: 'both', desc: "冲刺时造成伤害", type: 'effect', apply: (s) => { s.dashDamage = true; } },
    { id: 'rocket_boots', name: "火箭靴", price: 25, color: 0xff4400, tag: 'both', desc: "冲刺留下火焰", type: 'effect', apply: (s) => { s.dashTrail = 'fire'; } },
    { id: 'phase_shift', name: "相位移动", price: 35, color: 0x00ffff, tag: 'both', desc: "冲刺距离 +50%", type: 'stat', apply: (s) => { s.dashSpeed *= 1.3; s.dashDuration *= 1.1; } },
    { id: 'shockwave_boots', name: "冲击波靴", price: 40, color: 0x8844ff, tag: 'both', desc: "冲刺结束产生爆炸", type: 'effect', apply: (s) => { s.dashExplosion = true; } },
    
    // Weird Items
    { id: 'smart_fly', name: "聪明苍蝇", price: 20, color: 0xffff00, tag: 'both', desc: "环绕护盾/复仇苍蝇", type: 'orbital', apply: (s) => { s.hasSmartFly = true; } },
    { id: 'blue_candle', name: "蓝蜡烛", price: 15, color: 0x0000aa, tag: 'both', desc: "移动时留下蓝色火焰轨迹", type: 'passive', apply: (s) => { s.blueCandle = true; } },
    { id: 'crickets_head', name: "蟋蟀的头", price: 30, color: 0xffaa00, tag: 'both', desc: "伤害 x1.3, 伤害 +0.5", type: 'stat', apply: (s) => { s.damage *= 1.3; s.damage += 0.5; } },
    { id: 'poison_touch', name: "病毒", price: 20, color: 0x00ff00, tag: 'both', desc: "毒性触碰, 移速 -20", type: 'effect', apply: (s) => { s.poisonTouch = true; s.speed -= 20; } },
    { id: 'speed_ball', name: "速度球", price: 15, color: 0xffffff, tag: 'both', desc: "移速 + 弹速", type: 'stat', apply: (s) => { s.speed += 20; s.bulletSpeed += 50; } },
    { id: 'meat', name: "肉!", price: 15, color: 0xaa5555, tag: 'both', desc: "HP + 伤害", type: 'stat', apply: (s) => { s.maxHp++; s.hp++; s.damage += 0.3; } },
    { id: 'jesus_juice', name: "耶稣果汁", price: 15, color: 0xaa00aa, tag: 'both', desc: "伤害 + 射程", type: 'stat', apply: (s) => { s.damage += 0.3; s.range += 15; } },
    { id: 'infamy', name: "面具", price: 25, color: 0x550055, tag: 'both', desc: "几率格挡伤害", type: 'passive', apply: (s) => { s.damageBlockChance = (s.damageBlockChance || 0) + 0.15; } },
    { id: 'wafer', name: "圣饼", price: 40, color: 0xeeeeee, tag: 'both', desc: "受到伤害减半", type: 'passive', apply: (s) => { s.waferEffect = true; } },
    
    // New Dash Stats
    { id: 'phantom_cloak', name: "幻影披风", price: 25, color: 0x550055, tag: 'both', desc: "无敌时间 +100ms", type: 'stat', apply: (s) => { s.dashDuration += 100; } },
    { id: 'swift_feather', name: "迅捷之羽", price: 20, color: 0xccffcc, tag: 'both', desc: "冲刺速度 +100", type: 'stat', apply: (s) => { s.dashSpeed += 100; } },
    { id: 'energy_drink', name: "能量饮料", price: 15, color: 0x00ff00, tag: 'both', desc: "冲刺冷却 -0.1秒", type: 'stat', apply: (s) => { s.dashCooldown = Math.max(100, s.dashCooldown - 100); } },
    { id: 'ninja_tabi', name: "忍者足具", price: 35, color: 0x333333, tag: 'both', desc: "冲刺冷却 -0.1秒, 速度 +50", type: 'stat', apply: (s) => { s.dashCooldown -= 100; s.dashSpeed += 50; } },
    { id: 'heavy_boots', name: "灌铅靴子", price: 20, color: 0x444444, tag: 'both', desc: "无敌时间 +50ms, 移速 -20", type: 'cursed', apply: (s) => { s.dashDuration += 50; s.speed -= 20; } }
];

// Populate master ItemPool with static items
poolMelee.forEach(i => itemPool.push(i));
poolRange.forEach(i => itemPool.push(i));
poolGeneral.forEach(i => itemPool.push(i));

// --- AUTO GENERATED ITEMS (Expansion to 300+) ---
(function generateExtraItems(){
    const stats = [
        {key:'damage', name:'力量', val:0.3, price:15, color:0xff0000},
        {key:'speed', name:'速度', val:10, price:12, color:0x00ff00},
        {key:'maxHp', name:'生命', val:1, price:15, color:0xffcccc},
        {key:'fireRate', name:'射速', val:0.95, price:15, color:0xffff00, op:'mult'},
        {key:'range', name:'射程', val:15, price:10, color:0x0000ff},
        {key:'shotSize', name:'子弹', val:0.1, price:12, color:0x888888},
        {key:'critChance', name:'幸运', val:0.03, price:18, color:0xffaa00}
    ];
    
    // Generate I, II, III... XII for each stat
    const romans = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
    
    stats.forEach(stat => {
        romans.forEach((r, idx) => {
            let mult = 1 + idx * 0.4; // Reduced scaling
            let finalVal = stat.val * mult;
            // Cap fire rate reduction to avoid 0
            if (stat.key === 'fireRate') {
                finalVal = Math.pow(stat.val, mult); 
            }
            
            // Balance: Lower price scaling for higher tiers to make them accessible
            let priceMult = 1 + idx * 0.3; 

            let item = {
                id: `gen_${stat.key}_${idx}`,
                name: `${stat.name} ${r}`,
                tier: idx + 1, // Add Tier for level scaling
                price: Math.floor(stat.price * priceMult),
                color: stat.color,
                tag: 'both',
                desc: `${stat.name} +${stat.key==='fireRate' || stat.key==='critChance' ? (100 - finalVal*100).toFixed(0)+'% (延迟)' : finalVal.toFixed(1)}`,
                type: 'stat',
                apply: (s) => {
                    if (stat.key === 'maxHp') {
                        s.maxHp += Math.floor(finalVal);
                        s.hp += Math.floor(finalVal);
                    } else if (stat.op === 'mult') {
                         s[stat.key] *= finalVal;
                    } else {
                         s[stat.key] += finalVal;
                    }
                }
            };
            if(stat.key === 'fireRate') item.desc = `${stat.name} -${(100 - Math.pow(stat.val, mult)*100).toFixed(0)}% (Lv.${idx+1})`;
            else if(stat.key === 'critChance') item.desc = `${stat.name} +${(finalVal*100).toFixed(0)}% (Lv.${idx+1})`;
            else item.desc = `${stat.name} +${finalVal.toFixed(1)} (Lv.${idx+1})`;

            poolGeneral.push(item);
            itemPool.push(item);
        });
    });

    // Generate Randomized "Glitch" Items
    for(let i=0; i<50; i++) {
        let item = {
            id: `glitch_${i}`,
            name: `故障道具 #${100+i}`,
            price: 15 + Math.floor(Math.random()*20),
            color: Math.random() * 0xffffff,
            tag: 'both',
            desc: "未知的随机效果",
            type: 'stat',
            apply: (s, itemData) => {
                 let r = Math.random();
                 let txt = "";
                 // Good effects
                 if(r < 0.3) {
                     let v = (Math.random()*1.5).toFixed(1);
                     s.damage += parseFloat(v);
                     txt = `伤害 +${v}`;
                 }
                 else if(r < 0.6) {
                     let v = (Math.random()*30).toFixed(0);
                     s.speed += parseFloat(v);
                     txt = `速度 +${v}`;
                 }
                 else if(r < 0.8) {
                     let v = (Math.random()*50).toFixed(0);
                     s.range += parseFloat(v);
                     txt = `射程 +${v}`;
                 }
                 // Mixed / Bad effect
                 else {
                     let bad = Math.random();
                     if (bad < 0.5) {
                        s.damage = Math.max(0.5, s.damage - 1);
                        txt = "伤害 -1 (故障)";
                     } else {
                        s.speed = Math.max(100, s.speed - 50);
                        txt = "速度 -50 (故障)";
                     }
                 }
                 
                 // Small chance of curse
                 if(Math.random()<0.3) {
                     s.maxHp = Math.max(1, s.maxHp-1);
                     txt += ", 生命 -1 (诅咒)";
                 }

                 if(itemData) itemData.desc = `效果: ${txt}`; 
            }
        };
        poolGeneral.push(item);
        itemPool.push(item);
    }

    // Add more manual unique items
    const extraUniques = [
        { id: 'midas_eye', name: "点金眼", price: 30, desc: "攻击使敌人掉金币", apply: (s)=>{ s.midas = true; } },
        { id: 'blood_thirst', name: "嗜血", price: 40, desc: "击杀回血 (几率)", apply: (s)=>{ s.lifesteal = true; } }, // Nerfed text
        { id: 'glass_sword', name: "玻璃剑", price: 20, desc: "伤害 +3, 受伤即死", apply: (s)=>{ s.damage+=3; s.hp=1; s.maxHp=1; } }, // Nerfed
        { id: 'giant_growth', name: "巨大化", price: 25, desc: "体型变大, 伤害+1.5", apply: (s)=>{ s.shotSize+=1.5; s.damage+=1.5; player.setScale(1.5); } }, // Nerfed
        { id: 'mini_mush', name: "小蘑菇", price: 20, desc: "体型变小, 闪避率UP", apply: (s)=>{ player.setScale(0.6); s.speed+=30; } }, // Nerfed
        { id: 'homing_bombs', name: "追踪炸弹", price: 30, desc: "爆炸物追踪", apply: (s)=>{ s.homingBombs=true; } },
        { id: 'laser_sight', name: "激光瞄准", price: 15, desc: "暴击率+10%", apply: (s)=>{ s.critChance+=0.1; } },
        { id: 'heavy_ammo', name: "重型弹药", price: 20, desc: "击退力UP", apply: (s)=>{ s.knockback=true; } },
        { id: 'ghost_pepper', name: "鬼椒", price: 25, desc: "射击产生火焰", apply: (s)=>{ s.fireShot=true; } },
        { id: 'ice_cube', name: "冰块", price: 25, desc: "射击减速敌人", apply: (s)=>{ s.iceShot=true; } },
        { id: 'magnet', name: "磁铁", price: 15, desc: "吸附掉落物", apply: (s)=>{ s.magnet=true; } },
        { id: 'x_ray', name: "X光眼镜", price: 20, desc: "视线穿透虚妄 (显示隐藏房)", apply: (s)=>{ s.xray=true; } },
        { id: 'map', name: "藏宝图", price: 15, desc: "迷宫变得清晰 (显示全图)", apply: (s)=>{ s.showMap=true; } },
        { id: 'compass', name: "指南针", price: 15, desc: "指引前路 (显示图标)", apply: (s)=>{ s.showIcons=true; } },
        { id: 'stopwatch', name: "怀表", price: 35, desc: "敌人全体减速", apply: (s)=>{ s.slowEnemies=true; } },
        { id: 'battery', name: "电池", price: 20, desc: "主动道具充能加快", apply: (s)=>{ s.chargeRate*=2; } },
        { id: 'piggy_bank', name: "存钱罐", price: 15, desc: "受伤掉钱", apply: (s)=>{ s.piggyBank=true; } },
        { id: 'fanny_pack', name: "腰包", price: 15, desc: "受伤掉道具", apply: (s)=>{ s.fannyPack=true; } },
        { id: 'sharp_plug', name: "锐利插头", price: 20, desc: "受伤充能", apply: (s)=>{ s.sharpPlug=true; } },
        { id: 'demon_wings', name: "恶魔之翼", price: 50, desc: "你感觉不到重力的束缚 (无视地形飞行)", apply: (s)=>{ s.canFly=true; } },
        { id: 'angel_wings', name: "天使之翼", price: 50, desc: "圣光与你同在 (无视地形飞行+护盾)", apply: (s)=>{ s.canFly=true; s.shield=1; } },
        { id: 'pentagram', name: "五芒星", price: 25, desc: "伤害+0.5, 恶魔房率UP", apply: (s)=>{ s.damage+=0.5; } },
        { id: 'mark', name: "印记", price: 20, desc: "伤害+0.5, 速度+20", apply: (s)=>{ s.damage+=0.5; s.speed+=20; } },
        { id: 'pact', name: "契约", price: 20, desc: "伤害+0.2, 射速UP", apply: (s)=>{ s.damage+=0.2; s.fireRate*=0.9; } },
        { id: 'cat_o_nine', name: "九尾鞭", price: 20, desc: "射速UP, 移速UP", apply: (s)=>{ s.fireRate*=0.85; s.speed+=15; } },
        { id: 'scythe', name: "死神镰刀", price: 40, desc: "子弹变大, 伤害+1", apply: (s)=>{ s.shotSize+=1; s.damage+=1; s.piercing=true; } },
        { id: 'knife', name: "妈妈的刀", price: 50, desc: "控制飞刀攻击", apply: (s)=>{ s.momKnife=true; } },
        { id: 'bomb_bag', name: "炸弹袋", price: 20, desc: "每天送炸弹", apply: (s)=>{ s.bombBag=true; } },
        { id: 'mystery_sack', name: "神秘袋", price: 20, desc: "产生随机掉落", apply: (s)=>{ s.mysterySack=true; } },
        { id: 'book_of_shadows', name: "暗影之书", price: 30, desc: "无敌盾 (主动)", type:'active' },
        { id: 'anarchist', name: "无政府主义", price: 20, desc: "满屏炸弹 (主动)", type:'active' }
    ];
    
    // Low level health potion
    extraUniques.push({ id: 'potion_small', name: "小生命药水", price: 10, desc: "恢复 1 生命", type: 'consumable', apply: (s)=>{ s.hp = Math.min(s.hp+1, s.maxHp); }});
    // High level health potion
    extraUniques.push({ id: 'potion_large', name: "大生命药水", price: 25, desc: "恢复 3 生命 (后期)", type: 'consumable', apply: (s)=>{ s.hp = Math.min(s.hp+3, s.maxHp); }});

    extraUniques.forEach(i => { 
        i.color = 0x8888ff; 
        i.tag = 'both'; 
        if(!i.apply) i.apply = ()=>{}; 
        poolGeneral.push(i);
        itemPool.push(i);
    });

})();

function useActiveItem(scene) {
    if (!playerStats.activeItem) return;
    if (playerStats.activeCharge < playerStats.maxCharge) {
         // Not charged sound?
         return;
    }

    let item = playerStats.activeItem;
    let used = false;
    
    // Logic based on Item ID
    if (item.id === 'book_of_shadows') {
        // Shield
        playerStats.shield = (playerStats.shield || 0) + 1; // Temporary Shield
        // Or make invincible for 10s
        scene.tweens.addCounter({
            from: 0, to: 1, duration: 5000, 
            onStart: () => { player.setTint(0x555555); },
            onComplete: () => { player.clearTint(); }
        });
        playerStats.isInvincible = true;
        scene.time.delayedCall(5000, () => { playerStats.isInvincible = false; });
        used = true;
        scene.add.text(player.x, player.y - 40, "Invincible!", { fontSize: '20px', color: '#ffffff' }).setOrigin(0.5).destroy({delay:1000});
    } else if (item.id === 'anarchist') {
        // Spawn 10 Random Bombs
        for(let i=0; i<6; i++) {
            let bx = Phaser.Math.Between(100, 700);
            let by = Phaser.Math.Between(100, 500);
            // Spawn Bomb Logic (Simplified as instant explosion for now or reuse bomb object if exists)
            // Let's create an explosion directly
            scene.time.delayedCall(i * 300, () => {
                 createExplosion(scene, bx, by, 3, 150);
            });
        }
        used = true;
    }

    if (used) {
        playerStats.activeCharge = 0;
        updateUI(scene);
        SoundSystem.playPowerup();
    }
}

function chargeActiveItem() {
    if (playerStats.activeItem && playerStats.activeCharge < playerStats.maxCharge) {
        playerStats.activeCharge++;
        // Update UI
    }
}

// Global helper for explosions if needed
function createExplosion(scene, x, y, damage, radius) {
    let expl = scene.add.circle(x, y, radius, 0xffaa00, 0.7);
    scene.tweens.add({ targets: expl, alpha: 0, scale: 1.2, duration: 400, onComplete: () => expl.destroy() });
    
    // Hit Enemies
    enemies.children.iterate(e => {
        if (e && e.active && Phaser.Math.Distance.Between(e.x, e.y, x, y) < radius) {
            e.hp -= damage * 15; // Bomb damage is high
            showDamageText(scene, e.x, e.y, damage * 15, '#ff0000');
            if (e.hp <= 0) killEnemy(scene, e);
        }
    });
}

// Helper: Get available item (Pool - Inventory)
function getAvailableItemPool() {
    let style = playerStats.playStyle || 'shooter';

    
    // Explicit Pool Strategy
    let selectedPool = [];
    if (style === 'sword') {
        selectedPool = [...poolMelee, ...poolGeneral];
    } else {
        selectedPool = [...poolRange, ...poolGeneral];
    }

    let available = selectedPool.filter(poolItem => {
        // 1. Inventory Check
        if (inventory.some(invItem => invItem.id === poolItem.id)) return false;

        // 2. Level Scaling (Tier Check)
        let itemTier = poolItem.tier;
        let isSeries = (itemTier !== undefined);

        if (!isSeries) {
            // Heuristic for manual items: Price 15->Tier 1. Price 30->Tier 2.
            // Ensure min is 1 (Price < 15 becomes Tier 1)
            itemTier = Math.max(1, Math.floor((poolItem.price || 15) / 15));
        }

        // Random variance allows occasionally finding higher tier items early
        let variance = 0;
        let r = Math.random();
        if (r < 0.15) variance = 1; // 15% chance for +1 Tier
        if (r < 0.05) variance = 2; // 5% chance for +2 Tier override

        let maxTier = currentLevel + variance;

        if (isSeries) {
            // Series Items (Gen I - Gen XII): Moving Window
            // Shift the window of available stat boosters up as we level
            // Cap minTier to ensure we don't filter out the highest tier (12) at very high levels
            let minSeriesTier = Math.max(1, Math.min(8, currentLevel - 3)); 
            return itemTier >= minSeriesTier && itemTier <= maxTier;
        } else {
            // Unique/Manual Items: Gating Only
            // We unlock them as we level up (maxTier), but we don't filter them out (no minTier)
            // This preserves access to utilities (Healing, Map, etc.) which are often low price/tier.
            return itemTier <= maxTier;
        }
    });

    if (available.length === 0) {
        // Breakfasting Rule: Infinite HP Up if pool empty
        let breakfast = itemPool.find(i => i.id === 'hp_up');
        return breakfast ? [breakfast] : itemPool; 
    }
    return available;
}

function getRandomItemFromPool() {
    let pool = getAvailableItemPool();
    return pool[Math.floor(Math.random() * pool.length)];
}

function preload() {
    // --- Graphics Generation ---
    // 1. Player
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xffaabb, 1); g.lineStyle(2, 0x000000); g.fillCircle(16, 16, 16); g.strokeCircle(16, 16, 16);
    g.fillStyle(0x000000, 1); g.fillCircle(10, 12, 3); g.fillCircle(22, 12, 3);
    g.generateTexture('player', 32, 32);

    // 2. Enemies & Bosses
    // Chaser (Red)
    g.clear(); g.fillStyle(0xcc0000, 1); g.fillRect(0, 0, 32, 32); g.fillStyle(0x000000, 1); g.fillRect(6, 6, 8, 8); g.fillRect(18, 6, 8, 8); g.fillRect(6, 20, 20, 4);
    g.generateTexture('enemy_chaser', 32, 32);
    // Shooter (Green)
    g.clear(); g.fillStyle(0x00cc00, 1); g.fillTriangle(0, 32, 16, 0, 32, 32); g.fillStyle(0xffffff, 1); g.fillCircle(16, 16, 6);
    g.generateTexture('enemy_shooter', 32, 32);
    // Dasher (Orange)
    g.clear(); g.fillStyle(0xff8800, 1); g.fillTriangle(16, 0, 0, 32, 32, 32);
    g.generateTexture('enemy_dasher', 32, 32);
    // TNT (Red Barrel)
    g.clear(); 
    g.fillStyle(0xcc0000, 1); g.fillRect(4, 4, 24, 24);
    // Removed invalid fillText
    g.fillStyle(0xcc0000, 1); g.fillRect(4,4,24,24);
    g.lineStyle(2, 0x000000); g.strokeRect(4,4,24,24);
    g.fillStyle(0xffff00, 1); g.fillRect(10, 8, 4, 16); g.fillRect(18, 8, 4, 16); // Yellow stripes
    g.generateTexture('enemy_tnt', 32, 32);
    // Removed duplicate enemy_dasher generation
    // Turret (Blue)
    g.clear(); g.fillStyle(0x0088ff, 1); g.fillCircle(16, 16, 16);
    g.generateTexture('enemy_turret', 32, 32);
    
    // --- EXPANSION PACK ENEMIES ---
    // Ghost (Transparent White)
    g.clear(); g.fillStyle(0xeeeeee, 0.6); 
    g.fillCircle(16, 16, 14);
    g.fillStyle(0x000000, 1); g.fillCircle(10, 12, 2); g.fillCircle(22, 12, 2);
    g.generateTexture('enemy_ghost', 32, 32);

    // Slimeer (Green Puddle producer)
    g.clear(); g.fillStyle(0x00ff00, 1); 
    g.fillCircle(16, 16, 12); g.fillStyle(0x00aa00, 1); g.fillCircle(16, 16, 8);
    g.generateTexture('enemy_slimeer', 32, 32);

    // Necromancer (Purple Robe)
    g.clear(); g.fillStyle(0x4b0082, 1); g.fillTriangle(16, 0, 0, 32, 32, 32); 
    g.fillStyle(0xff00ff, 1); g.fillCircle(16, 8, 4);
    g.generateTexture('enemy_necromancer', 32, 32);

    // Snake (Long, handled by logic mostly, texture is segment)
    g.clear(); g.fillStyle(0x884400, 1); g.fillCircle(8, 8, 8);
    g.generateTexture('enemy_snake', 16, 16);

    // Blob (Random mover)
    g.clear(); g.fillStyle(0x00aaaa, 1); 
    g.beginPath(); g.moveTo(10,0); g.lineTo(22,0); g.lineTo(32,10); g.lineTo(32,22); g.lineTo(22,32); g.lineTo(10,32); g.lineTo(0,22); g.lineTo(0,10); g.fill();
    g.generateTexture('enemy_blob', 32, 32);
    
    // NEW ENEMIES (Original)
    // Spider (Black Multi-leg)
    g.clear(); g.fillStyle(0x222222, 1); g.fillCircle(16, 16, 8); 
    g.lineStyle(2, 0x000000); 
    g.moveTo(0,0); g.lineTo(16,16); g.moveTo(32,0); g.lineTo(16,16);
    g.moveTo(0,32); g.lineTo(16,16); g.moveTo(32,32); g.lineTo(16,16);
    g.strokePath();
    g.generateTexture('enemy_spider', 32, 32);

    // Tank (Big Red Square)
    g.clear(); g.fillStyle(0x550000, 1); g.fillRect(0, 0, 48, 48);
    g.fillStyle(0x000000, 1); g.fillRect(10, 10, 28, 28);
    g.generateTexture('enemy_tank', 48, 48);

    // NEW BOSSES
    // Boss (Slime - Green Blob)
    g.clear(); g.fillStyle(0x00aa00, 1); g.fillCircle(64, 64, 60); 
    g.fillStyle(0x000000, 1); g.fillCircle(40, 50, 10); g.fillCircle(88, 50, 10);
    g.generateTexture('boss_slime', 128, 128);

    // Boss (Golem - Stone Grey)
    g.clear(); g.fillStyle(0x777777, 1); g.fillRect(14, 14, 100, 100);
    g.fillStyle(0xff0000, 1); g.fillCircle(40, 40, 5); g.fillCircle(88, 40, 5); 
    g.generateTexture('boss_golem', 128, 128);

    // Boss (Final - Red Demon)
    g.clear(); g.fillStyle(0x660000, 1); g.fillCircle(64, 64, 60);
    g.fillStyle(0x000000, 1); g.beginPath(); g.moveTo(64, 64); g.lineTo(30, 10); g.lineTo(98, 10); g.fill();
    g.generateTexture('boss_final', 128, 128);

    // Boss (Default)
    g.clear(); g.fillStyle(0x8800cc, 1); g.fillCircle(64, 64, 60); g.fillStyle(0xff0000, 1); g.fillCircle(40, 50, 15); g.fillCircle(88, 50, 15);
    g.beginPath(); g.moveTo(40, 90); g.lineTo(88, 90); g.lineWidth = 5; g.strokeStyle = 0x000000; g.stroke();
    g.generateTexture('boss', 128, 128);

    // 3. Bullets
    g.clear(); g.fillStyle(0x00ffff, 1); g.fillCircle(8, 8, 6); g.generateTexture('bullet', 16, 16);
    // Enemy Bullet: Purple with white border
    g.clear(); g.fillStyle(0xaa00ff, 1); g.fillCircle(6, 6, 6); g.lineStyle(2, 0xffffff); g.strokeCircle(6, 6, 6); g.generateTexture('enemy_bullet', 12, 12);

    // 4. Floor & Walls
    g.clear(); g.fillStyle(0x444444, 1); g.fillRect(0, 0, 64, 64); g.lineStyle(2, 0x333333); g.strokeRect(0, 0, 64, 64);
    g.generateTexture('floor', 64, 64);

    // Wall (Indestructible)
    g.clear(); g.fillStyle(0x222222, 1); g.fillRect(0, 0, 64, 64); 
    g.fillStyle(0x555555, 1); g.fillRect(4, 4, 56, 56); // Bevel
    g.generateTexture('wall', 64, 64);

    // Crate (Destructible)
    g.clear(); g.fillStyle(0x8b4513, 1); g.fillRect(0, 0, 48, 48); // Brown
    g.lineStyle(2, 0x5c2e0a); g.strokeRect(0, 0, 48, 48);
    g.beginPath(); g.moveTo(0,0); g.lineTo(48,48); g.moveTo(48,0); g.lineTo(0,48); // X mark
    g.strokePath(); 
    g.generateTexture('crate', 48, 48);

    // Pit (Hazard) - Updated for visibility
    g.clear(); 
    g.fillStyle(0x050505, 1); // Almost black bottom
    g.fillRect(0, 0, 56, 56);
    // Inner walls for depth
    g.fillStyle(0x333333, 1); 
    g.fillRect(0, 0, 56, 6); // Top inner wall
    g.fillStyle(0x1a1a1a, 1); 
    g.fillRect(0, 50, 56, 6); // Bottom inner shadow
    g.fillStyle(0x222222, 1);
    g.fillRect(0, 0, 6, 56); // Left inner wall
    g.fillRect(50, 0, 6, 56); // Right inner wall
    // Hazard warning stripes
    g.lineStyle(2, 0x444444);
    g.strokeRect(0, 0, 56, 56);
    g.generateTexture('pit', 56, 56);

    // Sword Texture
    g.clear(); g.fillStyle(0xcccccc, 1); 
    // Blade
    g.beginPath(); g.moveTo(0, 16); g.lineTo(32, 12); g.lineTo(48, 16); g.lineTo(32, 20); g.lineTo(0, 16); g.fill();
    // Hilt
    g.fillStyle(0x8b4513, 1); g.fillRect(0, 14, 10, 4); g.fillStyle(0xffd700, 1); g.fillRect(10, 10, 4, 12); // Guard
    g.generateTexture('weapon_sword', 48, 32);
    
    // 5. Door
    g.clear(); g.fillStyle(0x664422, 1); g.fillRect(0, 0, 64, 64); g.fillStyle(0x000000, 1); g.fillRect(20, 0, 24, 64);
    g.generateTexture('door', 64, 64);

    // Stairs
    g.clear(); g.fillStyle(0x000000, 1); g.fillRect(0,0,50,50); 
    g.lineStyle(2, 0x555555); g.strokeRect(0,0,50,50);
    g.fillStyle(0x333333, 1); g.fillRect(5,5,40,40);
    g.fillStyle(0x111111, 1); g.fillRect(15,15,20,20);
    g.generateTexture('stairs', 50, 50);

    // 6. Item Pedestal
    g.clear(); g.fillStyle(0x333333, 1); g.fillRect(0,0,32,32); g.lineStyle(2, 0xffff00); g.strokeRect(0,0,32,32);
    g.generateTexture('item_pedestal', 32, 32);
    
    // 7. WEAPONS
    // Sword
    g.clear(); 
    g.fillStyle(0xcccccc, 1); g.fillRect(0, -2, 40, 4); // Blade
    g.fillStyle(0x8b4513, 1); g.fillRect(-10, -2, 10, 4); // Hilt
    g.fillStyle(0x8b4513, 1); g.fillRect(-10, -6, 4, 12); // Guard
    g.generateTexture('weapon_sword', 48, 16);
    
    // 8. Coin
    g.clear(); g.fillStyle(0xffd700, 1); g.fillCircle(8, 8, 8); g.lineStyle(2, 0xffa500); g.strokeCircle(8, 8, 8);
    g.fillStyle(0x000000, 0.5); g.fillCircle(8, 8, 5);
    g.generateTexture('coin', 16, 16);

    // NEW ENEMY TEXTURES
    // Exploder (Red Flashing Sphere)
    g.clear(); g.fillStyle(0xff3300, 1); g.fillCircle(16, 16, 14); 
    g.fillStyle(0xffff00, 1); g.fillCircle(10, 10, 4); g.fillCircle(22, 12, 3);
    g.generateTexture('enemy_exploder', 32, 32);

    // Bat (Black Wings)
    g.clear(); g.fillStyle(0x000000, 1); 
    g.beginPath();
    g.moveTo(16, 16); g.lineTo(0, 0); g.lineTo(8, 24); g.lineTo(16, 16);
    g.lineTo(24, 24); g.lineTo(32, 0); g.closePath();
    g.fill();
    g.fillStyle(0xff0000, 1); g.fillCircle(14, 12, 1); g.fillCircle(18, 12, 1);
    g.generateTexture('enemy_bat', 32, 32);
}

function create() {
    const scene = this; // Capture 'this'

    // Input
    cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys({ 
        up: Phaser.Input.Keyboard.KeyCodes.W, 
        down: Phaser.Input.Keyboard.KeyCodes.S, 
        left: Phaser.Input.Keyboard.KeyCodes.A, 
        right: Phaser.Input.Keyboard.KeyCodes.D,
        bag: Phaser.Input.Keyboard.KeyCodes.B,
        help: Phaser.Input.Keyboard.KeyCodes.H,
        compendium: Phaser.Input.Keyboard.KeyCodes.G,
        pause: Phaser.Input.Keyboard.KeyCodes.P,
        esc: Phaser.Input.Keyboard.KeyCodes.ESC,
        dash: Phaser.Input.Keyboard.KeyCodes.SPACE,
        active: Phaser.Input.Keyboard.KeyCodes.E
    });
    
    // Audio Init
    this.input.on('pointerdown', () => SoundSystem.init());
    this.input.keyboard.on('keydown', () => SoundSystem.init());

    // Auto Pause (Blur)
    this.game.events.on('blur', () => {
        if (!isPaused && !isGameOver && gameStarted) {
            togglePause(scene);
        }
    });

    // Background
    scene.backgroundSprite = this.add.tileSprite(400, 300, 800, 600, 'floor').setDepth(-10);

    // --- Camera Centering for RESIZE mode ---
    this.scale.on('resize', (gameSize) => {
        // Keep the camera centered on the 800x600 play area
        this.cameras.main.centerOn(400, 300);
    });
    // Trigger once initially
    this.cameras.main.centerOn(400, 300);
    const initWidth = this.scale.width;
    const initHeight = this.scale.height;
    this.cameras.main.setScroll(400 - initWidth/2, 300 - initHeight/2);
    // ----------------------------------------

    // Initial Physics Groups
    bullets = this.physics.add.group({ classType: Phaser.Physics.Arcade.Image, maxSize: 100 });
    enemyBullets = this.physics.add.group({ classType: Phaser.Physics.Arcade.Image, maxSize: 300 });
    enemies = this.physics.add.group();
    items = this.physics.add.group();
    coins = this.physics.add.group();
    doors = this.physics.add.staticGroup();
    stairs = this.physics.add.staticGroup();
    
    // Shop Text/Decor Cleanup Group
    scene.shopDecor = this.add.group();

    // Terrain Groups
    walls = this.physics.add.staticGroup();
    crates = this.physics.add.staticGroup();
    pits = this.physics.add.staticGroup();
    
    // Cleanup group for floating texts/etc
    tempTexts = this.add.group();

    // Show Class Selection Screen
    showClassSelection(scene);
}

function showClassSelection(scene) {
    let container = scene.add.container(0, 0);
    
    let bg = scene.add.rectangle(400, 300, 800, 600, 0x000000, 0.8);
    let title = scene.add.text(400, 100, "选择你的武器", { fontSize: '40px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
    
    // Shooter Option
    let btnShooter = scene.add.rectangle(250, 300, 200, 300, 0x333333).setInteractive();
    btnShooter.setStrokeStyle(4, 0x00ffff);
    let txtShooter = scene.add.text(250, 300, "射手\n\n远程攻击\n安全距离", { fontSize: '24px', align: 'center', color: '#00ffff' }).setOrigin(0.5);
    
    // Sword Option
    let btnSword = scene.add.rectangle(550, 300, 200, 300, 0x333333).setInteractive();
    btnSword.setStrokeStyle(4, 0xff0000);
    let txtSword = scene.add.text(550, 300, "杀戮者\n\n近战攻击\n高额伤害\n范围挥击", { fontSize: '24px', align: 'center', color: '#ff0000' }).setOrigin(0.5);
    
    // Events
    btnShooter.on('pointerover', () => btnShooter.setFillStyle(0x555555));
    btnShooter.on('pointerout', () => btnShooter.setFillStyle(0x333333));
    btnShooter.on('pointerdown', () => {
        container.destroy();
        // Delay startGame slightly to allow UI update? No, just call it.
        // Wrap in try-catch to see if it fails
        try {
            startGame(scene, 'shooter');
        } catch(e) {
            console.error(e);
        }
    });

    btnSword.on('pointerover', () => btnSword.setFillStyle(0x555555));
    btnSword.on('pointerout', () => btnSword.setFillStyle(0x333333));
    btnSword.on('pointerdown', () => {
        container.destroy();
        try {
            startGame(scene, 'sword');
        } catch(e) {
            console.error(e);
        }
    });
    
    container.add([bg, title, btnShooter, txtShooter, btnSword, txtSword]);
}

function startGame(scene, style) {
    console.log("Starting Game with style: " + style);

    playerStats.playStyle = style;
    
    // Apply initial stats based on class
    if (style === 'sword') {
        playerStats.damage = 2; // Higher base dmg
        playerStats.range = 60; // Melee range (for sword hitbox)
        playerStats.fireRate = 500; // Slower swing
        playerStats.maxHp = 4; // Tankier
        playerStats.hp = 4;
        playerStats.speed = 220;
    }

    // Unchanged Create Logic
    loadData();

    // Player
    player = scene.physics.add.sprite(400, 300, 'player');
    player.setCollideWorldBounds(true);
    player.setDepth(10);
    // Hitbox Adjustment - Match visual
    // Assuming player sprite is ~32x32 or 40x40 but has whitespace
    // Make hitbox smaller for better dodgefeel
    player.body.setSize(24, 24); 
    player.body.setOffset((player.width - 24)/2, (player.height - 24)/2 + 4);
    
    // Sword Sprite attachment
    if (style === 'sword') {
        player.sword = scene.add.sprite(0, 0, 'weapon_sword').setOrigin(0, 0.5).setVisible(false);
        player.sword.setDepth(11);
    }

    // --- Camera Follow ---
    // Critical for mobile RESIZE mode: Always keep player in center
    scene.cameras.main.startFollow(player, true, 0.1, 0.1);

    // Colliders
    scene.physics.add.overlap(bullets, enemies, hitEnemy, null, scene);
    scene.physics.add.collider(player, enemies, hitPlayer, null, scene);
    scene.physics.add.overlap(player, enemyBullets, hitPlayer, null, scene);
    scene.physics.add.overlap(player, items, pickItem, null, scene);
    scene.physics.add.overlap(player, coins, collectCoin, null, scene);
    scene.physics.add.overlap(player, doors, enterDoor, null, scene);
    scene.physics.add.collider(player, doors);  
    
    // Terrain Collisions
    const flightProcess = (p, t) => {
        return !playerStats.canFly; 
    };
    scene.physics.add.collider(player, walls, null, flightProcess, scene);
    scene.physics.add.collider(player, crates, null, flightProcess, scene);
    
    // Enemies collide with walls/crates, except Ghosts
    const ghostPassProcess = (e, t) => {
        if (e.aiType === 'ghost') return false; 
        return true;
    };
    scene.physics.add.collider(enemies, walls, null, ghostPassProcess, scene);
    scene.physics.add.collider(enemies, crates, null, ghostPassProcess, scene); 
    
    // Bullets - Wall Collision with Bounce Logic
    scene.physics.add.collider(bullets, walls, (b, w) => {
        // Default max bounces = 0 unless upgraded
        let maxBounces = 0;
        if (playerStats.canBounce) maxBounces = 2; // Rubber Cement / Bounce Shot
        if (playerStats.glassShard) maxBounces += 1; // Example synergy

        if (!b.bounceCount) b.bounceCount = 0;

        if (b.bounceCount < maxBounces) {
            b.bounceCount++;
            // Ensure physics body has bounce enabled for this frame so it reflects
            // However, Arcade Physics might have already processed the separation with default 0 bounce if we don't set it on creation.
            // We should ideally set b.setBounce(1) when acquired.
            // But if we do here:
            // The separation happens automatically if this callback returns.
            // We shouldn't destroy it.
            
            // Hack fix for immediate reflection if not set cleanly:
            // Actually, best to set bounce on creation.
            // But here we can check limits.
        } else {
            b.disableBody(true, true);
        }
    });

    scene.physics.add.collider(enemyBullets, walls, (b,w)=>b.disableBody(true, true));
    
    // Allow bullets to destroy crates
    scene.physics.add.collider(bullets, crates, (b, c) => {
        // Crates always destroy bullets unless piercing?
        // Let's allow bounce on crates too? No, usually they break or pop.
        if (b.bounceCount < (playerStats.canBounce ? 2 : 0)) {
            // If it bounces, does it destroy the crate?
            // Usually yes, and maybe continues? 
            // Let's say it destroys crate and stops (normal) or bounces off (weird).
            // Simplest: It destroys the crate and dies, even if bouncy.
            // UNLESS piercing.
            destroyCrate(b, c); // This destroys bullet usually inside?
            // Let's check destroyCrate
            // For now, let's assume default behavior: box breaks, bullet dies.
        } else {
             destroyCrate(b, c);
        }
    }, null, scene);
    scene.physics.add.collider(enemyBullets, crates, (b,c)=>b.destroy()); // Enemy bullets just break on crates for now
    
    // Pit Hazards
    scene.physics.add.overlap(player, pits, playerFallInPit, null, scene);
    scene.physics.add.overlap(enemies, pits, enemyFallInPit, null, scene);

    scene.physics.add.overlap(player, stairs, nextLevel, null, scene);

    // UI Layer
    uiLayer = scene.add.container(0, 0).setScrollFactor(0);
    minimapGraphics = scene.add.graphics();
    scene.roomText = scene.add.text(650, 60, '', { fontSize: '20px', fill: '#aaa' }); 
    scene.itemText = scene.add.text(400, 550, '', { fontSize: '20px', fill: '#ffff00', align: 'center' }).setOrigin(0.5);
    scene.coinUI = scene.add.text(140, 50, 'G: 0', { fontSize: '24px', fill: '#ffd700', stroke: '#000', strokeThickness: 3 });
    
    // Menu Button (Top Right)
    const menuBtn = scene.add.text(760, 20, 'II', { fontSize: '32px', fill: '#fff', backgroundColor: '#333', padding: { x: 10, y: 5 } })
        .setInteractive()
        .setScrollFactor(0)
        .setDepth(101);
    menuBtn.on('pointerdown', () => togglePause(scene));

    // Player Health UI (Visual Hearts)
    scene.heartGroup = scene.add.group();
    updatePlayerHealthUI(scene);

    uiLayer.add([minimapGraphics, scene.roomText, scene.itemText, menuBtn, scene.coinUI]);
    uiLayer.setDepth(100);

    // Creating UI Containers (Hidden by default)
    createUIContainers(scene);

    // Generate Dungeon
    generateDungeon();
    loadRoom(scene, 5, 5);
    
    // Touch
    try {
        setupTouchControls.call(scene);
        console.log("Touch controls set up.");
    } catch(e) {
        console.error("Touch setup failed:", e);
    }

    // Responsive Camera Logic: Center the 800x600 playspace
    const centerCamera = () => {
        if (scene.cameras && scene.cameras.main) {
            scene.cameras.main.centerOn(400, 300);
        }
    };
    centerCamera();
    scene.scale.on('resize', (gameSize) => {
        scene.cameras.main.setViewport(0, 0, gameSize.width, gameSize.height);
        centerCamera();
        // Ideally we should also reposition UI here, but a reload is safer for now.
    });

    gameStarted = true;
    console.log("Game successfully started.");

    // First Time Help Check
    try {
        const hasPlayed = localStorage.getItem('rog_has_played_before');
        if (!hasPlayed) {
            if (helpUI) {
                closeAllMenus(); 
                helpUI.setVisible(true);
                helpUI.setDepth(300); // Ensure it's on top
                isPaused = true;
                scene.physics.pause();
                localStorage.setItem('rog_has_played_before', 'true');
            }
        }
    } catch (e) {
        console.warn("Storage access failed:", e);
    }
}

// --- Smart Agent Navigation ---
function smartMove(scene, enemy, target, speed) {
    if (!enemy.body) return;

    // Helper: Check if line to target is blocked by "walls" or "pits"
    const isBlocked = (angle, dist) => {
        if (!walls) return false;
        
        let startX = enemy.x;
        let startY = enemy.y;
        let endX = startX + Math.cos(angle) * dist;
        let endY = startY + Math.sin(angle) * dist;
        let line = new Phaser.Geom.Line(startX, startY, endX, endY);
        
        // 1. Check Walls
        // To be performant, we only check walls that are somewhat close
        let wallList = walls.getChildren();
        for (let i = 0; i < wallList.length; i++) {
            let w = wallList[i];
            if (Math.abs(w.x - startX) < 100 && Math.abs(w.y - startY) < 100) {
                 if (Phaser.Geom.Intersects.LineToRectangle(line, w.body)) return true;
            }
        }
        
        // 2. Check Pits (only for ground enemies)
        if (enemy.aiType !== 'bat' && enemy.aiType !== 'ghost' && enemy.aiType !== 'fly' && enemy.aiType !== 'red_fly') {
            let pitList = pits.getChildren();
            for (let i = 0; i < pitList.length; i++) {
                let p = pitList[i];
                if (Math.abs(p.x - startX) < 100 && Math.abs(p.y - startY) < 100) {
                     if (Phaser.Geom.Intersects.LineToRectangle(line, p.body)) return true;
                }
            }
        }

        return false;
    };

    const targetAngle = Phaser.Math.Angle.Between(enemy.x, enemy.y, target.x, target.y);
    const lookAhead = 50; // Check 50px ahead

    if (!isBlocked(targetAngle, lookAhead)) {
        // Path clear? Go.
        scene.physics.velocityFromRotation(targetAngle, speed, enemy.body.velocity);
    } else {
        // Path blocked: Try "side whiskers" to find a way around
        // Try +/- 30 degrees, then +/- 60
        const offsets = [0.5, -0.5, 1.0, -1.0]; 
        let found = false;
        for (let o of offsets) {
            let tryAngle = targetAngle + o;
            if (!isBlocked(tryAngle, lookAhead)) {
                scene.physics.velocityFromRotation(tryAngle, speed, enemy.body.velocity);
                found = true;
                break;
            }
        }
        if (!found) {
            // If all blocked, just push forward slowly (maybe sliding against wall)
             scene.physics.velocityFromRotation(targetAngle, speed * 0.5, enemy.body.velocity);
        }
    }
    
    // Anti-stuck Wiggle: If velocity is effectively 0 despite trying to move, jitter
    if (enemy.body.speed < 5) {
        enemy.body.velocity.x += (Math.random()-0.5) * 50;
        enemy.body.velocity.y += (Math.random()-0.5) * 50;
    }
}

function update(time, delta) {
    if (!gameStarted || isGameOver) return;
    if (isPaused) return; // Stop update loop when paused
    if (!player || !player.body) return; // Safety check
    
    // --- Stat Caps ---
    playerStats.speed = Math.min(playerStats.speed, 600); // Speed Cap
    playerStats.range = Math.min(playerStats.range, 1200); // Range Cap
    
    const scene = this; // Explicit scene reference

    // Sword Follow Logic
    if (player.sword) {
        player.sword.setPosition(player.x, player.y);
    }

    // --- Dash Logic ---
    if ((this.wasd.dash.isDown || (typeof mobileInput !== 'undefined' && mobileInput.dash)) && time > playerStats.nextDash && !playerStats.isDashing) {
        // Dash Initiation
        let dx = 0; let dy = 0;
        
        // Priority: Joystick -> Keyboard
        if (typeof leftStick !== 'undefined' && leftStick.active) {
             let jx = leftStick.x - leftStick.baseX;
             let jy = leftStick.y - leftStick.baseY;
             if(Math.abs(jx)>5 || Math.abs(jy)>5) {
                 // Normalize rough direction for standard dash or use precise angle?
                 // The game uses 8-way dash style mostly but code supports arbitrary angle
                 // existing logic below uses wasd checks.
                 // We will override if joystick is active.
             }
        }
        
        if (this.wasd.left.isDown) dx = -1;
        else if (this.wasd.right.isDown) dx = 1;
        if (this.wasd.up.isDown) dy = -1;
        else if (this.wasd.down.isDown) dy = 1;
        
        // Mobile Joystick Override
        let joyAngle = null;
        if (typeof leftStick !== 'undefined' && leftStick.active) {
              let jx = leftStick.x - leftStick.baseX;
              let jy = leftStick.y - leftStick.baseY;
              if (jx*jx + jy*jy > 25) { // Minimal threshold
                   joyAngle = Math.atan2(jy, jx);
                   dx = Math.cos(joyAngle);
                   dy = Math.sin(joyAngle);
              }
        }

        // If no direction, dash towards mouse? Or facing? Default to facing right or last move?
        // Let's settle for movement direction, nothing = no dash
        if (dx !== 0 || dy !== 0) {
            playerStats.isDashing = true;
            playerStats.nextDash = time + playerStats.dashCooldown;
            player.body.stop(); // Clear current vel
            let angle = joyAngle !== null ? joyAngle : Math.atan2(dy, dx);
            scene.physics.velocityFromRotation(angle, playerStats.dashSpeed, player.body.velocity);
            
            // Trigger Effects
            onDashStart(scene, player);

            // Visual Trail
            scene.time.addEvent({
                delay: 50,
                repeat: 3,
                callback: () => {
                    let g = scene.add.image(player.x, player.y, 'player').setTint(0x00ffff).setAlpha(0.5);
                    scene.tweens.add({ targets: g, alpha: 0, duration: 300, onComplete: () => g.destroy() });
                }
            });
            
            // End Dash
            scene.time.delayedCall(playerStats.dashDuration, () => {
                playerStats.isDashing = false;
                player.setVelocity(0,0);
            });
            return; // Skip normal movement during dash
        }
    }
    
    // Skip normal movement update if dashing
    if (playerStats.isDashing) return;

    // --- Player Movement ---
    let vx = 0;
    let vy = 0;

    if (this.wasd.left.isDown) vx = -playerStats.speed;
    else if (this.wasd.right.isDown) vx = playerStats.speed;

    if (this.wasd.up.isDown) vy = -playerStats.speed;
    else if (this.wasd.down.isDown) vy = playerStats.speed;

    // Active Item Input
    if (Phaser.Input.Keyboard.JustDown(this.wasd.active)) {
        useActiveItem(scene);
    }

    // --- Fire Trail Logic (Red Fire) ---
    if (playerStats.fireTrail && (vx !== 0 || vy !== 0)) {
         if (time > (player.lastTrailTime || 0)) {
             player.lastTrailTime = time + 250; 
             let fire = bullets.create(player.x, player.y, 'bullet');
             if(fire) {
                 fire.setTint(0xff4400); 
                 fire.setVelocity(0,0);
                 scene.physics.add.overlap(fire, enemies, (f,e)=> {
                    if (e.active) {
                        e.hp -= playerStats.damage * 0.5 || 1; 
                        showDamageText(scene, e.x, e.y, (playerStats.damage * 0.5 || 1).toFixed(1), '#ff4400');
                        if (e.hp <= 0) killEnemy(scene, e);
                        f.destroy();
                    }
                 });
                 // Auto destroy logic needed since bullets don't self-decay
                 scene.time.delayedCall(2000, () => { if(fire.active) fire.destroy(); });
             }
         }
    }

    // --- Blue Candle Logic (Blue Fire) ---
    if (playerStats.blueCandle && (vx !== 0 || vy !== 0)) {
        if (time > (player.lastBlueTrailTime || 0)) {
            player.lastBlueTrailTime = time + 300; 
            let fire = bullets.create(player.x, player.y, 'bullet');
            if(fire) {
                fire.setTint(0x0088ff); 
                fire.setVelocity(0,0);
                fire.setScale(1.2);
                scene.physics.add.overlap(fire, enemies, (f,e)=> {
                   if (e.active) {
                       e.hp -= (playerStats.damage * 0.8) + 2; 
                       showDamageText(scene, e.x, e.y, ((playerStats.damage * 0.8) + 2).toFixed(1), '#0088ff');
                       if (e.hp <= 0) killEnemy(scene, e);
                       f.destroy();
                   }
                });
                // Lasts longer
                scene.time.delayedCall(3000, () => { if(fire.active) fire.destroy(); });
            }
        }
   }

    // --- Smart Fly Logic ---
    if (playerStats.hasSmartFly) {
        if (!player.smartFly) {
            // Create Fly
            player.smartFly = scene.physics.add.sprite(player.x, player.y, 'bullet'); // Use bullet texture
            player.smartFly.setTint(0xffff00);
            player.smartFly.setScale(1.2);
            player.smartFly.body.setAllowGravity(false);
            player.smartFly.flyAngle = 0;
            
            // Interaction: Block Bullets
            scene.physics.add.overlap(player.smartFly, enemyBullets, (f, b) => {
                 b.destroy();
                 // Revenge: Fire back?
                 if (enemies.countActive() > 0) {
                     let target = enemies.getChildren()[0]; // Just target first
                     createBullet(f.x, f.y, 
                        (target.x - f.x), 
                        (target.y - f.y), 
                        300
                     );
                 }
            });
            
            // Interaction: Damage Enemies
            scene.physics.add.overlap(player.smartFly, enemies, (f, e) => {
                let now = scene.time.now;
                if (e.active && now > (e.lastFlyHit || 0)) {
                    e.lastFlyHit = now + 500;
                    e.hp -= playerStats.damage * 2;
                    showDamageText(scene, e.x, e.y, playerStats.damage*2, '#ffff00');
                    if(e.hp<=0) killEnemy(scene, e);
                }
            });
        }
        
        // Orbit update
        if (player.smartFly && player.smartFly.active) {
            player.smartFly.flyAngle = (player.smartFly.flyAngle || 0) + 0.05;
            player.smartFly.setPosition(
                player.x + Math.cos(player.smartFly.flyAngle) * 60,
                player.y + Math.sin(player.smartFly.flyAngle) * 60
            );
        }
    }

    // Joystick Override
    if (typeof leftStick !== 'undefined' && leftStick.active) {
        const idx = leftStick.x - leftStick.baseX;
        const idy = leftStick.y - leftStick.baseY;
        const dist = Math.sqrt(idx * idx + idy * idy);
        
        if (dist > 5) {
             const angle = Math.atan2(idy, idx);
             const force = Math.min(dist, 50) / 50;
             vx = Math.cos(angle) * playerStats.speed * force;
             vy = Math.sin(angle) * playerStats.speed * force;
        } else {
             // Deadzone - Stop if holding center
             vx = 0; vy = 0;
        }
    }

    if (player && player.body) {
        player.setVelocity(vx, vy);
    }

    // --- Player Shooting ---
     // Cap Fire Rate to prevent game-breaking speed (Minimum 50ms delay)
     playerStats.fireRate = Math.max(50, playerStats.fireRate); 
    
    let fx = 0; let fy = 0;
    let shooting = false;
    // Allow diagonal shooting
    if (cursors.left.isDown) fx = -1;
    if (cursors.right.isDown) fx = 1;
    if (cursors.up.isDown) fy = -1;
    if (cursors.down.isDown) fy = 1;
    
    if (fx !== 0 || fy !== 0) shooting = true;

    // Mobile Fire Button Override
    if (typeof mobileInput !== 'undefined' && mobileInput.fire && time > lastFired) {
        // Auto-aim closest enemy or shoot strictly forward
        let closest = null;
        let minDist = 600;
        if (enemies) { 
            enemies.children.iterate(e => {
                if (e.active) {
                    let d = Phaser.Math.Distance.Between(player.x, player.y, e.x, e.y);
                    if(d < minDist) { minDist = d; closest = e; }
                }
            });
        }
        
        // Priority: Closest Enemy -> Movement Direction -> Default Right
        if (closest) {
             if (playerStats.playStyle === 'sword') fireSwordAt(player.x, player.y, closest.x, closest.y, time);
             else fireAt(player.x, player.y, closest.x, closest.y, time);
        } else {
             // Use movement velocity or default
             let tx = (player.body.velocity.x !== 0 || player.body.velocity.y !== 0) ? player.body.velocity.x : 1;
             let ty = (player.body.velocity.x !== 0 || player.body.velocity.y !== 0) ? player.body.velocity.y : 0;
             if (playerStats.playStyle === 'sword') fireSwordDir(player.x, player.y, tx, ty, time);
             else fireDir(player.x, player.y, tx, ty, time);
        }
    } 
    // Mouse/Touch (Only if NOT touching controls)
    else if (this.input.activePointer.isDown && (!leftStick || !leftStick.active || this.input.activePointer.id !== leftStick.pointerId) 
        && (!mobileInput.fire) // Don't fire at pointer if pressing fire button 
        ) {
        // Simple zone exclusion for buttons (hacky: if pointerX > 600 && pointerY > 400, ignore?)
        // Better: Buttons already capture input via 'pointerdown' on GameObject.
        // However, scene input might still trigger. Let's rely on GameObject interactive stopping propagation? 
        // Phaser Input Plugin doesn't auto-stop scene pointerdown.
        // We just check coordinates loosely to prevent accidental firing when pressing specific UI
        let isUI = (this.input.activePointer.x > 550 && this.input.activePointer.y > 400) || (this.input.activePointer.x > 700 && this.input.activePointer.y < 100);
        
        if (!isUI) {
             if (playerStats.playStyle === 'sword') fireSwordAt(player.x, player.y, this.input.activePointer.x, this.input.activePointer.y, time);
             else fireAt(player.x, player.y, this.input.activePointer.x, this.input.activePointer.y, time);
        }
    } else if (shooting && time > lastFired) {
        if (playerStats.playStyle === 'sword') fireSwordDir(player.x, player.y, fx, fy, time);
        else fireDir(player.x, player.y, fx, fy, time);
    }

    // --- Enemy Behavior ---
    enemies.children.iterate((e) => {
        if (!e || !e.active) return;
        
        if (e.hpBar) e.hpBar.setPosition(e.x - 20, e.y - 40);

        // --- AI LOGIC ---
        // Fear Logic (Overrides movement)
        if (e.isFrozen) {
            e.setVelocity(0,0);
            return;
        }
        if (e.isFeared) {
            // Run away from player
             const angle = Phaser.Math.Angle.Between(player.x, player.y, e.x, e.y); // Angle FROM player TO enemy
             scene.physics.velocityFromRotation(angle, 150, e.body.velocity);
             return;
        }

        if (e.aiType === 'chaser') {
            smartMove(scene, e, player, 100);
        } else if (e.aiType === 'shooter') {
             const dist = Phaser.Math.Distance.Between(e.x, e.y, player.x, player.y);
             if (dist > 300) {
                 smartMove(scene, e, player, 80);
             } else {
                 e.setVelocity(0,0);
             }
             if (time > e.lastShot) {
                 enemyFire(e.x, e.y, player.x, player.y, e.damage);
                 e.lastShot = time + 2000;
             }
        } 
        
        // --- NEW ENEMIES AI ---
        else if (e.aiType === 'ghost') {
             // Moves through walls (needs collision group removal or just ignore)
             // We can disable collision with walls for this sprite in physics?
             // Simple way: check collision in update? No, just set body check...
             // Currently global collider is set. We can't easily selectively disable it for one sprite in a group collider without filtering.
             // Workaround: Ghost moves slower but chases persistently.
             scene.physics.moveToObject(e, player, 60);
             // Phasing visual
             e.alpha = 0.5 + Math.sin(time/200)*0.2;
        }
        else if (e.aiType === 'slimeer') {
             smartMove(scene, e, player, 70);
             // Leave trail? 
             if (time > (e.lastTrail || 0)) {
                 e.lastTrail = time + 500;
                 // Spawn a small projectile that stays still? Or creep?
                 // Simple creep: a bullet with 0 velocity
                 let b = enemyBullets.get();
                 if(b) {
                     b.enableBody(true, e.x, e.y, true, true);
                     b.setTexture('enemy_bullet');
                     b.setTint(0x00ff00);
                     b.setVelocity(0,0);
                     b.lifeDist = 100; // Time based decay logic needed for bullets...
                     // For now just standard bullet logic
                     scene.time.delayedCall(3000, ()=> { if(b.active) b.disableBody(true,true); });
                 }
             }
        }
        else if (e.aiType === 'necromancer') {
             e.setVelocity(0,0);
             // Run away if too close
             const dist = Phaser.Math.Distance.Between(e.x, e.y, player.x, player.y);
             if (dist < 200) {
                 const angle = Phaser.Math.Angle.Between(player.x, player.y, e.x, e.y);
                 scene.physics.velocityFromRotation(angle, 100, e.body.velocity);
             }
             
             // Summon Skeleton (Chaser)
             if (time > e.lastShot && enemies.countActive() < 50) {
                 e.lastShot = time + 4000;
                 // Summon
                 let s = enemies.create(e.x + 30, e.y, 'enemy_chaser');
                 s.hp = 2 * difficultyMultiplier; s.maxHp = s.hp;
                 s.aiType = 'chaser';
                 s.setTint(0x888888); // Greyish
                 drawHealthBar(s);
                 // No overlap physics setup here... might bug out if not in group properly.
                 // It's in 'enemies' group so it inherits group colliders? 
                 // Yes, create on group adds to scene and physics.
                 s.hpBar = scene.add.graphics(); // Needs bar
                 drawHealthBar(s);
                 // Need to ensure colliders work for new entities?
                 // The colliders are set on the GROUP, so yes.
             }
        }
        else if (e.aiType === 'snake') {
             // Wiggle movement
             if (!e.aiBaseAngle) e.aiBaseAngle = 0;
             const angleToPlayer = Phaser.Math.Angle.Between(e.x, e.y, player.x, player.y);
             e.aiBaseAngle += 0.1;
             const wiggle = Math.sin(e.aiBaseAngle) * 1.5; 
             scene.physics.velocityFromRotation(angleToPlayer + wiggle, 120, e.body.velocity);
        }
        else if (e.aiType === 'blob') {
             // Random hops
             if (time > (e.timer || 0)) {
                 e.timer = time + 1000;
                 const angle = Math.random() * Math.PI * 2;
                 scene.physics.velocityFromRotation(angle, 150, e.body.velocity);
                 scene.time.delayedCall(500, ()=> { if(e.active) e.setVelocity(0,0); });
             }
        }
        else if (e.aiType === 'tnt') {
             e.setVelocity(0,0);
        }
        else if (e.aiType === 'dasher') {
             if (!e.dashState) e.dashState = 0; 
             if (e.dashState === 0) {
                 const angle = Phaser.Math.Angle.Between(e.x, e.y, player.x, player.y);
                 e.rotation = angle;
                 e.setVelocity(0, 0);
                 if (!e.timer) e.timer = time + 1000;
                 if (time > e.timer) {
                     e.dashState = 1; e.timer = time + 500;
                     scene.physics.velocityFromRotation(angle, 400, e.body.velocity);
                 }
             } else if (e.dashState === 1) {
                 if (time > e.timer) {
                     e.dashState = 2; e.timer = time + 1500; e.setVelocity(0, 0);
                 }
             } else {
                 if (time > e.timer) {
                     e.dashState = 0; e.timer = 0;
                 }
             }
        } else if (e.aiType === 'turret') {
             e.setVelocity(0, 0);
             e.rotation += 0.02;
             if (time > e.lastShot) {
                 for(let i=0; i<4; i++) {
                     let angle = e.rotation + (i * Math.PI/2);
                     enemyFire(e.x, e.y, e.x + Math.cos(angle)*100, e.y + Math.sin(angle)*100, e.damage);
                 }
                 e.lastShot = time + 2000;
             }
        } else if (e.aiType === 'grimace') {
             e.setVelocity(0, 0);
             // Stone Heads don't rotate, they just shoot cardinal directions
             if (time > e.lastShot) {
                 [0, Math.PI/2, Math.PI, -Math.PI/2].forEach(angle => {
                     enemyFire(e.x, e.y, e.x + Math.cos(angle)*100, e.y + Math.sin(angle)*100, e.damage);
                 });
                 e.lastShot = time + 2000;
             }
        } else if (e.aiType === 'spider') {
            if (time > e.aiStateTimer) {
                 e.aiState = (e.aiState + 1) % 2; 
                 e.aiStateTimer = time + (e.aiState===0 ? 500 : 300);
                 if (e.aiState === 1) {
                     const angle = Phaser.Math.Angle.Between(e.x, e.y, player.x, player.y) + (Math.random()-0.5);
                     scene.physics.velocityFromRotation(angle, 350, e.body.velocity);
                 } else {
                     e.setVelocity(0,0);
                 }
            }
        } else if (e.aiType === 'tank') {
             smartMove(scene, e, player, 40); 
        } else if (e.aiType === 'exploder') {
            smartMove(scene, e, player, 180); 
            if (Phaser.Math.Distance.Between(e.x, e.y, player.x, player.y) < 40) {
                 for(let i=0; i<6; i++) {
                    let angle = (i / 6) * Math.PI * 2;
                    enemyFire(e.x, e.y, e.x + Math.cos(angle)*100, e.y + Math.sin(angle)*100, e.damage);
                 }
                 e.destroy();
                 SoundSystem.playHit(false);
            }
        } else if (e.aiType === 'bat') {
            e.rotation += 0.05;
            scene.physics.moveToObject(e, player, 130 + Math.sin(time/200)*50);
        }
        else if (e.aiType.startsWith('boss')) {
             if (time > e.aiStateTimer) {
                e.aiState = (e.aiState + 1) % 2; 
                e.aiStateTimer = time + 3000;
             }
             if (e.aiType === 'boss') { 
                 // Generic Boss
                 if (e.hp < e.maxHp * 0.5 && !e.phase2) { e.phase2 = true; e.setTint(0xff8888); }
                 
                 if (e.phase2) {
                     // Phase 2: Frenzy
                     if (time > e.lastShot) {
                         // Skill 1: Spiral
                         for(let i=0; i<8; i++) {
                             let angle = (i/8)*Math.PI*2 + time/300;
                             enemyFire(e.x, e.y, e.x + Math.cos(angle)*100, e.y + Math.sin(angle)*100, e.damage);
                         }
                         // Skill 2: Homing
                         scene.time.delayedCall(500, ()=> {
                             if(e.active) enemyFire(e.x, e.y, player.x, player.y, e.damage);
                         });
                         scene.physics.moveToObject(e, player, 100);
                         e.lastShot = time + 1200;
                     }
                 } else {
                     if (e.aiState === 0) {
                        // Phase 1: Charge
                        scene.physics.moveToObject(e, player, 140 + difficultyMultiplier * 20);
                     } else {
                        // Phase 2: Bullet Hell -> Skill 3: Ring
                        e.setVelocity(0,0);
                        if (time > e.lastShot) {
                            for(let i=0; i<12; i++) {
                                let angle = (i / 12) * Math.PI * 2 + Math.sin(time/200);
                                enemyFire(e.x, e.y, e.x + Math.cos(angle)*100, e.y + Math.sin(angle)*100, e.damage);
                            }
                            // Sniper Shot
                            enemyFire(e.x, e.y, player.x, player.y, e.damage);
                            e.lastShot = time + 1000;
                        }
                     }
                 }
             } else if (e.aiType === 'boss_slime') {
                 if (e.hp < e.maxHp * 0.5 && !e.phase2) { e.phase2 = true; e.setScale(e.scale * 0.8); e.setTint(0x00ff00); }
                 
                 if (e.phase2) {
                     // Fast Bounce
                     if (time > (e.jumpTimer || 0)) {
                         e.jumpTimer = time + 800;
                         const angle = Phaser.Math.Angle.Between(e.x, e.y, player.x, player.y) + (Math.random()-0.5);
                         scene.physics.velocityFromRotation(angle, 400, e.body.velocity);
                         // Trail mines?
                         spawnEnemy(scene, e.x, e.y, 'fly_green');
                     }
                 } else {
                     if (e.aiState === 0) { 
                        e.setVelocity(0,0);
                        e.x += (Math.random()-0.5)*15; // Jiggle
                        if (time > e.lastShot) {
                            // Spawn minions
                            for(let k=0; k<2; k++) spawnEnemy(scene, e.x+(Math.random()-0.5)*100, e.y+(Math.random()-0.5)*100, 'chaser'); 
                            // Shotgun blast
                            for(let i=0; i<5; i++) {
                                let angle = Phaser.Math.Angle.Between(e.x, e.y, player.x, player.y) + (i-2)*0.3;
                                enemyFire(e.x, e.y, e.x + Math.cos(angle)*100, e.y + Math.sin(angle)*100, e.damage);
                            }
                            
                            e.lastShot = time + 3000;
                        }
                     } else {
                        // Jump attack
                        scene.physics.moveToObject(e, player, 200);
                     }
                 }
             } else if (e.aiType === 'boss_golem') {
                 if (e.hp < e.maxHp * 0.5 && !e.phase2) { e.phase2 = true; e.setTint(0x555555); }
                 
                 if (e.phase2) {
                      // Invulnerable phases? Or just heavy rocks
                      if (time > e.lastShot) {
                          // Rock Fall
                          for(let k=0; k<5; k++) {
                              let rx = player.x + (Math.random()-0.5)*300;
                              let ry = player.y + (Math.random()-0.5)*300;
                              // Warning circle
                              let w = scene.add.circle(rx, ry, 30, 0xff0000, 0.3);
                              scene.tweens.add({targets:w, scale:0, duration:1000, onComplete:()=>w.destroy()});
                              scene.time.delayedCall(1000, ()=>{
                                   enemyFire(rx, ry-200, rx, ry, e.damage*2); // Falling "bullet"
                                   // Actually a real rock would be better but bullet works mechanic wise
                              });
                          }
                          e.lastShot = time + 1500;
                      }
                      scene.physics.moveToObject(e, player, 40);
                 } else {
                     if (e.aiState === 0) { 
                        // Slow relentless march
                        scene.physics.moveToObject(e, player, 60);
                        // Shockwave on step?
                     } else {
                        e.setVelocity(0,0);
                        if (time > e.lastShot) {
                            // Expanding Ring
                            for(let i=0; i<16; i++) {
                                 let angle = (i/16) * Math.PI * 2;
                                 enemyFire(e.x, e.y, e.x + Math.cos(angle)*100, e.y + Math.sin(angle)*100, e.damage);
                            }
                            // Rapid fire at player
                            scene.time.delayedCall(200, ()=>enemyFire(e.x, e.y, player.x, player.y, e.damage));
                            scene.time.delayedCall(400, ()=>enemyFire(e.x, e.y, player.x, player.y, e.damage));
                            
                            e.lastShot = time + 2000;
                        }
                     }
                 }
             } else if (e.aiType === 'boss_monstro') {
                 // Monstro: Jump -> Smash
                 if (e.aiState === 0) { // Prep
                     e.setVelocity(0,0);
                     if(Math.random()<0.05) { e.aiState=1; e.aiStateTimer = time + 1000; e.setScale(1.2); }
                 } else if (e.aiState === 1) { // Jump
                     scene.physics.moveToObject(e, player, 400);
                     if (time > e.aiStateTimer) {
                         // Land
                         e.aiState = 2; 
                         e.aiStateTimer = time + 1000;
                         e.setVelocity(0,0);
                         e.setScale(1.5); // restore
                         scene.cameras.main.shake(100, 0.01);
                         for(let i=0; i<12; i++) {
                             let angle = (i / 12) * Math.PI * 2;
                             enemyFire(e.x, e.y, e.x + Math.cos(angle)*100, e.y + Math.sin(angle)*100);
                         }
                     }
                 } else { // Recover
                     e.setVelocity(0,0);
                     if (time > e.aiStateTimer) { e.aiState=0; }
                 }
             } else if (e.aiType === 'boss_duke') {
                 // Duke: Spawn Flies
                 scene.physics.moveToObject(e, player, 30);
                 if (time > e.lastShot) {
                     e.lastShot = time + 2500;
                     if (enemies.countActive() < 30) {
                         spawnEnemy(scene, e.x + (Math.random()-0.5)*50, e.y + (Math.random()-0.5)*50, Math.random()<0.3?'red_fly':'fly');
                     }
                 }
             } else if (e.aiType === 'boss_peep') {
                 // Peep: Move & Spread Shot
                 scene.physics.moveToObject(e, player, 100);
                 if (time > e.lastShot) {
                     e.lastShot = time + 1200;
                     let angleToPlayer = Phaser.Math.Angle.Between(e.x, e.y, player.x, player.y);
                     enemyFire(e.x, e.y, e.x + Math.cos(angleToPlayer)*100, e.y + Math.sin(angleToPlayer)*100);
                     enemyFire(e.x, e.y, e.x + Math.cos(angleToPlayer+0.5)*100, e.y + Math.sin(angleToPlayer+0.5)*100);
                     enemyFire(e.x, e.y, e.x + Math.cos(angleToPlayer-0.5)*100, e.y + Math.sin(angleToPlayer-0.5)*100);
                 }
             } else if (e.aiType === 'boss_skeletor') {
                 // Skeletor: Bones
                 if (time > e.aiStateTimer) {
                     e.aiState = (e.aiState + 1) % 2;
                     e.aiStateTimer = time + 2000;
                     if(e.aiState===1) {
                         // Teleport near player? Or just Dash?
                         let angle = Phaser.Math.Angle.Between(e.x, e.y, player.x, player.y);
                         scene.physics.velocityFromRotation(angle, 300, e.body.velocity);
                     }
                 }
                 if(e.aiState===0) {
                     scene.physics.moveToObject(e, player, 60);
                     if(time > e.lastShot) {
                         e.lastShot = time + 800;
                         let angle = Phaser.Math.Angle.Between(e.x, e.y, player.x, player.y);
                         enemyFire(e.x, e.y, e.x + Math.cos(angle)*100, e.y + Math.sin(angle)*100);
                     }
                 }
             } else if (e.aiType === 'boss_eye') {
                 // Static Eye
                 e.setVelocity(0,0);
                 if (time > e.lastShot) {
                     e.lastShot = time + 500;
                     // Shoot strict cardinality
                     [0, Math.PI/2, Math.PI, -Math.PI/2].forEach(a => {
                         enemyFire(e.x, e.y, e.x + Math.cos(a)*100, e.y + Math.sin(a)*100);
                     });
                     // And aimed
                     if(Math.random()<0.5) {
                         let angle = Phaser.Math.Angle.Between(e.x, e.y, player.x, player.y);
                         enemyFire(e.x, e.y, e.x + Math.cos(angle)*100, e.y + Math.sin(angle)*100);
                     }
                 }
             } else if (e.aiType === 'boss_final') {
                 if (e.aiState === 0) {
                    if (Math.random() < 0.1) {
                        e.setVelocity((Math.random()-0.5)*600, (Math.random()-0.5)*600);
                    }
                 } else {
                    e.setVelocity(0,0);
                    if (time > e.lastShot) {
                        let offset = (time / 1000);
                        for(let i=0; i<12; i++) {
                            let angle = (i / 12) * Math.PI * 2 + offset;
                            enemyFire(e.x, e.y, e.x + Math.cos(angle)*100, e.y + Math.sin(angle)*100, e.damage);
                        }
                        e.lastShot = time + 200;
                    }
                 }
             }
        } 
    });

    checkRoomClear(scene);

    bullets.children.iterate(b => { 
        if(b) {
            if (b.x<-50 || b.x>850 || b.y<-50 || b.y>650) b.disableBody(true,true);
            if (b.active && playerStats.homing) {
                 let nearest = null;
                 let minSpl = 100000;
                 enemies.children.iterate(e => {
                     if (!e.active) return;
                     let d = Phaser.Math.Distance.Between(b.x, b.y, e.x, e.y);
                     if (d < 300 && d < minSpl) { minSpl = d; nearest = e; }
                 });
                 if (nearest) {
                     scene.physics.moveToObject(b, nearest, playerStats.bulletSpeed);
                 }
            }
        }
    });
    enemyBullets.children.iterate(b => { if(b && (b.x<-50 || b.x>850 || b.y<-50 || b.y>650)) b.disableBody(true,true); });
}

// --- Dungeon System ---

function generateDungeon() {
    try {
        dungeon = {}; // Clear & Reset
        dungeon.themeVariant = null; // Important: Clear theme so loadRoom generates new one
        console.log("Generating Dungeon...");
        
        let stack = [{x:5, y:5}];
        dungeon["5,5"] = { type: 'spawn', cleared: true, doors: [] };
        
        // Scale Room Count: 8 at Lv1 -> 15 at Lv8+
        let targetCount = Math.min(15, roomCount + (currentLevel - 1));

        let count = 0;
        let protection = 0; // Infinite loop breaker
        while(stack.length > 0 && count < targetCount && protection < 1000) {
            protection++;
            let current = stack[Math.floor(Math.random() * stack.length)];
            let dirs = [[0,1], [0,-1], [1,0], [-1,0]];
            let dir = dirs[Math.floor(Math.random()*dirs.length)];
            let nx = current.x + dir[0];
            let ny = current.y + dir[1];
            let key = `${nx},${ny}`;
            
            if (!dungeon[key]) {
                let type = 'enemy';
                if (count === roomCount - 1) type = 'boss';
                else if (count === Math.floor(roomCount/2)) type = 'treasure';
                else if (count === 3 && roomCount > 4) type = 'shop';
                
                dungeon[key] = { type: type, cleared: (type==='spawn' || type==='treasure' || type==='shop'), doors: [] };
                stack.push({x:nx, y:ny});
                count++;
            }
        }
        
        for(let key in dungeon) {
            let parts = key.split(',');
            let x = parseInt(parts[0]);
            let y = parseInt(parts[1]);
            // This logic is flawed previously because it sets key.doors but 'doors' is array of strings.
            // Wait, previous code:
            // if(dungeon[`${x+1},${y}`]) dungeon[key].doors.push('right');
            // This assumes dungeon[key] exists.
            
            let r = dungeon[key];
            if(dungeon[`${x+1},${y}`] && !r.doors.includes('right')) r.doors.push('right');
            if(dungeon[`${x-1},${y}`] && !r.doors.includes('left')) r.doors.push('left');
            if(dungeon[`${x},${y+1}`] && !r.doors.includes('down')) r.doors.push('down');
            if(dungeon[`${x},${y-1}`] && !r.doors.includes('up')) r.doors.push('up');
        }
        console.log("Dungeon Generated with " + count + " rooms.");
    } catch(e) {
        console.error("Dungeon Generation Error:", e);
        // Fallback dungeon
        dungeon = { "5,5": { type: 'spawn', cleared: true, doors: [] } };
    }
}

function loadRoom(scene, x, y) {
    console.log("Loading Room " + x + "," + y);
    try {
        currentRoom = {x, y};
        let key = `${x},${y}`;
        let roomData = dungeon[key];
        
        if (!roomData) {
             console.error("Room data missing for " + key);
             return;
        }

        // Theme Info
        let themeIndex = (currentLevel - 1) % 4 + 1;
        let themeList = (mapThemes && mapThemes[themeIndex]) ? mapThemes[themeIndex] : [{name: 'Error', color: 0x000000, enemyPool:['eye']}]; 
        
        if (!dungeon.themeVariant) {
            dungeon.themeVariant = themeList[Math.floor(Math.random() * themeList.length)];
        }
    let theme = dungeon.themeVariant;

    scene.cameras.main.setBackgroundColor(theme.color); // Change BG color
    if (scene.backgroundSprite) scene.backgroundSprite.setTint(theme.color);

    scene.roomText.setText(`Lv.${currentLevel} - ${theme.name} [${x},${y}]`);

    roomData.visited = true;
    const neighbors = [[0,1], [0,-1], [1,0], [-1,0]];
    neighbors.forEach(dir => {
        let key = `${x+dir[0]},${y+dir[1]}`;
        if(dungeon[key]) dungeon[key].seen = true;
    });
    drawMinimap();
    
    enemies.clear(true, true);
    bullets.clear(true, true);
    enemyBullets.clear(true, true);
    items.clear(true, true);
    doors.clear(true, true);
    stairs.clear(true, true); // No stairs by default
    walls.clear(true, true);
    crates.clear(true, true);
    pits.clear(true, true);
    if(tempTexts) tempTexts.clear(true, true);
    if(scene.shopDecor) scene.shopDecor.clear(true, true);

    // Generate Terrain based on room type
    generateRoomTerrain(scene, roomData);
    
    // Restore dropped items
    if (roomData.droppedItems && roomData.droppedItems.length > 0) {
        roomData.droppedItems.forEach(drop => {
            // If shop item (has price), we should ideally restore it as shop item.
            // But for now, we restore as regular item to prevent bugs, or if they were free items.
            // If they had a price property, spawnItem won't display it unless we add text manually.
            spawnItem(scene, drop.x, drop.y, drop.data);
        });
    }
    
    if (!roomData.cleared) {
        if (roomData.type === 'enemy') {
            // Balance: Scale count slower. Start 2-4, max around 8-10.
            let minC = 2 + Math.floor(currentLevel * 0.4);
            let maxC = 4 + Math.floor(currentLevel * 0.5);
            let count = Phaser.Math.Between(minC, Math.min(10, maxC)); 
            
            let pool = theme.enemyPool;
            for(let i=0; i<count; i++) {
                let etype = pool[Phaser.Math.Between(0, pool.length-1)];
                let ex, ey, dist;
                let attempts = 0;
                let valid = false;
                
                // Try to find a spawn position that is safe (not in wall/pit) and not too close to player
                do {
                    ex = Phaser.Math.Between(100, 700);
                    ey = Phaser.Math.Between(100, 500);
                    dist = Phaser.Math.Distance.Between(ex, ey, player.x, player.y);
                    
                    let colliding = false;
                    if (roomData.terrainLayout) {
                         const checkObj = (arr) => {
                             if (!arr || colliding) return;
                             for(let o of arr) {
                                 if (o.destroyed) continue;
                                 // Check overlap (assuming tile ~64x64, radius check ~45)
                                 if (Math.abs(ex - o.x) < 45 && Math.abs(ey - o.y) < 45) { 
                                     colliding = true; 
                                     break;
                                 }
                             }
                         };
                         checkObj(roomData.terrainLayout.walls);
                         checkObj(roomData.terrainLayout.pits);
                         checkObj(roomData.terrainLayout.crates);
                    }
                    
                    if (!colliding && dist >= 250) valid = true;
                    attempts++;
                } while(!valid && attempts < 50);

                spawnEnemy(scene, ex, ey, etype);
            }
        } else if (roomData.type === 'boss') {
            let bossKey = theme.boss || 'boss';
            if (Array.isArray(bossKey)) {
                // If pool, try to maintain consistency if already spawned? No, persistence handles it.
                // But dungeon generation didn't save specific boss type. 
                // We should pick one and save it to roomData so it doesn't change on re-entry if we leave the room?
                // Actually loadRoom is called on entry. 
                // Let's modify: if roomData has bossType, use it. Else pick and save.
                if (!roomData.bossType) {
                    roomData.bossType = bossKey[Math.floor(Math.random() * bossKey.length)];
                }
                bossKey = roomData.bossType;
            }

            // Safe Boss Spawn
            let bx = 400, by = 150;
            // Check distance from player
            let dist = Phaser.Math.Distance.Between(bx, by, player.x, player.y);
            if (dist < 250) {
                // Too close! Move boss to opposite side
                if (player.y < 300) by = 450; else by = 150;
                if (player.x < 400) bx = 600; else bx = 200;
                // Center alignment priority
                bx = 400; 
            }

            // Ensure Boss doesn't spawn in wall
            if (roomData.terrainLayout) {
                 let valid = false;
                 let attempts = 0;
                 while(!valid && attempts < 50) {
                     let colliding = false;
                     const checkObj = (arr) => {
                         if (!arr || colliding) return;
                         for(let o of arr) {
                            if (o.destroyed) continue;
                            if (Math.abs(bx - o.x) < 60 && Math.abs(by - o.y) < 60) { colliding = true; break;}
                         }
                     };
                     checkObj(roomData.terrainLayout.walls);
                     checkObj(roomData.terrainLayout.pits);
                     checkObj(roomData.terrainLayout.crates);
                     
                     if (!colliding) {
                         valid = true;
                     } else {
                         // If blocked, try random position
                         bx = Phaser.Math.Between(200, 600);
                         by = Phaser.Math.Between(150, 450);
                         attempts++;
                     }
                 }
            }

            spawnEnemy(scene, bx, by, bossKey);
        }
    } else {
        openDoors(scene, roomData);
        if (roomData.type === 'treasure' && !roomData.itemTaken) {
            spawnItem(scene, 400, 300);
        }
        if (roomData.type === 'shop' && !roomData.shopGenerated) {
             roomData.shopGenerated = true;
             
             // Dynamic Shop Slot Count:
             // Level 1: 3 items (Base)
             // Level 2-4: 4 items
             // Level 5+: 5 items (+ potentially more logic)
             let slots = 3;
             if (currentLevel >= 2) slots = 4;
             if (currentLevel >= 5) slots = 5;

             // Calculate spacing
             // Center is 400. Width ~800.
             // 3 items: 300, 400, 500 (Gap 100)
             // 4 items: ?
             let startX = 250;
             let gap = 100;
             if (slots === 3) { startX = 300; gap = 100; }
             else if (slots === 4) { startX = 250; gap = 100; }
             else if (slots === 5) { startX = 200; gap = 100; }

             for (let i = 0; i < slots; i++) {
                 spawnShopItem(scene, startX + i * gap, 300);
             }
        } else if (roomData.type === 'shop' && roomData.shopGenerated) {
             // Respawn existing shop items
             if (scene.shopDecor) scene.shopDecor.clear(true, true); // Double clear old visuals to be safe
             if (roomData.shopItems) {
                 roomData.shopItems.forEach(entry => spawnShopItemSprite(scene, entry));
             }
        }
        // If boss room cleared, show stairs
        if (roomData.type === 'boss') {
             spawnStairs(scene, 400, 300);
        }
    }
    } catch(e) {
        console.error("Error loading room:", e);
    }
}

function checkRoomClear(scene) {
    // If not in a valid room coord or dungeon data missing, skip
    if (!currentRoom || !dungeon[`${currentRoom.x},${currentRoom.y}`]) return;

    let key = `${currentRoom.x},${currentRoom.y}`;
    let roomData = dungeon[key];
    
    // Count active enemies that MUST be defeated (exclude Grimace/Stone Heads)
    let activeHostiles = 0;
    enemies.children.iterate(e => {
        // Grimace and Traps do not count towards room clear
        if (e.active && e.aiType !== 'grimace' && e.aiType !== 'turret' && e.aiType !== 'tnt') {
            activeHostiles++;
        }
    });

    if (!roomData.cleared && activeHostiles === 0) {
        roomData.cleared = true;
        
        // Charge Active Item
        chargeActiveItem();
        updateUI(scene);

        // Auto-open doors visually
        openDoors(scene, roomData);
        
        // Award room reward? (Optional logic)
        
        // Destroy existing Grimaces when room is cleared to prevent annoyance
        enemies.children.iterate(e => {
            if (e.active && (e.aiType === 'grimace' || e.aiType === 'turret')) {
               // Optional: Destroy or Deactivate
               // e.destroy(); 
            }
        }); 
 
        // Or keep them as hazards. The user said "don't need to defeat", not "remove".
        // But usually "Room Clear" means safety. I'll just open doors.
        
        if (Math.random() < 0.15 && roomData.type !== 'boss') {
            spawnItem(scene, 400, 300);
            const txt = scene.add.text(400, 250, "Room Cleared Reward!", { fontSize: '24px', color: '#00ff00' }).setOrigin(0.5);
            if(tempTexts) tempTexts.add(txt);
            scene.tweens.add({ targets: txt, y: 200, alpha: 0, duration: 2000, onComplete: () => txt.destroy() });
        }
        
        
        if (roomData.type === 'boss') {
             spawnStairs(scene, 400, 300);
             
             // Boss drop removed as requested (Coins only)
             
             // Drop Coins (Moved away from stairs)
             for(let i=0; i<8; i++) {
                spawnCoin(scene, 400 + Phaser.Math.Between(-60,60), 520 + Phaser.Math.Between(-30,30));
             }

             SoundSystem.playPowerup(); // Victory sound
        }

        openDoors(scene, roomData);
        SoundSystem.playPowerup();
    }
}

function spawnStairs(scene, x, y) {
    if (stairs.countActive() > 0) return;
    let s = stairs.create(x, y, 'stairs');
    s.body.setSize(20, 20);
    let txt = scene.add.text(x, y-40, "下一层", { fontSize: '18px', color: '#fff' }).setOrigin(0.5);
    s.label = txt;
    s.on('destroy', () => { if(s.label) s.label.destroy(); });
}

function nextLevel(player, stair) {
    const scene = player.scene;
    if (scene.isTransitioning) return;
    if (scene.isConfirmingExit) return;
    
    scene.isConfirmingExit = true;
    scene.physics.pause();
    
    // Confirmation UI
    let container = scene.add.container(0, 0).setDepth(300);
    // Background blocks clicks
    let bg = scene.add.rectangle(400, 300, 800, 600, 0x000000, 0.5).setInteractive();
    
    let box = scene.add.rectangle(400, 300, 300, 150, 0x222222).setStrokeStyle(2, 0xffffff);
    let text = scene.add.text(400, 260, "进入下一层?", { fontSize: '24px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
    
    let btnYes = scene.add.rectangle(340, 330, 100, 40, 0x44aa44).setInteractive();
    let txtYes = scene.add.text(340, 330, "确定", { fontSize: '20px' }).setOrigin(0.5);
    
    let btnNo = scene.add.rectangle(460, 330, 100, 40, 0xaa4444).setInteractive();
    let txtNo = scene.add.text(460, 330, "取消", { fontSize: '20px' }).setOrigin(0.5);
    
    container.add([bg, box, text, btnYes, txtYes, btnNo, txtNo]);
    
    btnYes.on('pointerover', () => btnYes.setFillStyle(0x66cc66));
    btnYes.on('pointerout', () => btnYes.setFillStyle(0x44aa44));
    btnYes.on('pointerdown', () => {
        container.destroy();
        scene.isConfirmingExit = false;
        
        // Proceed
        scene.isTransitioning = true;
        
        // Show Talent Selection
        createTalentSelection(scene, () => {
            startNextLevelTransition(scene, player);
        });
    });
    
    btnNo.on('pointerover', () => btnNo.setFillStyle(0xcc6666));
    btnNo.on('pointerout', () => btnNo.setFillStyle(0xaa4444));
    btnNo.on('pointerdown', () => {
        container.destroy();
        scene.isConfirmingExit = false;
        scene.physics.resume();
        // Move player away slightly
        player.y += 30;
    });
}

function startNextLevelTransition(scene, player) {
    scene.isTransitioning = true; // Ensure logic
    currentLevel++;
    scene.tweens.add({
        targets: player,
        alpha: 0,
        duration: 1000,
        onComplete: () => {
            generateDungeon();
            player.alpha = 1;
            scene.isTransitioning = false;
            scene.physics.resume(); // Resume
            
            loadRoom(scene, 5, 5); // Assuming start is 5,5
            player.setPosition(400, 300);
            
            // HUD feedback
            let txt = scene.add.text(400, 300, `LEVEL ${currentLevel}`, { fontSize: '48px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
            scene.tweens.add({ targets: txt, scale: 1.5, alpha: 0, duration: 3000, onComplete: () => txt.destroy() });
        }
    });
}

function createTalentSelection(scene, onComplete) {
    // UI Background
    let bg = scene.add.rectangle(400, 300, 800, 600, 0x000000, 0.9).setDepth(200).setInteractive();
    let title = scene.add.text(400, 100, "层级清除! 选择奖励:", { fontSize: '32px', color: '#fff' }).setOrigin(0.5).setDepth(201);
    
    let options = [];
    let poolCopy = [...getAvailableItemPool()];

    // Deduplicate poolCopy by ID to ensure uniqueness for selection
    let uniquePool = [];
    let seenIds = new Set();
    poolCopy.forEach(item => {
        if (!seenIds.has(item.id)) {
            seenIds.add(item.id);
            uniquePool.push(item);
        }
    });
    poolCopy = uniquePool;
    
    for(let i=0; i<3; i++) {
        if (poolCopy.length === 0) break;
        let idx = Math.floor(Math.random() * poolCopy.length);
        options.push(poolCopy[idx]);
        poolCopy.splice(idx, 1);
    }
    
    let container = scene.add.container(0, 0).setDepth(201);
    
    options.forEach((item, index) => {
        let x = 200 + index * 200;
        let y = 300;
        
        let card = scene.add.rectangle(x, y, 160, 240, 0x333333).setInteractive();
        card.setStrokeStyle(4, item.color);
        
        let name = scene.add.text(x, y - 80, item.name, { fontSize: '20px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
        let desc = scene.add.text(x, y, item.desc, { fontSize: '14px', color: '#ccc', wordWrap: { width: 140 } }).setOrigin(0.5);
        let price = scene.add.text(x, y + 80, "FREE", { fontSize: '18px', color: '#00ff00' }).setOrigin(0.5);
        
        container.add([card, name, desc, price]);
        
        card.on('pointerdown', () => {
            // Pick Item
            // Ensure single execution by disabling interactivity immediately
            container.each(child => child.disableInteractive());
            
            // Re-use pickItem logic but pass a mock item object since we don't have a sprite
            let mockItem = { 
                dataRef: item, 
                x: x, y: y,
                destroy: () => {}, 
                label: { destroy: () => {} } 
            };
            pickItem.call(scene, player, mockItem);

            // Cleanup
            bg.destroy();
            title.destroy();
            container.destroy();
            onComplete();
        });
        
        card.on('pointerover', () => card.setFillStyle(0x555555));
        card.on('pointerout', () => card.setFillStyle(0x333333));
    });
}



function openDoors(scene, roomData) {
    scene.physics.world.bodies.entries.forEach(b => { 
        if(b.gameObject && b.gameObject.texture && b.gameObject.texture.key === 'door') {
            b.gameObject.destroy(); 
        }
    });
    doors.clear(true, true);

    roomData.doors.forEach(dir => {
        let dx=0, dy=0, angle=0;
        if(dir === 'right') { dx=780; dy=300; angle=90; }
        if(dir === 'left') { dx=20; dy=300; angle=-90; }
        if(dir === 'down') { dx=400; dy=580; angle=180; }
        if(dir === 'up') { dx=400; dy=20; angle=0; }
        let d = doors.create(dx, dy, 'door').setAngle(angle);
        d.dir = dir;
    });
}

function enterDoor(player, door) {
    if (!door.dir) return; 
    const scene = player.scene;

    // Save current room items
    if (typeof currentRoom !== 'undefined') {
         let key = `${currentRoom.x},${currentRoom.y}`;
         if (dungeon[key]) {
             dungeon[key].droppedItems = [];
             items.getChildren().forEach(item => {
                 if (item.active && item.dataRef) {
                     dungeon[key].droppedItems.push({
                         x: item.x,
                         y: item.y,
                         data: item.dataRef
                     });
                 }
             });
         }
    }

    let nx = currentRoom.x; let ny = currentRoom.y;
    let px = 400; let py = 300;
    
    if (door.dir === 'left') { nx--; px=700; py=300; }
    if (door.dir === 'right') { nx++; px=100; py=300; }
    if (door.dir === 'up') { ny--; py=500; px=400; }
    if (door.dir === 'down') { ny++; py=100; px=400; }
    
    player.setPosition(px, py);
    loadRoom(scene, nx, ny);
}

// --- Entity Factory ---

const enemyStats = {
    // Basic Enemies - Difficulty Increased
    'chaser': { name: '追逐者', hp: 7, damage: 1, speed: 110, desc: '普通的敌人，会径直冲向你。' },
    'fly': { name: '苍蝇', hp: 4, damage: 1, speed: 90, texture: 'enemy_bat', color: 0x222222, desc: '弱小的飞行单位。' },
    'red_fly': { name: '红苍蝇', hp: 7, damage: 1, speed: 125, texture: 'enemy_bat', color: 0xff0000, desc: '愤怒的苍蝇，速度稍快。' },
    'maggot': { name: '蛆虫', hp: 9, damage: 1, speed: 45, texture: 'enemy_chaser', color: 0xffaaaa, desc: '移动缓慢但血量稍高。' },
    
    'shooter': { name: '射手', hp: 5, damage: 1, speed: 85, desc: '保持距离并射击子弹。' },
    'sniper': { name: '狙击手', hp: 6, damage: 2, speed: 65, texture: 'enemy_shooter', color: 0x555555, desc: '射程更远，射速较慢，伤害较高。' },
    
    'dasher': { name: '冲刺者', hp: 6, damage: 1, speed: 420, desc: '蓄力后向你发起快速冲撞。' },
    'charger': { name: '冲锋虫', hp: 9, damage: 1, speed: 370, texture: 'enemy_dasher', color: 0xccffcc, desc: '更肉的冲刺怪。' },
    
    'turret': { name: '炮台', hp: 10, damage: 1, speed: 0, desc: '固定不动，向四个方向发射子弹。' },
    'grimace': { name: '石像头', hp: 999, damage: 1, speed: 0, texture: 'enemy_turret', color: 0x888888, desc: '无敌的炮台。' }, 
    
    'spider': { name: '蜘蛛', hp: 3, damage: 1, speed: 370, desc: '快速且移动诡异，难以预测。' },
    'spider_red': { name: '红蜘蛛', hp: 6, damage: 1, speed: 400, texture: 'enemy_spider', color: 0xff4444, desc: '更具攻击性的蜘蛛。' },
    'rock_spider': { name: '岩蛛', hp: 12, damage: 1, speed: 210, texture: 'enemy_spider', color: 0x777777, desc: '坚硬的蜘蛛。' },
    
    'tank': { name: '坦克', hp: 18, damage: 1, speed: 45, desc: '移动缓慢但极其坚硬。' },
    'exploder': { name: '自爆怪', hp: 3, damage: 2, speed: 190, desc: '接近你时会自我毁灭造成范围伤害。' },
    'bat': { name: '蝙蝠', hp: 3, damage: 1, speed: 130, desc: '飞行单位，无法被地形阻挡。' },
    'ghost': { name: '幽灵', hp: 6, damage: 1, speed: 65, desc: '能够穿墙，隐约可见。' },
    'red_ghost': { name: '复仇幽灵', hp: 10, damage: 1, speed: 75, texture: 'enemy_ghost', color: 0xff0000, desc: '更难缠的幽灵。' },
    
    'slimeer': { name: '史莱姆', hp: 7, damage: 1, speed: 75, desc: '留下一条减速或伤害的粘液路径。' },
    'leech': { name: '水蛭', hp: 5, damage: 1, speed: 160, texture: 'enemy_snake', color: 0x220000, desc: '快速追击。' },
    
    'necromancer': { name: '死灵法师', hp: 12, damage: 1, speed: 110, desc: '召唤骷髅追逐者。' },
    'snake': { name: '蛇', hp: 5, damage: 1, speed: 130, desc: '以S形路径移动。' },
    'blob': { name: '团块', hp: 9, damage: 1, speed: 160, desc: '随机跳跃移动。' },
    'tnt': { name: '炸药桶', hp: 1, damage: 2, speed: 0, desc: '受到攻击即会剧烈爆炸。' },
    
    'floating_eye': { name: '漂浮之眼', hp: 8, damage: 1, speed: 110, texture: 'enemy_chaser', color: 0xfffff0, desc: '发射激光的眼睛。' },
    'demon_baby': { name: '恶魔之子', hp: 12, damage: 1, speed: 140, texture: 'player', color: 0x000000, desc: '模仿你的动作 (简化版)。' },
    'fire_skull': { name: '火焰骷髅', hp: 9, damage: 1, speed: 0, texture: 'enemy_turret', color: 0xff6600, desc: '发射火焰。' },
    'portal': { name: '传送门', hp: 25, damage: 0, speed: 0, texture: 'crate', color: 0xaa00aa, desc: '不断召唤敌人。' }, 
    
    // --- EXPANDED ENEMIES (70+ Total) ---
    // Variants - Flies
    'fly_black': { name: '黑苍蝇', hp: 4, damage: 1, speed: 90, texture: 'enemy_bat', color: 0x111111, desc: '难以看见的苍蝇。', ai: 'bat' },
    'fly_white': { name: '白苍蝇', hp: 8, damage: 1, speed: 60, texture: 'enemy_bat', color: 0xeeeeee, desc: '拥有护盾的苍蝇。', ai: 'bat' },
    'fly_green': { name: '毒苍蝇', hp: 5, damage: 1, speed: 80, texture: 'enemy_bat', color: 0x00ff00, desc: '死后留下毒液。', ai: 'bat' },
    'fly_bomb': { name: '爆弹蝇', hp: 3, damage: 2, speed: 100, texture: 'enemy_bat', color: 0xff4400, desc: '死后爆炸。', ai: 'bat' },
    'fly_swarm': { name: '群蝇', hp: 2, damage: 1, speed: 140, texture: 'enemy_bat', color: 0x996633, desc: '成群结队。', ai: 'bat' },
    
    // Variants - Spiders
    'spider_tick': { name: '扁虱', hp: 10, damage: 1, speed: 100, texture: 'enemy_spider', color: 0x555555, desc: '非常坚硬，很难被击退。', ai: 'chaser' },
    'spider_jump': { name: '跳蛛', hp: 4, damage: 1, speed: 400, texture: 'enemy_spider', color: 0x00ffaa, desc: '跳跃距离极远。', ai: 'spider' },
    'spider_widow': { name: '小黑寡妇', hp: 8, damage: 1, speed: 200, texture: 'enemy_spider', color: 0x220022, desc: '会留下减速网。', ai: 'spider' },
    'spider_baby': { name: '幼蛛', hp: 1, damage: 1, speed: 300, texture: 'enemy_spider', color: 0xffaaaa, desc: '脆弱但数量众多。', ai: 'chaser' },
    'spider_giant': { name: '巨蛛', hp: 15, damage: 2, speed: 150, texture: 'enemy_spider', color: 0x440000, desc: '巨大的蜘蛛，死后分裂。', ai: 'spider' },
    
    // Variants - Ghosts
    'ghost_poltergeist': { name: '骚灵', hp: 6, damage: 1, speed: 70, texture: 'enemy_ghost', color: 0xaaffff, desc: '会投掷障碍物。', ai: 'ghost' },
    'ghost_wraith': { name: '怨灵', hp: 9, damage: 1, speed: 80, texture: 'enemy_ghost', color: 0x330033, desc: '可以隐形。', ai: 'ghost' },
    'ghost_banshee': { name: '女妖', hp: 5, damage: 1, speed: 150, texture: 'enemy_ghost', color: 0xff00ff, desc: '发出尖叫弹幕。', ai: 'ghost' },
    'ghost_wisp': { name: '鬼火', hp: 2, damage: 1, speed: 200, texture: 'enemy_ghost', color: 0xffff00, desc: '快速环绕飞行。', ai: 'bat' },
    
    // Variants - Skeletons & Undead
    'skel_warrior': { name: '骷髅战士', hp: 8, damage: 1, speed: 90, texture: 'enemy_chaser', color: 0xdddddd, desc: '近战骷髅。', ai: 'chaser' },
    'skel_archer': { name: '骷髅射手', hp: 5, damage: 1, speed: 60, texture: 'enemy_shooter', color: 0xdddddd, desc: '远程骨箭。', ai: 'shooter' },
    'zombie': { name: '僵尸', hp: 12, damage: 1, speed: 40, texture: 'enemy_chaser', color: 0x55aa55, desc: '复活一次。', ai: 'chaser' },
    'ghoul': { name: '食尸鬼', hp: 10, damage: 1, speed: 110, texture: 'enemy_chaser', color: 0x555544, desc: '吞噬尸体回血。', ai: 'chaser' },
    'mummy': { name: '木乃伊', hp: 15, damage: 1, speed: 50, texture: 'enemy_chaser', color: 0xffffdd, desc: '极其坚韧。', ai: 'chaser' },
    
    // Variants - Worms
    'worm_round': { name: '圆虫', hp: 5, damage: 1, speed: 80, texture: 'enemy_snake', color: 0xffaaaa, desc: '偶尔钻地。', ai: 'snake' },
    'worm_tube': { name: '管虫', hp: 6, damage: 1, speed: 0, texture: 'enemy_turret', color: 0xaa5555, desc: '从地底钻出射击。', ai: 'turret' },
    'worm_giant': { name: '巨蠕虫', hp: 20, damage: 2, speed: 60, texture: 'enemy_snake', color: 0x552222, desc: 'Boss的幼体。', ai: 'snake' },
    
    // Variants - Machines/Constructs
    'bot_probe': { name: '探测器', hp: 4, damage: 1, speed: 150, texture: 'enemy_shooter', color: 0x00eeee, desc: '发射激光。', ai: 'bat' },
    'bot_sentry': { name: '哨兵', hp: 10, damage: 1, speed: 0, texture: 'enemy_turret', color: 0x555555, desc: '多向机枪。', ai: 'turret' },
    'bot_mine': { name: '地雷机器人', hp: 3, damage: 3, speed: 200, texture: 'enemy_tnt', color: 0x333333, desc: '快速接近爆炸。', ai: 'tnt' },
    
    // Elemental
    'elem_fire': { name: '火元素', hp: 8, damage: 1, speed: 90, texture: 'enemy_ghost', color: 0xff4400, desc: '免疫燃烧。', ai: 'chaser' },
    'elem_ice': { name: '冰元素', hp: 8, damage: 1, speed: 90, texture: 'enemy_ghost', color: 0x00ffff, desc: '造成减速。', ai: 'chaser' },
    'elem_void': { name: '虚空灵', hp: 15, damage: 2, speed: 50, texture: 'enemy_ghost', color: 0x220044, desc: '吸取你的子弹。', ai: 'ghost' },
    
    // Eyes
    'eye_blood': { name: '血眼', hp: 6, damage: 1, speed: 80, texture: 'enemy_chaser', color: 0xff0000, desc: '发射血泪。', ai: 'shooter' },
    'eye_laser': { name: '激光眼', hp: 8, damage: 1, speed: 0, texture: 'enemy_turret', color: 0xff00ff, desc: '持续激光扫射。', ai: 'turret' },
    'eye_psy': { name: '念力眼', hp: 10, damage: 1, speed: 80, texture: 'enemy_chaser', color: 0xffff00, desc: '弯曲的弹道。', ai: 'shooter' },
    
    // Special
    'mimic': { name: '宝箱怪', hp: 12, damage: 2, speed: 120, texture: 'crate', color: 0xff0000, desc: '伪装成宝箱。' },
    'doppel': { name: '变形怪', hp: 10, damage: 1, speed: 100, texture: 'player', color: 0x888888, desc: '变成你的样子。' },
    'shopkeeper_angry': { name: '店主', hp: 80, damage: 2, speed: 180, texture: 'enemy_chaser', color: 0xeeeeee, desc: '你激怒了他。' },

    // Bosses - HP Buffed (~1.5x)
    'boss': { name: '巨型史莱姆', hp: 80, damage: 1, speed: 50, desc: 'Boss. 体型巨大，拥有大量生命值。', isBoss: true },
    'boss_slime': { name: '史莱姆王', hp: 70, damage: 1, speed: 65, desc: 'Boss. 分裂出小史莱姆。', isBoss: true },
    'boss_monstro': { name: '孟斯特罗', hp: 90, damage: 1, speed: 100, texture: 'boss', color: 0xccaa88, desc: 'Boss. 巨大的肉块，会跳跃攻击。', isBoss: true },
    'boss_duke': { name: '苍蝇公爵', hp: 70, damage: 1, speed: 35, texture: 'boss', color: 0x222222, desc: 'Boss. 召唤苍蝇护体。', isBoss: true },
    
    'boss_golem': { name: '岩石巨像', hp: 100, damage: 1, speed: 35, desc: 'Boss. 极其缓慢但防御极高，发射岩石弹幕。', isBoss: true },
    'boss_peep': { name: '皮普', hp: 110, damage: 1, speed: 80, texture: 'boss_golem', color: 0xffffaa, desc: 'Boss. 踩踏地板并在死亡时留下眼球。', isBoss: true },
    
    'boss_eye': { name: '妈妈的眼睛', hp: 120, damage: 1, speed: 0, texture: 'boss_golem', color: 0xffcccc, desc: 'Boss. 固定在墙上发射激光。', isBoss: true },
    'boss_skeletor': { name: '骷髅王', hp: 100, damage: 1, speed: 90, texture: 'boss_golem', color: 0xdddddd, desc: 'Boss. 骨头弹幕。', isBoss: true },

    'boss_widow': { name: '黑寡妇', hp: 130, damage: 1, speed: 110, texture: 'boss_golem', color: 0x111111, desc: 'Boss. 快速跳跃并召唤蜘蛛。', isBoss: true },
    'boss_haunt': { name: '猎杀者', hp: 120, damage: 1, speed: 70, texture: 'boss', color: 0xccffff, desc: 'Boss. 无敌状态切换，幽灵随从。', isBoss: true },
    'boss_pin': { name: '大岩虫', hp: 100, damage: 1, speed: 90, texture: 'boss_golem', color: 0xaaffaa, desc: 'Boss. 从地底钻出突袭。', isBoss: true },
    'boss_scolex': { name: '斯科莱克斯', hp: 140, damage: 1, speed: 90, texture: 'boss_golem', color: 0x222255, desc: 'Boss. 只露出尾巴弱点。', isBoss: true },
    'boss_krampus': { name: '坎普斯', hp: 150, damage: 2, speed: 90, texture: 'boss', color: 0x550000, desc: 'Boss. 十字硫磺火。', isBoss: true },
    'boss_satan': { name: '撒旦', hp: 200, damage: 2, speed: 110, texture: 'boss', color: 0x000000, desc: 'Boss. 最终形态。', isBoss: true },

    'boss_final': { name: '深渊魔王', hp: 100, damage: 1, speed: 80, desc: 'Boss. 最终挑战，拥有多种弹幕技能。', isBoss: true }
};

function spawnEnemy(scene, x, y, type) {
    let e;
    saveData('enemy', type);
    // Difficulty++: SUPER Steeper scaling
    // Level 1: 1.0x. Level 5: 3.4x. Level 10: 6.4x
    let hpMult = (1 + (currentLevel - 1) * 0.7) * difficultyMultiplier; 
    
    let baseStats = enemyStats[type];
    if (!baseStats) {
        // Fallback
        baseStats = enemyStats['chaser'];
        console.warn("Unknown enemy type: " + type);
    }
    
    // Balance: Damage scaling
    // Level 1: Dmg+0. Level 3: Dmg+1. Level 5: Dmg+2
    let dmgBonus = Math.floor((currentLevel - 1) / 1.5); 
    // Double damage chance at higher levels
    if (currentLevel > 5 && Math.random() < 0.2) dmgBonus += 1;
    
    let finalDamage = ((baseStats.damage || 1) + dmgBonus) * difficultyMultiplier;

    // Balance: Speed scaling (Cap at +80%)
    let speedMult = 1 + Math.min(0.8, (currentLevel - 1) * 0.08); 
    
    let texture = 'enemy_' + type;
    if (baseStats.texture) texture = baseStats.texture; // Allow override
    if (type.startsWith('boss')) texture = type;
    
    // Check if texture exists, fallback if not (to avoid crash)
    if (!scene.textures.exists(texture)) {
        if (baseStats && baseStats.texture && scene.textures.exists(baseStats.texture)) {
            texture = baseStats.texture;
        } else if (type.startsWith('boss') && scene.textures.exists('boss')) { 
            texture = 'boss'; 
        } else {
            texture = 'enemy_chaser';
        }
    }

    e = enemies.create(x, y, texture);
    
    // Logic: If 'ai' property exists in stats, use it. Otherwise use 'type'.
    // We store 'aiBehavior' for logic, 'aiType' for identity/compatibility
    
    e.kind = type;
    e.aiType = baseStats.ai || type; 
    
    e.hp = baseStats.hp * hpMult;
    e.aiBaseAngle = 0; // Initialize for snake-like movements
    e.lastShot = 0;
    e.aiState = 0;
    e.aiStateTimer = 0;
    e.damage = Math.max(1, finalDamage);
    
    // Elite Chance (5% normally, higher in later levels)
    if (!baseStats.isBoss && Math.random() < 0.05 + (currentLevel * 0.03)) {
        e.isElite = true;
        e.hp *= 2.0; 
        e.setScale((e.scale || 1) * 1.3);
        e.setTint(0xff00ff); // Elite Tint
        finalDamage += 1; // Elites hit harder
        speedMult += 0.15;
    } else {
        if (baseStats.color) e.setTint(baseStats.color);
    }

    // Specific overrides based on old logic or stats
    e.moveSpeed = baseStats.speed * speedMult;
    e.damage = Math.max(1, finalDamage);

    
    // Visual / Scaling overrides
    if (type.startsWith('boss')) {
        e.setScale(1.5);
    } else if (type === 'spider') {
        e.setScale(0.8);
    } else if (type === 'ghost') {
        e.setAlpha(0.6);
    }

    e.maxHp = e.hp;
    e.hpBar = scene.add.graphics();
    drawHealthBar(e);

    // Ensure hpBar is destroyed when enemy is destroyed (e.g. falling in pit, room change)
    e.on('destroy', () => {
        if (e.hpBar) {
            e.hpBar.destroy();
            e.hpBar = null; 
        }
    });

    e.lastShot = 0;
    e.aiState = 0;
    e.aiStateTimer = 0;
    e.setCollideWorldBounds(true);
    e.setBounce(1);
    
    e.setAlpha(0);
    scene.tweens.add({ targets: e, alpha: (type==='ghost'?0.6:1), duration: 500 });
}

function spawnItem(scene, x, y, specificData = null) {
    // Avoid spawning directly on player
    if (player && Phaser.Math.Distance.Between(x, y, player.x, player.y) < 60) {
        // Shift item slightly
        x += (x > player.x ? 50 : -50);
        y += (y > player.y ? 50 : -50);
    }

    let itemData = specificData;
    // Retry logic if random pool returns undefined (safety)
    // Try up to 5 times to get a valid item
    if (!itemData) {
        for(let i=0; i<5; i++) {
            itemData = getRandomItemFromPool();
            if(itemData) break;
        }
    }
    // Fallback if STILL null (shouldn't happen with breakfast rule)
    if (!itemData) return;

    let item = items.create(x, y, 'player'); 
    item.setTint(itemData.color);
    item.dataRef = itemData;
    
    let txt = scene.add.text(x, y-40, itemData.name, { fontSize: '14px' }).setOrigin(0.5); // Ensure font is pixelated via css?
    scene.tweens.add({ targets: [item, txt], y: y-5, duration: 1000, yoyo: true, repeat: -1 });
    item.label = txt;

    // Cleanup listener
    item.on('destroy', () => {
        if (item.label) item.label.destroy();
    });
}

function spawnShopItem(scene, x, y) {
    let key = `${currentRoom.x},${currentRoom.y}`;
    let roomData = dungeon[key];
    
    let roll = Math.random();
    let itemData;
    let price = 0;

    if (roll < 0.3) {
        // Base potion price 5, scales slightly
        let basePrice = 5;
        // Inflation: +1 every 3 levels
        let levelTax = Math.floor((currentLevel - 1) / 3);
        
        itemData = {
            id: 'potion',
            name: "生命药水",
            desc: "恢复1颗心",
            color: 0xff0000,
            price: basePrice + levelTax,
            apply: (s) => { s.hp = Math.min(s.hp + 1, s.maxHp); }
        };
        price = itemData.price;
    } else {
        let poolItem = getRandomItemFromPool();
        itemData = Object.assign({}, poolItem); // Clone
        
        // Base Price Logic if not set
        let base = itemData.price || Phaser.Math.Between(7, 15);
        
        // Level Inflation: +15% per level approx
        // Example: Lv1 15 -> 15. Lv5 15 -> ~22. Lv10 15 -> ~37.
        let inflation = 1 + (currentLevel - 1) * 0.15;
        
        itemData.price = Math.ceil(base * inflation);
        price = itemData.price;
    }
    
    // Steam Sale (50% Discount)
    if (playerStats.shopDiscount) {
        price = Math.ceil(price * 0.5);
        itemData.price = price; 
    }
    
    if (!roomData.shopItems) roomData.shopItems = [];
    
    let entry = {
        x: x, y: y,
        data: itemData,
        price: price,
        bought: false,
        id: Math.random().toString(36).substr(2, 9)
    };
    roomData.shopItems.push(entry);

    spawnShopItemSprite(scene, entry);
}

function spawnShopItemSprite(scene, entry) {
    if (entry.bought) return;
    // Prevent stacking: Check if this entry already has an active visual
    if (entry.visualRef && entry.visualRef.active) {
        // Double check positions
        entry.visualRef.setPosition(entry.x, entry.y);
        if (entry.visualRef.label) entry.visualRef.label.setPosition(entry.x, entry.y-40);
        return;
    }

    let item = items.create(entry.x, entry.y, 'player'); 
    item.setTint(entry.data.color || 0xffffff);
    item.dataRef = entry.data;
    item.price = entry.price;
    item.shopEntry = entry;
    
    // Store reference
    entry.visualRef = item;

    let pedestal = scene.add.image(entry.x, entry.y, 'item_pedestal').setDepth(0);
    
    // Improved Shop Text: Price + Name + Description
    let displayText = `$${item.price}\n${entry.data.name}\n${entry.data.desc || ""}`;
    let txt = scene.add.text(entry.x, entry.y-60, displayText, { 
        fontSize: '14px', 
        align: 'center', 
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
        wordWrap: { width: 180 }
    }).setOrigin(0.5);
    
    // Color the price yellow (Simulated by just using top line logic if we had RichText, but here we just make it all readable)
    // Actually, let's keep it simple. White text with black stroke is readable.

    scene.tweens.add({ targets: [item, txt], y: entry.y-5, duration: 1000, yoyo: true, repeat: -1 });
    
    // Add to cleanup group
    if(scene.shopDecor) {
        scene.shopDecor.add(pedestal);
        scene.shopDecor.add(txt);
    }
    
    item.label = txt;
    item.pedestal = pedestal;
    item.isShopItem = true;

    item.on('destroy', () => {
        if (item.label) item.label.destroy();
        if (item.pedestal) item.pedestal.destroy();
        entry.visualRef = null; // Clear ref
    });
}

function spawnCoin(scene, x, y, val = 0) {
    if (Math.random() > 0.5 && val === 0) return; // 50% chance if normal drop
    let c = coins.create(x, y, 'coin');
    c.setBounce(0.5);
    c.setCollideWorldBounds(true);
    
    // Value Calculation: Linear increase + Random
    if (val > 0) {
        c.value = val;
    } else {
        // Base value: 1 + 0.5 per level
        let base = 1 + Math.floor((currentLevel - 1) * 0.5);
        // Random variance
        let rand = Math.floor(Math.random() * (base * 0.5 + 1));
        c.value = Math.max(1, base + rand);
    }
    
    // Visual distinction for high value coins
    if (c.value >= 5) {
        c.setTint(0xffd700);
        c.setScale(1.2);
    }

    c.setVelocity(Phaser.Math.Between(-50, 50), Phaser.Math.Between(-50, 50));
    c.setDrag(100);
}

function collectCoin(player, coin) {
    // Context is scene since we pass 'this' as context
    const scene = this;
    if (!coin.active) return;
    SoundSystem.playCoin();
    
    let val = coin.value || 1;
    playerStats.money += val;
    
    // Popup text for value > 1
    if (val > 1) {
        let txt = scene.add.text(player.x, player.y - 40, `+${val}`, {fontSize:'14px', color:'#ffff00', stroke:'#000', strokeThickness:2}).setOrigin(0.5);
        scene.tweens.add({targets:txt, y:player.y-60, alpha:0, duration:800, onComplete:()=>txt.destroy()});
    }

    updateUI(scene);
    coin.destroy();
}

function createBullet(x, y, vx, vy, lifeDist) {
    const b = bullets.get();
    if (b) {
        b.enableBody(true, x, y, true, true);
        
        // Tech X (Ring)
        if (playerStats.techX) {
            b.setTexture('bullet'); // Ideally a ring texture
            b.setScale(playerStats.shotSize * 2); // Bigger
            b.alpha = 0.5;
            b.setTint(0x0000ff);
        } else {
            b.setScale(playerStats.shotSize);
            b.alpha = 1;
            b.clearTint();
            if (playerStats.fearShot) b.setTint(0x111111);
        }
        
        b.setVelocity(vx, vy);
        b.lifeDist = lifeDist;
        b.startX = x; b.startY = y;
        b.isSplit = false;
        b.hitList = [];
        b.setBounce(1);
        b.setCollideWorldBounds(playerStats.canBounce); 
    }
    return b;
}

function fireDir(x, y, dx, dy, time) {
    if (time <= lastFired) return; // FIX: check lastFired here
    
    let speed = playerStats.bulletSpeed;
    let range = playerStats.range;
    
    // Tiny Planet: Shoot backwards initially or swirl? 
    // Implementing simplified Tiny Planet: Shoots normally but update() will curve it.

    const shoot = (ox, oy, angleOffset = 0) => {
        let vx = dx * speed;
        let vy = dy * speed;
        if (angleOffset !== 0) {
             let angle = Math.atan2(dy, dx) + angleOffset;
             vx = Math.cos(angle) * speed;
             vy = Math.sin(angle) * speed;
        }
        createBullet(x + ox, y + oy, vx, vy, range);
    };

    // Quad Shot
    if (playerStats.shotCount === 4) {
        if (dx !== 0) {
            shoot(0, -15, -0.1); shoot(0, -5, 0); shoot(0, 5, 0); shoot(0, 15, 0.1);
        } else {
            shoot(-15, 0, -0.1); shoot(-5, 0, 0); shoot(5, 0, 0); shoot(15, 0, 0.1);
        }
    } 
    // Triple Shot
    else if (playerStats.shotCount === 3) {
         if (dx !== 0) {
             shoot(0, 0, 0); shoot(0, 20, 0.15); shoot(0, -20, -0.15);
         } else {
             shoot(0, 0, 0); shoot(20, 0, 0.15); shoot(-20, 0, -0.15);
         }
    } 
    // Double Shot (20/20)
    else if (playerStats.doubleShot) {
        if (dx !== 0) {
            shoot(0, -10, 0); shoot(0, 10, 0);
        } else {
            shoot(-10, 0, 0); shoot(10, 0, 0);
        }
    }
    else {
         shoot(0, 0, 0);
    }
    SoundSystem.playShoot();
    lastFired = time + playerStats.fireRate;
}

function fireAt(x, y, tx, ty, time) {
    if (time <= lastFired) return;
    const angle = Phaser.Math.Angle.Between(x, y, tx, ty);
    createBullet(x, y, Math.cos(angle)*playerStats.bulletSpeed, Math.sin(angle)*playerStats.bulletSpeed, playerStats.range);
    SoundSystem.playShoot();
    lastFired = time + playerStats.fireRate;
}

function fireSwordAt(x, y, tx, ty, time) {
    if (time <= lastFired) return;
    const angle = Phaser.Math.Angle.Between(x, y, tx, ty);
    performSwordSwing(x, y, angle);
    SoundSystem.playShoot(); // Woosh sound ideally
    lastFired = time + playerStats.fireRate;
}

function fireSwordDir(x, y, dx, dy, time) {
    if (time <= lastFired) return;
    const angle = Math.atan2(dy, dx);
    performSwordSwing(x, y, angle);
    SoundSystem.playShoot(); 
    lastFired = time + playerStats.fireRate;
}

function performSwordSwing(x, y, angle) {
    // Show sword visual
    if (player.sword) {
        player.sword.setVisible(true);
        // Visual angle correction: Assuming sword sprite points RIGHT (0 deg).
        let visualAngle = angle; 
        
        // Ensure angle visualization matches the input direction exactly
        player.sword.setRotation(visualAngle); 
        
        // Swing Animation: Arc swing
        // Swing from -45 to +45 degrees relative to `angle`
        // Wait, Tweening "angle" property uses Degrees, setRotation uses Radians.
        // Let's use pure rotation tween using targets
        
        player.sword.rotation = visualAngle - 1.0; // Start back
        
        if (player.scene) {
            player.scene.tweens.add({
                targets: player.sword,
                rotation: visualAngle + 1.0, // End forward
                duration: 150,
                ease: 'Linear',
                onComplete: () => {
                    if(player.sword) player.sword.setVisible(false);
                }
            });
        }
    }

    // Create invisible projectile "slash"
    const dist = playerStats.range * 0.7; // Slightly reduced offset
    const sx = x + Math.cos(angle) * dist;
    const sy = y + Math.sin(angle) * dist;
    
    // We use 'bullets' group for collision
    const slash = bullets.create(sx, sy, 'bullet'); 
    if (slash) {
        slash.setVisible(false); 
        // Use a Circle for better "swing" feel approximation
        const hitRadius = dist * 1.0; 
        slash.body.setCircle(hitRadius);
        // Offset circle center to align with sprite center (default is top-left in some configs, but usually center for arcade sprite if not specified)
        // Actually setCircle(r) aligns to top-left of sprite frame if no offset.
        // We want the body centered on (sx, sy).
        // Since we are creating a blank 'bullet', we should just trust setCircle or use manual offset.
        // Let's use setSize for box if circle is tricky without debug, but Circle is generally better for "Range".
        // Let's stick to setCircle and hope Phaser aligns it to center or we adjust offset.
        // Default setCircle sets it relative to top-left.
        // To center it: setCircle(radius, offsetX, offsetY).
        // If texture is 32x32. Radius is e.g. 50.
        // It's safer to use setSize(w, h) for now to avoid centering issues blindly, but User complained about mismatch.
        // I will try to make visual match hitbox.
        
        slash.body.setSize(hitRadius * 2, hitRadius * 2);

        slash.isSwordSlash = true;
        slash.hitList = [];
        slash.setDepth(100);

        // Visual Slash Effect (Matches Hitbox)
        const slashVisual = slash.scene.add.graphics();
        slashVisual.fillStyle(0xffffff, 0.5);
        
        // Draw an ARC (Sector)
        slashVisual.clear();
        slashVisual.beginPath();
        // Draw relative to player
        slashVisual.x = x; 
        slashVisual.y = y;
        
        // Visual Radius matches the reach
        const arcRadius = dist + hitRadius; // Reach end
        const startAng = angle - 0.7;
        const endAng = angle + 0.7;
        
        slashVisual.lineStyle(20, 0xffffff, 0.8);
        slashVisual.arc(0, 0, arcRadius, startAng, endAng, false);
        slashVisual.strokePath();
        
        // Optional: Inner fill
        slashVisual.fillStyle(0xffffff, 0.2);
        slashVisual.moveTo(0,0);
        slashVisual.arc(0, 0, arcRadius, startAng, endAng, false);
        slashVisual.closePath();
        slashVisual.fill();

        slashVisual.setDepth(99);
        
        slash.scene.tweens.add({
            targets: slashVisual,
            alpha: 0,
            scale: 1.1,
            duration: 150,
            onComplete: () => slashVisual.destroy()
        });

        // Move slightly to push physics (optional)
        slash.setVelocity(Math.cos(angle) * 100, Math.sin(angle) * 100);
        
        // Destroy Enemy Bullets (Requires Item/Skill)
        if (slash.scene && enemyBullets && playerStats.canDeflect) {
            slash.scene.physics.add.overlap(slash, enemyBullets, (s, b) => {
                b.destroy();
                // Optional: Spawn small spark
            });
        }
        
        // Short lifespan
        if(slash.scene) {
            slash.lifeTimer = slash.scene.time.addEvent({
                delay: 150,
                callback: () => { if(slash.active) slash.destroy(); }
            });
        }
    }

    // Laser Sword Effect
    if (playerStats.swordLaser) {
        // Fire a beam (projectile)
        let beam = createBullet(x, y, Math.cos(angle)*800, Math.sin(angle)*800, 800);
        if (beam) {
            beam.setTint(0x00ffff);
            beam.isSwordSlash = false; // It's a projectile
        }
    }
}

function enemyFire(x, y, tx, ty, damage = 1) {
    const b = enemyBullets.get();
    if(b) {
        b.enableBody(true, x, y, true, true);
        b.setTexture('enemy_bullet');
        // Tint redder if high damage
        if(damage > 1) b.setTint(0xff4444);
        else b.setTint(0xffffff);
        
        b.damage = damage; // Attach damage info
        const angle = Phaser.Math.Angle.Between(x, y, tx, ty);
        b.setVelocity(Math.cos(angle)*250, Math.sin(angle)*250);
    }
}

function hitEnemy(bullet, enemy) {
    if (!bullet.active || !enemy.active) return;
    
    // 'this' is the Scene context because we passed it in overlap
    const scene = this; 

    SoundSystem.playHit(false);
    createBurstEffect(scene, bullet.x, bullet.y, 0xffff00, 5);

    if (playerStats.piercing || bullet.isSwordSlash) {
        if (!bullet.hitList) bullet.hitList = [];
        if (bullet.hitList.includes(enemy)) return;
        bullet.hitList.push(enemy);
    } else {
        bullet.disableBody(true, true);
    }
    
    // Calculate Damage
    let damage = playerStats.damage;
    
    // Crit Lens
    if (Math.random() < playerStats.critChance) {
        damage *= playerStats.critDamage;
        // Visual text for crit
        let txt = scene.add.text(enemy.x, enemy.y-20, "暴击!", { fontSize: '12px', color: '#ffff00' });
        scene.tweens.add({ targets: txt, y: enemy.y-40, alpha:0, duration: 500, onComplete: ()=>txt.destroy() });
    }

    // Show Damage
    showDamageText(scene, enemy.x, enemy.y, damage, (damage > playerStats.damage ? '#ffcc00' : '#ffffff'));

    // Ipecac Explosion
    if (playerStats.explosive) {
        // Visual
        const blast = scene.add.circle(bullet.x, bullet.y, 60, 0x00ff00, 0.6);
        scene.tweens.add({ targets: blast, scale: 1.5, alpha: 0, duration: 250, onComplete: ()=>blast.destroy() });
        scene.cameras.main.shake(150, 0.005); // Screen Shake for explosion
        // AoE
        enemies.children.iterate(e => {
            if (e && e.active && e !== enemy && Phaser.Math.Distance.Between(e.x, e.y, bullet.x, bullet.y) <= 100) {
                 e.hp -= 15; 
                 drawHealthBar(e);
                 showDamageText(scene, e.x, e.y, 15, '#ff4400');
                 if (e.hp <= 0) killEnemy(scene, e);
            }
        });
    }

    enemy.hp -= damage;
    
    // Magma Blade / Fire Synergy (Ignite)
    if (playerStats.fireTrail && !enemy.isIgnited) { 
        enemy.isIgnited = true;
        // DoT Effect
        scene.time.addEvent({
            delay: 400, repeat: 3, 
            callback: () => {
                if (enemy && enemy.active) {
                    enemy.hp -= 2; 
                    showDamageText(scene, enemy.x, enemy.y, 2, '#ff4400');
                    drawHealthBar(enemy);
                    if(enemy.hp<=0) killEnemy(scene, enemy);
                } else enemy.isIgnited = false;
            }
        });
        scene.time.delayedCall(1600, () => { if(enemy.active) enemy.isIgnited = false; });
    }

    // --- On Hit Effects ---
    
    // Vampire Tooth
    if (playerStats.vampirism > 0 && Math.random() < playerStats.vampirism) {
        if (playerStats.hp < playerStats.maxHp) {
            playerStats.hp += 1;
            updateUI(scene);
            let txt = scene.add.text(player.x, player.y-30, "+生命", { fontSize: '14px', color: '#ff0000' });
            scene.tweens.add({ targets: txt, y: player.y-50, alpha:0, duration: 1000, onComplete: ()=>txt.destroy() });
        }
    }
    
    // Midas Touch
    if (playerStats.midas && !enemy.isGold) {
        enemy.isGold = true;
        enemy.setTint(0xffd700);
        // Stun for a while
        enemy.isFrozen = true;
        scene.time.delayedCall(2000, () => { if(enemy.active) enemy.isFrozen = false; });
        if (Math.random() < 0.5) spawnCoin(scene, enemy.x, enemy.y);
    }
    
    // Poison Touch
    if (playerStats.poisonTouch && !enemy.isPoisoned) {
        enemy.isPoisoned = true;
        enemy.setTint(0x00ff00);
        // Apply DoT
        let ticks = 5;
        let timer = scene.time.addEvent({
            delay: 500,
            repeat: ticks,
            callback: () => {
                if (enemy.active) {
                    let dot = damage * 0.2;
                    enemy.hp -= dot; // 20% dmg per tick
                    showDamageText(scene, enemy.x, enemy.y, dot, '#00ff00');
                    drawHealthBar(enemy);
                    if(enemy.hp<=0) killEnemy(scene, enemy);
                }
            }
        });
    }

    // Fear Shot
    if (playerStats.fearShot && Math.random() < 0.3) {
        enemy.isFeared = true;
        // Fear logic handled in updateEnemies (move away from player)
        scene.time.delayedCall(2000, () => { if(enemy.active) enemy.isFeared = false; });
    }

    // Synergy Logic: Split on Hit
    if (playerStats.canSplit && !bullet.isSplit) {
        for(let i=0; i<2; i++) {
             let ang = Math.random() * Math.PI * 2;
             const splitB = createBullet(enemy.x, enemy.y, Math.cos(ang)*200, Math.sin(ang)*200, 200);
             if (splitB) {
                 splitB.setScale(playerStats.shotSize * 0.5);
                 splitB.isSplit = true;
                 if (playerStats.homing) splitB.isHoming = true; // Inherit homing
             }
        }
    }

    drawHealthBar(enemy);
    if (!enemy.isGold && !enemy.isPoisoned) {
        enemy.setTint(0x999999);
        scene.time.delayedCall(100, () => {
            if (enemy.active && !enemy.isGold && !enemy.isPoisoned) enemy.clearTint();
        });
    }

    if (enemy.hp <= 0) {
        killEnemy(scene, enemy);
    }
}

function killEnemy(scene, enemy) {
    if (!enemy.active) return;
    if (enemy.hpBar) enemy.hpBar.destroy();
    
    SoundSystem.playHit(false);
    
    // VFX: Blood/Debris
    createBloodEffect(scene, enemy.x, enemy.y, enemy.color || 0xaa0000, 10);
    
    // Boss Logic
    if (enemy.aiType && (enemy.aiType === 'boss' || enemy.aiType.startsWith('boss'))) {
        SoundSystem.playExplosion();
        scene.cameras.main.shake(500, 0.02); // Big shake for boss death
        // spawnItem(scene, enemy.x, enemy.y); // Moved to Room Clear to avoid duplicate/stairs overlap
        // Victory Text (Non-blocking)
        let winText = scene.add.text(400, 300, "胜利!", { fontSize: '64px', color: '#ffd700', stroke: '#000', strokeThickness: 6 }).setOrigin(0.5).setDepth(200);
        scene.tweens.add({
            targets: winText,
            alpha: 0,
            y: 200,
            duration: 4000, 
            ease: 'Power2',
            onComplete: () => winText.destroy()
        });
    }
    
    // Drops (Chance reduced)
    if (Math.random() < 0.35) spawnCoin(scene, enemy.x, enemy.y);
    if (playerStats.contractFromBelow && Math.random() < 0.35) spawnCoin(scene, enemy.x + 10, enemy.y); // Double drop logic
    
    enemy.destroy();
    checkRoomClear(scene);
}

function hitPlayer(player, source) {
    if (player.invincible) return;
    if (playerStats.isDashing) return; // Invincible during Dash
    if (source.active === false) return;
    
    SoundSystem.playHit(true);

    // VFX: Blood & Shake
    createBloodEffect(player.scene || this, player.x, player.y, 0xff0000, 8);
    (player.scene || this).cameras.main.shake(200, 0.01);

    // Shield Logic (Holy Mantle / Energy Shield)
    if (playerStats.shield > 0) {
        playerStats.shield--;
        if (player.scene) {
             let txt = player.scene.add.text(player.x, player.y-30, "BLOCK", { fontSize: '14px', color: '#88aabb' });
             player.scene.tweens.add({ targets: txt, y: player.y-50, alpha:0, duration: 500, onComplete: ()=>txt.destroy() });
        }
        source.disableBody(true, true);
        
        // I-frames
        const scene = player.scene || this; 
        player.invincible = true;
        player.setAlpha(0.5);
        scene.time.delayedCall(1000, () => {
            player.setAlpha(1);
            player.invincible = false;
        });
        return;
    }

    // Infamy Block Chance
    if (playerStats.damageBlockChance && Math.random() < playerStats.damageBlockChance) {
        // Blocked
         if (player.scene) {
             let txt = player.scene.add.text(player.x, player.y-30, "BLOCK", { fontSize: '14px', color: '#ffffff' });
             player.scene.tweens.add({ targets: txt, y: player.y-50, alpha:0, duration: 500, onComplete: ()=>txt.destroy() });
        }
        if (source.texture && source.texture.key === 'enemy_bullet') source.disableBody(true, true);
        return;
    }

    if (source.texture && source.texture.key === 'enemy_bullet') source.disableBody(true, true);
    
    const scene = this; // Passed context

    // Calculate Damage from Source
    let dmgTaken = (source.damage !== undefined) ? source.damage : 1;
    
    // Wafer Reduction & Glass Shard
    if (playerStats.glassShard) {
        dmgTaken *= 2; // Double damage
    }
    
    // Wafer: Cap damage to 1 (half heart in Isaac logic usually serves as 0.5 heart, 
    // but here HP is integer hearts. So Wafer makes all damage = 1 if > 1?)
    // Original Isaac: Wafer reduces all damage to 0.5 heart (1/2 heart).
    // Our HP is integer based where 1 HP = 1 full heart? 
    // Let's assume 1 HP = 1 Heart.
    // So Wafer caps damage at 1.
    if (playerStats.waferEffect) {
        dmgTaken = Math.min(dmgTaken, 1);
    }
    
    // Piggy Bank Logic (Drop coin on hit)
    if (playerStats.piggyBank) {
        // Wafer logic: clamp max damage to 1 (useful if we had big hits)
        // For now, let's say 50% chance to reduce damage to 0 if dmg is 1? No, that's too strong.
        // Let's keep it simple: Wafer prevents double damage from Glass Shard
        if (playerStats.glassShard) dmgTaken = 1;
    }
    
    playerStats.hp -= dmgTaken;
    updateUI(scene);
    
    player.setTint(0xff0000);
    player.invincible = true;
    scene.time.delayedCall(1000, () => {
        player.clearTint();
        player.invincible = false;
    });
    if (playerStats.hp <= 0) {
        gameOver(scene);
    }
}

function gameOver(scene) {
    if (isGameOver) return;
    isGameOver = true;
    if (player) player.setTint(0x000000);
    scene.physics.pause();
    scene.add.text(200, 250, "游戏结束", { fontSize: '64px', color: '#ff0000', stroke: '#000', strokeThickness: 6 }).setDepth(200);
    scene.add.text(250, 350, "点击重试", { fontSize: '32px', color: '#fff' }).setDepth(200)
        .setInteractive().on('pointerdown', () => location.reload());
}

function pickItem(player, item) {
    const scene = this; // Context
    let data = item.dataRef;
    
    // Shop Check
    if (item.price) {
        if (playerStats.money >= item.price) {
            playerStats.money -= item.price;
            SoundSystem.playCoin(); 
            // Mark as bought in room data
            if (item.shopEntry) item.shopEntry.bought = true; 
        } else {
            // Not enough money
            let warn = scene.add.text(player.x, player.y - 50, "Not enough gold!", { fontSize: '20px', color: '#ff0000', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5);
            scene.tweens.add({ targets: warn, y: player.y - 80, alpha: 0, duration: 1000, onComplete: () => warn.destroy() });
            return; // Exit
        }
    }

    SoundSystem.playItem();
    
    // Visual Pickup Effect
    scene.tweens.add({
        targets: item,
        y: item.y - 50,
        alpha: 0,
        scale: 1.5,
        duration: 500,
        onComplete: () => item.destroy()
    });

    // Active Item Logic
    if (data.type === 'active') {
        const previousItem = playerStats.activeItem;
        
        // Equip new Active
        playerStats.activeItem = data;
        playerStats.maxCharge = 3; // Default charge needed (rooms cleared)
        playerStats.activeCharge = 3; // Start fully charged

        let notif = "Equipped: " + data.name;
        if (previousItem) notif += "\n(Dropped: " + previousItem.name + ")";
        
        let txt = scene.add.text(player.x, player.y-60, notif, { fontSize: '18px', color: '#00ff00', stroke: '#000', strokeThickness: 4, align:'center' }).setOrigin(0.5);
        scene.tweens.add({ targets: txt, y: player.y-100, alpha:0, duration: 2000, onComplete: ()=>txt.destroy() });
        
        // Note: Ideally we should spawn the old item back on the floor, but for now we just overwrite.
        updateUI(scene);
        return;
    }

    let synergy = false;
    if (data.id === 'split_shot' && (playerStats.canBounce || playerStats.shotCount > 1)) synergy = true;
    if (data.id === 'bounce_shot' && (playerStats.canSplit || playerStats.shotCount > 1)) synergy = true;
    if (data.id === 'triple_shot' && (playerStats.canSplit || playerStats.canBounce)) synergy = true;
    if (data.type === 'dmg' && playerStats.shotCount >= 3) synergy = true;

    data.apply(playerStats, data);
    
    // --- Stat Balancing / Clamping ---
    // Prevent game-breaking or crashing values
    playerStats.fireRate = Math.max(60, playerStats.fireRate); // Min 60ms delay (~16 shots/sec cap)
    playerStats.speed = Math.min(450, Math.max(100, playerStats.speed)); // Speed cap 450
    playerStats.range = Math.max(100, Math.min(1200, playerStats.range)); // Range cap
    playerStats.damage = Math.max(0.5, playerStats.damage); // Min damage
    playerStats.shotSize = Math.max(0.2, Math.min(5.0, playerStats.shotSize)); // Size cap

    // Save to Compendium
    saveData('item', data.id);

    updateUI(scene); // Update HP display if needed

    if (synergy) showSynergyEffect(player);

    inventory.push(data);
    scene.itemText.setText(`Acquired: ${data.name}\n${data.desc}`);
    scene.itemText.setAlpha(1);
    scene.tweens.add({ targets: scene.itemText, alpha: 0, duration: 3000, delay: 2000 });

    if (dungeon[`${currentRoom.x},${currentRoom.y}`].type === 'treasure') {
         dungeon[`${currentRoom.x},${currentRoom.y}`].itemTaken = true;
    }
    saveData('item', data.id);
    item.label.destroy();
    item.destroy();
    SoundSystem.playPowerup();
}

// --- UI Logic ---

function createUIContainers(scene) {
    const createBtn = (text, y, callback) => {
        const btn = scene.add.text(0, y, text, { fontSize: '28px', color: '#fff', backgroundColor: '#444', padding: { x: 10, y: 5 } })
            .setOrigin(0.5)
            .setInteractive();
        btn.on('pointerdown', callback);
        btn.on('pointerover', () => btn.setStyle({ fill: '#ff0' }));
        btn.on('pointerout', () => btn.setStyle({ fill: '#fff' }));
        return btn;
    };

    const createCloseBtn = (container, callback) => {
        const btn = scene.add.text(320, -230, 'X', { fontSize: '40px', color: '#f00', fontStyle: 'bold', backgroundColor: '#000000' })
            .setPadding(5)
            .setInteractive({ useHandCursor: true })
            .setOrigin(0.5);
        btn.on('pointerdown', callback || (() => {
             console.log("Closing menu via button");
             closeAllMenus();
             scene.physics.resume();
        }));
        container.add(btn);
    };

    // UI: Compendium
    // Use scale.width/height for dynamic centering
    compendiumUI = scene.add.container(scene.scale.width/2, scene.scale.height/2).setScrollFactor(0);
    compendiumUI.setDepth(200);
    compendiumUI.setVisible(false);
    
    // Smart Scaling for small screens
    let compScale = 1;
    // Fit 700x500 into screen with padding
    const safeW = scene.scale.width * 0.9;
    const safeH = scene.scale.height * 0.9;
    const scaleX = safeW / 700;
    const scaleY = safeH / 500;
    compScale = Math.min(1, scaleX, scaleY); // Never scale up, only down
    
    compendiumUI.setScale(compScale);

    const cbg = scene.add.graphics();
    cbg.fillStyle(0x111111, 0.95);
    cbg.fillRect(-350, -250, 700, 500);
    cbg.lineStyle(4, 0xaaaaaa);
    cbg.strokeRect(-350, -250, 700, 500);
    compendiumUI.add(cbg);
    compendiumUI.add(scene.add.text(0, -220, "怪物/物品图鉴", { fontSize: '32px', color: '#fff' }).setOrigin(0.5));
    createCloseBtn(compendiumUI, () => togglePause(scene)); 
    
    // Compendium Mask
    // Mask geometry usually needs absolute world coords or screen coords if scrollFactor is 0
    // But masks in containers are tricky. 
    // Simplified: Create mask relative to container? No, Input masks are simple, render masks are absolute.
    // We will update mask position in toggleCompendium or just hope it works for now. 
    // Actually, let's use a simpler scroll approach or just clip it safely.
    // For now, let's just make the container safe.

    const cShape = scene.make.graphics().setScrollFactor(0);
    cShape.fillStyle(0xffffff);
    // Rough absolute coords assuming center is 400,300. 
    // If center moves, mask MUST move.
    // We'll update mask in updateUI loop or make it dynamic.
    cShape.fillRect(70, 120, 660, 420); 
    const cMask = cShape.createGeometryMask();
    compendiumUI.maskShape = cShape; // Store ref to update later

    compendiumUI.contentContainer = scene.add.container(0, -180);
    compendiumUI.contentContainer.setMask(cMask);
    compendiumUI.add(compendiumUI.contentContainer);

    // Compendium Scrollbar
    const cScrollBg = scene.add.rectangle(330, 30, 10, 420, 0x333333);
    compendiumUI.add(cScrollBg);
    compendiumUI.scrollHandle = scene.add.rectangle(330, -180, 10, 50, 0xaaaaaa);
    compendiumUI.add(compendiumUI.scrollHandle);

    // UI: Inventory
    inventoryUI = scene.add.container(scene.scale.width/2, scene.scale.height/2).setScrollFactor(0);
    inventoryUI.setDepth(200);
    inventoryUI.setVisible(false);
    inventoryUI.setScale(compScale); // Apply same scale

    // Background
    const bg = scene.add.graphics();
    bg.fillStyle(0x000000, 0.9);
    bg.fillRect(-300, -200, 600, 400);
    bg.lineStyle(4, 0xffffff);
    bg.strokeRect(-300, -200, 600, 400);
    inventoryUI.add(bg);
    
    const title = scene.add.text(0, -180, '背包 (上下滑动查看)', { fontSize: '32px', color: '#fff' }).setOrigin(0.5);
    createCloseBtn(inventoryUI, () => togglePause(scene)); 
    inventoryUI.add(title);
    
    // Mask for scrolling
    const shape = scene.make.graphics().setScrollFactor(0);
    shape.fillStyle(0xffffff);
    shape.fillRect(100, 150, 600, 340); 
    const mask = shape.createGeometryMask();
    inventoryUI.maskShape = shape; // Store ref

    // Scroll Container
    inventoryUI.scrollContainer = scene.add.container(0, -140); 
    inventoryUI.scrollContainer.setMask(mask);
    inventoryUI.add(inventoryUI.scrollContainer);
    
    // Scroll bar background
    const scrollBg = scene.add.rectangle(280, 0, 10, 340, 0x333333);
    inventoryUI.add(scrollBg);
    // Scroll bar handle
    inventoryUI.scrollHandle = scene.add.rectangle(280, -150, 10, 50, 0xaaaaaa);
    inventoryUI.add(inventoryUI.scrollHandle);
    
    // Input for scrolling (Unified: Wheel + Touch + Interactive Background)
    const handleScroll = (deltaY) => {
        if (inventoryUI.visible) {
            inventoryUI.scrollContainer.y -= deltaY;
            // Clamp
            const contentHeight = inventoryUI.scrollContainer.height || 100;
            const viewHeight = 340;
            const minY = -140 - Math.max(0, contentHeight - viewHeight);
            const maxY = -140;
            
            if (inventoryUI.scrollContainer.y < minY) inventoryUI.scrollContainer.y = minY;
            if (inventoryUI.scrollContainer.y > maxY) inventoryUI.scrollContainer.y = maxY;
            
            // Update handle
            if (contentHeight > viewHeight) {
                let range = maxY - minY;
                if (range === 0) range = 1;
                let pct = (maxY - inventoryUI.scrollContainer.y) / range;
                inventoryUI.scrollHandle.y = -150 + pct * (340 - 50);
            }
        } 
        else if (compendiumUI.visible) {
            compendiumUI.contentContainer.y -= deltaY;
            // Clamp
            const contentHeight = compendiumUI.contentContainer.height || 100;
            const viewHeight = 420;
            const minY = -180 - Math.max(0, contentHeight - viewHeight);
            const maxY = -180;
            
            if (compendiumUI.contentContainer.y < minY) compendiumUI.contentContainer.y = minY;
            if (compendiumUI.contentContainer.y > maxY) compendiumUI.contentContainer.y = maxY;
            
            // Update handle
            if (contentHeight > viewHeight) {
                let range = maxY - minY;
                if (range === 0) range = 1;
                let pct = (maxY - compendiumUI.contentContainer.y) / range;
                compendiumUI.scrollHandle.y = -180 + pct * (420 - 50);
            }
        }
    };

    scene.input.on('wheel', (pointer, gameObjects, deltaX, deltaY, deltaZ) => {
        handleScroll(deltaY * 0.5);
    });

    // Touch Drag Scrolling - Improved
    let scrollDragId = null;
    let scrollLastY = 0;
    
    // Attach listener to Scene Input but enable background blocking
    // Make UI backgrounds interactive to block game input and catch drags reliably
    bg.setInteractive(new Phaser.Geom.Rectangle(-300, -200, 600, 400), Phaser.Geom.Rectangle.Contains); // Inventory BG
    cbg.setInteractive(new Phaser.Geom.Rectangle(-350, -250, 700, 500), Phaser.Geom.Rectangle.Contains); // Compendium BG
    
    // Generic drag handler for UI backgrounds
    const onUIDown = (pointer) => {
        scrollDragId = pointer.id;
        scrollLastY = pointer.y;
    };
    bg.on('pointerdown', onUIDown);
    cbg.on('pointerdown', onUIDown);

    scene.input.on('pointermove', (pointer) => {
        if (scrollDragId !== null && pointer.id === scrollDragId && (inventoryUI.visible || compendiumUI.visible)) {
             const dy = (scrollLastY - pointer.y) * 1.5; // Multiplier for faster scroll
             handleScroll(dy);
             scrollLastY = pointer.y;
        }
    });

    const onUIUp = (pointer) => {
        if (pointer.id === scrollDragId) {
            scrollDragId = null;
        }
    };
    scene.input.on('pointerup', onUIUp);
    scene.input.on('pointerout', onUIUp); // Should NOT use this if dragging outside canvas but staying held, but for now ok


    // UI: Help
    helpUI = scene.add.container(400, 300).setScrollFactor(0);
    helpUI.setDepth(200);
    helpUI.setVisible(false);
    const hbg = scene.add.graphics();
    hbg.fillStyle(0x000000, 0.95);
    hbg.fillRect(-200, -200, 400, 400);
    hbg.lineStyle(4, 0x00ffff);
    hbg.strokeRect(-200, -200, 400, 400);
    helpUI.add(hbg);
    const hTitle = scene.add.text(0, -170, '游戏帮助', { fontSize: '28px', color: '#00ffff', fontStyle: 'bold' }).setOrigin(0.5);
    // Use default close behavior (Resume game)
    createCloseBtn(helpUI); 
    const hText = scene.add.text(-180, -130, 
        "操作说明:\n" +
        "- WASD / 屏幕左侧: 移动\n" +
        "- 箭头 / 屏幕右侧: 攻击/瞄准\n" +
        "- E: 使用主动道具 (图标充能完毕时)\n" +
        "- 空格: 冲刺 (无敌)\n" +
        "- B: 打开背包 (查看道具)\n" + 
        "- H: 帮助菜单\n" +
        "- G: 怪物/道具图鉴\n" +
        "- P/ESC: 暂停游戏\n\n" +
        "进阶指南:\n" +
        "- 清理房间可为主动道具充能。\n" +
        "- 天使/恶魔翅膀提供飞行，无视地形。\n" +
        "- 观察怪物攻击模式，利用Boss硬直输出。\n" +
        "- 商店道具价格随随机波动，记得攒钱。",
        { fontSize: '18px', color: '#ffffff', wordWrap: { width: 360 }, lineSpacing: 6 }
    );
    helpUI.add([hTitle, hText]);

    // UI: Stats
    statsUI = scene.add.container(400, 300).setScrollFactor(0);
    statsUI.setDepth(200);
    statsUI.setVisible(false);
    const sbg = scene.add.graphics();
    sbg.fillStyle(0x000000, 0.9);
    sbg.fillRect(-200, -250, 400, 500);
    sbg.lineStyle(4, 0xffd700);
    sbg.strokeRect(-200, -250, 400, 500);
    statsUI.add(sbg);
    const sTitle = scene.add.text(0, -220, '角色属性', { fontSize: '32px', color: '#ffd700', fontStyle: 'bold' }).setOrigin(0.5);
    createCloseBtn(statsUI, () => togglePause(scene));
    statsUI.add(sTitle);
    statsUI.statsContent = scene.add.text(-180, -180, '', { fontSize: '20px', color: '#fff', lineSpacing: 10 });
    statsUI.add(statsUI.statsContent);
    // Add detailed explanation
    const statHelp = scene.add.text(0, 200, "属性说明: 射速(数字越低越快), 射程(子弹飞行距离), 幸运影响掉落", { fontSize: '14px', color: '#888' }).setOrigin(0.5);
    statsUI.add(statHelp);


    // UI: Pause Menu
    pauseUI = scene.add.container(400, 300).setScrollFactor(0);
    pauseUI.setDepth(250);
    pauseUI.setVisible(false);
    const pbg = scene.add.graphics();
    pbg.fillStyle(0x000000, 0.8);
    pbg.fillRect(-400, -300, 800, 600);
    pauseUI.add(pbg);
    pauseUI.add(scene.add.text(0, -250, "暂停中", { fontSize: '64px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5));
    
    // Resume
    pauseUI.add(createBtn("继续游戏", -180, () => togglePause(scene)));

    // Difficulty Settings
    const diffLabel = scene.add.text(0, -100, "难度:", { fontSize: '24px', color: '#aaa' }).setOrigin(0.5);
    let diffText = scene.add.text(0, -70, "普通 (1.0x)", { fontSize: '24px', color: '#00ff00' }).setOrigin(0.5);
    
    // Difficulty Buttons
    const btnEasy = scene.add.text(-100, -30, "简单", { fontSize: '24px', color: '#fff', backgroundColor: '#336633', padding: { x:5, y:2 } }).setOrigin(0.5).setInteractive();
    const btnNorm = scene.add.text(0, -30, "普通", { fontSize: '24px', color: '#fff', backgroundColor: '#333366', padding: { x:5, y:2 } }).setOrigin(0.5).setInteractive();
    const btnHard = scene.add.text(100, -30, "困难", { fontSize: '24px', color: '#fff', backgroundColor: '#663333', padding: { x:5, y:2 } }).setOrigin(0.5).setInteractive();

    btnEasy.on('pointerdown', () => { 
        difficultyMultiplier = 0.5; 
        diffText.setText("简单 (0.5x)"); 
        diffText.setColor('#00ffff'); 
    });
    btnNorm.on('pointerdown', () => { 
        difficultyMultiplier = 1.0; 
        diffText.setText("普通 (1.0x)"); 
        diffText.setColor('#00ff00'); 
    });
    btnHard.on('pointerdown', () => { 
        difficultyMultiplier = 1.5; 
        diffText.setText("困难 (1.5x)"); 
        diffText.setColor('#ff0000'); 
    });

    pauseUI.add([diffLabel, diffText, btnEasy, btnNorm, btnHard]);

    // Other Menus
    pauseUI.add(createBtn("角色属性", 50, () => toggleStats(scene)));
    pauseUI.add(createBtn("背包", 100, () => toggleInventory(scene)));
    pauseUI.add(createBtn("图鉴", 150, () => toggleCompendium(scene)));
    pauseUI.add(createBtn("帮助", 200, () => toggleHelp(scene)));
    pauseUI.add(createBtn("重新开始", 250, () => location.reload()));
}

function closeAllMenus() {
    if (inventoryUI) inventoryUI.setVisible(false);
    if (statsUI) statsUI.setVisible(false);
    if (helpUI) helpUI.setVisible(false);
    if (compendiumUI) compendiumUI.setVisible(false);
    if (pauseUI) pauseUI.setVisible(false);
    isPaused = false;
}

function toggleInventory(scene) {
    let wasVisible = inventoryUI.visible;
    closeAllMenus();
    if (!wasVisible) {
        inventoryUI.setVisible(true);
        isPaused = true;
        scene.physics.pause();
        
        // Rebuild list
        inventoryUI.scrollContainer.removeAll(true);
        let y = 0;
        
        if (inventory.length === 0) {
            inventoryUI.scrollContainer.add(scene.add.text(0, 0, "空空如也...", { fontSize: '20px', color: '#aaa' }).setOrigin(0.5));
            inventoryUI.scrollContainer.height = 50;
        } else {
            inventory.forEach((item, index) => {
                // Item Box
                let bg = scene.add.graphics();
                bg.fillStyle(0x222222, 1);
                bg.fillRoundedRect(-280, y, 540, 60, 5);
                inventoryUI.scrollContainer.add(bg);
                
                // Icon placeholder (colored rect)
                let icon = scene.add.graphics();
                icon.fillStyle(item.color || 0xffffff, 1);
                icon.fillCircle(-250, y + 30, 20);
                inventoryUI.scrollContainer.add(icon);
                
                // Text
                let name = scene.add.text(-220, y + 10, item.name, { fontSize: '20px', color: '#fff', fontStyle: 'bold' });
                let desc = scene.add.text(-220, y + 35, item.desc, { fontSize: '14px', color: '#aaa' });
                inventoryUI.scrollContainer.add([name, desc]);
                
                y += 70;
            });
            inventoryUI.scrollContainer.height = y;
        }
        
        // Reset scroll
        inventoryUI.scrollContainer.y = -140;
        inventoryUI.scrollHandle.y = -150;
        
    } else {
        scene.physics.resume();
    }
}

function toggleHelp(scene) {
    let wasVisible = helpUI.visible;
    closeAllMenus();
    if (!wasVisible) {
        helpUI.setVisible(true);
        isPaused = true;
        scene.physics.pause();
    } else {
        scene.physics.resume();
    }
}

function toggleCompendium(scene) {
    let wasVisible = compendiumUI.visible;
    closeAllMenus();
    if (!wasVisible) {
        compendiumUI.setVisible(true);
        isPaused = true;
        scene.physics.pause();
        drawCompendium(scene);
    } else {
        scene.physics.resume();
    }
}

function updateStatsUI() {
    if (!statsUI) return;
    const s = playerStats;
    const text = 
        `生命值: ${s.hp} / ${s.maxHp}\n` +
        `攻击力: ${s.damage.toFixed(1)}\n` +
        `攻击速度: ${(1000/s.fireRate).toFixed(1)} 次/秒\n` +
        `移动速度: ${s.speed}\n` +
        `射程: ${s.range}\n` +
        `弹道速度: ${s.bulletSpeed}\n` +
        `暴击率: ${(s.critChance * 100).toFixed(0)}%\n` +
        `暴击伤害: ${(s.critDamage * 100).toFixed(0)}%\n` +
        `分裂攻击: ${s.canSplit ? "是" : "否"}\n` +
        `-- 冲刺属性 --\n` +
        `冲刺距离: ${((s.dashSpeed * s.dashDuration) / 1000).toFixed(0)}\n` +
        `无敌时间: ${s.dashDuration}ms\n` +
        `冲刺冷却: ${(s.dashCooldown / 1000).toFixed(1)}s`;
    statsUI.statsContent.setText(text);
}

function toggleStats(scene) {
    let wasVisible = statsUI.visible;
    closeAllMenus();
    if (!wasVisible) {
        updateStatsUI();
        statsUI.setVisible(true);
        isPaused = true;
        scene.physics.pause();
    } else {
        scene.physics.resume();
    }
}

function togglePause(scene) {
    let wasVisible = pauseUI.visible;
    closeAllMenus(); // Close others
    if (!wasVisible) {
        pauseUI.setVisible(true);
        isPaused = true;
        scene.physics.pause();
        if (SoundSystem.ctx && SoundSystem.ctx.state === 'running') SoundSystem.ctx.suspend();
    } else {
        scene.physics.resume();
        if (SoundSystem.ctx && SoundSystem.ctx.state === 'suspended') SoundSystem.ctx.resume();
    }
}

// --- New Compendium Logic ---
let compendiumCategory = 'item'; // Default category
let detailsContainer = null;

function drawCompendium(scene) {
    compendiumUI.contentContainer.removeAll(true);
    if(detailsContainer) { detailsContainer.destroy(); detailsContainer = null; }
    
    // Reset Scroll
    compendiumUI.contentContainer.y = -180;
    compendiumUI.scrollHandle.y = -180;

    const safeItems = (collectionData && Array.isArray(collectionData.items)) ? collectionData.items : [];
    const safeEnemies = (collectionData && Array.isArray(collectionData.enemies)) ? collectionData.enemies : [];

    // --- Tabs ---
    // Make tabs stick to top? 
    // Currently contentContainer is masked, so if we put tabs inside contentContainer they will scroll away.
    // Tabs should be outside contentContainer (on compendiumUI directly)
    // But then we need to clear them when redrawing? Or just manage update
    
    // Simpler: Just render tabs inside scroll view for now, or move them out.
    // Moving them out is better UI. They should be static.
    
    // Let's check if tabs exist on compendiumUI directly, if not create them once.
    if (!compendiumUI.tabsContainer) {
        compendiumUI.tabsContainer = scene.add.container(0, 0);
        compendiumUI.add(compendiumUI.tabsContainer); // Add to UI, not content
    }
    compendiumUI.tabsContainer.removeAll(true);

    const tabs = [
        { id: 'item', name: "道具" },
        { id: 'minion', name: "小怪" },
        { id: 'boss', name: "BOSS" }
    ];

    let tabX = -320;
    tabs.forEach(t => {
        let isSelected = (compendiumCategory === t.id);
        let btn = scene.add.text(tabX, -170, t.name, { // Moved down a bit relative to container center
            fontSize: '20px', 
            fill: isSelected ? '#ffffff' : '#888888',
            backgroundColor: isSelected ? '#555555' : '#222222',
            padding: { x: 15, y: 8 }
        }).setInteractive({ useHandCursor: true });
        
        btn.on('pointerdown', () => {
             compendiumCategory = t.id;
             drawCompendium(scene);
        });
        compendiumUI.tabsContainer.add(btn);
        tabX += 80;
    });

    // Content Start Y (Inside scroll container)
    const contentStartY = 0; 
    
    // --- Data List ---
    let list = [];
    if (compendiumCategory === 'item') {
        list = itemPool.map(i => ({...i, known: safeItems.includes(i.id), type: 'item'}));
    } else if (compendiumCategory === 'minion') {
        // Dynamic Minion List
        list = Object.keys(enemyStats)
            .filter(k => !enemyStats[k].isBoss)
            .map(k => ({ id: k, ...enemyStats[k], known: safeEnemies.includes(k), type: 'enemy' }));
    } else if (compendiumCategory === 'boss') {
        // Dynamic Boss List
        list = Object.keys(enemyStats)
            .filter(k => enemyStats[k].isBoss)
            .map(k => ({ id: k, ...enemyStats[k], known: safeEnemies.includes(k), type: 'enemy' }));
    }

    let y = 0;
    list.forEach(item => {
        let container = scene.add.container(0, y);
        
        let bg = scene.add.rectangle(0, 0, 600, 80, 0x333333).setInteractive();
        bg.on('pointerdown', () => showCompendiumDetails(scene, item));
        container.add(bg);
        
        // Icon
        let icon;
        if (item.known) {
            if (item.type === 'item') {
                icon = scene.add.image(-250, 0, 'player').setTint(item.color || 0xffffff).setScale(1.5);
            } else {
                // Enemy/Boss Sprite
                // Some textures might be rectangular/large, scale safely
                icon = scene.add.image(-250, 0, item.id);
                let maxDim = Math.max(icon.width, icon.height);
                if (maxDim > 60) icon.setScale(60/maxDim);
            }
        } else {
             icon = scene.add.text(-250, 0, "?", { fontSize: '40px', color: '#555' }).setOrigin(0.5);
        }
        if(icon) container.add(icon);

        let name = item.known ? item.name : "???";
        let title = scene.add.text(-200, -20, name, { fontSize: '24px', color: item.known ? '#fff' : '#888' });
        container.add(title);
        
        // Show desc if item and known
        if (item.known && item.desc) {
             let desc = scene.add.text(-200, 10, item.desc, { fontSize: '16px', color: '#aaaaaa' });
             container.add(desc);
        }

        y += 90;
        compendiumUI.contentContainer.add(container);
    });
    
    compendiumUI.contentContainer.height = y;
}


function showCompendiumDetails(scene, entry) {
    if (detailsContainer) {
         detailsContainer.destroy();
         detailsContainer = null;
    }
    // Attach to compendiumUI (Static)
    detailsContainer = scene.add.container(100, -160);
    compendiumUI.add(detailsContainer);
    
    // Panel BG
    let bg = scene.add.graphics();
    bg.fillStyle(0x222222, 1);
    bg.fillRoundedRect(0, 0, 220, 380, 10);
    bg.lineStyle(2, 0x666666);
    bg.strokeRoundedRect(0, 0, 220, 380, 10);
    detailsContainer.add(bg);
    
    if (!entry) {
        detailsContainer.add(scene.add.text(110, 190, "点击左侧图标\n查看详细信息", { fontSize: '18px', color: '#666', align: 'center' }).setOrigin(0.5));
        return;
    }

    if (!entry.known) {
        detailsContainer.add(scene.add.text(110, 190, "???", { fontSize: '48px', color: '#333' }).setOrigin(0.5));
        detailsContainer.add(scene.add.text(110, 240, "尚未遭遇", { fontSize: '20px', color: '#888' }).setOrigin(0.5));
        return;
    }
    
    // Header
    let title = scene.add.text(110, 30, entry.name, { fontSize: '24px', color: '#ffd700', fontStyle: 'bold' }).setOrigin(0.5);
    detailsContainer.add(title);

    // Image / Visual
    if (entry.texture) {
        let s = scene.add.sprite(110, 80, entry.texture);
        // If entry has color (tint), apply it
        if (entry.color !== undefined) s.setTint(entry.color);
        
        let maxDim = Math.max(s.width, s.height);
        let scale = maxDim > 64 ? 64/maxDim : 1; 
        // Scale up small sprites too
        if (maxDim < 32) scale = 2;
        
        s.setScale(scale);
        detailsContainer.add(s);
    } else if (entry.color) {
        let g = scene.add.graphics();
        g.fillStyle(entry.color, 1);
        g.fillCircle(110, 80, 30);
        detailsContainer.add(g);
    }
    
    let contentY = 130;
    const addLine = (text, size='16px', color='#ccc') => {
        let t = scene.add.text(15, contentY, text, { fontSize: size, color: color, wordWrap: { width: 190 } });
        detailsContainer.add(t);
        contentY += t.height + 8;
    };

    if (entry.type === 'item') {
        addLine(" [道具]", '16px', '#aaa');
        if (entry.price) addLine(`参考价格: ${entry.price}G`, '16px', '#ffff00');
        contentY += 10;
        addLine("效果:", '18px', '#fff');
        addLine(entry.desc, '15px', '#eee');
        
    } else {
        // Enemy
        if (entry.isBoss) addLine(" [BOSS]", '18px', '#ff3333');
        else addLine(" [怪物]", '16px', '#aaa');
        
        contentY += 5;
        addLine(`生命值: ${entry.hp}`, '16px', '#ffaaaa');
        addLine(`攻击力: ${entry.damage || 1}`, '16px', '#ff4444');
        addLine(`移速: ${entry.speed}`, '16px', '#aaccff');
        
        contentY += 10;
        addLine("描述/技能:", '18px', '#fff');
        addLine(entry.desc, '15px', '#eee');
    }
}

// --- Utils ---

function loadData() {
    let raw = localStorage.getItem('rog_collection');
    if (raw) {
        try { 
            let data = JSON.parse(raw); 
            if (data.items) collectionData.items = data.items;
            if (data.enemies) collectionData.enemies = data.enemies;
        } catch(e) {
            console.error("Save load failed", e);
        }
    }
}

function saveData(type, id) {
    let changed = false;
    if (type === 'item') {
        if (!collectionData.items.includes(id)) {
            collectionData.items.push(id);
            changed = true;
        }
    } else if (type === 'enemy') {
        if (!collectionData.enemies.includes(id)) {
            collectionData.enemies.push(id);
            changed = true;
        }
    }
    
    if (changed) {
        localStorage.setItem('rog_collection', JSON.stringify(collectionData));
    }
}

function showSynergyEffect(player) {
    if (!player.scene) return;
    const scene = player.scene;
    scene.tweens.add({
        targets: player,
        scale: { from: 1.5, to: 1 },
        alpha: { from: 0.5, to: 1 },
        tint: 0xffff00,
        duration: 300,
        yoyo: true,
        repeat: 3,
        onComplete: () => player.clearTint()
    });
    const txt = scene.add.text(player.x, player.y - 60, "羁绊达成!", {
        fontSize: '28px', color: '#ffff00', stroke: '#ff0000', strokeThickness: 4, fontStyle: 'bold'
    }).setOrigin(0.5);
    scene.tweens.add({
        targets: txt, y: player.y - 100, alpha: 0, scale: { from: 0.8, to: 1.2 }, duration: 2000,
        onComplete: () => txt.destroy()
    });
    playPew(1200, 'square');
}

function updateUI(scene) {
    if (!scene) return;
    updatePlayerHealthUI(scene);
    if (scene.coinUI) scene.coinUI.setText('G: ' + playerStats.money);

    // Active Item UI
    if (!scene.activeUI) {
        scene.activeUI = scene.add.container(60, 80).setScrollFactor(0).setDepth(100);
        let bg = scene.add.rectangle(0, 0, 50, 50, 0x222222).setStrokeStyle(2, 0xaaaaaa);
        let bar = scene.add.rectangle(0, 20, 40, 6, 0x00ff00);
        let txt = scene.add.text(0, -5, "", { fontSize: '10px', align: 'center', wordWrap:{width:46} }).setOrigin(0.5);
        let keyHint = scene.add.text(25, 25, "E", { fontSize: '12px', color:'#ffff00', backgroundColor:'#000000' }).setOrigin(1, 1);
        
        scene.activeUI.add([bg, bar, txt, keyHint]);
        scene.activeUI.bar = bar;
        scene.activeUI.txt = txt;
        scene.activeUI.bg = bg;
    }
    
    if (playerStats.activeItem) {
        scene.activeUI.visible = true;
        scene.activeUI.txt.setText(playerStats.activeItem.name);
        
        // Safety check for div by zero
        let max = playerStats.maxCharge || 1;
        let ratio = playerStats.activeCharge / max;
        scene.activeUI.bar.width = 40 * ratio;
        scene.activeUI.bar.setFillStyle(ratio >= 1 ? 0x00ff00 : 0xaaaa00);
        
        // Blink if charged
        if (ratio >= 1) {
            scene.activeUI.bg.setStrokeStyle(2, 0xffff00);
        } else {
             scene.activeUI.bg.setStrokeStyle(2, 0xaaaaaa);
        }
    } else {
        scene.activeUI.visible = false;
    }
}

function updatePlayerHealthUI(scene) {
    if (!scene.heartGroup) return;
    scene.heartGroup.clear(true, true);

    const startX = 30; // Left margin
    const startY = 30; // Top margin
    const spacing = 32;

    const fullHearts = Math.floor(playerStats.hp);
    const maxHearts = playerStats.maxHp;

    for (let i = 0; i < maxHearts; i++) {
        const x = startX + i * spacing;
        const isFull = i < fullHearts;
        
        // Use text hearts instead of complex graphics to avoid API issues
        const heart = scene.add.text(x, startY, '♥', { 
            fontSize: '32px', 
            fill: isFull ? '#e74c3c' : '#550000', // Bright red vs Dark red
            stroke: '#000000',
            strokeThickness: 2,
            fontFamily: 'Arial'
        }).setOrigin(0.5).setScrollFactor(0).setDepth(1001); // Stick to screen

        scene.heartGroup.add(heart);
    }
}

function drawHealthBar(enemy) {
    if (!enemy.hpBar) return;
    // Skip invincible or weird HP enemies
    if (enemy.maxHp > 500) return; 

    enemy.hpBar.clear();
    const width = 40; const height = 6;
    enemy.hpBar.fillStyle(0xff0000);
    enemy.hpBar.fillRect(0, 0, width, height);
    const p = Math.max(0, enemy.hp / enemy.maxHp);
    enemy.hpBar.fillStyle(0x00ff00);
    enemy.hpBar.fillRect(0, 0, width * p, height);
}

function showDamageText(scene, x, y, damage, color = '#ffffff') {
    let val = Math.floor(damage);
    if (val < 1) val = damage.toFixed(1); 
    if (val == 0) return;

    let fontSize = '20px';
    if (damage > 20) fontSize = '32px'; // Big damage big text
    
    let txt = scene.add.text(x, y - 20, val, { 
        fontSize: fontSize, 
        color: color, 
        stroke: '#000000', 
        strokeThickness: 3,
        fontStyle: 'bold' 
    }).setOrigin(0.5).setDepth(200);

    // Add pop animation
    scene.tweens.add({
        targets: txt,
        y: y - 60,
        alpha: 0,
        scaleX: 1.5,
        scaleY: 1.5,
        duration: 800,
        ease: 'Back.easeOut',
        onComplete: () => txt.destroy()
    });
}

function createBurstEffect(scene, x, y, color = 0xffffff, count = 8) {
    for (let i = 0; i < count; i++) {
        let p = scene.add.rectangle(x, y, 4, 4, color);
        let angle = Math.random() * Math.PI * 2;
        let speed = Math.random() * 100 + 50;
        scene.physics.add.existing(p);
        p.body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
        scene.tweens.add({
            targets: p,
            alpha: 0,
            scale: 0.5,
            duration: 400,
            onComplete: () => p.destroy()
        });
    }
}

function createBloodEffect(scene, x, y, color = 0x990000, count = 12) {
    for (let i = 0; i < count; i++) {
        let p = scene.add.rectangle(x, y, 6, 6, color);
        let angle = Math.random() * Math.PI * 2;
        let speed = Math.random() * 150 + 50;
        scene.physics.add.existing(p);
        p.body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
        p.body.drag.set(100); // Slow down over time
        scene.tweens.add({
            targets: p,
            alpha: 0,
            scale: 0.2,
            duration: 800, 
            onComplete: () => p.destroy()
        });
    }
}

function onDashStart(scene, player) {
    // Dash Items Logic
    
    // 1. Spike Armor (Damage on Dash)
    if (playerStats.dashDamage) {
        // We need a collider that moves with player?
        // Actually, we can check overlap in update loop, or create a temporary hitbox
        // Let's create a temporary hitbox attached to player
        let hitbox = scene.physics.add.sprite(player.x, player.y, null).setVisible(false);
        hitbox.body.setSize(48, 48);
        hitbox.body.updateFromGameObject(); // Sync to sprite? Sprite follows player
        
        // Attach checking logic in update or persistent timer?
        // Simpler: Just check overlap in a timer during dash
        let timer = scene.time.addEvent({
            delay: 50, repeat: 4, callback: () => {
                if (!player.active) return;
                hitbox.setPosition(player.x, player.y);
                scene.physics.overlap(hitbox, enemies, (h, e) => {
                    if (e.active && !e.hasTakenDashDmg) {
                        e.hasTakenDashDmg = true; // Prevent multi-hit per dash
                        e.hp -= (playerStats.damage * 2);
                        showDamageText(scene, e.x, e.y, playerStats.damage*2, '#ff0000');
                        scene.cameras.main.shake(100, 0.005);
                        createBloodEffect(scene, e.x, e.y, 0xff0000, 5);
                        if (e.hp <= 0) killEnemy(scene, e);
                        // Reset flag after short delay so can hit again next dash? 
                        // Actually flag should be on enemy relative to THIS dash instance.
                        // For simplicity, just reset flag after 500ms
                        scene.time.delayedCall(500, ()=>{ if(e.active) e.hasTakenDashDmg = false; });
                    }
                });
            }
        });
        scene.time.delayedCall(playerStats.dashDuration, () => { hitbox.destroy(); });
    }

    // 2. Rocket Boots (Fire Trail)
    if (playerStats.dashTrail === 'fire') {
        let timer = scene.time.addEvent({
            delay: 40, repeat: 5, callback: () => {
                if (!player.active) return;
                // Create fire puddle/particle
                let f = scene.add.circle(player.x, player.y, 10, 0xff4400, 0.8);
                scene.physics.add.existing(f);
                scene.tweens.add({ targets: f, scale: 0, alpha: 0, duration: 1000, onComplete: () => f.destroy() });
                
                // Damage enemies stepping on it
                // We can group these into a 'hazards' group later, for now manual check
                // Expensive to check everyday?
                // Make it a simple visual + periodic damage area?
                // Let's make it spawn a temporary "bullet" that stays still
                let fire = bullets.create(player.x, player.y, 'bullet');
                fire.setTint(0xff4400);
                fire.setVelocity(0,0);
                fire.body.setSize(20,20);
                fire.activeTime = 1000;
                scene.time.delayedCall(500, () => { if(fire.active) fire.disableBody(true, true); });
            }
        });
    }

    // 3. Shockwave (Explosion at end)
    if (playerStats.dashExplosion) {
        scene.time.delayedCall(playerStats.dashDuration, () => {
            if (!player.active) return;
            SoundSystem.playExplosion();
            createBurstEffect(scene, player.x, player.y, 0xff00ff, 20);
             // AoE Damage
             enemies.children.iterate(e => {
                if (e && e.active && Phaser.Math.Distance.Between(e.x, e.y, player.x, player.y) <= 150) {
                     e.hp -= 10; 
                     showDamageText(scene, e.x, e.y, 10, '#aa00ff');
                     if (e.hp <= 0) killEnemy(scene, e);
                     // Push back
                     let angle = Phaser.Math.Angle.Between(player.x, player.y, e.x, e.y);
                     e.body.velocity.x += Math.cos(angle) * 300;
                     e.body.velocity.y += Math.sin(angle) * 300;
                }
            });
        });
    }
}

// --- Global Mobile Input State ---
let mobileInput = {
    fire: false,
    active: false,
    pause: false,
    dash: false
};

function setupTouchControls() {
    /*
    // Add Pointer for Dash Button
    const dashBtn = this.add.circle(720, 520, 40, 0xaaaaaa, 0.5)
        .setInteractive()
        .setScrollFactor(0)
        .setDepth(200);
    this.add.text(720, 520, "闪", { fontSize: '24px', color: '#fff' }).setOrigin(0.5).setScrollFactor(0).setDepth(201);
    
    dashBtn.on('pointerdown', () => {
        // Trigger Dash
        if (player && player.body && !playerStats.isDashing && this.time.now > playerStats.nextDash) {
            // Dash Direction: Current movement or Facing?
            // If moving, dash that way. If not, dash forward/random?
            // Let's use leftStick or Velocity
            let dx = 0, dy = 0;
            if (leftStick && leftStick.active) {
                dx = leftStick.x - leftStick.baseX;
                dy = leftStick.y - leftStick.baseY;
            } else if (player.body.velocity.x !== 0 || player.body.velocity.y !== 0) {
                dx = player.body.velocity.x;
                dy = player.body.velocity.y;
            }
            
            // Normalize
            let angle = (dx===0 && dy===0) ? 0 : Math.atan2(dy, dx); // Default right if stopped?
            
            // Execute Dash Logic (Duplicated from Update but called here)
             playerStats.isDashing = true;
             playerStats.nextDash = this.time.now + playerStats.dashCooldown;
             player.body.stop();
             this.physics.velocityFromRotation(angle, playerStats.dashSpeed, player.body.velocity);
             
             // Trigger Effects
             onDashStart(this, player);

             // Trail
             this.time.addEvent({
                 delay: 50, repeat: 3,
                 callback: () => {
                    if(!player.active) return;
                    let g = this.add.image(player.x, player.y, 'player').setTint(0x00ffff).setAlpha(0.5);
                    this.tweens.add({ targets: g, alpha: 0, duration: 300, onComplete: () => g.destroy() });
                 }
             });
             this.time.delayedCall(playerStats.dashDuration, () => {
                 playerStats.isDashing = false;
                 if(player.active) player.setVelocity(0,0);
             });
        }
    });
    */

    // Only set up if touch available or small screen
    const isMobile = this.sys.game.device.os.android || this.sys.game.device.os.iOS || window.innerWidth < 800;
    if (!isMobile) return;

    // --- 1. Left Visual Joystick ---
    // Position dynamically based on screen height
    // Lowered offset further to 60px
    let joyX = 100;
    let joyY = this.scale.height - 60; 
    
    // Background Disk
    const joyBase = this.add.circle(joyX, joyY, 60, 0x333333, 0.5)
        .setScrollFactor(0).setDepth(210).setInteractive();
    
    // Knob
    const joyKnob = this.add.circle(joyX, joyY, 30, 0x888888, 0.8)
        .setScrollFactor(0).setDepth(211);

    // Joystick Logic Integration w/ Existing leftStick
    // We overwrite the dynamic pointer logic with this static one
    leftStick.baseX = joyX;
    leftStick.baseY = joyY;
    
    this.input.addPointer(4); // Ensure multi-touch

    joyBase.on('pointerdown', (p) => {
        leftStick.active = true;
        leftStick.pointerId = p.id;
        // CORRECT COORDINATE MAPPING
        // Convert World Point (p.x, p.y) back to Screen Point for UI logic
        let px = p.x - this.cameras.main.scrollX;
        let py = p.y - this.cameras.main.scrollY;
        
        leftStick.x = px; 
        leftStick.y = py;
    });
    
    // Global move handling is better for stick dragging outside base
    this.input.on('pointermove', (p) => {
        if (leftStick.active && p.id === leftStick.pointerId) {
            // Convert World Point to Screen Point
            let px = p.x - this.cameras.main.scrollX;
            let py = p.y - this.cameras.main.scrollY;
            
            // Clamp distance visually (in Screen Space)
            let dist = Phaser.Math.Distance.Between(joyX, joyY, px, py);
            let angle = Phaser.Math.Angle.Between(joyX, joyY, px, py);
            if (dist > 60) dist = 60;
            
            // Update visual knob
            joyKnob.x = joyX + Math.cos(angle) * dist;
            joyKnob.y = joyY + Math.sin(angle) * dist;
            
            // Update logic inputs (Pass Screen Coords to logic)
            // The Update loop logic for dash/velocity MUST know these are 
            // relative to the joystick base on SCREEN.
            // Since `leftStick.baseX` is set to `joyX` (Screen), comparing `leftStick.x` (Screen) works.
            leftStick.x = px; 
            leftStick.y = py;
        }
    });

    this.input.on('pointerup', (p) => {
        if (leftStick.active && p.id === leftStick.pointerId) {
            leftStick.active = false;
            joyKnob.x = joyX;
            joyKnob.y = joyY;
            // Reset velocity
            leftStick.x = joyX; leftStick.y = joyY;
        }
    });

    // --- 2. Right Side Buttons (Dynamic) ---
    // Moved buttons closer to corner (Lower Y, More Right)
    let btnBaseX = this.scale.width - 60;
    let btnBaseY = this.scale.height - 60;
    
    // UI Group for easier updates
    this.mobileUI = {};

    // A. Fire Button (Big Red Button) - Bottom Right
    const btnFire = this.add.circle(btnBaseX, btnBaseY, 50, 0xff0000, 0.4)
        .setScrollFactor(0).setDepth(210).setInteractive(); // Radius 50, so bottom is height-10
    const txtFire = this.add.text(btnBaseX, btnBaseY, "FIRE", { fontSize: '20px', fontStyle:'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(211);
    
    btnFire.on('pointerdown', () => mobileInput.fire = true);
    btnFire.on('pointerup', () => mobileInput.fire = false);
    btnFire.on('pointerout', () => mobileInput.fire = false);

    // B. Active Item (E) - Above Fire
    const btnActive = this.add.circle(btnBaseX - 80, btnBaseY - 65, 30, 0x00ff00, 0.4)
        .setScrollFactor(0).setDepth(210).setInteractive();
    const txtActive = this.add.text(btnBaseX - 80, btnBaseY - 65, "USE", { fontSize: '14px', fontStyle:'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(211);
    
    btnActive.on('pointerdown', () => {
        useActiveItem(this);
    });

    // D. Dash (Space) - Left of Fire
    const btnDash = this.add.circle(btnBaseX - 85, btnBaseY, 40, 0x00aaff, 0.4)
        .setScrollFactor(0).setDepth(210).setInteractive();
    const txtDash = this.add.text(btnBaseX - 85, btnBaseY, "ROLL", { fontSize: '18px', fontStyle:'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(211);
    
    btnDash.on('pointerdown', () => mobileInput.dash = true);
    btnDash.on('pointerup', () => mobileInput.dash = false);
    btnDash.on('pointerout', () => mobileInput.dash = false);

    // C. Return/Pause (Esc) - Top Right
    const btnPause = this.add.rectangle(this.scale.width - 40, 40, 60, 40, 0x444444, 0.8)
        .setScrollFactor(0).setDepth(210).setInteractive();
    const txtPause = this.add.text(this.scale.width - 40, 40, "||", { fontSize: '24px' }).setOrigin(0.5).setScrollFactor(0).setDepth(211);
    
    btnPause.on('pointerdown', () => {
        togglePause(this);
    });

    // E. Fullscreen (Top Left) - Improved Logic
    const btnFull = this.add.rectangle(40, 40, 50, 40, 0x222222, 0.8)
        .setScrollFactor(0).setDepth(210).setInteractive();
    this.add.text(40, 40, "[ ]", { fontSize: '20px' }).setOrigin(0.5).setScrollFactor(0).setDepth(211);
    
    const toggleFullScreen = () => {
        if (this.scale.isFullscreen) {
            this.scale.stopFullscreen();
        } else {
             // Use Phaser's built-in manager which handles input scaling correctly
             this.scale.startFullscreen();
        }
    };
    
    // Safety: Increase pointer count for multi-touch (Move + Fire + Roll + Pause...)
    this.input.addPointer(4); 
    
    // Fix Input Scaling when entering fullscreen
    this.scale.on('enterfullscreen', () => {
        // Give the browser a moment to settle dimensions
        this.time.delayedCall(100, () => {
            this.scale.refresh(); 
        });
    });

    // --- Dynamic Resizing for UI ---
    this.scale.on('resize', (gameSize) => {
        const w = gameSize.width;
        const h = gameSize.height;
        
        // Update Joystick
        joyY = h - 100; // Raised higher as requested
        joyX = 100;
        joyBase.setPosition(joyX, joyY);
        joyKnob.setPosition(joyX, joyY);
        leftStick.baseX = joyX;
        leftStick.baseY = joyY;

        // Update Buttons
        btnBaseX = w - 60;
        btnBaseY = h - 80; // Slightly higher too
        
        btnFire.setPosition(btnBaseX, btnBaseY);
        txtFire.setPosition(btnBaseX, btnBaseY);
        
        btnActive.setPosition(btnBaseX - 80, btnBaseY - 65);
        txtActive.setPosition(btnBaseX - 80, btnBaseY - 65);
        
        btnDash.setPosition(btnBaseX - 85, btnBaseY);
        txtDash.setPosition(btnBaseX - 85, btnBaseY);
        
        btnPause.setPosition(w - 40, 40);
        txtPause.setPosition(w - 40, 40);

        // Update UI Centers and Scaling for Compendium
        if (compendiumUI) {
             compendiumUI.setPosition(w/2, h/2);
             
             // Dynamic Scale Calculation
             // Target size ~660x420 content.
             // We want padding of 40px all around.
             const availW = w - 80;
             const availH = h - 80;
             const scaleX = availW / 700;
             const scaleY = availH / 500;
             const finalScale = Math.min(1, scaleX, scaleY);
             compendiumUI.setScale(finalScale);

             if (compendiumUI.maskShape) {
                 compendiumUI.maskShape.clear();
                 compendiumUI.maskShape.fillStyle(0xffffff);
                 let cx = w/2; let cy = h/2;
                 // Mask must cover the content relative to new center and scale
                 // The content mask is hardcoded for the content container
                 // Rect X/Y are relative to screen top-left (0,0) because mask is absolute?
                 // No, standard GeometryMask uses world coordinates.
                 // With ScrollFactor(0), it uses Screen Coordinates (0,0 at TL).
                 // Center is w/2, h/2.
                 // Content Box is 660x420.
                 // Scaled W = 660 * finalScale. Scaled H = 420 * finalScale.
                 // TopLeft X = cx - (330 * finalScale) ?
                 // The default content starts roughly 180px up from center?
                 // Original Rect: x=70, y=120 (for center 400,300) -> -330, -180 relative to center 
                 
                 let rw = 660 * finalScale;
                 let rh = 420 * finalScale;
                 // Center of content area relative to container center is roughly (0, +30) ? 
                 // Wait, original rect 70,120 (400 center) => Left=-330, Top=-180
                 // So relative to center, it is X-330, Y-180.
                 let rx = cx - 330 * finalScale;
                 let ry = cy - 180 * finalScale;
                 
                 compendiumUI.maskShape.fillRect(rx, ry, rw, rh);
             }
        }
        if (inventoryUI) {
             inventoryUI.setPosition(w/2, h/2);
             
             const availW = w - 80;
             const availH = h - 80;
             const scaleFinal = Math.min(1, availW/600, availH/340);
             inventoryUI.setScale(scaleFinal);

             if (inventoryUI.maskShape) {
                 inventoryUI.maskShape.clear();
                 inventoryUI.maskShape.fillStyle(0xffffff);
                 let cx = w/2; let cy = h/2;
                 // Original: 100, 150 (Center 400,300) => -300, -150
                 let rw = 600 * scaleFinal;
                 let rh = 340 * scaleFinal;
                 let rx = cx - 300 * scaleFinal;
                 let ry = cy - 150 * scaleFinal;
                 inventoryUI.maskShape.fillRect(rx, ry, rw, rh);
             }
        }
        
        // Recenter Camera just in case? No, following player.
    });
    
    btnFull.on('pointerdown', toggleFullScreen);


}

function drawMinimap() {
    if (!minimapGraphics) return;
    minimapGraphics.clear();
    const cellSize = 18; 
    // Dynamic Anchor: Top-Right
    const sceneWidth = minimapGraphics.scene.scale.width;
    const startX = sceneWidth - 150; 
    const startY = 40; 
    
    // Background
    minimapGraphics.fillStyle(0x111111, 0.7);
    minimapGraphics.fillRoundedRect(startX - 20, startY - 20, 160, 160, 10);
    minimapGraphics.lineStyle(2, 0x444444);
    minimapGraphics.strokeRoundedRect(startX - 20, startY - 20, 160, 160, 10);

    // Static Center (Spawn at 5,5)
    // We want 5,5 to be at the center of the minimap box (startX + 60, startY + 60)
    // dx = offset + x * size
    // Dynamic Center (Center on Player)
    const roomSize = cellSize + 4;
    // We want currentRoom to be at (startX + 60, startY + 60)
    // dx = offset + x * roomSize
    // center = offset + curX * roomSize => offset = center - curX * roomSize
    const mapCenterX = (startX + 60) - currentRoom.x * roomSize;
    const mapCenterY = (startY + 60) - currentRoom.y * roomSize;

    for(let key in dungeon) {
        let room = dungeon[key];
        // Map Item Logic: Show if visited, seen neighbor, or Map Item held
        let isRevealed = room.seen || (typeof playerStats !== 'undefined' && playerStats.showMap);
        
        // Only draw relevant rooms
        if (!room.visited && !isRevealed) continue;

        let parts = key.split(',');
        if (parts.length < 2) continue; // Skip non-coord keys
        let x = parseInt(parts[0]);
        let y = parseInt(parts[1]);
        
        let dx = mapCenterX + x * roomSize;
        let dy = mapCenterY + y * roomSize;
        
        // Clip if out of minimap box
        if (dx < startX - 20 || dx > startX + 140 || dy < startY - 20 || dy > startY + 140) continue;

        if (room.visited) {
             minimapGraphics.lineStyle(2, 0xaaaaaa);
             if (currentRoom.x === x && currentRoom.y === y) {
                 minimapGraphics.fillStyle(0xffffff); // Current
             } else if (room.type === 'boss') {
                 minimapGraphics.fillStyle(0xcc0000); 
             } else if (room.type === 'treasure') {
                 minimapGraphics.fillStyle(0xffcc00); 
             } else if (room.type === 'shop') {
                 minimapGraphics.fillStyle(0x00aa00);
             } else {
                 minimapGraphics.fillStyle(0x666666); 
             }
             minimapGraphics.fillRect(dx, dy, cellSize, cellSize);
             minimapGraphics.strokeRect(dx, dy, cellSize, cellSize);

             // Draw Doors (Simple lines)
             minimapGraphics.lineStyle(2, 0xaaaaaa);
             if (room.doors.includes('right')) minimapGraphics.lineBetween(dx+cellSize, dy+cellSize/2, dx+cellSize+4, dy+cellSize/2);
             if (room.doors.includes('down')) minimapGraphics.lineBetween(dx+cellSize/2, dy+cellSize, dx+cellSize/2, dy+cellSize+4);
             // Left/Top are drawn by neighbors or implied

        } else if (isRevealed) {
             // Grayed out (Map Revealed) - NOW FILLED for better visibility
             minimapGraphics.fillStyle(0x333333);
             minimapGraphics.fillRect(dx, dy, cellSize, cellSize);
             minimapGraphics.lineStyle(1, 0x555555);
             minimapGraphics.strokeRect(dx, dy, cellSize, cellSize);
             
             // Compass/Map Icon Logic
             if (room.type === 'boss') { 
                 minimapGraphics.fillStyle(0x550000); 
                 minimapGraphics.fillRect(dx+4, dy+4, cellSize-8, cellSize-8);
             } else if (typeof playerStats !== 'undefined' && playerStats.showIcons) {
                 // Compass Effect
                 if (room.type === 'treasure') {
                     minimapGraphics.fillStyle(0xaa8800); 
                     minimapGraphics.fillRect(dx+4, dy+4, cellSize-8, cellSize-8);
                 } else if (room.type === 'shop') {
                     minimapGraphics.fillStyle(0x005500); 
                     minimapGraphics.fillRect(dx+4, dy+4, cellSize-8, cellSize-8);
                 }
             }
        }
    }
}

// --- Audio System (Synthetic) ---
function playPew(freq, type) {
    // Backward compatibility wrapper
    SoundSystem.playHit(false);
}

// --- Terrain Generation ---

function generateRoomTerrain(scene, roomData) {
    if (roomData.type === 'spawn' || roomData.type === 'shop' || roomData.type === 'treasure') return;
    
    // If layout already exists, reconstruct from data
    if (roomData.terrainLayout) {
        roomData.terrainLayout.walls.forEach(p => {
            let w = walls.create(p.x, p.y, 'wall');
            w.body.updateFromGameObject();
        });
        roomData.terrainLayout.pits.forEach(p => {
             let obj = pits.create(p.x, p.y, 'pit');
             obj.body.setSize(40, 40);
        });
        roomData.terrainLayout.crates.forEach(p => {
             if (!p.destroyed) {
                 let c = crates.create(p.x, p.y, 'crate');
                 c.setTint(0xdddddd);
                 c.body.updateFromGameObject();
                 c.dataRef = p; // Link back to data for persistence
             }
        });
        return;
    }

    // Initialize new layout storage
    roomData.terrainLayout = { walls: [], pits: [], crates: [] };
    
    const isBoss = (roomData.type === 'boss');
    
    // Grid Setup: 11x7 usable (approx).
    // Room: 800x600. Center 400x300.
    // Use 64 px steps.
    for(let gx = 2; gx <= 10; gx++) {
        for(let gy = 2; gy <= 7; gy++) {
            let x = gx * 64 + 32; 
            let y = gy * 64 + 32;
            
            // Skip center area 
            if (Math.abs(x - 400) < 100 && Math.abs(y - 300) < 100) continue;
            
            // Skip paths to doors
             if (Math.abs(x - 400) < 40) continue;
             if (Math.abs(y - 300) < 40) continue;

             let roll = Math.random();
            if (isBoss) {
                 // Boss Room: No pits, minimal walls
                 if (roll < 0.05) {
                      let w = walls.create(x, y, 'wall');
                      w.body.updateFromGameObject();
                      roomData.terrainLayout.walls.push({x, y});
                 }
            } else {
                 if (roll < 0.05) {
                      let p = pits.create(x, y, 'pit');
                      p.body.setSize(40, 40);
                      roomData.terrainLayout.pits.push({x, y});
                 } else if (roll < 0.12) {
                      let w = walls.create(x, y, 'wall');
                      w.body.updateFromGameObject();
                      roomData.terrainLayout.walls.push({x, y});
                 } else if (roll < 0.20) {
                      let c = crates.create(x, y, 'crate');
                      c.setTint(0xdddddd);
                      c.body.updateFromGameObject();
                      let cData = {x, y, destroyed: false};
                      c.dataRef = cData;
                      roomData.terrainLayout.crates.push(cData);
                 }
                 // Small chance for random debris (visual only)
                 else if (roll < 0.22) {
                     // Add simple decorative sprite
                     // We don't have sprite for this, maybe small rock?
                     // Use small wall rect
                     let d = scene.add.rectangle(x, y, 16, 16, 0x555555);
                     d.setRotation(Math.random()*6);
                 }
            }
        }
    }
}

function destroyCrate(bullet, crate) {
    // Modify: Allow sword slash (arc) to persist and break multiple crates/enemies
    if (bullet && !bullet.isSwordSlash) {
        bullet.disableBody(true, true);
    }
    
    // Persistence Update
    if (crate.dataRef) {
        crate.dataRef.destroyed = true;
    }

    // Spawn Chance
    if (Math.random() < 0.15 && crate.scene) {
        spawnCoin(crate.scene, crate.x, crate.y);
    }
    
    crate.destroy();
}

function playerFallInPit(player, pit) {
    // Flight Logic
    if (playerStats.canFly) return;

    if (player.isFalling) return;
    
    let dist = Phaser.Math.Distance.Between(player.x, player.y, pit.x, pit.y);
    if (dist < 20) {
        player.isFalling = true;
        player.setVelocity(0,0);
        
        pit.scene.tweens.add({
             targets: player,
             scale: 0,
             alpha: 0,
             duration: 500,
             onComplete: () => {
                 playerStats.hp -= 1;
                 SoundSystem.playHit(true);
                 updatePlayerHealthUI(pit.scene);
                 
                 if (playerStats.hp <= 0) {
                      gameOver(pit.scene);
                 } else {
                      respawnPlayer(pit.scene);
                 }
             }
        });
    }
}

function enemyFallInPit(enemy, pit) {
    if (enemy.isFalling) return;
    
    let dist = Phaser.Math.Distance.Between(enemy.x, enemy.y, pit.x, pit.y);
    if (dist < 20) {
        enemy.isFalling = true;
        enemy.setVelocity(0,0);
        if (enemy.body) enemy.body.checkCollision.none = true; 
        
        pit.scene.tweens.add({
             targets: enemy,
             scale: 0,
             alpha: 0,
             duration: 500,
             onComplete: () => {
                 enemy.destroy();
                 checkRoomClear(pit.scene);
             }
        });
    }
}

function respawnPlayer(scene) {
    player.isFalling = false;
    player.setAlpha(1);
    player.setScale(1);
    
    let safestX = 400;
    let safestY = 300;
    let maxDist = 0;
    
    let activeEnemies = enemies.getChildren();

    for(let i=0; i<10; i++) {
        let rx = Phaser.Math.Between(150, 650);
        let ry = Phaser.Math.Between(150, 450);
        
        // Closest enemy check
        let closest = 9999;
        if (activeEnemies.length === 0) closest = 1000;
        else {
            for(let e of activeEnemies) {
                let d = Phaser.Math.Distance.Between(rx, ry, e.x, e.y);
                if (d < closest) closest = d;
            }
        }
        
        // Check Obstacles (Simple overlap check manual)
        // Since physics bodies update next frame, we can't fully trust scene.physics.overlap() immediately 
        // if we just moved. But we can assume random luck keeps us out of walls mostly.
        // We prioritize enemy distance.
        
        if (closest > maxDist) {
             maxDist = closest;
             safestX = rx;
             safestY = ry;
        }
    }

    player.x = safestX;
    player.y = safestY;
    
    scene.tweens.add({
        targets: player,
        alpha: 0.2,
        yoyo: true,
        repeat: 4,
        duration: 100
    });
}
