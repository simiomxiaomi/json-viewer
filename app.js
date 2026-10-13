/*!
 * JSON Viewer —— 纯前端 JSON 格式化与可视化查看器
 * 零依赖：不引入任何外部库 / CDN / 字体 / 图片。
 *
 * 结构总览：
 *   1. 常量与全局状态
 *   2. DOM 引用
 *   3. 工具函数
 *   4. 解析与统计
 *   5. 树形渲染
 *   6. 搜索
 *   7. 工具栏动作（格式化 / 压缩 / 复制 / 下载 / 清空 / 示例）
 *   8. 事件绑定与初始化
 */
(function () {
  'use strict';

  /* ============================================================
   * 1. 常量与全局状态
   * ============================================================ */

  /** 输入防抖延迟（毫秒） */
  var DEBOUNCE_MS = 300;
  /** 首次渲染时默认展开的层级 */
  var DEFAULT_EXPAND_DEPTH = 2;

  /** 防抖定时器句柄 */
  var parseTimer = null;
  /** 最近一次解析成功的数据；解析失败为 null */
  var currentData = null;
  /** 当前搜索词（小写） */
  var searchTerm = '';
  /** 轻提示定时器 */
  var toastTimer = null;

  /** 默认示例数据：字段尽量丰富，打开即有内容可看 */
  var SAMPLE_JSON = {
    project: {
      name: 'JSON Viewer',
      version: '1.0.0',
      author: '苏小晗',
      email: 'mc183otpa@163.com',
      github: 'https://github.com/simiomxiaomi',
      homepage: null,
      tags: ['纯前端', '零依赖', 'vanilla-js', 'json', '可视化'],
      stats: {
        stars: 128,
        forks: 17,
        watchers: 9,
        license: 'MIT',
        archived: false
      }
    },
    features: [
      { id: 1, key: 'format', title: '一键格式化', indent: 2, enabled: true },
      { id: 2, key: 'minify', title: '压缩成一行', indent: 0, enabled: true },
      { id: 3, key: 'tree', title: '可折叠树形视图', indent: null, enabled: true },
      { id: 4, key: 'search', title: '按 key 搜索高亮', indent: null, enabled: true },
      { id: 5, key: 'export', title: '下载 .json 文件', indent: null, enabled: true }
    ],
    dependencies: {},
    environments: [
      {
        name: 'development',
        debug: true,
        endpoints: {
          api: 'http://127.0.0.1:3000/api',
          ws: 'ws://127.0.0.1:3000/socket',
          cdn: null
        },
        flags: ['verbose', 'hot-reload']
      },
      {
        name: 'production',
        debug: false,
        endpoints: {
          api: 'https://api.example.com',
          ws: 'wss://api.example.com/socket',
          cdn: 'https://cdn.example.com'
        },
        flags: []
      }
    ],
    metrics: {
      visitors: 20480,
      conversion: 0.0375,
      avgDurationSeconds: 183.6,
      lastUpdated: '2026-10-13T14:24:52+08:00',
      history: [120, 135, 98, 210, 305, 288, 412]
    },
    notes: [
      '双击 index.html 即可使用，无需任何构建步骤。',
      '所有解析与渲染都在浏览器本地完成，数据不会离开你的电脑。'
    ],
    deprecated: null
  };

  /* ============================================================
   * 2. DOM 引用
   * ============================================================ */

  var els = {};

  /** 收集所有需要操作的 DOM 节点；id 必须与 index.html 完全一致 */
  function initDomRefs() {
    els.input = document.getElementById('input');
    els.output = document.getElementById('output');
    els.parseError = document.getElementById('parseError');
    els.btnFormat2 = document.getElementById('btnFormat2');
    els.btnFormat4 = document.getElementById('btnFormat4');
    els.btnMinify = document.getElementById('btnMinify');
    els.btnCopy = document.getElementById('btnCopy');
    els.btnDownload = document.getElementById('btnDownload');
    els.btnClear = document.getElementById('btnClear');
    els.btnSample = document.getElementById('btnSample');
    els.btnExpandAll = document.getElementById('btnExpandAll');
    els.btnCollapseAll = document.getElementById('btnCollapseAll');
    els.statKeys = document.getElementById('statKeys');
    els.statDepth = document.getElementById('statDepth');
    els.statChars = document.getElementById('statChars');
    els.statTime = document.getElementById('statTime');
    els.searchInput = document.getElementById('searchInput');
    els.searchCount = document.getElementById('searchCount');
    els.toast = document.getElementById('toast');
  }

  /* ============================================================
   * 3. 工具函数
   * ============================================================ */

  /** 数字千分位 */
  function formatNumber(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /** 判断 JSON 值的类型 */
  function typeOf(value) {
    if (value === null) { return 'null'; }
    if (Array.isArray(value)) { return 'array'; }
    return typeof value; // 'object' | 'string' | 'number' | 'boolean'
  }

  /** 生成时间戳字符串，用于下载文件名 */
  function timestamp() {
    var d = new Date();
    function pad(n) { return n < 10 ? '0' + n : String(n); }
    return String(d.getFullYear()) + pad(d.getMonth() + 1) + pad(d.getDate()) +
      '-' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
  }

  /** 弹出轻提示 */
  function showToast(message) {
    if (!els.toast) { return; }
    els.toast.textContent = message;
    els.toast.classList.remove('hidden');
    // 强制重排，保证动画每次都能触发
    void els.toast.offsetWidth;
    els.toast.classList.add('show');
    if (toastTimer) { clearTimeout(toastTimer); }
    toastTimer = setTimeout(function () {
      els.toast.classList.remove('show');
      setTimeout(function () { els.toast.classList.add('hidden'); }, 220);
    }, 1800);
  }

  /** 复制文本到剪贴板：优先 Clipboard API，失败的降级到 execCommand */
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () {
        return true;
      }).catch(function () {
        return legacyCopy(text);
      });
    }
    return Promise.resolve(legacyCopy(text));
  }

  /** 旧式复制方案（file:// 协议下更可靠） */
  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', 'readonly');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (e) {
      ok = false;
    }
    document.body.removeChild(ta);
    return ok;
  }

  /* ============================================================
   * 4. 解析与统计
   * ============================================================ */

  /**
   * 由字符偏移量计算行列号（从 1 开始）
   * @param {string} text 原始文本
   * @param {number} offset 字符偏移
   * @returns {{line:number, column:number}|null}
   */
  function offsetToLineCol(text, offset) {
    if (offset === null || offset === undefined || offset < 0) { return null; }
    var pos = Math.min(offset, text.length);
    var line = 1;
    var lineStart = 0;
    for (var i = 0; i < pos; i++) {
      if (text.charCodeAt(i) === 10) { // \n
        line++;
        lineStart = i + 1;
      }
    }
    return { line: line, column: pos - lineStart + 1 };
  }

  /**
   * 从 JSON.parse 抛出的错误里尽量提取位置信息
   * 兼容 V8 的 “at position N” 与 “(line L column C)” 两种文案。
   */
  function extractErrorPosition(error, text) {
    var message = String(error && error.message ? error.message : error);

    var lineColMatch = message.match(/line\s+(\d+)\s+column\s+(\d+)/i);
    if (lineColMatch) {
      return {
        line: parseInt(lineColMatch[1], 10),
        column: parseInt(lineColMatch[2], 10),
        offset: null
      };
    }

    var posMatch = message.match(/position\s+(\d+)/i);
    if (posMatch) {
      var offset = parseInt(posMatch[1], 10);
      var lc = offsetToLineCol(text, offset);
      return { line: lc.line, column: lc.column, offset: offset };
    }

    return null;
  }

  /**
   * 统计键总数与最大嵌套深度
   * 深度约定：根节点所在层级为 1，每向内一层 +1。
   */
  function computeStats(data) {
    var keyCount = 0;
    var maxDepth = 0;

    function walk(value, depth) {
      if (depth > maxDepth) { maxDepth = depth; }

      if (Array.isArray(value)) {
        for (var i = 0; i < value.length; i++) {
          walk(value[i], depth + 1);
        }
        return;
      }

      if (value !== null && typeof value === 'object') {
        var keys = Object.keys(value);
        keyCount += keys.length;
        for (var j = 0; j < keys.length; j++) {
          walk(value[keys[j]], depth + 1);
        }
      }
    }

    walk(data, 1);
    return { keys: keyCount, depth: maxDepth };
  }

  /** 刷新统计栏 */
  function updateStats(stats, chars, elapsedMs) {
    els.statKeys.textContent = formatNumber(stats.keys);
    els.statDepth.textContent = formatNumber(stats.depth);
    els.statChars.textContent = formatNumber(chars);
    els.statTime.textContent = (Math.round(elapsedMs * 100) / 100) + ' ms';
  }

  /** 把统计栏归零 */
  function resetStats(chars) {
    updateStats({ keys: 0, depth: 0 }, chars, 0);
  }

  /** 显示错误条（传入 null 表示隐藏） */
  function showError(info) {
    if (!info) {
      els.parseError.classList.add('hidden');
      els.parseError.textContent = '';
      return;
    }

    els.parseError.textContent = '';

    var title = document.createElement('span');
    title.className = 'err-title';
    title.textContent = '✖ 解析失败：';
    els.parseError.appendChild(title);

    var msg = document.createElement('span');
    msg.textContent = ' ' + info.message;
    els.parseError.appendChild(msg);

    if (info.position) {
      var pos = document.createElement('div');
      pos.className = 'err-pos';
      var parts = ['第 ' + info.position.line + ' 行，第 ' + info.position.column + ' 列'];
      if (info.position.offset !== null && info.position.offset !== undefined) {
        parts.push('字符偏移 ' + info.position.offset);
      }
      pos.textContent = '📍 位置：' + parts.join(' · ');
      els.parseError.appendChild(pos);
    }

    els.parseError.classList.remove('hidden');
  }

  /**
   * 立即解析当前输入并刷新界面
   * @param {boolean} silent 为 true 时不渲染错误条（用于格式化等主动操作后的静默处理）
   */
  function parseInput(silent) {
    var text = els.input.value;

    // 字符数始终实时反映输入长度
    els.statChars.textContent = formatNumber(text.length);

    if (!text.trim()) {
      currentData = null;
      showError(null);
      els.statKeys.textContent = '0';
      els.statDepth.textContent = '0';
      els.statTime.textContent = '0 ms';
      renderEmpty();
      updateSearchCount(0, '');
      return;
    }

    var start = (window.performance && performance.now) ? performance.now() : Date.now();
    var data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      var elapsedFail = ((window.performance && performance.now) ? performance.now() : Date.now()) - start;
      currentData = null;
      renderEmpty();
      els.statKeys.textContent = '0';
      els.statDepth.textContent = '0';
      els.statTime.textContent = (Math.round(elapsedFail * 100) / 100) + ' ms';
      updateSearchCount(0, '');
      if (!silent) {
        showError({
          message: String(err.message || err).replace(/\s*\(line \d+ column \d+\)\s*$/i, ''),
          position: extractErrorPosition(err, text)
        });
      }
      return;
    }
    var elapsed = ((window.performance && performance.now) ? performance.now() : Date.now()) - start;

    currentData = data;
    showError(null);

    var stats = computeStats(data);
    updateStats(stats, text.length, elapsed);

    renderTree(data);
    applySearch(searchTerm);
  }

  /** 输入变化 → 防抖解析 */
  function scheduleParse() {
    if (parseTimer) { clearTimeout(parseTimer); }
    parseTimer = setTimeout(function () {
      parseTimer = null;
      parseInput(false);
    }, DEBOUNCE_MS);
  }

  /* ============================================================
   * 5. 树形渲染
   * ============================================================ */

  /** 空状态占位 */
  function renderEmpty() {
    els.output.textContent = '';
    var tip = document.createElement('div');
    tip.className = 'tree-empty';
    tip.textContent = '在左侧粘贴或输入 JSON，这里会实时生成可折叠的树形视图 🌳';
    els.output.appendChild(tip);
  }

  /**
   * 折叠节点的摘要文本，例如 { name, version, … } 或 [ {…}, {…} ]
   */
  function summarize(value) {
    var MAX = 4;
    var parts = [];
    var i;

    if (Array.isArray(value)) {
      for (i = 0; i < value.length && i < MAX; i++) {
        parts.push(briefValue(value[i]));
      }
    } else {
      var keys = Object.keys(value);
      for (i = 0; i < keys.length && i < MAX; i++) {
        parts.push(keys[i]);
      }
    }

    var body = parts.join(', ');
    var more = (Array.isArray(value) ? value.length : Object.keys(value).length) > MAX;
    return (Array.isArray(value) ? '[' : '{') + body + (more ? ', …' : '') +
      (Array.isArray(value) ? ']' : '}');
  }

  /** 极简值预览 */
  function briefValue(value) {
    var t = typeOf(value);
    if (t === 'object') { return '{…}'; }
    if (t === 'array') { return '[…]'; }
    if (t === 'string') {
      var s = value.length > 18 ? value.slice(0, 18) + '…' : value;
      return '"' + s + '"';
    }
    return String(value);
  }

  /**
   * 构建单个节点的 DOM
   * @param {string|null} key 键名，根节点传 null
   * @param {*} value 值
   * @param {number} depth 当前层级（根为 1）
   * @param {boolean} isLast 是否为同级最后一个（用于尾逗号）
   */
  function buildNode(key, value, depth, isLast) {
    var type = typeOf(value);
    var isContainer = (type === 'object' || type === 'array');
    var size = isContainer ? (type === 'array' ? value.length : Object.keys(value).length) : 0;
    var hasChildren = isContainer && size > 0;

    var node = document.createElement('div');
    node.className = 'node';

    var row = document.createElement('div');
    row.className = 'node-row' + (hasChildren ? ' branch' : '');

    // --- 折叠三角 ---
    if (hasChildren) {
      var toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'toggle';
      toggle.setAttribute('aria-label', '折叠或展开');
      toggle.textContent = '▾';
      row.appendChild(toggle);
    } else {
      var spacer = document.createElement('span');
      spacer.className = isContainer ? 'toggle toggle-empty' : 'toggle toggle-leaf';
      row.appendChild(spacer);
    }

    // --- 键名 ---
    if (key !== null) {
      var keyEl = document.createElement('span');
      keyEl.className = 'key';
      keyEl.textContent = key;
      row.appendChild(keyEl);

      var colon = document.createElement('span');
      colon.className = 'colon';
      colon.textContent = ':';
      row.appendChild(colon);
    }

    // --- 值 / 类型徽章 ---
    if (isContainer) {
      var badge = document.createElement('span');
      badge.className = 'type-badge';
      badge.textContent = (type === 'array' ? '[' + size + ']' : '{' + size + '}');
      row.appendChild(badge);

      var summary = document.createElement('span');
      summary.className = 'summary';
      summary.textContent = ' ' + summarize(value);
      row.appendChild(summary);
    } else {
      var valEl = document.createElement('span');
      valEl.className = 'value-' + type;
      if (type === 'string') {
        valEl.textContent = JSON.stringify(value);
      } else if (type === 'null') {
        valEl.textContent = 'null';
      } else {
        valEl.textContent = String(value);
      }
      row.appendChild(valEl);
    }

    // --- 尾逗号 ---
    if (!isLast && !isContainer) {
      var comma = document.createElement('span');
      comma.className = 'colon';
      comma.textContent = ',';
      row.appendChild(comma);
    }

    node.appendChild(row);

    // --- 子节点 ---
    if (hasChildren) {
      var children = document.createElement('div');
      children.className = 'children';

      if (type === 'array') {
        for (var i = 0; i < value.length; i++) {
          children.appendChild(buildNode(String(i), value[i], depth + 1, i === value.length - 1));
        }
      } else {
        var keys = Object.keys(value);
        for (var j = 0; j < keys.length; j++) {
          children.appendChild(buildNode(keys[j], value[keys[j]], depth + 1, j === keys.length - 1));
        }
      }

      node.appendChild(children);

      // 超过默认展开深度的节点默认折叠
      if (depth > DEFAULT_EXPAND_DEPTH) {
        node.classList.add('collapsed');
        row.firstElementChild.textContent = '▸';
      }
    }

    return node;
  }

  /** 渲染整棵树 */
  function renderTree(data) {
    els.output.textContent = '';
    els.output.appendChild(buildNode(null, data, 1, true));
    els.output.scrollTop = 0;
  }

  /** 折叠 / 展开单个节点 */
  function toggleNode(node) {
    var collapsed = node.classList.toggle('collapsed');
    var toggle = node.firstElementChild ? node.firstElementChild.firstElementChild : null;
    if (toggle && toggle.classList.contains('toggle')) {
      toggle.textContent = collapsed ? '▸' : '▾';
    }
  }

  /** 全部展开 */
  function expandAll() {
    var nodes = els.output.querySelectorAll('.node.collapsed');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].classList.remove('collapsed');
      var toggle = nodes[i].firstElementChild.firstElementChild;
      if (toggle && toggle.classList.contains('toggle')) { toggle.textContent = '▾'; }
    }
    if (currentData !== null || els.output.querySelector('.node')) {
      showToast('已全部展开');
    }
  }

  /** 全部折叠：仅保留根节点展开 */
  function collapseAll() {
    var nodes = els.output.querySelectorAll('.node');
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var hasChildNodes = node.querySelector('.children');
      if (!hasChildNodes) { continue; }
      // 根节点保持展开，便于继续操作
      if (node.parentElement === els.output) { continue; }
      node.classList.add('collapsed');
      var toggle = node.firstElementChild.firstElementChild;
      if (toggle && toggle.classList.contains('toggle')) { toggle.textContent = '▸'; }
    }
    if (els.output.querySelector('.node')) {
      showToast('已折叠到第一层');
    }
  }

  /* ============================================================
   * 6. 搜索
   * ============================================================ */

  /** 更新搜索命中计数显示 */
  function updateSearchCount(count, term) {
    if (!els.searchCount) { return; }
    if (!term) {
      els.searchCount.textContent = '';
      return;
    }
    els.searchCount.textContent = count > 0 ? (count + ' 项') : '无匹配';
  }

  /** 展开某个节点的所有祖先，使命中项可见 */
  function expandAncestors(node) {
    var parent = node.parentElement;
    while (parent && parent !== els.output) {
      if (parent.classList && parent.classList.contains('node')) {
        parent.classList.remove('collapsed');
        var toggle = parent.firstElementChild.firstElementChild;
        if (toggle && toggle.classList.contains('toggle')) { toggle.textContent = '▾'; }
      }
      parent = parent.parentElement;
    }
  }

  /**
   * 按 key / 值高亮匹配项
   * 空搜索词时清除全部高亮。
   */
  function applySearch(term) {
    searchTerm = (term || '').toLowerCase();

    var rows = els.output.querySelectorAll('.node-row');
    var matched = 0;
    var i;

    // 先清除旧状态
    for (i = 0; i < rows.length; i++) {
      rows[i].classList.remove('match');
    }

    if (!searchTerm) {
      updateSearchCount(0, '');
      return;
    }

    for (i = 0; i < rows.length; i++) {
      var row = rows[i];
      var keyEl = row.querySelector('.key');
      var valEl = row.querySelector('.value-string, .value-number, .value-boolean, .value-null');

      var haystack = '';
      if (keyEl) { haystack += keyEl.textContent; }
      if (valEl) { haystack += ' ' + valEl.textContent; }

      if (haystack.toLowerCase().indexOf(searchTerm) !== -1) {
        row.classList.add('match');
        matched++;
        expandAncestors(row);
      }
    }

    updateSearchCount(matched, searchTerm);
  }

  /* ============================================================
   * 7. 工具栏动作
   * ============================================================ */

  /** 统一入口：把输入文本替换成新的 JSON 文本并重新解析 */
  function replaceInput(text, toastMessage) {
    els.input.value = text;
    parseInput(false);
    if (toastMessage) { showToast(toastMessage); }
  }

  /** 格式化（指定缩进空格数） */
  function formatJson(indent) {
    if (!currentData && !tryParseForAction()) { return; }
    try {
      replaceInput(JSON.stringify(currentData, null, indent), '已格式化为 ' + indent + ' 空格缩进');
    } catch (e) {
      showToast('格式化失败：' + e.message);
    }
  }

  /** 压缩成一行 */
  function minifyJson() {
    if (!currentData && !tryParseForAction()) { return; }
    try {
      replaceInput(JSON.stringify(currentData), '已压缩成一行');
    } catch (e) {
      showToast('压缩失败：' + e.message);
    }
  }

  /** 动作前确保有已解析的数据，没有就现场解析一次 */
  function tryParseForAction() {
    parseInput(false);
    if (currentData === null) {
      showToast('当前内容不是合法 JSON，无法执行该操作');
      return false;
    }
    return true;
  }

  /** 复制结果 */
  function copyResult() {
    var text = els.input.value;
    if (!text.trim()) {
      showToast('没有可复制的内容');
      return;
    }
    copyText(text).then(function (ok) {
      showToast(ok ? '已复制到剪贴板 ✅' : '复制失败，请手动选择复制');
    });
  }

  /** 下载 .json 文件 */
  function downloadJson() {
    var text = els.input.value;
    if (!text.trim()) {
      showToast('没有可下载的内容');
      return;
    }

    var blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'json-viewer-' + timestamp() + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    showToast('已下载 .json 文件 ⬇️');
  }

  /** 清空 */
  function clearAll() {
    els.input.value = '';
    els.searchInput.value = '';
    searchTerm = '';
    currentData = null;
    showError(null);
    resetStats(0);
    renderEmpty();
    updateSearchCount(0, '');
    els.input.focus();
    showToast('已清空');
  }

  /** 加载示例数据（深拷贝，避免后续操作污染常量） */
  function loadSample() {
    var text = JSON.stringify(SAMPLE_JSON, null, 2);
    els.input.value = text;
    els.searchInput.value = '';
    searchTerm = '';
    parseInput(false);
    showToast('已加载示例数据 🎲');
  }

  /* ============================================================
   * 8. 事件绑定与初始化
   * ============================================================ */

  function bindEvents() {
    // --- 输入：防抖实时解析 ---
    els.input.addEventListener('input', scheduleParse);

    // --- 工具栏 ---
    els.btnFormat2.addEventListener('click', function () { formatJson(2); });
    els.btnFormat4.addEventListener('click', function () { formatJson(4); });
    els.btnMinify.addEventListener('click', minifyJson);
    els.btnCopy.addEventListener('click', copyResult);
    els.btnDownload.addEventListener('click', downloadJson);
    els.btnClear.addEventListener('click', clearAll);
    els.btnSample.addEventListener('click', loadSample);
    els.btnExpandAll.addEventListener('click', expandAll);
    els.btnCollapseAll.addEventListener('click', collapseAll);

    // --- 树：事件委托，点击整行即可折叠/展开 ---
    els.output.addEventListener('click', function (event) {
      var row = event.target.closest ? event.target.closest('.node-row') : null;
      if (!row || !row.classList.contains('branch')) { return; }
      var node = row.parentElement;
      if (node && node.classList.contains('node')) { toggleNode(node); }
    });

    // --- 搜索 ---
    els.searchInput.addEventListener('input', function () {
      applySearch(els.searchInput.value.trim());
    });
    els.searchInput.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        els.searchInput.value = '';
        applySearch('');
        els.searchInput.blur();
      }
    });

    // --- 全局快捷键 ---
    document.addEventListener('keydown', function (event) {
      var ctrl = event.ctrlKey || event.metaKey;
      if (!ctrl) { return; }

      var key = event.key.toLowerCase();

      if (key === 'enter') {
        event.preventDefault();
        if (event.shiftKey) { formatJson(4); } else { formatJson(2); }
        return;
      }
      if (key === 'f') {
        event.preventDefault();
        els.searchInput.focus();
        els.searchInput.select();
        return;
      }
      if (!event.shiftKey) {
        if (key === 'k') {
          event.preventDefault();
          clearAll();
        }
        return;
      }

      // —— 以下均需 Ctrl + Shift ——
      switch (key) {
        case 'm':
          event.preventDefault();
          minifyJson();
          break;
        case 'c':
          event.preventDefault();
          copyResult();
          break;
        case 's':
          event.preventDefault();
          downloadJson();
          break;
        case 'e':
          event.preventDefault();
          expandAll();
          break;
        case 'w':
          event.preventDefault();
          collapseAll();
          break;
        default:
          break;
      }
    });
  }

  /** 初始化 */
  function init() {
    initDomRefs();
    bindEvents();
    loadSample();
    applySearch('');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
