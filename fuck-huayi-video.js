// ==UserScript==
// @name         华医网视频播放脚本 Pro
// @namespace    dennischancs
// @version      2.19
// @description  该油猴脚本用于华医网/深圳卫健继教平台的视频继续播放，✅智能切换CC播放器（支持倍速）✅自动播放下一视频✅屏蔽弹窗✅静音播放✅用户行为模拟✅圆球浮窗✅防检测倍速播放（仅限CC播放器，最快8.0x）✅智能跳转逻辑✅自动处理签到弹窗✅自动作答播放中途弹题（答错自动点"返回/继续"并换选项）✅分天时间达标后自动100%完成课件✅课件结束页自动续播下一课✅拟人模式模拟真人观看习惯（活动时段/每日上限）✅分天策略建议重开时间✅实验功能（一键跳到95%快速标记/直接编辑本地数据）✅支持 91huayi.com 与 cme.szyxjxjy.cn
// @author       [dennischancs](https://github.com/dennischancs)
// @match        *://*.91huayi.com/*
// @match        *://*.bokecc.com/*
// @match        *://*.szyxjxjy.cn/*
// @grant        none
// @license      MIT
// @run-at       document-start
// @homepageURL  https://github.com/dennischancs/fuck-huayi-video
// @website      https://github.com/dennischancs/fuck-huayi-video
// @supportURL   https://github.com/dennischancs/fuck-huayi-video/issues
// @downloadURL https://update.greasyfork.org/scripts/557281/%E5%8D%8E%E5%8C%BB%E7%BD%91%E8%A7%86%E9%A2%91%E6%92%AD%E6%94%BE%E8%84%9A%E6%9C%AC%20Pro.user.js
// @updateURL https://update.greasyfork.org/scripts/557281/%E5%8D%8E%E5%8C%BB%E7%BD%91%E8%A7%86%E9%A2%91%E6%92%AD%E6%94%BE%E8%84%9A%E6%9C%AC%20Pro.meta.js
// ==/UserScript==

