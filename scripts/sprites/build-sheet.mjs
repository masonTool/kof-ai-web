/**
 * 把元宝出的原始图（public/sheets/kyo-raw/）处理成游戏能直接用的贴图：
 *
 *   抠背景 → 去水印 → 统一缩放（同一个 scale，所有帧身高一致）
 *   → 统一色板量化（所有帧共用一套颜色，跨帧不串色）→ 打包成图集 + JSON
 *
 * 输出的 JSON 是"每帧自带矩形和偏移"的形式，运行时不用算布局：
 *   public/sheets/kyo.png   图集
 *   public/sheets/kyo.json  { image, anims: { idle: [{x,y,w,h,ox,oy}...] } }
 *
 * 用法：node scripts/sprites/build-kyo.mjs
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createImage, decodePng, encodePng, blit } from './png.mjs';
import { cutout, scaleToHeight, scaleToWidth } from './cutout.mjs';

/** 画风：决定读哪一套原始图（与 gen-poses.mjs 的 KYO_STYLE 对应） */
const STYLE = process.env.KYO_STYLE ?? 'ink';
/** 角色 id（--char，默认 kyo）：一套素材一个角色 */
const CHAR_ID = (() => {
  const i = process.argv.indexOf('--char');
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : 'kyo';
})();
const argVal = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : undefined;
};

const RAW = `art-source/${CHAR_ID}-raw-${STYLE}`;
const OUT_IMAGE = `public/sheets/${CHAR_ID}.png`;
const OUT_EXTRA_IMAGE = `public/sheets/${CHAR_ID}-extra.png`;
const OUT_EXTRA_JSON = `public/sheets/${CHAR_ID}-extra.json`;
const OUT_JSON = `public/sheets/${CHAR_ID}.json`;

/** 角色身高（逻辑像素）：跟程序化绘制的京同高，站上去才对得上判定盒 */
const CHAR_H = 84;

/**
 * 贴图分辨率：一个逻辑像素烘几个源像素。
 *
 * 屏幕上**一个逻辑像素**占多少物理像素，是窗口大小 + dpr 决定的：
 *   1280×720 窗口 → 整数放大 3 倍，Retina ×2 ⇒ 6 个物理像素/逻辑像素
 *   再叠加渲染层的 `RENDER_SCALE = 2`（后备缓冲超采样）⇒ 光栅化时是 12 个
 * 所以按 8 倍（84×8 = 672px 高）烘：比屏幕实际需要的 6 倍多一点余量，
 * 窗口再大一点也不会立刻糊，图集又没到"打开就卡"的地步（约 1MB）。
 */
const RES = 8;

/** 只有这些动画会被闪白用到（`renderer.ts` 里 Hit 状态前 3 帧），别给所有帧烘剪影，图集受不了 */
const FLASH_ANIMS = new Set(['hit']);

/**
 * 动画 → 帧序列。
 *
 * 帧数尽量对齐 `src/render/poses.ts` 里同名姿势的帧数：
 * 运行时下标由 `poseFrameIndex()` 给，帧数少了会自己循环回来（出拳就是"收-出-收"）。
 */
