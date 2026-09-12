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

// Global Memory
const productsMap = new Map();
let cachedProducts = null;
let currentSha = null;

async function fetchFromGitHub() {
  // If no config locally (meaning it's a regular user), fetch public raw file
  const conf = getGHConfig();
  if (!conf.owner || !conf.repo) {
    console.log("No GH config found. You must be setting this up or need to run admin.html first.");
    return [];
  }

  try {
    const res = await fetch(`https://api.github.com/repos/${conf.owner}/${conf.repo}/contents/${DB_FILE}`, {
      headers: conf.pat ? { 'Authorization': `token ${conf.pat}`, 'Accept': 'application/vnd.github.v3+json' } : { 'Accept': 'application/vnd.github.v3+json' }
    });
    
    if (res.status === 404) return []; // File doesn't exist yet
    if (!res.ok) throw new Error("GitHub fetch failed");
    
    const data = await res.json();
    currentSha = data.sha;
    const content = base64ToUtf8(data.content);
    return JSON.parse(content);
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

function parseSpecsData(specData) {
  if (!specData) return {};
  if (typeof specData === 'object') return specData;
  const specsObj = {};
  specData.split('\n').forEach(line => {
    if (line.includes(':')) {
      const [k, ...v] = line.split(':');
      if (k.trim() && v.join(':').trim()) specsObj[k.trim()] = v.join(':').trim();
    }
  });
  return specsObj;
}

function createProductCard(p, products) {
  const sameName = products.filter(other => other.name.toLowerCase() === p.name.toLowerCase());
  let slug = p.name.toLowerCase().replace(/\s+/g, '-');
  if (sameName.length > 1 && p.color) slug += '-' + p.color.toLowerCase().replace(/\s+/g, '-');
  
  const card = document.createElement('div');
  card.className = "group relative bg-surface-container-low rounded-xl overflow-hidden transition-all duration-500 hover:translate-y-[-8px] border border-white/5 hover:border-primary/30 flex flex-col cursor-pointer";
  card.onclick = () => window.location.href = `product.html?slug=${slug}`;
  
  let badgeHTML = p.hotDeal ? `<span class="bg-primary text-on-primary-fixed text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest shadow-xl mr-1 mb-1 inline-block">Top Pick</span>` : '';
  
  card.innerHTML = `
    <div class="aspect-[4/5] bg-surface-container-lowest relative overflow-hidden flex-shrink-0">
      <img class="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700 scale-105 group-hover:scale-100" src="${p.images?.[0] || 'logo.png'}" alt="${p.name}">
      <div class="absolute top-4 left-4 right-4 flex flex-wrap z-10">${badgeHTML}</div>
      <div class="absolute bottom-4 right-4 bg-surface-bright/90 backdrop-blur-md rounded-full px-3 py-1 flex items-center justify-center text-primary shadow-2xl z-20 font-bold text-sm">
        <span class="material-symbols-outlined text-sm mr-1">star</span> ${p.score || 'N/A'}/10
      </div>
    </div>
    <div class="p-6 flex-1 flex flex-col justify-between">
      <div>
        <h3 class="text-xl font-bold tracking-tight line-clamp-1 mb-2">${p.name}</h3>
        <p class="text-sm text-outline mb-4 line-clamp-2">${p.description || p.metaDescription || 'Detailed review available.'}</p>
      </div>
      <div class="flex gap-2 mt-auto">
        ${p.color ? `<span class="bg-surface-container-highest text-[10px] text-on-surface-variant font-bold px-3 py-1 rounded-full truncate max-w-[50%]">${p.color}</span>` : ''}
        ${p.category ? `<span class="bg-surface-container-highest text-[10px] text-on-surface-variant font-bold px-3 py-1 rounded-full truncate max-w-[50%]">${p.category}</span>` : ''}
      </div>
    </div>
  `;
  return card;
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
      btn.innerHTML = `<span class="material-symbols-outlined animate-spin">sync</span> Saving...`;
      
      const product = {
        id: editId || Date.now().toString(),
        name: document.getElementById('p-name').value.trim(),
        category: document.getElementById('p-category').value,
        color: document.getElementById('p-color').value.trim(),
        score: document.getElementById('p-score').value.trim(),
        pros: document.getElementById('p-pros').value.split('\n').filter(Boolean),
        cons: document.getElementById('p-cons').value.split('\n').filter(Boolean),
        verdict: document.getElementById('p-verdict').value.trim(),
        description: document.getElementById('p-desc').value.trim(),
        metaDescription: document.getElementById('p-meta-desc').value.trim(),
        detailedDescription: document.getElementById('p-detailed-desc').value.trim(),
        specs: document.getElementById('p-specs').value.trim(),
        images: document.getElementById('p-images').value.split('\n').map(u=>u.trim()).filter(Boolean),
        merchants: document.getElementById('p-merchants').value.split('\n').map(u=>u.trim()).filter(Boolean),
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
      btn.innerHTML = `<span class="material-symbols-outlined">add_circle</span> Publish Post`;
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
          document.getElementById('p-category').value = p.category;
          document.getElementById('p-color').value = p.color || '';
          document.getElementById('p-score').value = p.score || '';
          document.getElementById('p-pros').value = (p.pros || []).join('\n');
          document.getElementById('p-cons').value = (p.cons || []).join('\n');
          document.getElementById('p-verdict').value = p.verdict || '';
          document.getElementById('p-desc').value = p.description || '';
          document.getElementById('p-meta-desc').value = p.metaDescription || '';
          document.getElementById('p-detailed-desc').value = p.detailedDescription || '';
          document.getElementById('p-specs').value = p.specs || '';
          document.getElementById('p-images').value = (p.images || []).join('\n');
          document.getElementById('p-merchants').value = (p.merchants || []).join('\n');
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
    else shuffle(products).slice(0, 8).forEach(p => container.appendChild(createProductCard(p, products)));
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
      else result.forEach(p => container.appendChild(createProductCard(p, products)));
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
    const product = products.find(p => {
      const sameName = products.filter(other => other.name.toLowerCase() === p.name.toLowerCase());
      let generatedSlug = p.name.toLowerCase().replace(/\s+/g, '-');
      if (sameName.length > 1 && p.color) generatedSlug += '-' + p.color.toLowerCase().replace(/\s+/g, '-');
      return generatedSlug === slug;
    });

    if (!product) {
      document.getElementById('product-name').textContent = "Review Not Found";
      return;
    }

    document.title = product.name + " Review | The Geek Shop";
    document.getElementById('product-name').textContent = product.name;
    document.getElementById('product-price').innerHTML = `<span class="material-symbols-outlined text-3xl align-middle">star</span> ${product.score || 'N/A'}/10 Score`;
    document.getElementById('product-meta-desc').textContent = product.metaDescription || product.description;
    document.getElementById('product-detailed-desc').innerHTML = product.detailedDescription || "No detailed review provided.";
    
    if (product.images && product.images.length > 0) {
      document.getElementById('main-image').src = product.images[0];
      const thumbGal = document.getElementById('thumbnail-gallery');
      thumbGal.innerHTML = product.images.map(img => `
        <img src="${img}" class="aspect-square rounded-lg object-cover cursor-pointer border border-transparent hover:border-primary transition-all" onclick="document.getElementById('main-image').src='${img}'">
      `).join('');
    }

    const specs = parseSpecsData(product.specs);
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

    const proConSection = document.getElementById('pros-cons-section');
    if (product.pros?.length || product.cons?.length) {
      let html = `<div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">`;
      html += `<div class="bg-green-500/10 border border-green-500/20 rounded-xl p-6">
                <h3 class="text-green-400 font-bold mb-4 flex items-center gap-2"><span class="material-symbols-outlined">check_circle</span> Pros</h3>
                <ul class="space-y-2 text-sm text-on-surface">` + 
                (product.pros || []).map(p => `<li>• ${p}</li>`).join('') + `</ul></div>`;
                
      html += `<div class="bg-red-500/10 border border-red-500/20 rounded-xl p-6">
                <h3 class="text-red-400 font-bold mb-4 flex items-center gap-2"><span class="material-symbols-outlined">cancel</span> Cons</h3>
                <ul class="space-y-2 text-sm text-on-surface">` + 
                (product.cons || []).map(c => `<li>• ${c}</li>`).join('') + `</ul></div></div>`;
                
      if (product.verdict) {
         html += `<div class="bg-surface-container-high rounded-xl p-6 border border-primary/20">
                    <h3 class="text-primary font-bold mb-2 uppercase tracking-widest text-sm">Final Verdict</h3>
                    <p class="text-on-surface-variant leading-relaxed italic">"${product.verdict}"</p>
                  </div>`;
      }
      proConSection.innerHTML = html;
    }

    const orderRow = document.getElementById('order-row');
    if (product.merchants && product.merchants.length > 0) {
      orderRow.innerHTML = '<h4 class="text-xs font-bold uppercase tracking-widest text-outline mb-2">Check Prices:</h4>' + product.merchants.map(m => {
        const parts = m.split('|');
        return `
          <a href="${parts[1] || '#'}" target="_blank" class="w-full flex justify-between items-center bg-surface-container-high hover:bg-surface-variant border border-white/10 hover:border-primary/50 transition-all rounded-xl p-4 group">
            <span class="font-bold font-display group-hover:text-primary transition-colors">${parts[0] || 'Store'}</span>
            <div class="flex items-center gap-4">
              <span class="text-primary font-mono text-sm">${parts[2] || 'Check Price'}</span>
              <span class="material-symbols-outlined text-outline group-hover:text-white transition-colors">open_in_new</span>
            </div>
          </a>
        `;
      }).join('');
    } else {
      orderRow.innerHTML = '<div class="p-4 bg-surface-container rounded-xl text-center text-outline text-sm border border-white/5">No active listings available.</div>';
    }
  }
});