const views = document.querySelectorAll('.view')
const navButtons = document.querySelectorAll('.nav')
const titleEl = document.getElementById('viewTitle')
const subtitleEl = document.getElementById('viewSubtitle')

const titles = {
  dashboard: ['Dashboard', 'System health and activity overview'],
  users: ['Users', 'Manage admin users and access status'],
  services: ['Services', 'Current service states and health'],
  logs: ['Logs', 'Recent operational events'],
  settings: ['Settings', 'Desktop admin preferences'],
}

function switchView(viewId) {
  views.forEach((v) => v.classList.toggle('active', v.id === viewId))
  navButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.view === viewId))
  const [title, subtitle] = titles[viewId]
  titleEl.textContent = title
  subtitleEl.textContent = subtitle
}

async function loadSummary() {
  const summary = await window.adminApi.getSummary()
  document.getElementById('uptime').textContent = summary.uptime
  document.getElementById('activeUsers').textContent = summary.activeUsers
  document.getElementById('cpuLoad').textContent = summary.cpuLoad
  document.getElementById('memoryUsage').textContent = summary.memoryUsage
  document.getElementById('incidents').textContent = summary.incidents
}

navButtons.forEach((button) => {
  button.addEventListener('click', () => switchView(button.dataset.view))
})

document.getElementById('refreshBtn').addEventListener('click', loadSummary)

loadSummary()
