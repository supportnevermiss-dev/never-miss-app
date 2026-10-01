const token = localStorage.getItem('nm_token');
if (!token) {
  window.location.href = '/login.html';
}

document.getElementById('logout-btn').addEventListener('click', () => {
  localStorage.removeItem('nm_token');
  localStorage.removeItem('nm_slug');
  window.location.href = '/login.html';
});

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

async function load() {
  const res = await fetch('/api/dashboard', { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    localStorage.removeItem('nm_token');
    window.location.href = '/login.html';
    return;
  }
  const data = await res.json();
  document.getElementById('biz-name').textContent = data.business.name;
  const link = `${window.location.origin}/b/${data.business.slug}`;
  const linkBox = document.getElementById('widget-link');
  linkBox.textContent = link;
  document.getElementById('stat-total').textContent = data.stats.total;
  document.getElementById('stat-after').textContent = data.stats.afterHours;

  const body = document.getElementById('bookings-body');
  body.innerHTML = '';
  if (data.bookings.length === 0) {
    document.getElementById('empty-state').classList.remove('hidden');
  }
  for (const b of data.bookings) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${fmtDate(b.slot_start)}</td>
      <td>${b.customer_name}</td>
      <td>${b.service_name || '—'}</td>
      <td>${b.customer_phone || ''}${b.customer_email ? ' · ' + b.customer_email : ''}</td>
      <td>${b.is_after_hours ? '<span class="tag-after">after-hours</span>' : ''}</td>
    `;
    body.appendChild(tr);
  }
}

load();