const ANIMS = {
  // 跳攻击专属
  kyojumpattack: ['kyojumpattackout'],
  iorijumpattack: ['iorijumpattackout'],
  benimarujumpattack: ['benimarujumpattackout'],
  daimonjumpattack: ['daimonjumpattackout'],
  terryjumpattack: ['terryjumpattackout'],
  andyjumpattack: ['andyjumpattackout'],
  joejumpattack: ['joejumpattackout'],
  ryojumpattack: ['ryojumpattackout'],
  robertjumpattack: ['robertjumpattackout'],
  yurijumpattack: ['yurijumpattackout'],
  leonajumpattack: ['leonajumpattackout'],
  ralfjumpattack: ['ralfjumpattackout'],
  clarkjumpattack: ['clarkjumpattackout'],
  athenajumpattack: ['athenajumpattackout'],
  kensoujumpattack: ['kensoujumpattackout'],
  chinjumpattack: ['chinjumpattackout'],
  kimjumpattack: ['kimjumpattackout'],
  choijumpattack: ['choijumpattackout'],
  changjumpattack: ['changjumpattackout'],
  billyjumpattack: ['billyjumpattackout'],
  eijijumpattack: ['eijijumpattackout'],
  shingojumpattack: ['shingojumpattackout'],
  yashirojumpattack: ['yashirojumpattackout'],
  shermiejumpattack: ['shermiejumpattackout'],
  chrisjumpattack: ['chrisjumpattackout'],
  goenitzjumpattack: ['goenitzjumpattackout'],
  orochijumpattack: ['orochijumpattackout'],
  // 蹲攻击专属（第二批）
  terrycrouchpunch: ['terrycrouchpunchout'],
  terrycrouchkick: ['terrycrouchkickout'],
  andycrouchpunch: ['andycrouchpunchout'],
  andycrouchkick: ['andycrouchkickout'],
  joecrouchpunch: ['joecrouchpunchout'],
  joecrouchkick: ['joecrouchkickout'],
  ryocrouchpunch: ['ryocrouchpunchout'],
  ryocrouchkick: ['ryocrouchkickout'],
  robertcrouchpunch: ['robertcrouchpunchout'],
  robertcrouchkick: ['robertcrouchkickout'],
  yuricrouchpunch: ['yuricrouchpunchout'],
  yuricrouchkick: ['yuricrouchkickout'],
  leonacrouchpunch: ['leonacrouchpunchout'],
  leonacrouchkick: ['leonacrouchkickout'],
  ralfcrouchpunch: ['ralfcrouchpunchout'],
  ralfcrouchkick: ['ralfcrouchkickout'],
  clarkcrouchpunch: ['clarkcrouchpunchout'],
  clarkcrouchkick: ['clarkcrouchkickout'],
  athenacrouchpunch: ['athenacrouchpunchout'],
  athenacrouchkick: ['athenacrouchkickout'],
  kensoucrouchpunch: ['kensoucrouchpunchout'],
  kensoucrouchkick: ['kensoucrouchkickout'],
  chincrouchpunch: ['chincrouchpunchout'],
  chincrouchkick: ['chincrouchkickout'],
  kimcrouchpunch: ['kimcrouchpunchout'],
  kimcrouchkick: ['kimcrouchkickout'],
  choicrouchpunch: ['choicrouchpunchout'],
  choicrouchkick: ['choicrouchkickout'],
  changcrouchpunch: ['changcrouchpunchout'],
  changcrouchkick: ['changcrouchkickout'],
  billycrouchpunch: ['billycrouchpunchout'],
  billycrouchkick: ['billycrouchkickout'],
  eijicrouchpunch: ['eijicrouchpunchout'],
  eijicrouchkick: ['eijicrouchkickout'],
  shingocrouchpunch: ['shingocrouchpunchout'],
  shingocrouchkick: ['shingocrouchkickout'],
  yashirocrouchpunch: ['yashirocrouchpunchout'],
  yashirocrouchkick: ['yashirocrouchkickout'],
  shermiecrouchpunch: ['shermiecrouchpunchout'],
  shermiecrouchkick: ['shermiecrouchkickout'],
  chriscrouchpunch: ['chriscrouchpunchout'],
  chriscrouchkick: ['chriscrouchkickout'],
  goenitzcrouchpunch: ['goenitzcrouchpunchout'],
  goenitzcrouchkick: ['goenitzcrouchkickout'],
  orochicrouchpunch: ['orochicrouchpunchout'],
  orochicrouchkick: ['orochicrouchkickout'],
  // 蹲攻击专属（2A~2D）：现在全员共用 1 帧的 crouchPunch/crouchKick，连动作都没有
  kyocrouchpunch: ['kyocrouchpunchout'],
  kyocrouchkick: ['kyocrouchkickout'],
  ioricrouchpunch: ['ioricrouchpunchout'],
  ioricrouchkick: ['ioricrouchkickout'],
  benicrouchpunch: ['benicrouchpunchout'],
  benicrouchkick: ['benicrouchkickout'],
  daimoncrouchpunch: ['daimoncrouchpunchout'],
  daimoncrouchkick: ['daimoncrouchkickout'],
  // 轻攻击专属（5A/5B）：幅度小、节奏快，起手帧同样复用 punchwindup/kickwindup
  kyolightpunch: ['punchwindup', 'kyolightpunchout', 'kyolightpunchout'],
  kyolightkick: ['kickwindup', 'kyolightkickout', 'kyolightkickout'],
  iorilightpunch: ['punchwindup', 'iorilightpunchout', 'iorilightpunchout'],
  iorilightkick: ['kickwindup', 'iorilightkickout', 'iorilightkickout'],
  benilightpunch: ['punchwindup', 'benilightpunchout', 'benilightpunchout'],
  benilightkick: ['kickwindup', 'benilightkickout', 'benilightkickout'],
  daimonlightpunch: ['punchwindup', 'daimonlightpunchout', 'daimonlightpunchout'],
  daimonlightkick: ['kickwindup', 'daimonlightkickout', 'daimonlightkickout'],
  // 普通技专属（第七批 · 最后一批）
  shermieheavypunch: ['punchwindup', 'shermieheavypunchout', 'shermieheavypunchout'],
  shermieheavykick: ['kickwindup', 'shermieheavykickout', 'shermieheavykickout'],
  chrisheavypunch: ['punchwindup', 'chrisheavypunchout', 'chrisheavypunchout'],
  chrisheavykick: ['kickwindup', 'chrisheavykickout', 'chrisheavykickout'],
  goenitzheavypunch: ['punchwindup', 'goenitzheavypunchout', 'goenitzheavypunchout'],
  goenitzheavykick: ['kickwindup', 'goenitzheavykickout', 'goenitzheavykickout'],
  orochiheavypunch: ['punchwindup', 'orochiheavypunchout', 'orochiheavypunchout'],
  orochiheavykick: ['kickwindup', 'orochiheavykickout', 'orochiheavykickout'],
  // 普通技专属（第六批）
  billyheavypunch: ['punchwindup', 'billyheavypunchout', 'billyheavypunchout'],
  billyheavykick: ['kickwindup', 'billyheavykickout', 'billyheavykickout'],
  eijiheavypunch: ['punchwindup', 'eijiheavypunchout', 'eijiheavypunchout'],
  eijiheavykick: ['kickwindup', 'eijiheavykickout', 'eijiheavykickout'],
  shingoheavypunch: ['punchwindup', 'shingoheavypunchout', 'shingoheavypunchout'],
  shingoheavykick: ['kickwindup', 'shingoheavykickout', 'shingoheavykickout'],
  yashiroheavypunch: ['punchwindup', 'yashiroheavypunchout', 'yashiroheavypunchout'],
  yashiroheavykick: ['kickwindup', 'yashiroheavykickout', 'yashiroheavykickout'],
  // 普通技专属（第五批）
  chinheavypunch: ['punchwindup', 'chinheavypunchout', 'chinheavypunchout'],
  chinheavykick: ['kickwindup', 'chinheavykickout', 'chinheavykickout'],
  kimheavypunch: ['punchwindup', 'kimheavypunchout', 'kimheavypunchout'],
  kimheavykick: ['kickwindup', 'kimheavykickout', 'kimheavykickout'],
  choiheavypunch: ['punchwindup', 'choiheavypunchout', 'choiheavypunchout'],
  choiheavykick: ['kickwindup', 'choiheavykickout', 'choiheavykickout'],
  changheavypunch: ['punchwindup', 'changheavypunchout', 'changheavypunchout'],
  changheavykick: ['kickwindup', 'changheavykickout', 'changheavykickout'],
  // 普通技专属（第四批）
  ralfheavypunch: ['punchwindup', 'ralfheavypunchout', 'ralfheavypunchout'],
  ralfheavykick: ['kickwindup', 'ralfheavykickout', 'ralfheavykickout'],
  clarkheavypunch: ['punchwindup', 'clarkheavypunchout', 'clarkheavypunchout'],
  clarkheavykick: ['kickwindup', 'clarkheavykickout', 'clarkheavykickout'],
  athenaheavypunch: ['punchwindup', 'athenaheavypunchout', 'athenaheavypunchout'],
  athenaheavykick: ['kickwindup', 'athenaheavykickout', 'athenaheavykickout'],
  kensouheavypunch: ['punchwindup', 'kensouheavypunchout', 'kensouheavypunchout'],
  kensouheavykick: ['kickwindup', 'kensouheavykickout', 'kensouheavykickout'],
  // 普通技专属（第三批）
  ryoheavypunch: ['punchwindup', 'ryoheavypunchout', 'ryoheavypunchout'],
  ryoheavykick: ['kickwindup', 'ryoheavykickout', 'ryoheavykickout'],
  robertheavypunch: ['punchwindup', 'robheavypunchout', 'robheavypunchout'],
  robertheavykick: ['kickwindup', 'robheavykickout', 'robheavykickout'],
  yuriheavypunch: ['punchwindup', 'yuriheavypunchout', 'yuriheavypunchout'],
  yuriheavykick: ['kickwindup', 'yuriheavykickout', 'yuriheavykickout'],
  leonaheavypunch: ['punchwindup', 'leonaheavypunchout', 'leonaheavypunchout'],
  leonaheavykick: ['kickwindup', 'leonaheavykickout', 'leonaheavykickout'],
  // 普通技专属（第二批）
  beniheavypunch: ['punchwindup', 'beniheavypunchout', 'beniheavypunchout'],
  beniheavykick: ['kickwindup', 'beniheavykickout', 'beniheavykickout'],
  daimonheavypunch: ['punchwindup', 'daimonheavypunchout', 'daimonheavypunchout'],
  daimonheavykick: ['kickwindup', 'daimonheavykickout', 'daimonheavykickout'],
  terryheavypunch: ['punchwindup', 'terryheavypunchout', 'terryheavypunchout'],
  terryheavykick: ['kickwindup', 'terryheavykickout', 'terryheavykickout'],
  andyheavypunch: ['punchwindup', 'andyheavypunchout', 'andyheavypunchout'],
  andyheavykick: ['kickwindup', 'andyheavykickout', 'andyheavykickout'],
  // 普通技专属：起手帧复用通用 windup，只有出手帧是专属的
  kyoheavypunch: ['punchwindup', 'kyoheavypunchout', 'kyoheavypunchout'],
  kyoheavykick: ['kickwindup', 'kyoheavykickout', 'kyoheavykickout'],
  ioriheavypunch: ['punchwindup', 'ioriheavypunchout', 'ioriheavypunchout'],
  ioriheavykick: ['kickwindup', 'ioriheavykickout', 'ioriheavykickout'],
  idle: ['idle'],
  // 走 4 帧只出了 2 个姿势，循环回来正好是"左右左右"
  walkF: ['walk1', 'walk2', 'walk1', 'walk2'],
  walkB: ['walk2', 'walk1'],
  guard: ['guard', 'guard'],
  crouch: ['crouch'],
  // 起身：蹲着 → 半起 → 站直。原来是 `wakeup: 'crouch'` 别名（直接用蹲姿），
  // 被打倒后像"瞬间站起来"，现在补两帧过渡
  // 落地缓冲：蹲到底 → 吸收冲击后回弹。原来 `landing: 'crouch'` 别名（就是蹲姿静止）
  landing: ['crouch', 'landingmid'],
  // 眩晕：两帧循环摇晃（原来借用站架，晕了却纹丝不动）
  dizzy: ['idle', 'dizzymid'],
  // 败北：受击 → 跪地（原来借用受击姿势，输了还在摆挨打造型）
  lose: ['hit', 'losemid'],
  // 被打飞：受击 → 后仰腾空（原来借用受击姿势，飞出去还是站着的）
  // 受身翻滚：蜷身 → 横滚成球（横躺）→ 起身。原来借用 crouch，蹲着不动
  roll: ['crouch', 'rollball', 'rollup'],
  hitFall: ['hit', 'hitfallmid'],
  // 挑衅：站架 → 抬手勾指（原来借用胜利姿势）
  taunt: ['idle', 'tauntmid'],
  wakeup: ['crouch', 'wakeupmid', 'wakeuplast'],
  jump: ['jumpup', 'jumpdown', 'jumpup'],
  punchLight: ['punchwindup', 'punchout', 'punchout'],
  punchHeavy: ['punchwindup', 'punchout', 'punchout'],
  kickLight: ['kickwindup', 'kickout', 'kickout'],
  kickHeavy: ['kickwindup', 'kickout', 'kickout'],
  hit: ['hit', 'hit', 'hit'],
  win: ['win', 'win'],
  // 蹲姿攻击：蹲着出拳 / 蹲着扫腿（KOF 的 2A 2B 2C 2D 全靠这两套）
  crouchPunch: ['crouchpunch'],
  crouchKick: ['crouchkick'],
  // 空中攻击（jA jB jC jD）
  jumpAttack: ['jumpattack'],
  // 必杀技：所有必杀/超必杀共用一个起手姿势
  special: ['special'],
  // 必杀专属动作（T200 出图）：波动推手 / 升龙上挑 / 前冲肩撞 / 超必杀蓄力
  specialProjectile: ['specialprojectilewindup', 'specialprojectile', 'specialprojectilerecover'],
  specialUppercut: ['specialuppercutwindup', 'specialuppercut', 'specialuppercutrecover'],
  specialRush: ['specialrushwindup', 'specialrush', 'specialrushrecover'],
  // ---------------- 角色专属必杀（每角色自己的招式动作）
  // 命名规则：<角色id>Special1..3 对应该角色的三个必杀指令，<角色id>Super 对应超必杀
  kyspecial1: ['kyokuzushiwindup', 'kyokuzushi', 'kyokuzushirecover'],
  kyspecial2: ['kyodokuwindup', 'kyodoku', 'kyodokurecover'],
  kyspecial3: ['kyooniyakiwindup', 'kyooniyaki', 'kyooniyakirecover'],
  kysuper: ['kyosuperwindup', 'kyosuper', 'kyosuperrecover'],
  iorispecial1: ['iorifukubaraiwindup', 'iorifukubarai', 'iorifukubarairecover'],
  iorispecial2: ['iorioniyakiwindup', 'iorioniyaki', 'iorioniyakirecover'],
  iorispecial3: ['ioriaoiwindup', 'ioriaoi', 'ioriaoirecover'],
  iorisuper: ['iorisuperwindup', 'iorisuper', 'iorisuperrecover'],
  terryspecial1: ['terrywavewindup', 'terrywave', 'terrywaverecover'],
  terryspecial2: ['terryburnwindup', 'terryburn', 'terryburnrecover'],
  terryspecial3: ['terryrisingwindup', 'terryrising', 'terryrisingrecover'],
  terrysuper: ['terrysuperwindup', 'terrysuper', 'terrysuperrecover'],
  athenaspecial1: ['athenaballwindup', 'athenaball', 'athenaballrecover'],
  athenaspecial2: ['athenaswordwindup', 'athenasword', 'athenaswordrecover'],
  athenaspecial3: ['athenaarrowwindup', 'athenaarrow', 'athenaarrowrecover'],
  athenasuper: ['athenasuperwindup', 'athenasuper', 'athenasuperrecover'],
  benispecial1: ['benidenkouwindup', 'benidenkou', 'benidenkourecover'],
  benispecial2: ['beniiaiwindup', 'beniiai', 'beniiairecover'],
  benispecial3: ['benishinkuuwindup', 'benishinkuu', 'benishinkuurecover'],
  benisuper: ['benisuperwindup', 'benisuper', 'benisuperrecover'],
  daimonspecial1: ['daimonjiraishinwindup', 'daimonjiraishin', 'daimonjiraishinrecover'],
  daimonspecial2: ['daimonogurumawindup', 'daimonoguruma', 'daimonogurumarecover'],
  daimonsuper: ['daimonsuperwindup', 'daimonsuper', 'daimonsuperrecover'],
  andyspecial1: ['andihishouwindup', 'andihishou', 'andihishourecover'],
  andyspecial2: ['andizaneikenwindup', 'andizaneiken', 'andizaneikenrecover'],
  andyspecial3: ['andishouryudanwindup', 'andishouryudan', 'andishouryudanrecover'],
  andysuper: ['andisuperwindup', 'andisuper', 'andisuperrecover'],
  joespecial1: ['joebakuretsuwindup', 'joebakuretsu', 'joebakuretsurecover'],
  joespecial2: ['joetigerwindup', 'joetiger', 'joetigerrecover'],
  joespecial3: ['joetatsumakiwindup', 'joetatsumaki', 'joetatsumakirecover'],
  joesuper: ['joesuperwindup', 'joesuper', 'joesuperrecover'],
  ryospecial1: ['ryokoukenwindup', 'ryokouken', 'ryokoukenrecover'],
  ryospecial2: ['ryozanretsuwindup', 'ryozanretsu', 'ryozanretsurecover'],
  ryospecial3: ['ryohienwindup', 'ryohien', 'ryohienrecover'],
  ryosuper: ['ryosuperwindup', 'ryosuper', 'ryosuperrecover'],
  robspecial1: ['robryugekiwindup', 'robryugeki', 'robryugekirecover'],
  robspecial2: ['robgeneiwindup', 'robgenei', 'robgeneirecover'],
  robspecial3: ['robshouryuuwindup', 'robshouryuu', 'robshouryuurecover'],
  robsuper: ['robsuperwindup', 'robsuper', 'robsuperrecover'],
  yurispecial1: ['yurikoukenwindup', 'yurikouken', 'yurikoukenrecover'],
  yurispecial2: ['yurihyakuretsuwindup', 'yurihyakuretsu', 'yurihyakuretsurecover'],
  yurispecial3: ['yuriyuriwindup', 'yuriyuri', 'yuriyurirecover'],
  yurisuper: ['yurisuperwindup', 'yurisuper', 'yurisuperrecover'],
  leonaspecial1: ['leonavoltecwindup', 'leonavoltec', 'leonavoltecrecover'],
  leonaspecial2: ['leonamoonwindup', 'leonamoon', 'leonamoonrecover'],
  leonaspecial3: ['leonagroundwindup', 'leonaground', 'leonagroundrecover'],
  leonasuper: ['leonasuperwindup', 'leonasuper', 'leonasuperrecover'],
  ralfspecial1: ['ralfvulcanwindup', 'ralfvulcan', 'ralfvulcanrecover'],
  ralfspecial2: ['ralfriatwindup', 'ralfriat', 'ralfriatrecover'],
  ralfspecial3: ['ralfdivingwindup', 'ralfdiving', 'ralfdivingrecover'],
  ralfsuper: ['ralfsuperwindup', 'ralfsuper', 'ralfsuperrecover'],
  clarkspecial1: ['clarkmountwindup', 'clarkmount', 'clarkmountrecover'],
  clarkspecial2: ['clarkfrankenwindup', 'clarkfranken', 'clarkfrankenrecover'],
  clarkspecial3: ['clarkcradlewindup', 'clarkcradle', 'clarkcradlerecover'],
  clarksuper: ['clarksuperwindup', 'clarksuper', 'clarksuperrecover'],
  kensouspecial1: ['kensoukyuwindup', 'kensoukyu', 'kensoukyurecover'],
  kensouspecial2: ['kensourgakuwindup', 'kensourgaku', 'kensourgakurecover'],
  kensouspecial3: ['kensourengewindup', 'kensourenge', 'kensourengerecover'],
  kensousuper: ['kensousuperwindup', 'kensousuper', 'kensousuperrecover'],
  chinspecial1: ['chinkuutotsuwindup', 'chinkuutotsu', 'chinkuutotsurecover'],
  chinspecial2: ['chinryuurinwindup', 'chinryuurin', 'chinryuurinrecover'],
  chinspecial3: ['chinsuihowindup', 'chinsuiho', 'chinsuihorecover'],
  chinsuper: ['chinsuperwindup', 'chinsuper', 'chinsuperrecover'],
  kimspecial1: ['kimhangetsuwindup', 'kimhangetsu', 'kimhangetsurecover'],
  kimspecial2: ['kimhienwindup', 'kimhien', 'kimhienrecover'],
  kimspecial3: ['kimkuurenwindup', 'kimkuuren', 'kimkuurenrecover'],
  kimsuper: ['kimsuperwindup', 'kimsuper', 'kimsuperrecover'],
  choispecial1: ['choisenpuuwindup', 'choisenpuu', 'choisenpuurecover'],
  choispecial2: ['choihishouwindup', 'choihishou', 'choihishourecover'],
  choispecial3: ['choishippuuwindup', 'choishippuu', 'choishippuurecover'],
  choisuper: ['choisuperwindup', 'choisuper', 'choisuperrecover'],
  changspecial1: ['changkaitenwindup', 'changkaiten', 'changkaitenrecover'],
  changspecial2: ['changassatsuwindup', 'changassatsu', 'changassatsurecover'],
  changspecial3: ['changnagewindup', 'changnage', 'changnagerecover'],
  changsuper: ['changsuperwindup', 'changsuper', 'changsuperrecover'],
  billyspecial1: ['billysenpuuwindup', 'billysenpuu', 'billysenpuurecover'],
  billyspecial2: ['billychuudanwindup', 'billychuudan', 'billychuudanrecover'],
  billyspecial3: ['billykaryuuwindup', 'billykaryuu', 'billykaryuurecover'],
  billysuper: ['billysuperwindup', 'billysuper', 'billysuperrecover'],
  eijispecial1: ['eijikasumiwindup', 'eijikasumi', 'eijikasumirecover'],
  eijispecial2: ['eijikotsuwindup', 'eijikotsu', 'eijikotsurecover'],
  eijispecial3: ['eijikagesuberiwindup', 'eijikagesuberi', 'eijikagesuberirecover'],
  eijisuper: ['eijisuperwindup', 'eijisuper', 'eijisuperrecover'],
  shingospecial1: ['shingoaraiwindup', 'shingoarai', 'shingoarairecover'],
  shingospecial2: ['shingokickwindup', 'shingokick', 'shingokickrecover'],
  shingospecial3: ['shingooniyakiwindup', 'shingooniyaki', 'shingooniyakirecover'],
  shingosuper: ['shingosuperwindup', 'shingosuper', 'shingosuperrecover'],
  yashirospecial1: ['yashirodanwindup', 'yashirodan', 'yashirodanrecover'],
  yashirospecial2: ['yashiromissilewindup', 'yashiromissile', 'yashiromissilerecover'],
  yashirospecial3: ['yashirojetwindup', 'yashirojet', 'yashirojetrecover'],
  yashirosuper: ['yashirostampwindup', 'yashirostamp', 'yashirostamprecover'],
  shermiespecial1: ['shermieflashwindup', 'shermieflash', 'shermieflashrecover'],
  shermiespecial2: ['shermiespiralwindup', 'shermiespiral', 'shermiespiralrecover'],
  shermiespecial3: ['shermieaccelwindup', 'shermieaccel', 'shermieaccelrecover'],
  shermiesuper: ['shermieparadisewindup', 'shermieparadise', 'shermieparadiserecover'],
  chrisspecial1: ['chrisflamewindup', 'chrisflame', 'chrisflamerecover'],
  chrisspecial2: ['chrisslidingwindup', 'chrissliding', 'chrisslidingrecover'],
  chrisspecial3: ['chrisupperwindup', 'chrisupper', 'chrisupperrecover'],
  chrissuper: ['chrisorochiwindup', 'chrisorochi', 'chrisorochirecover'],
  goenitzspecial1: ['goenitzmizuchiwindup', 'goenitzmizuchi', 'goenitzmizuchirecover'],
  goenitzspecial2: ['goenitzjormwindup', 'goenitzjorm', 'goenitzjormrecover'],
  goenitzspecial3: ['goenitzrisingwindup', 'goenitzrising', 'goenitzrisingrecover'],
  goenitzsuper: ['goenitzsuperwindup', 'goenitzsuper', 'goenitzsuperrecover'],
  orochispecial1: ['orochispacewindup', 'orochispace', 'orochispacerecover'],
  orochispecial2: ['orochiearthwindup', 'orochiearth', 'orochiearthrecover'],
  orochispecial3: ['orochilightwindup', 'orochilight', 'orochilightrecover'],
  orochisuper: ['orochijudgmentwindup', 'orochijudgment', 'orochijudgmentrecover'],
  // 超必杀三段：起手（气汇聚）→ 蓄满（气浪最大）→ 释放收招
  superCharge: ['superchargewindup', 'supercharge', 'superchargerecover'],
  // 躺在地上：按"宽度"归一，锚点用包围盒中心（横躺的人没有"脚底"这个概念）
  down: ['down'],
};

