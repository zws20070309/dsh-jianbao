/**
 * 学院简报（西藏大学理学院）文风语料库
 *
 * 数据来源：\`远端仓库参考内容/简报\` 下 **63 篇** .docx 简报的实测统计。
 * 解析方式：zipfile 读 word/document.xml，xml.etree 按
 * {http://schemas.openxmlformats.org/wordprocessingml/2006/main} 命名空间遍历
 * w:p → 拼接全部 w:t，w:tab 记作 \t；w:sz 取值判断字号（44=22pt 二号标题）。
 *
 * 全量口径：63 篇 / 239 个正文段 / 正文 34,358 字 / 标题 1,927 字。
 *
 * 本模块是**纯数据 + 纯函数**：不读文件、不联网、不依赖任何第三方包。
 *
 * 分类口径（改规则前先看）：
 *   报头 = 前 3 段中含「期」「撰 稿 人」「审签人」「联系方式」的段落
 *   标题 = w:sz 为 44（22pt）或 36 的段落（6 篇标题未设 sz，用「居中 + 不以句号结尾 + 8~70 字」兜底）
 *   图注 = 以「图片」开头的段落（另有 sz=28，但实测该字号与正文混用，不采用）
 *   抄送 = 以「抄送」「党委（校长）办公室」开头的段落
 *   正文 = 其余非空段
 *   正文字数 = 报头 + 标题 + 正文 去空白后的字符数（不含图注、不含抄送区）
 *
 * @module @zws/dsh-jianbao/style-corpus
 */

/* ==========================================================================
 * 一、标题
 * ========================================================================== */

/**
 * 标题动词频次表。count = 含该词的**标题篇数**（63 篇里出现多少篇，不是词频）。
 *
 * 交叉表（事件类型 × 首选动词，实测）：
 *   会议/座谈/专题会 12 篇：召开 ×11、隆重举行 ×1
 *   讲座/报告/大课   19 篇：开展 ×16、召开 ×2、同上 ×1
 *   比赛/竞赛/赛事   14 篇：举办 ×4、圆满落幕 ×2、举行 ×1、成功举办 ×1、斩获佳绩 ×1、无动词 ×5
 *   文体/团日/研学   15 篇：开展 ×6、召开 ×2、圆满举办 ×1、组织 ×1、赴 ×1、无动词 ×4
 *   其他              3 篇：赴 ×1、开展 ×1、无动词 ×1
 */
export const TITLE_VERBS = [
  { verb: '开展', count: 23, preferFor: ['讲座', '活动', '班会', '走访', '研学', '观影', '教育'], note: '最高频，覆盖讲座/活动/教育类，占 36.5%' },
  { verb: '召开', count: 15, preferFor: ['会议', '座谈会', '专题会', '见面会', '动员大会', '表彰大会'], note: '会议类默认动词；会议类 12 篇里 11 篇用它' },
  { verb: '举办', count: 6, preferFor: ['竞赛', '比赛', '游园会', '见面会'], note: '赛事/文体活动类' },
  { verb: '组织', count: 4, preferFor: ['参观', '学习', '实践'], note: '带队外出类' },
  { verb: '举行', count: 2, preferFor: ['仪式', '活动', '颁奖'], note: '仪式类' },
  { verb: '圆满落幕', count: 2, preferFor: ['赛事'], note: '赛事收尾式，作标题末段' },
  { verb: '隆重举行', count: 1, preferFor: ['表彰大会', '结业典礼'], note: '最高规格场合专用，全语料仅 1 次' },
  { verb: '成功举办', count: 1, preferFor: ['大赛'], note: '低频' },
  { verb: '圆满举办', count: 1, preferFor: ['活动'], note: '低频' },
  { verb: '同上', count: 1, preferFor: ['思政大课'], note: '专用于「同上一堂思政大课」' },
  { verb: '斩获佳绩', count: 1, preferFor: ['赛事获奖'], note: '成绩类收尾' },
  { verb: '赴', count: 1, preferFor: ['出征', '研学'], note: '行程类' },
  { verb: '圆满收官', count: 0, preferFor: ['赛事'], note: '正文用过 1 次，标题未用' },
];

/** 标题动词的纯字符串顺序表（TITLE_VERBS 的 verb 列，频率降序）。 */
export const TITLE_VERB_ORDER = TITLE_VERBS.map((v) => v.verb);

/**
 * 标题结构类型分布（63 篇，互斥）。
 * A 直陈式 43 篇（68%）：学院名开头 + 动词 + 事件名
 * B 标语——事件式 16 篇（25%）：前半句对偶标语 + —— + 学院名 + 动词 + 事件
 * C 纯标语 2 篇 / D 喜报式 1 篇 / E 引号标语式 1 篇
 */
export const TITLE_STRUCTURES = [
  { code: 'A', name: '直陈式', count: 43, ratio: 0.68, shape: '西藏大学理学院{动词}{事件}', sample: '西藏大学理学院召开团学干部座谈会' },
  { code: 'B', name: '标语——事件式', count: 16, ratio: 0.25, shape: '{四/七字对偶标语}——西藏大学理学院{动词}{事件}', sample: '筑牢课程根基，凝聚育人合力——西藏大学理学院召开2026年思想政治教育工作专题会' },
  { code: 'C', name: '纯标语', count: 2, ratio: 0.03, shape: '{两句标语，无学院名无动词}', sample: '厚植团结沃土  凝聚青春力量' },
  { code: 'D', name: '喜报式', count: 1, ratio: 0.02, shape: '喜报！{学院}{赛事}中{结果}', sample: '喜报！西藏大学理学院学子在“创响青春，筑梦拉萨”创业大赛拉萨市选拔赛中斩获佳绩' },
  { code: 'E', name: '引号标语式', count: 1, ratio: 0.02, shape: '“{主题}”{学院}{动词}{事件}', sample: '“规划青春赛道·逐梦职业未来”西藏大学理学院举办职业生涯规划大赛院赛' },
];

/**
 * 标题规则（全部由实测反推）。
 * maxChars 取 40：52/63 = 82.5% 的标题 ≤ 40 字，P50 = 28 字，P90 = 45 字。
 */
export const TITLE_RULES = {
  maxChars: 40,
  hardMaxChars: 63,
  medianChars: 28,
  p90Chars: 45,
  minChars: 12,
  /** 主副题（两段式，第二段用——引出）实测仅 2/63 = 3.2%，不推荐；破折号标语仍在句内。 */
  preferMainSub: false,
  mainSubRatio: 0.032,
  /** 破折号（——）出现在 16/63 标题中，全部是「标语——事件」结构，不另起一段。 */
  dashRatio: 0.254,
  /** 竞赛/赛事标题必须带具体赛事名词，实测后缀：比赛 ×4、竞赛 ×3、大赛 ×3、杯 ×2、院赛 ×1、辩论赛 ×1。 */
  contestSuffix: ['大赛', '竞赛', '比赛', '杯', '院赛', '决赛'],
  contestSuffixRequired: true,
  /** 学院名出现位置：开头 41 篇、破折号后 4 篇、仅「理学院」2 篇、完全不出现 1 篇。 */
  schoolNamePosition: { head: 41, afterDash: 4, shortForm: 2, absent: 1 },
  /** 标题带年份 34/63 = 54%（写「2026年」28 篇、「二零二六年」6 篇，两式不得混用于同一篇）。 */
  yearRatio: 0.54,
  yearStyles: ['2026年', '二零二六年'],
  /** 标题带引号主题 22/63 = 35%。 */
  quotedRatio: 0.35,
};

