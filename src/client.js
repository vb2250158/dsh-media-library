/** Workspace media browsing through public DSH menus, panels and controls. */
window.__ModuleLoader__.load({
  id: 'dsh-media-library',
  factory: require => {
    const React = require('react'), h = React.createElement
    const { Button, Input } = require('@deepseek-ai/dsh-client-ui-primitives')
    const namespace = 'plugins.media-library'
    const zh = {
      title: '媒体库', set: '设为媒体库', open: '打开媒体库', remove: '取消媒体库', menuFailed: '媒体库操作未完成，请重试',
      emptyProjects: '在左侧项目上右键，选择「设为媒体库」。', projects: '媒体库项目', back: '返回聊天', loading: '正在读取…', refresh: '刷新', retry: '重试',
      parent: '上一层', root: '项目目录', noFiles: '此目录没有可浏览的媒体或子目录', previousPage: '上一页', nextPage: '下一页', page: '第', pageSuffix: '页', folder: '目录', video: '视频', audio: '音频', image: '图片',
      tags: '标签', tagHelp: '用逗号分隔标签', saveTags: '保存标签', saving: '正在保存…', saved: '标签已保存', close: '关闭预览', previewFailed: '浏览器无法播放或显示此媒体，可换用支持的媒体格式',
      requestFailed: '读取未完成，请重试', changed: '目录已变化，请刷新后继续', unavailable: '此项目已移出媒体库，请返回项目列表', invalidTags: '最多填写 100 个标签，每个标签不超过 100 个字符', indexLimit: '视频索引超过容量上限，原索引已保留', someFolders: '部分文件夹读取或索引更新未确认，请检查后刷新',
      fileGone: '媒体文件已不存在，请刷新目录', denied: '无法访问该目录或文件', failedSave: '标签保存未确认，请刷新后核对', browse: '浏览', bytes: '字节', removed: '媒体库登记已取消，原文件和标签保留',
      allVideos: '全部视频', uncategorized: '未分类', all: '全部', category: '标签分类', newCategory: '新增分类', newTag: '新增标签', categoryName: '分类名称', tagName: '标签名称', add: '添加', scanning: '正在扫描视频…', noVideos: '没有找到视频', noCover: '暂无封面', duplicate: '分类或标签名称已存在', sort: '排序', sortUpdated: '更新时间（新到旧）', sortName: '名称（A 到 Z）', sortSize: '文件大小（大到小）', settings: '设置', done: '完成', folders: '媒体文件夹', addFolder: '添加文件夹', removeFolder: '移除', folderPath: '文件夹路径', folderHelp: '可以添加多个文件夹；移除不会删除原视频和标签', noFolders: '请在设置中添加媒体文件夹', folderEmpty: '尚未添加文件夹', search: '搜索视频', searchPlaceholder: '按文件名搜索', clearSearch: '清除搜索', videoCount: '部视频', noMatch: '没有符合条件的视频', resetFilters: '清除筛选', chooseFolders: '添加媒体文件夹', categoryEmpty: '尚未创建分类', removeNamed: '移除文件夹',
    }
    const en = {
      title: 'Media library', set: 'Use as media library', open: 'Open media library', remove: 'Remove media library designation', menuFailed: 'The media library action did not complete. Retry.',
      emptyProjects: 'Right-click a project in the sidebar and choose “Use as media library”.', projects: 'Media projects', back: 'Back to chat', loading: 'Loading…', refresh: 'Refresh', retry: 'Retry',
      parent: 'Up one level', root: 'Project directory', noFiles: 'No supported media or subdirectories here.', previousPage: 'Previous page', nextPage: 'Next page', page: 'Page', pageSuffix: '', folder: 'Directory', video: 'Video', audio: 'Audio', image: 'Image',
      tags: 'Tags', tagHelp: 'Separate tags with commas', saveTags: 'Save tags', saving: 'Saving…', saved: 'Tags saved', close: 'Close preview', previewFailed: 'This browser cannot play or display this media. Use a supported format.',
      requestFailed: 'Could not read this item. Retry.', changed: 'The directory changed. Refresh before continuing.', unavailable: 'This project is no longer a media library. Return to the project list.', invalidTags: 'Use up to 100 tags, each no longer than 100 characters.', indexLimit: 'The video index exceeds its capacity. The previous index was retained.', someFolders: 'Some folder reads or index updates could not be confirmed. Check the folders and refresh.',
      fileGone: 'This media file no longer exists. Refresh the directory.', denied: 'This directory or file cannot be accessed.', failedSave: 'The tag save is unconfirmed. Refresh to check.', browse: 'Browse', bytes: 'bytes', removed: 'The designation was removed. Files and tags are retained.',
      allVideos: 'All videos', uncategorized: 'Uncategorized', all: 'All', category: 'Tag categories', newCategory: 'New category', newTag: 'New tag', categoryName: 'Category name', tagName: 'Tag name', add: 'Add', scanning: 'Scanning videos…', noVideos: 'No videos found', noCover: 'No cover', duplicate: 'The category or tag name already exists.', sort: 'Sort', sortUpdated: 'Recently updated', sortName: 'Name (A to Z)', sortSize: 'Size (largest first)', settings: 'Settings', done: 'Done', folders: 'Media folders', addFolder: 'Add folder', removeFolder: 'Remove', folderPath: 'Folder path', folderHelp: 'Add multiple folders. Removing one retains its videos and tags.', noFolders: 'Add a media folder in Settings.', folderEmpty: 'No folders added', search: 'Search videos', searchPlaceholder: 'Search by file name', clearSearch: 'Clear search', videoCount: 'videos', noMatch: 'No videos match these filters', resetFilters: 'Clear filters', chooseFolders: 'Add media folders', categoryEmpty: 'No categories yet', removeNamed: 'Remove folder',
    }

    /** Read one owner-authenticated endpoint; caller owns request cancellation. */
    async function request(path, { body, signal, timeoutMs = 20000 } = {}) {
      let response
      try {
        response = await fetch(`/media-library/${path}`, {
          method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin',
          signal: AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(signal ? [signal] : [])]),
          headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        })
      } catch (error) {
        if (error.name === 'AbortError' || signal?.aborted) throw error
        throw Object.assign(new Error('Media request failed'), { code: 'MEDIA_REQUEST_FAILED' })
      }
      let envelope
      try { envelope = await response.json() }
      catch (_error) { throw Object.assign(new Error('Invalid media response'), { code: 'MEDIA_REQUEST_FAILED' }) }
      if (!response.ok || envelope?.ok !== true) {
        throw Object.assign(new Error('Media request rejected'), { code: envelope?.error?.code ?? 'MEDIA_REQUEST_FAILED' })
      }
      return envelope.data
    }

    /** Keep panel selection window-local; library membership belongs to the Host. */
    function selectionStore() {
      let selected = null
      const listeners = new Set()
      return {
        subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) },
        getSnapshot: () => selected,
        select: workspaceId => { selected = workspaceId; for (const listener of listeners) listener() },
      }
    }

    function errorKey(error) {
      if (error.code === 'MEDIA_DIRECTORY_CHANGED') return 'changed'
      if (['MEDIA_PROJECT_DISABLED', 'MEDIA_PROJECT_NOT_FOUND', 'MEDIA_WORKSPACE_NOT_FOUND', 'MEDIA_NOT_ENABLED', 'MEDIA_WORKSPACE_MISSING'].includes(error.code)) return 'unavailable'
      if (['MEDIA_NOT_FOUND', 'MEDIA_FILE_CHANGED', 'MEDIA_DIRECTORY_MISSING', 'ENOENT'].includes(error.code)) return 'fileGone'
      if (error.code === 'MEDIA_TAG_EXISTS' || error.code === 'MEDIA_CATEGORY_EXISTS') return 'duplicate'
      if (error.code === 'MEDIA_INDEX_LIMIT' || error.code === 'MEDIA_CATALOG_LIMIT') return 'indexLimit'
      if (['MEDIA_PATH_DENIED', 'MEDIA_ACCESS_DENIED', 'MEDIA_OUTSIDE_ROOT', 'MEDIA_LINK_REFUSED', 'MEDIA_NOT_READABLE', 'MEDIA_INVALID_ROOT', 'EACCES', 'EPERM'].includes(error.code)) return 'denied'
      return 'requestFailed'
    }

    function formatSize(size, t) {
      if (!Number.isFinite(size) || size < 0) return ''
      if (size < 1024) return `${size} ${t('bytes')}`
      const units = ['KiB', 'MiB', 'GiB', 'TiB']
      let value = size / 1024, unit = 0
      while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++ }
      return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value)} ${units[unit]}`
    }

    /** One transient media preview; native media elements own decoding and range reads. */
    function Preview({ item, workspaceId, categories = [], t, onClose, onTagsChanged }) {
      const [draft, setDraft] = React.useState(item.tags.join(', '))
      const [busy, setBusy] = React.useState(false), [saved, setSaved] = React.useState(false)
      const [error, setError] = React.useState(''), [mediaError, setMediaError] = React.useState(false)
      const lifetime = React.useRef(null), write = React.useRef(null)
      React.useEffect(() => {
        const controller = new AbortController(); lifetime.current = controller
        return () => { controller.abort(); write.current?.abort() }
      }, [])
      const tags = [...new Set(draft.split(/[,，]/).map(value => value.trim()).filter(Boolean))]
      const changed = JSON.stringify(tags) !== JSON.stringify(item.tags)
      const save = async () => {
        if (busy || !changed) return
        if (tags.length > 100 || tags.some(tag => tag.length > 100)) { setError('invalidTags'); return }
        const controller = new AbortController(); write.current = controller
        setBusy(true); setError(''); setSaved(false)
        try {
          const add = tags.filter(tag => !item.tags.includes(tag)), remove = item.tags.filter(tag => !tags.includes(tag))
          const result = await request('tags/edit', { body: { workspaceId, sourceId: item.sourceId, path: item.path, add, remove }, signal: controller.signal })
          if (controller.signal.aborted || lifetime.current?.signal.aborted) return
          onTagsChanged(item.path, result.tags)
          setDraft(result.tags.join(', ')); setSaved(true)
        } catch (error) {
          if (!controller.signal.aborted && !lifetime.current?.signal.aborted) setError('failedSave')
        } finally {
          if (!controller.signal.aborted && !lifetime.current?.signal.aborted) setBusy(false)
        }
      }
      const url = `/media-library/file?${new URLSearchParams({ workspaceId, sourceId: item.sourceId ?? '', path: item.path })}`
      return h('section', { className: 'dsh-media-preview', 'aria-label': item.name, 'aria-busy': busy },
        h('div', { className: 'dsh-media-heading' }, h('h2', null, item.name), h(Button, { variant: 'ghost', disabled: busy, onClick: onClose }, t('close'))),
        item.kind === 'image' ? h('img', { src: url, alt: item.name, onError: () => setMediaError(true) })
          : h(item.kind === 'audio' ? 'audio' : 'video', { src: url, controls: true, preload: 'metadata', onError: () => setMediaError(true) }),
        mediaError ? h('p', { role: 'alert' }, t('previewFailed')) : null,
        h('label', { className: 'dsh-media-tags' }, h('span', null, t('tags')), h(Input, {
          value: draft, disabled: busy, 'aria-label': t('tags'), placeholder: t('tagHelp'),
          onChange: event => { setDraft(event.target.value); setSaved(false); setError('') },
        })),
        ...categories.map(category => h('fieldset', { key: category.id, className: 'dsh-media-tag-group', disabled: busy }, h('legend', null, category.name), ...category.tags.map(tag => h('label', { key: tag }, h('input', { type: 'checkbox', checked: tags.includes(tag), onChange: event => { setDraft((event.target.checked ? [...tags, tag] : tags.filter(value => value !== tag)).join(', ')); setSaved(false) } }), tag)))),
        h('div', { className: 'dsh-media-actions' }, h(Button, { variant: 'primary', disabled: busy || !changed, onClick: () => void save() }, t(busy ? 'saving' : 'saveTags')),
          saved ? h('span', { role: 'status' }, t('saved')) : null),
        error ? h('p', { role: 'alert' }, t(error)) : null)
    }

    /** A directory request is replaced, never merged, after project/path navigation. */
    function Browser({ project, t }) {
      const [path, setPath] = React.useState(''), [entries, setEntries] = React.useState([])
      const [page, setPage] = React.useState({ offset: 0, version: null })
      const [cursor, setCursor] = React.useState({ hasMore: false, nextOffset: 0, version: null })
      const [loading, setLoading] = React.useState(true), [error, setError] = React.useState('')
      const [selected, setSelected] = React.useState(null), [revision, setRevision] = React.useState(0)
      const current = React.useRef(null), alive = React.useRef(false), sequence = React.useRef(0)
      React.useEffect(() => { alive.current = true; return () => { alive.current = false; current.current?.abort() } }, [])
      const load = async () => {
        current.current?.abort()
        const controller = new AbortController(); current.current = controller
        const requestSequence = ++sequence.current
        setLoading(true); setError('')
        setEntries([]); setSelected(null); setCursor({ hasMore: false, nextOffset: 0, version: null })
        const query = { workspaceId: project.workspaceId, path, offset: String(page.offset), limit: '100' }
        if (page.version !== null) query.version = page.version
        try {
          const result = await request(`directory?${new URLSearchParams(query)}`, { signal: controller.signal })
          if (controller.signal.aborted || !alive.current || requestSequence !== sequence.current) return
          if (!Array.isArray(result.items) || result.items.length > 100) throw new Error('Invalid directory page')
          setEntries(result.items)
          setCursor({ hasMore: result.hasMore, nextOffset: result.nextOffset, version: result.version })
        } catch (error) {
          if (!controller.signal.aborted && alive.current && requestSequence === sequence.current) {
            setError(errorKey(error))
            if (error.code === 'MEDIA_DIRECTORY_CHANGED') setCursor({ hasMore: false, nextOffset: 0, version: null })
          }
        } finally {
          if (!controller.signal.aborted && alive.current && requestSequence === sequence.current) setLoading(false)
        }
      }
      React.useEffect(() => { void load(); return () => { current.current?.abort() } }, [project.workspaceId, path, page.offset, page.version, revision])
      const refresh = () => { setPage({ offset: 0, version: null }); setRevision(value => value + 1) }
      const navigate = nextPath => { setPath(nextPath); setPage({ offset: 0, version: null }) }
      const parts = path === '' ? [] : path.split('/')
      const updateTags = (mediaPath, tags) => {
        setEntries(rows => rows.map(row => row.path === mediaPath ? { ...row, tags } : row))
        setSelected(row => row?.path === mediaPath ? { ...row, tags } : row)
      }
      return h('div', { className: 'dsh-media-browser', 'aria-busy': loading },
        h('div', { className: 'dsh-media-heading' }, h('h2', null, project.title), h('div', { className: 'dsh-media-actions' },
          parts.length ? h(Button, { variant: 'outline', disabled: loading || selected !== null, onClick: () => navigate(parts.slice(0, -1).join('/')) }, t('parent')) : null,
          h(Button, { variant: 'outline', disabled: loading || selected !== null, onClick: refresh }, t('refresh')))),
        h('nav', { className: 'dsh-media-breadcrumb', 'aria-label': t('browse') },
          h(Button, { variant: 'ghost', disabled: loading || selected !== null || parts.length === 0, onClick: () => navigate('') }, t('root')),
          ...parts.map((part, index) => h(Button, { key: parts.slice(0, index + 1).join('/'), variant: 'ghost', disabled: loading || selected !== null || index === parts.length - 1, onClick: () => navigate(parts.slice(0, index + 1).join('/')) }, part))),
        selected ? h(Preview, { key: selected.path, item: selected, workspaceId: project.workspaceId, t, onClose: () => setSelected(null), onTagsChanged: updateTags }) : null,
        !selected && entries.length ? h('ul', { className: 'dsh-media-files' }, ...entries.map(item => h('li', { key: item.path },
          h(Button, { variant: 'ghost', disabled: loading, onClick: () => { if (item.kind === 'directory') navigate(item.path); else setSelected(item) } },
            h('span', { className: 'dsh-media-file-name' }, item.name)),
          h('span', { className: 'dsh-media-file-meta' }, [t(item.kind === 'directory' ? 'folder' : item.kind), item.kind === 'directory' ? '' : formatSize(item.size, t)].filter(Boolean).join(' · ')),
          item.tags?.length ? h('span', { className: 'dsh-media-file-tags' }, item.tags.join(' · ')) : null))) : null,
        loading ? h('p', { role: 'status' }, t('loading')) : null,
        !loading && !error && !entries.length ? h('p', null, t('noFiles')) : null,
        error ? h('div', { role: 'alert', className: 'dsh-media-error' }, h('p', null, t(error)), h(Button, { variant: 'outline', onClick: refresh, disabled: loading }, t(error === 'changed' ? 'refresh' : 'retry'))) : null,
        !selected && !error ? h('nav', { className: 'dsh-media-actions', 'aria-label': t('browse') },
          h(Button, { variant: 'outline', disabled: loading || page.offset === 0, onClick: () => setPage({ offset: Math.max(0, page.offset - 100), version: cursor.version }) }, t('previousPage')),
          h('span', null, `${t('page')} ${Math.floor(page.offset / 100) + 1} ${t('pageSuffix')}`.trim()),
          h(Button, { variant: 'outline', disabled: loading || !cursor.hasMore, onClick: () => setPage({ offset: cursor.nextOffset, version: cursor.version }) }, t('nextPage'))) : null)
    }

    /** Load a video frame only while its card is near the viewport. */
    function VideoCover({ workspaceId, video }) {
      const anchor = React.useRef(null), [visible, setVisible] = React.useState(false), [failed, setFailed] = React.useState(false)
      React.useEffect(() => {
        if (typeof IntersectionObserver === 'undefined') { setVisible(true); return }
        const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect() } }, { rootMargin: '200px' })
        if (anchor.current) observer.observe(anchor.current)
        return () => observer.disconnect()
      }, [])
      const src = `/media-library/file?${new URLSearchParams({ workspaceId, sourceId: video.sourceId, path: video.path })}`
      return h('span', { className: 'dsh-media-cover', ref: anchor, 'aria-hidden': true }, visible && !failed ? h('video', { src, muted: true, preload: 'metadata', playsInline: true, onLoadedMetadata: event => { const el = event.currentTarget; if (Number.isFinite(el.duration) && el.duration > 0) el.currentTime = Math.min(el.duration * 0.1, 10) }, onError: () => setFailed(true) }) : '▶')
    }

    /** Incrementally traverse the selected media folders. */
    function VideoGrid({ project, t, listDirectory }) {
      const [videos, setVideos] = React.useState([]), [categories, setCategories] = React.useState([]), [folders, setFolders] = React.useState([]), [settings, setSettings] = React.useState(false)
      const [filter, setFilter] = React.useState({}), [untagged, setUntagged] = React.useState(false), [selected, setSelected] = React.useState(null)
      const [sort, setSort] = React.useState('updated'), [search, setSearch] = React.useState('')
      const [folderPath, setFolderPath] = React.useState(''), [listing, setListing] = React.useState(null)
      const [categoryName, setCategoryName] = React.useState(''), [tagName, setTagName] = React.useState(''), [categoryId, setCategoryId] = React.useState('')
      const [loading, setLoading] = React.useState(true), [settingsBusy, setSettingsBusy] = React.useState(false), [error, setError] = React.useState(''), [failedFolders, setFailedFolders] = React.useState([]), [revision, setRevision] = React.useState(0), [visible, setVisible] = React.useState(60)
      const tagUpdates = React.useRef(new Map())
      React.useEffect(() => {
        const controller = new AbortController()
        tagUpdates.current = new Map()
        setVideos([]); setSelected(null); setError(''); setFailedFolders([]); setLoading(true)
        void (async () => {
          try {
            const workspaceId = project.workspaceId
            const query = new URLSearchParams({ workspaceId })
            const [categoryData, folderData] = await Promise.all([request(`categories?${query}`, { signal: controller.signal }), request(`folders?${query}`, { signal: controller.signal })])
            if (controller.signal.aborted) return
            setCategories(categoryData); setFolders(folderData.folders)
            const failures = new Set()
            const stored = await Promise.all(folderData.folders.map(async folder => {
              try { return { sourceId: folder.id, items: (await request(`index?${new URLSearchParams({ workspaceId, sourceId: folder.id })}`, { signal: controller.signal, timeoutMs: 120000 })).items } }
              catch (failure) { if (controller.signal.aborted) throw failure; failures.add(folder.name); return { sourceId: folder.id, items: [], failed: true } }
            }))
            if (controller.signal.aborted) return
            setVideos(stored.flatMap(entry => entry.items.map(item => ({ ...item, sourceId: entry.sourceId }))))
            for (const folder of folderData.folders) {
              if (controller.signal.aborted) return
              const previous = stored.find(entry => entry.sourceId === folder.id)
              const pending = [''], fresh = []
              try {
                for (let position = 0; position < pending.length && !controller.signal.aborted; position++) {
                  const path = pending[position]; let offset = 0, version
                  do {
                    const query = { workspaceId, sourceId: folder.id, path, offset: String(offset), limit: '100' }
                    if (version) query.version = version
                    const result = await request(`directory?${new URLSearchParams(query)}`, { signal: controller.signal })
                    if (controller.signal.aborted) return
                    if (!Array.isArray(result.items) || result.items.length > 100 || typeof result.hasMore !== 'boolean' || (result.hasMore && (!Number.isInteger(result.nextOffset) || result.nextOffset <= offset))) throw new Error('Invalid media directory page')
                    const found = result.items.filter(item => item.kind === 'video').map(item => ({ ...item, sourceId: folder.id }))
                    fresh.push(...found)
                    pending.push(...result.items.filter(item => item.kind === 'directory').map(item => item.path))
                    if (found.length && !previous.items.length) setVideos(rows => [...rows, ...found])
                    offset = result.hasMore ? result.nextOffset : null; version = result.version
                  } while (offset !== null && !controller.signal.aborted)
                }
                if (controller.signal.aborted) return
                setVideos(rows => [...rows.filter(item => item.sourceId !== folder.id), ...fresh.map(item => ({ ...item, tags: tagUpdates.current.get(JSON.stringify([item.sourceId, item.path])) ?? item.tags }))])
                if (!previous.failed) await request('index/replace', { body: { workspaceId, sourceId: folder.id, items: fresh.map(({ path, name, size, modified }) => ({ path, name, size, modified })) }, signal: controller.signal, timeoutMs: 120000 })
              } catch (failure) { if (controller.signal.aborted) return; failures.add(folder.name) }
              setFailedFolders([...failures])
            }
          } catch (failure) { if (!controller.signal.aborted) setError(errorKey(failure)) }
          finally { if (!controller.signal.aborted) setLoading(false) }
        })()
        return () => controller.abort()
      }, [project.workspaceId, revision])
      const refreshCategories = async () => setCategories(await request(`categories?${new URLSearchParams({ workspaceId: project.workspaceId })}`))
      const settingsAction = async action => { if (settingsBusy) return; setSettingsBusy(true); setError(''); try { await action() } catch (failure) { setError(errorKey(failure)) } finally { setSettingsBusy(false) } }
      const createCategory = () => settingsAction(async () => { await request('categories/create', { body: { workspaceId: project.workspaceId, name: categoryName } }); setCategoryName(''); await refreshCategories() })
      const createTag = () => settingsAction(async () => { await request('categories/tags/add', { body: { workspaceId: project.workspaceId, categoryId, name: tagName } }); setTagName(''); await refreshCategories() })
      const browseFolder = async path => { try { const result = await listDirectory(path || undefined); setListing(result); setFolderPath(result.path); setError('') } catch (failure) { setError(errorKey(failure)) } }
      const addFolder = () => settingsAction(async () => { const result = await request('folders/add', { body: { workspaceId: project.workspaceId, path: folderPath } }); setFolders(result.folders); setFolderPath(''); setListing(null); setRevision(value => value + 1) })
      const removeFolder = sourceId => settingsAction(async () => { const result = await request('folders/remove', { body: { workspaceId: project.workspaceId, sourceId } }); setFolders(result.folders); setRevision(value => value + 1) })
      const matching = videos.filter(video => video.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()) && (untagged ? !video.tags?.length : Object.values(filter).every(tag => video.tags?.includes(tag)))).sort((a, b) => {
        const name = a.name.localeCompare(b.name, undefined, { numeric: true }) || a.path.localeCompare(b.path)
        if (sort === 'name') return name
        if (sort === 'size') return (b.size ?? 0) - (a.size ?? 0) || name
        return (Date.parse(b.modified) || 0) - (Date.parse(a.modified) || 0) || name
      })
      return h('div', { className: 'dsh-media-grid-view' },
        h('div', { className: 'dsh-media-heading' }, h('h2', null, project.title), h('div', { className: 'dsh-media-actions' }, h(Button, { variant: 'outline', onClick: () => setRevision(value => value + 1) }, t('refresh')), h(Button, { variant: 'outline', onClick: () => setSettings(value => !value) }, t(settings ? 'done' : 'settings')))),
        settings ? h('section', { className: 'dsh-media-settings', 'aria-label': t('settings'), 'aria-busy': settingsBusy },
          h('section', { className: 'dsh-media-settings-group', 'aria-label': t('folders') },
            h('div', { className: 'dsh-media-section-title' }, h('h3', null, t('folders')), h('span', null, folders.length)), h('p', { className: 'dsh-media-hint' }, t('folderHelp')),
            folders.length ? h('ul', { className: 'dsh-media-folder-list' }, ...folders.map(folder => h('li', { key: folder.id, className: 'dsh-media-folder' }, h('div', { className: 'dsh-media-folder-details' }, h('strong', null, folder.name), h('span', { title: folder.path }, folder.path)), h(Button, { variant: 'ghost', disabled: settingsBusy, 'aria-label': `${t('removeNamed')} ${folder.name}`, onClick: () => void removeFolder(folder.id) }, t('removeFolder'))))) : h('p', { className: 'dsh-media-hint' }, t('folderEmpty')),
            h('div', { className: 'dsh-media-folder-add' }, h(Input, { value: folderPath, disabled: settingsBusy, 'aria-label': t('folderPath'), placeholder: t('folderPath'), onChange: event => setFolderPath(event.target.value) }), h(Button, { variant: 'outline', disabled: settingsBusy, onClick: () => void browseFolder(folderPath) }, t('browse')), h(Button, { variant: 'outline', disabled: settingsBusy || !folderPath.trim(), onClick: () => void addFolder() }, t('addFolder'))),
            listing ? h('div', { className: 'dsh-media-folder-browser' }, h('div', { className: 'dsh-media-actions' }, ...listing.crumbs.map(crumb => h(Button, { key: crumb.path, variant: 'ghost', onClick: () => void browseFolder(crumb.path) }, crumb.name))), ...listing.entries.filter(entry => !entry.hidden).map(entry => h(Button, { key: entry.path, variant: 'ghost', onClick: () => void browseFolder(entry.path) }, entry.name))) : null),
          h('section', { className: 'dsh-media-settings-group', 'aria-label': t('category') }, h('div', { className: 'dsh-media-section-title' }, h('h3', null, t('category')), h('span', null, categories.length)),
            categories.length ? h('ul', { className: 'dsh-media-category-list' }, ...categories.map(category => h('li', { key: category.id }, h('strong', null, category.name), h('span', null, category.tags.join(' · ') || '—')))) : h('p', { className: 'dsh-media-hint' }, t('categoryEmpty')),
            h('div', { className: 'dsh-media-form-row' }, h(Input, { value: categoryName, disabled: settingsBusy, placeholder: t('categoryName'), 'aria-label': t('categoryName'), onChange: event => setCategoryName(event.target.value) }), h(Button, { variant: 'outline', disabled: settingsBusy || !categoryName.trim(), onClick: () => void createCategory() }, t('newCategory'))),
            h('div', { className: 'dsh-media-form-row' }, h('select', { value: categoryId, disabled: settingsBusy, 'aria-label': t('category'), onChange: event => setCategoryId(event.target.value) }, h('option', { value: '' }, t('category')), ...categories.map(category => h('option', { value: category.id, key: category.id }, category.name))), h(Input, { value: tagName, disabled: settingsBusy, placeholder: t('tagName'), 'aria-label': t('tagName'), onChange: event => setTagName(event.target.value) }), h(Button, { variant: 'outline', disabled: settingsBusy || !categoryId || !tagName.trim(), onClick: () => void createTag() }, t('newTag'))))) : null,
        !settings ? h(React.Fragment, null,
        !selected ? h(React.Fragment, null, h('div', { className: 'dsh-media-toolbar' }, h('div', { className: 'dsh-media-search' }, h(Input, { value: search, 'aria-label': t('search'), placeholder: t('searchPlaceholder'), onChange: event => { setSearch(event.target.value); setVisible(60) } }), search ? h(Button, { variant: 'ghost', 'aria-label': t('clearSearch'), onClick: () => { setSearch(''); setVisible(60) } }, '×') : null), h('label', { className: 'dsh-media-sort' }, t('sort'), h('select', { value: sort, 'aria-label': t('sort'), onChange: event => { setSort(event.target.value); setVisible(60) } }, h('option', { value: 'updated' }, t('sortUpdated')), h('option', { value: 'name' }, t('sortName')), h('option', { value: 'size' }, t('sortSize'))))),
        h('div', { className: 'dsh-media-filters', 'aria-label': t('category') },
          h(Button, { variant: !untagged && !Object.keys(filter).length ? 'primary' : 'ghost', 'aria-pressed': !untagged && !Object.keys(filter).length, onClick: () => { setFilter({}); setUntagged(false); setVisible(60) } }, t('all')),
          h(Button, { variant: untagged ? 'primary' : 'ghost', 'aria-pressed': untagged, onClick: () => { setFilter({}); setUntagged(true); setVisible(60) } }, t('uncategorized')),
          ...categories.map(category => h('div', { key: category.id }, h('strong', null, category.name), ...category.tags.map(tag => h(Button, { key: tag, variant: !untagged && filter[category.id] === tag ? 'primary' : 'ghost', 'aria-pressed': !untagged && filter[category.id] === tag, onClick: () => { setUntagged(false); setFilter(current => { const next = { ...current }; if (next[category.id] === tag) delete next[category.id]; else next[category.id] = tag; return next }); setVisible(60) } }, tag))))), h('p', { className: 'dsh-media-count', 'aria-live': 'polite' }, `${matching.length} ${t('videoCount')}`)) : null,
        selected ? h(Preview, { key: `${selected.sourceId}:${selected.path}`, item: selected, workspaceId: project.workspaceId, categories, t, onClose: () => setSelected(null), onTagsChanged: (path, tags) => { tagUpdates.current.set(JSON.stringify([selected.sourceId, path]), tags); setVideos(items => items.map(item => item.sourceId === selected.sourceId && item.path === path ? { ...item, tags } : item)); setSelected(item => item?.path === path ? { ...item, tags } : item) } }) : null,
        !selected ? h('div', { className: 'dsh-media-grid' }, ...matching.slice(0, visible).map(video => h('button', { type: 'button', key: `${video.sourceId}:${video.path}`, className: 'dsh-media-card', onClick: () => setSelected(video) }, h(VideoCover, { workspaceId: project.workspaceId, video }), h('span', { className: 'dsh-media-card-title' }, video.name), h('span', { className: 'dsh-media-card-tags' }, video.tags?.length ? video.tags.join(' · ') : t('uncategorized'))))) : null,
        !selected && matching.length > visible ? h(Button, { variant: 'outline', onClick: () => setVisible(value => value + 60) }, t('nextPage')) : null,
        loading ? h('p', { role: 'status' }, t('scanning')) : null,
        !selected && !loading && !error && !matching.length ? h('div', { className: 'dsh-media-empty' }, h('p', null, t(!folders.length ? 'noFolders' : videos.length ? 'noMatch' : 'noVideos')), !folders.length ? h(Button, { variant: 'outline', onClick: () => setSettings(true) }, t('chooseFolders')) : videos.length && (search || untagged || Object.keys(filter).length) ? h(Button, { variant: 'ghost', onClick: () => { setSearch(''); setFilter({}); setUntagged(false); setVisible(60) } }, t('resetFilters')) : null) : null) : null,
        failedFolders.length ? h('p', { role: 'alert' }, `${t('someFolders')}: ${failedFolders.join('、')}`) : null,
        error ? h('p', { role: 'alert' }, t(error)) : null)
    }

    /** The panel subscribes only to the chosen project and reloads Host membership. */
    function Library({ t, selectedSubscribe, selectedSnapshot, selectProject, back, listDirectory }) {
      const workspaceId = React.useSyncExternalStore(selectedSubscribe, selectedSnapshot, selectedSnapshot)
      const [projects, setProjects] = React.useState(null), [error, setError] = React.useState(''), [revision, setRevision] = React.useState(0)
      React.useEffect(() => {
        const controller = new AbortController(); setError('')
        void request('state', { signal: controller.signal }).then(data => {
          if (!controller.signal.aborted) setProjects(data.projects)
        }).catch(error => { if (!controller.signal.aborted) setError(errorKey(error)) })
        return () => controller.abort()
      }, [workspaceId, revision])
      const project = projects?.find(item => item.workspaceId === workspaceId)
      return h('main', { className: 'dsh-media-library' },
        h('header', { className: 'dsh-media-heading' }, h('h1', null, t('title')), h(Button, { variant: 'ghost', onClick: back }, t('back'))),
        error ? h('div', { role: 'alert' }, h('p', null, t(error)), h(Button, { variant: 'outline', onClick: () => setRevision(value => value + 1) }, t('retry'))) : null,
        projects === null && !error ? h('p', { role: 'status' }, t('loading')) : null,
        projects?.length ? h('nav', { className: 'dsh-media-projects', 'aria-label': t('projects') }, ...projects.map(row =>
          h(Button, { key: row.workspaceId, variant: row.workspaceId === workspaceId ? 'primary' : 'outline', 'aria-pressed': row.workspaceId === workspaceId, onClick: () => selectProject(row.workspaceId) }, row.title))) : null,
        projects?.length === 0 ? h('p', null, t('emptyProjects')) : null,
        workspaceId !== null && projects !== null && !project && !error ? h('p', { role: 'status' }, t('unavailable')) : null,
        project ? h(VideoGrid, { key: project.workspaceId, project, t, listDirectory }) : null)
    }

    function Configuration({ t, open }) {
      return h('div', { className: 'dsh-media-config' }, h('p', null, t('emptyProjects')), h(Button, { variant: 'outline', onClick: open }, t('open')))
    }

    function SessionMedia({ sessionId, workspaces, sidebar, selectedSubscribe, selectedSnapshot }) {
      const snapshot = React.useSyncExternalStore(listener => workspaces.list.subscribe(listener), () => workspaces.list.getSnapshot(), () => workspaces.list.getSnapshot())
      const selection = React.useSyncExternalStore(selectedSubscribe, selectedSnapshot, selectedSnapshot)
      const workspaceId = snapshot.items.find(item => item.sessionIds.includes(sessionId))?.workspaceId
      React.useEffect(() => {
        if (!workspaceId) return
        const controller = new AbortController()
        let timer
        void request('state', { signal: controller.signal }).then(state => {
          if (!controller.signal.aborted && state.projects.some(project => project.workspaceId === workspaceId)) {
            timer = setTimeout(() => {
              if (!controller.signal.aborted && sidebar.mounted.getSnapshot() === sessionId) {
                try { sidebar.openTab('media-library') } catch (error) { console.error('Unable to open media library', error) }
              }
            }, 0)
          }
        }).catch(error => { if (!controller.signal.aborted) console.error('Unable to read media library state', error) })
        return () => { controller.abort(); clearTimeout(timer) }
      }, [sessionId, workspaceId, selection])
      return null
    }

    function SessionLibrary({ sessionId, workspaces, t, listDirectory }) {
      const snapshot = React.useSyncExternalStore(listener => workspaces.list.subscribe(listener), () => workspaces.list.getSnapshot(), () => workspaces.list.getSnapshot())
      const workspaceId = snapshot.items.find(item => item.sessionIds.includes(sessionId))?.workspaceId
      const [projects, setProjects] = React.useState(null)
      const [error, setError] = React.useState('')
      React.useEffect(() => {
        const controller = new AbortController(); setProjects(null); setError('')
        void request('state', { signal: controller.signal }).then(data => { if (!controller.signal.aborted) setProjects(data.projects) }).catch(failure => { if (!controller.signal.aborted) setError(errorKey(failure)) })
        return () => controller.abort()
      }, [workspaceId])
      const project = projects?.find(item => item.workspaceId === workspaceId)
      return h('div', { className: 'dsh-media-library' }, error ? h('p', { role: 'alert' }, t(error)) : projects === null ? h('p', { role: 'status' }, t('loading')) : project ? h(VideoGrid, { key: project.workspaceId, project, t, listDirectory }) : h('p', null, t('unavailable')))
    }

    const styles = `.dsh-media-library{height:100%;overflow:auto;box-sizing:border-box;padding:24px;display:flex;flex-direction:column;gap:24px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);min-width:0}.dsh-media-library h1,.dsh-media-library h2{font-weight:500;margin:0;overflow-wrap:anywhere}.dsh-media-library h1{font-size:20px}.dsh-media-library h2{font-size:16px}.dsh-media-library p{margin:0;line-height:1.6}.dsh-media-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.dsh-media-projects,.dsh-media-actions,.dsh-media-breadcrumb{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}.dsh-media-projects button,.dsh-media-breadcrumb button{max-width:100%;overflow-wrap:anywhere;white-space:normal}.dsh-media-browser{display:flex;flex-direction:column;gap:16px;min-width:0}.dsh-media-files{list-style:none;display:flex;flex-direction:column;margin:0;padding:0}.dsh-media-files li{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:6px 16px;padding:8px 0;border-bottom:0.5px solid var(--dsw-alias-border-l1)}.dsh-media-files li>button{min-width:0;justify-content:flex-start;height:auto;min-height:36px}.dsh-media-file-name{overflow-wrap:anywhere;white-space:normal;text-align:start}.dsh-media-file-meta,.dsh-media-file-tags{font-size:13px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}.dsh-media-file-tags{grid-column:1/-1;padding-inline:12px}.dsh-media-preview{display:flex;flex-direction:column;gap:16px;padding:16px;border:0.5px solid var(--dsw-alias-border-l1);border-radius:12px;min-width:0}.dsh-media-preview video,.dsh-media-preview audio,.dsh-media-preview img{display:block;max-width:100%;width:100%;max-height:55vh;object-fit:contain}.dsh-media-preview audio{height:54px}.dsh-media-tags{display:flex;flex-direction:column;gap:8px;min-width:0}.dsh-media-tags>span{min-width:0}.dsh-media-error{color:var(--dsw-alias-state-error-primary);display:flex;flex-direction:column;align-items:flex-start;gap:8px}.dsh-media-config{display:flex;flex-direction:column;gap:16px;align-items:flex-start}.dsh-media-config p{margin:0;line-height:1.6}@media(max-width:600px){.dsh-media-library{padding:16px;gap:20px}.dsh-media-files li{grid-template-columns:minmax(0,1fr)}.dsh-media-file-meta{padding-inline:12px}.dsh-media-preview{padding:12px}.dsh-media-heading{align-items:flex-start}.dsh-media-preview .dsh-media-heading{flex-direction:column}}`

    /** Bind menu actions to the clicked Workspace, independently of chat selection. */
    function apply(ctx) {
      const selection = selectionStore(), lifetime = new AbortController()
      ctx.effect(() => ctx.locale.register(namespace, { zh, en }))
      const t = ctx.locale.bind(namespace)
      ctx.effect(() => () => lifetime.abort())
      ctx.effect(() => { const style = document.createElement('style'); style.textContent = styles + `.dsh-media-grid-view{display:flex;flex-direction:column;gap:16px;min-width:0}.dsh-media-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(125px,1fr));gap:20px 14px}.dsh-media-card{border:0;background:transparent;color:inherit;padding:0;text-align:left;min-width:0;cursor:pointer;display:flex;flex-direction:column;gap:6px}.dsh-media-card:focus-visible{outline:2px solid var(--dsw-alias-label-primary);outline-offset:4px}.dsh-media-cover{display:grid;place-items:center;width:100%;aspect-ratio:3/4;border-radius:8px;overflow:hidden;background:linear-gradient(145deg,#29405b,#131f32);font-size:30px;color:#d8e7fc}.dsh-media-cover video{width:100%;height:100%;object-fit:cover;pointer-events:none}.dsh-media-card-title{overflow-wrap:anywhere;font-size:14px}.dsh-media-card-tags{font-size:12px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}.dsh-media-filters{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.dsh-media-filters>div{display:flex;gap:4px;align-items:center;flex-wrap:wrap}.dsh-media-settings{display:flex;flex-direction:column;align-items:flex-start;gap:12px}.dsh-media-settings h3{margin:4px 0}.dsh-media-folder{display:flex;align-items:flex-start;gap:8px;width:100%;min-width:0}.dsh-media-folder>span{flex:1;min-width:0;overflow-wrap:anywhere}.dsh-media-folder>button{flex:none;white-space:nowrap}.dsh-media-tag-group{display:flex;flex-wrap:wrap;gap:8px;border:0;padding:0}.dsh-media-tag-group label{display:flex;gap:4px;align-items:center}`; document.head.appendChild(style); return () => style.remove() })
      ctx.effect(() => {
        const style = document.createElement('style')
        style.textContent = `.dsh-media-toolbar{display:flex;align-items:end;gap:12px;flex-wrap:wrap}.dsh-media-search{display:flex;align-items:center;flex:1 1 180px;min-width:0}.dsh-media-search input{width:100%;min-width:0}.dsh-media-sort{display:flex;align-items:center;gap:8px;white-space:nowrap}.dsh-media-sort select,.dsh-media-form-row select{max-width:100%;min-height:32px;color:inherit;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l1);border-radius:6px}.dsh-media-count,.dsh-media-hint{font-size:13px;color:var(--dsw-alias-label-secondary)}.dsh-media-count{margin:0}.dsh-media-empty{display:flex;align-items:flex-start;flex-direction:column;gap:12px;padding:20px 0;color:var(--dsw-alias-label-secondary)}.dsh-media-settings{align-items:stretch;gap:24px}.dsh-media-settings-group{display:flex;flex-direction:column;gap:12px;min-width:0}.dsh-media-section-title{display:flex;align-items:center;justify-content:space-between;gap:12px}.dsh-media-section-title span{color:var(--dsw-alias-label-secondary);font-size:13px}.dsh-media-folder-list,.dsh-media-category-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}.dsh-media-folder,.dsh-media-category-list li{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:10px 12px;min-width:0}.dsh-media-folder-details{display:flex;flex:1;min-width:0;flex-direction:column;gap:3px}.dsh-media-folder-details strong,.dsh-media-category-list strong{font-size:14px;overflow-wrap:anywhere}.dsh-media-folder-details span,.dsh-media-category-list span{font-size:12px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}.dsh-media-category-list li{display:flex;flex-direction:column;gap:4px}.dsh-media-folder-add,.dsh-media-form-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}.dsh-media-folder-add input,.dsh-media-form-row input{flex:1 1 150px;min-width:0}.dsh-media-folder-browser{display:flex;flex-direction:column;align-items:flex-start;gap:4px;max-height:220px;overflow:auto;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:8px}.dsh-media-folder-browser button{max-width:100%;white-space:normal;overflow-wrap:anywhere}.dsh-media-tag-group{margin:0}.dsh-media-tag-group legend{font-weight:500;padding:0 0 8px}@media(max-width:600px){.dsh-media-toolbar{align-items:stretch}.dsh-media-search{flex-basis:100%}.dsh-media-sort{justify-content:space-between}.dsh-media-folder-add input{flex-basis:100%}.dsh-media-form-row input{flex-basis:100%}}`
        document.head.appendChild(style)
        return () => style.remove()
      })
      // A Workspace action opens its project view; a mounted Session does not prove its optional Sidebar is rendered.
      const open = workspaceId => {
        selection.select(workspaceId)
        ctx.layout.selectPanel('media-library')
      }
      ctx.effect(() => ctx.sidebarRightTabs.register({ id: 'dsh-media-library', kind: 'media-library', title: () => t('title') }))
      ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({ name: 'sidebar.right.pane.tab', key: 'dsh-media-library', locale: namespace, inject: sessionId => ({ sessionId, workspaces: ctx.workspaces, t, listDirectory: path => ctx.uiWorkspace.listDirectory(path) }) }, SessionLibrary))
      ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({ name: 'conversation.session.header.actions', id: 'dsh-media-library', inject: sessionId => ({ sessionId, workspaces: ctx.workspaces, sidebar: ctx.sidebarRight, selectedSubscribe: selection.subscribe, selectedSnapshot: selection.getSnapshot }) }, SessionMedia))
      const inject = () => ({ t, selectedSubscribe: selection.subscribe, selectedSnapshot: selection.getSnapshot, selectProject: selection.select, back: () => ctx.layout.selectPanel(null), listDirectory: path => ctx.uiWorkspace.listDirectory(path) })
      ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'media-library', locale: namespace, inject }, Library))
      ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({ name: 'plugins.bundle.config', key: 'dsh-media-library', locale: namespace, inject: () => ({ t, open: () => open(null) }) }, Configuration))
      ctx.effect(() => ctx.contextMenus.register({
        id: 'media-library.workspace', target: 'workspace', order: 200,
        async resolve(target, signal) {
          const state = await request('state', { signal })
          const enabled = state.projects.some(project => project.workspaceId === target.workspaceId)
          const failureLabel = t('menuFailed')
          return enabled ? [
            { id: 'open', label: t('open'), failureLabel, run: () => open(target.workspaceId) },
            { id: 'remove', label: t('remove'), failureLabel, run: async () => {
              await request('projects/set', { body: { workspaceId: target.workspaceId, enabled: false }, signal: lifetime.signal })
              lifetime.signal.throwIfAborted()
              if (selection.getSnapshot() === target.workspaceId) selection.select(null)
              ctx.contextMenus.notify(t('removed'), true)
            } },
          ] : [{ id: 'set', label: t('set'), failureLabel, run: async () => {
            await request('projects/set', { body: { workspaceId: target.workspaceId, enabled: true }, signal: lifetime.signal })
            lifetime.signal.throwIfAborted()
            open(target.workspaceId)
          } }]
        },
      }))
      ctx.effect(() => () => {
        if (ctx.layout.panelInfo.getSnapshot().activePanelId === 'media-library') ctx.layout.selectPanel(null)
      })
    }

    return { name: 'dsh-media-library', inject: ['slots', 'locale', 'layout', 'contextMenus', 'workspaces', 'uiWorkspace', 'sidebarRight', 'sidebarRightTabs'], apply }
  },
})