/**
 * 姿势库里没有单独出图的动画 → 借用最接近的那一套。
 *
 * 不借的话，`spriteFor()` 返回 null，绘制层就掉回程序化骨架——
 * 表现就是"格挡一瞬间闪出像素人"。借用的帧直接复用同一块图集区域，不占额外空间。
 */
const ALIAS = {
  attack: 'punchLight', // 默认攻击动画 == 轻拳
  win2: 'win',
  win3: 'win',
  block: 'guard', // 格挡：和"按住防御"是同一个姿势
  throwStart: 'special', // 投技起手
};

/** 这些动画按宽度归一 + 水平居中（横躺姿势） */
/**
 * 横躺帧：按**宽度**归一 + 水平居中（因为宽 > 高，按高度归一会把它缩成一条）。
 *
 * `'all'` = 整个动画都是横躺（`down`）；数组 = 只有指定帧号是横躺（`roll` 的第 2 帧是横滚成球）。
 * 这是受身翻滚能成立的前提——之前 `roll` 借的是 `crouch`，蹲着不动，根本看不出在滚。
 */
const LYING = new Map([['down', 'all']]);

/** 第 idx 帧是不是横躺姿势 */
function isLying(anim, idx) {
  const rule = LYING.get(anim);
  if (rule === undefined) return false;
  return rule === 'all' || rule.includes(idx);
}

