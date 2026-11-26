/* IPIP-NEO-120 — 前端逻辑
   无依赖、无请求：作答、计分、结果全部在本地完成。
   双语：界面文案在 i18n.js，量表文字在 data.js（每条都带 zh / en）。 */
(function () {
  'use strict'

  var D = window.NEO_DATA
  var I18N = window.NEO_I18N
  var QS = D.questions
  var N = QS.length
  var STORE_KEY = 'ipip-neo-120:v1'
  var LANG_KEY = 'ipip-neo-120:lang'

  var LANGS = ['zh', 'en']
  var LANG = 'zh'

  var DOMAIN_BANDS = [
    { lt: 20, key: 'vlow', label: 'band.vlow' },
    { lt: 40, key: 'low', label: 'band.low' },
    { lt: 60, key: 'mid', label: 'band.mid' },
    { lt: 80, key: 'high', label: 'band.high' },
    { lt: Infinity, key: 'vhigh', label: 'band.vhigh' }
  ]

  var $ = function (sel, root) { return (root || document).querySelector(sel) }
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)) }

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
    qSub: $('#qSub'),
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
    homeLink: $('#homeLink'),
    metaDesc: $('#metaDesc')
  }

  var state = {
    answers: new Array(N).fill(null),
    index: 0,
    startedAt: null,
    view: 'intro'
  }

  var locked = false
  var tickEls = []

  /* ── 文案 ─────────────────────────────────────────── */

  function t (key, vars) {
    var table = I18N[LANG] || I18N.zh
    var s = table[key]
    if (s === undefined) s = I18N.zh[key]
    if (s === undefined) return key
    if (vars) {
      s = s.replace(/\{(\w+)\}/g, function (m, k) {
        return Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : m
      })
    }
    return s
  }

  function applyStatic () {
    document.documentElement.lang = LANG === 'zh' ? 'zh-CN' : 'en'
    document.title = t('doc.title')
    if (el.metaDesc) el.metaDesc.setAttribute('content', t('doc.desc'))
    $$('[data-i18n]').forEach(function (node) {
      node.innerHTML = t(node.getAttribute('data-i18n'))
    })
    $$('.lang-btn').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.lang === LANG))
    })
  }

  function setLang (next) {
    if (LANGS.indexOf(next) < 0 || next === LANG) return
    var expanded = $$('.facet-toggle[aria-expanded="true"]')
      .map(function (b) { return b.getAttribute('aria-controls') })
    LANG = next
    try { localStorage.setItem(LANG_KEY, LANG) } catch (e) {}

    applyStatic()
    renderDomainIndex()
    buildScale()
    refreshResume()

    if (state.view === 'test') {
      renderQuestion()
    } else if (state.view === 'result') {
      renderResult({ animate: false })
      expanded.forEach(function (id) {
        var btn = $('.facet-toggle[aria-controls="' + id + '"]')
        if (btn) btn.click()
      })
    }
  }

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
        '<dd class="domain-index-name">' + esc(d.names[LANG]) + '</dd>' +
        '<dd class="domain-index-count">' + esc(t('domain.count', { n: 6 })) + '</dd>' +
        '<dd class="domain-index-gloss">' + esc(d.gloss[LANG]) + '</dd>' +
        '</div>'
    })
    el.domainIndex.innerHTML = html
  }

  function refreshResume () {
    var saved = loadSaved()
    var done = saved ? saved.answers.filter(function (a) { return a !== null }).length : 0
    if (done >= N) {
      el.resumeBtn.hidden = false
      el.resumeBtn.textContent = t('intro.viewLast')
      el.ctaNote.textContent = t('intro.noteDone')
    } else if (done > 0) {
      el.resumeBtn.hidden = false
      el.resumeBtn.textContent = t('intro.resume', { n: done })
      el.ctaNote.textContent = t('intro.noteSaved')
    } else {
      el.resumeBtn.hidden = true
      el.ctaNote.textContent = t('intro.note')
    }
  }

  /* ── 作答页 ───────────────────────────────────────── */

  function buildTicks () {
    var frag = document.createDocumentFragment()
    tickEls = []
    for (var i = 0; i < N; i++) {
      var node = document.createElement('span')
      node.className = 'tick'
      frag.appendChild(node)
      tickEls.push(node)
    }
    el.ticks.appendChild(frag)
  }

  function buildScale () {
    var html = ''
    for (var v = 1; v <= 5; v++) {
      html += '<button type="button" class="opt" role="radio" aria-checked="false" data-v="' + v + '">' +
        '<span class="opt-num">' + v + '</span>' +
        '<span class="opt-label">' + esc(t('likert.' + v)) + '</span>' +
        '</button>'
    }
    el.scale.innerHTML = html
  }

  function updateHud () {
    var done = state.answers.filter(function (a) { return a !== null }).length
    el.hudNow.textContent = String(state.index + 1)
    el.hudDone.textContent = t('test.answeredN', { n: done })
    el.finishBtn.hidden = done < N
    for (var i = 0; i < N; i++) {
      tickEls[i].classList.toggle('is-done', state.answers[i] !== null)
      tickEls[i].classList.toggle('is-current', i === state.index)
    }
  }

  function renderQuestion () {
    var q = QS[state.index]
    el.qText.textContent = q.text[LANG]

    // 英文模式只用原文，不挂中文翻译作对照；中文模式才附注英文原文
    if (LANG === 'zh') {
      el.qSub.textContent = q.text.en
      el.qSub.setAttribute('lang', 'en')
      el.qSub.hidden = false
    } else {
      el.qSub.textContent = ''
      el.qSub.hidden = true
    }

    var cur = state.answers[state.index]
    $$('.opt', el.scale).forEach(function (b) {
      b.setAttribute('aria-checked', String(cur !== null && Number(b.dataset.v) === cur))
    })

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
    var domainRaw = {}

    QS.forEach(function (q, idx) {
      var r = state.answers[idx]
      if (r === null) return
      var s = q.k === 1 ? r : 6 - r
      var fk = q.d + q.f
      facetRaw[fk] = (facetRaw[fk] || 0) + s
      domainRaw[q.d] = (domainRaw[q.d] || 0) + s
    })

    var domains = D.domains.map(function (d) {
      var raw = domainRaw[d.key] || 0
      return { key: d.key, raw: raw, pct: Math.round((raw - 24) / 96 * 100) }
    })

    var facets = D.facets.map(function (f) {
      var raw = facetRaw[f.key] || 0
      return { key: f.key, domain: f.domain, raw: raw, pct: Math.round((raw - 4) / 16 * 100) }
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

  function renderResult (opts) {
    var animate = !opts || opts.animate !== false
    var scores = computeScores()

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
      var altName = LANG === 'zh'
        ? '<span class="domain-abbr" lang="en">' + esc(d.names.en) + '</span>'
        : ''

      html += '<article class="domain" data-key="' + d.key + '"' +
        ' style="--c:' + d.color + ';--v:' + s.pct + '">' +
        '<div class="domain-head">' +
          '<span class="domain-key">' + d.key + '</span>' +
          '<h2 class="domain-name">' + esc(d.names[LANG]) + altName + '</h2>' +
          '<span class="domain-score">' + s.pct + '</span>' +
        '</div>' +
        '<div class="track" role="img" aria-label="' +
          esc(t('result.aria.track', { name: d.names[LANG], pct: s.pct })) + '">' +
          '<div class="track-fill"></div><div class="track-mid"></div>' +
        '</div>' +
        '<div class="track-scale"><span>0</span><span>50</span><span>100</span></div>' +
        '<p class="domain-band"><b>' + esc(t(band.label)) + '</b>' +
          esc(d.bands[LANG][band.key]) + '</p>' +
        '<button type="button" class="facet-toggle" aria-expanded="false"' +
          ' aria-controls="facets-' + d.key + '">' +
          esc(t('result.expand', { n: facets.length })) + '</button>' +
        '<div class="facets" id="facets-' + d.key + '" hidden>' +
          facets.map(function (f) {
            var meta = fmap[f.key]
            var name = meta ? meta.names[LANG] : f.key
            var sub = (meta && LANG === 'zh')
              ? '<span lang="en">' + esc(meta.names.en) + '</span>'
              : ''
            var note = meta ? meta.bands[LANG][facetBand(f.pct)] : ''
            return '<div class="facet" style="--c:' + d.color + ';--v:' + f.pct + '">' +
              '<div class="facet-head">' +
                '<span class="facet-name">' + esc(name) + sub + '</span>' +
                '<span class="facet-score">' + f.pct + '</span>' +
              '</div>' +
              '<div class="facet-track" role="img" aria-label="' +
                esc(t('result.aria.facet', { name: name, pct: f.pct })) + '"><i></i></div>' +
              '<p class="facet-note">' + esc(note) + '</p>' +
            '</div>'
          }).join('') +
        '</div>' +
      '</article>'
    })

    el.domainList.innerHTML = html
    el.actionNote.textContent = ''
    show('result')

    if (!animate) {
      $$('.domain', el.domainList).forEach(function (card) { card.classList.add('is-in') })
      return
    }
    var cards = $$('.domain', el.domainList)
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        cards.forEach(function (card, i) {
          setTimeout(function () { card.classList.add('is-in') }, 70 * i)
        })
      })
    })
  }

  function summaryLine (domains, dmap) {
    var sorted = domains.slice().sort(function (a, b) { return b.pct - a.pct })
    var top = sorted[0]
    var low = sorted[sorted.length - 1]
    if (top.pct - low.pct < 8) return t('result.balance')
    return t('result.toplow', {
      top: esc(dmap[top.key].names[LANG]),
      a: top.pct,
      low: esc(dmap[low.key].names[LANG]),
      b: low.pct
    })
  }

  /* ── 分享 / 导出 ──────────────────────────────────── */

  function answerCode () {
    return state.answers.map(function (a) { return a === null ? '0' : String(a) }).join('')
  }

  function shareUrl () {
    return location.origin + location.pathname + location.search + '#r=' + answerCode()
  }

  function textReport () {
    var scores = computeScores()
    var dmap = {}
    D.domains.forEach(function (d) { dmap[d.key] = d })
    var fmap = {}
    D.facets.forEach(function (f) { fmap[f.key] = f })

    var lines = [t('result.reportHead'), '']
    scores.domains.forEach(function (s) {
      var d = dmap[s.key]
      lines.push(d.names[LANG] + ' (' + d.key + ')  ' + s.pct + '/100  ' + t(domainBand(s.pct).label))
      scores.facets.filter(function (f) { return f.domain === s.key })
        .forEach(function (f) {
          var m = fmap[f.key]
          lines.push('    ' + (m ? m.names[LANG] : f.key) + '  ' + f.pct)
        })
      lines.push('')
    })
    lines.push(t('result.reportFoot'))
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
      try { document.execCommand('copy'); toast(okMsg) } catch (e) { toast(t('toast.fail')) }
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
      domains: scores.domains.map(function (s) {
        return { key: s.key, name: D.domains.filter(function (d) { return d.key === s.key })[0].names.en,
                 raw: s.raw, pct: s.pct }
      }),
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
    toast(t('toast.json'))
  }

  /* ── 事件 ─────────────────────────────────────────── */

  el.startBtn.addEventListener('click', function () {
    var saved = loadSaved()
    var done = saved ? saved.answers.filter(function (a) { return a !== null }).length : 0
    if (done > 0 && !window.confirm(t('intro.confirmRestart'))) return
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
    if (first < 0) { renderResult(); return }
    state.index = first
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
    el.ctaNote.textContent = t('intro.noteQuit')
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
    btn.textContent = t(open ? 'result.expand' : 'result.collapse',
      { n: panel ? panel.children.length : 6 })
  })

  el.shareBtn.addEventListener('click', function () { copyText(shareUrl(), t('toast.share')) })
  el.copyBtn.addEventListener('click', function () { copyText(textReport(), t('toast.copy')) })
  el.jsonBtn.addEventListener('click', downloadJson)

  el.retakeBtn.addEventListener('click', function () {
    if (!window.confirm(t('result.confirmRetake'))) return
    clearSaved()
    state.answers = new Array(N).fill(null)
    state.index = 0
    state.startedAt = null
    if (location.hash) history.replaceState(null, '', location.pathname + location.search)
    show('intro')
    refreshResume()
    el.ctaNote.textContent = t('intro.note')
  })

  $$('.lang-btn').forEach(function (b) {
    b.addEventListener('click', function () { setLang(b.dataset.lang) })
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

  try {
    var stored = localStorage.getItem(LANG_KEY)
    if (LANGS.indexOf(stored) >= 0) LANG = stored
  } catch (e) {}

  applyStatic()
  renderDomainIndex()
  buildTicks()
  buildScale()
  refreshResume()

  if (!fromHash()) show('intro')
})()