// ====== GITHUB PAT BACKEND ENGINE ======
const DB_FILE = 'catalog.json';

function getGHConfig() {
  return {
    owner: localStorage.getItem('gh_owner'),
    repo: localStorage.getItem('gh_repo'),
    pat: localStorage.getItem('gh_pat')
  };
}

function utf8ToBase64(str) { return btoa(unescape(encodeURIComponent(str))); }
function base64ToUtf8(str) { return decodeURIComponent(escape(atob(str))); }

const productsMap = new Map();
let cachedProducts = null;
let currentSha = null;

async function fetchFromGitHub() {
  const conf = getGHConfig();
  if (!conf.owner || !conf.repo) return [];

  try {
    const res = await fetch(`https://api.github.com/repos/${conf.owner}/${conf.repo}/contents/${DB_FILE}`, {
      headers: conf.pat ? { 'Authorization': `token ${conf.pat}`, 'Accept': 'application/vnd.github.v3+json' } : { 'Accept': 'application/vnd.github.v3+json' }
    });
    
    if (res.status === 404) return [];
    if (!res.ok) throw new Error("GitHub fetch failed");
    
    const data = await res.json();
    currentSha = data.sha;
    return JSON.parse(base64ToUtf8(data.content));
  } catch (err) {
    console.error(err);
    return [];
  }
}

