/* IPIP-NEO-120 — 前端逻辑
   无依赖、无请求：作答、计分、结果全部在本地完成。 */
(function () {
  'use strict'

  var D = window.NEO_DATA
  var QS = D.questions
  var N = QS.length
  var STORE_KEY = 'ipip-neo-120:v1'

  var OPTIONS = [
    { v: 1, label: '非常不符' },
    { v: 2, label: '比较不符' },
    { v: 3, label: '说不准' },
    { v: 4, label: '比较符合' },
    { v: 5, label: '非常符合' }
  ]

  var DOMAIN_BANDS = [
    { lt: 20, key: 'vlow', label: '很低' },
    { lt: 40, key: 'low', label: '偏低' },
    { lt: 60, key: 'mid', label: '中等' },
    { lt: 80, key: 'high', label: '偏高' },
    { lt: Infinity, key: 'vhigh', label: '很高' }
  ]

  var $ = function (sel, root) { return (root || document).querySelector(sel) }

  var el = {
    intro: $('#view-intro'),
    test: $('#view-test'),
    result: $('#view-result'),
    domainIndex: $('#domainIndex'),
    startBtn: $('#startBtn'),
    resumeBtn: $('#resumeBtn'),
    ctaNote: $('#ctaNote'),
    ticks: $('#ticks'),
    hudNow: $('#hudNow'),
    hudDone: $('#hudDone'),
    qText: $('#qText'),
    qEn: $('#qEn'),
    scale: $('#scale'),
    backBtn: $('#backBtn'),
    quitBtn: $('#quitBtn'),
    finishBtn: $('#finishBtn'),
    domainList: $('#domainList'),
    resultLede: $('#resultLede'),
    shareBtn: $('#shareBtn'),
    copyBtn: $('#copyBtn'),
    jsonBtn: $('#jsonBtn'),
    retakeBtn: $('#retakeBtn'),
    actionNote: $('#actionNote'),
    homeLink: $('#homeLink')
  }

  var state = {
    answers: new Array(N).fill(null),
    index: 0,
    startedAt: null,
    view: 'intro'
  }

  var locked = false
  var tickEls = []

  /* ── 存储 ─────────────────────────────────────────── */

  function loadSaved () {
    try {
      var raw = localStorage.getItem(STORE_KEY)
      if (!raw) return null
      var s = JSON.parse(raw)
      if (!s || !Array.isArray(s.answers) || s.answers.length !== N) return null
      return s
    } catch (e) { return null }
  }

  function save () {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        v: 1,
        answers: state.answers,
        index: state.index,
        startedAt: state.startedAt
      }))
    } catch (e) { /* 隐私模式下可能不可用，忽略 */ }
  }

  function clearSaved () {
    try { localStorage.removeItem(STORE_KEY) } catch (e) {}
  }

  /* ── 视图切换 ─────────────────────────────────────── */

  function show (name) {
    state.view = name
    el.intro.hidden = name !== 'intro'
    el.test.hidden = name !== 'test'
    el.result.hidden = name !== 'result'
    window.scrollTo(0, 0)
  }

  /* ── 介绍页 ───────────────────────────────────────── */

  function renderDomainIndex () {
    var html = ''
    D.domains.forEach(function (d) {
      html += '<div class="domain-index-row">' +
        '<dt class="domain-index-key">' + d.key + '</dt>' +
        '<dd class="domain-index-name">' + esc(d.name) + '</dd>' +
        '<dd class="domain-index-count">6 个层面，24 题</dd>' +
        '<dd class="domain-index-gloss">' + esc(d.gloss) + '</dd>' +
        '</div>'
    })
    el.domainIndex.innerHTML = html
  }

  function refreshResume () {
    var saved = loadSaved()
    var done = saved ? saved.answers.filter(function (a) { return a !== null }).length : 0
    if (done >= N) {
      el.resumeBtn.hidden = false
      el.resumeBtn.textContent = '查看上次结果'
      el.ctaNote.textContent = '这台设备上还存着一次已完成的作答。'
    } else if (done > 0) {
      el.resumeBtn.hidden = false
      el.resumeBtn.textContent = '继续上次（已答 ' + done + ' / 120）'
      el.ctaNote.textContent = '上次的作答还留在这台设备上。'
    } else {
      el.resumeBtn.hidden = true
    }
  }

  /* ── 作答页 ───────────────────────────────────────── */

  function buildTicks () {
    var frag = document.createDocumentFragment()
    tickEls = []
    for (var i = 0; i < N; i++) {
      var t = document.createElement('span')
      t.className = 'tick'
      frag.appendChild(t)
      tickEls.push(t)
    }
    el.ticks.appendChild(frag)
  }

  function buildScale () {
    var html = ''
    OPTIONS.forEach(function (o) {
      html += '<button type="button" class="opt" role="radio" aria-checked="false" data-v="' + o.v + '">' +
        '<span class="opt-num">' + o.v + '</span>' +
        '<span class="opt-label">' + o.label + '</span>' +
        '</button>'
    })
    el.scale.innerHTML = html
  }

  function updateHud () {
    var done = state.answers.filter(function (a) { return a !== null }).length
    el.hudNow.textContent = String(state.index + 1)
    el.hudDone.textContent = String(done)
    el.finishBtn.hidden = done < N
    for (var i = 0; i < N; i++) {
      tickEls[i].classList.toggle('is-done', state.answers[i] !== null)
      tickEls[i].classList.toggle('is-current', i === state.index)
    }
  }

  function renderQuestion () {
    var q = QS[state.index]
    el.qText.textContent = q.t
    el.qEn.textContent = q.en
    var cur = state.answers[state.index]
    var opts = el.scale.querySelectorAll('.opt')
    for (var i = 0; i < opts.length; i++) {
      opts[i].setAttribute('aria-checked',
        String(cur !== null && Number(opts[i].dataset.v) === cur))
    }
    el.backBtn.disabled = state.index === 0
    el.backBtn.style.opacity = state.index === 0 ? '.45' : ''
    el.backBtn.style.cursor = state.index === 0 ? 'not-allowed' : ''
    updateHud()
  }

  function goTo (i) {
    state.index = Math.max(0, Math.min(N - 1, i))
    save()
    renderQuestion()
  }

  function nextUnanswered (from) {
    for (var i = from + 1; i < N; i++) if (state.answers[i] === null) return i
    for (var j = 0; j <= from && j < N; j++) if (state.answers[j] === null) return j
    return -1
  }

  function choose (value) {
    if (locked) return
    state.answers[state.index] = value
    save()
    renderQuestion()

    var next = nextUnanswered(state.index)

    locked = true
    setTimeout(function () {
      locked = false
      if (next !== -1) {
        goTo(next)
      } else if (state.index < N - 1) {
        goTo(state.index + 1)
      } else {
        renderResult()
      }
    }, 165)
  }

  /* ── 计分 ─────────────────────────────────────────── */

  function computeScores () {
    var facetRaw = {}
    var facetN = {}
    var domainRaw = {}

    QS.forEach(function (q, idx) {
      var r = state.answers[idx]
      if (r === null) return
      var s = q.k === 1 ? r : 6 - r
      var fk = q.d + q.f
      facetRaw[fk] = (facetRaw[fk] || 0) + s
      facetN[fk] = (facetN[fk] || 0) + 1
      domainRaw[q.d] = (domainRaw[q.d] || 0) + s
    })

    var domains = D.domains.map(function (d) {
      var raw = domainRaw[d.key] || 0
      return {
        key: d.key,
        raw: raw,
        pct: Math.round((raw - 24) / 96 * 100)
      }
    })

    var facets = D.facets.map(function (f) {
      var raw = facetRaw[f.key] || 0
      return {
        key: f.key,
        domain: f.domain,
        raw: raw,
        pct: Math.round((raw - 4) / 16 * 100)
      }
    })

    return { domains: domains, facets: facets }
  }

  function domainBand (pct) {
    for (var i = 0; i < DOMAIN_BANDS.length; i++) {
      if (pct < DOMAIN_BANDS[i].lt) return DOMAIN_BANDS[i]
    }
    return DOMAIN_BANDS[DOMAIN_BANDS.length - 1]
  }

  function facetBand (pct) {
    if (pct < 33.4) return 'low'
    if (pct > 66.6) return 'high'
    return 'mid'
  }

  /* ── 结果页 ───────────────────────────────────────── */

  function renderResult () {
    var scores = computeScores()
    var byKey = {}
    scores.domains.forEach(function (d) { byKey[d.key] = d })

    var dmap = {}
    D.domains.forEach(function (d) { dmap[d.key] = d })
    var fmap = {}
    D.facets.forEach(function (f) { fmap[f.key] = f })

    el.resultLede.innerHTML = summaryLine(scores.domains, dmap)

    var html = ''
    scores.domains.forEach(function (s) {
      var d = dmap[s.key]
      var band = domainBand(s.pct)
      var facets = scores.facets.filter(function (f) { return f.domain === s.key })

      html += '<article class="domain" data-key="' + d.key + '"' +
        ' style="--c:' + d.color + ';--v:' + s.pct + '">' +
        '<div class="domain-head">' +
          '<span class="domain-key">' + d.key + '</span>' +
          '<h2 class="domain-name">' + esc(d.name) +
            '<span class="domain-abbr" lang="en">' + esc(d.en) + '</span></h2>' +
          '<span class="domain-score">' + s.pct + '</span>' +
        '</div>' +
        '<div class="track" role="img" aria-label="' + esc(d.name) + ' ' + s.pct +
          ' 分，满分 100，量表中点 50">' +
          '<div class="track-fill"></div><div class="track-mid"></div>' +
        '</div>' +
        '<div class="track-scale"><span>0</span><span>50</span><span>100</span></div>' +
        '<p class="domain-band"><b>' + band.label + '</b>' + esc(d.bands[band.key]) + '</p>' +
        '<button type="button" class="facet-toggle" aria-expanded="false"' +
          ' aria-controls="facets-' + d.key + '">展开 ' + facets.length + ' 个层面</button>' +
        '<div class="facets" id="facets-' + d.key + '" hidden>' +
          facets.map(function (f) {
            var meta = fmap[f.key]
            var name = meta ? meta.name : f.key
            var en = meta ? meta.en : ''
            var note = meta ? meta.bands[facetBand(f.pct)] : ''
            return '<div class="facet" style="--c:' + d.color + ';--v:' + f.pct + '">' +
              '<div class="facet-head">' +
                '<span class="facet-name">' + esc(name) +
                  '<span lang="en">' + esc(en) + '</span></span>' +
                '<span class="facet-score">' + f.pct + '</span>' +
              '</div>' +
              '<div class="facet-track" role="img" aria-label="' + esc(name) + ' ' +
                f.pct + ' 分"><i></i></div>' +
              '<p class="facet-note">' + esc(note) + '</p>' +
            '</div>'
          }).join('') +
        '</div>' +
      '</article>'
    })

    el.domainList.innerHTML = html
    el.actionNote.textContent = ''
    show('result')

    var cards = el.domainList.querySelectorAll('.domain')
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        for (var i = 0; i < cards.length; i++) {
          (function (card, delay) {
            setTimeout(function () { card.classList.add('is-in') }, delay)
          })(cards[i], 70 * i)
        }
      })
    })
  }

  function summaryLine (domains, dmap) {
    var sorted = domains.slice().sort(function (a, b) { return b.pct - a.pct })
    var top = sorted[0]
    var low = sorted[sorted.length - 1]
    if (top.pct - low.pct < 8) {
      return '五个维度之间差距不大，你的画像相对均衡。<span class="nb">0–100</span>' +
        ' 是量表区间的换算值，不是人群百分位。'
    }
    return '在五个维度中，「' + esc(dmap[top.key].name) + '」最高（' + top.pct +
      '），「' + esc(dmap[low.key].name) + '」最低（' + low.pct +
      '）。<span class="nb">0–100</span> 是量表区间的换算值，不是人群百分位。'
  }

  /* ── 分享 / 导出 ──────────────────────────────────── */

  function answerCode () {
    return state.answers.map(function (a) { return a === null ? '0' : String(a) }).join('')
  }

  function shareUrl () {
    return location.origin + location.pathname + location.search +
      '#r=' + answerCode()
  }

  function textReport () {
    var scores = computeScores()
    var dmap = {}
    D.domains.forEach(function (d) { dmap[d.key] = d })
    var fmap = {}
    D.facets.forEach(function (f) { fmap[f.key] = f })
    var lines = ['IPIP-NEO-120 结果', '']
    scores.domains.forEach(function (s) {
      var d = dmap[s.key]
      var band = domainBand(s.pct)
      lines.push(d.name + '（' + d.key + '）  ' + s.pct + '/100  ' + band.label)
      scores.facets.filter(function (f) { return f.domain === s.key })
        .map(function (f) {
          var m = fmap[f.key]
          return '    ' + (m ? m.name : f.key) + '  ' + f.pct
        })
        .forEach(function (l) { lines.push(l) })
      lines.push('')
    })
    lines.push('0–100 为量表区间换算值，非人群百分位。')
    return lines.join('\n')
  }

  function toast (msg) {
    el.actionNote.textContent = msg
    setTimeout(function () {
      if (el.actionNote.textContent === msg) el.actionNote.textContent = ''
    }, 4000)
  }

  function copyText (text, okMsg) {
    function fallback () {
      var ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy'); toast(okMsg) } catch (e) { toast('复制失败，请手动选择') }
      document.body.removeChild(ta)
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast(okMsg) }, fallback)
    } else {
      fallback()
    }
  }

  function downloadJson () {
    var scores = computeScores()
    var payload = {
      instrument: 'IPIP-NEO-120',
      version: D.version,
      takenAt: new Date().toISOString(),
      answers: state.answers.slice(),
      domains: scores.domains,
      facets: scores.facets
    }
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    var url = URL.createObjectURL(blob)
    var a = document.createElement('a')
    a.href = url
    a.download = 'ipip-neo-120-result.json'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(function () { URL.revokeObjectURL(url) }, 1000)
    toast('已下载 JSON 文件')
  }

  /* ── 事件 ─────────────────────────────────────────── */

  el.startBtn.addEventListener('click', function () {
    var saved = loadSaved()
    var done = saved ? saved.answers.filter(function (a) { return a !== null }).length : 0
    if (done > 0 && !window.confirm('开始新的作答会清掉上次的记录，确定吗？')) return
    clearSaved()
    state.answers = new Array(N).fill(null)
    state.index = 0
    state.startedAt = Date.now()
    save()
    show('test')
    renderQuestion()
  })

  el.resumeBtn.addEventListener('click', function () {
    var saved = loadSaved()
    if (!saved) return
    state.answers = saved.answers.slice()
    state.startedAt = saved.startedAt || Date.now()
    var first = state.answers.findIndex(function (a) { return a === null })
    state.index = first < 0 ? N - 1 : first
    if (first < 0) { renderResult(); return }
    show('test')
    renderQuestion()
  })

  el.scale.addEventListener('click', function (e) {
    var btn = e.target.closest('.opt')
    if (!btn) return
    choose(Number(btn.dataset.v))
  })

  el.backBtn.addEventListener('click', function () { goTo(state.index - 1) })

  el.quitBtn.addEventListener('click', function () {
    save()
    show('intro')
    refreshResume()
    el.ctaNote.textContent = '进度已保存，可以随时继续。'
  })

  el.finishBtn.addEventListener('click', function () {
    if (state.answers.every(function (a) { return a !== null })) renderResult()
  })

  el.homeLink.addEventListener('click', function (e) {
    if (state.view === 'intro') return
    e.preventDefault()
    if (state.view === 'test') { save(); refreshResume() }
    show('intro')
  })

  el.domainList.addEventListener('click', function (e) {
    var btn = e.target.closest('.facet-toggle')
    if (!btn) return
    var panel = document.getElementById(btn.getAttribute('aria-controls'))
    var open = btn.getAttribute('aria-expanded') === 'true'
    btn.setAttribute('aria-expanded', String(!open))
    if (panel) panel.hidden = open
    btn.textContent = (open ? '展开 ' : '收起 ') +
      (panel ? panel.children.length : 6) + ' 个层面'
  })

  el.shareBtn.addEventListener('click', function () {
    copyText(shareUrl(), '链接已复制')
  })

  el.copyBtn.addEventListener('click', function () {
    copyText(textReport(), '文字结果已复制')
  })

  el.jsonBtn.addEventListener('click', downloadJson)

  el.retakeBtn.addEventListener('click', function () {
    if (!window.confirm('清空本次结果，重新作答？')) return
    clearSaved()
    state.answers = new Array(N).fill(null)
    state.index = 0
    state.startedAt = null
    if (location.hash) history.replaceState(null, '', location.pathname + location.search)
    show('intro')
    refreshResume()
  })

  document.addEventListener('keydown', function (e) {
    if (state.view !== 'test') return
    if (e.metaKey || e.ctrlKey || e.altKey) return
    if (e.key >= '1' && e.key <= '5') {
      e.preventDefault()
      choose(Number(e.key))
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      goTo(state.index - 1)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      goTo(state.index + 1)
    }
  })

  /* ── 启动 ─────────────────────────────────────────── */

  function esc (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    })
  }

  function fromHash () {
    var m = /^#r=(\d{120})$/.exec(location.hash)
    if (!m) return false
    var digits = m[1].split('').map(Number)
    if (digits.some(function (d) { return d < 1 || d > 5 })) return false
    state.answers = digits
    state.startedAt = state.startedAt || Date.now()
    renderResult()
    return true
  }

  renderDomainIndex()
  buildTicks()
  buildScale()
  refreshResume()

  if (!fromHash()) show('intro')
})()