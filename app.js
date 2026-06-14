const STORAGE_KEY = 'jplog.entries'

const state = {
  items: [],
  api: false,
  activeCategory: null,
  categoryItems: [],
  practiceItems: [],
  practiceQueue: [],
  current: null,
  answered: 0,
  correct: 0,
  locked: false,
  editingId: null
}

function el(id) {
  return document.getElementById(id)
}

function itemId(item) {
  return String(item.id ?? item.created)
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;'
  })[char])
}

function normalizeItem(item) {
  return {
    ...item,
    tags: Array.isArray(item.tags) ? item.tags : [],
    kind: String(item.kind || 'Uncategorized').trim() || 'Uncategorized'
  }
}

async function detectApi() {
  try {
    const response = await fetch('/api/ping')
    return response.ok
  } catch {
    return false
  }
}

async function loadItems() {
  if (state.api) {
    const response = await fetch('/api/entries')
    if (response.ok) return (await response.json()).map(normalizeItem)
  }
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]').map(normalizeItem)
  } catch {
    return []
  }
}

function saveLocal(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}

async function refresh() {
  state.items = await loadItems()
  renderSidebar()
  renderEntries()
  updateStats()
  if (state.activeCategory) {
    const category = getCategories().find(entry => entry.name === state.activeCategory)
    if (category) openCategory(category.name, category.items)
    else showLogger()
  }
}

