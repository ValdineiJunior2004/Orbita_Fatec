const selectLocal = document.getElementById('select-local');
const calendarGrid = document.querySelector('.calendar-grid');
const currentMonthYear = document.getElementById('current-month-year');
const eventsList = document.getElementById('events-list');
const eventsDayTitle = document.getElementById('events-day-title');
const btnSolicitar = document.getElementById('btn-solicitar');

const modalSolicitar = document.getElementById('modal-solicitar');
const formSolicitar = document.getElementById('form-solicitar');

let currentDate = new Date();
let selectedDate = null;
let eventosAgendados = [];

// Base URL (assuming this serves both dev and prod, relative paths are handled by the browser)
const API_BASE = (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost' || window.location.hostname.startsWith('192.168.') || window.location.hostname.startsWith('10.')) 
  ? `http://${window.location.hostname}:3000/api` 
  : '/api';

async function carregarLocais() {
    try {
        const res = await fetch(`${API_BASE}/locais`);
        const locais = await res.json();
        
        selectLocal.innerHTML = '';
        if (locais.length === 0) {
            selectLocal.innerHTML = '<option value="">Nenhum local cadastrado</option>';
            return;
        }

        locais.forEach(l => {
            const opt = document.createElement('option');
            opt.value = l.id;
            opt.textContent = `${l.nome} (${l.tipo})`;
            selectLocal.appendChild(opt);
        });

        carregarEventos(); // Fetch events for initial local
    } catch (e) {
        console.error('Erro ao carregar locais:', e);
    }
}

async function carregarEventos() {
    try {
        const res = await fetch(`${API_BASE}/agenda`);
        eventosAgendados = await res.json();
        renderCalendar();
    } catch (e) {
        console.error('Erro ao carregar eventos:', e);
    }
}

function renderCalendar() {
    // Clear old days (keep week headers)
    const headers = Array.from(calendarGrid.querySelectorAll('.weekday'));
    calendarGrid.innerHTML = '';
    headers.forEach(h => calendarGrid.appendChild(h));

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    currentMonthYear.textContent = `${monthNames[month]} ${year}`;

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Empty cells before start
    for (let i = 0; i < firstDay; i++) {
        const cell = document.createElement('div');
        cell.className = 'day-cell disabled';
        calendarGrid.appendChild(cell);
    }

    const localId = selectLocal.value;

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        const cell = document.createElement('div');
        cell.className = 'day-cell';
        cell.dataset.date = dateStr;

        if (selectedDate === dateStr) cell.classList.add('selected');

        const dayNum = document.createElement('div');
        dayNum.className = 'day-number';
        dayNum.textContent = day;
        cell.appendChild(dayNum);

        const indicators = document.createElement('div');
        indicators.className = 'day-indicators';

        // Filter events for this day and local
        const dayEvents = eventosAgendados.filter(e => e.data === dateStr && e.localId === localId && e.status !== 'Rejeitado');
        
        // Show up to 3 indicators
        dayEvents.slice(0, 3).forEach(e => {
            const ind = document.createElement('div');
            ind.className = `indicator ${e.status.toLowerCase()}`;
            ind.textContent = `${e.horaInicio} ${e.status === 'Aprovado' ? 'Ocupado' : 'Pend.'}`;
            indicators.appendChild(ind);
        });

        if (dayEvents.length > 3) {
            const ind = document.createElement('div');
            ind.className = 'indicator';
            ind.style.background = 'transparent';
            ind.style.textAlign = 'center';
            ind.textContent = `+${dayEvents.length - 3}`;
            indicators.appendChild(ind);
        }

        cell.appendChild(indicators);

        // Can only select today or future dates
        const todayStr = new Date().toISOString().split('T')[0];
        if (dateStr < todayStr) {
            cell.classList.add('disabled');
        } else {
            cell.onclick = () => selectDay(dateStr);
        }

        calendarGrid.appendChild(cell);
    }
}

function selectDay(dateStr) {
    selectedDate = dateStr;
    renderCalendar(); // re-render to highlight selected cell

    // Format display date
    const [y, m, d] = dateStr.split('-');
    eventsDayTitle.textContent = `Eventos do Dia ${d}/${m}/${y}`;
    
    const localId = selectLocal.value;
    const dayEvents = eventosAgendados.filter(e => e.data === dateStr && e.localId === selectLocal.value && e.status !== 'Rejeitado');

    eventsList.innerHTML = '';
    if (dayEvents.length === 0) {
        eventsList.innerHTML = '<p class="empty-state">Nenhum evento agendado para este dia.</p>';
    } else {
        // Sort by start time
        dayEvents.sort((a,b) => a.horaInicio.localeCompare(b.horaInicio)).forEach(e => {
            const div = document.createElement('div');
            div.className = `event-item ${e.status.toLowerCase()}`;
            // If approved, we might hide the name for privacy or show it. Let's show "Ocupado" or Name depending on needs.
            // As user didn't specify strict privacy, we'll show "Ocupado - Evento"
            const displayTitle = e.status === 'Aprovado' ? 'Horário Ocupado' : 'Solicitação Pendente';
            
            div.innerHTML = `
                <div class="event-time">${e.horaInicio} às ${e.horaFim}</div>
                <div class="event-title">${displayTitle}</div>
                <div class="event-status" style="color: ${e.status === 'Aprovado' ? '#c81e1e' : '#b45309'}">${e.status}</div>
            `;
            eventsList.appendChild(div);
        });
    }

    btnSolicitar.style.display = 'block';
}

document.getElementById('btn-prev-month').onclick = () => {
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderCalendar();
};

document.getElementById('btn-next-month').onclick = () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderCalendar();
};

selectLocal.onchange = () => {
    renderCalendar();
    if (selectedDate) selectDay(selectedDate);
};

// Modal Logic
btnSolicitar.onclick = () => {
    if (!selectedDate) return;
    
    document.getElementById('modal-data').textContent = selectedDate.split('-').reverse().join('/');
    const localName = selectLocal.options[selectLocal.selectedIndex].text;
    document.getElementById('modal-local-nome').textContent = localName;

    formSolicitar.reset();
    modalSolicitar.classList.add('active');
};

function fecharModal() {
    modalSolicitar.classList.remove('active');
}

formSolicitar.onsubmit = async (e) => {
    e.preventDefault();
    
    const payload = {
        localId: selectLocal.value,
        data: selectedDate,
        horaInicio: document.getElementById('sol-hora-inicio').value,
        horaFim: document.getElementById('sol-hora-fim').value,
        nomeSolicitante: document.getElementById('sol-nome').value,
        nomeEvento: document.getElementById('sol-evento').value,
        descricaoEvento: document.getElementById('sol-descricao').value,
        curso: document.getElementById('sol-curso').value
    };

    if (payload.horaInicio >= payload.horaFim) {
        alert('Horário de fim deve ser depois do horário de início.');
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/agenda`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (res.ok) {
            alert('Solicitação enviada com sucesso! Aguarde a aprovação da equipe.');
            fecharModal();
            carregarEventos(); // Refresh
        } else {
            alert(`Erro: ${data.error}`);
        }
    } catch (err) {
        alert('Erro ao conectar com o servidor.');
    }
};

// Start
carregarLocais();