/**
 * 标题高频词元（分词后计数，63 篇标题，≥2 次）。
 * 分词按最长匹配；「西藏大学理学院」算整体。
 */
export const TITLE_TOKENS = [
  { token: '西藏大学理学院', count: 56 },
  { token: '开展', count: 23 },
  { token: '2026', count: 20 },
  { token: '新生', count: 17 },
  { token: '召开', count: 15 },
  { token: '专题讲座', count: 10 },
  { token: '青春', count: 8 },
  { token: '2026年', count: 8 },
  { token: '学生', count: 7 },
  { token: '理学院', count: 6 },
  { token: '讲座', count: 6 },
  { token: '二零二六年', count: 6 },
  { token: '铸牢中华民族共同体意识', count: 6 },
  { token: '毕业生', count: 5 },
  { token: '工作', count: 4 },
  { token: '举办', count: 4 },
  { token: '同心', count: 4 },
  { token: '组织', count: 4 },
  { token: '健康', count: 3 },
  { token: '动员大会', count: 3 },
  { token: '专题教育', count: 3 },
];

/** 标题高频二元搭配（前词|后词，≥2 次）。 */
export const TITLE_BIGRAMS = [
  { pair: '西藏大学理学院|开展', count: 19 },
  { pair: '2026|新生', count: 16 },
  { pair: '西藏大学理学院|召开', count: 14 },
  { pair: '开展|2026', count: 9 },
  { pair: '召开|2026', count: 6 },
  { pair: '西藏大学理学院|二零二六年', count: 6 },
  { pair: '二零二六年|铸牢中华民族共同体意识', count: 6 },
  { pair: '西藏大学理学院|组织', count: 4 },
  { pair: '西藏大学理学院|2026年', count: 3 },
  { pair: '专题教育|讲座', count: 3 },
  { pair: '决赛|圆满落幕', count: 2 },
];

/* ==========================================================================
 * 二、首段模板
 * ========================================================================== */

/**
 * 首段骨架模板。weight = 63 篇中命中该骨架的篇数（合计 63）。
 * 占位符：{purpose} 目的从句 / {date} 日期 / {org} 主办主体 / {place} 地点 /
 *         {verb} 事件动词 / {event} 事件名 / {host} 主持人 / {attendees} 参会人
 *
 * 要素覆盖率实测：目的从句 60/63（95%）、日期 57/63（90%）、
 * 于/在+地点 31/63（49%）、由…主持 15/63（24%）、参会人员 32/63（51%）。
 */
export const OPENING_TEMPLATES = [
  { pattern: '为{purpose}，{date}，{org}{verb}{event}。', weight: 16, elements: ['purpose', 'date', 'event'], example: '为加强学院与新生家长的沟通交流，形成家校育人合力，8月28日下午，西藏大学理学院举行2026级新生家长见面会。' },
  { pattern: '为{purpose}，{date}，{org}于{place}{verb}{event}。', weight: 10, elements: ['purpose', 'date', 'place', 'event'], example: '为深入贯彻习近平总书记关于牢固树立总体国家安全观的重要指示精神，4月16日，西藏大学理学院在14教二楼会议室组织学生同上总体国家安全观思政课。' },
  { pattern: '为{purpose}，{date}，{org}于{place}{verb}{event}。本次{eventShort}由{host}主持，{attendees}参加。', weight: 10, elements: ['purpose', 'date', 'place', 'event', 'host', 'attendees'], example: '为表彰优秀学子，4月23日晚，西藏大学理学院在3-213教室举行颁奖仪式。本次颁奖仪式由理学院数学建模协会会长申璐萱同学主持，协会成员40余人参加。' },
  { pattern: '为{purpose}，{date}，{org}{verb}{event}，{attendees}参加。', weight: 8, elements: ['purpose', 'date', 'event', 'attendees'], example: '为深入贯彻落实立德树人根本任务，10月11日下午，西藏大学理学院举办多民族新生破冰融合拓展活动，理学院2026级全体新生参加。' },
  { pattern: '为{purpose}，{date}，{org}在{place}{verb}{event}，{attendees}参加。', weight: 8, elements: ['purpose', 'date', 'place', 'event', 'attendees'], example: '为提升我院学生健康意识，4月30日下午，理学院在学术报告厅召开高原体质健康提升与科学锻炼实践方法讲座，2023级与2025级全体学生参加。' },
  { pattern: '为{purpose}，{org}{verb}{event}。', weight: 4, elements: ['purpose', 'event'], example: '为切实筑牢毕业生安全防线，护航同学们平安离校，西藏大学理学院召开毕业生安全教育讲座会。' },
  { pattern: '为{purpose}，{date}，{org}{verb}{event}。{eventShort}由{host}主持。', weight: 3, elements: ['purpose', 'date', 'event', 'host'], example: '为筑牢我院学生管理服务防线，4月27日下午，理学院召开2026年学生工作专题会。会议由院党委副书记、纪委书记王某某同志主持。' },
  { pattern: '{date}，{org}于{place}{verb}{event}。{eventShort}由{host}主持，{attendees}参加。', weight: 2, elements: ['date', 'place', 'event', 'host', 'attendees'], example: '9月22日14:30，西藏大学理学院在3号教学楼二楼会议室召开中秋、国庆假期学生管理工作专题部署会。会议由张某某副书记主持，全体辅导员与班主任参会。' },
  { pattern: '为{purpose}，{org}在{place}{verb}{event}，{attendees}参加。', weight: 1, elements: ['purpose', 'place', 'event', 'attendees'], example: '为进一步加强学院学风建设，理学院在14教二楼会议室开展2023级学生藏文专项辅导活动，2023级部分学生参加。' },
  { pattern: '在{occasion}之际，为{purpose}，{date}，{org}于{place}{verb}{event}。', weight: 1, elements: ['occasion', 'purpose', 'date', 'place', 'event'], example: '在西藏民主改革67周年来临之际，为进一步引导我院青年筑牢思想根基，3月28日，西藏大学理学院于三号教学楼组织全体班级开展纪念西藏自治区民主改革67周年团日活动。' },
];

/** 首段常用目的从句动词（60 篇含目的从句，动宾核心词频次）。 */
export const PURPOSE_VERBS = [
  { verb: '深入', count: 16 }, { verb: '帮助', count: 9 }, { verb: '引导', count: 5 },
  { verb: '筑牢', count: 5 }, { verb: '丰富', count: 4 }, { verb: '落实', count: 3 },
  { verb: '加强', count: 3 }, { verb: '贯彻', count: 2 }, { verb: '提升', count: 1 },
  { verb: '深化', count: 1 }, { verb: '强化', count: 1 }, { verb: '凝聚', count: 1 },
];

