import { store, saveLocalFallback } from './store.js';
import { showToast, escapeHtml } from './ui.js';

const DAYS = ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota', 'Niedziela'];

function parseShiftHours(rangeStr) {
  const match = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/.exec((rangeStr || '').trim());
  if (!match) return { startMin: 600, endMin: 1080, hours: 8 };
  const startMin = parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
  const endMin = parseInt(match[3], 10) * 60 + parseInt(match[4], 10);
  const diff = Math.max(0, endMin - startMin);
  return { startMin, endMin, hours: Number((diff / 60).toFixed(2)) };
}

// Globalna walidacja konfliktów: brak nakładania godzin tej samej osoby w tym samym dniu
// oraz brak przejścia z późnej zmiany (koniec >= 20:00) na wczesną zmianę (start <= 11:00) kolejnego dnia
export function hasScheduleConflict(shifts, candidate) {
  const candRange = parseShiftHours(candidate.hoursRange);

  for (const existing of shifts) {
    if (existing.staffId !== candidate.staffId) continue;

    if (existing.dayIndex === candidate.dayIndex) {
      const exRange = parseShiftHours(existing.hoursRange);
      const overlaps = candRange.startMin < exRange.endMin && candRange.endMin > exRange.startMin;
      if (overlaps || existing.location === candidate.location) {
        return `Konflikt w dniu ${DAYS[candidate.dayIndex]} (${existing.location}, ${existing.hoursRange})`;
      }
    }

    if (existing.dayIndex === candidate.dayIndex - 1) {
      const exRange = parseShiftHours(existing.hoursRange);
      if (exRange.endMin >= 1200 && candRange.startMin <= 660) {
        return `Zbyt krótki odpoczynek między ${DAYS[existing.dayIndex]} (${existing.hoursRange}) a ${DAYS[candidate.dayIndex]} (${candidate.hoursRange})`;
      }
    }

    if (existing.dayIndex === candidate.dayIndex + 1) {
      const exRange = parseShiftHours(existing.hoursRange);
      if (candRange.endMin >= 1200 && exRange.startMin <= 660) {
        return `Zbyt krótki odpoczynek między ${DAYS[candidate.dayIndex]} (${candidate.hoursRange}) a ${DAYS[existing.dayIndex]} (${existing.hoursRange})`;
      }
    }
  }
  return null;
}

export function generateWeeklySchedule(locationName, shiftsPerDay = 2) {
  const activeStaff = store.state.staff.filter((s) => s.status === 'active');
  if (!activeStaff.length) {
    showToast('Brak aktywnych pracowników do ułożenia grafiku.', 'error');
    return null;
  }

  const shifts = [];
  const conflicts = [];
  let pointer = 0;

  for (let dayIndex = 0; dayIndex < DAYS.length; dayIndex++) {
    for (let slot = 0; slot < shiftsPerDay; slot++) {
      const hoursRange = slot === 0 ? '10:00-16:00' : '16:00-22:00';
      let assigned = null;

      for (let attempt = 0; attempt < activeStaff.length; attempt++) {
        const candidateStaff = activeStaff[(pointer + attempt) % activeStaff.length];
        const candidateShift = {
          id: `sh-${Date.now()}-${dayIndex}-${slot}-${attempt}`,
          dayIndex,
          dayName: DAYS[dayIndex],
          location: locationName,
          staffId: candidateStaff.id,
          staffName: candidateStaff.fullName,
          hoursRange,
          hoursCount: parseShiftHours(hoursRange).hours
        };
        const conflictReason = hasScheduleConflict(shifts, candidateShift);
        if (!conflictReason) {
          assigned = candidateShift;
          pointer = (pointer + attempt + 1) % activeStaff.length;
          break;
        }
      }

      if (assigned) {
        shifts.push(assigned);
      } else {
        conflicts.push(`${DAYS[dayIndex]} (${hoursRange}): brak wolnego pracownika bez konfliktu`);
      }
    }
  }

  const scheduleObj = {
    id: `sched-${Date.now()}`,
    weekStart: new Date().toISOString().slice(0, 10),
    location: locationName,
    shifts,
    conflicts
  };

  store.state.schedules.unshift(scheduleObj);
  saveLocalFallback();
  renderSchedule(scheduleObj);

  if (conflicts.length) {
    showToast(`Wygenerowano grafik z uwagami (${conflicts.length} blokad konfliktów).`, 'warning');
  } else {
    showToast(`Wygenerowano kompletny grafik dla: ${locationName}`, 'success');
  }
  return scheduleObj;
}

export function renderSchedule(scheduleOverride = null) {
  const container = document.getElementById('scheduleBoard');
  if (!container) return;

  const current = scheduleOverride || store.state.schedules[0];
  if (!current) {
    container.innerHTML = `<div class="empty-state">Brak wygenerowanego grafiku. Kliknij „Generuj grafik”, aby utworzyć plan tygodniowy.</div>`;
    return;
  }

  const rowsHtml = DAYS.map((dayName, idx) => {
    const dayShifts = current.shifts.filter((s) => s.dayIndex === idx);
    const pills = dayShifts.length
      ? dayShifts.map((s) => `<span class="shift-pill">${escapeHtml(s.hoursRange)} — <strong>${escapeHtml(s.staffName)}</strong> (${s.hoursCount}h)</span>`).join('')
      : `<span class="muted">Brak przypisanych zmian</span>`;
    return `
      <div class="schedule-row">
        <div class="schedule-day">${escapeHtml(dayName)}</div>
        <div class="schedule-shifts">${pills}</div>
      </div>
    `;
  }).join('');

  const conflictBox = current.conflicts && current.conflicts.length
    ? `<div class="alert-box"><strong>Wykryte blokady konfliktów:</strong><ul>${current.conflicts.map((c) => `<li>${escapeHtml(c)}</li>`).join('')}</ul></div>`
    : `<div class="ok-box">✓ Brak konfliktów obsady ani naruszeń odpoczynku dobowego.</div>`;

  container.innerHTML = `
    <div class="schedule-meta">
      <span>Lokalizacja: <strong>${escapeHtml(current.location)}</strong></span>
      <span>Tydzień od: <strong>${escapeHtml(current.weekStart)}</strong></span>
    </div>
    ${conflictBox}
    <div class="schedule-grid">${rowsHtml}</div>
  `;
}

export function exportSchedulePng() {
  const current = store.state.schedules[0];
  if (!current) {
    showToast('Najpierw wygeneruj grafik, aby zapisać go jako PNG.', 'error');
    return;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 1100;
  canvas.height = 680;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#091326';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.fillText(`Grafik pracy — ${store.state.org.name} (${current.location})`, 36, 54);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillText(`Tydzień od: ${current.weekStart}`, 36, 84);

  DAYS.forEach((day, idx) => {
    const y = 125 + idx * 72;
    ctx.fillStyle = '#112240';
    ctx.fillRect(36, y, canvas.width - 72, 58);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillText(day, 54, y + 35);

    const shiftsText = current.shifts
      .filter((s) => s.dayIndex === idx)
      .map((s) => `${s.hoursRange}: ${s.staffName} (${s.hoursCount}h)`)
      .join('   |   ') || 'Brak zmian';

    ctx.fillStyle = '#4ade80';
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillText(shiftsText, 230, y + 35);
  });

  const link = document.createElement('a');
  link.download = `grafik-${current.location.toLowerCase().replace(/\s+/g, '-')}-${current.weekStart}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
  showToast('Pobrano grafik w formacie PNG.', 'success');
}
