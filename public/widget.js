document.getElementById('booking-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const slug = document.getElementById('slug').value;
  const payload = {
    slug,
    serviceId: Number(document.getElementById('service_id').value),
    customerName: document.getElementById('customer_name').value,
    customerPhone: document.getElementById('customer_phone').value,
    customerEmail: document.getElementById('customer_email').value,
    slotStart: document.getElementById('slot_start').value,
  };
  const btn = e.target.querySelector('button');
  btn.disabled = true;
  btn.textContent = 'Booking…';
  try {
    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Booking failed');
    document.getElementById('booking-form').classList.add('hidden');
    document.getElementById('confirmation').classList.remove('hidden');
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Book appointment';
    alert('Something went wrong — please try again.');
  }
});
