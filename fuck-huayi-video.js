// ==UserScript==
// @name         华医网视频播放脚本 Pro
// @namespace    dennischancs
// @version      1.4
// @description  该油猴脚本用于华医网的视频继续播放，✅智能切换CC播放器（支持倍速）✅自动播放下一视频✅屏蔽弹窗✅静音播放✅用户行为模拟✅圆球浮窗✅防检测倍速播放（仅限CC播放器，最快8.0x）✅智能跳转逻辑✅自动处理签到弹窗✅自动作答播放中途弹题
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
                        if (currentSpeed === 1.0) {
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

    // 🔥 修复：时间监控函数（倍速模式）- 考虑倍速影响，调整为240秒
    function startTimeCheck() {
        clearInterval(timeCheckInterval);

        // 🔥 关键修复：根据倍速调整检测频率和跳转时机
        const checkInterval = Math.max(500, 1000 / currentSpeed); // 倍速越高，检测越频繁
        const jumpThreshold = 240 / currentSpeed; // 🔥 修改：倍速下调整跳转阈值为240秒

        console.log(`🔧 倍速监控: 检测间隔${checkInterval}ms, 跳转阈值${jumpThreshold.toFixed(1)}秒`);

        timeCheckInterval = setInterval(() => {
            try {
                const video = document.querySelector('video');
                if (video && video.duration && !isNaN(video.duration)) {
                    const remaining = video.duration - video.currentTime;
                    const progress = video.currentTime / video.duration;

                    // 🔥 修复：使用调整后的跳转阈值，并添加进度保护
                    if (remaining <= jumpThreshold || progress >= 0.95) {
                        console.log(`⏱️ 倍速跳转: 剩余${Math.round(remaining)}秒, 进度${(progress*100).toFixed(1)}%`);
                        clearInterval(timeCheckInterval);
                        proceedToNext();
                    }
                }
            } catch (e) {
                console.log('时间监控错误:', e);
            }
        }, checkInterval);
    }

    function applyPlaybackSpeed(type) {
        try {
            const video = document.querySelector('video');

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

        // 刷新面板显示
        if (isExpanded) {
            expandPanel();
        }
    }

    function saveCourseList() {
        const courses = [];
        const items = document.querySelectorAll('.lis-inside-content, .r .lis, a[onclick*="cwid"]');

        items.forEach((item, idx) => {
            const title = item.querySelector('h2, h3, .title, a')?.textContent.trim();
            const status = item.querySelector('button, .status')?.textContent.trim() || '未知';
            const onclick = item.getAttribute('onclick') || item.querySelector('[onclick*="cwid"]')?.getAttribute('onclick');
            const cwid = onclick?.match(/cwid=([^'"\)]+)/)?.[1];

            if (cwid && title) {
                courses.push({ title, status, cwid, index: idx });
            }
        });

        if (courses.length > 0) {
            localStorage.setItem('huayi_course_list', JSON.stringify(courses));
            console.log(`✅ 已保存 ${courses.length} 个课程`);
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

            // 🔥 智能选择播放器
            const failedCC = safeParseJSON(localStorage.getItem('huayi_failed_cc'), []);
            let url;

            if (failedCC.includes(nextCourse.cwid)) {
                // 该课程CC不可用，直接使用Polyv
                console.log('→ 使用Polyv播放器（该课程CC不可用）');
                url = `course_ware_polyv.aspx?cwid=${nextCourse.cwid}`;
            } else {
                // 优先尝试CC播放器（只传 cwid 参数）
                console.log('→ 尝试使用CC播放器（支持倍速）');
                url = `course_ware_cc.aspx?cwid=${nextCourse.cwid}`;
            }

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

        setInterval(clickLearn, 30000);
        setTimeout(clickLearn, 2000);
    }

    // ==================== 🔥 视频中途弹题自动作答 ====================
    // 检测 CC 播放器播放中途出现的答题弹窗（.ccQuestionBox）：
    // 1. 自动模拟真人点击选择答案（判断题优先选"正确"）并点击"提交"
    // 2. 提交后验证弹窗是否消失、视频是否恢复；答错自动换下一个选项
    // 3. 错误答案记录到 localStorage，下次遇到同一题直接避开
    // 4. 所有选项都失败时，强制点击隐藏的"跳过"按钮兜底并恢复播放

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

        function handleQuestion() {
            if (handling) return;
            const box = getQuestionBox();
            if (!box) return;

            const info = getQuestionInfo(box);
            if (!info.options.length) return;
            handling = true;
            console.log(`❓ 检测到中途弹题 [${info.type || '单选'}]: ${info.text}`);

            const isMulti = info.type.indexOf('多选') !== -1;
            const wrongList = getAttempts()[info.text] || [];

            // 生成作答计划：每项是一个"本轮选择的选项下标数组"
            let plans;
            if (isMulti) {
                plans = [info.options.map((o, i) => i)]; // 多选：全选提交
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

                const curBox = getQuestionBox() || box;
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

                    setTimeout(() => {
                        const stillBox = getQuestionBox();
                        const answered = !stillBox || isVideoPlaying();
                        if (answered) {
                            if (stillBox) stillBox.style.display = 'none'; // 清理残留弹窗
                            console.log('✅ 弹题处理完成，继续播放视频');
                            handling = false;
                            resumeVideo();
                        } else {
                            console.log('❌ 答案不正确，准备换下一个选项');
                            if (!isMulti && plan.length === 1) {
                                markWrong(info.text, [info.options[plan[0]].label]);
                            }
                            tryNext(round + 1);
                        }
                    }, 2000);
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
            z-index: 99999; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            font-size: 20px; color: white; overflow: hidden;
        `;

        document.body.appendChild(panel);

        panel.onclick = (e) => {
            e.stopPropagation();
            togglePanel();
        };

        document.onclick = (e) => {
            const panel = document.getElementById('huayi-panel');
            if (isExpanded && panel && !panel.contains(e.target)) {
                collapsePanel();
            }
        };
    }

    function togglePanel() {
        isExpanded ? collapsePanel() : expandPanel();
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

        panel.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 8px;">🛡️ 华医网视频播放脚本 Pro</div>
            <div style="margin-bottom: 4px;">状态: ${statusMap[status]}</div>
            <div style="margin-bottom: 4px; font-size: 10px; opacity: 0.9;">播放模式: ${speedModeText}</div>
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

            <div style="font-size: 9px; opacity: 0.7; margin-top: 8px; padding-top: 4px; border-top: 1px solid rgba(255,255,255,0.2);">
                ✅ 智能切换播放器 ✅ 自动回退 ✅ 防检测倍速<br>✅ 智能跳转逻辑 ✅ 自动处理CC签到 ✅ 弹题自动作答
            </div>
        `;

        // 绑定滑块事件
        const speedSlider = document.getElementById('speedSlider');
        const speedValue = document.getElementById('speedValue');
        if (speedSlider) {
            speedSlider.addEventListener('input', (e) => {
                const speed = parseFloat(e.target.value);
                speedValue.textContent = speed.toFixed(2) + 'x';
                setPlaybackSpeed(speed);
            });
        }

        // 绑定跳转按钮事件
        document.getElementById('nextBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            proceedToNext();
        });

        // 绑定清除失败记录按钮
        document.getElementById('clearFailedBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            localStorage.removeItem('huayi_failed_cc');
            console.log('✅ 已清除CC失败记录');
            expandPanel(); // 刷新面板
        });
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