(function () {
    'use strict';

    // ==================== 🌐 v1.6：站点识别（同时支持华医网与深圳卫健继教平台） ====================
    // 两者均使用 bokecc.com 的 CC 播放器（h5player-3.6.2.js），但页面/URL/状态指示结构不同：
    //   91huayi.com:  播放页 course_ware_cc.aspx?cwid=X       列表页 course.aspx?cid=X       状态 i#top_play 父节点兄弟节点文案
    //   szyxjxjy.cn:  播放页 /pages/courseware/ccPlay.html?cwid=X&ol=Y&cid=Z   列表页 /pages/casePage.html?cid=X&ol=Y   状态 #exam 按钮去掉 notClick 类即完成
    const SITE = (function () {
        const host = location.hostname || '';
        const path = location.pathname || '';
        const isSzyx = host.indexOf('szyxjxjy.cn') !== -1;
        return {
            isSzyx: isSzyx,
            isHuayi: !isSzyx, // bokecc.com / 91huayi.com 走原华医逻辑
            path: path,
            playPageName: isSzyx ? 'ccPlay.html' : 'course_ware_cc.aspx',
            polyvPageName: isSzyx ? 'polyvPlay.html' : 'course_ware_polyv.aspx',
            listPageName: isSzyx ? 'casePage.html' : 'course.aspx',
            playDir: isSzyx ? '/pages/courseware/' : '/course_ware/',
            isPlayPage: function () { return path.indexOf(isSzyx ? 'ccPlay.html' : 'course_ware') !== -1; },
            isPolyvPage: function () { return path.indexOf(isSzyx ? 'polyvPlay' : 'polyv') !== -1; },
            isListPage: function () { return path.indexOf(isSzyx ? 'casePage.html' : 'course.aspx') !== -1 || path.indexOf('cme.aspx') !== -1; },
            isExamResultPage: function () {
                // 华医网：exam_result.aspx 是课件结束页（自动续播）
                // szyxjxjy.cn：exam.html 是真实考试页、coursewareEvaluation.html 是课件评价页
                //   均需用户手动操作，脚本不自动处理（避免干扰答题）
                if (isSzyx) return false;
                return path.indexOf('exam_result.aspx') !== -1;
            },
            // szyxjxjy.cn 的考试/评价页（用户手动操作，脚本只标记状态不干预）
            isSzyxExamPage: function () { return isSzyx && (path.indexOf('exam.html') !== -1 || path.indexOf('coursewareEvaluation.html') !== -1); },
            // 构建 CC 播放页 URL（szyxjxjy.cn 需要 cid+ol；华医只需 cwid）
            buildPlayUrl: function (cwid, player) {
                const fileName = player === 'polyv' ? this.polyvPageName : this.playPageName;
                const base = location.origin + this.playDir + fileName;
                if (this.isSzyx) {
                    const params = new URLSearchParams(location.search);
                    const cid = params.get('cid') || localStorage.getItem('huayi_course_cid') || '';
                    const ol = params.get('ol') || '1';
                    return `${base}?cwid=${cwid}&ol=${ol}&cid=${cid}`;
                }
                return `${base}?cwid=${cwid}`;
            }
        };
    })();

    // ==================== 🛡️ v1.6：移除华医网反插件检测器 ====================
    // 页面在 document 上注册了合成点击检测器（e.isTrusted === false 时命中）：
    // 点击 .ccSignWrapBtn（签到）/ .layer_tips .rig_btn / .lis-content h2 会触发
    // blockAbnormalPlugin() → player.destroy() + "检测到异常插件"弹窗。
    // 本脚本需要用合成点击自动处理签到弹窗，故在页面脚本运行前拦截其注册。
    (function neutralizePluginDetector() {
        try {
            const origAdd = EventTarget.prototype.addEventListener;
            EventTarget.prototype.addEventListener = function (type, fn, opts) {
                try {
                    if (this === document && String(type) === 'click' && typeof fn === 'function') {
                        const src = String(fn);
                        if (src.includes('isTrusted') && (src.includes('closest') || src.includes('blockAbnormalPlugin'))) {
                            console.log('🛡️ 已拦截华医网反插件检测器注册');
                            return;
                        }
                    }
                } catch (e) {}
                return origAdd.call(this, type, fn, opts);
            };
        } catch (e) {}
    })();

    // ==================== 🔥 智能播放器切换逻辑 ====================
    (function smartPlayerSwitch() {
        // 🌐 v1.6：深圳卫健继教平台（szyxjxjy.cn）只走 CC 播放器，无需 Polyv/CC 切换
        if (SITE.isSzyx) {
            console.log('🌐 深圳卫健继教平台：跳过 Polyv/CC 切换（直接使用 CC 播放器）');
            return;
        }
        const currentPath = window.location.pathname;
        const currentSearch = window.location.search;
        const urlParams = new URLSearchParams(currentSearch);
        const cwid = urlParams.get('cwid');

        // 检测到 Polyv 播放器，等待加载完成后再切换到 CC
        if (currentPath.includes('course_ware_polyv.aspx')) {
            const failedCC = safeParseJSON(localStorage.getItem('huayi_failed_cc'), []);

            // 如果这个课程之前CC失败过，就不再切换
            if (failedCC.includes(cwid)) {
                console.log('⚠️ 该课程CC不可用，使用Polyv播放器（无倍速）');
                return;
            }

            console.log('🔄 检测到 Polyv 播放器，等待页面加载...');

            // 🔥 等待 Polyv 页面加载完成
            const waitForPolyvLoad = setInterval(() => {
                // 检测 Polyv 播放器是否已加载
                const polyvLoaded = document.querySelector('video') ||
                                   window.player ||
                                   document.querySelector('#player') ||
                                   document.readyState === 'complete';

                if (polyvLoaded) {
                    clearInterval(waitForPolyvLoad);
                    console.log('✅ Polyv 页面已加载，3秒后切换到 CC 播放器...');

                    setTimeout(() => {
                        // 🔥 关键修复：只保留 cwid 参数，清除 Polyv 专用参数
                        const newUrl = currentPath.replace('course_ware_polyv.aspx', 'course_ware_cc.aspx') + `?cwid=${cwid}`;
                        console.log('→ 切换到:', newUrl);
                        window.location.replace(newUrl);
                    }, 3000); // 等待3秒确保加载稳定
                }
            }, 500);

            // 超时保护：最多等待15秒
            setTimeout(() => {
                clearInterval(waitForPolyvLoad);
                if (currentPath.includes('course_ware_polyv.aspx')) {
                    console.log('⏰ 等待超时，强制切换到 CC 播放器');
                    const newUrl = currentPath.replace('course_ware_polyv.aspx', 'course_ware_cc.aspx') + `?cwid=${cwid}`;
                    window.location.replace(newUrl);
                }
            }, 15000);
        }

        // 检测CC播放器是否加载失败
        if (currentPath.includes('course_ware_cc.aspx')) {
            setTimeout(() => {
                const errorMsg = document.body?.textContent || '';

                if (errorMsg.includes('课件准备中') || errorMsg.includes('请刷新后重新进入') || errorMsg.includes('加载失败')) {
                    console.log('❌ CC播放器加载失败，回退到Polyv播放器');

                    // 记录这个课程CC不可用
                    const failedCC = safeParseJSON(localStorage.getItem('huayi_failed_cc'), []);
                    if (cwid && !failedCC.includes(cwid)) {
                        failedCC.push(cwid);
                        localStorage.setItem('huayi_failed_cc', JSON.stringify(failedCC));
                        console.log(`📝 已记录课程 ${cwid} 为CC不可用`);
                    }

                    // 回退到Polyv播放器（只保留cwid参数）
                    const newUrl = currentPath.replace('course_ware_cc.aspx', 'course_ware_polyv.aspx') + `?cwid=${cwid}`;
                    setTimeout(() => {
                        window.location.replace(newUrl);
                    }, 1000);
                }
            }, 3000); // 等待3秒检测是否加载成功
        }

        // 处理 course_ware.aspx 的情况（会自动跳转到 polyv）
        if (currentPath.includes('course_ware.aspx') && !currentPath.includes('_polyv') && !currentPath.includes('_cc')) {
            console.log('🔍 检测到通用入口 course_ware.aspx，等待自动跳转...');
            // 不做任何操作，让它自然跳转到 polyv，然后由上面的逻辑处理
        }
    })();

    // ==================== 🔥 防检测倍速劫持 ====================
    // 必须在 document-start 阶段运行，在网站脚本加载前劫持
    let realPlaybackRate = parseFloat(localStorage.getItem('huayi_playback_speed')) || 1.0;

    // 劫持 HTMLMediaElement.prototype.playbackRate
    const originalDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'playbackRate');

    Object.defineProperty(HTMLMediaElement.prototype, 'playbackRate', {
        get: function() {
            // 返回假的倍速值（始终返回1.0欺骗检测）
            return 1.0;
        },
        set: function(value) {
            // 实际设置真实倍速
            if (value > 0 && value <= 16) {
                realPlaybackRate = value;
                originalDescriptor.set.call(this, value);
                console.log(`🎯 实际倍速已设置为: ${value}x (对外显示: 1.0x)`);
            }
        },
        configurable: true
    });

    // 劫持 getOwnPropertyDescriptor 防止网站检测我们的劫持
    const originalGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
    Object.getOwnPropertyDescriptor = function(obj, prop) {
        if (obj === HTMLMediaElement.prototype && prop === 'playbackRate') {
            // 返回原始描述符，隐藏我们的劫持
            return originalDescriptor;
        }
        return originalGetOwnPropertyDescriptor(obj, prop);
    };

    console.log('✅ 倍速劫持已启动，可安全使用任意倍速');
    console.log('✅ 智能播放器切换已启用（优先CC，失败自动回退）');

    // ==================== 主脚本 ====================

    let clock = null;
    let timeCheckInterval = null; // 时间监控定时器
    let lastSeekAt = 0; // 🔥 完成模式上次seek时间（防抖，避免进度条闪烁）
    let jumpFailCount = 0; // 🔥 跳转未保持计数（连续3次回退后熔断，改用8x自然播放推进）
    let stallPos = 0; // 🔥 停滞检测：上次记录的播放位置
    let stallAt = 0; // 🔥 停滞检测：上次位置变化时间
    let isExpanded = false;
    let currentSpeed = realPlaybackRate;
    // 🔥 v2.18 深圳站"非首播直通尾段"模式：非首次播放 + 时间差已达标 + 拟人允许时，
    // 直接跳到最后10秒并以 1.0x 播完（无视用户倍速设置），播完走考试模块
    let szyxTailMode = false;      // 已进入尾段直通模式
    let szyxIsReplay = false;      // 本次打开前就已有本课件首播记录（= 非首次播放）
    let szyxTailSeekAt = 0;        // 尾段跳转防抖时间戳
    const urlTip = window.location.pathname.split('/').pop().split('?')[0];

    // 🔥 新增：安全的JSON解析函数
    function safeParseJSON(jsonString, defaultValue = null) {
        try {
            if (!jsonString || jsonString.trim() === '') {
                return defaultValue;
            }
            return JSON.parse(jsonString);
        } catch (e) {
            console.warn('JSON解析错误:', e, '数据:', jsonString);
            return defaultValue;
        }
    }

    // 🔥 新增：检查元素是否真正可见
    function isElementVisible(element) {
        if (!element) return false;

        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();

        // 检查元素是否真的可见
        return style.display !== 'none' &&
               style.visibility !== 'hidden' &&
               style.opacity !== '0' &&
               rect.width > 0 &&
               rect.height > 0 &&
               element.offsetParent !== null;
    }

    // ==================== 🔥 分天刷课：时间差记录 ====================
    // 服务器按「结束时间 - 开始时间 ≥ 视频真实时长」判定有效学习，与倍速无关。
    // 本地记录每个课程(cwid)的首次播放时间：
    //   未达标（当前时间 < 首次播放时间 + 视频时长）：只播到95%即跳转，避免服务器重置起始时间
    //   已达标（当前时间 ≥ 首次播放时间 + 视频时长）：放开95%限制，倍速播至100%完成课件
    function getFirstPlayMap() {
        return safeParseJSON(localStorage.getItem('huayi_first_play'), {}) || {};
    }

    // 🔥 v1.5：读取默认首播时间（含24小时有效期，防止忘记清除导致新课程被误判达标）
    function getDefaultFirstPlay() {
        try {
            const raw = localStorage.getItem('huayi_default_first_play');
            if (!raw) return null;
            let t = NaN, setAt = 0;
            try {
                const obj = JSON.parse(raw);
                if (obj && typeof obj === 'object') { t = obj.t; setAt = obj.set || 0; }
                else t = parseInt(raw, 10);
            } catch (e) { t = parseInt(raw, 10); }
            if (isNaN(t)) { localStorage.removeItem('huayi_default_first_play'); return null; }
            // 旧格式（无设置时间戳）或设置超过24小时 → 自动失效
            if (!setAt || Date.now() - setAt > 24 * 3600 * 1000) {
                localStorage.removeItem('huayi_default_first_play');
                console.log('⏱️ 默认首播时间已失效（设置超过24小时），新课程将重新按首播计时');
                return null;
            }
            return t;
        } catch (e) { return null; }
    }

    // 获取课程首次播放时间：优先精确记录；否则用用户设置的"默认首次观看时间"（老用户补录用）
    function getFirstPlayTime(cwid) {
        if (!cwid) return null;
        const map = getFirstPlayMap();
        if (map[cwid]) return map[cwid];
        return getDefaultFirstPlay();
    }

    function recordFirstPlay() {
        try {
            const cwid = new URLSearchParams(location.search).get('cwid');
            if (!cwid) return;
            const existing = getFirstPlayTime(cwid);
            if (existing) {
                // 已有记录（精确或默认补录）：确保课程级计时起点不晚于本课件起点
                recordCourseStart(existing);
                return;
            }
            const now = Date.now();
            const map = getFirstPlayMap();
            map[cwid] = now;
            localStorage.setItem('huayi_first_play', JSON.stringify(map));
            console.log('🕒 已记录本课件首次播放时间（分天策略计时起点）');
            // 🔥 课程级：课程首播时间 = 该课程最早开始播放的课件时间
            recordCourseStart(now);
        } catch (e) {}
    }

    function clearFirstPlay(cwid) {
        try {
            if (!cwid) return;
            const map = getFirstPlayMap();
            if (map[cwid]) {
                delete map[cwid];
                localStorage.setItem('huayi_first_play', JSON.stringify(map));
            }
        } catch (e) {}
    }

    // 🔥 v1.5：课件页内嵌的 var cid（课程唯一标识，课程级考核用）
    // 🌐 v1.6：szyxjxjy.cn 的 cid 直接在 URL 参数 ?cid=... 里（casePage/ccPlay 都是）
    let _courseCidCache;
    function getCourseCid() {
        if (_courseCidCache !== undefined) return _courseCidCache;
        _courseCidCache = null;
        try {
            if (SITE.isSzyx) {
                const cid = new URLSearchParams(location.search).get('cid');
                if (cid) { _courseCidCache = cid.toLowerCase(); return _courseCidCache; }
            }
            const m = document.documentElement.outerHTML.match(/var\s+cid\s*=\s*['"]([0-9a-f-]{16,})['"]/i);
            if (m) _courseCidCache = m[1].toLowerCase();
        } catch (e) {}
        return _courseCidCache;
    }

    // 🔥 v1.5：通过课件时长记录反查课件所属课程cid（结束页无cid时用）
    function findCidByCwid(cwid) {
        try {
            const durMap = safeParseJSON(localStorage.getItem('huayi_course_durs'), {}) || {};
            for (const cid in durMap) {
                if (durMap[cid] && durMap[cid][cwid]) return cid;
            }
        } catch (e) {}
        return null;
    }

    // 🔥 v1.5：记录课程级计时起点（取更早者；补录场景沿用默认首播时间）
    function recordCourseStart(t) {
        try {
            const cid = getCourseCid();
            if (!cid) return;
            const map = safeParseJSON(localStorage.getItem('huayi_course_start'), {}) || {};
            if (!map[cid] || t < map[cid]) {
                map[cid] = t;
                localStorage.setItem('huayi_course_start', JSON.stringify(map));
            }
        } catch (e) {}
    }

    // 🔥 v1.5：观察并记录每个课件的时长（首日播放时逐个累计，构成课程总时长）
    function observeWareDuration(durationSec) {
        try {
            if (!durationSec || isNaN(durationSec) || durationSec <= 0) return;
            const cid = getCourseCid();
            const cwid = new URLSearchParams(location.search).get('cwid');
            if (!cid || !cwid) return;
            const map = safeParseJSON(localStorage.getItem('huayi_course_durs'), {}) || {};
            map[cid] = map[cid] || {};
            const sec = Math.ceil(durationSec);
            if (map[cid][cwid] !== sec) {
                map[cid][cwid] = sec;
                localStorage.setItem('huayi_course_durs', JSON.stringify(map));
            }
        } catch (e) {}
    }

    // 🔥 v1.5：课程级时钟（课程首播时间 + 已观察到的所有课件时长之和）
    function getCourseClock(cid) {
        try {
            if (!cid) return null;
            const startMap = safeParseJSON(localStorage.getItem('huayi_course_start'), {}) || {};
            const durMap = safeParseJSON(localStorage.getItem('huayi_course_durs'), {}) || {};
            const start = startMap[cid];
            const durs = durMap[cid] || {};
            let total = 0;
            for (const k in durs) total += durs[k];
            if (!start || total <= 0) return null;
            return { start, totalSec: total };
        } catch (e) { return null; }
    }

    // 🔥 v1.5：时间差考核冗余系数（比服务器要求多留10%，防止边界误差导致判定不通过）
    const TIME_MARGIN = 1.10;

    // 时间差是否已达标（可100%播完）——双重考核：
    // ① 单视频：本课件首播时间 + 本视频时长×1.1（服务器按视频记录开始播放时间）
    // ② 课程级：课程首播时间 + 课程所有课件时长之和×1.1（系统按课程总时长考核学分，
    //    倍速播放省下的时间必须用真实时间差补回来，否则总时长不符合）
    // 注：调用方都在视频播放循环中，这里顺带观察记录本课件时长
    function canCompleteFully(durationSec) {
        try {
            observeWareDuration(durationSec);
            const cwid = new URLSearchParams(location.search).get('cwid');
            if (!cwid) return false;
            const first = getFirstPlayTime(cwid);
            if (!first) return false; // 无任何记录视为首次播放，启用95%保护
            if (Date.now() - first < (durationSec || 0) * 1000 * TIME_MARGIN) return false;
            // 🔥 课程级考核：课程总时长未达标前不允许完成（哪怕单个视频时长已满足）
            const clock = getCourseClock(getCourseCid());
            if (clock && Date.now() - clock.start < clock.totalSec * 1000 * TIME_MARGIN) return false;
            return true;
        } catch (e) {
            return false;
        }
    }

    // ==================== 🌙 v2.0：拟人模式（模拟真实人的观看习惯） ====================
    // 目标：让服务器看到的播放行为像真人——只在活动时段学习、单日观看时长有上限，
    // 不可能 24 小时连续播放。超出时段/额度时暂停视频并暂缓自动续播，窗口恢复后自动继续。
    // 配置存 localStorage(huayi_humanize)；当日实际观看秒数存 huayi_daily_watch（只留最近7天）。
    // 注意：夜里的真实时间差照常累计（服务器按"结束-开始"算时长，不要求你真的在播），
    // 拟人约束的只是"像真人的打开/播放时间"，不影响分天策略的达标判定。
    const HUMANIZE_KEY = 'huayi_humanize';
    const HUMANIZE_DAILY_KEY = 'huayi_daily_watch';
    let humanizePausedByUs = false;

    function getHumanizeCfg() {
        const def = { enabled: true, start: 8, end: 22, capHours: 12 };
        try {
            const raw = JSON.parse(localStorage.getItem(HUMANIZE_KEY) || 'null');
            if (raw && typeof raw === 'object') {
                let s = parseInt(raw.start, 10), e = parseInt(raw.end, 10);
                if (isNaN(s) || s < 0 || s > 23) s = def.start;
                if (isNaN(e) || e < 1 || e > 24) e = def.end;
                let cap = parseFloat(raw.capHours);
                if (isNaN(cap) || cap < 4 || cap > 16) cap = def.capHours;
                return { enabled: raw.enabled !== false, start: s, end: e, capHours: cap };
            }
        } catch (e) {}
        return def;
    }

    // 当前时刻是否在活动时段内（支持跨零点窗口，如 22:00→次日6:00）
    function inHumanWindow(cfg, d) {
        const h = d.getHours() + d.getMinutes() / 60;
        if (cfg.start < cfg.end) return h >= cfg.start && h < cfg.end;
        return h >= cfg.start || h < cfg.end;
    }

    function getDayKey(d) {
        const pad = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }

    function getTodayWatchSec() {
        try {
            const map = safeParseJSON(localStorage.getItem(HUMANIZE_DAILY_KEY), {}) || {};
            return map[getDayKey(new Date())] || 0;
        } catch (e) { return 0; }
    }

    function addTodayWatchSec(sec) {
        try {
            const map = safeParseJSON(localStorage.getItem(HUMANIZE_DAILY_KEY), {}) || {};
            const keys = Object.keys(map).sort();
            while (keys.length > 7) delete map[keys.shift()];
            const k = getDayKey(new Date());
            map[k] = (map[k] || 0) + sec;
            localStorage.setItem(HUMANIZE_DAILY_KEY, JSON.stringify(map));
        } catch (e) {}
    }

    // 拟人放行判定：非活动时段或当日观看已达上限 → 不允许自动播放/自动续播
    function humanizeAllowsPlay() {
        const cfg = getHumanizeCfg();
        if (!cfg.enabled) return true;
        if (!inHumanWindow(cfg, new Date())) return false;
        return getTodayWatchSec() < cfg.capHours * 3600;
    }

    // 拟人守卫：每30秒巡检——超窗/超额时暂停播放，窗口恢复后接续播放；
    // 顺带累计当日真实观看秒数（按实际间隔计，防后台标签页定时器节流导致少算）
    function startHumanizeGuard() {
        let lastTick = Date.now();
        setInterval(() => {
            try {
                const now = Date.now();
                const delta = Math.min(120, (now - lastTick) / 1000);
                lastTick = now;
                const video = document.querySelector('video');
                if (!video) return;
                const allow = humanizeAllowsPlay();
                if (!allow && !video.paused) {
                    video.pause();
                    humanizePausedByUs = true;
                    console.log('🌙 拟人模式：超出活动时段/今日额度，已暂停自动播放');
                } else if (allow && humanizePausedByUs && video.paused) {
                    humanizePausedByUs = false;
                    video.play().catch(() => {});
                    console.log('☀️ 拟人模式：进入活动时段，恢复播放');
                }
                if (!video.paused) addTodayWatchSec(delta);
            } catch (e) {}
        }, 30000);
    }

    // ==================== 💡 v2.0：分天策略建议重开时间 ====================
    // 取「单视频达标时刻」与「课程总时长达标时刻」的较晚者（含10%冗余），
    // 再按拟人活动时段归一：达标点落在深夜/凌晨时顺延到最近的时段开始时刻，
    // 提示"该在几天后的几点再打开这一课，正常速度看完最后5%"。
    function computeSuggestReopen(durationSec) {
        try {
            const cwid = new URLSearchParams(location.search).get('cwid');
            const first = getFirstPlayTime(cwid);
            const clock = getCourseClock(getCourseCid());
            const need = Math.max(
                first ? first + (durationSec || 0) * 1000 * TIME_MARGIN : 0,
                clock ? clock.start + clock.totalSec * 1000 * TIME_MARGIN : 0
            );
            if (!need) return null;
            const cfg = getHumanizeCfg();
            if (!cfg.enabled) return need;
            const d = new Date(need);
            const h = d.getHours() + d.getMinutes() / 60;
            if (h >= cfg.end) { d.setDate(d.getDate() + 1); d.setHours(cfg.start, 0, 0, 0); return d.getTime(); }
            if (h < cfg.start) { d.setHours(cfg.start, 0, 0, 0); return d.getTime(); }
            return need;
        } catch (e) { return null; }
    }

    function formatSuggestText(ms) {
        if (ms <= Date.now()) return '✅ 时间已达标，现在即可正常速度看完最后5%';
        const d = new Date(ms);
        const pad = n => String(n).padStart(2, '0');
        const when = `${pad(d.getMonth() + 1)}月${pad(d.getDate())}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        const days = Math.ceil((ms - Date.now()) / 86400000);
        return `💡 建议${days > 1 ? ` ${days} 天后（${when}）` : ` ${when} `}后重开本课，正常速度看完最后5%`;
    }

    // 浮窗"执行建议"行：播放页含单视频+课程双重考核；列表页只有课程级考核
    function computeSuggestStateText() {
        try {
            const v = document.querySelector('video');
            const onPlay = SITE.isPlayPage() && v && v.duration && !isNaN(v.duration);
            const onList = SITE.isListPage();
            if (!onPlay && !onList) return '';
            const ms = computeSuggestReopen(onPlay ? v.duration : 0);
            if (!ms) return '';
            const cfg = getHumanizeCfg();
            const watched = (getTodayWatchSec() / 3600).toFixed(1);
            let html = formatSuggestText(ms);
            html += `<br>🌙 今日已观看 ${watched} 小时（时段 ${cfg.start}:00-${cfg.end}:00，上限 ${cfg.capHours} 小时${cfg.enabled ? '' : '，未启用'}）`;
            return html;
        } catch (e) { return ''; }
    }

    // ==================== 🧪 v2.0：实验功能（一键跳到95% / 直接改本地数据） ====================
    // ⚡ 本课跳到95%并标记：用 CC 官方 API jumpToTime 绕过反快进看门狗直接到95%（首日快速标记），
    //   顺带把课件时长写入课程总时长考核（纯跳转路径不会自然累计时长，不补记会导致课程级达标被低估），
    //   然后 3 秒后走既有95%保护跳转流程（避免越过95%触发完成被服务器重置开始时间）
    function jumpTo95AndMark() {
        const video = document.querySelector('video');
        if (!video || !video.duration || isNaN(video.duration)) { alert('未检测到视频，请在播放页使用'); return; }
        const ok = seekForward(video, video.duration * 0.95);
        if (!ok) { alert('jumpToTime 不可用（需CC播放器），跳转失败'); return; }
        recordFirstPlay();
        observeWareDuration(video.duration);
        console.log('⚡ 实验：已跳到95%（课件时长已记入课程考核），3秒后按95%保护跳转下一课');
        clearInterval(timeCheckInterval);
        setTimeout(() => proceedToNext(), 3000);
    }

    // ✏️ 编辑本地数据：把所有 huayi_* 键值导出成 JSON，编辑后写回（立即生效）。
    //   用途：跨浏览器迁移观看记录/首播时间，或手工修正计时数据，无需 DevTools。
    function dumpLocalData() {
        const area = document.getElementById('localDataArea');
        if (!area) return;
        try {
            const obj = {};
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.indexOf('huayi_') === 0) {
                    const raw = localStorage.getItem(k);
                    try { obj[k] = JSON.parse(raw); } catch (e) { obj[k] = raw; }
                }
            }
            area.value = JSON.stringify(obj, null, 2);
        } catch (e) { area.value = '读取失败: ' + e.message; }
    }

    function applyLocalData() {
        const area = document.getElementById('localDataArea');
        if (!area) return;
        try {
            const obj = JSON.parse(area.value);
            if (!obj || typeof obj !== 'object' || Array.isArray(obj)) { alert('内容需为 JSON 对象'); return; }
            let n = 0;
            for (const k in obj) {
                if (k.indexOf('huayi_') !== 0) continue;
                localStorage.setItem(k, typeof obj[k] === 'string' ? obj[k] : JSON.stringify(obj[k]));
                n++;
            }
            alert(`已应用 ${n} 条本地记录（立即生效）`);
            updateFinishStateLine();
            if (isExpanded) expandPanel();
        } catch (e) { alert('JSON 解析失败：' + e.message); }
    }

    // 记录课件页所在目录，供结束页(exam_result.aspx)续播下一课时拼接URL
    function saveCourseBase() {
        try {
            const base = location.origin + location.pathname.substring(0, location.pathname.lastIndexOf('/') + 1);
            localStorage.setItem('huayi_course_base', base);
        } catch (e) {}
    }

    // ==================== 🔥 v2.16：404/错误页自愈（考试循环不断链） ====================
    // 循环答题时平台偶发 502/404（"网站暂时关闭"等错误页），落到错误页会中断自动答题流程。
    // 策略：进入考试相关页（exam/examresult/评价页）时把"回归入口"存入 sessionStorage；
    // 一旦落到错误页，拟人随机等待 20~60 秒（与 v2.10 重考间隔一致，避免风控）后
    // 自动导航回考试页恢复循环；无回归入口或超时 30 分钟则回课程首页重新开始。
    function isSzyxErrorPage() {
        try {
            const t = (document.title || '') + ' ' + (document.body ? document.body.innerText : '');
            if (/\b404\b|not found|网站暂时关闭|service unavailable|bad gateway|\b50[23]\b|无法访问/.test(t)) {
                // 错误页正文极短；正常页面含导航/题目等大量内容，避免误判
                return (document.body ? document.body.innerText.length : 0) < 600;
            }
        } catch (e) {}
        return false;
    }

    function saveSzyxExamRecovery() {
        try {
            const params = new URLSearchParams(location.search);
            const ol = params.get('ol') || '1';
            const cname = encodeURIComponent(params.get('cname') || '');
            const url = '/pages/courseware/exam.html?ol=' + ol + (cname ? '&cname=' + cname : '');
            sessionStorage.setItem('huayi_szyx_recover', JSON.stringify({ url: url, ts: Date.now() }));
        } catch (e) {}
    }

    function recoverSzyxErrorPage() {
        let target = null;
        try { target = JSON.parse(sessionStorage.getItem('huayi_szyx_recover') || 'null'); } catch (e) {}
        const valid = target && target.url && (Date.now() - target.ts) < 30 * 60 * 1000;
        const delaySec = Math.floor(20 + Math.random() * 40);
        console.warn('🛑 [考试] 检测到 404/错误页，' + delaySec + ' 秒后自动恢复答题循环');
        setPanelStatus('error');
        setTimeout(() => {
            if (valid) { location.href = target.url; }
            else { location.href = '/pages/index.html'; }
        }, delaySec * 1000);
    }

    // 等待DOM加载后再初始化UI
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    function init() {
        // 🔥 v2.14：启动时打印实际运行的脚本版本，方便核对 Tampermonkey 是否已更新到最新版
        try { console.log('🚀 [脚本] 已加载 v' + GM_info.script.version); } catch (e) {}
        // 🔥 新增：中途弹题自动作答（所有页面/iframe 都启用）
        setupAutoAnswer();

        createPanel();

        // 🌐 v1.6：深圳卫健继教平台（szyxjxjy.cn）页面路由
        if (SITE.isSzyx) {
            // 🔥 v2.16：404/错误页自愈——拟人等待后自动回到考试页，循环不断链
            if (isSzyxErrorPage()) { recoverSzyxErrorPage(); return; }
            if (SITE.isPlayPage()) {
                // /pages/courseware/ccPlay.html?cwid=X&ol=Y&cid=Z
                setPanelStatus('playing');
                saveCourseList();
                // 🔥 v2.18：在 initVideo 的 recordFirstPlay() 之前判断是否已有首播记录
                szyxIsReplay = !!getFirstPlayTime(new URLSearchParams(location.search).get('cwid'));
                initVideo(2); // 该站只用 CC 播放器
                setupExamWatcher(); // 🔥 v2.5：MutationObserver 监听 #exam 变蓝，绕过轮询竞争
            } else if (SITE.isPolyvPage()) {
                // /pages/courseware/polyvPlay.html（个别课程无 CC 版本时落地）
                setPanelStatus('playing');
                saveCourseList();
                initVideo(1);
            } else if (SITE.isListPage()) {
                // /pages/casePage.html?cid=X&ol=Y 课程详情/列表页
                setPanelStatus('list');
                // 🌐 v1.6 fix: szyx casePage.html 通过 JS 动态渲染课件列表，
                // DOMContentLoaded 时 dl.lisInside-case 尚未注入，需延迟重试 saveCourseList
                const trySaveList = (attempt) => {
                    saveCourseList();
                    if (!localStorage.getItem('huayi_course_list') && attempt < 5) {
                        setTimeout(() => trySaveList(attempt + 1), 1000);
                    }
                };
                setTimeout(() => trySaveList(0), 500);
                setTimeout(() => location.reload(), 5 * 60 * 1000);
            } else if (SITE.isSzyx && /examresult\.html/i.test(location.pathname)) {
                // 🔥 v2.7：考试结果页（examresult.html）——错题记忆 + 自动重考直至全对
                setPanelStatus('exam');
                saveSzyxExamRecovery(); // 🔥 v2.16：记录回归入口，供 404/错误页自愈使用
                handleSzyxExamResult();
            } else if (SITE.isSzyxExamPage()) {
                // /pages/courseware/exam.html（真实考试）或 coursewareEvaluation.html（课件评价）
                // exam.html：v2.7 起模仿华医网错题记忆方式自动作答交卷，最终达成全对
                // coursewareEvaluation.html 的 cid 参数即 course_ware_id，标记完成便于浮窗显示
                setPanelStatus('exam');
                saveSzyxExamRecovery(); // 🔥 v2.16：记录回归入口，供 404/错误页自愈使用
                const params = new URLSearchParams(location.search);
                const cwid = params.get('cwid') || params.get('cid');
                if (cwid) markCourseCompleted(cwid);
                // 🔥 v2.6：课件评价页自动填写好评并提交（无需记录第几次进入，按页面特征判断：
                // 题目由 /feedback/listOrganQuestion 异步渲染，有 .shiti 即为评价表单；
                // 服务器对已评价的课件直接返回空列表 → 页面自己跳 exam.html，脚本无需处理）
                if (location.pathname.indexOf('coursewareEvaluation.html') !== -1) {
                    autoEvaluateCourseware();
                }
                // 🔥 v2.7：考试页自动作答（错题记忆，避开已知错误选项）+ 自动交卷
                if (/\/exam\.html/i.test(location.pathname)) {
                    hookSzyxExamApi(); // 🔥 v2.8：抓取 getQusetionlist 原始响应（探测是否含正确答案字段）
                    autoAnswerSzyxExam();
                }
            } else {
                setPanelStatus('error');
            }
            return;
        }

        if (urlTip.includes('course_ware')) {
            setPanelStatus('playing');
            saveCourseList();
            // 根据实际播放器类型初始化
            initVideo(urlTip.includes('polyv') ? 1 : 2);
        } else if (urlTip == 'face.aspx') {
            setPanelStatus('face');
            setTimeout(() => location.reload(), 5 * 60 * 1000);
        } else if (urlTip == 'course.aspx' || urlTip == 'cme.aspx') {
            setPanelStatus('list');
            saveCourseList();
            setTimeout(() => location.reload(), 5 * 60 * 1000);
        } else if (urlTip == 'exam_result.aspx') {
            setPanelStatus('exam');
            initExamPage();
        } else {
            setPanelStatus('error');
        }
    }

    // ==================== 核心功能 ====================

    function initVideo(type) {
        recordFirstPlay();
        saveCourseBase();
        blockPopups();
        simulateUserActivity();
        // 🌙 v2.0：拟人模式守卫（超窗/超额暂停，窗口恢复自动接续）
        startHumanizeGuard();

        // 🌐 v1.6：用 addEventListener 而非 window.onload=...
        // szyxjxjy.cn 的 ccPlay.html 自己设置了 window.onload（内部调用 initStudyCourseWare 创建播放器），
        // 若用 window.onload= 会被页面覆盖，导致 3 秒状态轮询永远不启动、检测不到 #exam 启用。
        // addEventListener('load', ...) 不覆盖页面处理函数，两站兼容。
        window.addEventListener('load', () => {
            clock = setInterval(checkVideoStatus, 3000);
        });

        setTimeout(() => {
            try {
                const video = document.querySelector('video');
                if (video) {
                    video.muted = true;
                    video.defaultMuted = true;

                    // 🔥 修改：确保默认播放速度为1.0
                    video.playbackRate = 1.0;

                    // 添加视频结束事件监听（正常速度播放时使用）
                    video.addEventListener('ended', () => {
                        if (currentSpeed === 1.0 || canCompleteFully(video.duration)) {
                            console.log('🎬 视频自然结束（正常速度）');
                            // 触发状态检查，执行5秒等待逻辑
                            setTimeout(checkVideoStatus, 100);
                        }
                    });
                }

                if (type == 1 && typeof player !== 'undefined') {
                    // Polyv播放器（不支持倍速）
                    player.j2s_setVolume?.(0);
                    player.j2s_resumeVideo?.();
                    console.log('⚠️ 使用Polyv播放器（该课程不支持倍速）');
                } else if (typeof cc_js_Player !== 'undefined') {
                    // CC播放器（支持倍速）
                    cc_js_Player.setVolume?.(0);
                    cc_js_Player.play?.();
                    applyPlaybackSpeed(type);
                    console.log('✅ 使用CC播放器（支持防检测倍速）');
                }
            } catch (e) {
                console.log('播放器初始化错误:', e);
            }
        }, 8000);

        // 持续监听并应用倍速（仅对CC播放器）
        if (type == 2) {
            setInterval(() => {
                applyPlaybackSpeed(type);
            }, 5000);
        }

        // 添加时间监控定时器（倍速模式使用）
        if (type == 2 && currentSpeed > 1.0) {
            startTimeCheck();
        }

        // 页面卸载时清理定时器
        window.addEventListener('beforeunload', () => {
            clearInterval(clock);
            clearInterval(timeCheckInterval);
        });
    }

    // 🔥 时间监控函数（倍速模式）——分天策略核心：
    // 未达标（当前时间 < 首次播放时间 + 视频时长）：只播到95%即跳转，保护服务器记录的起始时间
    // 已达标（当前时间 ≥ 首次播放时间 + 视频时长）：不再卡95%，播放至100%完成后再跳转
    function startTimeCheck() {
        clearInterval(timeCheckInterval);

        const checkInterval = Math.max(500, 1000 / currentSpeed); // 倍速越高，检测越频繁
        const jumpThreshold = 240 / currentSpeed; // 未达标时的跳转阈值（240秒 ÷ 倍速）

        console.log(`🔧 倍速监控: 检测间隔${checkInterval}ms, 跳转阈值${jumpThreshold.toFixed(1)}秒`);

        timeCheckInterval = setInterval(() => {
            try {
                const video = document.querySelector('video');
                if (video && video.duration && !isNaN(video.duration)) {
                    const remaining = video.duration - video.currentTime;
                    const progress = video.currentTime / video.duration;

                    if (canCompleteFully(video.duration)) {
                        // 🔥 时间差已达标：直接跳到99%匀速跑完
                        handleCompletionPass(video);
                        // 🔥 v2.1：必须等视频真正 ended（页面提交 course_ware_finish、考试入口由灰变蓝）再跳转。
                        // 之前 remaining<=1 / progress>=0.999 在视频还差约1秒时就跳走，登记永远不触发，本课卡"学习中"
                        if (video.ended) {
                            console.log('🏁 时间已达标，视频已播放到头，等待服务器登记完成（考试入口变蓝）后跳转');
                            waitRegisteredThenProceed(45000);
                        }
                    } else if (remaining <= jumpThreshold || progress >= 0.95) {
                        // 未达标：95%保护跳转
                        console.log(`⏱️ 时间未达标，95%保护跳转: 剩余${Math.round(remaining)}秒, 进度${(progress*100).toFixed(1)}%`);
                        clearInterval(timeCheckInterval);
                        proceedToNext();
                    }
                }
            } catch (e) {
                console.log('时间监控错误:', e);
            }
        }, checkInterval);
    }

    // 🔥 v1.5：当前是否有弹题/投票弹窗/结果浮层在显示（供完成模式拉进度条前协调）
    function hasActiveQuestion() {
        try {
            const box = document.querySelector('.ccQuestionBox');
            if (box && isElementVisible(box)) return true;
            // CC播放器自带投票弹窗：越过投票时间点未作答会被强制暂停视频（queryVote）
            const vote = document.querySelector('.ccVoteContainer, .ccVoteBox');
            if (vote && isElementVisible(vote)) return true;
        } catch (e) {}
        return false;
    }

    // 🔥 v1.6：执行前进seek —— 使用CC播放器官方API jumpToTime
    // 源码分析（h5player-3.6.2.js）结论：
    // 1) 播放器有反快进看门狗：banDrag && 单次前进>2秒 && 当前时间>已看最大时间(currPlayedMaxTime)
    //    → 强制回退。直接改currentTime、模拟点击进度条都会被回退/拦截（之前"拉不动"的根因）
    // 2) jumpToTime 内部先 this.lastVideoTime = 目标时间 再 setCurrentTime，
    //    看门狗计算的前进量恒≈0，永不触发回退（华医网页面自己就用它做续播跳转）
    function seekForward(video, target) {
        try {
            const p = window.cc_js_Player || window.player;
            if (p && typeof p.jumpToTime === 'function') {
                p.jumpToTime(Math.floor(target));
                console.log(`🎯 已通过 cc_js_Player.jumpToTime 跳到 ${Math.floor(target)} 秒（99%）`);
                return true;
            }
        } catch (e) {}
        // 兜底：直接改currentTime（会被看门狗回退，仅占位）
        try { video.currentTime = target; } catch (e) {}
        return false;
    }

    // 🔥 v1.5：分天达标完成 —— 不管进度条在哪，直接拉到99%，固定1.0x匀速跑完最后1%
    // 返回 true 表示当前处于"达标完成"模式（调用方应跳过常规倍速逻辑）
    function handleCompletionPass(video) {
        try {
            if (!video || !video.duration || isNaN(video.duration)) return false;
            if (!canCompleteFully(video.duration)) return false;
            // 🔥 v2.18：深圳站尾段直通模式已接管（最后10秒固定 1.0x），跳过本函数的 99%/8x 逻辑
            if (SITE.isSzyx && szyxTailMode) return true;

            // 🔥 关键：有弹题/投票/结果浮层时不拉进度条，等自动处理模块完成再拉。
            // 拉进度条越过题目/投票时间点会触发弹窗并回退/暂停进度，
            // 不等待的话会与弹窗反复拉扯（进度条闪烁、永远到不了100%）
            if (hasActiveQuestion()) return true;

            const target = video.duration * 0.99;

            // 🔥 停滞恢复：位置10秒几乎没动（弹窗漏检/异常暂停）→ 强制恢复播放
            // 🌙 v2.0：拟人模式暂停期间不强制恢复，避免守卫与停滞恢复互相拉扯
            const now = Date.now();
            if (Math.abs(video.currentTime - stallPos) > 1) {
                stallPos = video.currentTime;
                stallAt = now;
            } else if (now - stallAt > 10000 && humanizeAllowsPlay()) {
                stallAt = now;
                try {
                    video.play().catch(() => {});
                    console.log('⚠️ 检测到播放停滞，已强制恢复播放');
                } catch (e) {}
            }

            // 跳到99%（3秒防抖避免闪烁；连续3次跳转未保持则熔断，交给8x自然播放）
            if (video.currentTime < target - 1 && jumpFailCount < 3 && Date.now() - lastSeekAt > 3000) {
                lastSeekAt = Date.now();
                seekForward(video, target);
                setTimeout(() => {
                    try {
                        const v = document.querySelector('video');
                        if (!v || !v.duration || hasActiveQuestion()) return;
                        if (v.currentTime < target - 5) {
                            jumpFailCount++;
                            console.log(`⚠️ 跳转未保持（第${jumpFailCount}次回退），当前 ${Math.floor(v.currentTime)} 秒`);
                        } else {
                            jumpFailCount = 0;
                        }
                    } catch (e) {}
                }, 2000);
            }
            // 已达99%：1.0x匀速跑完最后1%（对外显示本来就是1.0x，无检测风险）
            // jumpToTime API不可用时退为8x播放，靠自然播放推进（看门狗安全上限）
            const rate = video.currentTime >= target - 1 ? 1.0 : 8.0;
            originalDescriptor.set.call(video, rate);
            const cp = window.cc_js_Player;
            if (cp && cp.setPlaybackRate) {
                cp.setPlaybackRate(rate);
            }
            return true;
        } catch (e) {
            return false;
        }
    }

    function applyPlaybackSpeed(type) {
        try {
            const video = document.querySelector('video');

            // 🔥 v2.18：深圳站尾段直通模式——最后10秒固定 1.0x，不套用用户倍速
            if (SITE.isSzyx && szyxTailMode) {
                if (video) originalDescriptor.set.call(video, 1.0);
                const cp2 = window.cc_js_Player;
                if (cp2 && cp2.setPlaybackRate) cp2.setPlaybackRate(1.0);
                return;
            }

            // 🔥 v1.5：时间差已达标 → 跳到99%匀速跑完，不再套用倍速
            if (handleCompletionPass(video)) {
                return;
            }

            if (video) {
                // 使用原始 setter 直接设置（绕过我们的劫持）
                originalDescriptor.set.call(video, currentSpeed);
                console.log(`🚀 倍速强制设置为: ${currentSpeed}x`);
            }

            // 使用 CC 播放器 API 设置（作为补充）
            if (typeof cc_js_Player !== 'undefined' && cc_js_Player.setPlaybackRate) {
                cc_js_Player.setPlaybackRate(currentSpeed);
            }
        } catch (e) {
            console.log('倍速设置错误:', e);
        }
    }

    function setPlaybackSpeed(speed) {
        currentSpeed = speed;
        realPlaybackRate = speed;
        localStorage.setItem('huayi_playback_speed', speed.toString());

        const type = urlTip.includes('polyv') ? 1 : 2;

        if (type == 1) {
            console.log('⚠️ 当前为Polyv播放器，不支持倍速');
        } else {
            applyPlaybackSpeed(type);
            console.log(`⚡ 倍速已更新为: ${speed}x (防检测模式)`);

            // 🔥 修复：如果切换到倍速模式，重启时间监控
            if (speed > 1.0) {
                startTimeCheck();
            } else {
                // 切换到正常速度，停止时间监控
                clearInterval(timeCheckInterval);
            }
        }

        // 🔥 v1.5：只更新文本（不再整面板重建——重建会让按钮事件丢失、点击落空）
        if (isExpanded) {
            updateFinishStateLine();
            const sv = document.getElementById('speedValue');
            if (sv) sv.textContent = speed.toFixed(2) + 'x';
        }
    }

    function saveCourseList() {
        // 🔥 v1.5：记录列表页所在目录，用于把课程项里的相对链接解析成绝对地址
        try {
            const listBase = location.origin + location.pathname.substring(0, location.pathname.lastIndexOf('/') + 1);
            localStorage.setItem('huayi_course_list_base', listBase);

            // 课程首页带 cid 参数：记录 cid 与课程首页地址，供结束页兜底返回
            const cid = new URLSearchParams(location.search).get('cid');
            if (cid) {
                localStorage.setItem('huayi_course_cid', cid);
                // 🌐 v1.6：szyxjxjy.cn 的列表页 URL 还带 ol 参数，保存完整地址方便结束页兜底返回
                // 🔥 v1.6 fix：只在列表页(casePage.html)保存，避免播放页(ccPlay.html)覆盖正确的列表页地址
                if (SITE.isSzyx) {
                    if (SITE.isListPage()) {
                        const ol = new URLSearchParams(location.search).get('ol') || '1';
                        localStorage.setItem('huayi_course_home', `${location.origin}${location.pathname}?cid=${cid}&ol=${ol}`);
                    }
                } else {
                    localStorage.setItem('huayi_course_home', location.origin + location.pathname + '?cid=' + cid);
                }
            }
        } catch (e) {}

        const courseMap = new Map(); // cwid -> 课程条目（自动去重）
        let idx = 0;

        const pushCourse = (title, status, cwid, url) => {
            if (!cwid) return;
            cwid = String(cwid).trim();
            if (!cwid || courseMap.has(cwid)) return;
            courseMap.set(cwid, {
                title: (title || cwid).trim(),
                status: (status || '未知').trim(),
                cwid: cwid,
                index: idx++,
                url: (url || '').trim()
            });
        };

        // 🌐 v1.6 结构0（szyxjxjy.cn 列表页 casePage.html）：
        //   <dl class="lisInside-case" onclick="goplay('COURSEWARE_ID','COURSE_SOURCE','VIDEOTYPE','SOURCE_ID')">
        //     <dd><h2>COURSEWARE_NAME</h2>...</dd>
        //     <dd><span>STUDY_STATE_NAME</span></dd>  <!-- 已完成/学习中/未学习 -->
        //   </dl>
        // 直接用 cwid+cid+ol 构建 ccPlay.html 链接，不依赖 goplay 的付费校验流程
        document.querySelectorAll('dl.lisInside-case').forEach(item => {
            const onclick = item.getAttribute('onclick') || '';
            // goplay('COURSEWARE_ID', ...) 第一个引号内的参数即 cwid
            const cwid = (onclick.match(/goplay\(\s*['"]([^'"]+)['"]/) || [])[1];
            if (!cwid) return;
            const title = item.querySelector('h2')?.textContent;
            // study_state_name 在最后一个 dd > span
            const dds = item.querySelectorAll('dd');
            const lastDd = dds[dds.length - 1];
            const status = (lastDd && lastDd.querySelector('span')?.textContent) || '未知';
            pushCourse(title, status, cwid, '');
        });

        // 结构1：课程首页 course.aspx 的 .course[data-href]（data-href 含 ../course_ware/... 完整相对路径）
        document.querySelectorAll('.course[data-href]').forEach(item => {
            const url = item.getAttribute('data-href') || '';
            const cwid = (url.match(/cwid=([^&'"\s]+)/) || [])[1];
            const title = item.querySelector('.cw-title-link strong, .course-item-title strong, strong, h3')?.textContent;
            const stateEl = item.querySelector('.cw-progress-row[data-studystate]');
            const status = stateEl?.getAttribute('data-studystate') ||
                           item.querySelector('.cw-status button, button')?.textContent || '未知';
            pushCourse(title, status, cwid, url);
        });

        // 结构2：课件页侧栏 li.lis-inside-content（onclick 内含 'course_ware.aspx?cwid=...' 相对链接）
        document.querySelectorAll('.lis-inside-content').forEach(item => {
            const onclick = item.getAttribute('onclick') || '';
            const url = (onclick.match(/['"]([^'"]*course_ware\.aspx\?cwid=[^'"]+)['"]/) || [])[1] || '';
            const cwid = (onclick.match(/cwid=([^&'"\)\s]+)/) || [])[1];
            const title = item.querySelector('.cw-title-text, h2, h3, .title, a')?.textContent;
            const status = item.querySelector('.cw-tag-row button, button, .status')?.textContent || '未知';
            pushCourse(title, status, cwid, url);
        });

        // 结构3：兼容旧版页面结构
        document.querySelectorAll('a[onclick*="cwid"], .r .lis').forEach(item => {
            const onclick = item.getAttribute('onclick') || item.querySelector('[onclick*="cwid"]')?.getAttribute('onclick') || '';
            const cwid = (onclick.match(/cwid=([^'"\)\s]+)/) || [])[1];
            const title = item.querySelector('h2, h3, .title, a')?.textContent || item.textContent;
            pushCourse(title, '未知', cwid, '');
        });

        const courses = Array.from(courseMap.values());

        if (courses.length > 0) {
            localStorage.setItem('huayi_course_list', JSON.stringify(courses));
            console.log(`✅ 已保存 ${courses.length} 个课程（含课件地址）`);
        }
    }

    // 🌐 v1.6：szyxjxjy.cn 视频状态检测
    // 页面 course_ware_finish() 成功后：$("#exam").removeClass("notClick") + 设置 href
    // 完成前：<a id="exam" class="notClick" href="javascript:void(0)">进入考试</a>
    // 完成后：<a id="exam" href="/pages/courseware/exam.html?...">进入考试</a>
    function checkVideoStatusSzyx() {
        try {
            const video = document.querySelector('video');
            const exam = document.getElementById('exam');
            // 检测完成：#exam 存在、无 notClick 类、href 不是 javascript:void(0)
            const isExamReady = !!(exam &&
                exam.className.indexOf('notClick') === -1 &&
                exam.getAttribute('href') &&
                !/javascript:void\(0\)/i.test(exam.getAttribute('href') || ''));

            // 视频自然结束且页面已标记完成 → 立即进入考试（不跳下一课）
            if (isExamReady) {
                const examHref = new URL(exam.getAttribute('href'), location.href).href;
                console.log('🎓 深圳卫健平台：课件已完成（#exam 已启用），准备进入考试: ' + examHref);
                setPanelStatus('exam');
                clearInterval(clock);
                clearInterval(timeCheckInterval);
                clearFirstPlay(new URLSearchParams(location.search).get('cwid'));
                // 页面可能在异步登记 feedback，留 2 秒缓冲再进入考试
                setTimeout(() => { location.href = examHref; }, 2000);
                return;
            }

            // 🔥 v2.18：非首播直通尾段——非首次播放 + 时间差已达标（canCompleteFully 满足
            // 服务器"首播时间+时长×1.1"与"课程总时长"双重考核）+ 拟人模式允许 →
            // 直接跳到最后10秒，强制 1.0x 播完（无视用户当前倍速设置），播完自然走考试模块
            if (!szyxTailMode && szyxIsReplay && video && video.duration && !isNaN(video.duration) && !video.ended) {
                if (canCompleteFully(video.duration) && humanizeAllowsPlay()) {
                    szyxTailMode = true;
                    currentSpeed = 1.0; // 让 ended 检测（L1138 currentSpeed===1.0）与守卫都按 1.0x 处理
                    clearInterval(timeCheckInterval); // 停掉倍速监控，避免其 waitRegisteredThenProceed 抢跳下一课
                    console.log('⚡ [深圳] 非首播且时间差已达标：跳到最后10秒，强制1倍速播完（忽略用户倍速设置）');
                    seekForward(video, Math.max(0, video.duration - 10));
                    try {
                        originalDescriptor.set.call(video, 1.0);
                        const cp = window.cc_js_Player;
                        if (cp && cp.setPlaybackRate) cp.setPlaybackRate(1.0);
                    } catch (e) {}
                }
            }
            // 尾段模式下：若位置被看门狗回退（距结尾>12秒），3秒防抖补跳
            if (szyxTailMode && video && video.duration && !video.ended &&
                video.currentTime < video.duration - 12 && Date.now() - szyxTailSeekAt > 3000) {
                szyxTailSeekAt = Date.now();
                seekForward(video, Math.max(0, video.duration - 10));
            }

            // 正常速度播放且视频已结束：页面正在异步提交 course_ware_finish，
            // 不要立即跳转，等 #exam 启用（最多等 15 秒，兜底防止卡死）
            if (currentSpeed === 1.0 && video && video.ended) {
                console.log('📺 视频自然结束，等待页面 course_ware_finish() 异步登记完成…');
                setPanelStatus('completed');
                clearInterval(clock);
                let wait = 0;
                const waitTimer = setInterval(() => {
                    const ex = document.getElementById('exam');
                    const ready = !!(ex &&
                        ex.className.indexOf('notClick') === -1 &&
                        ex.getAttribute('href') &&
                        !/javascript:void\(0\)/i.test(ex.getAttribute('href') || ''));
                    if (ready || wait > 15) {
                        clearInterval(waitTimer);
                        clearFirstPlay(new URLSearchParams(location.search).get('cwid'));
                        if (ready) {
                            // 🔥 v2.5：ready 时进考试，不再 proceedToNext 跳下一课
                            const examHref = new URL(ex.getAttribute('href'), location.href).href;
                            console.log('🎓 视频结束且登记完成，进入考试: ' + examHref);
                            setPanelStatus('exam');
                            setTimeout(() => { location.href = examHref; }, 2000);
                        } else {
                            proceedToNext();
                        }
                    }
                    wait++;
                }, 1000);
                return;
            }

            // 仍未完成：标记播放中
            setPanelStatus('playing');
        } catch (e) {
            console.log('szyxjxjy 状态检测错误:', e);
        }
    }

    function checkVideoStatus() {
        try {
            if (SITE.isSzyx) {
                return checkVideoStatusSzyx();
            }

            let state = null;
            const stateEl = document.querySelector("i[id='top_play']");

            if (stateEl) {
                state = stateEl.parentNode?.nextElementSibling?.nextElementSibling?.nextElementSibling?.innerText;
            }

            if (!state) {
                const buttons = document.querySelectorAll('button, .state');
                for (let btn of buttons) {
                    const text = btn.textContent;
                    if (text?.includes('已完成') || text?.includes('待考试')) {
                        state = text.trim();
                        break;
                    }
                }
            }

            const video = document.querySelector('video');

            // 正常速度播放（非倍速）的特殊处理
            if (currentSpeed === 1.0 && video && video.ended) {
                const statusText = state || '';

                // 判断是否为"学习中"或"未学习"状态
                const isLearningStatus = statusText.includes('学习中') ||
                                       statusText.includes('未学习') ||
                                       (!statusText.includes('已完成') &&
                                        !statusText.includes('待考试'));

                if (isLearningStatus) {
                    // 🔥 v2.1：同样等待服务器登记（状态文本变为 已完成/待考试）再跳转，不再固定5秒
                    console.log('📺 正常速度播放完成，等待服务器登记完成（状态变为已完成）后跳转...');
                    waitRegisteredThenProceed(30000);
                    return;
                }
            }

            // 🔥 修复：移除倍速模式下的进度检测，避免与时间监控冲突
            // 倍速模式下的跳转完全由 startTimeCheck 函数处理

            // 原有的完成状态检测
            if (state == '已完成') {
                console.log('✅ 视频完成,准备跳转');
                setPanelStatus('completed');
                clearInterval(clock);
                clearInterval(timeCheckInterval);
                clearFirstPlay(new URLSearchParams(location.search).get('cwid'));
                setTimeout(() => proceedToNext(), 2000);
            } else if (state == '待考试') {
                console.log('📝 待考试状态,5秒后跳转');
                clearInterval(clock);
                clearInterval(timeCheckInterval);
                setTimeout(() => proceedToNext(), 5000);
            } else if (state) {
                setPanelStatus('playing');
            }
        } catch (e) {
            console.log('状态检测错误:', e);
        }
    }

    // 🔥 v1.5：把课程条目解析成可跳转的课件地址
    // 优先用列表页保存的原始链接（课程首页是 ../course_ware/...，课件侧栏是 course_ware.aspx?...），
    // 按保存列表时的页面目录解析为绝对地址；其次用课件页目录缓存；
    // 最后兜底 origin + /course_ware/（华医网课件固定目录，避免在 /pages/ 下拼出错误路径404）
    function resolveCoursewareUrl(entry, player) {
        const fileName = player === 'polyv' ? 'course_ware_polyv.aspx' : 'course_ware_cc.aspx';
        const listBase = localStorage.getItem('huayi_course_list_base') || '';

        if (entry && entry.url && listBase) {
            try {
                const abs = new URL(entry.url, listBase).href;
                return abs.replace('course_ware.aspx', fileName);
            } catch (e) {}
        }

        // 🌐 v1.6：szyxjxjy.cn 的课程项 url 为空（saveCourseList 未保存相对链接），
        // 用 SITE.buildPlayUrl 直接拼出 ccPlay.html?cwid=X&ol=Y&cid=Z
        if (SITE.isSzyx) {
            return SITE.buildPlayUrl(entry ? entry.cwid : '', player);
        }

        const base = localStorage.getItem('huayi_course_base') || (location.origin + '/course_ware/');
        return `${base}${fileName}?cwid=${entry ? entry.cwid : ''}`;
    }

    // 🔥 v2.1：等待课件完成被服务器登记后，再跳转下一课
    // 视频播放到头只是播放器状态；页面还要异步提交 course_ware_finish（需要几秒），
    // 登记成功的标志：深圳站 #exam 按钮由灰(notClick)变蓝(可点击)；华医站状态文本出现 已完成/待考试。
    // 之前的逻辑在视频还剩1秒时就跳走，course_ware_finish 从未触发，考试入口一直灰色、本课永远卡"学习中"。
    // 轮询最多 maxWaitMs（默认45秒），超时兜底跳转避免卡死（超时保留首播记录，下次打开重试登记）。
    function waitRegisteredThenProceed(maxWaitMs) {
        const deadline = Date.now() + (maxWaitMs || 45000);
        const cwid = new URLSearchParams(location.search).get('cwid');
        clearInterval(clock);
        clearInterval(timeCheckInterval);
        setPanelStatus('completed');
        // 🔥 v2.3：#exam 变蓝的时刻——变蓝后 userFeedBackCoursewareOk XHR 还需要几秒设置 href
        let blueSince = 0;

        const poll = () => {
            let blue = false, examHref = '';
            try {
                if (SITE.isSzyx) {
                    const exam = document.getElementById('exam');
                    blue = !!(exam && exam.className.indexOf('notClick') === -1);
                    const href = exam ? (exam.getAttribute('href') || '') : '';
                    if (blue && href && !/javascript:void\(0\)/i.test(href)) {
                        examHref = new URL(href, location.href).href;
                    }
                } else {
                    let state = null;
                    const stateEl = document.querySelector("i[id='top_play']");
                    if (stateEl) state = stateEl.parentNode?.nextElementSibling?.nextElementSibling?.nextElementSibling?.innerText;
                    if (!state) {
                        const buttons = document.querySelectorAll('button, .state');
                        for (let btn of buttons) {
                            const text = btn.textContent;
                            if (text?.includes('已完成') || text?.includes('待考试')) { state = text.trim(); break; }
                        }
                    }
                    blue = !!(state && (state.includes('已完成') || state.includes('待考试')));
                }
            } catch (e) {}

            if (examHref) {
                // 🎓 深圳站：考试入口已变蓝且有有效链接 → 立即进入考试
                // 不进的话下次再打开视频页，#exam 又会变回灰色（页面每次加载硬编码灰色，只有播完才变蓝）
                console.log('🎓 考试入口已启用，立即进入考试: ' + examHref);
                clearFirstPlay(cwid);
                setPanelStatus('exam');
                setTimeout(() => { location.href = examHref; }, 2000);
                return;
            }
            if (blue) {
                if (!blueSince) blueSince = Date.now();
                // 深圳站：变蓝了但 href 还没设好（userFeedBackCoursewareOk XHR 还在飞）→ 等 15 秒
                // 15 秒内 href 出现→进考试；15 秒后仍无→此课件无考试→跳下一课
                // 华医站：变蓝即登记完成 → 直接跳下一课
                if (!SITE.isSzyx || Date.now() - blueSince > 15000) {
                    console.log(SITE.isSzyx
                        ? '📋 完成已登记但此课件无考试链接，跳转下一课'
                        : '✅ 完成已登记，跳转下一课');
                    clearFirstPlay(cwid);
                    setTimeout(() => proceedToNext(), 2000);
                    return;
                }
            }
            if (Date.now() > deadline) {
                console.log('⚠️ 等待完成登记超时，兜底跳转下一课（保留计时记录，下次打开重试）');
                setTimeout(() => proceedToNext(), 2000);
                return;
            }
            setTimeout(poll, 1000);
        };
        poll();
    }

    // 🔥 v2.7：深圳站考试页自动作答（模仿华医网弹题的"错题记忆"方式，最终达成全对）
    // 机制：exam.html 由题库随机抽题（.shiti + p[data-qid] + 单选 value=选项ID），交卷 subExam() 提交
    // /courseware/saveCourseWareFinish：全对 → res.body 存 sessionStorage szCourseWare 跳 examresult.html；
    // 有错 → res.body（错题列表）存 sessionStorage szErrrQuestion 同样跳 examresult.html。
    // 策略：localStorage（huayi_szyx_wrong）按题目ID记忆"已被判错的选项ID"，每轮作答避开已错选项
    // （优先选第一个未试过的选项），交卷前把本轮选择存 sessionStorage（huayi_szyx_last_answers），
    // 结果页据此把判错的题目所选选项记入错题库，然后自动回考试页重考——题库有限，逐题排除最终全对。
    const SZYX_WRONG_KEY = 'huayi_szyx_wrong';
    const SZYX_LAST_ANS_KEY = 'huayi_szyx_last_answers';
    const SZYX_CORRECT_KEY = 'huayi_szyx_correct'; // 🔥 v2.12：qid → 已确认正确的选项文本（v2.13 起按文本，免疫选项乱序）

    function getSzyxWrongMap() {
        return safeParseJSON(localStorage.getItem(SZYX_WRONG_KEY), {}) || {};
    }
    // 🔥 v2.12：已确认正确答案表（某轮该题没被判错 → 本轮所选即正确答案，永久锁定）
    function getSzyxCorrectMap() {
        return safeParseJSON(localStorage.getItem(SZYX_CORRECT_KEY), {}) || {};
    }
    function setSzyxCorrect(qid, optId) {
        if (!qid || !optId) return;
        const map = getSzyxCorrectMap();
        map[qid] = optId;
        localStorage.setItem(SZYX_CORRECT_KEY, JSON.stringify(map));
    }
    // 🔥 v2.15：作废脏锁（被锁选项已被判错时调用）
    function deleteSzyxCorrect(qid) {
        const map = getSzyxCorrectMap();
        if (qid in map) { delete map[qid]; localStorage.setItem(SZYX_CORRECT_KEY, JSON.stringify(map)); }
    }
    function addSzyxWrong(qid, optId) {
        if (!qid || !optId) return;
        const map = getSzyxWrongMap();
        if (!Array.isArray(map[qid])) map[qid] = [];
        if (map[qid].indexOf(optId) === -1) map[qid].push(optId);
        localStorage.setItem(SZYX_WRONG_KEY, JSON.stringify(map));
    }
    // 🔥 v2.13：提取选项文本（去掉 "A、" 字母前缀并归一化）。
    // 服务器每次刷新会打乱选项顺序且选项 ID 可能变化，按 ID 记忆会失效；按文本记忆免疫乱序。
    function szyxOptText(inp) {
        const label = inp.closest('label') || inp.parentElement;
        let t = label ? (label.textContent || '') : '';
        return t.replace(/^\s*[A-Za-z]\s*[、.．,，:：]?\s*/, '').replace(/\s+/g, ' ').trim();
    }
    // 🔥 v2.19：取选项字母（label "A、xxx" → 'A'），供"答案均衡分布先验"使用；取不到返回 ''
    function szyxOptLetter(inp) {
        const label = inp.closest('label') || inp.parentElement;
        const m = label ? String(label.textContent || '').trim().match(/^([A-Za-z])/) : null;
        return m ? m[1].toUpperCase() : '';
    }
    // 🔥 v2.14：归一化题干/选项文本——去掉序号前缀和**全部空白字符**。
    // 实测：服务器题干渲染为"常规病理 HE 染色切片"（中英文间带空格），结果页错题列表却是不带空格的
    // "常规病理HE染色切片"，按整串匹配会失败导致错题记不上（v2.11 诊断日志已暴露此问题）。
    function szyxNormText(t) {
        return String(t || '')
            .replace(/^\s*\d+\s*[、.．,，]\s*/, '')  // 题目序号 "1、"
            .replace(/^\s*[A-Za-z]\s*[、.．,，:：]?\s*/, '') // 选项字母 "A、"
            .replace(/\s+/g, '')                       // 全部空白（含中英文间空格差异）
            .trim();
    }
    function szyxRetryKey(cwid) { return 'huayi_szyx_retry_' + cwid; }

    // 🔥 v2.8：XHR 钩子——捕获 /courseware/getQusetionlist 与 /courseware/saveCourseWareFinish 的原始响应。
    // 目的：① 探测题目接口原始 JSON 是否带正确答案标记字段（页面未渲染但服务器可能返回，如 is_right/right_flag）；
    //       ② 保存交卷响应便于事后分析错题结构。原始响应存 localStorage（huayi_szyx_qraw / huayi_szyx_saveres）
    //       并打印到控制台，方便在 DevTools Console / Application→Local Storage 里核对字段。
    function hookSzyxExamApi() {
        if (window.__szyxExamApiHooked) return;
        window.__szyxExamApiHooked = true;
        const origOpen = XMLHttpRequest.prototype.open;
        const origSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.open = function (method, url) {
            this.__hookUrl = url;
            return origOpen.apply(this, arguments);
        };
        XMLHttpRequest.prototype.send = function () {
            this.addEventListener('load', function () {
                const u = this.__hookUrl || '';
                try {
                    if (/getQusetionlist/i.test(u) && this.responseText) {
                        window.__szyxQuestionRaw = JSON.parse(this.responseText);
                        localStorage.setItem('huayi_szyx_qraw', this.responseText);
                        console.log('🔎 [考试] getQusetionlist 原始响应（已存 localStorage: huayi_szyx_qraw）↓');
                        console.log(JSON.stringify(window.__szyxQuestionRaw, null, 2));
                    } else if (/saveCourseWareFinish/i.test(u) && this.responseText) {
                        localStorage.setItem('huayi_szyx_saveres', this.responseText);
                        console.log('🔎 [考试] saveCourseWareFinish 原始响应（已存 localStorage: huayi_szyx_saveres）↓');
                        console.log(this.responseText);
                    }
                } catch (e) {}
            });
            return origSend.apply(this, arguments);
        };
    }

    // 🔥 v2.8：若 getQusetionlist 原始响应的选项对象带"正确答案"标记字段（is_right / right / correct /
    // answer / is_ok 等，值为 1/true/"1"），直接返回该选项 ID——比错题排除法快得多（一轮全对）。
    // 逐题扫描：优先题目对象自身 answer 字段（可能直接是正确选项 ID），再扫各选项布尔标记。
    function findSzyxCorrectOptId(rawBody, qid) {
        if (!rawBody || !Array.isArray(rawBody)) return null;
        const q = rawBody.find(e => e && e.question_id === qid);
        if (!q) return null;
        // ① 题目对象直接带答案字段（answer/right_id/correct_id...）
        for (const k of ['answer', 'right_id', 'correct_id', 'answer_id', 'right_option_id']) {
            const v = q[k];
            if (v && typeof v === 'string') return v;
        }
        // ② 选项对象带正确标记（is_right/right_flag/is_correct/...）
        if (Array.isArray(q.options)) {
            for (const opt of q.options) {
                if (!opt || typeof opt !== 'object') continue;
                for (const k in opt) {
                    if (!/right|correct|answer|is_ok/i.test(k)) continue;
                    const v = opt[k];
                    if (v === true || v === 1 || v === '1' || v === 'true') return opt.question_id;
                }
            }
        }
        return null;
    }

    function autoAnswerSzyxExam() {
        let submitted = false;
        const start = (attempt) => {
            if (submitted) return;
            const items = document.querySelectorAll('.kaoshi_box .shiti');
            if (!items.length) {
                if (attempt < 30) setTimeout(() => start(attempt + 1), 1000);
                return;
            }
            // loadQuestion() 会异步重建 .kaoshi_box，等 2.5 秒题目稳定后再作答，避免填了被冲掉
            setTimeout(() => fill(items.length), 2500);
        };
        const fill = (prevCount) => {
            if (submitted) return;
            const items = document.querySelectorAll('.kaoshi_box .shiti');
            if (!items.length) { start(0); return; }
            const wrongMap = getSzyxWrongMap();
            const rawBody = (window.__szyxQuestionRaw && Array.isArray(window.__szyxQuestionRaw.body))
                ? window.__szyxQuestionRaw.body : null; // 🔥 v2.8：题目接口原始响应
            const chosen = {};
            const byName = {}; // 🔥 v2.9：题干文本 → {qid, opt, optText}（结果页错题列表是文本，靠它反查题目ID）
            const correctMap = getSzyxCorrectMap(); // 🔥 v2.12：已确认正确的答案（v2.13 起按选项文本），直接锁定
            let fromApi = 0, fromLocked = 0, fromElim = 0;
            // 🔥 v2.19：答案均衡分布先验——出题人的标准卷面正确答案往往 A~E 各字母均衡（如 10 题各 2 道）。
            // 本轮内已确定答案（锁定/API/排除法已选）的字母实时计数；排除法选候选时优先补"最欠配额"的字母，
            // 同配额字母间随机平票。软偏好而非硬约束：错题排除永远优先，不影响任何既有优先级；
            // 信息论上最坏轮数不变（每轮每题必然淘汰一个错项，与选哪个候选无关），只降低期望轮数。
            // 注意：本站选项每次渲染随机打乱，字母均衡在打乱后只是弱先验，因此仅作排序偏好。
            const letterCount = {};
            items.forEach(div => {
                const qid = div.querySelector('p[data-qid]');
                if (!qid) return;
                const qidVal = qid.getAttribute('data-qid');
                const inputs = div.querySelectorAll('input[type="radio"]');
                if (!inputs.length) return;
                // 🔥 v2.13：选项乱序 + ID 可能变化 → 记忆全部改为按"选项文本"匹配
                const wrongOpts = (wrongMap[qidVal] || []).map(t => szyxNormText(t)); // 该题已判错的选项文本（归一化）
                const pickByText = txt => Array.from(inputs).find(i => szyxNormText(szyxOptText(i)) === szyxNormText(txt)) || null;
                let pick = null;
                // 🔥 v2.12 优先级 1：已确认正确（历史某轮未判错）→ 永久锁定，不再试探
                // 🔥 v2.15 锁-错冲突自愈：若被锁的选项文本同时出现在错题库中，说明该锁是
                // v2.13 空格匹配 bug 时期误锁的脏数据（判错题没匹配上→被当成"对的题"锁了错误答案），
                // 此锁不可信 → 立即作废删除，回落排除法重新试探。
                if (correctMap[qidVal]) {
                    const lockText = szyxNormText(correctMap[qidVal]);
                    if (wrongOpts.indexOf(lockText) !== -1) {
                        console.warn('🧹 [考试] 检测到脏锁（被锁选项已判错）→ 作废 qid=' + qidVal + ' 锁="' + correctMap[qidVal] + '"，回落排除法');
                        deleteSzyxCorrect(qidVal);
                        delete correctMap[qidVal];
                    } else {
                        pick = pickByText(correctMap[qidVal]);
                        if (pick) fromLocked++;
                    }
                }
                // 🔥 v2.12 优先级 2：服务器原始响应的答案字段——必须通过冲突校验：
                // 若该选项（按文本）已被判错过，说明字段不可信，弃用，防止反复选同一错项
                if (!pick) {
                    const apiOptId = rawBody ? findSzyxCorrectOptId(rawBody, qidVal) : null;
                    if (apiOptId) {
                        const apiPick = Array.from(inputs).find(i => i.value === apiOptId) || null;
                        if (apiPick && wrongOpts.indexOf(szyxNormText(szyxOptText(apiPick))) === -1) { pick = apiPick; fromApi++; }
                    }
                }
                // 🔥 v2.17/v2.19 优先级 3：排除法（随机化 + 均衡先验）——
                // 候选 = "文本未被判错"的全部选项（首轮答题全选项都是候选，首次作答同样走这里）。
                // v2.19 在随机基础上叠加"答案均衡分布先验"：优先补本轮出现次数最少的字母，
                // 同配额字母间随机平票——既保留 v2.17 消除固定遍历的随机性，又利用出题人
                // "A~E 均衡出答案"的统计规律降低期望收敛轮数；错题排除仍绝对优先。
                if (!pick) {
                    const candidates = Array.from(inputs).filter(
                        inp => wrongOpts.indexOf(szyxNormText(szyxOptText(inp))) === -1);
                    if (candidates.length) {
                        let bestN = Infinity;
                        const tied = [];
                        candidates.forEach(inp => {
                            const n = letterCount[szyxOptLetter(inp)] || 0;
                            if (n < bestN) { bestN = n; tied.length = 0; tied.push(inp); }
                            else if (n === bestN) tied.push(inp);
                        });
                        pick = tied[Math.floor(Math.random() * tied.length)]; // 最欠配额字母（并列则随机）
                        fromElim++;
                    }
                    else { pick = inputs[0]; } // 全部判错（理论上不该发生）
                }
                pick.checked = true;
                pick.click();
                // 🔥 v2.19：本轮字母配额计数（锁定/API/排除法的最终选择都计入）
                const pickLetter = szyxOptLetter(pick);
                if (pickLetter) letterCount[pickLetter] = (letterCount[pickLetter] || 0) + 1;
                chosen[qidVal] = pick.value;
                // 🔥 v2.9：结果页 szErrrQuestion 存的是题目文本（非题目ID），按题干文本建立映射
                // （v2.14：两边都用 szyxNormText 归一化——去序号前缀 + 去全部空白，
                //  免疫"常规病理 HE 染色"vs"常规病理HE染色"这类空格差异）
                const qText = szyxNormText(qid.textContent);
                byName[qText] = { qid: qidVal, opt: pick.value, optText: szyxOptText(pick) };
            });
            // 复查：所有题都已选中
            const unchecked = document.querySelectorAll('.kaoshi_box .shiti').length -
                              document.querySelectorAll('.kaoshi_box input[type="radio"]:checked').length;
            if (unchecked > 0) { console.log('⚠️ [考试] 有 ' + unchecked + ' 题未选中，1 秒后重试'); setTimeout(() => fill(0), 1000); return; }

            sessionStorage.setItem(SZYX_LAST_ANS_KEY, JSON.stringify({ byId: chosen, byName: byName }));
            // 重考次数守卫（防止题库异常导致死循环）
            const params = new URLSearchParams(location.search);
            const cwid = params.get('cid') || params.get('cwid');
            const retries = parseInt(localStorage.getItem(szyxRetryKey(cwid)) || '0', 10);
            if (retries > 40) {
                console.log('⛔ [考试] 重考超过 40 次仍未全对，停止自动作答，请人工处理');
                return;
            }
            submitted = true;
            // 🔥 v2.10：交卷间隔拟人化——作答完随机等 20~60 秒再交卷，避免答题过快被风控中断
            const submitDelay = Math.floor(20000 + Math.random() * 40000);
            console.log('📝 [考试] 已作答 ' + Object.keys(chosen).length + ' 题（锁定正确 ' + fromLocked +
                ' / API答案 ' + fromApi + ' / 排除法 ' + fromElim + '）（第 ' + (retries + 1) +
                ' 次交卷），' + Math.round(submitDelay / 1000) + ' 秒后交卷');
            setTimeout(() => {
                const btn = document.querySelector('.but2_a');
                if (btn && typeof window.subExam === 'function') {
                    window.subExam();
                } else if (btn) {
                    btn.click();
                }
                // 🔥 v2.16：交卷后守卫——若交卷请求被风控拦截（502/404 弹"网站暂时关闭"、
                // 页面停在考试页不跳结果页），90 秒后刷新考试页重进，循环不断链
                setTimeout(() => {
                    if (/exam\.html/i.test(location.pathname)) {
                        console.warn('🛑 [考试] 交卷后 90 秒仍未跳转结果页（疑似请求被拦截），刷新考试页恢复循环');
                        location.reload();
                    }
                }, 90000);
            }, submitDelay);
        };
        start(0);
    }

    function handleSzyxExamResult() {
        const params = new URLSearchParams(location.search);
        const cwid = params.get('cwid');
        let wrongList = null;
        try { wrongList = safeParseJSON(sessionStorage.getItem('szErrrQuestion'), null); } catch (e) {}
        const passed = !wrongList || !wrongList.length;

        if (passed) {
            // 全对通过：标记完成，续播下一课
            // 🔥 v2.12：正确答案表（huayi_szyx_correct）保留不清——同一课件/重复抽到的题直接秒答；
            // 错题记忆、重考计数、答卷映射清掉
            console.log('🎉 [考试] 全部答对，考试通过！');
            try {
                localStorage.removeItem(SZYX_WRONG_KEY);
                if (cwid) localStorage.removeItem(szyxRetryKey(cwid));
                sessionStorage.removeItem(SZYX_LAST_ANS_KEY);
            } catch (e) {}
            if (cwid) markCourseCompleted(cwid);
            setPanelStatus('completed');
            setTimeout(() => proceedToNext(), 3000);
            return;
        }

        // 有错题：把判错题目所选的选项记入错题库，然后自动回考试页重考
        // 🔥 v2.9：szErrrQuestion 实为**题干文本数组**（examresult.html 直接 <li>${elem}</li> 渲染），
        // 靠交卷前存的 byName 映射（题干文本 → {qid, opt}）反查题目ID；同时兼容旧版/对象元素。
        let last = {};
        try { last = safeParseJSON(sessionStorage.getItem(SZYX_LAST_ANS_KEY), {}) || {}; } catch (e) {}
        const byId = last.byId || last;                 // v2.9 结构 {byId, byName}；旧版为扁平 qid map
        const byName = last.byName || {};
        let recorded = 0;
        const unmatched = [];
        const wrongQids = {}; // 🔥 v2.12：本轮被判错的 qid 集合（未判错 = 所选即正确答案，锁定）
        wrongList.forEach(w => {
            let qid = null, optText = null;
            if (typeof w === 'string') {
                // 🔥 v2.14：题干文本归一化（去序号 + 去全部空白）后匹配，免疫空格差异
                const text = szyxNormText(w);
                if (byName[text]) { qid = byName[text].qid; optText = byName[text].optText || byName[text].opt; }
                if (!qid && byId[w]) { qid = w; optText = (byId[w] && byId[w].optText) || byId[w]; } // 兼容：元素本身是题目ID
            } else if (w && typeof w === 'object') {
                qid = w.question_id || w.qid || w.id || null;
                if (qid && byId[qid]) optText = (byId[qid] && byId[qid].optText) || byId[qid];
            }
            if (qid && optText) {
                // 🔥 v2.13：错题记忆改按"选项文本"存储（选项乱序 + ID 变化时依然有效）
                addSzyxWrong(qid, String(optText).trim()); recorded++;
                wrongQids[qid] = true; // 🔥 v2.12：记入本轮判错集合，锁定正确答案时跳过
                console.log('🧠 [考试] 记错题：' + String(w).slice(0, 30) + '… → qid=' + qid + ' 错误选项文本=' + optText);
            } else {
                unmatched.push(w);
            }
        });
        // 🔥 v2.11：诊断——有错题没匹配上（映射丢失）时警告，方便定位"一直错同一题"的原因
        if (unmatched.length) {
            console.warn('⚠️ [考试] 有 ' + unmatched.length + ' 道错题未能映射到本轮所选选项（本轮答卷映射缺失或文本不一致）：',
                unmatched, '；当前答卷映射 byName=', byName);
        }
        // 🔥 v2.12（算法优化核心）：本轮**没被判错**的题 → 所选选项即为正确答案，永久锁定！
        // 每轮批改给全部题目反馈（错/对），原来只利用了"错"的信息（排除 1 项），
        // 现在同时利用"对"的信息（直接确定答案）——正确答案一旦选中就永不再试探。
        let locked = 0;
        Object.keys(byName).forEach(text => {
            const info = byName[text];
            if (!info || !info.qid) return;
            const optText = info.optText || info.opt;
            if (!optText) return;
            if (wrongQids[info.qid]) return; // 判错的走 addSzyxWrong
            // 🔥 v2.15 双保险：锁定的选项若已在错题库中（历史脏数据），拒绝写入锁
            const wrongArr = getSzyxWrongMap()[info.qid] || [];
            if (wrongArr.some(t => szyxNormText(t) === szyxNormText(optText))) return;
            // 🔥 v2.13：锁定也按选项文本
            setSzyxCorrect(info.qid, String(optText).trim());
            locked++;
        });
        console.log('🧠 [考试] 本轮锁定正确答案 ' + locked + ' 题（累计 ' +
            Object.keys(getSzyxCorrectMap()).length + '），错题库：', getSzyxWrongMap());
        const retries = cwid ? parseInt(localStorage.getItem(szyxRetryKey(cwid)) || '0', 10) + 1 : 1;
        if (cwid) localStorage.setItem(szyxRetryKey(cwid), String(retries));
        // 🔥 v2.10：重考间隔拟人化随机 20~60 秒，防止答题循环过快被风控中断。
        const retryDelaySec = Math.floor(20 + Math.random() * 40);
        console.log('❌ [考试] 第 ' + retries + ' 次未全对，已记录 ' + recorded + ' 个错题选项，' + retryDelaySec + ' 秒后点"重新考试"');
        // 🔥 v2.9：只点"重新考试"按钮（绝不点"重新学习"），按钮缺失时按同款 URL 兜底导航。
        // exam.html 从 sessionStorage szExamParams 取 course_ware_id，本会话内仍在，无需带 cwid。
        setTimeout(() => {
            const buttons = Array.from(document.querySelectorAll('#errHtml button, .but3 button'));
            const retryBtn = buttons.find(b => (b.textContent || '').indexOf('重新考试') !== -1);
            if (retryBtn) { console.log('🔁 [考试] 点击"重新考试"'); retryBtn.click(); return; }
            const ol = params.get('ol') || '1';
            const cname = encodeURIComponent(params.get('cname') || '');
            location.href = '/pages/courseware/exam.html?ol=' + ol + (cname ? '&cname=' + cname : '');
        }, retryDelaySec * 1000);
    }

    // 🔥 v2.6：课件评价页（coursewareEvaluation.html）自动填写好评并提交
    // 不记录"第几次进入"，完全按页面特征判断：
    //   - 题目由页面异步请求 /feedback/listOrganQuestion 渲染（.shiti[data-qt=1] 单选 / data-qt=2 文字评语）
    //   - 首次进入：题目列表非空 → 自动全选最优评价 + 填好评语 → 点 #submit 提交
    //   - 已评价过：服务器返回空列表 → 页面 JS 自己跳 exam.html，脚本无需干预
    // 好评策略：按关键词精确匹配最优选项（很满意/是/很大/全知道…），匹配不到则默认选第一个选项
    // （服务器选项按"最好→最差"排序，第一个即最优）；提交成功后页面弹 myLayer.Alert 确认框，
    // 回调里跳 exam.html，所以还要自动点掉确认按钮。
    function autoEvaluateCourseware() {
        const POSITIVE = ['很满意', '非常满意', '是', '很大', '全知道', '满意', '基本是', '较大', '部分知道'];
        let filled = false;

        const fill = (attempt) => {
            if (filled) return;
            const items = document.querySelectorAll('#kaoshiDiv .shiti');
            if (!items.length) {
                // 题目异步加载中，每秒重试（最多 30 秒；空列表场景页面会自行跳转）
                if (attempt < 30) setTimeout(() => fill(attempt + 1), 1000);
                return;
            }
            filled = true;
            let radios = 0, texts = 0;
            items.forEach(div => {
                if (div.getAttribute('data-qt') === '1') {
                    const inputs = div.querySelectorAll('input[type="radio"]');
                    if (!inputs.length) return;
                    let pick = inputs[0]; // 兜底：选项按最好→最差排序，第一个即最优
                    for (let kw of POSITIVE) {
                        const hit = Array.from(inputs).find(i => (i.value || '').trim() === kw);
                        if (hit) { pick = hit; break; }
                    }
                    pick.checked = true;
                    pick.click();
                    radios++;
                } else {
                    const ta = div.querySelector('textarea');
                    if (ta && !(ta.value || '').trim()) {
                        ta.value = '课程内容充实，讲授清晰，收获很大，总体非常满意。';
                        texts++;
                    }
                }
            });
            console.log('📝 [课件评价] 已填写好评：单选 ' + radios + ' 题，评语 ' + texts + ' 条，1 秒后提交');
            setTimeout(() => {
                const btn = document.getElementById('submit');
                if (btn && !btn.getAttribute('disabled')) btn.click();
            }, 1000);

            // 提交成功后 myLayer.Alert(res.message, callback) 弹确认框，点确定才会跳 exam.html
            const clickLayerBtn = setInterval(() => {
                const b = document.querySelector('.layui-layer-btn a') ||
                          document.querySelector('.layui-layer-btn0');
                if (b) { b.click(); clearInterval(clickLayerBtn); }
            }, 800);
            setTimeout(() => clearInterval(clickLayerBtn), 60000);
        };
        fill(0);
    }

    // 🔥 v2.5：MutationObserver 直接监听 #exam 元素（class/href 属性变化）
    // 之前 v2.1~v2.4 依赖多处轮询（clock 状态轮询 / timeCheckInterval / waitRegisteredThenProceed 轮询 /
    // checkVideoStatusSzyx 内部 waitTimer），多个定时器之间存在竞争，任一路径先触发 proceedToNext()
    // 就会跳去下一课、错过进入考试的时机。改用 MutationObserver 后，页面执行
    // $("#exam").removeClass("notClick") 或 $("#exam").attr("href", ...) 的瞬间即可感知，
    // 变蓝 + href 生效两个条件同时满足时立即导航进考试，彻底绕开轮询竞争。
    function setupExamWatcher() {
        if (!SITE.isSzyx || !SITE.isPlayPage()) return;
        let navigating = false;

        const tryEnterExam = (via) => {
            if (navigating) return true;
            const ex = document.getElementById('exam');
            if (!ex) return false;
            const cls = ex.className || '';
            const href = ex.getAttribute('href') || '';
            if (cls.indexOf('notClick') !== -1) return false;       // 还是灰色
            if (!href || /javascript:void\(0\)/i.test(href)) return false; // href 未生效
            const examUrl = new URL(href, location.href).href;
            navigating = true;
            console.log('🎓 [exam-watcher:' + via + '] 考试入口已启用，立即进入考试: ' + examUrl);
            clearInterval(clock);
            clearInterval(timeCheckInterval);
            setPanelStatus('exam');
            clearFirstPlay(new URLSearchParams(location.search).get('cwid'));
            // 留 1.5 秒缓冲（页面可能仍在提交 userFeedBackCoursewareOk），期间无其他路径能再触发跳转
            setTimeout(() => { location.href = examUrl; }, 1500);
            return true;
        };

        const attach = (attempt) => {
            if (navigating) return;
            // 页面加载时 #exam 可能尚未渲染，且个别情况下打开即已完成（直接变蓝）
            if (tryEnterExam('init')) return;
            const ex = document.getElementById('exam');
            if (ex) {
                new MutationObserver(() => { tryEnterExam('mutation'); })
                    .observe(ex, { attributes: true, attributeFilter: ['class', 'href'] });
                // observe 建立前可能刚发生变更，再补查一次
                tryEnterExam('post-attach');
                return;
            }
            // #exam 尚未出现在 DOM，每 2 秒重试（最多 5 分钟）
            if (attempt < 150) setTimeout(() => attach(attempt + 1), 2000);
        };
        attach(0);
    }

    function proceedToNext() {
        // 🌙 v2.0：拟人模式——非活动时段/当日额度已满时暂缓自动续播，每分钟重试直到窗口开启
        // （夜里的真实时间差照常累计，暂缓的只是"像真人的跳转动作"）
        if (!humanizeAllowsPlay()) {
            console.log('🌙 拟人模式：当前不在活动时段或今日额度已满，暂缓跳转下一课（每分钟自动重试）');
            setTimeout(() => proceedToNext(), 60000);
            return;
        }
        // 确保当前视频进度被记录
        try {
            const video = document.querySelector('video');
            if (video && video.currentTime > 0) {
                console.log(`📊 记录进度: ${Math.round(video.currentTime/video.duration*100)}%`);
                // 模拟进度提交（根据实际API调整）
                window.dispatchEvent(new Event('beforeunload'));
            }
        } catch (e) {
            console.log('进度记录错误:', e);
        }

        const courses = safeParseJSON(localStorage.getItem('huayi_course_list'), []);
        const currentCwid = new URLSearchParams(location.search).get('cwid');
        const currentIdx = courses.findIndex(c => c.cwid === currentCwid);

        console.log(`🔍 当前课程索引: ${currentIdx}, 总数: ${courses.length}`);

        const isIncomplete = (status) => {
            if (!status) return true;
            const s = status.toLowerCase();
            return !s.includes('已完成') && !s.includes('完成');
        };

        // 🔥 v2.2：绝不能把"下一课"解析成当前课件自己——
        // 列表里没有当前课件时（currentIdx=-1，如未进过列表页/换浏览器），旧逻辑会从头扫到
        // 本课件（本地状态还是"学习中"）→ 跳回自己 → 视频从0重播 → 重新登记播放会话，
        // 把刚变蓝的考试入口又打回灰色，死循环
        const isSelf = (c) => c && c.cwid && currentCwid && c.cwid === currentCwid;

        let nextCourse = null;

        for (let i = currentIdx + 1; i < courses.length; i++) {
            if (!isSelf(courses[i]) && isIncomplete(courses[i].status)) {
                nextCourse = courses[i];
                break;
            }
        }

        if (!nextCourse) {
            for (let i = 0; i < currentIdx; i++) {
                if (!isSelf(courses[i]) && isIncomplete(courses[i].status)) {
                    nextCourse = courses[i];
                    break;
                }
            }
        }

        if (nextCourse) {
            console.log(`✅ 跳转到: ${nextCourse.title}`);

            // 🔥 智能选择播放器（优先解析列表里保存的真实课件地址）
            const failedCC = safeParseJSON(localStorage.getItem('huayi_failed_cc'), []);
            const player = failedCC.includes(nextCourse.cwid) ? 'polyv' : 'cc';
            const url = resolveCoursewareUrl(nextCourse, player);
            console.log(`→ 使用${player === 'polyv' ? 'Polyv' : 'CC'}播放器跳转: ${url}`);

            // 🛡️ v1.8：深圳站跳转前先显式释放当前播放会话 + 多等 1 秒，
            // 防止旧会话残留（release 请求 502/被导航中断）触发「多课件同时播放」并发误判
            if (SITE.isSzyx) {
                try {
                    if (typeof window.releasePlaySession === 'function') {
                        try { window.releasePlaySession(true); } catch (e) {}
                        console.log('🔒 已主动释放当前播放会话');
                    } else {
                        console.log('🔒 页面无 releasePlaySession，依赖 beforeunload 释放');
                    }
                } catch (e) {}
                setTimeout(() => {
                    location.href = url;
                }, 2000);
            } else {
                setTimeout(() => {
                    location.href = url;
                }, 1000);
            }
        } else {
            // 🔥 v2.2：收尾绝不能刷新当前课件页——刷新=从头重播+重新登记，刚变蓝的考试入口会被打回灰色
            if (SITE.isSzyx) {
                try {
                    const exam = document.getElementById('exam');
                    const examReady = !!(exam &&
                        exam.className.indexOf('notClick') === -1 &&
                        exam.getAttribute('href') &&
                        !/javascript:void\(0\)/i.test(exam.getAttribute('href') || ''));
                    if (examReady) {
                        const examHref = new URL(exam.getAttribute('href'), location.href).href;
                        console.log(`🎓 全部课件已完成，进入考试: ${examHref}`);
                        setPanelStatus('exam');
                        setTimeout(() => { location.href = examHref; }, 2000);
                        return;
                    }
                    const home = localStorage.getItem('huayi_course_home');
                    if (home) {
                        console.log('📋 无下一课时且考试未启用，返回课程列表页（不重播视频）');
                        setTimeout(() => { location.href = home; }, 2000);
                        return;
                    }
                } catch (e) {}
            }
            console.log('❌ 无下一课程,刷新页面');
            setTimeout(() => location.reload(), 2000);
        }
    }

    function blockPopups() {
        // 🌐 v1.6：szyxjxjy.cn 的播放器是 cc_js_Player（无 window.player），跳过该拦截避免空转死循环
        (async function blockSendQuestion() {
            if (SITE.isSzyx) return;
            while (!window.player?.sendQuestion) await new Promise(r => setTimeout(r, 20));
            window.player.sendQuestion = () => {};
        })();

        // 🛡️ v1.8：深圳站「多课件同时播放」并发误判弹窗自动处理
        // 原因：跳转瞬间旧会话 releasePlaySession 请求失败（服务器 502）残留，
        //       新课件注册后服务器判定两个会话并存 → layui 弹窗终止播放。
        // 处理：自动点「关闭」并刷新重连重新登记会话；5 分钟内最多自动刷新 2 次防循环。
        if (SITE.isSzyx) {
            setInterval(() => {
                try {
                    document.querySelectorAll('.layui-layer').forEach(layer => {
                        if (!layer.textContent || layer.textContent.indexOf('同时打开多个课件') === -1) return;
                        const btn = layer.querySelector('.layui-layer-btn0');
                        if (btn) { btn.click(); console.log('🛡️ 检测到并发误判弹窗，已自动关闭'); }
                        const KEY = 'huayi_szyx_concurrent_reload';
                        const now = Date.now();
                        const stamps = safeParseJSON(localStorage.getItem(KEY), []).filter(t => now - t < 5 * 60 * 1000);
                        if (stamps.length < 2) {
                            stamps.push(now);
                            localStorage.setItem(KEY, JSON.stringify(stamps));
                            console.log('🔄 3秒后刷新页面重新登记播放会话…');
                            setTimeout(() => location.reload(), 3000);
                        } else {
                            console.log('⚠️ 5分钟内已自动刷新2次，弹窗留给用户手动处理');
                        }
                    });
                } catch (e) {}
            }, 2000);

            // 🛡️ v1.9：CC 播放器加载失败自愈（CDN 抽风/坏缓存导致 createCCH5Player 未定义时自动限频刷新）
            // 播放页 15 秒后仍无 <video> 且无 cc_js_Player → 自动刷新重试，5 分钟内最多 2 次防循环
            setTimeout(() => {
                setInterval(() => {
                    try {
                        if (document.querySelector('video') || typeof cc_js_Player !== 'undefined') return;
                        const KEY = 'huayi_szyx_player_reload';
                        const now = Date.now();
                        const stamps = safeParseJSON(localStorage.getItem(KEY), []).filter(t => now - t < 5 * 60 * 1000);
                        if (stamps.length >= 2) return;
                        stamps.push(now);
                        localStorage.setItem(KEY, JSON.stringify(stamps));
                        console.log('🔄 播放器15秒未加载，自动刷新页面重试…');
                        location.reload();
                    } catch (e) {}
                }, 15000);
            }, 15000);
        }

        if (typeof isInteraction !== 'undefined') isInteraction = 'off';

        setInterval(() => {
            if (typeof $ === 'undefined') return;
            try {
                if ($('.pv-ask-head').length) $('.pv-ask-skip').click();
                if ($('.signBtn').length) $('.signBtn').click();
                if ($("button[onclick='closeBangZhu()']").length) $("button[onclick='closeBangZhu()']").click();
                if ($("button[class='btn_sign']").length) $("button[class='btn_sign']").click();

                // 🔥 修复：改进CC播放器签到弹窗检测
                const ccSignBtn = $('.ccSignWrapBtn');
                if (ccSignBtn.length > 0) {
                    let foundVisible = false;
                    ccSignBtn.each(function() {
                        if (isElementVisible(this)) {
                            console.log('📝 发现CC播放器签到弹窗');
                            $(this).click();
                            console.log('✅ 已点击CC播放器签到按钮');
                            foundVisible = true;
                            return false; // 只处理第一个可见的
                        }
                    });
                }

                // 🔥 新增：处理各种可能的签到按钮
                const signButtons = [
                    "button:contains('点击签到')",
                    "button:contains('签到')",
                    "a:contains('点击签到')",
                    "a:contains('签到')",
                    ".sign-in-btn",
                    ".qiandao-btn",
                    "#signBtn",
                    "#qiandaoBtn"
                ];

                signButtons.forEach(selector => {
                    try {
                        const elements = $(selector);
                        if (elements.length > 0) {
                            elements.each(function() {
                                if (isElementVisible(this)) {
                                    console.log(`📝 发现签到按钮: ${selector}`);
                                    $(this).click();
                                    console.log('✅ 已点击签到按钮');
                                    return false; // 只处理第一个可见的
                                }
                            });
                        }
                    } catch (e) {
                        // 忽略jQuery选择器错误
                    }
                });

                // 使用原生JavaScript处理签到按钮（备用方案）
                const allButtons = document.querySelectorAll('button, a, div[role="button"], .ccSignWrapBtn');
                allButtons.forEach(btn => {
                    const text = btn.textContent?.trim();
                    if (text && (text.includes('点击签到') || text.includes('签到'))) {
                        if (isElementVisible(btn)) {
                            console.log('📝 发现签到按钮（原生）:', text);
                            btn.click();
                            console.log('✅ 已点击签到按钮（原生）');
                        }
                    }
                });

                const video = $('video').get(0);
                const state = document.querySelector("i[id='top_play']")?.parentNode?.nextElementSibling?.nextElementSibling?.nextElementSibling?.innerText;

                // 🔥 新增：弹题期间不强制恢复播放，交给弹题自动作答模块处理
                let questionVisible = false;
                try {
                    questionVisible = Array.from(document.querySelectorAll('.ccQuestionBox')).some(el => isElementVisible(el));
                } catch (e) {}

                if (video?.paused && !questionVisible && state != '已完成' && state != '待考试') {
                    video.play();
                    video.muted = true;
                }
            } catch (e) {}
        }, 10000);

        // 🔥 修复：改进更频繁的签到弹窗检测
        setInterval(() => {
            try {
                // 🔥 专门处理CC播放器签到弹窗 - 使用更严格的检测
                const ccSignWrap = document.querySelector('.ccSignWrap');
                if (ccSignWrap && isElementVisible(ccSignWrap)) {
                    const ccSignBtn = ccSignWrap.querySelector('.ccSignWrapBtn');
                    if (ccSignBtn && isElementVisible(ccSignBtn)) {
                        console.log('📝 发现CC播放器签到弹窗（原生）');
                        ccSignBtn.click();
                        console.log('✅ 已点击CC播放器签到按钮（原生）');
                    }
                }

                // 检查是否有签到弹窗出现
                const modal = document.querySelector('.modal, .popup, .dialog, .overlay');
                if (modal && isElementVisible(modal)) {
                    const signBtn = modal.querySelector('button, a, div[role="button"], .ccSignWrapBtn');
                    if (signBtn && isElementVisible(signBtn) && (signBtn.textContent?.includes('签到') || signBtn.textContent?.includes('点击'))) {
                        console.log('📝 发现弹窗中的签到按钮');
                        signBtn.click();
                        console.log('✅ 已点击弹窗签到按钮');
                    }
                }

                // 检查常见的签到弹窗ID和类名
                const signModals = [
                    '#signModal',
                    '#qiandaoModal',
                    '.sign-modal',
                    '.qiandao-modal',
                    '.sign-popup',
                    '.qiandao-popup'
                ];

                signModals.forEach(selector => {
                    const element = document.querySelector(selector);
                    if (element && isElementVisible(element)) {
                        const closeBtn = element.querySelector('.close, .modal-close, [onclick*="close"], button[aria-label="关闭"]');
                        if (closeBtn && isElementVisible(closeBtn)) {
                            closeBtn.click();
                            console.log('✅ 已关闭签到弹窗');
                        }
                    }
                });
            } catch (e) {
                console.log('签到弹窗处理错误:', e);
            }
        }, 2000); // 改为每2秒检测一次，提高响应速度
    }

    function simulateUserActivity() {
        const getVideoArea = () => {
            const video = document.querySelector('video');
            if (video) {
                const rect = video.getBoundingClientRect();
                return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
            }
            return {
                x: window.innerWidth * 0.2,
                y: window.innerHeight * 0.2,
                width: window.innerWidth * 0.6,
                height: window.innerHeight * 0.6
            };
        };

        const simulateMove = () => {
            try {
                const area = getVideoArea();
                for (let i = 0; i < 3; i++) {
                    setTimeout(() => {
                        const x = area.x + Math.random() * area.width;
                        const y = area.y + Math.random() * area.height;
                        document.dispatchEvent(new MouseEvent('mousemove', {
                            view: window, bubbles: true, cancelable: true,
                            clientX: x, clientY: y
                        }));
                    }, i * 200);
                }
            } catch (e) {}
        };

        const scheduleActivity = () => {
            const interval = Math.random() * (10 - 5) * 60 * 1000 + 5 * 60 * 1000;
            setTimeout(() => {
                simulateMove();
                scheduleActivity();
            }, interval);
        };

        setTimeout(scheduleActivity, Math.random() * 60000 + 30000);
    }

    function initExamPage() {
        const clickLearn = () => {
            const buttons = document.querySelectorAll('button, a, input[type="button"]');
            for (let btn of buttons) {
                if (btn.textContent?.includes('立即学习')) {
                    btn.click();
                    console.log('📝 点击立即学习');
                    break;
                }
            }
        };

        // 🔥 v1.5：视频播完会跳转到 exam_result.aspx?cwid=xxx 结束页
        // （页面可能显示"本课件已学习完毕"等文字）：标记当前课程完成并自动续播下一课
        const cwid = new URLSearchParams(location.search).get('cwid');

        // 🔥 v1.5 最后兜底：15秒后仍停留在结束页且本地存有课程首页地址 → 返回课程首页重新加载列表
        const courseHome = localStorage.getItem('huayi_course_home');
        setTimeout(() => {
            if (urlTip == 'exam_result.aspx' && courseHome) {
                console.log('⏰ 仍未离开结束页，返回课程首页重新加载课程列表');
                location.href = courseHome;
            }
        }, 15000);

        if (cwid) {
            markCourseCompleted(cwid);
            const courses = safeParseJSON(localStorage.getItem('huayi_course_list'), []);

            if (courses.length > 0) {
                // 只有存在未完成的下一课时才自动续播，否则走"立即学习"兜底
                const currentIdx = courses.findIndex(c => c.cwid === cwid);
                const isIncomplete = (status) => {
                    if (!status) return true;
                    const s = status.toLowerCase();
                    return !s.includes('已完成') && !s.includes('完成');
                };
                const hasNext = courses.some((c, i) => i !== currentIdx && isIncomplete(c.status));

                if (hasNext) {
                    console.log('🎓 课件结束页，稍后自动续播下一课');
                    setPanelStatus('completed');
                    setTimeout(() => proceedToNext(), 2000);

                    // 兜底：10秒后仍停留在本页，尝试点击"立即学习"
                    setTimeout(() => {
                        if (urlTip == 'exam_result.aspx') {
                            console.log('⏰ 仍在结束页，点击"立即学习"兜底');
                            clickLearn();
                            setInterval(clickLearn, 30000);
                        }
                    }, 10000);
                    return;
                }
            }
        }

        // 无cwid或无未完成课程时，退回原逻辑：定时点击"立即学习"
        setPanelStatus('exam');
        setInterval(clickLearn, 30000);
        setTimeout(clickLearn, 2000);
    }

    // 在结束页标记当前课程已完成（同步课程列表缓存，并清除分天计时记录）
    function markCourseCompleted(cwid) {
        try {
            const courses = safeParseJSON(localStorage.getItem('huayi_course_list'), []);
            const course = courses.find(c => c.cwid === cwid);
            if (course && !course.status.includes('已完成')) {
                course.status = '已完成';
                localStorage.setItem('huayi_course_list', JSON.stringify(courses));
                console.log(`✅ 已标记课程完成: ${course.title}`);
            }
            // 课程已完成，清除分天计时记录（日后重修时重新计时）
            clearFirstPlay(cwid);
            // 🔥 v1.5：该课程所有课件都完成时，重置课程级计时起点（重修时重新累计总时长）
            try {
                const cid = getCourseCid() || findCidByCwid(cwid);
                if (cid) {
                    const fp = getFirstPlayMap();
                    let others = 0;
                    for (const k in fp) {
                        if (k !== cwid && findCidByCwid(k) === cid) others++;
                    }
                    if (others === 0) {
                        const sm = safeParseJSON(localStorage.getItem('huayi_course_start'), {}) || {};
                        if (sm[cid]) {
                            delete sm[cid];
                            localStorage.setItem('huayi_course_start', JSON.stringify(sm));
                            console.log('🏁 课程全部课件已完成，课程级计时已重置');
                        }
                    }
                }
            } catch (e) {}
        } catch (e) {}
    }

    // ==================== 🔥 视频中途弹题自动作答 ====================
    // 检测 CC 播放器播放中途出现的答题弹窗（.ccQuestionBox）：
    // 1. 自动模拟真人点击选择答案（判断题优先选"正确"）并点击"提交"
    // 2. 答对点"继续播放"（#rightBtn）；答错点"回看知识点"（#wrongBtn），
    //    弹题几秒后重现，自动换未试过的选项重答
    // 3. 错误答案记录到 localStorage，下次遇到同一题直接避开
    // 4. 所有选项都失败时，强制点击隐藏的"跳过"按钮（#ccJumpOver）兜底并恢复播放

    function setupAutoAnswer() {
        const ATTEMPTS_KEY = 'huayi_question_attempts';
        let handling = false;

        function getAttempts() {
            return safeParseJSON(localStorage.getItem(ATTEMPTS_KEY), {}) || {};
        }

        function markWrong(question, labels) {
            try {
                const map = getAttempts();
                const list = map[question] || [];
                labels.forEach(l => { if (l && !list.includes(l)) list.push(l); });
                map[question] = list;
                localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(map));
                console.log(`📝 已记录错误答案: ${labels.join('、')}`);
            } catch (e) {}
        }

        function getQuestionBox() {
            const boxes = document.querySelectorAll('.ccQuestionBox');
            for (const box of boxes) {
                if (isElementVisible(box)) return box;
            }
            return null;
        }

        function getQuestionInfo(box) {
            const text = (box.querySelector('.ccProblem .text')?.textContent ||
                          box.querySelector('.ccProblem')?.textContent || '').trim();
            const type = (box.querySelector('.ccCheckTips')?.textContent || '').trim();
            const options = Array.from(box.querySelectorAll('.ccQuestionList li')).map(li => ({
                li: li,
                label: (li.querySelector('span')?.textContent || li.textContent || '').trim()
            }));
            return { text: text, type: type, options: options };
        }

        // 模拟真实鼠标点击（mousedown → mouseup → click）
        function clickLikeHuman(el) {
            try {
                const rect = el.getBoundingClientRect();
                const base = {
                    view: window, bubbles: true, cancelable: true,
                    clientX: rect.left + rect.width / 2,
                    clientY: rect.top + rect.height / 2
                };
                el.dispatchEvent(new MouseEvent('mousedown', base));
                el.dispatchEvent(new MouseEvent('mouseup', base));
                el.dispatchEvent(new MouseEvent('click', base));
            } catch (e) {}
        }

        // 🔥 v1.5：CC弹题结果浮层（真实DOM结构）
        // 答错：.ccWrongTips 内 #wrongBtn(回看知识点，可见) / #questionscontinueBtn(继续播放，隐藏)
        //       → 点"回看知识点"回到视频，几秒后弹题重现，用未试过的选项重答
        // 答对：.ccRightTips 内 #questionBackBtn(回看知识点) / #rightBtn(继续播放，可见)
        //       → 点"继续播放"恢复正常播放
        const RESULT_WORDS = ['返回', '继续', '确定', '知道了', '我知道了', '重新作答', '继续答题'];

        function findResultButtons(scope) {
            try {
                return Array.from((scope || document).querySelectorAll(
                    'button, a, .btn, [role="button"], span[onclick], div[onclick], input[type="button"], input[type="submit"]'
                )).filter(el => {
                    if (el.id === 'ccQuestionSubmit') return false; // 排除提交按钮
                    const text = (el.textContent || el.value || '').trim();
                    return text && RESULT_WORDS.some(w => text.includes(w)) && isElementVisible(el);
                });
            } catch (e) {
                return [];
            }
        }

        // 检测结果浮层状态：'right' | 'wrong' | null
        function detectResult(box) {
            try {
                const right = box?.querySelector('.ccRightTips');
                if (right && isElementVisible(right)) return 'right';
                const wrong = box?.querySelector('.ccWrongTips');
                if (wrong && isElementVisible(wrong)) return 'wrong';
            } catch (e) {}
            return null;
        }

        // 点击结果浮层对应的按钮（返回命中的状态，未命中返回 null）
        function clickResultButton(box) {
            const root = box || document;
            const state = detectResult(root);

            if (state === 'right') {
                const btn = root.querySelector('#rightBtn');
                if (btn) {
                    console.log('▶️ 弹题回答正确，点击"继续播放"');
                    clickLikeHuman(btn);
                    return 'right';
                }
            }

            if (state === 'wrong') {
                const backBtn = root.querySelector('#wrongBtn'); // "回看知识点"
                const contBtn = root.querySelector('#questionscontinueBtn'); // 隐藏的"继续播放"
                if (backBtn) {
                    console.log('🔙 弹题答错，点击"回看知识点"（弹题稍后重现，自动换选项重答）');
                    clickLikeHuman(backBtn);
                    return 'wrong';
                }
                if (contBtn) { // 兜底：强制显示隐藏的"继续播放"
                    contBtn.style.display = 'inline-block';
                    contBtn.style.visibility = 'visible';
                    console.log('▶️ 点击隐藏的"继续播放"按钮');
                    clickLikeHuman(contBtn);
                    return 'wrong';
                }
            }

            // 通用兜底：按文案匹配（其它弹题UI）
            const btns = findResultButtons(root);
            if (btns.length) {
                console.log(`🔙 点击结果按钮: ${btns[0].textContent.trim()}`);
                clickLikeHuman(btns[0]);
                return state || 'fallback';
            }
            return null;
        }

        function selectOption(box, idx) {
            const info = getQuestionInfo(box);
            const opt = info.options[idx];
            if (!opt) return;

            // 1. 点击选项行 / 单选图标
            clickLikeHuman(opt.li);
            const icon = opt.li.querySelector('i.radioBg') || opt.li.querySelector('i');
            if (icon) clickLikeHuman(icon);

            // 2. 同步勾选隐藏的 radio/checkbox 输入框
            const inputs = box.querySelectorAll('.ccInputBox input');
            const input = inputs[idx];
            if (input) {
                try {
                    input.checked = true;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    input.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                } catch (e) {}
            }
            console.log(`🖊️ 已选择选项: ${opt.label}`);
        }

        function resumeVideo() {
            try {
                const video = document.querySelector('video');
                if (video && video.paused) {
                    video.play();
                    video.muted = true;
                }
                if (typeof cc_js_Player !== 'undefined' && cc_js_Player.play) {
                    cc_js_Player.play();
                }
            } catch (e) {}
        }

        function isVideoPlaying() {
            const video = document.querySelector('video');
            return !!(video && !video.paused && !video.ended);
        }

        function forceSkip(box) {
            console.log('⏭️ 尝试点击"跳过"按钮兜底');
            const skip = document.getElementById('ccJumpOver') ||
                         (box && box.querySelector('#ccJumpOver'));
            if (skip) {
                skip.style.display = 'inline-block';
                skip.style.visibility = 'visible';
                clickLikeHuman(skip);
                setTimeout(() => {
                    if (getQuestionBox() && box) box.style.display = 'none';
                    handling = false;
                    resumeVideo();
                }, 800);
            } else {
                if (box) box.style.display = 'none';
                handling = false;
                resumeVideo();
            }
        }

        // 判断题默认优先选"正确"类选项
        function answerScore(label) {
            if (/正确|^是|^对/.test(label) && !/不正|错误|不对/.test(label)) return 2;
            if (/错误|不对|否/.test(label)) return 0;
            return 1;
        }

        // 结果按钮点击节流（防止1秒轮询重复点击"回看知识点/继续播放"）
        let lastResultClick = 0;

        // 🔥 v1.5：处理CC播放器自带投票弹窗（.ccVoteContainer，越过投票时间点未作答会被强制暂停视频）
        let voteHandling = false;
        function getVoteBox() {
            const el = document.querySelector('.ccVoteContainer, .ccVoteBox');
            return (el && isElementVisible(el)) ? el : null;
        }

        function handleVote() {
            const box = getVoteBox();
            if (!box || voteHandling) return false;
            voteHandling = true;
            console.log('📊 检测到CC投票弹窗，自动处理');
            try {
                const lis = box.querySelectorAll('.ccVoteList li');
                const inputs = box.querySelectorAll('.ccVoteInputBox input');
                // 选第一个选项（li点击 + input选中双保险）
                if (lis.length) {
                    try { lis[0].click(); } catch (e) {}
                }
                if (inputs.length) {
                    try {
                        inputs[0].checked = true;
                        inputs[0].dispatchEvent(new Event('change', { bubbles: true }));
                        inputs[0].dispatchEvent(new Event('click', { bubbles: true }));
                    } catch (e) {}
                }
                // 300ms后提交：优先"提交"按钮，不可见则点"跳过"
                setTimeout(() => {
                    try {
                        const submit = document.getElementById('ccVoteSubmit');
                        const jump = document.getElementById('ccVoteJumpOver');
                        if (submit && isElementVisible(submit)) {
                            submit.click();
                            console.log('📤 投票已提交');
                        } else if (jump && isElementVisible(jump)) {
                            jump.click();
                            console.log('⏭️ 投票已跳过');
                        }
                    } catch (e) {}
                    setTimeout(() => {
                        voteHandling = false;
                        resumeVideo(); // 投票结束后若未自动恢复播放则强制恢复
                    }, 800);
                }, 300);
            } catch (e) {
                voteHandling = false;
            }
            return true;
        }

        // 🔥 v1.5：结果浮层统一处理。答对→点"继续播放"（播放器在此登记作答）；
        // 答错→记错题→点"回看知识点"。返回 true=浮层存在且已处理。
        // 改选答案前必须先经过这里，绝不能在已答对的题上改选其它选项。
        function handleVisibleResult(rBox, markPlan, markInfo, markIsMulti) {
            if (!rBox) return false;
            const result = detectResult(rBox);
            if (result !== 'right' && result !== 'wrong') return false;

            // 点击节流：2.5秒内不重复点击结果按钮，等上一次点击生效
            if (Date.now() - lastResultClick < 2500) return true;

            if (result === 'wrong') {
                console.log('❌ 弹题答错');
                try {
                    if (markPlan && markInfo && markIsMulti) {
                        markWrong(markInfo.text, markPlan.map(i => markInfo.options[i].label));
                    } else if (markPlan && markInfo && markPlan.length === 1) {
                        markWrong(markInfo.text, [markInfo.options[markPlan[0]].label]);
                    }
                } catch (e) {}
            } else {
                console.log('🎉 弹题回答正确');
            }
            lastResultClick = Date.now();
            clickResultButton(rBox);

            if (result === 'right') {
                // 1.5秒后确认："继续播放"无效（浮层仍在）→ 走"跳过"通道兜底登记
                setTimeout(() => {
                    const b = getQuestionBox();
                    if (b && detectResult(b) === 'right') {
                        console.log('⚠️ "继续播放"未生效，走"跳过"通道兜底');
                        forceSkip(b);
                        return;
                    }
                    handling = false;
                    resumeVideo();
                }, 1500);
            } else {
                // 答错：交回轮询，弹题重现后用未试过的选项重答
                handling = false;
                resumeVideo();
            }
            return true;
        }

        function handleQuestion() {
            if (handling) return;
            // 🔥 投票弹窗优先处理（独立于QA弹题的机制）
            if (handleVote()) return;
            const box = getQuestionBox();
            if (!box) return;

            // 🔥 v1.5：处于上次作答的结果浮层 → 先点对应按钮恢复（3秒节流防重复点击）
            const pending = detectResult(box);
            if (pending && Date.now() - lastResultClick > 3000) {
                lastResultClick = Date.now();
                clickResultButton(box);
                resumeVideo();
                return;
            } else if (pending) {
                return; // 节流窗口内，等待浮层消失/弹题重现
            }

            const info = getQuestionInfo(box);
            if (!info.options.length) return;
            handling = true;
            console.log(`❓ 检测到中途弹题 [${info.type || '单选'}]: ${info.text}`);

            const isMulti = info.type.indexOf('多选') !== -1;
            const wrongList = getAttempts()[info.text] || [];

            // 生成作答计划：每项是一个"本轮选择的选项下标数组"
            let plans;
            if (isMulti) {
                // 多选：全选提交一次；若之前已试错过（wrongList非空）则不再重试，交给跳过兜底
                plans = wrongList.length ? [null] : [info.options.map((o, i) => i)];
            } else {
                let idxs = info.options
                    .map((o, i) => i)
                    .filter(i => wrongList.indexOf(info.options[i].label) === -1);
                idxs.sort((a, b) => answerScore(info.options[b].label) - answerScore(info.options[a].label));
                plans = idxs.map(i => [i]);
            }
            if (!plans.length) plans = [null]; // 全部选项都失败过 → 直接跳过

            tryNext(0);

            function tryNext(round) {
                const plan = plans[round];
                if (plan === null || plan === undefined) {
                    forceSkip(getQuestionBox() || box);
                    return;
                }

                let curBox = getQuestionBox();

                // 🔥 v1.5：弹窗已被"返回/继续"关闭 → 交回轮询，若再次弹出会用新的错题记录重答
                if (!curBox) {
                    handling = false;
                    resumeVideo();
                    return;
                }

                // 🔥 v1.5：上一轮答案的判题浮层可能刚出现（判题有延迟）——
                // 先处理结果，绝不能在已答对的题上改选其它选项
                const preResult = detectResult(curBox);
                if (preResult === 'right' || preResult === 'wrong') {
                    handleVisibleResult(curBox, round > 0 ? plans[round - 1] : null, info, isMulti);
                    return;
                }

                // 🔥 v1.5：处于结果浮层且无选项（其它弹题UI）→ 先点对应按钮恢复题目
                if (!getQuestionInfo(curBox).options.length) {
                    if (clickResultButton(curBox)) {
                        lastResultClick = Date.now();
                        setTimeout(() => tryNext(round), 600);
                    } else {
                        forceSkip(curBox);
                    }
                    return;
                }

                plan.forEach(i => selectOption(curBox, i));

                setTimeout(() => {
                    const submitBtn = document.getElementById('ccQuestionSubmit') ||
                                      curBox.querySelector('#ccQuestionSubmit');
                    if (submitBtn && isElementVisible(submitBtn)) {
                        clickLikeHuman(submitBtn);
                        console.log('📤 已提交答案，等待判题...');
                    } else {
                        forceSkip(getQuestionBox() || curBox);
                        return;
                    }

                    // 🔥 判题可能慢于提交（服务端判题）：轮询结果浮层最长约7秒，
                    //    轮询期间绝不改选答案，避免把已答对的题改成错误答案
                    let polls = 0;
                    const pollJudge = () => {
                        polls++;
                        const rBox = getQuestionBox();
                        const r = rBox ? detectResult(rBox) : null;

                        if ((r === 'right' || r === 'wrong') &&
                            handleVisibleResult(rBox, plan, info, isMulti)) return;

                        if (!rBox) {
                            // ⚠️ 弹窗消失但没有结果浮层：答题登记未通过按钮确认，
                            //    用播放器自带"跳过"通道兜底（其处理器会正确登记该题，
                            //    否则越过题目时间点会被反复拉回强制暂停）
                            console.log('⚠️ 弹窗已消失但答题登记未确认，走"跳过"通道兜底');
                            forceSkip(null);
                            return;
                        }
                        if (polls < 7) {
                            setTimeout(pollJudge, 800);
                            return;
                        }
                        // 弹窗在但始终无浮层 → 提交未生效 → 换下一个计划重试
                        tryNext(round + 1);
                    };
                    setTimeout(pollJudge, 2000);
                }, 500);
            }
        }

        // 定时轮询检测（1秒一次）
        setInterval(handleQuestion, 1000);

        // DOM 变化即时检测（节流 500ms，加快响应）
        let lastMut = 0;
        const startObserve = () => {
            if (document.body) {
                new MutationObserver(() => {
                    const now = Date.now();
                    if (now - lastMut > 500) {
                        lastMut = now;
                        setTimeout(handleQuestion, 60);
                    }
                }).observe(document.body, { childList: true, subtree: true });
            } else {
                setTimeout(startObserve, 200);
            }
        };
        startObserve();

        console.log('✅ 中途弹题自动作答模块已启动');
    }

// ==================== UI ====================

    function createPanel() {
        if (window.self !== window.top) return;

        const panel = document.createElement('div');
        panel.id = 'huayi-panel';
        panel.style.cssText = `
            position: fixed; top: 20px; right: 20px; width: 40px; height: 40px;
            background: #4CAF50; border-radius: 50%; box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            z-index: 99999; cursor: pointer; user-select: none; -webkit-user-select: none;
            display: flex; align-items: center; justify-content: center;
            font-size: 20px; color: white; overflow: hidden;
        `;

        document.body.appendChild(panel);

        // 🔥 v1.5：悬浮球支持拖动（拖动阈值5px，未拖动视为点击展开/收起；位置自动记忆）
        const BALL_POS_KEY = 'huayi_ball_pos';
        try {
            const saved = JSON.parse(localStorage.getItem(BALL_POS_KEY) || 'null');
            if (saved && typeof saved.left === 'number' && typeof saved.top === 'number') {
                panel.style.left = saved.left + 'px';
                panel.style.top = saved.top + 'px';
                panel.style.right = 'auto';
            }
        } catch (e) {}

        const drag = { active: false, moved: false, sx: 0, sy: 0, ox: 0, oy: 0 };
        panel.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            // 🔥 展开状态下不拖拽按钮/输入框（滑块拖动误触发面板移动、按钮点击误触发拖拽）
            if (isExpanded && e.target instanceof Element && e.target.closest('button, input, textarea')) return;
            drag.active = true;
            drag.moved = false;
            drag.sx = e.clientX;
            drag.sy = e.clientY;
            const r = panel.getBoundingClientRect();
            drag.ox = r.left;
            drag.oy = r.top;
            e.preventDefault();
        });
        document.addEventListener('mousemove', (e) => {
            if (!drag.active) return;
            const dx = e.clientX - drag.sx;
            const dy = e.clientY - drag.sy;
            if (!drag.moved && Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
            drag.moved = true;
            const left = Math.min(Math.max(0, drag.ox + dx), window.innerWidth - panel.offsetWidth);
            const top = Math.min(Math.max(0, drag.oy + dy), window.innerHeight - panel.offsetHeight);
            panel.style.left = left + 'px';
            panel.style.top = top + 'px';
            panel.style.right = 'auto';
        });
        document.addEventListener('mouseup', (e) => {
            if (!drag.active) return;
            drag.active = false;
            if (drag.moved) {
                try {
                    localStorage.setItem(BALL_POS_KEY, JSON.stringify({
                        left: parseInt(panel.style.left, 10) || 0,
                        top: parseInt(panel.style.top, 10) || 0
                    }));
                } catch (e) {}
            } else if (!isExpanded) {
                // 🔥 关键修复：只有收起状态（悬浮球）的点击才展开面板。
                // 之前展开状态下点击面板内任何位置（包括按钮）都会收起面板，
                // 按钮在click事件派发前被移除导致点击丢失——这就是"清除"按钮失灵的根因
                togglePanel();
            }
        });

        document.onclick = (e) => {
            const panel = document.getElementById('huayi-panel');
            if (isExpanded && panel && !panel.contains(e.target)) {
                collapsePanel();
            }
        };

        // 🔥 v1.5：面板按钮统一事件委托（只在创建时绑定一次，innerHTML重建不影响，
        // 修复"清除默认时间"等按钮点击无效的问题）
        panel.addEventListener('click', (e) => {
            const btn = e.target instanceof Element ? e.target.closest('button') : null;
            if (!btn) return;

            if (btn.id === 'nextBtn') {
                e.stopPropagation();
                proceedToNext();
            } else if (btn.id === 'clearFailedBtn') {
                e.stopPropagation();
                localStorage.removeItem('huayi_failed_cc');
                console.log('✅ 已清除CC失败记录');
                expandPanel(); // 刷新面板
            } else if (btn.id === 'setDefaultFirstPlayBtn') {
                e.stopPropagation();
                const input = document.getElementById('defaultFirstPlayInput');
                const val = input?.value;
                if (!val) { alert('请先选择日期和时间'); return; }
                const ms = new Date(val).getTime();
                if (isNaN(ms)) { alert('时间格式无效'); return; }
                if (ms > Date.now()) { alert('首次观看时间不能晚于当前时间'); return; }
                // 🔥 记录设置时间戳：默认时间只在设置后24小时内有效，防止忘记清除误伤新课程
                localStorage.setItem('huayi_default_first_play', JSON.stringify({ t: ms, set: Date.now() }));
                // 🔥 清除已有的精确首播记录，否则旧记录优先级更高，默认时间不生效
                localStorage.removeItem('huayi_first_play');
                console.log(`🕒 已设置默认首次观看时间: ${new Date(ms).toLocaleString()}（24小时内有效；已清除所有课程的精确首播记录）`);
                updateFinishStateLine();
                btn.textContent = '已设置';
                setTimeout(() => { btn.textContent = '设置'; }, 1500);
            } else if (btn.id === 'clearDefaultFirstPlayBtn') {
                e.stopPropagation();
                localStorage.removeItem('huayi_default_first_play');
                const input = document.getElementById('defaultFirstPlayInput');
                if (input) input.value = '';
                console.log('🗑️ 已清除默认首次观看时间（新课程将重新按首播计时）');
                updateFinishStateLine();
            } else if (btn.id === 'saveHumanizeBtn') {
                // 🌙 v2.0：保存拟人模式配置
                e.stopPropagation();
                const enabled = document.getElementById('humanizeEnabled').checked;
                const start = parseInt(document.getElementById('humanizeStart').value, 10);
                const end = parseInt(document.getElementById('humanizeEnd').value, 10);
                const cap = parseFloat(document.getElementById('humanizeCap').value);
                if (isNaN(start) || isNaN(end) || start < 0 || start > 23 || end < 1 || end > 24 || start === end) {
                    alert('时段无效：开始 0-23、结束 1-24，且两者不能相同');
                    return;
                }
                if (isNaN(cap) || cap < 4 || cap > 16) {
                    alert('每日上限请填 4-16 小时');
                    return;
                }
                localStorage.setItem(HUMANIZE_KEY, JSON.stringify({ enabled: enabled, start: start, end: end, capHours: cap }));
                console.log(`🌙 拟人模式已保存：${enabled ? '开启' : '关闭'}，每日 ${start}:00-${end}:00，单日上限 ${cap} 小时`);
                updateFinishStateLine();
                expandPanel();
            } else if (btn.id === 'jump95Btn') {
                // 🧪 v2.0：实验——本课跳到95%并标记（首日快速标记，替代8x播放数分钟）
                e.stopPropagation();
                jumpTo95AndMark();
            } else if (btn.id === 'editLocalBtn') {
                // 🧪 v2.0：实验——展开/收起本地数据编辑器
                e.stopPropagation();
                const area = document.getElementById('localDataArea');
                const ops = document.getElementById('localDataOps');
                const show = area.style.display === 'none';
                area.style.display = show ? 'block' : 'none';
                ops.style.display = show ? 'flex' : 'none';
                if (show) dumpLocalData();
            } else if (btn.id === 'loadLocalBtn') {
                e.stopPropagation();
                dumpLocalData();
            } else if (btn.id === 'applyLocalBtn') {
                e.stopPropagation();
                applyLocalData();
            }
        });

        // 🔥 v1.5：倍速滑块也走事件委托（input事件会冒泡）
        panel.addEventListener('input', (e) => {
            if (e.target && e.target.id === 'speedSlider') {
                const speed = parseFloat(e.target.value);
                const sv = document.getElementById('speedValue');
                if (sv) sv.textContent = speed.toFixed(2) + 'x';
                setPlaybackSpeed(speed);
            }
        });
    }

    function togglePanel() {
        isExpanded ? collapsePanel() : expandPanel();
    }

    // 🔥 v1.5：datetime-local 输入框格式化
    function formatDateTimeLocal(ms) {
        const d = new Date(ms);
        const pad = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    // 🔥 v1.5：计算分天策略状态文案（浮窗显示用）
    function computeFinishStateText() {
        try {
            const v = document.querySelector('video');
            const cwid = new URLSearchParams(location.search).get('cwid');
            const hasExact = !!(cwid && getFirstPlayMap()[cwid]);
            const first = getFirstPlayTime(cwid);
            if (SITE.isPlayPage() && v && v.duration && !isNaN(v.duration)) {
                const tag = hasExact ? '' : '(默认首播)';
                const clock = getCourseClock(getCourseCid());
                const courseOk = !clock || Date.now() - clock.start >= clock.totalSec * 1000 * TIME_MARGIN;
                if (!first) {
                    return '🕒 首次播放：95%保护跳转（计时起点已记录）';
                } else if (Date.now() - first >= v.duration * 1000 * TIME_MARGIN && courseOk) {
                    return `✅ 时间已达标${tag}：将直接跳到99%匀速跑完`;
                } else if (!courseOk) {
                    const waitMin = Math.ceil((clock.totalSec * 1000 * TIME_MARGIN - (Date.now() - clock.start)) / 60000);
                    const h = Math.floor(waitMin / 60), m = waitMin % 60;
                    return `⏳ 课程总时长考核未达标${tag}：全课累计${Math.round(clock.totalSec / 60)}分钟(含10%冗余)，还需约${h ? h + '小时' : ''}${m}分钟（95%保护）`;
                } else {
                    const waitMin = Math.ceil((v.duration * 1000 * TIME_MARGIN - (Date.now() - first)) / 60000);
                    return `⏳ 时间未达标${tag}：还需等待约${waitMin}分钟（95%保护）`;
                }
            }
        } catch (e) {}
        return '';
    }

    // 更新浮窗"分天策略/执行建议"状态行
    function updateFinishStateLine() {
        const el = document.getElementById('huayiFinishState');
        const text = computeFinishStateText();
        if (el && text) el.innerHTML = `分天策略: ${text}`;
        const sug = document.getElementById('huayiSuggestState');
        if (sug) {
            const stext = computeSuggestStateText();
            sug.innerHTML = stext ? `执行建议: ${stext}` : '';
            sug.style.display = stext ? '' : 'none';
        }
    }

    function expandPanel() {
        const panel = document.getElementById('huayi-panel');
        if (!panel) return;

        isExpanded = true;
        panel.onclick = (e) => {
            e.stopPropagation();
        };
        panel.style.cssText = `
            position: fixed; top: 20px; right: 20px; width: 260px; height: auto;
            background: #4CAF50; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 99999; cursor: pointer;
            display: flex; flex-direction: column; align-items: flex-start;
            padding: 12px; font-size: 12px; color: white;
        `;

        // 🔥 修复：使用安全的JSON解析
        const courses = safeParseJSON(localStorage.getItem('huayi_course_list'), []);
        const currentCwid = new URLSearchParams(location.search).get('cwid');
        const current = courses.find(c => c.cwid === currentCwid);
        const status = panel.getAttribute('data-status') || 'init';
        const statusMap = {
            init: '初始化', playing: '播放中', completed: '已完成',
            face: '刷脸中', list: '课程列表', exam: '考试处理', error: '未适配'
        };

        const isPolyv = urlTip.includes('polyv');
        const playerType = isPolyv ? 'Polyv (无倍速)' : 'CC (支持倍速)';
        const failedCC = safeParseJSON(localStorage.getItem('huayi_failed_cc'), []);

        const isNormalSpeed = currentSpeed === 1.0;
        // 🔥 修改：根据倍速动态显示跳转时间，调整为240秒
        const jumpTime = isNormalSpeed ? 240 : Math.round(240 / currentSpeed);
        const speedModeText = isNormalSpeed ? '正常速度 (播放完等待5秒)' : `倍速 ${currentSpeed}x (剩余${jumpTime}秒跳转)`;

        // 🔥 v1.5：分天策略状态（时间差是否已达标，支持默认首播时间）
        const finishStateText = computeFinishStateText();
        // 🔥 v1.5：默认首次观看时间（老用户补录；含24小时有效期）
        const savedDefault = getDefaultFirstPlay();
        const defaultFirstPlayValue = savedDefault ? formatDateTimeLocal(savedDefault) : '';
        // 🔥 v2.0：执行建议（建议重开时间）+ 拟人模式状态
        const suggestText = computeSuggestStateText();
        const humanizeCfg = getHumanizeCfg();
        const todayWatched = (getTodayWatchSec() / 3600).toFixed(1);

        panel.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 8px;">🛡️ 华医网视频播放脚本 Pro${SITE.isSzyx ? ' ·深圳卫健' : ''}</div>
            <div style="margin-bottom: 4px;">状态: ${statusMap[status]}</div>
            <div style="margin-bottom: 4px; font-size: 10px; opacity: 0.9;">播放模式: ${speedModeText}</div>
            ${finishStateText ? `<div id="huayiFinishState" style="margin-bottom: 4px; font-size: 10px; opacity: 0.9;">分天策略: ${finishStateText}</div>` : ''}
            ${suggestText ? `<div id="huayiSuggestState" style="margin-bottom: 4px; font-size: 10px; opacity: 0.9;">执行建议: ${suggestText}</div>` : `<div id="huayiSuggestState" style="display: none;"></div>`}
            <div style="margin-bottom: 4px; font-size: 10px; opacity: 0.9;">播放器: ${playerType}</div>
            ${current ? `<div style="font-size: 10px; opacity: 0.8;">当前: ${current.title.substring(0,16)}...</div>` : ''}
            <div style="font-size: 10px; opacity: 0.8; margin-top: 4px;">课程数: ${courses.length} | CC失败: ${failedCC.length}</div>

            <div style="width: 100%; margin-top: 10px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.3);">
                <div style="font-weight: bold; margin-bottom: 6px;">⚡ 防检测倍速 ${isPolyv ? '(不可用)' : ''}</div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <input type="range" id="speedSlider" min="0.5" max="8" step="0.25" value="${currentSpeed}"
                           style="flex: 1; ${isPolyv ? 'disabled' : ''}" />
                    <span id="speedValue" style="min-width: 45px; text-align: center;">${currentSpeed.toFixed(2)}x</span>
                </div>
                ${isPolyv ? '<div style="font-size: 9px; opacity: 0.7; margin-top: 4px;">⚠️ 当前课程不支持倍速</div>' : ''}
                ${isNormalSpeed && !isPolyv ? '<div style="font-size: 9px; opacity: 0.7; margin-top: 4px;">📺 正常模式：播放完等待5秒跳转</div>' : ''}
                ${!isNormalSpeed && !isPolyv ? `<div style="font-size: 9px; opacity: 0.7; margin-top: 4px;">🚀 倍速模式：剩余${jumpTime}秒自动跳转</div>` : ''}
            </div>

            <button id="nextBtn" style="width: 100%; padding: 6px; margin-top: 10px; background: rgba(255,255,255,0.2);
                border: 1px solid rgba(255,255,255,0.5); color: white; border-radius: 4px; cursor: pointer; font-size: 11px;">
                🚀 手动跳转下一课
            </button>

            <button id="clearFailedBtn" style="width: 100%; padding: 4px; margin-top: 6px; background: rgba(255,255,255,0.15);
                border: 1px solid rgba(255,255,255,0.3); color: white; border-radius: 4px; cursor: pointer; font-size: 10px;">
                🔄 清除CC失败记录
            </button>

            <div style="width: 100%; margin-top: 10px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.3);">
                <div style="font-weight: bold; margin-bottom: 6px;">🕒 默认首次观看时间（老用户补录）</div>
                <input id="defaultFirstPlayInput" type="datetime-local" value="${defaultFirstPlayValue}"
                    style="width: 100%; padding: 3px 4px; border-radius: 4px; border: none; font-size: 10px; color: #333; box-sizing: border-box;">
                <div style="display: flex; gap: 6px; margin-top: 4px;">
                    <button id="setDefaultFirstPlayBtn" style="flex: 1; padding: 4px; background: rgba(255,255,255,0.25);
                        border: 1px solid rgba(255,255,255,0.5); color: white; border-radius: 4px; cursor: pointer; font-size: 10px;">
                        设置
                    </button>
                    <button id="clearDefaultFirstPlayBtn" style="flex: 1; padding: 4px; background: rgba(255,255,255,0.15);
                        border: 1px solid rgba(255,255,255,0.3); color: white; border-radius: 4px; cursor: pointer; font-size: 10px;">
                        清除
                    </button>
                </div>
                <div style="font-size: 9px; opacity: 0.7; margin-top: 4px;">之前手动看过的课，填当时开始看的时间，二刷逻辑立即生效；设置后24小时内有效，到期自动失效</div>
            </div>

            <div style="width: 100%; margin-top: 10px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.3);">
                <div style="font-weight: bold; margin-bottom: 6px;">🌙 拟人模式（模拟真人习惯）</div>
                <div style="display: flex; align-items: center; gap: 4px; flex-wrap: wrap;">
                    <label style="display: flex; align-items: center; gap: 2px; cursor: pointer;">
                        <input type="checkbox" id="humanizeEnabled" ${humanizeCfg.enabled ? 'checked' : ''}>启用
                    </label>
                    <span style="opacity: 0.9;">每日</span>
                    <input id="humanizeStart" type="number" min="0" max="23" value="${humanizeCfg.start}"
                        style="width: 36px; padding: 2px; border: none; border-radius: 4px; font-size: 10px; color: #333;">
                    <span style="opacity: 0.9;">:00 –</span>
                    <input id="humanizeEnd" type="number" min="1" max="24" value="${humanizeCfg.end}"
                        style="width: 36px; padding: 2px; border: none; border-radius: 4px; font-size: 10px; color: #333;">
                    <span style="opacity: 0.9;">:00</span>
                </div>
                <div style="display: flex; align-items: center; gap: 4px; margin-top: 4px;">
                    <span style="opacity: 0.9;">上限</span>
                    <input id="humanizeCap" type="number" min="4" max="16" step="0.5" value="${humanizeCfg.capHours}"
                        style="width: 40px; padding: 2px; border: none; border-radius: 4px; font-size: 10px; color: #333;">
                    <span style="opacity: 0.9;">小时/日（今日已看 ${todayWatched}h）</span>
                </div>
                <button id="saveHumanizeBtn" style="width: 100%; padding: 4px; margin-top: 5px; background: rgba(255,255,255,0.25);
                    border: 1px solid rgba(255,255,255,0.5); color: white; border-radius: 4px; cursor: pointer; font-size: 10px;">
                    保存拟人设置
                </button>
                <div style="font-size: 9px; opacity: 0.7; margin-top: 4px;">超出时段/额度自动暂停并暂缓续播，窗口恢复自动接续；夜间时间差照常累计，不影响达标判定</div>
            </div>

            <div style="width: 100%; margin-top: 10px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.3);">
                <div style="font-weight: bold; margin-bottom: 6px;">🧪 实验功能</div>
                <button id="jump95Btn" style="width: 100%; padding: 5px; background: rgba(255,255,255,0.2);
                    border: 1px solid rgba(255,255,255,0.5); color: white; border-radius: 4px; cursor: pointer; font-size: 10px;">
                    ⚡ 本课跳到95%并标记
                </button>
                <button id="editLocalBtn" style="width: 100%; padding: 4px; margin-top: 6px; background: rgba(255,255,255,0.15);
                    border: 1px solid rgba(255,255,255,0.3); color: white; border-radius: 4px; cursor: pointer; font-size: 10px;">
                    ✏️ 编辑本地数据（huayi_*）
                </button>
                <textarea id="localDataArea" spellcheck="false"
                    style="display: none; width: 100%; height: 90px; margin-top: 4px; padding: 3px; border: none; border-radius: 4px; font-size: 9px; color: #333; box-sizing: border-box; font-family: monospace;"></textarea>
                <div id="localDataOps" style="display: none; gap: 6px; margin-top: 4px;">
                    <button id="loadLocalBtn" style="flex: 1; padding: 4px; background: rgba(255,255,255,0.15);
                        border: 1px solid rgba(255,255,255,0.3); color: white; border-radius: 4px; cursor: pointer; font-size: 10px;">
                        重新载入
                    </button>
                    <button id="applyLocalBtn" style="flex: 1; padding: 4px; background: rgba(255,255,255,0.25);
                        border: 1px solid rgba(255,255,255,0.5); color: white; border-radius: 4px; cursor: pointer; font-size: 10px;">
                        应用修改
                    </button>
                </div>
                <div style="font-size: 9px; opacity: 0.7; margin-top: 4px;">跳到95%用 jumpToTime 绕过反快进看门狗并自动记入课件时长；本地数据导出为 JSON，可跨浏览器迁移观看记录，改完点"应用修改"立即生效</div>
            </div>

            <div style="font-size: 9px; opacity: 0.7; margin-top: 8px; padding-top: 4px; border-top: 1px solid rgba(255,255,255,0.2);">
                ✅ 智能切换播放器 ✅ 自动回退 ✅ 防检测倍速<br>✅ 智能跳转逻辑 ✅ 自动处理CC签到 ✅ 弹题自动作答<br>✅ 分天时间达标100%完成 ✅ 结束页自动续播
            </div>
        `;

        // 🔥 v1.5：按钮/滑块事件已改为createPanel里的事件委托（绑定一次），
        // 这里不再重复绑定，innerHTML重建不影响任何按钮功能
    }

    function collapsePanel() {
        const panel = document.getElementById('huayi-panel');
        if (!panel) return;

        isExpanded = false;
        panel.style.cssText = `
            position: fixed; top: 20px; right: 20px; width: 40px; height: 40px;
            background: #4CAF50; border-radius: 50%; box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            z-index: 99999; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            font-size: 20px; color: white;
        `;

        const config = {
            init: { color: '#9E9E9E', icon: '⚪' },
            playing: { color: '#4CAF50', icon: '▶️' },
            completed: { color: '#2196F3', icon: '✅' },
            face: { color: '#FF9800', icon: '👤' },
            list: { color: '#9C27B0', icon: '📋' },
            exam: { color: '#FF5722', icon: '📝' },
            error: { color: '#F44336', icon: '❌' }
        };

        const status = panel.getAttribute('data-status') || 'init';
        const { color, icon } = config[status];

        panel.style.background = color;
        panel.textContent = icon;

        // 🔥 修复：重新绑定点击事件，确保可以再次展开
        panel.onclick = (e) => {
            e.stopPropagation();
            togglePanel();
        };
    }

    function setPanelStatus(status) {
        const panel = document.getElementById('huayi-panel');
        if (!panel) return;

        panel.setAttribute('data-status', status);

        if (!isExpanded) {
            const config = {
                init: { color: '#9E9E9E', icon: '⚪' },
                playing: { color: '#4CAF50', icon: '▶️' },
                completed: { color: '#2196F3', icon: '✅' },
                face: { color: '#FF9800', icon: '👤' },
                list: { color: '#9C27B0', icon: '📋' },
                exam: { color: '#FF5722', icon: '📝' },
                error: { color: '#F44336', icon: '❌' }
            };

            const { color, icon } = config[status];
            panel.style.background = color;
            panel.textContent = icon;
        }
    }

})();