/**
 * 少数姿势要单独定身高。
 *
 * 蹲姿原图只比站姿矮一点点（AI 画不出"矮一大截"），但游戏里蹲下必须明显变矮，
 * 否则高段位的拳看起来会打在头上。这里按姿势库里 CROUCH 的头高比例（54/71）压到 64。
 */
const HEIGHT_OVERRIDE = {};

/**
 * 姿势目录 → 抠好的图。
 *
 * 目录名就是姿势（idle / punchout / kickwindup …），里面放元宝出的候选图，
 * 取文件名排序第一张——挑图时把想要的改成 `00.png` 就行，不用改代码。
 */
const poseCache = new Map();
function loadPose(pose) {
  if (poseCache.has(pose)) return poseCache.get(pose);
  const dir = join(RAW, pose);
  if (!existsSync(dir)) {
    throw new Error(`缺少姿势 ${pose}：${dir}\n  先跑 node scripts/sprites/gen-poses.mjs --only ${pose}`);
  }
  const file = readdirSync(dir)
    .filter((f) => f.endsWith('.png'))
    .sort()[0];
  if (!file) throw new Error(`姿势目录是空的：${dir}`);
  const img = cutout(decodePng(readFileSync(join(dir, file)))).img;
  poseCache.set(pose, img);
  return img;
}

