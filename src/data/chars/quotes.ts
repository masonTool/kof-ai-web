/**
 * 胜利台词。每个角色 2~3 句，结果是"按胜场数取模"挑一句——
 * 不用随机数：随机会让回放/录屏里的台词跟原局对不上，而这里本来也不需要真随机。
 */

export interface CharQuotes {
  win: readonly string[];
}

const FALLBACK: CharQuotes = { win: ['勝負あり。'] };

export const QUOTES: Record<string, CharQuotes> = {
  kyo: { win: ['この程度か。', 'まだまだやな。', '火が足りん。'] },
  iori: { win: ['退屈だ。', '月を見るか？'] },
  benimaru: { win: ['派手に行こうぜ。', '俺の雷、見たか？'] },
  daimon: { win: ['力が違う。', '土を舐めろ。'] },
  terry: { win: ['OK, 参ったか？', '力こそ正義だ。'] },
  andy: { win: ['修行が足りないな。', '忍びの心を忘れるな。'] },
  joe: { win: ['タイフーン！', '熱いだろ？'] },
  ryo: { win: ['極限流の名に懸けて。', 'まだまだ修行が足りん。'] },
  robert: { win: ['伊達に金は積んでない。', 'もう終わりか？'] },
  yuri: { win: ['やったー！', '極限流、最強！'] },
  leona: { win: ['任務完了。', '……終わり。'] },
  ralf: { win: ['これが戦場だ。', '根性見せろ！'] },
  clark: { win: ['いただきだ。', '目が眩んだか。'] },
  athena: { win: ['サイコパワー、受けてみた？', 'みんな、ありがとう！'] },
  kensou: { win: ['肉まん食いてえ。', '俺だってやる時はやる！'] },
  chin: { win: ['ひっひっ、若いのぉ。', '酒がうまいぞ。'] },
  kim: { win: ['正義は勝つ！', '鍛錬あるのみ。'] },
  chang: { win: ['鉄球の重さを知ったか。', 'ふん、弱いな。'] },
  choi: { win: ['ちょろいちょろい！', '爪が痛いか？'] },
  billy: { win: ['三節棍の餌食だ。', '火遊びは好きか？'] },
  eiji: { win: ['影に消えろ。', '斬鉄、受けてみよ。'] },
  shingo: { win: ['師匠、見てましたか！', 'まだまだだけど…勝った！'] },
  yashiro: { win: ['大地の重みだ。', '潰れちまえ。'] },
  shermie: { win: ['雷に撃たれたい？', 'ふふ、可愛い。'] },
  chris: { win: ['炎は消せないよ。', '弱いね。'] },
  orochi_iori: { win: ['……泣け。', '月が赤い。'] },
  orochi_leona: { win: ['……排除。', '静かに。'] },
  goenitz: { win: ['風よ、彼らを悼め。', '大蛇の意志だ。'] },
  orochi: { win: ['全ては無に帰す。', '人よ、消えよ。'] },
};

/** 取一句胜利台词（按胜场数轮换，确定性） */
export function winQuoteFor(charId: string, wins = 0): string {
  const list = QUOTES[charId]?.win ?? FALLBACK.win;
  const index = Math.abs(Math.trunc(wins)) % list.length;
  return list[index] ?? FALLBACK.win[0]!;
}

/** 该角色有没有专属台词（自测用：防止加了角色忘了写） */
export function hasQuotes(charId: string): boolean {
  return QUOTES[charId] !== undefined;
}
