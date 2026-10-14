# 配乐工具

游戏里的 15 首循环曲目和 5 段音效短句都是为本项目写的原创作品：旋律、和声与编曲写在
`tracks.py` / `sfx.py` 里，用 [FluidR3 GM](https://member.keymusician.com/Member/FluidR3_GM/) 音色库（MIT 许可）渲染。

## 依赖

- Python 3，`mido`、`numpy`
- FluidSynth 2.x，FluidR3_GM.sf2（默认路径 `/usr/share/sounds/sf2/FluidR3_GM.sf2`，见 `mus.py` 的 `SF2`）
- ffmpeg（带 libmp3lame）

## 用法

```bash
cd fortune-ruin/tools/music
python3 tracks.py              # 渲染全部曲目到 out/
python3 tracks.py poker home   # 只渲染其中几首
python3 sfx.py                 # 渲染音效短句
python3 checkloop.py casino_day poker   # 检查循环接缝
python3 analyze.py             # 检查旋律在强拍上与和弦的冲突音
```

渲染完成后把 `out/<名字>.mp3` 复制到 `src/audio/music/`（音效是 `out/sfx_<名字>.mp3` → `src/audio/sfx/<名字>.mp3`），
并把 `out/<名字>.json` 里的 `loopStart`、`period`、`seconds` 填进 `src/audio/tracks.ts`。

## 无缝循环是怎么做的

- 每首曲子按「整小节」定长（`Song.finish`），MIDI 里连续写三遍；取第二遍作为循环体，这样曲尾的混响和余音自然
  延续到曲首。文件 = 一个循环周期 + 1 秒尾巴，游戏在 `loopStart + 0.25 s` 到 `loopStart + 0.25 s + period` 之间
  原生循环（0.25 s 用来跳过 MP3 编码器在文件头加的延迟）。
- FluidSynth 以 64 个采样为一块、按整毫秒派发 MIDI 事件，所以循环周期必须是 0.64 秒的整数倍
  （渲染时会检查，速度和小节数要配合着选）。
- FluidSynth 自带的混响用了调制延迟线，每一遍都略有不同，会破坏循环；因此先干声渲染，再用 numpy 做线性卷积混响
  （合成的立体声厅堂脉冲响应，高频衰减更快）。另渲染一份「按各声部混响发送量加权」的混音作为混响输入，
  每个乐器仍有各自的混响量。合唱效果的 LFO 速率调成每个周期整数圈。
- 结果：无损渲染的接缝处前后两遍逐样本一致（或差异低于 −59 dB），MP3 解码后接缝处的跳变也小于正常的相邻采样差。
- 混音平衡：每个声部先单独渲染测响度（LUFS，静音段会被门限排除），再按角色（主旋律、伴奏、贝斯、鼓……）
  调到相对主旋律的目标电平（`mus.autobalance`）。整首曲子最后统一做一次线性增益到约 −17 LUFS，峰值留 1 dB 余量。
