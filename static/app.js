/* ─── JavaScript for SkyFare AI ─────────────────────────── */

// ── Navbar scroll effect ──────────────────────────────────
window.addEventListener('scroll', () => {
  const nav = document.getElementById('navbar');
  if (window.scrollY > 40) {
    nav.classList.add('scrolled');
  } else {
    nav.classList.remove('scrolled');
  }
});

// ── Set today as default date (& smart time defaults) ─────
(function initDefaults() {
  const dateInput = document.getElementById('journey_date');
  if (dateInput) {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm   = String(today.getMonth() + 1).padStart(2, '0');
    const dd   = String(today.getDate()).padStart(2, '0');
    dateInput.value = `${yyyy}-${mm}-${dd}`;
    dateInput.min   = `${yyyy}-${mm}-${dd}`;
  }
  // Default departure 06:00, arrival 08:30
  const dep = document.getElementById('dep_time');
  const arr = document.getElementById('arr_time');
  if (dep) dep.value = '06:00';
  if (arr) arr.value = '08:30';
})();

// ── Stops selector ────────────────────────────────────────
function selectStop(btn, value) {
  document.querySelectorAll('.stop-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('stops').value = value;
}

// ── Swap source / destination ─────────────────────────────
function swapCities() {
  const src  = document.getElementById('source');
  const dest = document.getElementById('destination');
  const srcVal  = src.value;
  const destVal = dest.value;

  // check option exists in the other select
  const srcOpts  = Array.from(src.options).map(o => o.value);
  const destOpts = Array.from(dest.options).map(o => o.value);

  if (destOpts.includes(srcVal) && srcOpts.includes(destVal)) {
    src.value  = destVal;
    dest.value = srcVal;
    // animate
    src.style.transition = 'color 0.3s';
    dest.style.transition = 'color 0.3s';
    src.style.color  = '#a89fff';
    dest.style.color = '#a89fff';
    setTimeout(() => {
      src.style.color  = '';
      dest.style.color = '';
    }, 600);
  }
}

// ── Predict Fare ──────────────────────────────────────────
async function predictFare(event) {
  event.preventDefault();

  // Gather values
  const airline     = document.getElementById('airline').value;
  const source      = document.getElementById('source').value;
  const destination = document.getElementById('destination').value;
  const journeyDate = document.getElementById('journey_date').value;
  const depTime     = document.getElementById('dep_time').value;
  const arrTime     = document.getElementById('arr_time').value;
  const stops       = parseInt(document.getElementById('stops').value);

  // Basic validation
  let valid = true;
  [
    ['airline', airline],
    ['source', source],
    ['destination', destination],
    ['journey_date', journeyDate],
    ['dep_time', depTime],
    ['arr_time', arrTime],
  ].forEach(([id, val]) => {
    const group = document.getElementById(`group-${id}`) ||
                  document.querySelector(`[id="group-${id}"]`);
    if (!val) {
      valid = false;
      const el = document.getElementById(id);
      if (el) {
        el.style.borderColor = '#ef4444';
        el.style.boxShadow   = '0 0 0 3px rgba(239,68,68,0.2)';
        setTimeout(() => {
          el.style.borderColor = '';
          el.style.boxShadow   = '';
        }, 2000);
      }
    }
  });

  // Additional: source ≠ destination
  if (source && destination && source === destination) {
    showError('Source and destination cannot be the same city.');
    return;
  }

  if (!valid) return;

  // Hide previous results
  const resultCard = document.getElementById('resultCard');
  const errorCard  = document.getElementById('errorCard');
  resultCard.classList.remove('show');
  errorCard.style.display = 'none';

  // Show loading
  const btn = document.getElementById('predictBtn');
  btn.classList.add('loading');
  btn.disabled = true;

  try {
    const payload = {
      airline,
      source,
      destination,
      journey_date: journeyDate,
      dep_time:     depTime,
      arr_time:     arrTime,
      stops,
    };

    const response = await fetch('/predict', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Prediction failed. Please try again.');
    }

    // Show result
    document.getElementById('resultPrice').textContent = data.price_formatted;
    document.getElementById('resultRoute').textContent =
      `${getAirportCode(source)} → ${getAirportCode(destination)}`;
    document.getElementById('resultMeta').textContent =
      `${airline} · ${stops === 0 ? 'Non-Stop' : stops + ' Stop(s)'} · ${getDuration(depTime, arrTime)}`;

    resultCard.classList.add('show');

    // Scroll into view
    document.getElementById('resultPanel').scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Confetti burst
    launchConfetti();

  } catch (err) {
    showError(err.message);
  } finally {
    btn.classList.remove('loading');
    btn.disabled = false;
  }
}

// ── Helpers ───────────────────────────────────────────────
function getAirportCode(city) {
  const map = {
    'Banglore':  'BLR',
    'Mumbai':    'BOM',
    'Kolkata':   'CCU',
    'Delhi':     'DEL',
    'Chennai':   'MAA',
    'New Delhi': 'DEL',
    'Cochin':    'COK',
    'Hyderabad': 'HYD',
  };
  return map[city] || city.slice(0, 3).toUpperCase();
}

function getDuration(dep, arr) {
  const [dh, dm] = dep.split(':').map(Number);
  const [ah, am] = arr.split(':').map(Number);
  let totalMins = (ah * 60 + am) - (dh * 60 + dm);
  if (totalMins < 0) totalMins += 24 * 60;
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function showError(msg) {
  const errorCard = document.getElementById('errorCard');
  const errorMsg  = document.getElementById('errorMsg');
  errorMsg.textContent = msg;
  errorCard.style.display = 'block';
  errorCard.style.animation = 'none';
  void errorCard.offsetWidth;
  errorCard.style.animation = '';
  document.getElementById('resultCard').classList.remove('show');
  document.getElementById('resultPanel').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ── Micro-confetti ────────────────────────────────────────
function launchConfetti() {
  const colors = ['#6c63ff', '#00d4ff', '#f59e0b', '#10b981', '#ec4899', '#fff'];
  const count  = 60;
  const body   = document.body;

  for (let i = 0; i < count; i++) {
    const dot = document.createElement('div');
    dot.style.cssText = `
      position:fixed;
      pointer-events:none;
      z-index:9999;
      width:${4 + Math.random() * 6}px;
      height:${4 + Math.random() * 6}px;
      background:${colors[Math.floor(Math.random() * colors.length)]};
      border-radius:${Math.random() > 0.5 ? '50%' : '2px'};
      left:${40 + Math.random() * 20}%;
      top:50%;
    `;
    body.appendChild(dot);

    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI;
    const dist  = 120 + Math.random() * 280;
    const tx    = Math.cos(angle) * dist;
    const ty    = Math.sin(angle) * dist - 80;
    const dur   = 800 + Math.random() * 600;

    dot.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: `translate(${tx}px,${ty}px) scale(0)`, opacity: 0 },
    ], {
      duration: dur,
      easing:   'cubic-bezier(0.2, 0.8, 0.6, 1)',
      fill:     'forwards',
    }).onfinish = () => dot.remove();
  }
}

// ── Intersection Observer: animate sections on scroll ─────
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = '1';
      entry.target.style.transform = 'translateY(0)';
    }
  });
}, { threshold: 0.15 });

document.querySelectorAll('.step-card, .feature-card').forEach(el => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(30px)';
  el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
  observer.observe(el);
});
