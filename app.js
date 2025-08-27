// Client-side logic for the insurance pre-check chatbot.
//
// This script manages the user interaction flow: prompting the
// user to upload the front and back of their insurance card and
// sending those images to the server for OCR processing. It uses
// simple chat bubbles to display messages and handles server
// responses by showing a message and redirecting if appropriate.

(function () {
  const messages = document.getElementById('messages');
  const frontInput = document.getElementById('front');
  const backInput = document.getElementById('back');
  const attachBtn = document.getElementById('attach');
  const sendBtn = document.getElementById('send');

  let frontData = null;
  let backData = null;

  function bubble(text, side = 'left') {
    const div = document.createElement('div');
    div.className = 'msg' + (side === 'right' ? ' right' : '');
    div.textContent = text;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  }

  async function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        // reader.result is a data URL like "data:image/png;base64,..."
        const [, b64] = reader.result.split(',');
        resolve(b64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  attachBtn.addEventListener('click', () => {
    // If front not yet provided, prompt for front. Otherwise prompt for back.
    if (!frontData) {
      frontInput.click();
    } else {
      backInput.click();
    }
  });

  frontInput.addEventListener('change', async () => {
    if (!frontInput.files || !frontInput.files[0]) return;
    frontData = await fileToBase64(frontInput.files[0]);
    bubble('Got the front of your card.', 'right');
    if (!backData) {
      bubble('Now upload the back of the card.');
    }
    if (frontData && backData) sendBtn.disabled = false;
  });

  backInput.addEventListener('change', async () => {
    if (!backInput.files || !backInput.files[0]) return;
    backData = await fileToBase64(backInput.files[0]);
    bubble('Got the back of your card.', 'right');
    if (frontData && backData) sendBtn.disabled = false;
  });

  sendBtn.addEventListener('click', async () => {
    if (!frontData || !backData) return;
    sendBtn.disabled = true;
    bubble('Checking…');
    try {
      const res = await fetch('/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ front: frontData, back: backData })
      });
      const data = await res.json();
      bubble(data.message);
      if (data.success && data.link) {
        // Redirect quickly on success
        setTimeout(() => {
          window.location.href = data.link;
        }, 1500);
      } else {
        // Delay before redirecting to self-pay option to allow reading message
        if (data.link) {
          setTimeout(() => {
            window.location.href = data.link;
          }, 5500);
        }
      }
    } catch (err) {
      console.error(err);
      bubble('Server error. Please try again later.');
    }
    sendBtn.disabled = false;
  });

  // Initial greeting
  bubble("Hi, I'm the intake assistant. Upload the FRONT of your insurance card, then the BACK.");
})();
