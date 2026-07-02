const DEFAULT_PREVIEW_STATE = {
  enabled: false,
  quality: 'high',
  duration: 6,
}

function normalizePreviewState(state = {}) {
  return {
    enabled: state.enabled === true,
    quality: ['low', 'medium', 'high'].includes(state.quality) ? state.quality : DEFAULT_PREVIEW_STATE.quality,
    duration: [3, 6, 9, '3', '6', '9'].includes(state.duration) ? Number(state.duration) : DEFAULT_PREVIEW_STATE.duration,
  }
}

function buildMenuMarkup(version) {
  return `
    <style id="sevenZipAesCbcPreviewStyle">
      img[data-7z-aes-cbc-preview="thumb"] {
        width: 32px !important;
        height: 32px !important;
        min-width: 32px !important;
        max-width: 32px !important;
        flex: 0 0 32px;
        object-fit: cover;
        border-radius: 4px;
        background: rgba(127, 127, 127, 0.12);
        display: block;
      }
      [data-7z-aes-cbc-preview-icon="true"] {
        display: none !important;
      }
      #sevenZipAesCbcTopMenuRoot {
        position: fixed;
        z-index: 10010;
        top: 7px;
        left: 50%;
        width: 0;
        pointer-events: none;
        font-family: inherit;
      }
      #sevenZipAesCbcTopMenuRoot .sevenZipAesCbcTopMenuTrigger {
        pointer-events: auto;
        display: inline-flex;
        align-items: center;
        flex-wrap: nowrap;
        gap: 8px;
        width: max-content;
        max-width: calc(100vw - 24px);
        box-sizing: border-box;
        padding: 6px 10px;
        border: 1px solid rgba(22, 119, 255, 0.16);
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.95);
        box-shadow: 0 10px 28px rgba(15, 23, 42, 0.14);
        cursor: pointer;
        color: #1f2937;
        transform: translateX(-50%);
        white-space: nowrap;
      }
      #sevenZipAesCbcTopMenuRoot .sevenZipAesCbcTopMenuTrigger:hover {
        border-color: rgba(22, 119, 255, 0.35);
      }
      #sevenZipAesCbcTopMenuRoot .sevenZipAesCbcTopMenuLogoLink {
        display: block;
        flex: 0 0 auto;
      }
      #sevenZipAesCbcTopMenuRoot .sevenZipAesCbcTopMenuLogo {
        width: 40px;
        height: 40px;
        flex: 0 0 auto;
        display: block;
        object-fit: contain;
      }
      #sevenZipAesCbcTopMenuRoot .sevenZipAesCbcTopMenuText {
        display: flex;
        flex: 0 0 auto;
        flex-direction: column;
        align-items: center;
        line-height: 1.05;
        min-width: 74px;
      }
      #sevenZipAesCbcTopMenuRoot .sevenZipAesCbcTopMenuVersion {
        font-size: 11px;
        color: #6b7280;
      }
      #sevenZipAesCbcTopMenuRoot .sevenZipAesCbcTopMenuName {
        font-size: 10px;
        color: #1677ff;
        white-space: nowrap;
      }
      #sevenZipAesCbcTopMenuRoot .sevenZipAesCbcTopMenuToggle {
        height: 28px;
        min-width: 56px;
        padding: 0 10px;
        border: 1px solid #d8e0ea;
        border-radius: 8px;
        background: #f8fafc;
        color: #334155;
        cursor: pointer;
        font-size: 12px;
      }
      #sevenZipAesCbcTopMenuRoot .sevenZipAesCbcTopMenuToggle[data-active="true"] {
        background: #1677ff;
        border-color: #1677ff;
        color: #fff;
      }
      /* 暗色模式 */
      html.dark #sevenZipAesCbcTopMenuRoot .sevenZipAesCbcTopMenuTrigger {
        background: rgba(30, 41, 59, 0.95);
        border-color: rgba(22, 119, 255, 0.25);
        color: #e2e8f0;
        box-shadow: 0 10px 28px rgba(0, 0, 0, 0.4);
      }
      html.dark #sevenZipAesCbcTopMenuRoot .sevenZipAesCbcTopMenuTrigger:hover {
        border-color: rgba(22, 119, 255, 0.5);
      }
      html.dark #sevenZipAesCbcTopMenuRoot .sevenZipAesCbcTopMenuVersion {
        color: #94a3b8;
      }
      html.dark #sevenZipAesCbcTopMenuRoot .sevenZipAesCbcTopMenuToggle {
        border-color: #475569;
        background: #1e293b;
        color: #e2e8f0;
      }
      html.dark #sevenZipAesCbcTopMenuRoot .sevenZipAesCbcTopMenuToggle[data-active="true"] {
        background: #1677ff;
        border-color: #1677ff;
        color: #fff;
      }
    </style>
    <script>
      (function () {
        var sevenZipAesCbcPreviewVersion = ${JSON.stringify(String(version || ''))}
        var sevenZipAesCbcPreviewStorageKey = 'sevenZipAesCbcPreviewUiState'
        var sevenZipAesCbcPreviewDefaultState = ${JSON.stringify(DEFAULT_PREVIEW_STATE)}
        var sevenZipAesCbcPreviewPattern = /\\/7z-aes-cbc-preview\\/[^?#]+\\.gif(?:[?#]|$)/
        var sevenZipAesCbcPreviewByName = new Map()
        var sevenZipAesCbcPreviewByPath = new Map()
        var sevenZipAesCbcPreviewRawContent = []
        var sevenZipAesCbcPreviewScheduled = false
        var sevenZipAesCbcPreviewMenuOpen = false
        var sevenZipAesCbcPreviewMenuRoot = null
        var sevenZipAesCbcPreviewSaving = false
        var sevenZipAesCbcPreviewListLoading = false
        var sevenZipAesCbcPreviewLastListPath = ''
        var sevenZipAesCbcPreviewState = readSevenZipAesCbcPreviewState()

        function normalizeSevenZipAesCbcText(value) {
          return String(value || '').trim()
        }

        function decodeSevenZipAesCbcPath(value) {
          var text = normalizeSevenZipAesCbcText(value)
          try {
            return decodeURIComponent(text)
          } catch (e) {
            return text
          }
        }

        function getSevenZipAesCbcPathName(value) {
          var text = decodeSevenZipAesCbcPath(value)
          var index = text.lastIndexOf('/')
          return index >= 0 ? text.slice(index + 1) : text
        }

        function isSevenZipAesCbcPreviewThumb(value) {
          return sevenZipAesCbcPreviewPattern.test(normalizeSevenZipAesCbcText(value))
        }

        function normalizeSevenZipAesCbcPreviewState(state) {
          var next = state || {}
          var quality = ['low', 'medium', 'high'].includes(next.quality) ? next.quality : sevenZipAesCbcPreviewDefaultState.quality
          var duration = [3, 6, 9, '3', '6', '9'].includes(next.duration) ? Number(next.duration) : sevenZipAesCbcPreviewDefaultState.duration
          return {
            enabled: next.enabled === true,
            quality: quality,
            duration: duration,
          }
        }

        function readSevenZipAesCbcPreviewState() {
          try {
            var raw = window.localStorage.getItem(sevenZipAesCbcPreviewStorageKey)
            if (!raw) return normalizeSevenZipAesCbcPreviewState(sevenZipAesCbcPreviewDefaultState)
            return normalizeSevenZipAesCbcPreviewState(JSON.parse(raw))
          } catch (e) {
            return normalizeSevenZipAesCbcPreviewState(sevenZipAesCbcPreviewDefaultState)
          }
        }

        function saveSevenZipAesCbcPreviewState(nextState) {
          sevenZipAesCbcPreviewState = normalizeSevenZipAesCbcPreviewState(nextState)
          try {
            window.localStorage.setItem(sevenZipAesCbcPreviewStorageKey, JSON.stringify(sevenZipAesCbcPreviewState))
          } catch (e) {}
          renderSevenZipAesCbcPreviewMenuState()
          applySevenZipAesCbcPreviews()
        }

        function getSevenZipAesCbcPreviewConfigPath() {
          return decodeSevenZipAesCbcPath(window.location.pathname || '/')
        }

        function getSevenZipAesCbcPreviewListPath() {
          var path = getSevenZipAesCbcPreviewConfigPath()
          if (!path || path === '/' || path.indexOf('/@') === 0 || path.indexOf('/public/') === 0) return ''
          return path
        }

        function setSevenZipAesCbcPreviewStatus(text, type) {
          if (!sevenZipAesCbcPreviewMenuRoot) return
          var statusNode = sevenZipAesCbcPreviewMenuRoot.querySelector('[data-7z-aes-cbc-preview-status]')
          if (!statusNode) return
          statusNode.textContent = text || ''
          statusNode.setAttribute('data-type', type || '')
        }

        function mapSevenZipAesCbcPreviewServerState(preview) {
          return normalizeSevenZipAesCbcPreviewState({
            enabled: preview && preview.enabled,
            quality: preview && preview.quality,
            duration: preview && preview.duration,
          })
        }

        function loadSevenZipAesCbcPreviewConfig() {
          return fetch('/api/fs/7z-aes-cbc-preview-config', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ path: getSevenZipAesCbcPreviewConfigPath() }),
          })
            .then(function (response) {
              return response.json()
            })
            .then(function (result) {
              if (!result || result.code !== 200 || !result.data || !result.data.preview) {
                setSevenZipAesCbcPreviewStatus('未匹配 7z AES-CBC（AES-256）配置', 'warn')
                return
              }
              saveSevenZipAesCbcPreviewState(mapSevenZipAesCbcPreviewServerState(result.data.preview))
              setSevenZipAesCbcPreviewStatus('当前目录配置已载入', 'ok')
            })
            .catch(function () {
              setSevenZipAesCbcPreviewStatus('配置读取失败，使用本地设置', 'warn')
            })
        }

        function persistSevenZipAesCbcPreviewConfig(nextState) {
          if (sevenZipAesCbcPreviewSaving) return
          var normalized = normalizeSevenZipAesCbcPreviewState(nextState)
          saveSevenZipAesCbcPreviewState(normalized)
          sevenZipAesCbcPreviewSaving = true
          setSevenZipAesCbcPreviewStatus('保存中...', '')
          fetch('/api/fs/7z-aes-cbc-preview-config', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              action: 'save',
              path: getSevenZipAesCbcPreviewConfigPath(),
              sevenZipAesCbcPreview: normalized.enabled,
              sevenZipAesCbcPreviewQuality: normalized.quality,
              sevenZipAesCbcPreviewDurationSeconds: normalized.duration,
            }),
          })
            .then(function (response) {
              return response.json()
            })
            .then(function (result) {
              if (!result || result.code !== 200) {
                setSevenZipAesCbcPreviewStatus('保存失败', 'warn')
                return
              }
              if (result.data && result.data.preview) {
                saveSevenZipAesCbcPreviewState(mapSevenZipAesCbcPreviewServerState(result.data.preview))
              }
              setSevenZipAesCbcPreviewStatus('已保存，刷新列表中...', 'ok')
              // 触发 AList 刷新列表以应用新的预览配置
              refreshAListFileList()
            })
            .catch(function () {
              setSevenZipAesCbcPreviewStatus('保存失败', 'warn')
            })
            .finally(function () {
              sevenZipAesCbcPreviewSaving = false
            })
        }

        function resolveSevenZipAesCbcPreviewThumb(baseThumb) {
          if (!isSevenZipAesCbcPreviewThumb(baseThumb)) return null
          if (!sevenZipAesCbcPreviewState.enabled) return null
          try {
            var url = new URL(baseThumb, window.location.href)
            url.searchParams.set('quality', sevenZipAesCbcPreviewState.quality)
            url.searchParams.set('duration', String(sevenZipAesCbcPreviewState.duration))
            return url.pathname + url.search + url.hash
          } catch (e) {
            return baseThumb
          }
        }

        function setSevenZipAesCbcPreview(name, path, thumb) {
          if (!isSevenZipAesCbcPreviewThumb(thumb)) return
          var cleanName = decodeSevenZipAesCbcPath(name)
          var cleanPath = decodeSevenZipAesCbcPath(path)
          if (cleanName) sevenZipAesCbcPreviewByName.set(cleanName, thumb)
          if (cleanPath) {
            sevenZipAesCbcPreviewByPath.set(cleanPath, thumb)
            sevenZipAesCbcPreviewByName.set(getSevenZipAesCbcPathName(cleanPath), thumb)
          }
        }

        function scheduleSevenZipAesCbcPreviewApply() {
          if (sevenZipAesCbcPreviewScheduled) return
          sevenZipAesCbcPreviewScheduled = true
          var raf = window.requestAnimationFrame || function (fn) {
            return window.setTimeout(fn, 16)
          }
          raf(function () {
            sevenZipAesCbcPreviewScheduled = false
            applySevenZipAesCbcPreviews()
          })
        }

        function refreshSevenZipAesCbcPreviewCache() {
          sevenZipAesCbcPreviewByName.clear()
          sevenZipAesCbcPreviewByPath.clear()
          sevenZipAesCbcPreviewRawContent.forEach(function (item) {
            if (!item || item.is_dir || !isSevenZipAesCbcPreviewThumb(item.thumb)) return
            setSevenZipAesCbcPreview(item.name, item.path, item.thumb)
            setSevenZipAesCbcPreview(item.sevenZipAesCbcVirtualName, item.path, item.thumb)
            setSevenZipAesCbcPreview(item.name, item.sevenZipAesCbcPackagePath, item.thumb)
          })
          scheduleSevenZipAesCbcPreviewApply()
        }

        function readSevenZipAesCbcList(data) {
          var content = data && data.data && data.data.content
          sevenZipAesCbcPreviewRawContent = Array.isArray(content) ? content.slice() : []
          refreshSevenZipAesCbcPreviewCache()
        }

        function loadSevenZipAesCbcPreviewList() {
          var path = getSevenZipAesCbcPreviewListPath()
          if (!path || sevenZipAesCbcPreviewListLoading || sevenZipAesCbcPreviewLastListPath === path) return
          sevenZipAesCbcPreviewListLoading = true
          sevenZipAesCbcPreviewLastListPath = path
          fetch('/api/fs/list', {
            method: 'POST',
            headers: { 'content-type': 'application/json;charset=UTF-8' },
            body: JSON.stringify({ path: path, password: '', page: 1, per_page: 50, refresh: false }),
          })
            .then(function (response) {
              return response.json()
            })
            .then(readSevenZipAesCbcList)
            .catch(function () {
              sevenZipAesCbcPreviewLastListPath = ''
            })
            .finally(function () {
              sevenZipAesCbcPreviewListLoading = false
            })
        }

        function resetSevenZipAesCbcPreviewListPath() {
          var path = getSevenZipAesCbcPreviewListPath()
          if (path !== sevenZipAesCbcPreviewLastListPath) {
            sevenZipAesCbcPreviewLastListPath = ''
          }
        }

        function inspectSevenZipAesCbcResponse(url, response) {
          if (!isSevenZipAesCbcListUrl(url) || !response || typeof response.clone !== 'function') return
          response
            .clone()
            .json()
            .then(readSevenZipAesCbcList)
            .catch(function () {})
        }

        function inspectSevenZipAesCbcText(url, text) {
          if (!isSevenZipAesCbcListUrl(url)) return
          try {
            readSevenZipAesCbcList(JSON.parse(text))
          } catch (e) {}
        }

        function isSevenZipAesCbcListUrl(url) {
          try {
            return new URL(url, window.location.href).pathname === '/api/fs/list'
          } catch (e) {
            return false
          }
        }

        function getSevenZipAesCbcRequestUrl(input) {
          if (typeof input === 'string') return input
          return input && input.url ? input.url : ''
        }

        function getSevenZipAesCbcAnchorName(anchor) {
          var titleNode = anchor.querySelector('.name[title]')
          var title = titleNode && titleNode.getAttribute('title')
          if (title) return decodeSevenZipAesCbcPath(title)
          var nameNode = anchor.querySelector('.filename-content')
          return nameNode ? decodeSevenZipAesCbcPath(nameNode.textContent) : ''
        }

        function getSevenZipAesCbcAnchorPath(anchor) {
          try {
            return decodeSevenZipAesCbcPath(new URL(anchor.getAttribute('href') || '', window.location.href).pathname)
          } catch (e) {
            return ''
          }
        }

        function getSevenZipAesCbcAnchorThumb(anchor) {
          var anchorPath = getSevenZipAesCbcAnchorPath(anchor)
          var anchorName = getSevenZipAesCbcAnchorName(anchor) || getSevenZipAesCbcPathName(anchorPath)
          return (
            sevenZipAesCbcPreviewByPath.get(anchorPath) ||
            sevenZipAesCbcPreviewByName.get(anchorName) ||
            sevenZipAesCbcPreviewByName.get(getSevenZipAesCbcPathName(anchorPath))
          )
        }

        function renderSevenZipAesCbcPreviewMenuState() {
          if (!sevenZipAesCbcPreviewMenuRoot) return
          var toggleButton = sevenZipAesCbcPreviewMenuRoot.querySelector('[data-7z-aes-cbc-preview-toggle]')
          if (toggleButton) {
            toggleButton.textContent = sevenZipAesCbcPreviewState.enabled ? '关闭预览' : '开启预览'
            toggleButton.setAttribute('data-active', sevenZipAesCbcPreviewState.enabled ? 'true' : 'false')
          }
        }

        function refreshAListFileList() {
          location.reload()
        }

        function toggleSevenZipAesCbcPreviewMenu(open) {
          if (!sevenZipAesCbcPreviewMenuRoot) return
          sevenZipAesCbcPreviewMenuOpen = typeof open === 'boolean' ? open : !sevenZipAesCbcPreviewMenuOpen
          var panel = sevenZipAesCbcPreviewMenuRoot.querySelector('[data-7z-aes-cbc-preview-panel]')
          if (panel) panel.hidden = !sevenZipAesCbcPreviewMenuOpen
          sevenZipAesCbcPreviewMenuRoot.setAttribute('data-open', sevenZipAesCbcPreviewMenuOpen ? 'true' : 'false')
        }

        function applySevenZipAesCbcPreviews() {
          resetSevenZipAesCbcPreviewListPath()
          if (sevenZipAesCbcPreviewRawContent.length === 0) {
            loadSevenZipAesCbcPreviewList()
          }
          var anchors = document.querySelectorAll('a.name-box')
          anchors.forEach(function (anchor) {
            var baseThumb = getSevenZipAesCbcAnchorThumb(anchor)
            var thumb = resolveSevenZipAesCbcPreviewThumb(baseThumb)
            if (!thumb) {
              var staleImg = anchor.querySelector('img[data-7z-aes-cbc-preview="thumb"]')
              if (staleImg) staleImg.style.display = 'none'
              var staleIcon = anchor.querySelector('[data-7z-aes-cbc-preview-icon="true"]')
              if (staleIcon) staleIcon.style.display = ''
              return
            }

            var img = anchor.querySelector('img[data-7z-aes-cbc-preview="thumb"]')
            if (img) {
              if (!img.getAttribute('data-7z-aes-cbc-preview-error-bound')) {
                img.setAttribute('data-7z-aes-cbc-preview-error-bound', 'true')
                var fallbackIcon = anchor.querySelector('[data-7z-aes-cbc-preview-icon="true"]')
                img.addEventListener('error', function () {
                  img.style.display = 'none'
                  if (fallbackIcon) {
                    fallbackIcon.style.display = ''
                    fallbackIcon.removeAttribute('data-7z-aes-cbc-preview-icon')
                  }
                })
              }
              if (img.getAttribute('src') !== thumb) img.setAttribute('src', thumb)
              img.style.display = ''
              var pairedIcon = anchor.querySelector('[data-7z-aes-cbc-preview-icon="true"]')
              if (pairedIcon) pairedIcon.style.display = 'none'
              return
            }

            var icon = anchor.querySelector('svg.icon, .hope-icon')
            if (!icon) return
            img = document.createElement('img')
            img.setAttribute('data-7z-aes-cbc-preview', 'thumb')
            img.setAttribute('alt', '')
            img.setAttribute('loading', 'lazy')
            img.setAttribute('decoding', 'async')
            img.setAttribute('src', thumb)
            img.addEventListener('error', function () {
              img.style.display = 'none'
              icon.style.display = ''
              icon.removeAttribute('data-7z-aes-cbc-preview-icon')
            })
            icon.setAttribute('data-7z-aes-cbc-preview-icon', 'true')
            icon.style.display = 'none'
            icon.parentNode.insertBefore(img, icon)
          })
        }

        function buildSevenZipAesCbcPreviewMenu() {
          var root = document.getElementById('sevenZipAesCbcTopMenuRoot')
          if (!root || root.getAttribute('data-sevenzip-built') === 'true') {
            sevenZipAesCbcPreviewMenuRoot = root
            renderSevenZipAesCbcPreviewMenuState()
            return
          }
          root.setAttribute('data-sevenzip-built', 'true')
          root.innerHTML =
            '<div class="sevenZipAesCbcTopMenuTrigger" data-7z-aes-cbc-preview-trigger="true">' +
            '  <a class="sevenZipAesCbcTopMenuLogoLink" href="/public/index.html#/dashboard" target="_blank" rel="noreferrer">' +
            '    <img class="sevenZipAesCbcTopMenuLogo" src="/public/logo.png" alt="管理" />' +
            '  </a>' +
            '  <div class="sevenZipAesCbcTopMenuText">' +
            '    <span class="sevenZipAesCbcTopMenuVersion">V.' +
            sevenZipAesCbcPreviewVersion +
            '</span>' +
            '    <span class="sevenZipAesCbcTopMenuName">7z AES-CBC</span>' +
            '  </div>' +
            '  <button type="button" class="sevenZipAesCbcTopMenuToggle" data-7z-aes-cbc-preview-toggle="true"></button>' +
            '</div>'

          var toggleButton = root.querySelector('[data-7z-aes-cbc-preview-toggle]')

          if (toggleButton) {
            toggleButton.addEventListener('click', function (event) {
              event.preventDefault()
              event.stopPropagation()
              persistSevenZipAesCbcPreviewConfig({
                enabled: !sevenZipAesCbcPreviewState.enabled,
                quality: sevenZipAesCbcPreviewState.quality,
                duration: sevenZipAesCbcPreviewState.duration,
              })
            })
          }

          sevenZipAesCbcPreviewMenuRoot = root
          renderSevenZipAesCbcPreviewMenuState()
          toggleSevenZipAesCbcPreviewMenu(false)
        }

        if (window.fetch) {
          var rawSevenZipAesCbcFetch = window.fetch
          window.fetch = function () {
            var url = getSevenZipAesCbcRequestUrl(arguments[0])
            return rawSevenZipAesCbcFetch.apply(this, arguments).then(function (response) {
              inspectSevenZipAesCbcResponse(url, response)
              return response
            })
          }
        }

        if (window.XMLHttpRequest) {
          var rawSevenZipAesCbcOpen = window.XMLHttpRequest.prototype.open
          var rawSevenZipAesCbcSend = window.XMLHttpRequest.prototype.send
          window.XMLHttpRequest.prototype.open = function (method, url) {
            this.__sevenZipAesCbcPreviewUrl = url
            return rawSevenZipAesCbcOpen.apply(this, arguments)
          }
          window.XMLHttpRequest.prototype.send = function () {
            this.addEventListener('load', function () {
              if (!isSevenZipAesCbcListUrl(this.__sevenZipAesCbcPreviewUrl)) return
              if (this.responseType === 'json') {
                readSevenZipAesCbcList(this.response)
                return
              }
              if (!this.responseType || this.responseType === 'text') {
                inspectSevenZipAesCbcText(this.__sevenZipAesCbcPreviewUrl, this.responseText)
              }
            })
            return rawSevenZipAesCbcSend.apply(this, arguments)
          }
        }

        function bootstrapSevenZipAesCbcPreviewUi() {
          buildSevenZipAesCbcPreviewMenu()
          loadSevenZipAesCbcPreviewConfig()
          loadSevenZipAesCbcPreviewList()
          if (window.MutationObserver) {
            new MutationObserver(scheduleSevenZipAesCbcPreviewApply).observe(document.body, {
              childList: true,
              subtree: true,
            })
          }
          scheduleSevenZipAesCbcPreviewApply()
        }

        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', bootstrapSevenZipAesCbcPreviewUi)
        } else {
          bootstrapSevenZipAesCbcPreviewUi()
        }
      })()
    </script>
    <div id="sevenZipAesCbcTopMenuRoot"></div>
  `
}

export { normalizePreviewState as normalizeSevenZipAesCbcPreviewUiState }
export function getSevenZipAesCbcPreviewInjectedBody(version) {
  return `<body>${buildMenuMarkup(version)}`
}
