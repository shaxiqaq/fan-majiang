// 入口：读存档或发一局，再挂界面（spec.md 第 7.1 节）。
import './style.css';
import { newGame, emit, syncClock } from './game/state';
import { loadGame, loadPrefs, savePrefs, saveGame, startAutosave } from './game/save';
import { mountApp, RULES } from './ui/app';
import { orient } from './ui/board';

const applyOrient = () => {
  const p = orient() === 'portrait';
  document.body.classList.toggle('portrait', p);
  document.body.classList.toggle('landscape', !p);
};
applyOrient();
addEventListener('resize', applyOrient);
document.addEventListener('visibilitychange', () => {
  syncClock();
  if (document.visibilityState === 'hidden') saveGame();
});

const prefs = loadPrefs();
const loaded = loadGame();
let startNote: { text: string; tone?: string; ms: number } | undefined;
if (loaded === 'bad') startNote = { text: '上一局的存档读不出来，已经开了新局', tone: 'warn', ms: 6000 };
else if (loaded === 'none' && !prefs.seenRules) {
  // 第一次打开：直接按"普通"发一局，并在侧栏说明玩法（只这一次自动出现）
  startNote = { text: RULES, ms: 60000 };
  savePrefs({ ...prefs, seenRules: true });
}

startAutosave();
mountApp(document.getElementById('app')!, { startNote });
if (loaded === 'ok') emit();
else newGame(prefs.lastDiff);