/** 首段主持人句式（15 篇含主持，4 种写法）。 */
export const HOST_PATTERNS = [
  { pattern: '会议由{title}{name}同志主持，{attendees}参加会议。', count: 6, example: '会议由学院党委副书记、纪委书记王某某同志主持，学生科全体教师、团委学生干部、学生会学生干部共计20余人参加会议。' },
  { pattern: '本次{eventShort}由{title}{name}同志主持，{attendees}参加。', count: 4, example: '本次党课由院学生科科长陈某某同志主持，院党委书记、副院长李某某同志主讲，2026届毕业生参加。' },
  { pattern: '会议由{name}副书记主持，{attendees}参会。', count: 3, example: '会议由张某某副书记主持，全体辅导员与班主任参会。' },
  { pattern: '{eventShort}由{title}{name}同志主持。', count: 2, example: '颁奖仪式由理学院数学建模协会会长申璐萱同学主持。' },
];

/* ==========================================================================
 * 三、末段模板
 * ========================================================================== */

/**
 * 末段模板。weight = 63 篇中命中的篇数。
 * 末段开头实测：此次 32、本次 14、本届 1、其他（会议最后/下一步/未来…）16。
 * 末段长度：median 112 字，P25 88，P75 128，max 264。
 *
 * 末段类型（互斥）：plain 25、future（含下一步/今后/未来/将持续）21、
 *                   ground（为…奠定/筑牢/夯实/提供）9、future+ground 7、notonly-only 1。
 */
export const CLOSING_TEMPLATES = [
  { pattern: '{this}{event}的{success}，{effect}。', weight: 25, kind: 'plain', elements: ['this', 'effect'], example: '本次思政课有效增强了我院学生的国家安全意识，引导我院学生将安全意识转化为行动自觉。' },
  { pattern: '{this}{event}，{effect}。下一步，学院将{plan}。', weight: 21, kind: 'future', elements: ['this', 'effect', 'plan'], example: '此次网络安全宣传周系列活动，实现宣传教育多点覆盖。下一步，学院将持续深化网络安全教育。' },
  { pattern: '{this}{event}，{effect}，为{object}{foundation}。', weight: 9, kind: 'ground', elements: ['this', 'effect', 'foundation'], example: '此次会议对假期学生管理工作标准进行细化完善，为学院育人事业高质量推进筑牢坚实安全屏障。' },
  { pattern: '{this}{event}，{effect}。未来，学院将{plan}，为{object}{foundation}。', weight: 7, kind: 'future+ground', elements: ['this', 'effect', 'plan', 'foundation'], example: '此次“理学杯”篮球赛决赛的成功举办，有效引导学生锤炼强健体魄。今后，理学院将持续开展形式多样的校园文体活动，为铸牢中华民族共同体意识贡献理学力量。' },
  { pattern: '{this}{event}不仅{be1}，更{be2}。', weight: 1, kind: 'notonly', elements: ['this', 'be'], example: '此次团日活动不仅是一次历史记忆的唤醒，更是一次思想洗礼与精神传承的深刻实践。' },
  // 极简末段（仅 1 篇）：future 类的短变体，不单独计入 weight
  { pattern: '未来，学院将{plan}，与{party}共同谱写{theme}新篇章。', weight: 0, kind: 'future', elements: ['plan'], example: '未来，理学院将进一步健全家校协同育人机制，与家长通力协作共同谱写立德树人新篇章。' },
];

/** 末段常见升华/展望句式（按出现篇数）。 */
export const CLOSING_DEVICES = [
  { device: '进一步…', count: 22, ratio: 0.35, example: '进一步畅通了学生诉求表达渠道，强化了团学干部的责任意识' },
  { device: '为…奠定/筑牢/夯实/提供/注入/指明…', count: 16, ratio: 0.25, example: '为学院下一步优化教学管理、提升服务质量提供了重要参考' },
  { device: '引导/激励/助力/帮助/鼓舞…', count: 33, ratio: 0.52, example: '引导我院学生将安全意识转化为行动自觉' },
  { device: '下一步/今后/未来 + 学院将…', count: 28, ratio: 0.44, example: '今后，理学院将持续立足学生成长需求，开展形式多样、内涵丰富的校园文体活动' },
  { device: '不仅…更…', count: 7, ratio: 0.11, example: '不仅为我院学子搭建展现自我的体育平台，更锤炼了学子坚韧不拔、奋勇争先的意志品质' },
  { device: '以…为载体/为契机/为抓手/为纽带', count: 6, ratio: 0.10, example: '学院将以此次活动为契机，持续深化“三全育人”工作实效' },
  { device: '有效/切实/扎实 + 动词', count: 8, ratio: 0.13, example: '有效引导我院学生在体育锻炼中锤炼强健体魄' },
  { device: '一方面…另一方面…', count: 1, ratio: 0.02, example: '一方面强化了学生民族语言应用能力；另一方面进一步浓厚了优良学风' },
  { device: '相信/必将…', count: 1, ratio: 0.02, example: '相信我院青年将以蓬勃姿态整装待发' },
];

/* ==========================================================================
 * 四、正文高频短语（正文 34,358 字全量计数）
 * ========================================================================== */

/**
 * 正文高频词/搭配。count = 63 篇正文（不含标题、报头、抄送区）累计出现次数。
 * 排序：次数降序 → 词长降序。收录全部 ≥2 次者（139 条），其中 ≥10 次者 51 条。
 * kind: slogan = 主题性套话（写稿时优先复用）；generic = 通用叙述词；
 *       neutral = 中性词（地点、动作、程度副词）。
 */
