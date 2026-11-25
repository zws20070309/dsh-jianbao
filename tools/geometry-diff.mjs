#!/usr/bin/env node
/**
 * geometry-diff.mjs — 版式几何对比工具（PDF 像素级复刻验收）
 * ============================================================================
 *
 * 用途：把「我们生成的 PDF」与「参考 PDF」的每一个文字 span 逐行比对，
 *       报告 x0 / 基线 y 的偏差，用于像素级复刻的验收（可进 CI）。
 *
 * 用法（命令行一行跑起来）：
 *   node tools/geometry-diff.mjs <ours.pdf> <ref.pdf>
 *   node tools/geometry-diff.mjs _tmp/word-export.pdf "远端仓库参考内容/....pdf" --tol 0.5
 *   node tools/geometry-diff.mjs a.pdf b.pdf --json          # 机器可读结果（stdout 只有 JSON）
 *   node tools/geometry-diff.mjs a.pdf b.pdf --shift-test 3  # 调试：给第 3 个 span 的 x 人为加 30pt
 *
 * 依赖：只依赖系统里的 python + PyMuPDF（本机 python 3.10.11 / pymupdf 1.28.2）。
 *       不装任何 npm 包；Node 只做对齐与报告，PDF 抽取全部交给 Python。
 *
 * ----------------------------------------------------------------------------
 * 对齐策略
 * ----------------------------------------------------------------------------
 * 参考 PDF 里 block 的出现顺序可能因图片环绕而与我们的不同（实测 page 1：
 * 正文第 4 行起 x0 从 79.46 跳到 371.23，左侧有图环绕，按 block 序号对齐会错位）。
 * 因此不按 block/line 序号对齐，而是：
 *   1. 每个 span 的文本去掉**所有**空白（含 U+3000 全角空格、U+00A0 NBSP）作为 key；
 *   2. 同一页内按 key 建 map，重复 key 按**出现顺序**编号（key#0, key#1 …）；
 *   3. 逐 key 对比 (x0, baseline_y)，dx = ours - ref，dy = ours - ref。
 *      正 dx = 我们更靠右；正 dy = 我们更靠下（PDF 坐标 y 向下增长）。
 *
 * ----------------------------------------------------------------------------
 * 退出码
 * ----------------------------------------------------------------------------
 *   0 = 全部在容差内且无 ours-only / ref-only（100% 复刻）
 *   1 = 存在超差 span，或存在只在一侧出现的文本（--only-tol 可让 MISS 不算失败）
 *   2 = 运行错误（文件不存在 / python 不可用 / PDF 解析失败）—— 与"对比失败"区分开
 *
 * ----------------------------------------------------------------------------
 * 自测记录（已真实跑过，命令与输出见 dsh-jianbao/docs/geometry-diff-selftest.md）
 * ----------------------------------------------------------------------------
 * [1] 基准复刻，期望 100% 通过：
 *     node tools/geometry-diff.mjs _tmp/word-export.pdf "远端仓库参考内容/简报/2026下/....pdf"
 *     -> PAGE 1..4 全部 [OK ]，SUMMARY matched=79 within tol=79 over tol=0
 *        ours-only=0 ref-only=0，dx max|d|=0.000 dy max|d|=0.000，RESULT: PASS，exit 0
 *
 * [2] 故障注入，验证它能抓出偏差：
 *     node tools/geometry-diff.mjs _tmp/word-export.pdf "<同一参考>" --shift-test 8
 *     -> 第 8 个 span「西藏大学理学院召开2026级新生见面会暨入学」被强行右移 30pt：
 *        [X  ] dx=+30.00 dy=+0.00 sz=21.96  西藏大学理学院召开2026级新生见面会暨入学…
 *        SUMMARY over tol=1，BLOCKS 里该行 dx=+30.00 单独列出，
 *        RESULT: FAIL，exit 1
 *
 * --shift-test 只改内存里的抽取结果（不动磁盘 PDF），用来证明比对逻辑真的在工作，
 * 而不是两个文件恰好都读成 0 偏差。
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

// ============================================================================
// 1. 内嵌 Python 抽取器
//    每份 PDF 抽成：页 -> span 列表（bbox / origin / size / font / text）。
//    用 rawdict 拿 origin（基线），这是 span 级对比的关键。
// ============================================================================
const PY_EXTRACTOR = String.raw`
import sys, json, os

try:
    import pymupdf
except ImportError:  # 老版本只有 fitz
    import fitz as pymupdf


def extract(pdf_path):
    doc = pymupdf.open(pdf_path)
    pages = []
    for pno in range(doc.page_count):
        page = doc[pno]
        raw = page.get_text("rawdict")
        spans = []
        image_blocks = 0
        order = 0
        for blk in raw.get("blocks", []):
            btype = blk.get("type")
            if btype == 1:            # 图片块：记数，用于解释行序错乱
                image_blocks += 1
                continue
            if btype != 0:
                continue
            block_no = blk.get("number", -1)
            for ln in blk.get("lines", []):
                direction = ln.get("dir") or [1.0, 0.0]
                for sp in ln.get("spans", []):
                    chars = sp.get("chars") or []
                    text = "".join((ch.get("c") or "") for ch in chars)
                    if not text.strip():      # 纯空白 span 不参与对齐
                        continue
                    bbox = sp.get("bbox") or [0.0, 0.0, 0.0, 0.0]
                    origin = sp.get("origin") or [bbox[0], bbox[3]]
                    spans.append({
                        "order": order,
                        "block": block_no,
                        "text": text,
                        "bbox": [float(bbox[0]), float(bbox[1]), float(bbox[2]), float(bbox[3])],
                        "origin": [float(origin[0]), float(origin[1])],
                        "size": float(sp.get("size") or 0.0),
                        "font": sp.get("font") or "",
                        "flags": int(sp.get("flags") or 0),
                        "color": int(sp.get("color") or 0),
                        "dir": [float(direction[0]), float(direction[1])],
                        "nchars": len(chars),
                    })
                    order += 1
        pages.append({
            "page": pno + 1,
            "width": float(page.rect.width),
            "height": float(page.rect.height),
            "rotation": int(page.rotation),
            "imageBlocks": image_blocks,
            "spans": spans,
        })
    doc.close()
    # pymupdf.version 形如 ('1.28.2', '1.28.2', None)，只取第一段有效版本
    try:
        parts = [str(x) for x in pymupdf.version if x]
        version = parts[0] if parts else "unknown"
    except Exception:
        version = "unknown"
    return {
        "source": os.path.abspath(pdf_path),
        "pymupdf": version,
        "pageCount": len(pages),
        "pages": pages,
    }


def main():
    if len(sys.argv) < 3:
        sys.stderr.write("usage: extractor.py <pdf> <out.json>\n")
        return 2
    pdf_path, out_path = sys.argv[1], sys.argv[2]
    data = extract(pdf_path)
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
`;

// ============================================================================
// 2. 参数解析
// ============================================================================
const USAGE = `geometry-diff.mjs — PDF 版式几何对比（像素级复刻验收）

用法:
  node tools/geometry-diff.mjs <ours.pdf> <ref.pdf> [选项]

选项:
  --tol <pt>             容差，默认 0.5pt（判断 dx/dy 是否超差）
  --json                 输出机器可读 JSON（stdout 只有 JSON），便于脚本消费
  --json-compact         配合 --json：输出单行压缩 JSON
  --max-text <n>         终端里每条文本最多显示多少字符，默认 40
  --bucket <pt>          y 分桶的桶高，默认 40pt（用于"各区块首行偏差"）
  --block-min-diff <pt>  单独列出偏差的阈值，默认 1.0pt
  --only-tol             MISS（只在单侧出现）不算失败，只看 tol
  --strict-size          span 字号差也纳入超差判定
  --max-rows <n>         每页最多打印多少行，0=全部（默认 0）
  --shift-test <n>       调试：给被测侧第 n 个 span（1 起，按全文档出现顺序）人为加 x 偏移
  --shift-amount <pt>    配合 --shift-test，默认 30pt
  --python <exe>         指定 python 可执行文件，默认 python
  -h, --help             显示帮助

退出码:
  0=全部在容差内  1=存在超差/单侧文本  2=运行错误`;

function parseArgs(argv) {
  const opts = {
    ours: null,
    ref: null,
    tol: 0.5,
    json: false,
    jsonCompact: false,
    maxText: 40,
    bucket: 40,
    blockMinDiff: 1.0,
    onlyTol: false,
    strictSize: false,
    maxRows: 0,
    shiftTest: 0,
    shiftAmount: 30,
    python: process.env.PYTHON || 'python',
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    let inline = null;
    const eq = a.indexOf('=');
    if (eq > 0 && a.startsWith('--')) {
      inline = a.slice(eq + 1);
      a = a.slice(0, eq);
    }
    const takeVal = () => {
      if (inline !== null) return inline;
      const v = argv[++i];
      if (v === undefined) throw new Error('参数 ' + a + ' 需要一个值');
      return v;
    };

    switch (a) {
      case '-h':
      case '--help':
        opts.help = true;
        break;
      case '--tol':
        opts.tol = Number(takeVal());
        break;
      case '--json':
        opts.json = true;
        break;
      case '--json-compact':
        opts.jsonCompact = true;
        break;
      case '--max-text':
        opts.maxText = Number(takeVal());
        break;
      case '--bucket':
        opts.bucket = Number(takeVal());
        break;
      case '--block-min-diff':
        opts.blockMinDiff = Number(takeVal());
        break;
      case '--only-tol':
        opts.onlyTol = true;
        break;
      case '--strict-size':
        opts.strictSize = true;
        break;
      case '--max-rows':
        opts.maxRows = Number(takeVal());
        break;
      case '--shift-test':
        opts.shiftTest = Number(takeVal());
        break;
      case '--shift-amount':
        opts.shiftAmount = Number(takeVal());
        break;
      case '--python':
        opts.python = takeVal();
        break;
      default:
        if (a.startsWith('-')) throw new Error('未知参数: ' + a);
        if (opts.ours === null) opts.ours = a;
        else if (opts.ref === null) opts.ref = a;
        else throw new Error('多余的参数: ' + a);
    }
  }

  if (opts.help) return opts;
  if (!opts.ours || !opts.ref) throw new Error('需要两个 PDF 参数: <ours.pdf> <ref.pdf>');
  if (!Number.isFinite(opts.tol) || opts.tol < 0) throw new Error('--tol 必须是非负数');
  if (!Number.isFinite(opts.bucket) || opts.bucket <= 0) throw new Error('--bucket 必须是正数');
  if (!Number.isFinite(opts.maxText) || opts.maxText < 4) throw new Error('--max-text 至少 4');
  if (!Number.isFinite(opts.shiftAmount)) throw new Error('--shift-amount 必须是数字');

  return opts;
}

// ============================================================================
// 3. 调 Python 抽取
// ============================================================================
function runPython(scriptPath, args, pythonExe) {
  const res = spawnSync(pythonExe, [scriptPath, ...args], {
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    timeout: 180000,
    windowsHide: true,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
  });
  if (res.error) {
    if (res.error.code === 'ENOENT') {
      throw new Error(
        '找不到 Python 可执行文件 "' + pythonExe + '"；请确认 python 在 PATH 里，或用 --python 指定完整路径'
      );
    }
    throw new Error('调用 Python 失败: ' + res.error.message);
  }
  if (res.status !== 0) {
    const detail = (res.stderr || res.stdout || '').trim() || '无输出';
    throw new Error('Python 抽取失败（exit ' + res.status + '）:\n' + detail);
  }
  return res.stdout || '';
}

function extractDoc(pdfPath, pythonExe, tmpDir, tag) {
  const abs = path.resolve(pdfPath);
  if (!existsSync(abs)) throw new Error('文件不存在: ' + abs);

  const suffix = randomBytes(4).toString('hex');
  const base = 'geometry-diff-' + tag + '-' + process.pid + '-' + suffix;
  const pyFile = path.join(tmpDir, base + '.py');
  const jsonFile = path.join(tmpDir, base + '.json');

  try {
    writeFileSync(pyFile, PY_EXTRACTOR, 'utf8');
    runPython(pyFile, [abs, jsonFile], pythonExe);
    if (!existsSync(jsonFile)) throw new Error('Python 未生成结果文件: ' + jsonFile);
    const raw = readFileSync(jsonFile, 'utf8');
    let doc;
    try {
      doc = JSON.parse(raw);
    } catch (err) {
      throw new Error('抽取结果不是合法 JSON: ' + err.message);
    }
    doc.source = doc.source || abs;
    return doc;
  } finally {
    for (const f of [pyFile, jsonFile]) {
      try {
        if (existsSync(f)) unlinkSync(f);
      } catch {
        /* 临时文件删不掉不影响结果 */
      }
    }
  }
}