/**
 * 帧内色板：把这帧自己的高频颜色抽出来。
 *
 * 试过"所有帧共用一份 28/64 色板"，会出事：白衣的暗部在整份色板里最近的邻居
 * 往往是墨绿裤子的中绿，于是白衣服上会被点出一道道绿色。帧内取色就不会——
 * 那件白衣的暗部就长在这帧自己身上，一定在色板里。
 */
function framePalette(img, maxColors = 32) {
  const buckets = new Map();
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] < 200) continue;
    const key = ((img.data[i] >> 3) << 10) | ((img.data[i + 1] >> 3) << 5) | (img.data[i + 2] >> 3);
    let b = buckets.get(key);
    if (!b) {
      b = [0, 0, 0, 0];
      buckets.set(key, b);
    }
    b[0] += img.data[i];
    b[1] += img.data[i + 1];
    b[2] += img.data[i + 2];
    b[3] += 1;
  }
  return [...buckets.values()]
    .sort((a, b) => b[3] - a[3])
    .slice(0, maxColors)
    .map((b) => [Math.round(b[0] / b[3]), Math.round(b[1] / b[3]), Math.round(b[2] / b[3])]);
}

function quantize(img, palette) {
  const cache = new Map();
  const out = { width: img.width, height: img.height, data: new Uint8Array(img.data) };
  for (let i = 0; i < out.data.length; i += 4) {
    if (out.data[i + 3] === 0) continue;
    const key = ((out.data[i] >> 2) << 12) | ((out.data[i + 1] >> 2) << 6) | (out.data[i + 2] >> 2);
    let pick = cache.get(key);
    if (pick === undefined) {
      let best = 0;
      let bestD = Infinity;
      for (let p = 0; p < palette.length; p++) {
        const dr = out.data[i] - palette[p][0];
        const dg = out.data[i + 1] - palette[p][1];
        const db = out.data[i + 2] - palette[p][2];
        const d = dr * dr + dg * dg + db * db;
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
      cache.set(key, best);
      pick = best;
    }
    out.data[i] = palette[pick][0];
    out.data[i + 1] = palette[pick][1];
    out.data[i + 2] = palette[pick][2];
  }
  return out;
}

/** 腿部质心当水平锚点：出拳/踢腿时上身和手臂会甩出去，腿是唯一稳的参考 */
function legAnchorX(img) {
  const yStart = Math.floor(img.height * 0.72);
  let sum = 0;
  let n = 0;
  for (let y = yStart; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (img.data[(y * img.width + x) * 4 + 3] === 0) continue;
      sum += x;
      n++;
    }
  }
  return n === 0 ? img.width / 2 : sum / n;
}

// ---------- 变体：从本体图集派生一份染色图集 ----------
/**
 * 暴走八神 / 暴走莉安娜 是同一个人的异色形态，姿势完全一样、只差颜色。
 * 与其重新出 26 个姿势（18 分钟且脸会对不上），不如把本体图集按颜色「乘」一遍：
 * 逐像素 `rgb × tint / 255`，明暗关系保留，色调整体偏移。
 *
 * 为什么放在打包阶段而不是运行时：运行时染色要动合成模式、还要给 Ctx2D 加接口，
 * 而这里纯像素运算，node 里就能验证，导出的图和普通图集完全一样——
 * 加载、LRU、闪白剪影全都不用改。
 */
