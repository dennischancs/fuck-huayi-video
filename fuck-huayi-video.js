// ==UserScript==
// @name         华医网视频播放脚本 Pro
// @namespace    dennischancs
// @version      1.5
// @description  该油猴脚本用于华医网的视频继续播放，✅智能切换CC播放器（支持倍速）✅自动播放下一视频✅屏蔽弹窗✅静音播放✅用户行为模拟✅圆球浮窗✅防检测倍速播放（仅限CC播放器，最快8.0x）✅智能跳转逻辑✅自动处理签到弹窗✅自动作答播放中途弹题（答错自动点"返回/继续"并换选项）✅分天时间达标后自动100%完成课件✅课件结束页自动续播下一课
// @author       [dennischancs](https://github.com/dennischancs)
// @match        *://*.91huayi.com/*
// @match        *://*.bokecc.com/*
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
    let _courseCidCache;
    function getCourseCid() {
        if (_courseCidCache !== undefined) return _courseCidCache;
        _courseCidCache = null;
        try {
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

    // 记录课件页所在目录，供结束页(exam_result.aspx)续播下一课时拼接URL
    function saveCourseBase() {
        try {
            const base = location.origin + location.pathname.substring(0, location.pathname.lastIndexOf('/') + 1);
            localStorage.setItem('huayi_course_base', base);
        } catch (e) {}
    }

    // 等待DOM加载后再初始化UI
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    function init() {
        // 🔥 新增：中途弹题自动作答（所有页面/iframe 都启用）
        setupAutoAnswer();

        createPanel();

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

        window.onload = () => {
            clock = setInterval(checkVideoStatus, 3000);
        };

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
                        // 🔥 时间差已达标：直接跳到99%匀速跑完，播放到头再跳转
                        handleCompletionPass(video);
                        if (video.ended || remaining <= 1 || progress >= 0.999) {
                            console.log(`🏁 时间已达标，视频播放至${(progress * 100).toFixed(1)}%，完成本课`);
                            clearInterval(timeCheckInterval);
                            setTimeout(proceedToNext, 2000);
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

            // 🔥 关键：有弹题/投票/结果浮层时不拉进度条，等自动处理模块完成再拉。
            // 拉进度条越过题目/投票时间点会触发弹窗并回退/暂停进度，
            // 不等待的话会与弹窗反复拉扯（进度条闪烁、永远到不了100%）
            if (hasActiveQuestion()) return true;

            const target = video.duration * 0.99;

            // 🔥 停滞恢复：位置10秒几乎没动（弹窗漏检/异常暂停）→ 强制恢复播放
            const now = Date.now();
            if (Math.abs(video.currentTime - stallPos) > 1) {
                stallPos = video.currentTime;
                stallAt = now;
            } else if (now - stallAt > 10000) {
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
                localStorage.setItem('huayi_course_home', location.origin + location.pathname + '?cid=' + cid);
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

    function checkVideoStatus() {
        try {
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
                    console.log('📺 正常速度播放完成，等待5秒后跳转...');
                    setPanelStatus('completed');
                    clearInterval(clock);

                    // 等待5秒后跳转
                    setTimeout(() => {
                        console.log('⏰ 5秒等待结束，跳转到下一视频');
                        proceedToNext();
                    }, 5000);
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

        const base = localStorage.getItem('huayi_course_base') || (location.origin + '/course_ware/');
        return `${base}${fileName}?cwid=${entry ? entry.cwid : ''}`;
    }

    function proceedToNext() {
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

        let nextCourse = null;

        for (let i = currentIdx + 1; i < courses.length; i++) {
            if (isIncomplete(courses[i].status)) {
                nextCourse = courses[i];
                break;
            }
        }

        if (!nextCourse) {
            for (let i = 0; i < currentIdx; i++) {
                if (isIncomplete(courses[i].status)) {
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

            setTimeout(() => {
                location.href = url;
            }, 1000);
        } else {
            console.log('❌ 无下一课程,刷新页面');
            setTimeout(() => location.reload(), 2000);
        }
    }

    function blockPopups() {
        (async function blockSendQuestion() {
            while (!window.player?.sendQuestion) await new Promise(r => setTimeout(r, 20));
            window.player.sendQuestion = () => {};
        })();

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
            if (isExpanded && e.target instanceof Element && e.target.closest('button, input')) return;
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
            if (urlTip.includes('course_ware') && v && v.duration && !isNaN(v.duration)) {
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

    // 更新浮窗"分天策略"状态行
    function updateFinishStateLine() {
        const el = document.getElementById('huayiFinishState');
        const text = computeFinishStateText();
        if (el && text) el.innerHTML = `分天策略: ${text}`;
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

        panel.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 8px;">🛡️ 华医网视频播放脚本 Pro</div>
            <div style="margin-bottom: 4px;">状态: ${statusMap[status]}</div>
            <div style="margin-bottom: 4px; font-size: 10px; opacity: 0.9;">播放模式: ${speedModeText}</div>
            ${finishStateText ? `<div id="huayiFinishState" style="margin-bottom: 4px; font-size: 10px; opacity: 0.9;">分天策略: ${finishStateText}</div>` : ''}
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