export const HIGH_FREQ_PHRASES = [
  { phrase: '学生', count: 247, kind: 'generic' },
  { phrase: '学院', count: 217, kind: 'generic' },
  { phrase: '新生', count: 149, kind: 'generic' },
  { phrase: '工作', count: 128, kind: 'generic' },
  { phrase: '同学', count: 124, kind: 'generic' },
  { phrase: '安全', count: 117, kind: 'generic' },
  { phrase: '教育', count: 80, kind: 'generic' },
  { phrase: '活动', count: 77, kind: 'generic' },
  { phrase: '讲座', count: 74, kind: 'generic' },
  { phrase: '青年', count: 57, kind: 'generic' },
  { phrase: '进一步', count: 42, kind: 'neutral' },
  { phrase: '高原', count: 41, kind: 'generic' },
  { phrase: '交流', count: 35, kind: 'generic' },
  { phrase: '院党委', count: 33, kind: 'neutral' },
  { phrase: '深入', count: 27, kind: 'generic' },
  { phrase: '积极', count: 27, kind: 'generic' },
  { phrase: '学生科', count: 25, kind: 'neutral' },
  { phrase: '全面', count: 25, kind: 'generic' },
  { phrase: '持续', count: 25, kind: 'generic' },
  { phrase: '网络安全', count: 24, kind: 'slogan' },
  { phrase: '充分', count: 23, kind: 'generic' },
  { phrase: '力量', count: 22, kind: 'generic' },
  { phrase: '共同体意识', count: 21, kind: 'slogan' },
  { phrase: '中华民族共同体意识', count: 20, kind: 'slogan' },
  { phrase: '切实', count: 20, kind: 'generic' },
  { phrase: '专题讲座', count: 19, kind: 'slogan' },
  { phrase: '意识形态', count: 19, kind: 'slogan' },
  { phrase: '民族团结', count: 19, kind: 'slogan' },
  { phrase: '铸牢中华民族共同体意识', count: 18, kind: 'slogan' },
  { phrase: '深刻', count: 18, kind: 'generic' },
  { phrase: '心理健康', count: 17, kind: 'neutral' },
  { phrase: '主动', count: 17, kind: 'generic' },
  { phrase: '有效', count: 17, kind: 'generic' },
  { phrase: '图书馆', count: 16, kind: 'generic' },
  { phrase: '各民族', count: 14, kind: 'neutral' },
  { phrase: '会议室', count: 13, kind: 'generic' },
  { phrase: '交融', count: 13, kind: 'generic' },
  { phrase: '理想信念', count: 12, kind: 'slogan' },
  { phrase: '立德树人', count: 12, kind: 'slogan' },
  { phrase: '青年学子', count: 12, kind: 'slogan' },
  { phrase: '互动', count: 12, kind: 'generic' },
  { phrase: '反诈', count: 12, kind: 'slogan' },
  { phrase: '未来', count: 12, kind: 'generic' },
  { phrase: '下一步', count: 11, kind: 'generic' },
  { phrase: '教学楼', count: 11, kind: 'generic' },
  { phrase: '班主任', count: 11, kind: 'generic' },
  { phrase: '扎实', count: 11, kind: 'neutral' },
  { phrase: '立德树人根本任务', count: 10, kind: 'slogan' },
  { phrase: '安全教育', count: 10, kind: 'slogan' },
  { phrase: '消防安全', count: 10, kind: 'slogan' },
  { phrase: '辅导', count: 10, kind: 'generic' },
  { phrase: '交往交流交融', count: 9, kind: 'slogan' },
  { phrase: '国家安全', count: 9, kind: 'neutral' },
  { phrase: '家国情怀', count: 9, kind: 'slogan' },
  { phrase: '思想政治', count: 9, kind: 'slogan' },
  { phrase: '高质量', count: 9, kind: 'neutral' },
  { phrase: '关怀', count: 9, kind: 'generic' },
  { phrase: '习近平总书记', count: 8, kind: 'slogan' },
  { phrase: '校园文化', count: 8, kind: 'slogan' },
  { phrase: '育人工作', count: 8, kind: 'slogan' },
  { phrase: '贯彻落实', count: 8, kind: 'slogan' },
  { phrase: '雪域高原', count: 8, kind: 'slogan' },
  { phrase: '青年学生', count: 8, kind: 'slogan' },
  { phrase: '总书记', count: 8, kind: 'slogan' },
  { phrase: '不断', count: 8, kind: 'generic' },
  { phrase: '分享', count: 8, kind: 'generic' },
  { phrase: '展示', count: 8, kind: 'generic' },
  { phrase: '报告', count: 8, kind: 'generic' },
  { phrase: '防诈', count: 8, kind: 'slogan' },
  { phrase: '入学教育', count: 7, kind: 'slogan' },
  { phrase: '勤学善思', count: 7, kind: 'slogan' },
  { phrase: '团学干部', count: 7, kind: 'slogan' },
  { phrase: '学生干部', count: 7, kind: 'slogan' },
  { phrase: '青春力量', count: 7, kind: 'slogan' },
  { phrase: '今后', count: 7, kind: 'generic' },
  { phrase: '团委', count: 7, kind: 'slogan' },
  { phrase: '培训', count: 7, kind: 'generic' },
  { phrase: '宣讲', count: 7, kind: 'generic' },
  { phrase: '暖心', count: 7, kind: 'neutral' },
  { phrase: '高质量发展', count: 6, kind: 'slogan' },
  { phrase: '思想根基', count: 6, kind: 'slogan' },
  { phrase: '成长成才', count: 6, kind: 'slogan' },
  { phrase: '总体国家安全观', count: 5, kind: 'slogan' },
  { phrase: '意识形态工作', count: 5, kind: 'slogan' },
  { phrase: '学术报告厅', count: 5, kind: 'neutral' },
  { phrase: '参观学习', count: 5, kind: 'slogan' },
  { phrase: '学习贯彻', count: 5, kind: 'slogan' },
  { phrase: '实际行动', count: 5, kind: 'slogan' },
  { phrase: '校园安全', count: 5, kind: 'slogan' },
  { phrase: '校园环境', count: 5, kind: 'slogan' },
  { phrase: '深入学习', count: 5, kind: 'slogan' },
  { phrase: '重要指示', count: 5, kind: 'slogan' },
  { phrase: '凝聚力', count: 5, kind: 'slogan' },
  { phrase: '归属感', count: 5, kind: 'slogan' },
  { phrase: '跟党走', count: 5, kind: 'slogan' },
  { phrase: '辅导员', count: 5, kind: 'slogan' },
  { phrase: '温暖', count: 5, kind: 'generic' },
  { phrase: '青年马克思主义者', count: 4, kind: 'slogan' },
  { phrase: '坚定理想信念', count: 4, kind: 'slogan' },
  { phrase: '思想政治教育', count: 4, kind: 'slogan' },
  { phrase: '民族团结教育', count: 4, kind: 'slogan' },
  { phrase: '深入学习贯彻', count: 4, kind: 'slogan' },
  { phrase: '重要指示精神', count: 4, kind: 'slogan' },
  { phrase: '常态化开展', count: 4, kind: 'slogan' },
  { phrase: '协同育人', count: 4, kind: 'slogan' },
  { phrase: '广大青年', count: 4, kind: 'slogan' },
  { phrase: '感恩教育', count: 4, kind: 'slogan' },
  { phrase: '成功举办', count: 4, kind: 'slogan' },
  { phrase: '时代新人', count: 4, kind: 'slogan' },
  { phrase: '有序推进', count: 4, kind: 'slogan' },
  { phrase: '资助育人', count: 4, kind: 'slogan' },
  { phrase: '青年党员', count: 4, kind: 'slogan' },
  { phrase: '专题会', count: 4, kind: 'slogan' },
  { phrase: '听党话', count: 4, kind: 'slogan' },
  { phrase: '学生会', count: 4, kind: 'slogan' },
  { phrase: '座谈', count: 4, kind: 'generic' },
  { phrase: '生动', count: 4, kind: 'neutral' },
  { phrase: '研学', count: 4, kind: 'slogan' },
  { phrase: '习近平新时代中国特色社会主义思想', count: 3, kind: 'slogan' },
  { phrase: '扎根雪域高原', count: 3, kind: 'slogan' },
  { phrase: '党的二十大', count: 3, kind: 'slogan' },
  { phrase: '老西藏精神', count: 3, kind: 'slogan' },
  { phrase: '集体荣誉感', count: 3, kind: 'slogan' },
  { phrase: '主题活动', count: 3, kind: 'slogan' },
  { phrase: '使命担当', count: 3, kind: 'slogan' },
  { phrase: '全面发展', count: 3, kind: 'slogan' },
  { phrase: '实践活动', count: 3, kind: 'slogan' },
  { phrase: '综合能力', count: 3, kind: 'slogan' },
  { phrase: '育人体系', count: 3, kind: 'slogan' },
  { phrase: '走深走实', count: 3, kind: 'slogan' },
  { phrase: '青马工程', count: 3, kind: 'slogan' },
  { phrase: '校史馆', count: 3, kind: 'slogan' },
  { phrase: '用心', count: 3, kind: 'generic' },
  { phrase: '精心', count: 3, kind: 'generic' },
  { phrase: '提质增效', count: 2, kind: 'slogan' },
  { phrase: '落到实处', count: 2, kind: 'slogan' },
  { phrase: '落地见效', count: 2, kind: 'slogan' },
  { phrase: '青春光彩', count: 2, kind: 'slogan' },
  { phrase: '石榴籽', count: 2, kind: 'slogan' },
];

