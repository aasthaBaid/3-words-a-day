// ===== CONFIG: fill with your project values =====
const SUPABASE_URL = "https://bainkzbskkqpwpyppyio.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhaW5remJza2txcHdweXBweWlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkwNjMyNTIsImV4cCI6MjA3NDYzOTI1Mn0.B_-95l3gj7FySGQrnykGkT05jP-Q9CFEoiuBd0Ii4HA";
// ================================================

const todayWordsEl = document.getElementById('todayWords');
const historyListEl = document.getElementById('historyList');
const dateLabelEl = document.getElementById('dateLabel');
const exportBtn = document.getElementById('exportBtn');

const fmtDate = (d = new Date()) => d.toISOString().slice(0, 10);

function hyphenate(word) {
    const v = /[aeiouy]/i; let out = [], cur = '';
    for (let i = 0; i < word.length; i++) {
        const ch = word[i], pr = word[i - 1] || '', nx = word[i + 1] || '';
        cur += ch;
        if (i > 0 && v.test(ch) && !v.test(pr) && /[a-z]/i.test(ch) && nx && !v.test(nx)) { out.push(cur); cur = ''; }
    }
    if (cur) out.push(cur);
    return out.join('-');
}

async function j(url) { const r = await fetch(url); if (!r.ok) throw new Error(r.statusText); return r.json(); }