const FROM = argVal('from');
if (FROM) {
  const tint = (argVal('tint') ?? '255,255,255').split(',').map((v) => Number(v.trim()));
  if (tint.length !== 3 || tint.some((v) => !Number.isFinite(v) || v < 0 || v > 255)) {
    console.error('--tint 要写成 "r,g,b"（0~255）');
    process.exit(1);
  }
  /**
   * 只染**中间调**：纯黑描边保持黑、白衬衫保持白，中间调（皮肤/裤子/衣褶）整体偏移。
   * 试过整体相乘（白衣服变粉）和只染暗部（黑夹克变红、衣服细节全丢），都不如按亮度取中间。
   */
  const tintPng = (srcPng) => {
    const out = { width: srcPng.width, height: srcPng.height, data: new Uint8Array(srcPng.data) };
    const STRENGTH = 0.62;
    for (let i = 0; i < out.data.length; i += 4) {
      if (out.data[i + 3] === 0) continue;
      const lum = (0.299 * out.data[i] + 0.587 * out.data[i + 1] + 0.114 * out.data[i + 2]) / 255;
      const k = STRENGTH * Math.max(0, 1 - Math.abs(lum - 0.45) * 2.1);
      out.data[i] = Math.round(out.data[i] * (1 - k) + tint[0] * k);
      out.data[i + 1] = Math.round(out.data[i + 1] * (1 - k) + tint[1] * k);
      out.data[i + 2] = Math.round(out.data[i + 2] * (1 - k) + tint[2] * k);
    }
    return out;
  };

  // 主片 + 扩展片都要派生（漏了扩展片，变体放必杀/跳跃时会闪回像素人）
  const pieces = [
    { src: FROM, out: CHAR_ID, outImage: OUT_IMAGE, outJson: OUT_JSON },
    { src: `${FROM}-extra`, out: `${CHAR_ID}-extra`, outImage: OUT_EXTRA_IMAGE, outJson: OUT_EXTRA_JSON },
  ];
  for (const p of pieces) {
    if (!existsSync(`public/sheets/${p.src}.png`)) continue;
    const out = tintPng(decodePng(readFileSync(`public/sheets/${p.src}.png`)));
    writeFileSync(p.outImage, encodePng(out));
    const json = JSON.parse(readFileSync(`public/sheets/${p.src}.json`, 'utf8'));
    json.image = `${p.out}.png`;
    writeFileSync(p.outJson, `${JSON.stringify(json, null, 1)}\n`);
    console.log(`${p.out}：由 ${p.src} 染色派生（tint ${tint.join(',')}）· 图集 ${out.width}×${out.height}`);
  }
  process.exit(0);
}

// ---------- 主流程 ----------
const raws = new Map();
for (const list of Object.values(ANIMS)) {
  for (const pose of list) {
    if (raws.has(pose)) continue;
    try {
      raws.set(pose, loadPose(pose));
    } catch {
      // 可选帧（比如刚加的 specialprojectilewindup）还没出图：跳过它，
      // 这个动画就用剩下的帧——绝不能让整个角色打包失败
    }
  }
}
// 统一 scale：以 idle 第一帧的身高为"角色身高"
const refPose = ANIMS.idle[0];
const refH = raws.get(refPose).height;
const scale = (CHAR_H * RES) / refH;
/**
 * 每个动画的目标身高（世界单位，脚底到包围盒顶部）。
 *
 * 为什么不再用"头发面积归一"：AI 出的同一角色各姿势大小并不一致（iori 的踢腿能画到
 * 待机的 1.5 倍），按头发逐个修正会把**测量误差**（头发随头部转动变形）直接乘到整个人身上，
 * 表现就是"同一个人一会儿高一会儿矮"。改成**按姿势类别给固定身高**最稳：
 * 站姿一律 84（脚底到头顶），蹲姿另给，躺姿按宽度，胜负姿势含举起的手臂。
 */
/**
 * 按动画（或按**帧**）指定目标身高，单位是世界单位的角色身高。
 *
 * 写数组表示"逐帧高度"——起身必须用数组：所有站姿默认统一缩放到 84，
 * 三帧起身会被抹成一样高，看起来只是原地抖三下，没有"从地上爬起来"的感觉。
 */
const HEIGHT_TARGET = {
  crouch: 64,
  crouchPunch: 66,
  terrycrouchpunch: 66, terrycrouchkick: 58,
  andycrouchpunch: 66, andycrouchkick: 58,
  joecrouchpunch: 66, joecrouchkick: 58,
  ryocrouchpunch: 66, ryocrouchkick: 58,
  robertcrouchpunch: 66, robertcrouchkick: 58,
  yuricrouchpunch: 66, yuricrouchkick: 58,
  leonacrouchpunch: 66, leonacrouchkick: 58,
  ralfcrouchpunch: 66, ralfcrouchkick: 58,
  clarkcrouchpunch: 66, clarkcrouchkick: 58,
  athenacrouchpunch: 66, athenacrouchkick: 58,
  kensoucrouchpunch: 66, kensoucrouchkick: 58,
  chincrouchpunch: 66, chincrouchkick: 58,
  kimcrouchpunch: 66, kimcrouchkick: 58,
  choicrouchpunch: 66, choicrouchkick: 58,
  changcrouchpunch: 66, changcrouchkick: 58,
  billycrouchpunch: 66, billycrouchkick: 58,
  eijicrouchpunch: 66, eijicrouchkick: 58,
  shingocrouchpunch: 66, shingocrouchkick: 58,
  yashirocrouchpunch: 66, yashirocrouchkick: 58,
  shermiecrouchpunch: 66, shermiecrouchkick: 58,
  chriscrouchpunch: 66, chriscrouchkick: 58,
  goenitzcrouchpunch: 66, goenitzcrouchkick: 58,
  orochicrouchpunch: 66, orochicrouchkick: 58,

  kyocrouchpunch: 66, kyocrouchkick: 58,
  ioricrouchpunch: 66, ioricrouchkick: 58,
  benicrouchpunch: 66, benicrouchkick: 58,
  daimoncrouchpunch: 66, daimoncrouchkick: 58,
  crouchKick: 58,
  landing: [60, 72], // 蹲到底 → 回弹
  lose: [62, 40], // 挨打 → 跪地（越跪越矮）
  // 蜷身 → 蜷得更紧（抱膝）→ 起身。高度递增做"滚过去再站起来"的节奏。
  // **不给中间帧做横躺处理**：AI 出的 rollball 是竖构图（706×1109 说明它画的是抱膝蹲，
  // 不是侧躺），按宽度归一会让人物突然变宽 3 倍；宁可保留竖构图，只靠高度变化做节奏
  roll: [52, 62, 70],
  wakeup: [58, 72, 84], // 蹲着 → 半起 → 站直
  kysuper: [70, 78], // 起手收火压低 → 出手撑起
  superCharge: [80, 88, 82], // 蓄力压低 → 气浪撑起 → 收招回落
  specialProjectile: [82, 84, 80], // 微沉 → 推出 → 回正
  specialUppercut: [74, 92, 80], // 屈膝 → 冲天 → 落地缓冲
  specialRush: [70, 76, 82], // 压到后腿 → 撞出去 → 刹住站直
  win: 88,
  win2: 88,
  win3: 88,
};

/**
 * 角色专属动画的归属。
 *
 * 打包某个角色时，**只能**打他自己的专属动画；否则会去加载别的角色的原图，
 * 找不到就抛「一帧都找不到」——这个错误在 `> /dev/null` 里被吞了整整几批，
 * 导致图集一直是旧的（art:check 只校验通用动画，发现不了）。
 */
