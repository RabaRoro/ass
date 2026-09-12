// ====== GITHUB PAT BACKEND ENGINE ======
const DB_FILE = 'catalog.json';

function getGHConfig() {
  return {
    owner: localStorage.getItem('gh_owner'),
    repo: localStorage.getItem('gh_repo'),
    pat: localStorage.getItem('gh_pat')
  };
}

// Base64 Helpers for UTF-8 support
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

function createProductCard(p) {
  let slug = p.name.toLowerCase().replace(/\s+/g, '-');
  
  const card = document.createElement('div');
  card.className = "group relative bg-surface-container-low rounded-xl overflow-hidden transition-all duration-500 hover:translate-y-[-8px] border border-white/5 hover:border-primary/30 flex flex-col cursor-pointer";
  card.onclick = () => window.location.href = `product.html?slug=${slug}`;
  
  let badgeHTML = p.hotDeal ? `<span class="bg-primary text-on-primary-fixed text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest shadow-xl mr-1 mb-1 inline-block">Top Pick</span>` : '';
  
  card.innerHTML = `
    <div class="aspect-[4/5] bg-surface-container-lowest relative overflow-hidden flex-shrink-0">
      <img class="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700 scale-105 group-hover:scale-100" src="${p.images?.[0] || 'logo.png'}" alt="${p.name}">
      <div class="absolute top-4 left-4 right-4 flex flex-wrap z-10">${badgeHTML}</div>
      <div class="absolute bottom-4 right-4 bg-surface-bright/90 backdrop-blur-md rounded-full px-3 py-1 flex items-center justify-center text-primary shadow-2xl z-20 font-bold text-sm">
        <span class="material-symbols-outlined text-sm mr-1">star</span> ${p.score || 'N/A'}
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

function generateStarsHTML(scoreNum) {
  const s = parseFloat(scoreNum || 0) / 2;
  let html = '';
  for(let i=1; i<=5; i++) {
    if (s >= i) html += `<span class="material-symbols-outlined text-yellow-400" style="font-variation-settings: 'FILL' 1;">star</span>`;
    else if (s >= i - 0.5) html += `<span class="material-symbols-outlined text-yellow-400" style="font-variation-settings: 'FILL' 1;">star_half</span>`; // Uses half star if supported, else looks full or empty
    else html += `<span class="material-symbols-outlined text-yellow-400/30">star</span>`;
  }
  html += `<span class="text-on-surface font-bold text-xl ml-2 font-mono">${scoreNum}/10</span>`;
  return html;
}

// ====== PAGE ROUTERS (DOM Based Detection) ======
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

    // Auto-format double spaces into '|' for merchant URLs
    document.getElementById('p-merchants').addEventListener('input', function(e) {
      if (this.value.includes('  ')) {
        const start = this.selectionStart;
        this.value = this.value.replace(/  /g, '|');
        this.setSelectionRange(start - 1, start - 1);
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
        authorUrl: document.getElementById('p-author-url').value.trim(),
        hotDeal: document.getElementById('p-hot').checked,
        timestamp: Date.now()
      };

      try {
        let products = await loadProducts();
        if (editId) products = products.map(p => p.id === editId ? product : p);
        else products.push(product);
        
        await saveToGitHub(products);
        showToast("Review published successfully!");
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
              <div class="font-bold text-sm">${p.name} <span class="text-primary text-xs ml-2">Score: ${p.score}/10</span></div>
              <div class="text-xs text-outline">${p.category}</div>
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
          document.getElementById('p-author-url').value = p.authorUrl || '';
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

  // 2. HOME PAGE (INDEX)
  if (document.getElementById('interest-products')) {
    const products = await loadProducts();
    const container = document.getElementById('interest-products');
    container.innerHTML = '';
    if (!products.length) container.innerHTML = `<div class="col-span-full py-12 text-center text-outline">No reviews yet. Admin needs to publish some.</div>`;
    else shuffle(products).slice(0, 8).forEach(p => container.appendChild(createProductCard(p)));
  }

  // 3. CATALOG PAGE (PRODUCTS)
  if (document.getElementById('products-grid')) {
    const container = document.getElementById('products-grid');
    const searchInput = document.getElementById('search-input');
    const products = await loadProducts();
    
    const params = new URLSearchParams(window.location.search);
    if (params.get('search') && searchInput) searchInput.value = params.get('search');

    function renderGrid() {
      let result = [...products].reverse();
      if (searchInput && searchInput.value) {
        const q = searchInput.value.toLowerCase();
        result = result.filter(p => p.name.toLowerCase().includes(q));
      }
      container.innerHTML = '';
      if (!result.length) container.innerHTML = `<div class="col-span-full text-center py-12 text-outline bg-surface-container-low rounded-xl">No reviews found.</div>`;
      else result.forEach(p => container.appendChild(createProductCard(p)));
    }
    
    if (searchInput) searchInput.addEventListener('input', renderGrid);
    renderGrid();
  }

  // 4. SINGLE PRODUCT PAGE
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

    document.title = product.name + " Review | The Geek Shop";
    document.getElementById('product-name').textContent = product.name;
    document.getElementById('product-score-stars').innerHTML = generateStarsHTML(product.score);
    document.getElementById('product-price').textContent = product.price || '';
    document.getElementById('product-meta-desc').textContent = product.metaDescription || product.description;
    document.getElementById('product-detailed-desc').innerHTML = product.detailedDescription || "No detailed review provided.";
    
    if (product.images && product.images.length > 0) {
      document.getElementById('main-image').src = product.images[0];
    }

    // Build Specifications Block
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

    // Build Sub-scores Block
    const subscores = parseDataList(product.subScores);
    const subscoresGrid = document.getElementById('subscores-grid');
    if (Object.keys(subscores).length > 0) {
      document.getElementById('subscores-wrapper').classList.remove('hidden');
      subscoresGrid.innerHTML = Object.entries(subscores).map(([k, v]) => `
        <div class="bg-surface-container-low border border-white/5 p-4 rounded-xl flex justify-between items-center">
          <span class="text-outline font-bold text-sm uppercase tracking-widest">${k}</span>
          <span class="text-primary font-mono font-bold">${v}</span>
        </div>
      `).join('');
    }

    // Build Pros & Cons
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

    // Final Verdict & Author Box
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
      authorContainer.innerHTML = `
        <div class="bg-surface-container-low rounded-2xl p-8 border border-white/5 h-full flex flex-col justify-center items-center text-center">
          <div class="w-16 h-16 bg-surface-variant rounded-full mb-4 flex items-center justify-center text-primary text-2xl font-bold font-display uppercase border border-primary/20">
            ${product.authorName.charAt(0)}
          </div>
          <p class="text-xs uppercase tracking-widest text-outline mb-1">Reviewed By</p>
          <h4 class="text-lg font-bold text-on-surface mb-2">${product.authorName}</h4>
          ${product.authorUrl ? `<a href="${product.authorUrl}" target="_blank" class="text-sm text-primary hover:underline">Follow Author</a>` : ''}
        </div>`;
    }

    // Side-by-side Merchant Links
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

    // Inject 4 Similar Products Based on Category (or fallback to newest)
    const similarContainer = document.getElementById('similar-grid');
    let similar = products.filter(p => p.id !== product.id && p.category === product.category);
    if (similar.length < 4) {
      // Pad with other recent items if category doesn't have enough
      const others = products.filter(p => p.id !== product.id && p.category !== product.category);
      similar = [...similar, ...others];
    }
    similar = similar.slice(0, 4); // Take exactly up to 4
    if(similar.length > 0) {
      similar.forEach(p => similarContainer.appendChild(createProductCard(p)));
    } else {
      similarContainer.innerHTML = '<span class="text-outline">No other reviews yet.</span>';
    }
  }
});