/** 高频短语 ≥10 次的子集（写稿时必须自然出现，不许堆砌）。 */
export const HIGH_FREQ_CORE = HIGH_FREQ_PHRASES.filter((p) => p.count >= 10);

/* ==========================================================================
 * 五、结构指标
 * ========================================================================== */

/**
 * 篇幅结构（63 篇实测）。
 *
 * paragraphs：正文段数（不含报头/标题/图注/抄送）
 *   dist = {3:24, 4:31, 5:7, 8:1}，median 4，mode 4
 * chars：正文口径字数（报头+标题+正文去空白，不含图注与抄送）
 *   min 397（〔2026〕73号 新生家长见面会）
 *   max 1108（〔2026〕105号 破冰融合拓展活动，8 段长稿）
 *   mean 626.8 / median 618 / P10 486 / P25 545 / P75 689.5 / P90 760.6
 *   suggest [400, 700]：覆盖 48/63 = 76%；放宽到 [400, 750] 覆盖 53/63 = 84%
 */
export const STRUCTURE = {
  paragraphs: { min: 3, max: 8, mean: 3.79, median: 4, mode: 4, typical: [3, 5], dist: { 3: 24, 4: 31, 5: 7, 8: 1 } },
  chars: { min: 397, max: 1108, mean: 626.8, median: 618, p10: 486, p25: 545, p75: 690, p90: 761, suggest: [400, 700] },
  /** 中间段数量（首末之外）分布：1 段 24 篇、2 段 31 篇、3 段 7 篇、6 段 1 篇。 */
  middleParagraphs: { dist: { 1: 24, 2: 31, 3: 7, 6: 1 }, median: 2 },
  totals: { docs: 63, bodyParagraphs: 239, bodyChars: 34358, titleChars: 1927 },
};

/**
 * 四段式各段职能与字数（63 篇实测，段落按正文字符数计）。
 * 首段（opening）：目的 + 时间 + 地点 + 事件 + 主持人 + 参会人
 * 中间段（middle）：过程叙述 / 讲话要点 / 环节推进
 * 末段（ending）：成效 + 意义 + 展望
 */
export const SECTIONS = [
  { name: 'opening', role: '目的从句（为…）+ 具体日期 + 主办主体 + 于/在+地点 + 动词+事件 + 由…主持 + 参会人员；一段交代清楚"为什么办、什么时候、在哪、谁办、谁来了"', chars: [88, 172], median: 121, min: 14, max: 252, samples: 63 },
  { name: 'middle', role: '过程推进：会上/讲座中/活动伊始/赛场上起笔，写讲话要点、环节顺序、现场细节；会议类可「一是…二是…三是…」分条（8/63 篇用），活动类按项目/环节分段', chars: [90, 273], median: 154, min: 67, max: 411, samples: 113 },
  { name: 'ending', role: '成效与意义：此次/本次+事件+取得成效，再落到为…奠定/筑牢/夯实/提供，或下一步/今后/未来+学院将…', chars: [76, 194], median: 112, min: 1, max: 264, samples: 63 },
];

/* ==========================================================================
 * 六、人名与职务
 * ========================================================================== */

/**
 * 人名/职务写法规则（63 篇实测）。
 *
 * 首现带职务：18/18 位实名领导全部「职务 + 姓名 + 同志」（100%）。
 * 例：学院党委副书记、纪委书记王某某同志；院党委书记、副院长李某某同志；
 *     学生科科长陈某某同志；院党委委员、副院长赵某某同志。
 * 后续简称：可省「同志」降为「姓名 + 职务」（王某某副书记、张某某副书记、李某某书记），
 *          或直接用姓名（王某某同志指出 → 后文「王某某副书记强调」）。
 * 「同志」总量 74 次，27/63 篇出现，篇均 2.7 次；36 篇完全不用（学生活动类可不写）。
 */
export const NAME_RULES = {
  firstUseWithTitle: true,
  firstUseRatio: 1.0,
  comradeSuffix: '同志',
  /** 首现格式：{职务串}{姓名}同志 */
  firstUseShape: '{title}{name}同志',
  /** 后续简称两种合法降级 */
  laterForms: ['{name}{shortTitle}', '{name}'],
  laterFormsExample: ['王某某副书记', '张某某副书记', '李某某书记', '王某某'],
  /** 学生/教师非领导：可写「{职务}{姓名}老师/同学」，不带「同志」。 */
  studentTeacherShape: ['{title}{name}老师', '{title}{name}同学', '{title}{name}教授'],
  comradeTotal: 74,
  comradeDocs: 27,
  comradePerDoc: 2.7,
  docsWithoutComrade: 36,
  /** 职务串必须整体书写，不许拆开或改写顺序。 */
  titleStrings: [
    { title: '院党委副书记、纪委书记', count: 8 },
    { title: '院党委书记、副院长', count: 6 },
    { title: '院党委委员、副院长', count: 5 },
    { title: '院党委副书记、院长', count: 4 },
    { title: '学生科科长', count: 10 },
    { title: '院学生科科长', count: 2 },
    { title: '团委书记', count: 5 },
    { title: '院团委书记', count: 2 },
    { title: '校团委书记', count: 1 },
    { title: '教务科科长', count: 1 },
    { title: '学生科副科长', count: 1 },
    { title: '院综合办主任', count: 1 },
    { title: '院专职组织员', count: 1 },
  ],
};

/** 语料中出现最多的人名（正文计数）。 */
export const TOP_NAMES = [
  { name: '张某某', count: 20, title: '院党委副书记、纪委书记' },
  { name: '李某某', count: 16, title: '院党委书记、副院长' },
  { name: '陈某某', count: 16, title: '学生科科长' },
  { name: '王某某', count: 11, title: '院党委副书记、纪委书记' },
  { name: '刘某某', count: 7, title: '院党委副书记、院长' },
  { name: '杨某某', count: 6, title: '院团委书记' },
  { name: '赵某某', count: 5, title: '院党委委员、副院长' },
  { name: '黄某某', count: 5, title: '学生科副科长' },
  { name: '韩某某', count: 4, title: '院党委委员、副院长' },
  { name: '杨某某2', count: 3, title: '原西藏大学副校长' },
];

/* ==========================================================================
 * 七、时间写法
 * ========================================================================== */

/**
 * 时间写法（63 篇实测）。
 * 「X月X日」阿拉伯数字 61 次 / 中文数字 0 次 —— 正文日期一律阿拉伯数字。
 * 「XXXX年」阿拉伯 20 次；「二零二六年」仅出现在标题（6 篇），正文不用。
 * 时刻用「日+时段」或「时:分」：下午 10 次、上午 1 次、晚 1 次；
 * 具体时刻 16 处（14：00 全角 5 处 / 14:30 半角 11 处，两种混用，建议统一半角）。
 */