const EXCLUSIVE_OWNER = {
  kyojumpattack: 'kyo',
  iorijumpattack: 'iori',
  benimarujumpattack: 'benimaru',
  daimonjumpattack: 'daimon',
  terryjumpattack: 'terry',
  andyjumpattack: 'andy',
  joejumpattack: 'joe',
  ryojumpattack: 'ryo',
  robertjumpattack: 'robert',
  yurijumpattack: 'yuri',
  leonajumpattack: 'leona',
  ralfjumpattack: 'ralf',
  clarkjumpattack: 'clark',
  athenajumpattack: 'athena',
  kensoujumpattack: 'kensou',
  chinjumpattack: 'chin',
  kimjumpattack: 'kim',
  choijumpattack: 'choi',
  changjumpattack: 'chang',
  billyjumpattack: 'billy',
  eijijumpattack: 'eiji',
  shingojumpattack: 'shingo',
  yashirojumpattack: 'yashiro',
  shermiejumpattack: 'shermie',
  chrisjumpattack: 'chris',
  goenitzjumpattack: 'goenitz',
  orochijumpattack: 'orochi',
  terrycrouchpunch: 'terry', terrycrouchkick: 'terry',
  andycrouchpunch: 'andy', andycrouchkick: 'andy',
  joecrouchpunch: 'joe', joecrouchkick: 'joe',
  ryocrouchpunch: 'ryo', ryocrouchkick: 'ryo',
  robertcrouchpunch: 'robert', robertcrouchkick: 'robert',
  yuricrouchpunch: 'yuri', yuricrouchkick: 'yuri',
  leonacrouchpunch: 'leona', leonacrouchkick: 'leona',
  ralfcrouchpunch: 'ralf', ralfcrouchkick: 'ralf',
  clarkcrouchpunch: 'clark', clarkcrouchkick: 'clark',
  athenacrouchpunch: 'athena', athenacrouchkick: 'athena',
  kensoucrouchpunch: 'kensou', kensoucrouchkick: 'kensou',
  chincrouchpunch: 'chin', chincrouchkick: 'chin',
  kimcrouchpunch: 'kim', kimcrouchkick: 'kim',
  choicrouchpunch: 'choi', choicrouchkick: 'choi',
  changcrouchpunch: 'chang', changcrouchkick: 'chang',
  billycrouchpunch: 'billy', billycrouchkick: 'billy',
  eijicrouchpunch: 'eiji', eijicrouchkick: 'eiji',
  shingocrouchpunch: 'shingo', shingocrouchkick: 'shingo',
  yashirocrouchpunch: 'yashiro', yashirocrouchkick: 'yashiro',
  shermiecrouchpunch: 'shermie', shermiecrouchkick: 'shermie',
  chriscrouchpunch: 'chris', chriscrouchkick: 'chris',
  goenitzcrouchpunch: 'goenitz', goenitzcrouchkick: 'goenitz',
  orochicrouchpunch: 'orochi', orochicrouchkick: 'orochi',
  kyocrouchpunch: 'kyo', kyocrouchkick: 'kyo',
  ioricrouchpunch: 'iori', ioricrouchkick: 'iori',
  benicrouchpunch: 'benimaru', benicrouchkick: 'benimaru',
  daimoncrouchpunch: 'daimon', daimoncrouchkick: 'daimon',
  kyolightpunch: 'kyo', kyolightkick: 'kyo',
  iorilightpunch: 'iori', iorilightkick: 'iori',
  benilightpunch: 'benimaru', benilightkick: 'benimaru',
  daimonlightpunch: 'daimon', daimonlightkick: 'daimon',
  kyspecial1: 'kyo', kyspecial2: 'kyo', kyspecial3: 'kyo', kysuper: 'kyo',
  iorispecial1: 'iori', iorispecial2: 'iori', iorispecial3: 'iori', iorisuper: 'iori',
  terryspecial1: 'terry', terryspecial2: 'terry', terryspecial3: 'terry', terrysuper: 'terry',
  athenaspecial1: 'athena', athenaspecial2: 'athena', athenaspecial3: 'athena', athenasuper: 'athena',
  benispecial1: 'benimaru', benispecial2: 'benimaru', benispecial3: 'benimaru', benisuper: 'benimaru',
  daimonspecial1: 'daimon', daimonspecial2: 'daimon', daimonsuper: 'daimon',
  andyspecial1: 'andy', andyspecial2: 'andy', andyspecial3: 'andy', andysuper: 'andy',
  joespecial1: 'joe', joespecial2: 'joe', joespecial3: 'joe', joesuper: 'joe',
  ryospecial1: 'ryo', ryospecial2: 'ryo', ryospecial3: 'ryo', ryosuper: 'ryo',
  robspecial1: 'robert', robspecial2: 'robert', robspecial3: 'robert', robsuper: 'robert',
  yurispecial1: 'yuri', yurispecial2: 'yuri', yurispecial3: 'yuri', yurisuper: 'yuri',
  leonaspecial1: 'leona', leonaspecial2: 'leona', leonaspecial3: 'leona', leonasuper: 'leona',
  ralfspecial1: 'ralf', ralfspecial2: 'ralf', ralfspecial3: 'ralf', ralfsuper: 'ralf',
  clarkspecial1: 'clark', clarkspecial2: 'clark', clarkspecial3: 'clark', clarksuper: 'clark',
  kensouspecial1: 'kensou', kensouspecial2: 'kensou', kensouspecial3: 'kensou', kensousuper: 'kensou',
  chinspecial1: 'chin', chinspecial2: 'chin', chinspecial3: 'chin', chinsuper: 'chin',
  kimspecial1: 'kim', kimspecial2: 'kim', kimspecial3: 'kim', kimsuper: 'kim',
  choispecial1: 'choi', choispecial2: 'choi', choispecial3: 'choi', choisuper: 'choi',
  changspecial1: 'chang', changspecial2: 'chang', changspecial3: 'chang', changsuper: 'chang',
  billyspecial1: 'billy', billyspecial2: 'billy', billyspecial3: 'billy', billysuper: 'billy',
  eijispecial1: 'eiji', eijispecial2: 'eiji', eijispecial3: 'eiji', eijisuper: 'eiji',
  shingospecial1: 'shingo', shingospecial2: 'shingo', shingospecial3: 'shingo', shingosuper: 'shingo',
  yashirospecial1: 'yashiro', yashirospecial2: 'yashiro', yashirospecial3: 'yashiro', yashirosuper: 'yashiro',
  shermiespecial1: 'shermie', shermiespecial2: 'shermie', shermiespecial3: 'shermie', shermiesuper: 'shermie',
  chrisspecial1: 'chris', chrisspecial2: 'chris', chrisspecial3: 'chris', chrissuper: 'chris',
  goenitzspecial1: 'goenitz', goenitzspecial2: 'goenitz', goenitzspecial3: 'goenitz', goenitzsuper: 'goenitz',
  orochispecial1: 'orochi', orochispecial2: 'orochi', orochispecial3: 'orochi', orochisuper: 'orochi',
};