// ============================================================================
// 4. 对齐
// ============================================================================
// JS 的 \s 已覆盖普通空格、\t、\n、\u00A0(NBSP)、\u3000(全角空格)。
// 额外补上零宽字符与软连字符，防止从 Word/PDF 带进来的不可见字符拆散 key。
const WS_RE = /[\s\u00a0\u3000\u200b\u200c\u200d\u2060\ufeff\u00ad]+/g;

function normKey(text) {
  return String(text).replace(WS_RE, '');
}

function buildIndex(spans) {
  const map = new Map();
  for (const sp of spans) {
    const key = normKey(sp.text);
    if (!key) continue;
    sp.key = key;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(sp);
  }
  for (const list of map.values()) {
    list.forEach((sp, i) => {
      sp.occ = i;
    });
  }
  return map;
}

function applyShiftTest(docs, n, amount) {
  let seen = 0;
  for (const page of docs.pages) {
    for (const sp of page.spans) {
      if (!normKey(sp.text)) continue;
      seen++;
      if (seen !== n) continue;
      sp.bbox[0] += amount;
      sp.bbox[2] += amount;
      sp.origin[0] += amount;
      sp.injectedShift = amount;
      return { index: n, amount, page: page.page, text: sp.text, x0: sp.bbox[0], baselineY: sp.origin[1] };
    }
  }
  return null;
}