export const TIME_RULES = {
  dateStyle: 'arabic',
  datePatterns: ['{M}月{D}日', '{Y}年{M}月{D}日'],
  arabicDateCount: 61,
  chineseDateCount: 0,
  arabicYearCount: 20,
  chineseYearCountInBody: 0,
  chineseYearCountInTitle: 6,
  daypartWords: [{ word: '下午', count: 10 }, { word: '上午', count: 1 }, { word: '晚', count: 1 }],
  timeOfDayCount: 16,
  colonStyles: [{ style: '全角：', count: 5 }, { style: '半角:', count: 11 }],
  recommendColon: '半角:',
  rangeDash: '—',
  rangeDashExample: '4月17日—4月19日',
};

/* ==========================================================================
 * 八、禁用/少见项
 * ========================================================================== */

/**
 * 禁用词表：**63 篇语料实测 0 次**的公文体 / AI 味套话。
 * 判定口径极严——只要全语料出现过 1 次就不进本表（那些降到 RARE_WORDS）。
 */
export const BANNED = [
  // —— 总结性套话（0 次）——
  '总之', '综上所述', '综上', '由此可见', '显而易见', '众所周知', '不难看出', '由此可见的是',
  // —— 互联网黑话 / AI 味（0 次）——
  '抓手', '闭环', '底层逻辑', '护城河', '颗粒度', '拉通', '对齐', '组合拳',
  '打法', '心智', '势能', '破圈', '出圈', '链路', '生态位', '矩阵', '范式',
  '值得注意的一点', '值得注意的是', '多维度', '全方位赋能', '生态化', '场景化',
  '结构化', '可视化', '数据化', '矩阵化', '立体化', '颠覆', '重塑', '迭代倒逼',
  // —— 第一人称（0 次；「我们」由 reviewStyle 的 FIRST_PERSON_WE 单独判，此处不重复列）——
  '本人', '笔者认为', '小编',
  // —— 口语化程度副词（0 次）——
  '大大', '非常', '十分', '极其', '超级',
  // —— 空转连接词（0 次；「最后」14 次是「会议最后」，不属此类）——
  '第一，', '第二，', '第三，',
];

/**
 * 语料里出现过、但必须压到极低频的词（实测次数 + 出现语境）。
 * 这些词**不是禁用**，是「一篇文章最多 1 次」的黄色预警。
 */
export const RARE_WORDS = [
  { word: '最后', count: 14, note: '全部为「会议最后，X 强调」「最后，X 在讲话中」的流程收尾，不作总结词' },
  { word: '首先', count: 5, note: '全部为「首先向与会家长介绍」的环节序次，不作论证序词' },
  { word: '深耕', count: 5, note: '「持续深耕校园体育建设」等，喻体化用法，一篇最多 1 次' },
  { word: '生态', count: 4, note: '实义：高原生态环境保护、校园文化生态' },
  { word: '维度', count: 3, note: '实义：「五个维度」' },
  { word: '认知', count: 10, note: '实义：「认知误区」「认知短板」「自我认知」' },
  { word: '全方位', count: 5, note: '「全方位、多角度介绍」，可留但勿叠加' },
  { word: '赋能', count: 2, note: '「科创赋能拉萨发展」「人际赋能」，仅 2 次' },
  { word: '复盘', count: 2, note: '仅 2 次，慎用' },
  { word: '其次', count: 1, note: '仅 1 次' },
  { word: '极大地', count: 1, note: '仅 1 次' },
  { word: '特别', count: 1, note: '仅 1 次' },
  { word: '不容忽视', count: 1, note: '仅 1 次' },
];

/**
 * 标点纪律（实测）。
 * 感叹号：正文 2 次（均为「向他们表示祝贺！」）、标题 1 次（「喜报！」）。
 * 问号：0 次。第一人称「我们」：0 次，统一用「我院」（34 次）/「学院」。
 * 破折号 ——：正文 6 次（全部是「机制——早进课题」「基地——康马县…」的注释式），标题 16 次（标语——事件）。
 */
export const PUNCT_RULES = {
  exclamation: { bodyCount: 2, titleCount: 1, allowOnly: ['向他们表示祝贺！', '喜报！'], recommend: '正文默认不用感叹号' },
  question: { count: 0 },
  firstPerson: { '我们': 0, '我院': 34, '我校': 1, recommend: '统一用「我院」或「学院」，不用「我们」' },
  dash: { bodyCount: 6, titleCount: 16, bodyUsage: '仅用于注释式补充（机制——早进课题）', titleUsage: '标语——事件' },
  semicolon: { count: 42, note: '用于并列排比句之间' },
  enumeration: { docsWithYiShi: 8, note: '「一是…二是…三是…」分条，会议类专用' },
};

/* ==========================================================================
 * 九、规则引擎：reviewStyle
 * ========================================================================== */

/** 领导/教师实名名单（用于检查首现是否带职务与「同志」）。 */
const NAME_ROSTER = [
  '张某某', '李某某', '陈某某', '王某某', '刘某某', '杨某某', '赵某某', '黄某某',
  '韩某某', '韩某某', '杨某某2', '朱某某', '秦某某', '尤某某', '沈某某',
  '周某某', '卫某某', '于涛', '蔡蕊', '尼玛欧珠',
];

/** 职务串（用于判定「首现带职务」）。长串优先。 */
const TITLE_ROSTER = [
  '院党委副书记、纪委书记', '院党委书记、副院长', '院党委委员、副院长',
  '院党委副书记、院长', '党委副书记、纪委书记', '学生科科长', '院学生科科长',
  '教务科科长', '学生科副科长', '院团委书记', '校团委书记', '团委书记',
  '院综合办主任', '院专职组织员', '党委书记', '党委副书记', '纪委书记',
  '副院长', '院长', '科长', '副科长', '主任', '组织员', '辅导员', '班主任',
];

const WS_RE = /[\s\u3000]/g;

/** 去空白后的字符数。 */
function charCount(s) {
  return String(s || '').replace(WS_RE, '').length;
}

/** 拆段：按换行分段，丢弃空段。 */
function splitParas(text) {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(function (s) { return s.trim(); })
    .filter(function (s) { return s.length > 0; });
}

/** 判断一段是不是标题：短、不以句号结尾、不以「为/为了」起。 */
function looksLikeTitle(p) {
  if (!p) return false;
  const n = charCount(p);
  if (n < 8 || n > 70) return false;
  if (/[。；]$/.test(p)) return false;
  if (/^(为|为了)/.test(p)) return false;
  return true;
}

/** 首段要素探测。 */
function probeOpening(p) {
  return {
    purpose: /^(为|为了)/.test(p) || /^(在[^。]{2,40}?之际|在[^。]{2,40}?之时)[，,]\s*(为|为了)/.test(p),
    date: /\d{1,2}月\d{1,2}日/.test(p) || /\d{4}年\d{1,2}月\d{1,2}日/.test(p),
    place: /(于|在)[^，。]{2,30}?(楼|室|场|馆|厅|院|校区|教室|基地|村|堂|中心|广场)/.test(p),
    event: /(举行|召开|开展|组织|举办|同上|观看|进行|赴|落下帷幕|圆满落幕|圆满收官|正式启动|开班)/.test(p),
    host: /由[^。]{2,45}?主持/.test(p),
    attend: /(参加|参会|出席)/.test(p),
  };
}

/** 末段升华句探测。 */
function probeClosing(p) {
  return {
    ground: /为[^。]{0,50}(奠定|筑牢|夯实|提供|注入|指明|打下|贡献|服务)/.test(p),
    future: /(下一步|今后|未来|将持续|将继续|将以)/.test(p),
    notOnly: /不仅[^。]{0,60}更/.test(p),
    further: /进一步/.test(p),
  };
}

