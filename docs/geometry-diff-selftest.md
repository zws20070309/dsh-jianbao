# geometry-diff 自测记录

工具：`tools/geometry-diff.mjs`（Node ESM，零 npm 依赖；PDF 抽取交给系统 python + PyMuPDF）

- 环境：Windows，python 3.10.11，PyMuPDF 1.28.2
- 被测：`D:\Desktop\插件\_tmp\word-export.pdf`
- 参考：`D:\Desktop\插件\远端仓库参考内容\简报\2026下\西藏大学理学院信息〔2026〕74号 西藏大学理学院召开2026级新生见面会暨入学教育动员大会(1).pdf`
- 工作目录：`D:\Desktop\插件`（`tools\geometry-diff.mjs` 是指向 `dsh-jianbao/tools/geometry-diff.mjs` 的一行转发入口）

---

## 1. 基准复刻：应 100% 通过、退出码 0

```powershell
cd "D:\Desktop\插件"
node tools/geometry-diff.mjs _tmp/word-export.pdf "远端仓库参考内容/简报/2026下/西藏大学理学院信息〔2026〕74号 西藏大学理学院召开2026级新生见面会暨入学教育动员大会(1).pdf"
```

真实输出（节选，完整 4 页 45 行全部 `[OK ]`）：

```text
geometry-diff — PDF 版式几何对比（像素级复刻验收）
  ours : D:\Desktop\插件\_tmp\word-export.pdf
  ref  : D:\Desktop\插件\远端仓库参考内容\简报\2026下\西藏大学理学院信息〔2026〕74号 西藏大学理学院召开2026级新生见面会暨入学教育动员大会(1).pdf
  pages: ours 4 / ref 4    pymupdf 1.28.2    tol 0.50pt
  dx = ours - ref（正=我们更靠右）；dy = 基线 y 差（正=我们更靠下）

PAGE 1
  [OK ] dx=+0.00 dy=+0.00  sz=15.96  2026 年 第74 期
  [OK ] dx=+0.00 dy=+0.00  sz=15.96  西藏大学理学院 撰 稿 人：冯某某
  [OK ] dx=+0.00 dy=+0.00  sz=15.96  审签人：李某某 联系方式：13800000002
  [OK ] dx=+0.00 dy=+0.00  sz=21.96  西藏大学理学院召开2026级新生见面会暨入学
  [OK ] dx=+0.00 dy=+0.00  sz=21.96  教育动员大会
  [OK ] dx=+0.00 dy=+0.00  sz=15.96  为给师生搭建沟通交流平台，帮助新生认识学院管理服务团队，
  ...
PAGE 4
  [OK ] dx=+0.00 dy=+0.00  sz=15.00  抄送：校领导、院领导
  [OK ] dx=+0.00 dy=+0.00  sz=15.00  党委（校长）办公室、党委宣传部
  [OK ] dx=+0.00 dy=+0.00  sz=14.04  —
  [OK ] dx=+0.00 dy=+0.00  sz=14.04  4
  [OK ] dx=+0.00 dy=+0.00  sz=14.04  —

BLOCKS (按 y 分桶，桶高 40.00pt；每桶取最靠上的一行)
  p1  y= 252.38  dx=+0.00 dy=+0.00  sz=15.96  2026 年 第74 期
  p1  y= 306.29  dx=+0.00 dy=+0.00  sz=15.96  审签人：李某某 联系方式：13800000002
  ...
  ---- 区块首行偏差 >= 1.00pt ----
  (none)
  ---- 全部偏差 >= 1.00pt 的行（逐条）----
  (none)

SUMMARY
  spans         : ours 45 / ref 45（已剔除纯空白 span）
  matched       : 45
  within tol    : 45
  over tol      : 0
  ours-only     : 0
  ref-only      : 0
  size over tol : 0（仅提示，未纳入判定；--strict-size 可纳入）
  tolerance     : 0.50 pt
  dx            : max|d|=0.00  mean|d|=0.00  mean=+0.00  range=[+0.00, +0.00]
  dy            : max|d|=0.00  mean|d|=0.00  mean=+0.00  range=[+0.00, +0.00]
  size          : max|d|=0.00  mean|d|=0.00
  RESULT        : PASS （exit 0）
```

退出码：**0**

> 注：这里 matched = 45。两份 PDF 的 rawdict span 总数是 79，其中 34 个是纯空白 span（例如 `2026` / `级新生见面会` 之间的那个空格 span），按设计不参与对齐，所以进入比对的是 45 条。

---

## 2. 故障注入：人为把某个 span 的 x 改错 30pt，应报 `[X  ]` 且退出码 1

用内置调试参数 `--shift-test <n>`（n = 被测 PDF 里第 n 个非空白 span，1 起，按全文档出现顺序），
只改内存里的抽取结果，**不动磁盘 PDF**。

