(function() {
  let frontB64 = null;
  let backB64  = null;
  let planType = '';

  const messages = document.getElementById('messages');
  const frontInput  = document.getElementById('front');
  const backInput   = document.getElementById('back');
  const attachBtn   = document.getElementById('attach');
  const sendBtn     = document.getElementById('send');
  const planSelectDiv = document.getElementById('plan-select');

  function bubble(text, side = 'left') {
    const el = document.createElement('div');
    el.className = `msg ${side}`;
    el.textContent = text;
    messages.appendChild(el);
    messages.scrollTop = messages.scrollHeight;
  }

  function createPlanSelect() {
    const select = document.createElement('select');
    select.id = 'planType';
    select.innerHTML = `
      <option value="">Select your plan type</option>
      <option value="PPO">PPO</option>
      <option value="POS">POS</option>
      <option value="HMO">HMO</option>
      <option value="EPO">EPO</option>
      <option value="Medicare">Medicare</option>
      <option value="Medicaid">Medicaid</option>
      <option value="Other">Other</option>
    `;
    select.addEventListener('change', () => {
      planType = select.value;
      sendBtn.disabled = !(frontB64 && backB64 && planType);
    });
    planSelectDiv.appendChild(select);
  }

  function toB64(file) {
    return new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload = () => res(reader.result.split(',')[1]);
      reader.onerror = rej;
      reader.readAsDataURL(file);
    });
  }

  attachBtn.addEventListener('click', () => {
    if (!frontB64) { frontInput.click(); }
    else if (!backB64) { backInput.click(); }
  });

  frontInput.addEventListener('change', async () => {
    if (!frontInput.files.length) return;
    frontB64 = await toB64(frontInput.files[0]);
    bubble('Front of card uploaded.', 'right');
    if (!backB64) bubble('Now upload the BACK of the card.');
    if (frontB64 && backB64 && !planType) createPlanSelect();
  });

  backInput.addEventListener('change', async () => {
    if (!backInput.files.length) return;
    backB64 = await toB64(backInput.files[0]);
    bubble('Back of card uploaded.', 'right');
    if (frontB64 && backB64 && !planType) createPlanSelect();
  });

  sendBtn.addEventListener('click', async () => {
    sendBtn.disabled = true;
    bubble('Checking…');
    try {
      const res = await fetch('/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ front: frontB64, back: backB64, planType })
      });
      const data = await res.json();
      bubble(data.message);
      if (data.link) {
        const delay = data.success ? 1500 : 5500;
        setTimeout(() => window.location.href = data.link, delay);
      }
    } catch {
      bubble('Server error. Please try again later.');
    }
    sendBtn.disabled = false;
  });

  bubble("Hi, I'm the intake assistant. Please upload the FRONT of your insurance card, then the BACK.");
})();