function compareDocuments(oursDoc, refDoc, opts) {
  const pageCount = Math.max(oursDoc.pages.length, refDoc.pages.length);
  const pagesOut = [];
  const totals = {
    matched: 0,
    within: 0,
    over: 0,
    oursOnly: 0,
    refOnly: 0,
    oursSpans: 0,
    refSpans: 0,
    sizeOver: 0,
  };
  const dxs = [];
  const dys = [];
  const dszs = [];
  const overRows = [];

  for (let pi = 0; pi < pageCount; pi++) {
    const oursPage = oursDoc.pages[pi] || { page: pi + 1, spans: [] };
    const refPage = refDoc.pages[pi] || { page: pi + 1, spans: [] };

    const oursSpans = (oursPage.spans || []).filter((s) => normKey(s.text));
    const refSpans = (refPage.spans || []).filter((s) => normKey(s.text));
    totals.oursSpans += oursSpans.length;
    totals.refSpans += refSpans.length;

    const oursIdx = buildIndex(oursSpans);
    const refIdx = buildIndex(refSpans);

    const rows = [];
    const usedOurs = new Set();

    // 以参考侧为基准顺序逐条配对
    for (const [key, refList] of refIdx) {
      const oursList = oursIdx.get(key) || [];
      const pairs = Math.min(refList.length, oursList.length);
      for (let k = 0; k < pairs; k++) {
        const r = refList[k];
        const o = oursList[k];
        usedOurs.add(o);
        const dx = o.bbox[0] - r.bbox[0];
        const dy = o.origin[1] - r.origin[1];
        const dsz = o.size - r.size;
        const dxOK = Math.abs(dx) <= opts.tol;
        const dyOK = Math.abs(dy) <= opts.tol;
        const szOK = Math.abs(dsz) <= opts.tol;
        const ok = dxOK && dyOK && (!opts.strictSize || szOK);
        if (!szOK) totals.sizeOver++;
        totals.matched++;
        if (ok) totals.within++;
        else totals.over++;
        dxs.push(dx);
        dys.push(dy);
        dszs.push(dsz);
        const row = {
          kind: 'match',
          status: ok ? 'ok' : 'over',
          page: pi + 1,
          key,
          occ: k,
          text: r.text,
          dx,
          dy,
          dsz,
          dxOK,
          dyOK,
          szOK,
          ours: {
            x0: o.bbox[0], y0: o.bbox[1], x1: o.bbox[2], y1: o.bbox[3],
            baselineX: o.origin[0], baselineY: o.origin[1],
            size: o.size, font: o.font,
          },
          ref: {
            x0: r.bbox[0], y0: r.bbox[1], x1: r.bbox[2], y1: r.bbox[3],
            baselineX: r.origin[0], baselineY: r.origin[1],
            size: r.size, font: r.font,
          },
          sortY: r.origin[1],
          sortX: r.bbox[0],
        };
        rows.push(row);
        if (!ok) overRows.push(row);
      }
      // 参考侧多出来的重复 key
      for (let k = pairs; k < refList.length; k++) {
        const r = refList[k];
        totals.refOnly++;
        rows.push({
          kind: 'ref-only',
          status: 'ref-only',
          page: pi + 1,
          key,
          occ: k,
          text: r.text,
          ref: {
            x0: r.bbox[0], y0: r.bbox[1], x1: r.bbox[2], y1: r.bbox[3],
            baselineX: r.origin[0], baselineY: r.origin[1],
            size: r.size, font: r.font,
          },
          sortY: r.origin[1],
          sortX: r.bbox[0],
        });
      }
    }

    // 我们侧独有的 span
    for (const o of oursSpans) {
      if (usedOurs.has(o)) continue;
      totals.oursOnly++;
      rows.push({
        kind: 'ours-only',
        status: 'ours-only',
        page: pi + 1,
        key: o.key,
        occ: o.occ,
        text: o.text,
        ours: {
          x0: o.bbox[0], y0: o.bbox[1], x1: o.bbox[2], y1: o.bbox[3],
          baselineX: o.origin[0], baselineY: o.origin[1],
          size: o.size, font: o.font,
        },
        sortY: o.origin[1],
        sortX: o.bbox[0],
      });
    }

    // 按阅读顺序（基线 y，再 x）排，让 MISS 落在它该出现的位置
    rows.sort((a, b) => a.sortY - b.sortY || a.sortX - b.sortX);
    for (const r of rows) {
      delete r.sortY;
      delete r.sortX;
    }

    pagesOut.push({
      page: pi + 1,
      rows,
      oursSpanCount: oursSpans.length,
      refSpanCount: refSpans.length,
    });
  }

  const stat = (arr) => {
    if (!arr.length) return { maxAbs: 0, meanAbs: 0, mean: 0, min: 0, max: 0, n: 0 };
    let maxAbs = 0;
    let sumAbs = 0;
    let sum = 0;
    let min = Infinity;
    let max = -Infinity;
    for (const v of arr) {
      const a = Math.abs(v);
      if (a > maxAbs) maxAbs = a;
      sumAbs += a;
      sum += v;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    return { maxAbs, meanAbs: sumAbs / arr.length, mean: sum / arr.length, min, max, n: arr.length };
  };

  const blocks = buildBlocks(pagesOut, opts);

  // 所有 |dx| 或 |dy| >= blockMinDiff 的行，逐条列出（不只桶首行：
  // 偏差可能落在桶内非首行，只报首行会漏）。
  const deviations = [];
  for (const page of pagesOut) {
    for (const r of page.rows) {
      if (r.kind !== 'match') continue;
      const absMax = Math.max(Math.abs(r.dx), Math.abs(r.dy));
      if (absMax < opts.blockMinDiff) continue;
      deviations.push({
        page: r.page,
        text: r.text,
        x0: r.ref.x0,
        y: r.ref.baselineY,
        dx: r.dx,
        dy: r.dy,
        size: r.ours.size,
        absMax,
      });
    }
  }

  const failed = totals.over > 0 || (!opts.onlyTol && (totals.oursOnly > 0 || totals.refOnly > 0));

  return {
    tol: opts.tol,
    pages: pagesOut,
    totals,
    stats: { dx: stat(dxs), dy: stat(dys), dsz: stat(dszs) },
    over: overRows,
    blocks,
    deviations,
    failed,
    exitCode: failed ? 1 : 0,
  };
}

// ============================================================================
// 5. y 分桶：各区块的首行偏差
// ============================================================================
function buildBlocks(pagesOut, opts) {
  const out = [];
  for (const page of pagesOut) {
    const matches = page.rows.filter((r) => r.kind === 'match');
    if (!matches.length) continue;
    const buckets = new Map();
    for (const r of matches) {
      const y = r.ref.baselineY;
      const bi = Math.floor(y / opts.bucket);
      const cur = buckets.get(bi);
      if (!cur || y < cur.y) {
        buckets.set(bi, {
          page: page.page,
          bucket: bi,
          y,
          x0: r.ref.x0,
          dx: r.dx,
          dy: r.dy,
          size: r.ours.size,
          text: r.text,
          status: r.status,
        });
      }
    }
    const list = [...buckets.values()].sort((a, b) => a.y - b.y);
    for (const b of list) {
      const absMax = Math.max(Math.abs(b.dx), Math.abs(b.dy));
      b.over = absMax >= opts.blockMinDiff;
      b.absMax = absMax;
      out.push(b);
    }
  }
  return out;
}

// ============================================================================
// 6. 渲染
// ============================================================================
const to2 = (v) => (Math.abs(v) < 0.005 ? 0 : v);
function signed(v, digits = 2) {
  const z = to2(v);
  const s = Math.abs(z).toFixed(digits);
  return z < 0 ? '-' + s : '+' + s;
}
function plain(v, digits = 2) {
  return to2(v).toFixed(digits);
}
function truncate(text, max) {
  const shown = String(text).replace(WS_RE, ' ').trim();
  const chars = Array.from(shown);
  if (chars.length <= max) return shown;
  return chars.slice(0, max).join('') + '…';
}
function padLeft(s, n) {
  return String(s).padStart(n, ' ');
}

const TAG_OK = '[OK ]';
const TAG_X = '[X  ]';

function renderReport(ctx) {
  const opts = ctx.opts;
  const oursDoc = ctx.oursDoc;
  const refDoc = ctx.refDoc;
  const result = ctx.result;
  const shift = ctx.shift;
  const L = [];
  L.push('geometry-diff — PDF 版式几何对比（像素级复刻验收）');
  L.push('  ours : ' + oursDoc.source);
  L.push('  ref  : ' + refDoc.source);
  L.push(
    '  pages: ours ' + oursDoc.pageCount + ' / ref ' + refDoc.pageCount +
    '    pymupdf ' + (oursDoc.pymupdf || '?') +
    '    tol ' + plain(opts.tol) + 'pt'
  );
  L.push('  dx = ours - ref（正=我们更靠右）；dy = 基线 y 差（正=我们更靠下）');
  if (shift) {
    L.push(
      '  [shift-test] 已对第 ' + shift.index + ' 个 span 人为加 x ' + signed(shift.amount) +
      'pt：p' + shift.page + ' 「' + truncate(shift.text, 24) + '」（仅改内存结果，未改动磁盘 PDF）'
    );
  }
  L.push('');

  const rowLimit = opts.maxRows > 0 ? opts.maxRows : Infinity;

  for (const page of result.pages) {
    L.push('PAGE ' + page.page);
    if (!page.rows.length) {
      L.push('  (无文字 span)');
      L.push('');
      continue;
    }
    let printed = 0;
    for (const r of page.rows) {
      if (printed >= rowLimit) {
        L.push('  … 另有 ' + (page.rows.length - printed) + ' 行未打印（--max-rows）');
        break;
      }
      printed++;
      if (r.kind === 'match') {
        const tag = r.status === 'ok' ? TAG_OK : TAG_X;
        const sizeNote = r.szOK ? '' : '  !sz(ref=' + plain(r.ref.size) + ')';
        L.push(
          '  ' + tag + ' dx=' + signed(r.dx) + ' dy=' + signed(r.dy) +
          '  sz=' + plain(r.ours.size) + '  ' + truncate(r.text, opts.maxText) + sizeNote
        );
      } else if (r.kind === 'ours-only') {
        L.push(
          '  [MISS ours]  x=' + plain(r.ours.x0) + ' y=' + plain(r.ours.baselineY) +
          ' sz=' + plain(r.ours.size) + '  ' + truncate(r.text, opts.maxText)
        );
      } else {
        L.push(
          '  [MISS ref ]  x=' + plain(r.ref.x0) + ' y=' + plain(r.ref.baselineY) +
          ' sz=' + plain(r.ref.size) + '  ' + truncate(r.text, opts.maxText)
        );
      }
    }
    L.push('');
  }

  // ---- 区块首行偏差 ----
  L.push('BLOCKS (按 y 分桶，桶高 ' + plain(opts.bucket) + 'pt；每桶取最靠上的一行)');
  if (!result.blocks.length) {
    L.push('  (无可对比行)');
  } else {
    for (const b of result.blocks) {
      L.push(
        '  p' + b.page + '  y=' + padLeft(plain(b.y), 7) +
        '  dx=' + signed(b.dx) + ' dy=' + signed(b.dy) +
        '  sz=' + plain(b.size) + '  ' + truncate(b.text, opts.maxText)
      );
    }
  }
  const hot = result.blocks.filter((b) => b.over);
  L.push('  ---- 区块首行偏差 >= ' + plain(opts.blockMinDiff) + 'pt ----');
  if (!hot.length) {
    L.push('  (none)');
  } else {
    for (const b of hot) {
      L.push(
        '  p' + b.page + '  y=' + padLeft(plain(b.y), 7) +
        '  dx=' + signed(b.dx) + ' dy=' + signed(b.dy) +
        '  |d|max=' + plain(b.absMax) +
        '  ' + truncate(b.text, opts.maxText)
      );
    }
  }

  // 逐条列出全部超阈偏差（含桶内非首行）
  L.push('  ---- 全部偏差 >= ' + plain(opts.blockMinDiff) + 'pt 的行（逐条）----');
  if (!result.deviations.length) {
    L.push('  (none)');
  } else {
    for (const d of result.deviations) {
      L.push(
        '  p' + d.page + '  y=' + padLeft(plain(d.y), 7) +
        '  x0ref=' + padLeft(plain(d.x0), 7) +
        '  dx=' + signed(d.dx) + ' dy=' + signed(d.dy) +
        '  sz=' + plain(d.size) +
        '  ' + truncate(d.text, opts.maxText)
      );
    }
  }
  L.push('');

  // ---- 汇总 ----
  const t = result.totals;
  const s = result.stats;
  L.push('SUMMARY');
  L.push('  spans         : ours ' + t.oursSpans + ' / ref ' + t.refSpans + '（已剔除纯空白 span）');
  L.push('  matched       : ' + t.matched);
  L.push('  within tol    : ' + t.within);
  L.push('  over tol      : ' + t.over);
  L.push('  ours-only     : ' + t.oursOnly);
  L.push('  ref-only      : ' + t.refOnly);
  L.push(
    '  size over tol : ' + t.sizeOver +
    (opts.strictSize ? '（已纳入失败判定）' : '（仅提示，未纳入判定；--strict-size 可纳入）')
  );
  L.push('  tolerance     : ' + plain(opts.tol) + ' pt');
  L.push(
    '  dx            : max|d|=' + plain(s.dx.maxAbs) + '  mean|d|=' + plain(s.dx.meanAbs) +
    '  mean=' + signed(s.dx.mean) + '  range=[' + signed(s.dx.min) + ', ' + signed(s.dx.max) + ']'
  );
  L.push(
    '  dy            : max|d|=' + plain(s.dy.maxAbs) + '  mean|d|=' + plain(s.dy.meanAbs) +
    '  mean=' + signed(s.dy.mean) + '  range=[' + signed(s.dy.min) + ', ' + signed(s.dy.max) + ']'
  );
  L.push('  size          : max|d|=' + plain(s.dsz.maxAbs) + '  mean|d|=' + plain(s.dsz.meanAbs));
  L.push('  RESULT        : ' + (result.failed ? 'FAIL' : 'PASS') + ' （exit ' + result.exitCode + '）');
  if (result.failed) {
    const reasons = [];
    if (t.over > 0) reasons.push(t.over + ' 个 span 超出 ' + plain(opts.tol) + 'pt 容差');
    if (t.oursOnly > 0) reasons.push(t.oursOnly + ' 个文本只在 ours 出现');
    if (t.refOnly > 0) reasons.push(t.refOnly + ' 个文本只在 ref 出现');
    L.push('  失败原因      : ' + reasons.join('；'));
  }

  return L.join('\n');
}

function buildJson(ctx) {
  const opts = ctx.opts;
  const oursDoc = ctx.oursDoc;
  const refDoc = ctx.refDoc;
  const result = ctx.result;
  const shift = ctx.shift;
  const t = result.totals;
  const s = result.stats;
  const num = (v) => (v === undefined ? null : v);
  return {
    tool: 'geometry-diff',
    version: 1,
    generatedAt: new Date().toISOString(),
    inputs: {
      ours: oursDoc.source,
      ref: refDoc.source,
      oursPages: oursDoc.pageCount,
      refPages: refDoc.pageCount,
      pymupdf: oursDoc.pymupdf,
    },
    options: {
      tol: opts.tol,
      bucket: opts.bucket,
      blockMinDiff: opts.blockMinDiff,
      onlyTol: opts.onlyTol,
      strictSize: opts.strictSize,
    },
    shiftTest: shift
      ? { index: shift.index, amount: shift.amount, page: shift.page, text: shift.text }
      : null,
    summary: {
      oursSpans: t.oursSpans,
      refSpans: t.refSpans,
      matched: t.matched,
      withinTolerance: t.within,
      overTolerance: t.over,
      oursOnly: t.oursOnly,
      refOnly: t.refOnly,
      sizeOverTolerance: t.sizeOver,
      dx: s.dx,
      dy: s.dy,
      sizeDiff: s.dsz,
      pass: !result.failed,
      exitCode: result.exitCode,
    },
    blocks: {
      bucketHeight: opts.bucket,
      blockMinDiff: opts.blockMinDiff,
      entries: result.blocks,
      overThreshold: result.blocks.filter((b) => b.over),
      deviations: result.deviations,
    },
    pages: result.pages.map((p) => ({
      page: p.page,
      oursSpanCount: p.oursSpanCount,
      refSpanCount: p.refSpanCount,
      rows: p.rows.map((r) => ({
        kind: r.kind,
        status: r.status,
        key: r.key,
        occ: r.occ,
        text: r.text,
        dx: num(r.dx),
        dy: num(r.dy),
        dsz: num(r.dsz),
        dxOK: num(r.dxOK),
        dyOK: num(r.dyOK),
        szOK: num(r.szOK),
        ours: r.ours || null,
        ref: r.ref || null,
      })),
    })),
    overTolerance: result.over.map((r) => ({
      page: r.page,
      text: r.text,
      dx: r.dx,
      dy: r.dy,
      dsz: r.dsz,
      ours: r.ours,
      ref: r.ref,
    })),
  };
}

// ============================================================================
// 7. main
// ============================================================================
function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write('参数错误: ' + err.message + '\n\n' + USAGE);
    return 2;
  }
  if (opts.help) {
    process.stdout.write(USAGE);
    return 0;
  }

  const tmpDir = tmpdir();
  let oursDoc;
  let refDoc;
  try {
    oursDoc = extractDoc(opts.ours, opts.python, tmpDir, 'ours');
    refDoc = extractDoc(opts.ref, opts.python, tmpDir, 'ref');
  } catch (err) {
    process.stderr.write('抽取失败: ' + err.message + '\n');
    return 2;
  }

  let shift = null;
  if (opts.shiftTest > 0) {
    shift = applyShiftTest(oursDoc, opts.shiftTest, opts.shiftAmount);
    if (!shift) {
      const total = oursDoc.pages.reduce((a, p) => a + p.spans.length, 0);
      process.stderr.write('--shift-test ' + opts.shiftTest + ' 越界：被测 PDF 只有 ' + total + ' 个 span\n');
      return 2;
    }
  }

  const result = compareDocuments(oursDoc, refDoc, opts);
  const ctx = { opts, oursDoc, refDoc, result, shift };

  if (opts.json) {
    const payload = buildJson(ctx);
    process.stdout.write(
      (opts.jsonCompact ? JSON.stringify(payload) : JSON.stringify(payload, null, 2)) + '\n'
    );
  } else {
    process.stdout.write(renderReport(ctx) + '\n');
  }
  return result.exitCode;
}

process.exitCode = main();