```powershell
node tools/geometry-diff.mjs _tmp/word-export.pdf "远端仓库参考内容/简报/2026下/西藏大学理学院信息〔2026〕74号 ....pdf" --shift-test 8
```

真实输出：

```text
geometry-diff — PDF 版式几何对比（像素级复刻验收）
  ...
  [shift-test] 已对第 8 个 span 人为加 x +30.00pt：p1 「教育动员大会」（仅改内存结果，未改动磁盘 PDF）

PAGE 1
  [OK ] dx=+0.00 dy=+0.00  sz=15.96  2026 年 第74 期
  [OK ] dx=+0.00 dy=+0.00  sz=15.96  西藏大学理学院 撰 稿 人：冯某某
  [OK ] dx=+0.00 dy=+0.00  sz=15.96  审签人：李某某 联系方式：13800000002
  [OK ] dx=+0.00 dy=+0.00  sz=21.96  西藏大学理学院召开2026级新生见面会暨入学
  [X  ] dx=+30.00 dy=+0.00  sz=21.96  教育动员大会        <-- 抓到了
  [OK ] dx=+0.00 dy=+0.00  sz=15.96  为给师生搭建沟通交流平台，帮助新生认识学院管理服务团队，
  ...

  ---- 区块首行偏差 >= 1.00pt ----
  (none)
  ---- 全部偏差 >= 1.00pt 的行（逐条）----
  p1  y= 396.65  x0ref= 235.13  dx=+30.00 dy=+0.00  sz=21.96  教育动员大会

SUMMARY
  spans         : ours 45 / ref 45（已剔除纯空白 span）
  matched       : 45
  within tol    : 44
  over tol      : 1
  ours-only     : 0
  ref-only      : 0
  size over tol : 0（仅提示，未纳入判定；--strict-size 可纳入）
  tolerance     : 0.50 pt
  dx            : max|d|=30.00  mean|d|=0.67  mean=+0.67  range=[+0.00, +30.00]
  dy            : max|d|=0.00  mean|d|=0.00  mean=+0.00  range=[+0.00, +0.00]
  size          : max|d|=0.00  mean|d|=0.00
  RESULT        : FAIL （exit 1）
  失败原因      : 1 个 span 超出 0.50pt 容差
```

退出码：**1**

> 这一条同时暴露过一个真实缺陷并已修掉：最初「区块首行偏差」只取桶内最靠上的一行，
> 而「教育动员大会」落在 y 362.07 那一行的同一个桶里（y 396.65），桶首行是
> 「西藏大学理学院召开2026级新生见面会暨入学」，本身 0 偏差，于是整段显示 `(none)`。
> 现在两段都输出：**区块首行偏差**（区块级概览）+ **全部偏差 >= 1pt 的行（逐条）**（不漏任何一条）。

---

## 3. 其它已验证的行为

| 场景 | 命令要点 | 预期 | 实测 |
|------|----------|------|------|
| MISS 检测 | 拿 74 号对比 73 号简报 | 输出 `[MISS ours]` / `[MISS ref ]`，ours-only=29、ref-only=15 | 一致，exit 1 |
| `--only-tol` | 同上加 `--only-tol` | MISS 不算失败 | RESULT: PASS，exit 0 |
| 容差收紧 | `--tol 0` 跑基准对 | 仍全 OK（两份文件几何完全一致） | over tol=0，exit 0 |
| 容差边界 | `--tol 0.6 --shift-amount 0.7` / `0.4` | 0.7 超差、0.4 通过 | FAIL/exit 1 ；PASS/exit 0 |
| 文件不存在 | 指向不存在的 pdf | 报错并 exit 2 | `抽取失败: 文件不存在: ...`，exit 2 |
| python 不可用 | `--python python-not-here` | 报错并 exit 2 | `找不到 Python 可执行文件 ...`，exit 2 |
| 参数缺失 | 只给一个 pdf | 打印用法并 exit 2 | 一致，exit 2 |
| JSON 模式 | `--json --json-compact` | stdout 只有合法 JSON，可被 `ConvertFrom-Json` 解析 | 4 页 / matched=45 / pass=true / 31KB |
| 临时文件 | 跑完后看 `$env:TEMP` | 无 `geometry-diff-*` 残留 | 无残留 |

---

## 4. 退出码约定（CI 用）

| 码 | 含义 |
|----|------|
| 0 | 全部 span 在容差内，且无单侧文本 |
| 1 | 存在超差 span，或存在只在单侧出现的文本（`--only-tol` 可让后者不判失败） |
| 2 | 运行错误（文件不存在 / python 不可用 / PDF 解析失败 / 参数错误） |

CI 里直接用：`node tools/geometry-diff.mjs ours.pdf ref.pdf --tol 0.5`，非 0 即红。
