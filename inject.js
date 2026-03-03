(function () {
  "use strict";

  let cache = { headers: null, body: null, url: null };

  // 防重复注入保护
  if (document.getElementById("canva-ex-panel")) return;

  // --- 1. 插入 CSS 样式表 ---
  const style = document.createElement('style');
  style.innerHTML = `
    #canva-ex-panel * { box-sizing: border-box; }
    .cx-page-btn { padding: 4px 0; text-align: center; border: 1px solid #ddd; border-radius: 4px; cursor: pointer; font-size: 13px; background: white; user-select: none; transition: all 0.2s; color: #333; }
    .cx-page-btn:hover { background: #f0f0f0; }
    .cx-page-btn.selected { background: #e8f0fe; border-color: #1a73e8; color: #1a73e8; font-weight: bold; }
    .cx-page-btn.downloading { background: #fef7e0; border-color: #fbbc04; color: #b08d00; font-weight: bold; cursor: wait; }
    .cx-page-btn.done { background: #e6f4ea; border-color: #34a853; color: #137333; font-weight: bold; }
    #canva-ex-log::-webkit-scrollbar { width: 4px; }
    #canva-ex-log::-webkit-scrollbar-thumb { background: #ccc; border-radius: 2px; }
    
    /* 悬浮小球按钮样式 */
    #canva-ex-float {
        position: fixed; top: 150px; right: 20px; z-index: 999998; 
        width: 48px; height: 48px; border-radius: 24px;
        background: radial-gradient(circle at 30% 30%, #a855f7, #6b21a8);
        box-shadow: 0 4px 15px rgba(107,33,168,0.4);
        display: flex; justify-content: center; align-items: center;
        color: white; font-size: 20px; cursor: pointer;
        transition: transform 0.2s, opacity 0.3s;
        user-select: none;
    }
    #canva-ex-float:hover { transform: scale(1.1); }
  `;
  document.head.appendChild(style);

  // --- 1.5 建立悬浮小球 (在面板收起时显示) ---
  const floatBtn = document.createElement("div");
  floatBtn.id = "canva-ex-float";
  floatBtn.innerHTML = "🚀";
  floatBtn.title = "唤醒 Canva 下载加速器";
  document.body.appendChild(floatBtn);

  let isFloatDragging = false;
  floatBtn.addEventListener('mousedown', (e) => {
      isFloatDragging = false;
      const startX = e.clientX, startY = e.clientY;
      const initX = floatBtn.offsetLeft, initY = floatBtn.offsetTop;
      
      function onFloatMove(ev) {
          if (Math.abs(ev.clientX - startX) > 3 || Math.abs(ev.clientY - startY) > 3) isFloatDragging = true;
          if (!isFloatDragging) return;
          floatBtn.style.right = 'auto';
          floatBtn.style.left = (initX + (ev.clientX - startX)) + "px";
          floatBtn.style.top = (initY + (ev.clientY - startY)) + "px";
      }
      function onFloatUp() {
          document.removeEventListener("mousemove", onFloatMove);
          document.removeEventListener("mouseup", onFloatUp);
      }
      document.addEventListener("mousemove", onFloatMove);
      document.addEventListener("mouseup", onFloatUp);
  });
  
  floatBtn.addEventListener('click', (e) => {
      if (isFloatDragging) return; // 如果是拖拽则不触发点击
      
      // 用户主动点击浮球，直接展开大面板，并开启“长亮独立驻扎”模式
      panel.style.display = 'block';
      panel.style.opacity = '1';
      userDetached = true; 
      localStorage.setItem('canva-ex-detached', 'true');
      
      // 记录默认弹出的位置为主位置
      localStorage.setItem('canva-ex-left', panel.style.left || 'auto');
      localStorage.setItem('canva-ex-top', panel.style.top || '70px');

      pinBtn.style.display = 'block';
      floatBtn.style.display = 'none'; // 隐藏浮球
  });

  // --- 2. 建立 UI 面板 (对应功能4：右上角，别挡住按钮，隐藏，拖动) ---
  const panel = document.createElement("div");
  panel.id = "canva-ex-panel";
  // 初始隐藏，等待原生面板出现
  panel.style.cssText = `display: none; position: fixed; top: 70px; right: 20px; z-index: 999999; background: white; border-radius: 8px; font-family: sans-serif; width: 300px; box-shadow: 0 4px 15px rgba(0,0,0,0.15); border: 2px solid #8b3dff; overflow: hidden; transition: opacity 0.2s;`;
  
  panel.innerHTML = `
    <!-- 头部和拖动手柄 -->
    <div id="canva-ex-header" style="background:#8b3dff; padding:8px 12px; cursor:move; display:flex; justify-content:space-between; align-items:center; color:#fff;">
      <span style="font-weight:bold; font-size:14px; user-select:none;">🚀 Canva 下载加速器</span>
      <div style="display:flex; gap:10px; align-items:center;">
        <button id="canva-ex-pin" style="background:none; border:none; color:#fff; cursor:pointer; font-size:13px; font-weight:bold; padding:0; margin-top:2px; user-select:none; display:none;" title="恢复自动吸附">📌吸附</button>
        <button id="canva-ex-toggle" style="background:none; border:none; color:#fff; cursor:pointer; font-size:16px; font-weight:bold; padding:0; user-select:none;" title="折叠/展开">—</button>
      </div>
    </div>
    <!-- 内容区 -->
    <div id="canva-ex-body" style="padding:15px; display:block;">
      <div id="dl-status" style="font-size:12px; color:#d93025; font-weight:bold; margin-bottom:10px;">🔴 待拦截 (请在网页中点一次下载)</div>
      
      <div style="font-size:12px; margin-bottom:6px; color:#333; font-weight:bold;">点选页面 (<span style="color:#1a73e8;">蓝:选中</span> | <span style="color:#b08d00;">黄:下载中</span> | <span style="color:#137333;">绿:完成</span>)</div>
      <!-- 数字按钮网格 -->
      <div id="canva-ex-grid" style="display:grid; grid-template-columns:repeat(5, 1fr); gap:6px; margin-bottom:12px;"></div>

      <!-- 反复下载使用的按钮 -->
      <button id="canva-ex-download-btn" style="width:100%; padding:10px; background:#ccc; color:#fff; border:none; border-radius:4px; font-weight:bold; cursor:not-allowed;" disabled>开始下载</button>
      
      <!-- 功能5：动态工作日志保留 -->
      <div style="font-size:11px; margin-top:12px; color:#555; font-weight:bold;">动态工作日志:</div>
      <div id="canva-ex-log" style="height:110px; overflow-y:auto; background:#f9f9f9; padding:6px; font-size:11px; border-radius:4px; border:1px solid #eee; margin-top:4px; color:#444;"></div>
    </div>
  `;
  document.body.appendChild(panel);

  const statusEl = document.getElementById("dl-status");
  const relayBtn = document.getElementById("canva-ex-download-btn");
  const logEl = document.getElementById("canva-ex-log");
  const grid = document.getElementById("canva-ex-grid");

  // 动态日志写入封装函数
  function log(msg) {
    const time = new Date().toLocaleTimeString('en-US', {hour12:false});
    logEl.innerHTML += `<div style="margin-bottom:3px; line-height:1.3;">[${time}] ${msg}</div>`;
    logEl.scrollTop = logEl.scrollHeight;
  }

  // --- 3. 生成数字按钮 (默认15个，供反复修改点选，记忆选择状态) ---
  const savedSelectionStr = localStorage.getItem('canva-ex-saved-pages');
  let savedPages = [];
  try {
    if (savedSelectionStr) savedPages = JSON.parse(savedSelectionStr);
  } catch(e) {}

  function saveSelectedPages() {
    const selected = Array.from(document.querySelectorAll(".cx-page-btn.selected")).map(btn => parseInt(btn.dataset.page));
    localStorage.setItem('canva-ex-saved-pages', JSON.stringify(selected));
  }

  for (let i = 1; i <= 15; i++) {
    let btn = document.createElement('div');
    btn.className = 'cx-page-btn';
    btn.dataset.page = i;
    btn.innerText = i;
    btn.title = `点击勾选/取消 第${i}页`;
    
    // 恢复历史选择
    if (savedPages.includes(i)) {
      btn.classList.add('selected');
    }

    btn.addEventListener('click', () => {
        // 如果正在下载，不允许随便取消勾选
        if (!btn.classList.contains('downloading')) {
            btn.classList.toggle('selected');
            btn.classList.remove('done'); // 如果之前下载过（完成），点选则洗掉绿灯，变回蓝灯
            saveSelectedPages(); // 每次点击保存状态
        }
    });
    grid.appendChild(btn);
  }

  // --- 面板折叠与展开 ---
  const bodyEl = document.getElementById("canva-ex-body");
  document.getElementById("canva-ex-toggle").addEventListener("click", function() {
    if (bodyEl.style.display === "none") {
      bodyEl.style.display = "block";
      this.innerText = "—";
    } else {
      bodyEl.style.display = "none";
      this.innerText = "+"; // 折叠时显示 + 号
    }
  });

  const header = document.getElementById("canva-ex-header");
  const pinBtn = document.getElementById("canva-ex-pin");
  let isDragging = false, startX, startY, initX, initY;
  
  // --- 优先读取记忆的吸附和位置状态 ---
  let userDetached = localStorage.getItem('canva-ex-detached') === 'true';
  let savedLeft = localStorage.getItem('canva-ex-left');
  let savedTop = localStorage.getItem('canva-ex-top');

  // 如果处于分离常驻模式，直接复原位置并展示
  if (userDetached) {
      panel.style.display = 'block';
      panel.style.opacity = '1';
      panel.style.right = 'auto'; // 强制绝对定位
      if (savedLeft) panel.style.left = savedLeft;
      if (savedTop) panel.style.top = savedTop;
      pinBtn.style.display = 'block';
      floatBtn.style.display = 'none';
  }

  header.addEventListener("mousedown", (e) => {
    if (e.target.tagName.toLowerCase() === 'button') return;
    
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    initX = panel.offsetLeft;
    initY = panel.offsetTop;
    
    panel.style.right = 'auto';
    panel.style.left = initX + 'px';
    panel.style.top = initY + 'px';
    
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  });
  function onMouseMove(e) {
    if (!isDragging) return;
    
    if (Math.abs(e.clientX - startX) > 2 || Math.abs(e.clientY - startY) > 2) {
      if (!userDetached) {
        userDetached = true;
        localStorage.setItem('canva-ex-detached', 'true');
        pinBtn.style.display = 'block';
      }
    }
    
    const newLeft = initX + (e.clientX - startX);
    const newTop = initY + (e.clientY - startY);
    panel.style.left = newLeft + "px";
    panel.style.top = newTop + "px";
    
    // 实时记忆最后拖拽的位置
    localStorage.setItem('canva-ex-left', newLeft + "px");
    localStorage.setItem('canva-ex-top', newTop + "px");
  }
  function onMouseUp() {
    isDragging = false;
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  }

  // 点击“📌吸附”按钮，恢复跟随原生面板的状态
  pinBtn.addEventListener('click', () => {
    userDetached = false;
    localStorage.setItem('canva-ex-detached', 'false');
    pinBtn.style.display = 'none';
  });

  // --- 原生下载面板智能追踪 (跟随原生窗口吸附) ---
  function findNativePanel() {
    try {
      // 兼容寻找常见特征文字：“檔案類型”, “文件类型”, “File type”
      const xpath = "//*[normalize-space(text())='檔案類型' or normalize-space(text())='文件类型' or normalize-space(text())='File type']";
      const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
      let node = result.singleNodeValue;
      
      if (node) {
        let el = node.parentElement;
        while (el && el !== document.body && el !== document.documentElement) {
          const style = window.getComputedStyle(el);
          // 一般弹窗宽度大于 200，且具有绝对或者固定定位
          if ((style.position === 'fixed' || style.position === 'absolute') && el.offsetWidth > 200 && el.offsetHeight > 200) {
            return el;
          }
          if (el.getAttribute('role') === 'dialog' || el.tagName === 'DIALOG' || el.getAttribute('role') === 'menu') {
            return el;
          }
          el = el.parentElement;
        }
      }
    } catch(e) {}
    return null;
  }

  let hideTimeoutId = null;

  setInterval(() => {
    const nativePanel = findNativePanel();
    if (nativePanel) {
      const rect = nativePanel.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        // 原生面板可见
        if (bodyEl.style.display !== "none") {
            panel.style.display = 'block';
            panel.style.opacity = '1';
        }
        
        // 取消可能的隐藏倒计时
        if (hideTimeoutId) {
            clearTimeout(hideTimeoutId);
            hideTimeoutId = null;
        }
        floatBtn.style.display = 'none'; // 面板展现时，小球隐藏
        
        if (!userDetached && !isDragging) {
          // 吸附在坐标系左侧，留出 12 像素空隙
          let newLeft = rect.left - panel.offsetWidth - 12;
          if (newLeft < 10) newLeft = 10; // 防越界
          
          panel.style.left = newLeft + 'px';
          panel.style.top = rect.top + 'px';
          panel.style.right = 'auto'; // 清除初始 right
        }
        return;
      }
    }
    // 未找到原生面板，或者正在自动隐藏的过程中
    if (!hideTimeoutId && panel.style.display !== 'none' && !userDetached) {
        // 【关键】只有在没有 Detached (被固定长亮) 的状态下，才允许5秒自动收起
        hideTimeoutId = setTimeout(() => {
            panel.style.opacity = '0';
            setTimeout(() => { 
                panel.style.display = 'none'; 
                floatBtn.style.display = 'flex'; // 收起后弹出小球
            }, 200);
            hideTimeoutId = null;
        }, 5000); 
    }
  }, 300);

  // 全局变量追踪正在下载的任务数量
  let activeDownloads = 0;

  // --- 4. 核心双向拦截引擎 ---
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const url = args[0] instanceof Request ? args[0].url : args[0];
    if (typeof url === 'string' && url.includes("/_ajax/export?version=2")) {
      const options = args[1] || {};
      saveData(url, options.headers, options.body);
    }
    return originalFetch.apply(this, args);
  };

  const open = XMLHttpRequest.prototype.open;
  const send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this._url = url;
    return open.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (body) {
    if (this._url && this._url.includes("/_ajax/export?version=2")) {
      saveData(this._url, {}, body);
    }
    return send.apply(this, arguments);
  };

  function saveData(url, headers, body) {
    try {
      if(!cache.url) log("🎯 数据拦截成功！连接隧道已打通");
      cache.url = url;
      cache.headers = headers instanceof Headers ? Object.fromEntries(headers.entries()) : (headers || {});
      cache.body = typeof body === "string" ? JSON.parse(body) : body;

      if (cache.url) {
        statusEl.innerText = "🟢 隧道就绪，可随时下载";
        statusEl.style.color = "#0f9d58";
        
        relayBtn.disabled = false;
        relayBtn.style.background = "#8b3dff";
        relayBtn.style.cursor = "pointer";
        relayBtn.innerText = "⚡ 开始下载选定的页面";

        // 【功能1】检测拦截成功后自动下载：如果有已选定的按钮，直接免点起飞
        const selectedBtns = document.querySelectorAll(".cx-page-btn.selected");
        if (selectedBtns.length > 0) {
            log(`检测到已勾选了 ${selectedBtns.length} 个页面，拦截后自动触发下载！`);
            startDownload();
        }
      }
    } catch (e) {
      log("拦截处理异常: " + e.message);
    }
  }

  // --- 5. 下载并行动力引擎 ---
  relayBtn.onclick = startDownload;

  async function startDownload() {
    if (!cache.url) return alert("请先在 Canva 原生网页中，随便点击一次下载（触发数据传输），好让插件拦截到您的账号凭证！");
    
    // 【功能2】下载按钮可反复使用。我们只取出目前变蓝（selected）的按钮。
    // 下载过变成绿色的不影响你重新双击变蓝再下。
    const selectedBtns = Array.from(document.querySelectorAll(".cx-page-btn.selected"));
    if (selectedBtns.length === 0) {
        return log("🚫 请先点击网格数字选择要下载的页面");
    }

    selectedBtns.forEach(btn => {
        const p = parseInt(btn.dataset.page);
        btn.classList.remove('selected');
        btn.classList.add('downloading');
        activeDownloads++;
        execute(p, btn);
    });
  }

  async function checkAllDoneAndHide() {
      activeDownloads--;
      if (activeDownloads <= 0) {
          activeDownloads = 0;
          log("🎉 全部所选页面已完成！面板将在 5 秒后隐身。");
          // 如果用户没有点固定吸附按钮，就自动收起
          if (!userDetached && !hideTimeoutId) {
              hideTimeoutId = setTimeout(() => {
                  panel.style.opacity = '0';
                  setTimeout(() => { 
                      panel.style.display = 'none'; 
                      floatBtn.style.display = 'flex'; 
                  }, 200);
                  hideTimeoutId = null;
              }, 5000);
          }
      }
  }

  async function execute(p, btn) {
    const payload = JSON.parse(JSON.stringify(cache.body));
    if (payload.renderSpec && payload.renderSpec.pages) payload.renderSpec.pages = [p];
    if (payload.outputSpecs && payload.outputSpecs[0] && payload.outputSpecs[0].pages) payload.outputSpecs[0].pages = [p];

    try {
      const res = await originalFetch(cache.url, {
        method: "POST",
        headers: {
          ...cache.headers,
          "content-type": "application/json;charset=UTF-8",
        },
        body: JSON.stringify(payload),
        credentials: "include",
      });
      if (res.ok) {
        const text = await res.text();
        const data = JSON.parse(text.replace(/^[^{[]+/, ""));
        log(`⏳ 页面 ${p} 排队渲染中...`);
        poll(data.export.exportIdentifier, p, btn);
      } else {
        throw new Error("HTTP " + res.status);
      }
    } catch (e) {
      log(`❌ 页面 ${p} 拦截转发失败`);
      btn.classList.remove('downloading');
      btn.classList.add('selected'); // 回滚状态
    }
  }

  async function poll(id, p, btn) {
    let attempts = 0;
    while (attempts < 80) { // 轮询最高上限
      attempts++;
      await new Promise((r) => setTimeout(r, 4500));
      try {
        const res = await originalFetch(
          `https://www.canva.com/_ajax/export/${id}?attachment`,
          { headers: cache.headers, credentials: "include" }
        );
        const text = await res.text();
        const data = JSON.parse(text.replace(/^[^{[]+/, ""));
        
        if (data.export && data.export.status === "COMPLETE") {
          const url = data.export.output.exportBlobs[0].url;
          
          // 获取格式后缀
          let ext = "mp4";
          if (url.includes(".png")) ext = "png";
          else if (url.includes(".jpg") || url.includes(".jpeg")) ext = "jpg";
          else if (url.includes(".pdf")) ext = "pdf";
          else if (url.includes(".gif")) ext = "gif";

          // 触发浏览器直接下载
          const a = document.createElement("a");
          a.href = url;
          a.download = `Canva_Page_${p}_HD.${ext}`;
          a.style.display = 'none';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          
          log(`✅ 页面 ${p} 输出完成，已开始下载！`);
          btn.classList.remove('downloading');
          // 【功能3】下载完毕变绿
          btn.classList.add('done');
          checkAllDoneAndHide();
          break;
        } else if (data.export && data.export.status === "FAILED") {
          log(`❌ 页面 ${p} 遇到 Canva 错误终止。`);
          btn.classList.remove('downloading');
          btn.classList.add('selected');
          checkAllDoneAndHide();
          break;
        }
      } catch(e) {
        // 网络抖动，静默重试
      }
    }
  }
  
  // 注入时检测，如果原面板还没出来，并且用户没有强行驻扎它，先挂载好悬浮球
  if (panel.style.display === 'none' && !userDetached) {
      floatBtn.style.display = 'flex';
  }

})();