async function saveToGitHub(productsArray) {
  const conf = getGHConfig();
  if (!conf.pat) { showToast("Not authenticated."); return; }
  
  const content = utf8ToBase64(JSON.stringify(productsArray, null, 2));
  const body = {
    message: "Automated DB Update via GeekShop Admin",
    content: content,
    ...(currentSha && { sha: currentSha })
  };

  const res = await fetch(`https://api.github.com/repos/${conf.owner}/${conf.repo}/contents/${DB_FILE}`, {
    method: 'PUT',
    headers: { 'Authorization': `token ${conf.pat}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) throw new Error("Failed to save to GitHub");
  const data = await res.json();
  currentSha = data.content.sha;
  cachedProducts = productsArray;
}

// ====== UI HELPERS ======
function showToast(message) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'fixed top-6 left-1/2 -translate-x-1/2 z-[300] flex flex-col gap-2 pointer-events-none w-full max-w-sm px-4';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = 'bg-surface-container-high/95 backdrop-blur-md text-on-surface text-xs font-bold uppercase tracking-wider px-5 py-3 rounded-xl border border-primary/20 shadow-2xl flex items-center gap-3 transition-all duration-300 opacity-0 -translate-y-2 pointer-events-auto';
  toast.innerHTML = `<span class="material-symbols-outlined text-primary text-lg">info</span><span class="flex-1 truncate">${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.classList.remove('opacity-0', '-translate-y-2'), 10);
  setTimeout(() => {
    toast.classList.add('opacity-0', '-translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

async function loadProducts(forceRefresh = false) {
  if (forceRefresh || !cachedProducts) cachedProducts = await fetchFromGitHub();
  productsMap.clear();
  cachedProducts.forEach(p => productsMap.set(p.id, p));
  return cachedProducts;
}

function shuffle(array) { return array.slice().sort(() => Math.random() - 0.5); }

function parseDataList(dataStr) {
  if (!dataStr) return {};
  const obj = {};
  dataStr.split('\n').forEach(line => {
    if (line.includes(':')) {
      const [k, ...v] = line.split(':');
      if (k.trim() && v.join(':').trim()) obj[k.trim()] = v.join(':').trim();
    }
  });
  return obj;
}

function parseNumberFromPrice(priceStr) {
  if (!priceStr) return 0;
  const match = priceStr.match(/[\d,.]+/);
  return match ? parseFloat(match[0].replace(/,/g, '')) : 0;
}

// Automatic score calculation from sub-scores
function calculateFinalScore(product) {
  const subscores = parseDataList(product.subScores);
  const keys = Object.keys(subscores);
  if (keys.length > 0) {
    let sum = 0, count = 0;
    keys.forEach(k => {
      const valStr = subscores[k].toString().replace('/10', '').trim();
      const num = parseFloat(valStr);
      if (!isNaN(num)) {
        sum += num;
        count++;
      }
    });
    if (count > 0) return (sum / count).toFixed(1);
  }
  return product.score || "N/A";
}

function generateStarsHTML(scoreNum) {
  const numericScore = parseFloat(scoreNum) || 0;
  const s = numericScore / 2;
  let html = '';
  for(let i=1; i<=5; i++) {
    if (s >= i) html += `<span class="material-symbols-outlined text-yellow-400" style="font-variation-settings: 'FILL' 1;">star</span>`;
    else if (s >= i - 0.5) html += `<span class="material-symbols-outlined text-yellow-400" style="font-variation-settings: 'FILL' 1;">star_half</span>`;
    else html += `<span class="material-symbols-outlined text-yellow-400/30">star</span>`;
  }
  html += `<span class="text-on-surface font-bold text-xl ml-2 font-mono">${numericScore}/10</span>`;
  return html;
}

function createProductCard(p) {
  let slug = p.name.toLowerCase().replace(/\s+/g, '-');
  const displayScore = calculateFinalScore(p);

  const card = document.createElement('div');
  card.className = "group relative bg-surface-container-low rounded-xl overflow-hidden transition-all duration-500 hover:translate-y-[-8px] border border-white/5 hover:border-primary/30 flex flex-col cursor-pointer";
  card.onclick = () => window.location.href = `product.html?slug=${slug}`;
  
  let badgeHTML = p.hotDeal ? `<span class="bg-primary text-on-primary-fixed text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest shadow-xl mr-1 mb-1 inline-block">Top Pick</span>` : '';
  
  card.innerHTML = `
    <div class="aspect-[4/5] bg-surface-container-lowest relative overflow-hidden flex-shrink-0">
      <img class="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700 scale-105 group-hover:scale-100" src="${p.images?.[0] || 'logo.png'}" alt="${p.name}">
      <div class="absolute top-4 left-4 right-4 flex flex-wrap z-10">${badgeHTML}</div>
      <div class="absolute bottom-4 right-4 bg-surface-bright/90 backdrop-blur-md rounded-full px-3 py-1 flex items-center justify-center text-primary shadow-2xl z-20 font-bold text-sm">
        <span class="material-symbols-outlined text-sm mr-1">star</span> ${displayScore}
      </div>
    </div>
    <div class="p-6 flex-1 flex flex-col justify-between">
      <div>
        <div class="flex justify-between items-start gap-2 mb-2">
           <h3 class="text-xl font-bold tracking-tight line-clamp-1">${p.name}</h3>
           ${p.price ? `<span class="text-primary font-mono text-sm">${p.price}</span>` : ''}
        </div>
        <p class="text-sm text-outline mb-4 line-clamp-2">${p.description || p.metaDescription || 'Detailed review available.'}</p>
      </div>
      <div class="flex gap-2 mt-auto">
        ${p.category ? `<span class="bg-surface-container-highest text-[10px] text-on-surface-variant font-bold px-3 py-1 rounded-full truncate">${p.category}</span>` : ''}
      </div>
    </div>
  `;
  return card;
}

// Compact Cards for Similar Products
function createCompactProductCard(p) {
  let slug = p.name.toLowerCase().replace(/\s+/g, '-');
  const displayScore = calculateFinalScore(p);

  const card = document.createElement('div');
  card.className = "group bg-surface-container-low rounded-xl p-3 border border-white/5 hover:border-primary/40 transition-all flex items-center gap-4 cursor-pointer";
  card.onclick = () => window.location.href = `product.html?slug=${slug}`;

  card.innerHTML = `
    <img src="${p.images?.[0] || 'logo.png'}" class="w-20 h-20 object-cover rounded-lg bg-surface-container flex-shrink-0 grayscale group-hover:grayscale-0 transition-all">
    <div class="flex-1 min-w-0">
      <h4 class="font-bold text-sm text-on-surface truncate group-hover:text-primary transition-colors">${p.name}</h4>
      <div class="text-xs text-primary font-mono mt-1">${p.price || ''}</div>
      <div class="flex items-center gap-1 mt-2 text-xs text-yellow-400">
        <span class="material-symbols-outlined text-sm">star</span>
        <span class="font-bold font-mono text-on-surface">${displayScore}</span>
      </div>
    </div>
  `;
  return card;
}

// ====== ROUTERS ======
document.addEventListener('DOMContentLoaded', async () => {
  
  // 1. ADMIN PAGE
  if (document.getElementById('login-section')) {
    const loginSec = document.getElementById('login-section');
    const dashSec = document.getElementById('dashboard-section');
    
    if (getGHConfig().pat) {
      loginSec.classList.add('hidden');
      dashSec.classList.remove('hidden');
      document.getElementById('logout-btn').classList.remove('hidden');
      loadProducts().then(renderAdminList);
    }

    // Auto-format double spaces into '|' for Merchants & Author Socials
    ['p-merchants', 'p-author-socials'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', function() {
          if (this.value.includes('  ')) {
            const start = this.selectionStart;
            this.value = this.value.replace(/  /g, '|');
            this.setSelectionRange(start - 1, start - 1);
          }
        });
      }
    });

    document.getElementById('login-form').addEventListener('submit', (e) => {
      e.preventDefault();
      localStorage.setItem('gh_owner', document.getElementById('gh-owner').value.trim());
      localStorage.setItem('gh_repo', document.getElementById('gh-repo').value.trim());
      localStorage.setItem('gh_pat', document.getElementById('gh-pat').value.trim());
      window.location.reload();
    });

    document.getElementById('logout-btn').addEventListener('click', () => {
      localStorage.removeItem('gh_owner');
      localStorage.removeItem('gh_repo');
      localStorage.removeItem('gh_pat');
      window.location.reload();
    });

    document.getElementById('tab-add').addEventListener('click', (e) => {
      document.getElementById('view-add').classList.remove('hidden');
      document.getElementById('view-manage').classList.add('hidden');
      e.target.className = "px-6 py-2 text-xs font-bold uppercase tracking-widest rounded-lg bg-surface-container-low text-primary transition-all";
      document.getElementById('tab-manage').className = "px-6 py-2 text-xs font-bold uppercase tracking-widest rounded-lg text-outline hover:text-slate-200 transition-all border border-transparent";
    });

    document.getElementById('tab-manage').addEventListener('click', (e) => {
      document.getElementById('view-manage').classList.remove('hidden');
      document.getElementById('view-add').classList.add('hidden');
      e.target.className = "px-6 py-2 text-xs font-bold uppercase tracking-widest rounded-lg bg-surface-container-low text-primary transition-all";
      document.getElementById('tab-add').className = "px-6 py-2 text-xs font-bold uppercase tracking-widest rounded-lg text-outline hover:text-slate-200 transition-all border border-transparent";
    });

    let editId = null;
    document.getElementById('product-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('submit-btn');
      btn.innerHTML = `Saving...`;
      
      const product = {
        id: editId || Date.now().toString(),
        name: document.getElementById('p-name').value.trim(),
        category: document.getElementById('p-category').value,
        price: document.getElementById('p-price').value.trim(),
        score: document.getElementById('p-score').value.trim(),
        pros: document.getElementById('p-pros').value.split('\n').filter(Boolean),
        cons: document.getElementById('p-cons').value.split('\n').filter(Boolean),
        verdict: document.getElementById('p-verdict').value.trim(),
        description: document.getElementById('p-desc').value.trim(),
        metaDescription: document.getElementById('p-meta-desc').value.trim(),
        detailedDescription: document.getElementById('p-detailed-desc').value.trim(),
        specs: document.getElementById('p-specs').value.trim(),
        subScores: document.getElementById('p-subscores').value.trim(),
        images: [document.getElementById('p-images').value.trim()].filter(Boolean),
        merchants: document.getElementById('p-merchants').value.split('\n').map(u=>u.trim()).filter(Boolean),
        authorName: document.getElementById('p-author-name').value.trim(),
        authorImg: document.getElementById('p-author-img').value.trim(),
        authorSocials: document.getElementById('p-author-socials').value.split('\n').map(s=>s.trim()).filter(Boolean),
        hotDeal: document.getElementById('p-hot').checked,
        timestamp: Date.now()
      };

      try {
        let products = await loadProducts();
        if (editId) products = products.map(p => p.id === editId ? product : p);
        else products.push(product);
        
        await saveToGitHub(products);
        showToast("Review saved successfully!");
        document.getElementById('product-form').reset();
        editId = null;
        document.getElementById('form-title').innerText = "Post New Review";
        renderAdminList();
      } catch (err) { showToast("Error saving to GitHub."); }
      btn.innerHTML = `Publish Post`;
    });

    async function renderAdminList() {
      const list = document.getElementById('admin-products-list');
      const products = await loadProducts();
      list.innerHTML = '';
      
      products.reverse().forEach(p => {
        const div = document.createElement('div');
        div.className = "flex items-center justify-between p-4 bg-surface-container-lowest rounded-xl border border-white/5";
        div.innerHTML = `
          <div class="flex items-center gap-4">
            <img src="${p.images?.[0] || 'logo.png'}" class="w-12 h-12 object-cover rounded bg-surface-container">
            <div>
              <div class="font-bold text-sm">${p.name} <span class="text-primary text-xs ml-2">Score: ${calculateFinalScore(p)}/10</span></div>
              <div class="text-xs text-outline">${p.category || 'Uncategorized'}</div>
            </div>
          </div>
          <div class="flex gap-2">
            <button class="edit-btn px-3 py-1 bg-surface-variant hover:bg-surface-container-high rounded text-xs font-bold">Edit</button>
            <button class="delete-btn px-3 py-1 bg-red-900/30 hover:bg-red-900/60 text-red-400 rounded text-xs font-bold">Delete</button>
          </div>
        `;
        
        div.querySelector('.edit-btn').onclick = () => {
          editId = p.id;
          document.getElementById('form-title').innerText = "Edit Review: " + p.name;
          document.getElementById('p-name').value = p.name;
          document.getElementById('p-category').value = p.category || '';
          document.getElementById('p-price').value = p.price || '';
          document.getElementById('p-score').value = p.score || '';
          document.getElementById('p-pros').value = (p.pros || []).join('\n');
          document.getElementById('p-cons').value = (p.cons || []).join('\n');
          document.getElementById('p-verdict').value = p.verdict || '';
          document.getElementById('p-desc').value = p.description || '';
          document.getElementById('p-meta-desc').value = p.metaDescription || '';
          document.getElementById('p-detailed-desc').value = p.detailedDescription || '';
          document.getElementById('p-specs').value = p.specs || '';
          document.getElementById('p-subscores').value = p.subScores || '';
          document.getElementById('p-images').value = p.images?.[0] || '';
          document.getElementById('p-merchants').value = (p.merchants || []).join('\n');
          document.getElementById('p-author-name').value = p.authorName || '';
          document.getElementById('p-author-img').value = p.authorImg || '';
          document.getElementById('p-author-socials').value = (p.authorSocials || []).join('\n');
          document.getElementById('p-hot').checked = p.hotDeal || false;
          document.getElementById('tab-add').click();
          window.scrollTo(0,0);
        };
        
        div.querySelector('.delete-btn').onclick = async () => {
          if (confirm("Delete this review forever?")) {
            await saveToGitHub(products.filter(item => item.id !== p.id));
            showToast("Review deleted");
            renderAdminList();
          }
        };
        list.appendChild(div);
      });
    }

    document.getElementById('sync-catalog-btn').addEventListener('click', async () => {
      await loadProducts(true);
      showToast("Database Synced with GitHub");
    });
  }

  // 2. SINGLE PRODUCT PAGE
  if (document.getElementById('product-name')) {
    const urlParams = new URLSearchParams(window.location.search);
    const slug = urlParams.get('slug');
    if (!slug) return;

    const products = await loadProducts();
    const product = products.find(p => p.name.toLowerCase().replace(/\s+/g, '-') === slug);

    if (!product) {
      document.getElementById('product-name').textContent = "Review Not Found";
      return;
    }

    const calculatedScore = calculateFinalScore(product);

    document.title = product.name + " Review | The Geek Shop";
    document.getElementById('product-name').textContent = product.name;
    document.getElementById('product-score-stars').innerHTML = generateStarsHTML(calculatedScore);
    document.getElementById('product-price').textContent = product.price || '';
    document.getElementById('product-meta-desc').textContent = product.metaDescription || product.description;
    document.getElementById('product-detailed-desc').innerHTML = product.detailedDescription || "No detailed review provided.";
    
    if (product.images && product.images.length > 0) {
      document.getElementById('main-image').src = product.images[0];
    }

    // Specs Block
    const specs = parseDataList(product.specs);
    const specsGrid = document.getElementById('product-specs-grid');
    if (Object.keys(specs).length > 0) {
      specsGrid.innerHTML = Object.entries(specs).map(([k, v]) => `
        <div class="flex justify-between border-b border-white/5 pb-2">
          <span class="text-outline">${k}</span>
          <span class="text-on-surface font-medium text-right max-w-[60%]">${v}</span>
        </div>
      `).join('');
    } else {
      specsGrid.innerHTML = `<span class="text-outline">No specs provided.</span>`;
    }

    // Epic Games Style Circular Sub-Scores
    const subscores = parseDataList(product.subScores);
    const subscoresGrid = document.getElementById('subscores-grid');
    if (Object.keys(subscores).length > 0) {
      document.getElementById('subscores-wrapper').classList.remove('hidden');
      subscoresGrid.innerHTML = Object.entries(subscores).map(([k, v]) => {
        const numVal = parseFloat(v.toString().replace('/10','')) || 0;
        const dashOffset = 100 - (numVal * 10);
        return `
          <div class="bg-surface-container-low border border-white/5 p-4 rounded-xl flex flex-col items-center justify-center text-center space-y-3">
            <div class="relative w-16 h-16 flex items-center justify-center">
              <svg class="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                <path class="text-surface-variant" stroke-width="3" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                <path class="text-primary" stroke-width="3.5" stroke-dasharray="100" stroke-dashoffset="${dashOffset}" stroke-linecap="round" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
              </svg>
              <span class="absolute font-mono font-bold text-sm text-on-surface">${numVal}</span>
            </div>
            <span class="text-[11px] font-bold uppercase tracking-wider text-outline truncate w-full">${k}</span>
          </div>
        `;
      }).join('');
    }

    // Pros & Cons
    const proConSection = document.getElementById('pros-cons-section');
    if (product.pros?.length || product.cons?.length) {
      let html = `<div class="grid grid-cols-1 md:grid-cols-2 gap-6">`;
      html += `<div class="bg-green-500/10 border border-green-500/20 rounded-xl p-8">
                <h3 class="text-green-400 font-bold mb-4 flex items-center gap-2 text-xl"><span class="material-symbols-outlined">check_circle</span> Pros</h3>
                <ul class="space-y-3 text-on-surface">` + 
                (product.pros || []).map(p => `<li>• ${p}</li>`).join('') + `</ul></div>`;
                
      html += `<div class="bg-red-500/10 border border-red-500/20 rounded-xl p-8">
                <h3 class="text-red-400 font-bold mb-4 flex items-center gap-2 text-xl"><span class="material-symbols-outlined">cancel</span> Cons</h3>
                <ul class="space-y-3 text-on-surface">` + 
                (product.cons || []).map(c => `<li>• ${c}</li>`).join('') + `</ul></div></div>`;
      proConSection.innerHTML = html;
    }

    // Verdict & Author Box
    const verdictContainer = document.getElementById('verdict-container');
    if (product.verdict) {
      verdictContainer.innerHTML = `
        <div class="bg-surface-container-high rounded-2xl p-8 border border-primary/20 h-full flex flex-col justify-center">
          <h3 class="text-primary font-bold mb-4 uppercase tracking-widest text-sm flex items-center gap-2"><span class="material-symbols-outlined">gavel</span> Final Verdict</h3>
          <p class="text-on-surface leading-relaxed text-xl font-display">"${product.verdict}"</p>
        </div>`;
    }
    
    const authorContainer = document.getElementById('author-container');
    if (product.authorName) {
      let avatarHTML = product.authorImg 
        ? `<img src="${product.authorImg}" class="w-16 h-16 rounded-full object-cover mb-3 border border-primary/30">`
        : `<div class="w-16 h-16 bg-surface-variant rounded-full mb-3 flex items-center justify-center text-primary text-2xl font-bold font-display uppercase border border-primary/20">${product.authorName.charAt(0)}</div>`;

      let socialsHTML = '';
      if (product.authorSocials && product.authorSocials.length > 0) {
        socialsHTML = `<div class="flex flex-wrap gap-2 justify-center mt-3">` + product.authorSocials.map(s => {
          const parts = s.split('|');
          return `<a href="${parts[1] || '#'}" target="_blank" class="text-xs bg-surface-container hover:bg-surface-variant text-primary border border-primary/20 px-3 py-1 rounded-full transition-all">${parts[0] || 'Social'}</a>`;
        }).join('') + `</div>`;
      }

      authorContainer.innerHTML = `
        <div class="bg-surface-container-low rounded-2xl p-6 border border-white/5 h-full flex flex-col justify-center items-center text-center">
          ${avatarHTML}
          <p class="text-[10px] uppercase tracking-widest text-outline">Reviewed By</p>
          <h4 class="text-lg font-bold text-on-surface mb-1">${product.authorName}</h4>
          ${socialsHTML}
        </div>`;
    }

    // Buy Links (Side by Side)
    const orderRow = document.getElementById('order-row');
    if (product.merchants && product.merchants.length > 0) {
      orderRow.innerHTML = product.merchants.map(m => {
        const parts = m.split('|');
        return `
          <a href="${parts[1] || '#'}" target="_blank" class="flex-shrink-0 flex items-center gap-2 bg-surface-container hover:bg-surface-variant border border-white/10 hover:border-primary/50 transition-all rounded-lg px-5 py-2.5 group">
            <span class="font-bold font-display text-sm group-hover:text-primary transition-colors">${parts[0] || 'Store'}</span>
            <span class="material-symbols-outlined text-outline text-sm group-hover:text-white transition-colors">shopping_cart</span>
          </a>
        `;
      }).join('');
    } else {
      orderRow.innerHTML = '<div class="px-4 py-2 bg-surface-container rounded-lg text-outline text-sm border border-white/5">No active listings available.</div>';
    }

    // Similar Products (Filtered by price range +-100 to 500 BDT)
    const similarContainer = document.getElementById('similar-grid');
    const currentPriceNum = parseNumberFromPrice(product.price);
    
    let similar = products.filter(p => {
      if (p.id === product.id) return false;
      const pPriceNum = parseNumberFromPrice(p.price);
      if (!currentPriceNum || !pPriceNum) return p.category === product.category;
      
      const diff = Math.abs(pPriceNum - currentPriceNum);
      return diff <= 500; // Within 100-500 price tolerance range
    });

    if (similar.length < 4) {
      const remaining = products.filter(p => p.id !== product.id && !similar.includes(p));
      similar = [...similar, ...remaining];
    }

    similar = similar.slice(0, 4); // Keep exactly 4 compact items
    if(similar.length > 0) {
      similar.forEach(p => similarContainer.appendChild(createCompactProductCard(p)));
    } else {
      similarContainer.innerHTML = '<span class="text-outline">No similar products found within price range.</span>';
    }
  }
});
