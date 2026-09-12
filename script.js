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

function createProductCard(p, compact = false) {
  let slug = p.name.toLowerCase().replace(/\s+/g, '-');
  const card = document.createElement('div');
  card.className = "group relative bg-surface-container-low rounded-xl overflow-hidden transition-all duration-500 hover:translate-y-[-4px] border border-white/5 hover:border-primary/30 flex flex-col cursor-pointer";
  card.onclick = () => window.location.href = `product.html?slug=${slug}`;
  
  let badgeHTML = p.hotDeal ? `<span class="bg-primary text-on-primary-fixed text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest shadow-xl mr-1 mb-1 inline-block">Top Pick</span>` : '';
  
  let aspectClass = compact ? 'aspect-[16/9]' : 'aspect-[4/5]';
  let titleClass = compact ? 'text-sm' : 'text-xl';
  let paddingClass = compact ? 'p-4' : 'p-6';
  let descClass = compact ? 'hidden' : 'text-sm text-outline mb-4 line-clamp-2';

  card.innerHTML = `
    <div class="${aspectClass} bg-surface-container-lowest relative overflow-hidden flex-shrink-0">
      <img class="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700 scale-105 group-hover:scale-100" src="${p.images?.[0] || 'logo.png'}" alt="${p.name}">
      <div class="absolute top-3 left-3 right-3 flex flex-wrap z-10">${badgeHTML}</div>
      <div class="absolute bottom-2 right-2 bg-surface-bright/90 backdrop-blur-md rounded-full px-2 py-0.5 flex items-center justify-center text-primary shadow-2xl z-20 font-bold text-xs">
        <span class="material-symbols-outlined text-xs mr-1">star</span> ${p.score || 'N/A'}
      </div>
    </div>
    <div class="${paddingClass} flex-1 flex flex-col justify-between">
      <div>
        <div class="flex justify-between items-start gap-2 mb-1">
           <h3 class="${titleClass} font-bold tracking-tight line-clamp-2">${p.name}</h3>
        </div>
        ${!compact && p.price ? `<div class="text-primary font-mono text-sm mb-2">${p.price}</div>` : ''}
        ${compact && p.price ? `<div class="text-primary font-mono text-xs mb-1">${p.price}</div>` : ''}
        <p class="${descClass}">${p.description || p.metaDescription || 'Detailed review available.'}</p>
      </div>
      ${!compact && p.category ? `<div class="flex gap-2 mt-auto"><span class="bg-surface-container-highest text-[10px] text-on-surface-variant font-bold px-3 py-1 rounded-full truncate">${p.category}</span></div>` : ''}
    </div>
  `;
  return card;
}

function generateStarsHTML(scoreNum) {
  const s = parseFloat(scoreNum || 0) / 2;
  let html = '';
  for(let i=1; i<=5; i++) {
    if (s >= i) html += `<span class="material-symbols-outlined text-yellow-400" style="font-variation-settings: 'FILL' 1;">star</span>`;
    else if (s >= i - 0.5) html += `<span class="material-symbols-outlined text-yellow-400" style="font-variation-settings: 'FILL' 1;">star_half</span>`; 
    else html += `<span class="material-symbols-outlined text-yellow-400/30">star</span>`;
  }
  html += `<span class="text-on-surface font-bold text-xl ml-2 font-mono">${scoreNum}/10</span>`;
  return html;
}