const frames = {};
for (const [anim, list] of Object.entries(ANIMS)) {
  // 别人的专属动画：跳过（本角色没有这张图）
  const owner = EXCLUSIVE_OWNER[anim];
  if (owner !== undefined && owner !== CHAR_ID) continue;
  const targetH = HEIGHT_TARGET[anim];
  const available = list.filter((p) => raws.has(p));
  if (available.length === 0) throw new Error(`动画 ${anim} 一帧都找不到`);
  // 缺帧兜底：某个角色的某帧还没出图时，**复制最后一帧补齐**，
  // 而不是让它少一帧。少一帧会让"同一招在不同角色上帧数不同"，
  // 播放时节奏对不上（看起来像卡了一下）；复制一帧只是多停 1/60 秒，几乎看不出来。
  const padded = available.length < list.length
    ? [...available, ...Array(list.length - available.length).fill(available[available.length - 1])]
    : available;
  if (available.length < list.length) {
    console.log(`  ${anim}: 只出了 ${available.length}/${list.length} 帧，用最后一帧补齐`);
  }

  frames[anim] = padded.map((pose, frameIdx) => {
    const lying = isLying(anim, frameIdx);
    const raw = raws.get(pose);
    // 目标身高可以是数组（逐帧），起身就是靠这个做出"越来越高"
    const th = Array.isArray(targetH) ? targetH[frameIdx] : targetH;
    // 站姿一律按目标身高缩放；蹲姿给更矮的目标；躺姿按宽度
    const sized = lying
      ? scaleToWidth(raw, Math.round(CHAR_H * RES * 1.05))
      : scaleToHeight(raw, Math.round((th ?? CHAR_H) * RES));
    const img = quantize(sized, framePalette(sized));
    const ox = -Math.round(lying ? img.width / 2 : legAnchorX(img));
    const rect = { w: img.width, h: img.height, ox, oy: -img.height };
    // 剪影：同一形状整片刷白，受击闪白时直接贴这一帧（比盖白方块干净得多）
    let sil = null;
    if (FLASH_ANIMS.has(anim)) {
      sil = { width: img.width, height: img.height, data: new Uint8Array(img.data) };
      for (let i = 0; i < sil.data.length; i += 4) {
        if (sil.data[i + 3] === 0) continue;
        sil.data[i] = 255;
        sil.data[i + 1] = 255;
        sil.data[i + 2] = 255;
        sil.data[i + 3] = 255;
      }
    }
    return { img, sil, rect: { ...rect } };
  });
}

// ---------- 打包：简单货架（宽高都不大，够用） ----------

/**
 * 分片用的核心动画集：**对战里一定会用到的**。
 *
 * 其余（胜利/挑衅/败北/眩晕/受身/投技起手）放到 `-extra` 片里后台加载——
 * 结算和受身那一下就算晚到几帧，也只是回落程序化一瞬，不会像必杀姿势闪回那么刺眼。
 * 必杀/超必杀姿势**必须在核心片**，否则放必杀的那一下会闪回像素人。
 */
const CORE_ANIMS = new Set([
  // 首屏必需：站架 + 移動 + 防御 + 挨打 + 两个最常用的轻攻击
  // 线上实测（GitHub Pages）单张 2MB 冷缓存要 20~30 秒；只装这几个能把首屏压到 ~0.4MB
  'idle', 'walkF', 'walkB', 'crouch', 'guard', 'hit', 'down', 'punchLight', 'kickLight', 'crouchPunch', 'crouchKick',
]);

const order = [];
for (const [anim, list] of Object.entries(frames)) {
  for (const f of list) order.push({ anim, kind: 'normal', img: f.img, rect: { ...f.rect } });
  for (const f of list) if (f.sil) order.push({ anim, kind: 'flash', img: f.sil, rect: { ...f.rect } });
}

const MAX_W = 2048;

/** 把一组帧货架打包并写出去（png + json），返回图集尺寸 */
function packAndWrite(subset, outImage, outJson, imageName) {
  const placed = subset.map((f) => ({ ...f, rect: { ...f.rect } }));
  let shelfX = 0;
  let shelfY = 0;
  let shelfH = 0;
  for (const f of placed) {
    if (shelfX + f.rect.w > MAX_W) {
      shelfX = 0;
      shelfY += shelfH + 1;
      shelfH = 0;
    }
    f.rect.x = shelfX;
    f.rect.y = shelfY;
    shelfX += f.rect.w + 1;
    shelfH = Math.max(shelfH, f.rect.h);
  }
  const atlasW = MAX_W;
  const atlasH = Math.max(1, shelfY + shelfH);
  const atlas = createImage(atlasW, atlasH);
  for (const f of placed) blit(atlas, f.img, f.rect.x, f.rect.y);
  writeFileSync(outImage, encodePng(atlas));

  const animsJson = {};
  const flashJson = {};
  const pick = (f) => ({ x: f.rect.x, y: f.rect.y, w: f.rect.w, h: f.rect.h, ox: f.rect.ox, oy: f.rect.oy });
  const animNames = [...new Set(subset.map((f) => f.anim))];
  for (const anim of animNames) {
    animsJson[anim] = placed.filter((o) => o.anim === anim && o.kind === 'normal').map(pick);
    const flash = placed.filter((o) => o.anim === anim && o.kind === 'flash').map(pick);
    if (flash.length > 0) flashJson[anim] = flash;
    if (animsJson[anim].length === 0) throw new Error(`动画 ${anim} 一帧都没有`);
  }
  // 别名：源动画在本片才建别名，跨片不建（指向不存在的矩形会让绘制层报错）
  for (const [alias, src] of Object.entries(ALIAS)) {
    if (!animsJson[src]) continue;
    animsJson[alias] = animsJson[src].map((f) => ({ ...f }));
    if (flashJson[src]) flashJson[alias] = flashJson[src].map((f) => ({ ...f }));
  }

  writeFileSync(
    outJson,
    JSON.stringify(
      // scale：一个源像素等于多少世界单位（绘制时宽高都要乘它，否则贴图会被放大 RES 倍）
      { image: imageName, width: atlasW, height: atlasH, scale: 1 / RES, anims: animsJson, flash: flashJson },
      null,
      1,
    ),
  );
  return { w: atlasW, h: atlasH, anims: animNames.length, bytes: 0 };
}

const coreFrames = order.filter((f) => CORE_ANIMS.has(f.anim));
const extraFrames = order.filter((f) => !CORE_ANIMS.has(f.anim));

const core = packAndWrite(coreFrames, OUT_IMAGE, OUT_JSON, `${CHAR_ID}.png`);
const extra = extraFrames.length > 0
  ? packAndWrite(extraFrames, OUT_EXTRA_IMAGE, OUT_EXTRA_JSON, `${CHAR_ID}-extra.png`)
  : null;

console.log(`${CHAR_ID}：缩放 ${scale.toFixed(4)}`);
console.log(`  核心片 ${core.w}×${core.h} · ${core.anims} 个动画`);
if (extra) console.log(`  扩展片 ${extra.w}×${extra.h} · ${extra.anims} 个动画`);
for (const [anim, list] of Object.entries(frames)) {
  console.log(`  ${anim.padEnd(11)} ${list.length} 帧  ${list.map((f) => `${f.rect.w}×${f.rect.h}`).join(' ')}`);
}
