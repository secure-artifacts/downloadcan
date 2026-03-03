// 向页面注入 inject.js，从而突破沙盒限制，直接拦截主环境的 fetch 流量
const script = document.createElement('script');
script.src = chrome.runtime.getURL('inject.js');
script.onload = function() {
    this.remove();
};
(document.head || document.documentElement).appendChild(script);