// ====== PAGE ROUTERS ======
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

    // Auto-format double spaces into '|' for Textareas
    const replaceDoubleSpace = function(e) {
      if (this.value.includes('  ')) {
        const start = this.selectionStart;
        this.value = this.value.replace(/  /g, '|');
        this.setSelectionRange(start - 1, start - 1);
      }
    };
    document.getElementById('p-merchants')?.addEventListener('input', replaceDoubleSpace);
    document.getElementById('p-author-socials')?.addEventListener('input', replaceDoubleSpace);

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
      
      // Auto-Score logic
      let finalScore = document.getElementById('p-score').value.trim();
      const subScoresText = document.getElementById('p-subscores').value.trim();
      const parsedSub = parseDataList(subScoresText);
      const sKeys = Object.keys(parsedSub);
      if(sKeys.length > 0) {
        let sum = 0, count = 0;
        sKeys.forEach(k => {
           let val = parseFloat(parsedSub[k].split('/')[0]);
           if(!isNaN(val)) { sum += val; count++; }
        });
        if(count > 0) finalScore = (sum / count).toFixed(1);
      }
      
      // Fallback if completely empty
      if(!finalScore) finalScore = "0";

      const product = {
        id: editId || Date.now().toString(),
        name: document.getElementById('p-name').value.trim(),
        category: document.getElementById('p-category').value,
        price: document.getElementById('p-price').value.trim(),
        score: finalScore,
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
        authorImage: document.getElementById('p-author-image').value.trim(),
        authorSocials: document.getElementById('p-author-socials').value.split('\n').map(u=>u.trim()).filter(Boolean),
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
          document.getElementById('p-author-image').value = p.authorImage || '';
          document.getElementById('p-author-socials').value = (p.authorSocials || []).join('\n');
          
          // Backwards compatibility for legacy author url
          if (!p.authorSocials && p.authorUrl) {
              document.getElementById('p-author-socials').value = `Link|${p.authorUrl}`;
          }

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

    // Build Epic Games-style Circular Sub-scores
    const subscores = parseDataList(product.subScores);
    const subscoresGrid = document.getElementById('subscores-grid');
    if (Object.keys(subscores).length > 0) {
      document.getElementById('subscores-wrapper').classList.remove('hidden');
      subscoresGrid.innerHTML = Object.entries(subscores).map(([k, v]) => {
        let numVal = parseFloat(v.split('/')[0]);
        let percentage = isNaN(numVal) ? 0 : (numVal / 10) * 100;
        
        return `
          <div class="flex flex-col items-center gap-3 bg-surface-container-low p-5 rounded-2xl border border-white/5 w-[140px] shadow-xl hover:-translate-y-1 transition-transform">
            <div class="relative w-16 h-16">
              <svg class="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                <path class="text-surface-variant" stroke-width="3" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                <path class="text-primary" stroke-dasharray="${percentage}, 100" stroke-width="3" stroke-linecap="round" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
              </svg>
              <div class="absolute inset-0 flex items-center justify-center font-display font-bold text-xl text-on-surface">${numVal}</div>
            </div>
            <span class="text-outline font-bold text-xs uppercase tracking-widest text-center leading-tight">${k}</span>
          </div>
        `;
      }).join('');
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

    // Final Verdict
    const verdictContainer = document.getElementById('verdict-container');
    if (product.verdict) {
      verdictContainer.innerHTML = `
        <div class="bg-surface-container-high rounded-2xl p-8 border border-primary/20 h-full flex flex-col justify-center">
          <h3 class="text-primary font-bold mb-4 uppercase tracking-widest text-sm flex items-center gap-2"><span class="material-symbols-outlined">gavel</span> Final Verdict</h3>
          <p class="text-on-surface leading-relaxed text-xl font-display">"${product.verdict}"</p>
        </div>`;
    }
    
    // Author Box Expanded capabilities
    const authorContainer = document.getElementById('author-container');
    if (product.authorName) {
      let socialsHTML = '';
      if (product.authorSocials && product.authorSocials.length > 0) {
         socialsHTML = `<div class="flex flex-wrap justify-center gap-2 mt-4">` +
         product.authorSocials.map(s => {
           const pts = s.split('|');
           return `<a href="${pts[1] || '#'}" target="_blank" class="text-[10px] font-bold text-primary hover:text-white hover:bg-primary/20 uppercase tracking-widest bg-primary/10 px-3 py-1.5 rounded-full transition-colors">${pts[0] || 'Link'}</a>`;
         }).join('') + `</div>`;
      } else if (product.authorUrl) {
         socialsHTML = `<div class="flex justify-center mt-4"><a href="${product.authorUrl}" target="_blank" class="text-xs font-bold text-primary hover:underline uppercase tracking-widest">Follow Author</a></div>`;
      }

      let avatarHTML = product.authorImage ?
        `<img src="${product.authorImage}" class="w-20 h-20 rounded-full object-cover mb-3 border-2 border-primary/20 shadow-xl">` :
        `<div class="w-20 h-20 bg-surface-variant rounded-full mb-3 flex items-center justify-center text-primary text-3xl font-bold font-display uppercase border-2 border-primary/20 shadow-xl">${product.authorName.charAt(0)}</div>`;

      authorContainer.innerHTML = `
        <div class="bg-surface-container-low rounded-2xl p-8 border border-white/5 h-full flex flex-col justify-center items-center text-center">
          ${avatarHTML}
          <p class="text-[10px] uppercase tracking-widest text-outline mb-1">Reviewed By</p>
          <h4 class="text-lg font-bold text-on-surface">${product.authorName}</h4>
          ${socialsHTML}
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

    // Similar Products (Budget matched +- 500, compact mode 2x2 grid)
    const similarContainer = document.getElementById('similar-grid');
    let pPriceVal = parseFloat((product.price || "").replace(/[^0-9.]/g, '')) || 0;
    
    let similar = products.filter(p => {
      if (p.id === product.id) return false;
      let otherPrice = parseFloat((p.price || "").replace(/[^0-9.]/g, '')) || 0;
      let priceDiff = Math.abs(otherPrice - pPriceVal);
      // Try to find same category items within the price buffer
      return p.category === product.category && priceDiff <= 500;
    });

    // If we don't have enough budget-matched category items, pad with general recent items
    if (similar.length < 4) {
      const others = products.filter(p => p.id !== product.id && !similar.includes(p));
      similar = [...similar, ...others];
    }
    
    similar = similar.slice(0, 4); // Take exactly up to 4 for our 2x2 grid

    if(similar.length > 0) {
      // Send compact=true to our creation function
      similar.forEach(p => similarContainer.appendChild(createProductCard(p, true)));
    } else {
      similarContainer.innerHTML = '<span class="text-outline col-span-full">No other reviews yet.</span>';
    }
  }
});