/**
 * 给一段简报正文打分。
 *
 * @param {string|{title?:string, paragraphs?:string[], text?:string}} input
 *        纯文本（段落用换行分隔；首行若像标题则按标题处理），
 *        或显式对象 { title, paragraphs }。
 * @param {{title?:string}} [options] 显式指定标题，优先级最高。
 * @returns {{score:number, issues:Array<{code:string,message:string,at:number,snippet?:string}>,
 *            passed:string[], stats:{paragraphs:number,chars:number,bodyChars:number,titleChars:number}}}
 */
export function reviewStyle(input, options) {
  const opts = options || {};
  const issues = [];
  const passed = [];

  let title = '';
  let paras = [];
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    title = String(input.title || opts.title || '').trim();
    paras = Array.isArray(input.paragraphs)
      ? input.paragraphs.map(function (s) { return String(s).trim(); }).filter(Boolean)
      : splitParas(input.text || '');
  } else {
    const all = splitParas(input);
    title = String(opts.title || '').trim();
    if (!title && all.length > 1 && looksLikeTitle(all[0])) {
      title = all.shift();
    }
    paras = all;
  }

  const bodyChars = paras.reduce(function (n, p) { return n + charCount(p); }, 0);
  const titleChars = charCount(title);
  const totalChars = bodyChars + titleChars;

  const add = function (code, message, at, snippet) {
    const item = { code: code, message: message, at: at };
    if (snippet !== undefined) item.snippet = snippet;
    issues.push(item);
  };

  /* ---- 1. 段数 ---- */
  if (paras.length === 0) {
    add('NO_BODY', '没有解析到正文段落。', -1);
  } else if (paras.length < STRUCTURE.paragraphs.min) {
    add('PARA_TOO_FEW', '正文只有 ' + paras.length + ' 段，语料最少 ' + STRUCTURE.paragraphs.min + ' 段（3 段 24 篇 / 4 段 31 篇 / 5 段 7 篇）。', -1);
  } else if (paras.length > STRUCTURE.paragraphs.typical[1] + 1) {
    add('PARA_TOO_MANY', '正文 ' + paras.length + ' 段，超出常规域 3-5 段（语料 62/63 篇在 3-5 段，仅 1 篇 8 段）。', -1);
  } else if (paras.length === STRUCTURE.paragraphs.typical[1] + 1) {
    add('PARA_MANY', '正文 6 段，比常规域（3-5 段）多，注意是否该合并环节。', -1);
  } else {
    passed.push('段落数落在常规域 3-5 段');
  }

  /* ---- 2. 总字数 ---- */
  const lo = STRUCTURE.chars.suggest[0];
  const hi = STRUCTURE.chars.suggest[1];
  if (totalChars < STRUCTURE.chars.min) {
    add('CHARS_TOO_SHORT', '全文 ' + totalChars + ' 字，低于语料最短 ' + STRUCTURE.chars.min + ' 字。', -1);
  } else if (totalChars > STRUCTURE.chars.max) {
    add('CHARS_TOO_LONG', '全文 ' + totalChars + ' 字，超出语料最长 ' + STRUCTURE.chars.max + ' 字。', -1);
  } else if (totalChars < lo) {
    add('CHARS_BELOW_SUGGEST', '全文 ' + totalChars + ' 字，建议区间 ' + lo + '-' + hi + ' 字（中位 ' + STRUCTURE.chars.median + ' 字）。', -1);
  } else if (totalChars > hi) {
    add('CHARS_ABOVE_SUGGEST', '全文 ' + totalChars + ' 字，超出建议区间 ' + lo + '-' + hi + '（该区间覆盖 48/63=76% 的语料，中位 ' + STRUCTURE.chars.median + ' 字）；P75 为 ' + STRUCTURE.chars.p75 + ' 字内可接受，超出请压。', -1);
  } else {
    passed.push('字数落在建议区间');
  }

  /* ---- 3. 标题 ---- */
  if (!title) {
    add('TITLE_MISSING', '没有识别到标题（首行不像标题，也没有通过 options.title 传入）。', -1);
  } else {
    if (titleChars > TITLE_RULES.hardMaxChars) {
      add('TITLE_TOO_LONG', '标题 ' + titleChars + ' 字，超出语料最长 ' + TITLE_RULES.hardMaxChars + ' 字。', 0, title);
    } else if (titleChars > TITLE_RULES.maxChars) {
      add('TITLE_LONG', '标题 ' + titleChars + ' 字，建议不超过 ' + TITLE_RULES.maxChars + ' 字（实测 82.5% 满足，中位 ' + TITLE_RULES.medianChars + ' 字）。', 0, title);
    } else {
      passed.push('标题长度合规');
    }
    if (!/理学院/.test(title)) {
      add('TITLE_NO_SCHOOL', '标题里没有出现「理学院 / 西藏大学理学院」，语料 62/63 篇都有。', 0, title);
    }
    let hasVerb = false;
    for (let i = 0; i < TITLE_VERB_ORDER.length; i += 1) {
      if (title.indexOf(TITLE_VERB_ORDER[i]) >= 0) { hasVerb = true; break; }
    }
    if (!hasVerb) {
      add('TITLE_NO_VERB', '标题没有事件动词，语料 53/63 篇（84%）含动词（首选「' + TITLE_VERB_ORDER[0] + '」「' + TITLE_VERB_ORDER[1] + '」）。', 0, title);
    }
    if (title.indexOf('！') >= 0 && title.indexOf('喜报') !== 0) {
      add('TITLE_EXCLAMATION', '标题用了感叹号，语料仅「喜报！」1 例。', 0, title);
    }
    if (title.indexOf('——') >= 0 && titleChars > 45) {
      add('TITLE_LONG_SLOGAN', '「标语——事件」式标题超过 45 字，语料该结构 16 篇均在 45 字内。', 0, title);
    }
  }

  /* ---- 4. 首段 ---- */
  const first = paras[0] || '';
  if (first) {
    const op = probeOpening(first);
    if (!op.purpose) {
      add('OPEN_NO_PURPOSE', '首段没有「为…」目的从句，语料 60/63 篇（95%）以目的从句起笔。', 0, first.slice(0, 40));
    }
    if (!op.date) {
      add('OPEN_NO_DATE', '首段没有具体日期（X月X日），语料 57/63 篇（90%）写了日期。', 0, first.slice(0, 40));
    }
    if (!op.place) {
      add('OPEN_NO_PLACE', '首段没有「于/在 + 具体地点」，语料 31/63 篇（49%）写了地点，会议/讲座/仪式类建议补。', 0, first.slice(0, 40));
    }
    if (!op.event) {
      add('OPEN_NO_EVENT', '首段没有事件动词（举行/召开/开展/组织/举办…）。', 0, first.slice(0, 40));
    }
    if (op.purpose && op.date && op.event) {
      passed.push('首段具备目的+时间+事件');
    }
    if (!op.host && !op.attend) {
      add('OPEN_NO_PEOPLE', '首段既没写「由…主持」也没写参会人员（语料 24% 写主持、51% 写参会，至少写一项）。', 0, first.slice(0, 40));
    }
  }

  /* ---- 5. 末段 ---- */
  const last = paras[paras.length - 1] || '';
  if (paras.length >= 2 && last) {
    const cl = probeClosing(last);
    if (!cl.ground && !cl.future && !cl.notOnly && !cl.further) {
      add('CLOSE_NO_ELEVATION', '末段没有升华/展望句（不仅…更…；为…奠定/筑牢/夯实；进一步…；下一步/今后/未来 + 学院将…）。', paras.length - 1, last.slice(0, 40));
    } else {
      passed.push('末段有升华句');
    }
    if (!/^(此次|本次|本届|通过|未来|今后|下一步|会议|讲座|活动|比赛|整场)/.test(last)) {
      add('CLOSE_HEAD_UNUSUAL', '末段开头不是「此次/本次/本届」等语料常用式（此次 32 篇、本次 14 篇、本届 1 篇）。', paras.length - 1, last.slice(0, 24));
    }
    if (charCount(last) < SECTIONS[2].chars[0]) {
      add('CLOSE_TOO_SHORT', '末段 ' + charCount(last) + ' 字，低于语料 P10（' + SECTIONS[2].chars[0] + ' 字），显得头重脚轻。', paras.length - 1, last.slice(0, 40));
    }
  }

  /* ---- 6. 禁用词 ---- */
  const fullText = [title].concat(paras).join('\n');
  const bannedSorted = BANNED.slice().sort(function (a, b) { return b.length - a.length; });
  const covered = [];
  let bannedHit = 0;
  for (let i = 0; i < bannedSorted.length; i += 1) {
    const w = bannedSorted[i];
    if (!w) continue;
    let from = 0;
    let hit = false;
    let firstAt = -1;
    for (;;) {
      const idx = fullText.indexOf(w, from);
      if (idx < 0) break;
      const end = idx + w.length;
      let inside = false;
      for (let c = 0; c < covered.length; c += 1) {
        if (idx >= covered[c][0] && end <= covered[c][1]) { inside = true; break; }
      }
      if (!inside) {
        covered.push([idx, end]);
        hit = true;
        if (firstAt < 0) firstAt = idx;
      }
      from = idx + 1;
    }
    if (!hit) continue;
    bannedHit += 1;
    let at = -1;
    for (let j = 0; j < paras.length; j += 1) {
      if (paras[j].indexOf(w) >= 0) { at = j; break; }
    }
    add('BANNED_WORD', '出现禁用词「' + w + '」，63 篇语料中 0 次。', at, w);
  }
  if (bannedHit === 0) passed.push('无禁用词');

  /* ---- 7. 感叹号 / 问号 / 第一人称 ---- */
  const excl = (fullText.match(/！/g) || []).length;
  if (excl > 0) {
    let allowed = false;
    for (let i = 0; i < PUNCT_RULES.exclamation.allowOnly.length; i += 1) {
      if (fullText.indexOf(PUNCT_RULES.exclamation.allowOnly[i]) >= 0) { allowed = true; break; }
    }
    if (!allowed || excl > 1) {
      add('EXCLAMATION', '全文出现 ' + excl + ' 个感叹号，语料正文仅 2 次（均为「向他们表示祝贺！」）。', -1);
    }
  }
  if (/[？?]/.test(fullText)) {
    add('QUESTION_MARK', '出现问号，63 篇语料 0 次。', -1);
  }
  if (fullText.indexOf('我们') >= 0) {
    add('FIRST_PERSON_WE', '出现「我们」，语料 0 次；统一用「我院」或「学院」。', -1);
  }

  /* ---- 8. 人名与「同志」 ---- */
  const badNames = [];
  for (let i = 0; i < NAME_ROSTER.length; i += 1) {
    const name = NAME_ROSTER[i];
    const idx = fullText.indexOf(name);
    if (idx < 0) continue;
    const before = fullText.slice(Math.max(0, idx - 26), idx);
    const after = fullText.slice(idx + name.length, idx + name.length + 6);
    let hasTitle = false;
    for (let j = 0; j < TITLE_ROSTER.length; j += 1) {
      const t = TITLE_ROSTER[j];
      if (before.endsWith(t) || before.endsWith(t + '、') || before.endsWith(t + '，')) { hasTitle = true; break; }
    }
    const hasComrade = /^同志/.test(after) || /^(副书记|书记|院长|副院长|科长|副科长|主任|老师|教授)/.test(after);
    if (!hasTitle && !hasComrade) {
      badNames.push(name);
    }
  }
  for (let i = 0; i < badNames.length; i += 1) {
    const name = badNames[i];
    let at = -1;
    for (let j = 0; j < paras.length; j += 1) {
      if (paras[j].indexOf(name) >= 0) { at = j; break; }
    }
    add('NAME_NO_TITLE_OR_COMRADE', '人名「' + name + '」首次出现未带职务也未带「同志」（语料 18/18 位实名领导均为「职务+姓名+同志」）。', at, name);
  }
  if (badNames.length === 0) passed.push('人名写法合规');

  /* ---- 9. 破折号 ---- */
  const dashBody = (paras.join('\n').match(/——/g) || []).length;
  if (dashBody > 3) {
    add('DASH_OVERUSE', '正文出现 ' + dashBody + ' 处「——」，语料正文仅 6 处且全为注释式补充。', -1);
  }

  /* ---- 10. 段末标点 ---- */
  const noPeriod = paras.filter(function (p) {
    return p && !/[。！？…”」』）]$/.test(p);
  });
  if (noPeriod.length > 0) {
    add('MISSING_PERIOD', noPeriod.length + ' 段结尾缺句号。', -1);
  }

  /* ---- 扣分 ---- */
  const WEIGHT = {
    NO_BODY: 40, PARA_TOO_FEW: 8, PARA_TOO_MANY: 6, PARA_MANY: 2,
    CHARS_TOO_SHORT: 12, CHARS_TOO_LONG: 8, CHARS_BELOW_SUGGEST: 2, CHARS_ABOVE_SUGGEST: 2,
    TITLE_MISSING: 10, TITLE_TOO_LONG: 8, TITLE_LONG: 4, TITLE_NO_SCHOOL: 5,
    TITLE_NO_VERB: 5, TITLE_EXCLAMATION: 3, TITLE_LONG_SLOGAN: 3,
    OPEN_NO_PURPOSE: 8, OPEN_NO_DATE: 6, OPEN_NO_PLACE: 3, OPEN_NO_EVENT: 6,
    OPEN_NO_PEOPLE: 3,
    CLOSE_NO_ELEVATION: 8, CLOSE_HEAD_UNUSUAL: 3, CLOSE_TOO_SHORT: 3,
    BANNED_WORD: 6, EXCLAMATION: 4, QUESTION_MARK: 4, FIRST_PERSON_WE: 5,
    NAME_NO_TITLE_OR_COMRADE: 4, DASH_OVERUSE: 2, MISSING_PERIOD: 3,
  };
  let score = 100;
  for (let i = 0; i < issues.length; i += 1) {
    const w = WEIGHT[issues[i].code];
    score -= (w === undefined ? 2 : w);
  }
  score = Math.max(0, Math.min(100, score));

  return {
    score: score,
    issues: issues,
    passed: passed,
    stats: { paragraphs: paras.length, chars: totalChars, bodyChars: bodyChars, titleChars: titleChars },
  };
}