async function dapi(word) {
    try {
        const arr = await j(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
        const e = Array.isArray(arr) ? arr[0] : null; if (!e) return null;
        const phon = e.phonetic || (e.phonetics?.find(p => p.text)?.text) || '';
        const audio = (e.phonetics?.find(p => p.audio)?.audio) || '';
        const m = e.meanings?.[0] || {};
        const def = m.definitions?.[0]?.definition || '';
        const ex = (m.definitions || []).flatMap(d => d.example ? [d.example] : []).slice(0, 3);
        const syn = [...new Set((m.synonyms || []).slice(0, 6))];
        const ant = [...new Set((m.antonyms || []).slice(0, 6))];
        return { phon, audio, def, ex, syn, ant, pos: m.partOfSpeech || '' };
    } catch { return null; }
}

async function datamuse(word) {
    try {
        const [s, a] = await Promise.all([
            j(`https://api.datamuse.com/words?rel_syn=${encodeURIComponent(word)}&max=6`),
            j(`https://api.datamuse.com/words?rel_ant=${encodeURIComponent(word)}&max=6`)
        ]);
        return { syn: (s || []).map(x => x.word), ant: (a || []).map(x => x.word) };
    } catch { return { syn: [], ant: [] }; }
}

function card(m) {
    const el = document.createElement('article'); el.className = 'card';
    const h = document.createElement('h3'); h.textContent = m.word;
    const p = document.createElement('div'); p.className = 'pron'; p.textContent = m.hyphenPron || '';
    const badges = document.createElement('div'); badges.className = 'badges';
    if (m.pos) { const b = document.createElement('span'); b.className = 'badge'; b.textContent = m.pos; badges.appendChild(b); }
    if (m.phoneticTxt) { const b = document.createElement('span'); b.className = 'badge'; b.textContent = m.phoneticTxt; badges.appendChild(b); }
    const mean = document.createElement('div'); mean.className = 'meaning'; mean.textContent = m.definition || m.fallbackDefinition || '';
    const ex = document.createElement('ul'); ex.className = 'examples';
    (m.examples || []).forEach(s => { const li = document.createElement('li'); li.textContent = s; ex.appendChild(li); });
    const kv = document.createElement('div'); kv.className = 'kv';
    if (m.syns?.length) { const s = document.createElement('span'); s.className = 'pill'; s.textContent = 'Synonyms: ' + m.syns.slice(0, 4).join(', '); kv.appendChild(s); }
    if (m.ants?.length) { const a = document.createElement('span'); a.className = 'pill'; a.textContent = 'Antonyms: ' + m.ants.slice(0, 4).join(', '); kv.appendChild(a); }
    const actions = document.createElement('div'); actions.className = 'actions';
    const tts = document.createElement('button'); tts.className = 'audio-btn'; tts.textContent = '🔊 Pronounce';
    tts.onclick = () => { try { const u = new SpeechSynthesisUtterance(m.word); u.lang = 'en-US'; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch { } };
    actions.appendChild(tts);
    if (m.audio) { const btn = document.createElement('button'); btn.textContent = '▶️ Audio'; btn.onclick = () => { new Audio(m.audio).play().catch(() => { }); }; actions.appendChild(btn); }
    el.append(h, p, badges, mean, ex, kv, actions); return el;
}

(async function init() {
    // load supabase-js
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // fetch ~30 latest days (newest first)
    const { data, error } = await supabase
        .from('daily_words')
        .select('*')
        .order('day', { ascending: false })
        .limit(30);

    if (error) {
        todayWordsEl.innerHTML = `<p class="note">Error loading daily words: ${error.message}</p>`;
        return;
    }
    if (!data?.length) {
        todayWordsEl.innerHTML = `<p class="note">No daily words yet. (Run your function once.)</p>`;
        return;
    }

    const today = data[0];
    dateLabelEl.textContent = new Date(today.day + 'T00:00:00+05:30')
        .toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' });

    // enrich & render today
    todayWordsEl.innerHTML = '';
    const enriched = await Promise.all((today.words || []).map(async (w, i) => {
        const base = { word: w.word, fallbackDefinition: w.definition, pos: w.pos || '', phoneticTxt: w.phonetic || '', hyphenPron: hyphenate(w.word) };
        await new Promise(r => setTimeout(r, i * 120)); // gentle stagger
        const x = await dapi(w.word);
        let syn = [], ant = [], def = base.fallbackDefinition, ex = [], pos = base.pos, phon = base.phoneticTxt, audio = '';
        if (x) { def = x.def || def; ex = x.ex?.length ? x.ex : ex; syn = x.syn?.length ? x.syn : syn; ant = x.ant?.length ? x.ant : ant; pos = x.pos || pos; phon = x.phon || phon; audio = x.audio || ''; }
        if (!syn.length && !ant.length) { const dm = await datamuse(w.word); syn = dm.syn; ant = dm.ant; }
        const model = { ...base, definition: def, examples: ex, syns: syn, ants: ant, pos, phoneticTxt: phon, audio };
        todayWordsEl.appendChild(card(model));
        return model;
    }));

    // history sidebar
    historyListEl.innerHTML = '';
    data.slice(1).forEach(row => {
        const li = document.createElement('li');
        const label = document.createElement('div');
        label.textContent = new Date(row.day + 'T00:00:00+05:30')
            .toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        const chips = document.createElement('div'); chips.className = 'chips';
        (row.words || []).forEach(w => { const c = document.createElement('span'); c.className = 'chip'; c.textContent = w.word; chips.appendChild(c); });
        const btn = document.createElement('button'); btn.textContent = 'Open';
        btn.onclick = () => {
            dateLabelEl.textContent = `Viewing: ${new Date(row.day + 'T00:00:00+05:30').toLocaleDateString()}`;
            todayWordsEl.innerHTML = ''; (row.words || []).forEach(w => {
                const m = { word: w.word, fallbackDefinition: w.definition, pos: w.pos || '', phoneticTxt: w.phonetic || '', hyphenPron: hyphenate(w.word) };
                todayWordsEl.appendChild(card(m));
            });
        };
        li.append(label, chips, btn);
        historyListEl.appendChild(li);
    });

    // export whole history
    exportBtn.onclick = async () => {
        const all = await supabase.from('daily_words').select('*').order('day', { ascending: false });
        const blob = new Blob([JSON.stringify(all.data || [], null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `eng3-history-${fmtDate()}.json`;
        document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    };
})();