function getCategories() {
  const categories = new Map()
  const add = (name, item) => {
    const cleanName = String(name || '').trim()
    if (!cleanName) return
    if (!categories.has(cleanName)) categories.set(cleanName, new Map())
    categories.get(cleanName).set(itemId(item), item)
  }

  state.items.forEach(item => {
    add(item.kind, item)
    item.tags.forEach(tag => add(tag, item))
  })

  return [...categories.entries()]
    .map(([name, entries]) => ({ name, items: [...entries.values()] }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

function renderSidebar() {
  const container = el('categories')
  const categories = getCategories()
  container.innerHTML = ''

  const allButton = categoryButton('All words', state.items)
  container.appendChild(allButton)
  categories.forEach(category => container.appendChild(categoryButton(category.name, category.items)))
}

function categoryButton(name, items) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = `ultimate-button category${state.activeCategory === name ? ' active' : ''}`
  button.innerHTML = `<span>${escapeHtml(name)}</span><span class="category-count">${items.length}</span>`
  button.addEventListener('click', () => openCategory(name, items))
  return button
}

function showView(viewId) {
  document.querySelectorAll('.view').forEach(view => view.classList.toggle('active', view.id === viewId))
}

function showLogger() {
  state.activeCategory = null
  state.categoryItems = []
  showView('loggerView')
  renderSidebar()
}

function openCategory(name, items) {
  state.activeCategory = name
  state.categoryItems = items.slice()
  showView('selectionView')
  el('selectionTitle').textContent = name
  el('selectionSummary').textContent = `${items.length} saved ${items.length === 1 ? 'entry' : 'entries'}`
  el('selectAll').checked = false
  renderSelectionList()
  renderSidebar()
}

function renderSelectionList() {
  const container = el('selectionList')
  container.innerHTML = ''

  if (!state.categoryItems.length) {
    container.innerHTML = '<div class="empty-state">This list is empty. Add entries in the logger first.</div>'
    el('startPracticeBtn').disabled = true
    return
  }

  el('startPracticeBtn').disabled = false
  state.categoryItems.forEach(item => {
    const label = document.createElement('label')
    label.className = 'select-row check-label'
    label.innerHTML = `
      <input class="practice-check" type="checkbox" value="${escapeHtml(itemId(item))}">
      <span>
        <strong>${escapeHtml(item.term)} ${item.reading ? `<span class="muted">(${escapeHtml(item.reading)})</span>` : ''}</strong>
        <span class="muted">${escapeHtml(item.meaning || 'No meaning saved')}</span>
      </span>`
    container.appendChild(label)
  })
}

function renderEntries() {
  const query = el('search').value.toLowerCase().trim()
  const items = state.items.slice().reverse().filter(item => {
    if (!query) return true
    return [item.kind, item.term, item.reading, item.meaning, item.notes, ...item.tags]
      .join(' ')
      .toLowerCase()
      .includes(query)
  })

  const container = el('entries')
  container.innerHTML = ''
  if (!items.length) {
    container.innerHTML = `<div class="empty-state">${state.items.length ? 'No entries match your search.' : 'No entries yet. Add your first Japanese word above.'}</div>`
    return
  }

  items.forEach(item => {
    const article = document.createElement('article')
    article.className = 'entry'
    article.innerHTML = `
      <div class="entry-head">
        <div>
          <div class="entry-term">${escapeHtml(item.term)} <span class="muted">${escapeHtml(item.reading || '')}</span></div>
          <div>${escapeHtml(item.meaning || '')}</div>
        </div>
        <span class="chaos-badge">${escapeHtml(item.kind)}</span>
      </div>
      ${item.notes ? `<div class="muted" style="margin-top:9px">${escapeHtml(item.notes)}</div>` : ''}
      <div class="tags">${item.tags.map(tag => `<span class="chaos-badge">${escapeHtml(tag)}</span>`).join('')}</div>
      <div class="entry-actions">
        <button class="ultimate-button compact-button edit-btn" type="button">Edit</button>
        <button class="ultimate-button compact-button delete-btn" type="button">Delete</button>
      </div>`
    article.querySelector('.edit-btn').addEventListener('click', () => startEdit(item))
    article.querySelector('.delete-btn').addEventListener('click', () => removeItem(item))
    container.appendChild(article)
  })
}

function updateStats() {
  el('total').textContent = state.items.length
  el('listCount').textContent = getCategories().length
}

function formPayload() {
  return {
    kind: el('kind').value.trim() || 'Uncategorized',
    term: el('term').value.trim(),
    reading: el('reading').value.trim(),
    meaning: el('meaning').value.trim(),
    tags: el('tags').value.split(',').map(tag => tag.trim()).filter(Boolean),
    notes: el('notes').value.trim()
  }
}

async function submitEntry() {
  const payload = formPayload()
  if (!payload.term) {
    alert('Please add a Japanese term.')
    return
  }

  if (state.editingId) {
    if (state.api) {
      const response = await fetch(`/api/entries/${state.editingId}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!response.ok) return alert('Failed to save the entry.')
    } else {
      const index = state.items.findIndex(item => itemId(item) === state.editingId)
      if (index < 0) return alert('Failed to find the entry.')
      state.items[index] = { ...state.items[index], ...payload }
      saveLocal(state.items)
    }
  } else {
    const entry = { ...payload, created: Date.now() }
    if (state.api) {
      const response = await fetch('/api/entries', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(entry)
      })
      if (!response.ok) return alert('Failed to add the entry.')
    } else {
      state.items.push(entry)
      saveLocal(state.items)
    }
  }

  cancelEdit()
  await refresh()
}

function startEdit(item) {
  state.editingId = itemId(item)
  el('kind').value = item.kind
  el('term').value = item.term || ''
  el('reading').value = item.reading || ''
  el('meaning').value = item.meaning || ''
  el('tags').value = item.tags.join(', ')
  el('notes').value = item.notes || ''
  el('addBtn').textContent = 'Save'
  el('cancelEditBtn').hidden = false
  showLogger()
  el('term').focus()
}

function cancelEdit() {
  state.editingId = null
  el('kind').value = ''
  el('term').value = ''
  el('reading').value = ''
  el('meaning').value = ''
  el('tags').value = ''
  el('notes').value = ''
  el('addBtn').textContent = 'Add'
  el('cancelEditBtn').hidden = true
}

async function removeItem(item) {
  if (!confirm(`Delete "${item.term}"?`)) return
  if (state.api) {
    await fetch(`/api/entries/${item.id}`, { method: 'DELETE' })
  } else {
    state.items = state.items.filter(entry => itemId(entry) !== itemId(item))
    saveLocal(state.items)
  }
  await refresh()
}

async function clearAll() {
  if (!state.items.length || !confirm('Delete every saved entry?')) return
  if (state.api) {
    const results = await Promise.all(state.items.map(item => fetch(`/api/entries/${item.id}`, { method: 'DELETE' })))
    if (results.some(response => !response.ok)) return alert('Some entries could not be deleted.')
  } else {
    localStorage.removeItem(STORAGE_KEY)
  }
  await refresh()
}

function shuffle(items) {
  const result = items.slice()
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[result[index], result[swapIndex]] = [result[swapIndex], result[index]]
  }
  return result
}

function selectedPracticeItems() {
  const selectedIds = [...document.querySelectorAll('.practice-check:checked')].map(input => input.value)
  if (!selectedIds.length) return []
  return state.categoryItems.filter(item => selectedIds.includes(itemId(item)))
}

function beginPractice() {
  const selected = selectedPracticeItems()
  if (!selected.length) {
    alert('Select at least one word, or use Select all.')
    return
  }

  state.practiceItems = selected
  state.practiceQueue = []
  state.answered = 0
  state.correct = 0
  el('practiceArea').classList.add('active')
  el('practiceArea').setAttribute('aria-hidden', 'false')
  nextQuestion()
}

function nextQuestion() {
  if (!state.practiceQueue.length) state.practiceQueue = shuffle(state.practiceItems)
  state.current = state.practiceQueue.shift()
  state.locked = false
  renderQuestion()
}

function choicePool(item) {
  const correct = item.meaning || item.reading || item.term
  const candidates = state.items
    .map(entry => entry.meaning || entry.reading || entry.term)
    .filter(value => value && value !== correct)
  const choices = [correct, ...shuffle([...new Set(candidates)]).slice(0, 3)]
  const fallbacks = ['I do not know yet', 'None of these', 'Skip this word']
  while (choices.length < 4) choices.push(fallbacks[choices.length - 1])
  return shuffle(choices)
}

function renderQuestion() {
  const item = state.current
  const choices = choicePool(item)
  el('practiceScore').textContent = `${state.correct}/${state.answered} correct`
  el('practiceProgress').style.width = `${(state.answered % Math.max(state.practiceItems.length, 1)) / Math.max(state.practiceItems.length, 1) * 100}%`
  el('practiceCard').innerHTML = `
    <div class="section-label">Choose the meaning</div>
    <div class="practice-prompt ultimate-lifeform-text">${escapeHtml(item.term)}</div>
    <div class="practice-reading">${escapeHtml(item.reading || '')}</div>
    <div class="choice-grid">
      ${choices.map(choice => `<button class="choice ultimate-button" type="button" data-choice="${escapeHtml(choice)}">${escapeHtml(choice)}</button>`).join('')}
    </div>
    <div class="practice-feedback" aria-live="polite"></div>`
  el('practiceCard').querySelectorAll('.choice').forEach(button => {
    button.addEventListener('click', () => answerQuestion(button))
  })
}

function answerQuestion(button) {
  if (state.locked) return
  state.locked = true
  const correct = state.current.meaning || state.current.reading || state.current.term
  const chosen = button.dataset.choice
  const wasCorrect = chosen === correct
  state.answered += 1
  if (wasCorrect) state.correct += 1

  el('practiceCard').querySelectorAll('.choice').forEach(choice => {
    choice.disabled = true
    if (choice.dataset.choice === correct) choice.classList.add('correct')
  })
  if (!wasCorrect) button.classList.add('wrong')
  el('practiceCard').querySelector('.practice-feedback').textContent = wasCorrect ? 'Correct' : `Answer: ${correct}`
  el('practiceScore').textContent = `${state.correct}/${state.answered} correct`
  el('practiceProgress').style.width = `${(state.answered % state.practiceItems.length) / state.practiceItems.length * 100}%`
  window.setTimeout(nextQuestion, 900)
}

function endPractice() {
  el('practiceArea').classList.remove('active')
  el('practiceArea').setAttribute('aria-hidden', 'true')
  state.practiceItems = []
  state.practiceQueue = []
  state.current = null
  showView('selectionView')
}

async function exportCsv() {
  if (state.api) {
    window.location.assign('/api/export')
    return
  }
  const headers = ['kind', 'term', 'reading', 'meaning', 'tags', 'notes', 'created']
  const quote = value => `"${String(value ?? '').replace(/"/g, '""')}"`
  const rows = state.items.map(item => headers.map(key => quote(key === 'tags' ? JSON.stringify(item.tags) : item[key])).join(','))
  downloadBlob([headers.join(','), ...rows].join('\n'), 'jplog-export.csv', 'text/csv')
}

function downloadBlob(content, filename, type) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

async function importCsv(file) {
  if (state.api) {
    const data = new FormData()
    data.append('file', file)
    const response = await fetch('/api/import', { method: 'POST', body: data })
    if (!response.ok) return alert('CSV import failed.')
    await refresh()
    return
  }

  const rows = parseCsv(await file.text())
  if (rows.length < 2) return alert('The CSV file has no entries.')
  const headers = rows.shift()
  const imported = rows.filter(row => row.some(Boolean)).map(row => {
    const record = Object.fromEntries(headers.map((header, index) => [header, row[index] || '']))
    let tags = []
    try {
      tags = JSON.parse(record.tags || '[]')
    } catch {
      tags = String(record.tags || '').split(',').map(tag => tag.trim()).filter(Boolean)
    }
    return normalizeItem({
      kind: record.kind || 'Uncategorized',
      term: record.term,
      reading: record.reading,
      meaning: record.meaning,
      tags,
      notes: record.notes,
      created: Number(record.created) || Date.now()
    })
  })
  state.items.push(...imported)
  saveLocal(state.items)
  await refresh()
}

function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (char === '"' && quoted && text[index + 1] === '"') {
      field += '"'
      index += 1
    } else if (char === '"') {
      quoted = !quoted
    } else if (char === ',' && !quoted) {
      row.push(field)
      field = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }
  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

async function importDb(file) {
  if (!state.api) return alert('DB import requires the Python server.')
  const data = new FormData()
  data.append('file', file)
  const response = await fetch('/api/db-upload', { method: 'POST', body: data })
  if (!response.ok) return alert('Database import failed.')
  await refresh()
}

function wireEvents() {
  el('showLoggerBtn').addEventListener('click', showLogger)
  el('addBtn').addEventListener('click', submitEntry)
  el('cancelEditBtn').addEventListener('click', cancelEdit)
  el('clearBtn').addEventListener('click', clearAll)
  el('search').addEventListener('input', renderEntries)
  el('selectAll').addEventListener('change', event => {
    document.querySelectorAll('.practice-check').forEach(input => { input.checked = event.target.checked })
  })
  el('selectionList').addEventListener('change', () => {
    const checks = [...document.querySelectorAll('.practice-check')]
    el('selectAll').checked = checks.length > 0 && checks.every(input => input.checked)
  })
  el('startPracticeBtn').addEventListener('click', beginPractice)
  el('endPracticeBtn').addEventListener('click', endPractice)
  el('exportBtn').addEventListener('click', exportCsv)
  el('exportDbBtn').addEventListener('click', () => {
    if (state.api) window.location.assign('/api/db-download')
    else alert('DB export requires the Python server.')
  })
  el('importFile').addEventListener('change', event => {
    if (event.target.files[0]) importCsv(event.target.files[0])
    event.target.value = ''
  })
  el('importDbFile').addEventListener('change', event => {
    if (event.target.files[0]) importDb(event.target.files[0])
    event.target.value = ''
  })
}

async function init() {
  wireEvents()
  state.api = await detectApi()
  await refresh()
}

window.addEventListener('DOMContentLoaded', init)
