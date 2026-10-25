/**
 * 街机通关结局：每个角色一句自己的话。
 *
 * 原来通关只有一句「你打赢了大蛇」，无论用谁通关都一样 —— 29 个角色打穿同一条路线
 * 却拿到同一句话，等于没有"我赢了"的感觉。
 *
 * 纯数据 + 纯函数，测试能钉住"每个角色都有专属结局、没有套用别人的名字"。
 */

export interface EndingText {
  /** 结局小标题（四个字以内，印在大标题下面） */
  headline: string;
  /** 结局正文：一两句，第二人称旁白 */
  line: string;
}

/** 通用兜底：新加角色还没写结局时用它，不会露出"undefined" */
export function genericEnding(charName: string): EndingText {
  return {
    headline: '新的传说',
    line: `${charName}把大蛇封印回去，转身离开。下一届大会，还会有人记得今天。`,
  };
}

const ENDINGS: Record<string, EndingText> = {
  kyo: {
    headline: '炎之宿命',
    line: '「这点火候，还不够。」草薙京把校服搭在肩上，走进了晨光里。火焰还没有熄灭。',
  },
  iori: {
    headline: '月下紫焰',
    line: '八神庵擦掉手上的血，抬头看了一眼残月。宿敌还活着，这已经足够他再等一年。',
  },
  benimaru: {
    headline: '闪电的电击',
    line: '二阶堂红丸理了理头发：「胜利也要保持好看。」雷光在他身后散去，闪光灯亮成一片。',
  },
  daimon: {
    headline: '大地不动',
    line: '大门五郎把对手扶起来，拍了拍他肩上的灰。柔道不需要欢呼，只需要站稳。',
  },
  terry: {
    headline: '传说之狼',
    line: '特瑞把帽子压低：「你还好吗？」他对着天空问了一句，然后笑着走向下一个城镇。',
  },
  andy: {
    headline: '不知火之影',
    line: '安迪收势，骨节轻响。他把「最强」两个字留给哥哥，自己继续追那道更远的光。',
  },
  joe: {
    headline: '热血拳王',
    line: '乔甩了甩拳头：「这就是泰拳的热血！」台下的欢呼，他一个都舍不得漏掉。',
  },
  ryo: {
    headline: '极限流不灭',
    line: '坂崎亮对着空旷的擂台行了一礼。极限流不靠天赋，靠今天比昨天多打一拳。',
  },
  robert: {
    headline: '百万美元的一击',
    line: '罗伯特整理好西装袖口：「这一拳，值一个亿。」他掏出手机，先给由莉报了平安。',
  },
  yuri: {
    headline: '最强之妹',
    line: '坂崎由莉跳起来挥拳：「看见没！我可是比哥哥还厉害！」说完自己也笑弯了腰。',
  },
  leona: {
    headline: '寂静之刃',
    line: '莉安娜收刀，短发被夜风吹起。她终于能安静地站着，不再听见那声爆炸。',
  },
  ralf: {
    headline: '钢铁上校',
    line: '拉尔夫把军帽扣回头上：「任务完成。」他咧嘴一笑，牙比月光还亮。',
  },
  clark: {
    headline: '铁腕',
    line: '克拉克松开手臂的锁扣，扶了扶墨镜。倒在地上的人还不知道刚才发生了什么。',
  },
  athena: {
    headline: '超能力偶像',
    line: '雅典娜对着镜头比了个心：「谢谢大家！」超能力的光点，像舞台的彩带一样散开。',
  },
  kensou: {
    headline: '包子拳的骄傲',
    line: '椎拳崇摸了摸肚子：「打赢了，可以去吃包子了吧？」他说这话的时候，眼睛已经亮了。',
  },
  chin: {
    headline: '醉翁之意',
    line: '镇元斋灌了一口酒，打了个嗝：「年轻人，酒要慢慢喝，拳要快快出。」',
  },
  kim: {
    headline: '正义的化身',
    line: '金家藩站得笔直：「正义必胜！」他转身就开始纠正围观群众的站姿。',
  },
  chang: {
    headline: '铁球落地',
    line: '陈国汉把铁球扛回肩上，憨憨地笑了。蔡宝奇在他肩上小声说：「喂，放我下来。」',
  },
  choi: {
    headline: '小个子的大野心',
    line: '蔡宝奇踩着铁球转了个圈：「本大爷天下第一！」陈国汉在后面挠头，不知道该不该鼓掌。',
  },
  billy: {
    headline: '棍之美学',
    line: '比利把棍子立在脚边，舔了舔嘴角：「下次收你双倍。」说完自己先乐了。',
  },
  eiji: {
    headline: '影之二刀',
    line: '如月影二收刀入鞘，身影融进夜色。他要的从来不是冠军，只是那个人回头看他一眼。',
  },
  shingo: {
    headline: '笨鸟先飞',
    line: '矢吹真吾掏出笔记本：「今天的胜利，也要记下来！」他写得很认真，字还是歪的。',
  },
  yashiro: {
    headline: '大地之力',
    line: '七枷社握了握拳，脚边的碎石浮起来。他笑得温和：「这样，就够强了吧？」',
  },
  shermie: {
    headline: '雷电之舞',
    line: '夏尔米转了个圈，紫发在电光里散开：「结束了哦。」她笑着，眼神却冷了一瞬。',
  },
  chris: {
    headline: '焰之少年',
    line: '克里斯眨了眨眼，像是刚从一场长梦里醒来。火焰熄了，他还不确定自己是谁。',
  },
  orochi_iori: {
    headline: '狂气之月',
    line: '紫焰烧尽理智，八神庵的笑声在月下回荡。他说不清自己刚才救了谁，还是毁了谁。',
  },
  orochi_leona: {
    headline: '觉醒之静',
    line: '莉安娜的瞳孔褪回原来的颜色。她低头看着自己的手，很久没有说话。',
  },
  goenitz: {
    headline: '风之教义',
    line: '暴风停了。盖尼茨合上眼：「吾主，还不到时候。」他的身影散成四道风。',
  },
  orochi: {
    headline: '大蛇降临',
    line: '「人类的时代，该结束了。」——但这一次，站到最后的是人类。你封住了那条门。',
  },
};

/**
 * 取某角色的结局。
 *
 * 找不到就返回通用结局（带角色名），绝不返回 `undefined` —— 结局屏是玩家打完 8 场
 * 才看到的那一屏，那里露出空白比"不够专属"难受得多。
 */
export function endingFor(charId: string, charName: string): EndingText {
  return ENDINGS[charId] ?? genericEnding(charName);
}

/** 测试/文档用：有哪些角色已经有专属结局 */
export function endingIds(): string[] {
  return Object.keys(ENDINGS);
}
