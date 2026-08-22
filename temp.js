
  const state = { password: null, conversations: [], activeConv: null, lastNotifiedAt: 0, unreadCount: 0, unreadByConv: {}, unreadList: [] };
  const ORIGINAL_TITLE = document.title;
  const THEME_KEY = 'admin-theme';

  const $ = (sel) => document.querySelector(sel);

  function applyTheme(theme) {
    const next = (theme === 'light' ? 'light' : 'dark');
    document.body.setAttribute('data-theme', next);
    const group = $('#themeToggleGroup');
    const btn = $('#themeToggle');
    if (group) group.setAttribute('data-state', next);
    if (btn) {
      btn.setAttribute('aria-checked', next === 'light' ? 'true' : 'false');
      btn.setAttribute('aria-label', next === 'light' ? 'Ganti ke mode gelap' : 'Ganti ke mode terang');
    }
    localStorage.setItem(THEME_KEY, next);
  }

  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY) || 'dark';
    applyTheme(saved);
    const btn = $('#themeToggle');
    if (btn) {
      btn.addEventListener('click', () => {
        const current = document.body.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
        applyTheme(current === 'light' ? 'dark' : 'light');
      });
    }
  }

  function apiFetch(path, opts = {}) {
    return fetch(path, {
      ...opts,
      headers: {
        'X-Admin-Password': state.password,
        ...(opts.headers || {}),
      },
    });
  }

  initTheme();

  const savedPassword = sessionStorage.getItem('admin_password');
  if (!savedPassword) {
    window.location.replace('login.html');
  } else {
    state.password = savedPassword;
    initApp();
  }

  $('#logoutBtn').addEventListener('click', () => {
    sessionStorage.removeItem('admin_password');
    window.location.replace('login.html');
  });

  // ---------- Menu ----------
  async function loadView(tab) {
    const view = $('#adminView');
    const res = await fetch(tab + '.html');
    if (!res.ok) throw new Error('Gagal memuat menu ' + tab + '.');
    view.innerHTML = await res.text();
    document.querySelectorAll('nav.tabs button').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    if (tab === 'faq') initFaqView();
    if (tab === 'riwayat') {
      loadConversations();
      const searchUser = $('#searchUserInput');
      if (searchUser) {
        searchUser.addEventListener('input', () => renderConvList());
      }
    }
  }

  document.querySelectorAll('nav.tabs button').forEach((btn) => {
    btn.addEventListener('click', () => loadView(btn.dataset.tab).catch(showViewError));
  });

  function showViewError(err) {
    console.error(err);
    $('#adminView').innerHTML = '<div class="empty-state">' + err.message + '</div>';
  }

  function initApp() {
    loadView('riwayat').catch(showViewError);
    state.lastNotifiedAt = Date.now(); // cuma notifikasi pesan yang masuk SETELAH buka panel ini
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    
    // Inisialisasi tombol notifikasi dropdown
    const bellBtn = $('#notifBellBtn');
    if (bellBtn) {
      bellBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        $('#notifDropdown').classList.toggle('show');
      });
      document.addEventListener('click', (e) => {
        const dd = $('#notifDropdown');
        if (dd && dd.classList.contains('show') && !e.target.closest('.notif-dropdown-wrapper')) {
          dd.classList.remove('show');
        }
      });
    }

    setInterval(pollNotifications, 6000);
  }

  async function pollNotifications() {
    if (!state.password) return;
    try {
      const res = await apiFetch('/api/admin/notifications?since=' + state.lastNotifiedAt);
      if (!res.ok) return;
      const data = await res.json();
      const notifications = data.notifications || [];
      if (!notifications.length) return;

      notifications.forEach(handleIncomingNotification);
      state.lastNotifiedAt = Math.max(...notifications.map((n) => n.timestamp));
    } catch (err) {
      // polling gagal sesekali bukan masalah besar — coba lagi di interval berikutnya
    }
  }

  function handleIncomingNotification(notif) {
    const conv = state.conversations.find((c) => c.channel === notif.channel && c.id === String(notif.contactId));
    const label = conv && conv.name ? conv.name : notif.contactId;

    // Tandai unread di daftar percakapan (kecuali kalau percakapan itu sedang dibuka)
    const isCurrentlyOpen = state.activeConv && state.activeConv.channel === notif.channel && state.activeConv.id === String(notif.contactId);
    if (!isCurrentlyOpen) {
      const key = notif.channel + ':' + notif.contactId;
      state.unreadByConv[key] = true;
      state.unreadCount += 1;
      updateTabTitle();
      
      // Add to dropdown list
      state.unreadList = state.unreadList.filter((n) => !(n.channel === notif.channel && n.contactId === notif.contactId));
      state.unreadList.unshift({
        channel: notif.channel,
        contactId: notif.contactId,
        title: label,
        preview: notif.preview,
        time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
      });
      updateNotifDropdown();
    }

    // Kalau kontaknya belum ada di daftar (chat pertama dari orang baru), muat ulang daftar
    if (!conv) loadConversations();

    renderConvList();
    showToast(label, notif.preview, notif.channel, notif.contactId);
    showBrowserNotification(label, notif.preview, notif.channel, notif.contactId);
  }

  function updateNotifDropdown() {
    const badge = $('#notifBadge');
    const bellBtn = $('#notifBellBtn');
    if (!badge || !bellBtn) return;
    
    if (state.unreadList.length > 0) {
      badge.style.display = 'block';
      bellBtn.classList.add('has-unread');
    } else {
      badge.style.display = 'none';
      bellBtn.classList.remove('has-unread');
    }
    
    const listEl = $('#notifDropdownList');
    if (!listEl) return;
    if (state.unreadList.length === 0) {
      listEl.innerHTML = '<div class="empty-state" style="padding: 16px; font-size: 12px;">Tidak ada notifikasi baru.</div>';
      return;
    }
    
    listEl.innerHTML = '';
    state.unreadList.forEach((n) => {
      const item = document.createElement('div');
      item.className = 'dropdown-notif-item';
      item.innerHTML = 
        '<div class="notif-title">' + (n.channel === 'whatsapp' ? '📱' : '✈️') + ' ' + n.title + '</div>' +
        '<div class="notif-preview">' + n.preview + '</div>' + 
        '<div class="notif-time">' + n.time + '</div>';
        
      item.addEventListener('click', () => {
        $('#notifDropdown').classList.remove('show');
        document.querySelector('nav.tabs button[data-tab="riwayat"]').click();
        const conv = state.conversations.find((c) => c.channel === n.channel && c.id === String(n.contactId));
        if (conv) {
          const itemEl = Array.from(document.querySelectorAll('.conv-item')).find((it) => it.dataset.key === n.channel + ':' + n.contactId);
          if (itemEl) selectConv(conv, itemEl);
        }
      });
      listEl.appendChild(item);
    });
  }

  function updateTabTitle() {
    document.title = state.unreadCount > 0 ? '(' + state.unreadCount + ') ' + ORIGINAL_TITLE : ORIGINAL_TITLE;
  }

  function showToast(title, preview, channel, contactId) {
    const container = $('#notifToastContainer');
    const el = document.createElement('div');
    el.className = 'notif-toast';
    el.innerHTML =
      '<div class="notif-title">' + (channel === 'whatsapp' ? '📱' : '✈️') + ' ' + title + '</div>' +
      '<div class="notif-preview">' + preview + '</div>';
    el.addEventListener('click', () => {
      el.remove();
      // Buka tab riwayat & pilih percakapan ini
      document.querySelector('nav.tabs button[data-tab="riwayat"]').click();
      const conv = state.conversations.find((c) => c.channel === channel && c.id === String(contactId));
      if (conv) {
        const itemEl = Array.from(document.querySelectorAll('.conv-item')).find((it) => it.dataset.key === channel + ':' + contactId);
        if (itemEl) selectConv(conv, itemEl);
      }
    });
    container.appendChild(el);
    setTimeout(() => el.remove(), 8000);
  }

  function showBrowserNotification(title, preview, channel, contactId) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (document.visibilityState === 'visible') return; // tab lagi dibuka & terlihat, toast in-page sudah cukup
    const notif = new Notification(title + ' — pesan baru', { body: preview });
    notif.onclick = () => {
      window.focus();
      document.querySelector('nav.tabs button[data-tab="riwayat"]').click();
      const conv = state.conversations.find((c) => c.channel === channel && c.id === String(contactId));
      if (conv) {
        const itemEl = Array.from(document.querySelectorAll('.conv-item')).find((it) => it.dataset.key === channel + ':' + contactId);
        if (itemEl) selectConv(conv, itemEl);
      }
    };
  }

  // ---------- Riwayat Pesan ----------
  async function loadConversations() {
    try {
      const res = await apiFetch('/api/admin/users');
      if (!res.ok) throw new Error('Server merespons status ' + res.status);
      const data = await res.json();
      state.conversations = data.conversations || [];
      renderConvList();
    } catch (err) {
      console.error('Gagal memuat daftar percakapan:', err);
      $('#convList').innerHTML =
        '<div class="empty-state"><span>Gagal memuat daftar: ' + err.message + '</span><button class="secondary" id="retryConvBtn">Coba lagi</button></div>';
      const retryBtn = document.getElementById('retryConvBtn');
      if (retryBtn) retryBtn.addEventListener('click', loadConversations);
    }
  }

  function renderConvList() {
    const el = $('#convList');
    if (!state.conversations.length) {
      el.innerHTML = '<div class="empty-state">Belum ada percakapan tersimpan.</div>';
      return;
    }
    el.innerHTML = '';
    
    const searchInput = $('#searchUserInput');
    const query = searchInput ? searchInput.value.toLowerCase() : '';
    let hasMatch = false;

    state.conversations.forEach((conv) => {
      const label = String(conv.name ? conv.name : conv.id);
      if (query && !label.toLowerCase().includes(query)) return;
      
      hasMatch = true;
      const item = document.createElement('div');
      item.className = 'conv-item';
      const key = conv.channel + ':' + conv.id;
      item.dataset.key = key;
      const isUnread = Boolean(state.unreadByConv[key]);
      item.innerHTML =
        '<span class="chip ' + conv.channel + '">' + (conv.channel === 'whatsapp' ? 'WA' : 'TG') + '</span>' +
        '<span class="conv-id" title="' + conv.id + '">' + (isUnread ? '<span class="unread-dot"></span>' : '') + label + '</span>' +
        '<button class="edit-name-btn">Ubah nama</button>';
      item.querySelector('.conv-id').addEventListener('click', () => selectConv(conv, item));
      item.querySelector('.chip').addEventListener('click', () => selectConv(conv, item));
      item.querySelector('.edit-name-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        editContactName(conv);
      });
      el.appendChild(item);
    });
    
    if (!hasMatch) {
      el.innerHTML = '<div class="empty-state">Tidak ada hasil yang cocok.</div>';
    }
  }

  async function editContactName(conv) {
    const current = conv.name || '';
    const input = window.prompt('Nama panggilan untuk ' + conv.id + ' (kosongkan untuk hapus nama):', current);
    if (input === null) return; // dibatalkan

    const res = await apiFetch('/api/admin/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: conv.channel, id: conv.id, name: input }),
    });

    if (res.ok) {
      conv.name = input.trim() || null;
      renderConvList();
      if (state.activeConv && state.activeConv.id === conv.id && state.activeConv.channel === conv.channel) {
        state.activeConv.name = conv.name;
        updateChatHeaderName();
      }
    } else {
      alert('Gagal menyimpan nama. Coba lagi.');
    }
  }

  function updateChatHeaderName() {
    const headerEl = $('#chatHeader');
    if (!headerEl || !state.activeConv) return;
    const conv = state.activeConv;
    const label = conv.name ? conv.name + ' (' + conv.id + ')' : conv.id;
    headerEl.textContent = (conv.channel === 'whatsapp' ? 'WhatsApp' : 'Telegram') + ' · ' + label;
  }

  async function selectConv(conv, itemEl) {
    document.querySelectorAll('.conv-item').forEach((e) => e.classList.remove('active'));
    itemEl.classList.add('active');
    state.activeConv = conv;
    $('#riwayatView').classList.add('mobile-chat-active'); // di mobile: pindah tampilan ke panel chat

    // Bersihkan status unread untuk percakapan ini
    const key = conv.channel + ':' + conv.id;
    if (state.unreadByConv[key]) {
      delete state.unreadByConv[key];
      state.unreadCount = Math.max(0, state.unreadCount - 1);
      updateTabTitle();
      renderConvList();
      itemEl = document.querySelector('.conv-item[data-key="' + key + '"]');
      if (itemEl) itemEl.classList.add('active');
    }
    
    // Hapus dari dropdown
    if (state.unreadList) {
       state.unreadList = state.unreadList.filter(n => !(n.channel === conv.channel && n.contactId === String(conv.id)));
       updateNotifDropdown();
    }

    $('#chatPanel').innerHTML = '<div class="empty-state">Memuat riwayat…</div>';

    try {
      const res = await apiFetch('/api/admin/history?channel=' + encodeURIComponent(conv.channel) + '&id=' + encodeURIComponent(conv.id));
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || ('Server merespons status ' + res.status));
      }
      const data = await res.json();
      renderChat(conv, data.history || []);
    } catch (err) {
      console.error('Gagal memuat riwayat percakapan:', err);
      $('#chatPanel').innerHTML =
        '<div class="empty-state"><span>Gagal memuat riwayat: ' + err.message + '</span><button class="secondary" id="retryLoadBtn">Coba lagi</button></div>';
      const retryBtn = document.getElementById('retryLoadBtn');
      if (retryBtn) retryBtn.addEventListener('click', () => selectConv(conv, itemEl));
    }
  }

  const escapeHTML = (str) => String(str || '').replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));

  function renderChat(conv, history) {
    const panel = $('#chatPanel');
    const label = conv.name ? conv.name + ' (' + conv.id + ')' : conv.id;
    panel.innerHTML =
      '<div id="chatHeader" class="justify-between" style="flex-wrap: wrap;">' +
        '<div style="display: flex; gap: 8px; align-items: center; overflow: hidden; min-width: 150px; flex: 1;">' +
          '<button class="back-btn" id="backToListBtn">← Kembali</button>' +
          '<div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' + (conv.channel === 'whatsapp' ? 'WhatsApp' : 'Telegram') + ' · ' + escapeHTML(label) + '</div>' +
        '</div>' +
        '<div style="display: flex; gap: 6px; align-items: center;">' +
          '<input type="text" id="searchMessageInput" placeholder="Cari pesan..." style="background: var(--bg); border: 1px solid var(--border); color: var(--text); font-size: 12px; padding: 6px 12px; border-radius: 6px; width: 160px; max-width: 100%;">' +
          '<button id="searchUpBtn" class="secondary" style="padding: 4px 8px; min-height: 28px; display: none;">↑</button>' +
          '<button id="searchDownBtn" class="secondary" style="padding: 4px 8px; min-height: 28px; display: none;">↓</button>' +
        '</div>' +
      '</div>' +
      '<div id="chatMessages"></div>';
    
    panel.querySelector('#backToListBtn').addEventListener('click', () => {
      $('#riwayatView').classList.remove('mobile-chat-active');
    });
    
    const msgEl = panel.querySelector('#chatMessages');
    const searchInput = panel.querySelector('#searchMessageInput');
    const upBtn = panel.querySelector('#searchUpBtn');
    const downBtn = panel.querySelector('#searchDownBtn');
    
    const bubbles = [];
    
    if (!history.length) {
      msgEl.innerHTML = '<div class="empty-state">Belum ada riwayat pesan (mungkin sudah kedaluwarsa).</div>';
      searchInput.style.display = 'none';
      return;
    }
    
    history.forEach((h, idx) => {
      const bubble = document.createElement('div');
      bubble.className = 'bubble ' + (h.role === 'user' ? 'user' : 'model');
      bubble.innerHTML = escapeHTML(h.text);
      msgEl.appendChild(bubble);
      bubbles.push({ el: bubble, text: String(h.text || ''), id: idx });
    });
    msgEl.scrollTop = msgEl.scrollHeight;
    
    let currentMatchIndex = -1;
    let matches = [];

    function focusMatch() {
      if (matches.length === 0) return;
      matches.forEach(m => m.classList.remove('active'));
      const activeMark = matches[currentMatchIndex];
      if (activeMark) {
        activeMark.classList.add('active');
        activeMark.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }

    function performSearch() {
      const query = searchInput.value.toLowerCase();
      
      matches = [];
      currentMatchIndex = -1;

      if (!query) {
        bubbles.forEach(b => { b.el.innerHTML = escapeHTML(b.text); });
        upBtn.style.display = 'none';
        downBtn.style.display = 'none';
        return;
      }

      bubbles.forEach(b => {
        if (b.text.toLowerCase().includes(query)) {
          // highlight matches
          // escape query for regex
          const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp('(' + escapeRegExp(query) + ')', 'gi');
          b.el.innerHTML = escapeHTML(b.text).replace(regex, '<mark class="search-highlight">$1</mark>');
          
          const marks = Array.from(b.el.querySelectorAll('mark.search-highlight'));
          matches.push(...marks);
        } else {
          b.el.innerHTML = escapeHTML(b.text);
        }
      });

      if (matches.length > 0) {
        upBtn.style.display = 'inline-flex';
        downBtn.style.display = 'inline-flex';
        // Jump to the most recent match
        currentMatchIndex = matches.length - 1;
        focusMatch();
      } else {
        upBtn.style.display = 'none';
        downBtn.style.display = 'none';
      }
    }

    searchInput.addEventListener('input', performSearch);
    
    upBtn.addEventListener('click', () => {
      if (matches.length === 0) return;
      currentMatchIndex--;
      if (currentMatchIndex < 0) currentMatchIndex = matches.length - 1;
      focusMatch();
    });

    downBtn.addEventListener('click', () => {
      if (matches.length === 0) return;
      currentMatchIndex++;
      if (currentMatchIndex >= matches.length) currentMatchIndex = 0;
      focusMatch();
    });
  }

  // ---------- Edit FAQ ----------
  let faqLoaded = false;
  async function loadFaq() {
    if (faqLoaded) return;
    faqLoaded = true;
    const res = await apiFetch('/api/admin/faq');
    const data = await res.json();
    $('#faqTextarea').value = data.content || '';
    $('#faqStatus').textContent = data.isCustom
      ? '✓ Memakai versi custom (sudah pernah diedit)'
      : 'Memakai versi default bawaan (belum pernah diedit)';
  }

  function initFaqView() {
    faqLoaded = false;
    loadFaq();
    $('#reloadFaqBtn').addEventListener('click', () => { faqLoaded = false; loadFaq(); });
    $('#saveFaqBtn').addEventListener('click', saveFaq);
  }

  async function saveFaq() {
    const content = $('#faqTextarea').value;
    const btn = $('#saveFaqBtn');
    const toast = $('#faqToast');
    btn.disabled = true;
    toast.textContent = 'Menyimpan…';
    toast.className = 'toast';

    try {
      const res = await apiFetch('/api/admin/faq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan.');
      toast.textContent = '✓ Tersimpan. Perubahan langsung berlaku ke bot, tanpa perlu deploy ulang.';
      toast.className = 'toast success';
      faqLoaded = false;
      loadFaq();
    } catch (err) {
      toast.textContent = '✗ ' + err.message;
      toast.className = 'toast error';
    } finally {
      btn.disabled = false;
    }
  }
