// ====== GITHUB PAT BACKEND ENGINE ======
const DB_DIR = 'DB';
const META_FILE = `${DB_DIR}/megacatalogmeta.json`;

function getGHConfig() {
  return {
    // REPLACED: Hardcoded owner and repo
    owner: 'RabaRoro', 
    repo: 'ass',
    pat: localStorage.getItem('gh_pat')
  };
}

// Base64 Helpers for UTF-8 support
function utf8ToBase64(str) { return btoa(unescape(encodeURIComponent(str))); }
function base64ToUtf8(str) { return decodeURIComponent(escape(atob(str))); }

const fileCache = new Map();
const fileShas = new Map();

async function fetchFile(filePath, forceRefresh = false) {
  if (!forceRefresh && fileCache.has(filePath)) return fileCache.get(filePath);
  const conf = getGHConfig();
  if (!conf.owner || !conf.repo) return null;

  try {
    const res = await fetch(`https://api.github.com/repos/${conf.owner}/${conf.repo}/contents/${filePath}`, {
      headers: conf.pat ? { 'Authorization': `token ${conf.pat}`, 'Accept': 'application/vnd.github.v3+json' } : { 'Accept': 'application/vnd.github.v3+json' }
    });
    
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`GitHub fetch failed for ${filePath}`);
    
    const data = await res.json();
    fileShas.set(filePath, data.sha);
    const parsed = JSON.parse(base64ToUtf8(data.content));
    fileCache.set(filePath, parsed);
    return parsed;
  } catch (err) {
    console.error(err);
    return [];
  }
}

async function saveFile(filePath, contentArray) {
  const conf = getGHConfig();
  if (!conf.pat) throw new Error("Not authenticated.");
  
  const content = utf8ToBase64(JSON.stringify(contentArray, null, 2));
  const sha = fileShas.get(filePath);
  
  const body = {
    message: `Automated DB Update: ${filePath}`,
    content: content,
    ...(sha && { sha: sha })
  };

  const res = await fetch(`https://api.github.com/repos/${conf.owner}/${conf.repo}/contents/${filePath}`, {
    method: 'PUT',
    headers: { 'Authorization': `token ${conf.pat}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) throw new Error(`Failed to save ${filePath}`);
  const data = await res.json();
  fileShas.set(filePath, data.content.sha);
  fileCache.set(filePath, contentArray);
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

// Shimmer UI Animation Engine
function renderShimmer(containerId, count = 8, type = 'card') {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  
  for (let i = 0; i < count; i++) {
    if (type === 'list') {
      container.innerHTML += `
        <div class="animate-pulse flex items-center justify-between p-4 bg-surface-container-lowest rounded-xl border border-white/5">
          <div class="flex items-center gap-4 w-full">
            <div class="w-12 h-12 bg-surface-container-high rounded"></div>
            <div class="space-y-2 flex-1 max-w-[200px]">
              <div class="h-4 bg-surface-container-high rounded w-full"></div>
              <div class="h-3 bg-surface-container-high rounded w-1/2"></div>
            </div>
          </div>
        </div>`;
    } else {
      const aspectClass = type === 'compact' ? 'aspect-[16/9]' : 'aspect-[4/5]';
      container.innerHTML += `
        <div class="animate-pulse bg-surface-container-low rounded-xl overflow-hidden border border-white/5 flex flex-col h-full">
          <div class="${aspectClass} bg-surface-container-high w-full"></div>
          <div class="p-6 flex flex-col gap-3 flex-1">
            <div class="h-5 bg-surface-container-high rounded w-3/4"></div>
            ${type !== 'compact' ? `
            <div class="h-4 bg-surface-container-high rounded w-1/4 mb-2"></div>
            <div class="h-3 bg-surface-container-high rounded w-full"></div>
            <div class="h-3 bg-surface-container-high rounded w-5/6"></div>` : ''}
          </div>
        </div>`;
    }
  }
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
  let slug = p.slug || p.name.toLowerCase().replace(/\s+/g, '-');
  const card = document.createElement('div');
  card.className = "group relative bg-surface-container-low rounded-xl overflow-hidden transition-all duration-500 hover:translate-y-[-4px] border border-white/5 hover:border-primary/30 flex flex-col cursor-pointer";
  card.onclick = () => window.location.href = `product.html?slug=${slug}`;
  
  let badgeHTML = p.hotDeal ? `<span class="bg-primary text-on-primary-fixed text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest shadow-xl mr-1 mb-1 inline-block">Top Pick</span>` : '';
  
  let aspectClass = compact ? 'aspect-[16/9]' : 'aspect-[4/5]';
  let titleClass = compact ? 'text-sm' : 'text-xl';
  let paddingClass = compact ? 'p-4' : 'p-6';
  let descClass = compact ? 'hidden' : 'text-sm text-outline mb-4 line-clamp-2';

  let imageSrc = (p.images && p.images[0]) || p.image || 'logo.png';

  card.innerHTML = `
    <div class="${aspectClass} bg-surface-container-lowest relative overflow-hidden flex-shrink-0">
      <img class="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700 scale-105 group-hover:scale-100" src="${imageSrc}" alt="${p.name}">
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
      renderShimmer('admin-products-list', 5, 'list');
      fetchFile(META_FILE).then(renderAdminList);
    }

    const replaceDoubleSpace = function(e) {
      if (this.value.includes('  ')) {
        const start = this.selectionStart;
        this.value = this.value.replace(/  /g, '|');
        this.setSelectionRange(start - 1, start - 1);
      }
    };
    document.getElementById('p-merchants')?.addEventListener('input', replaceDoubleSpace);
    document.getElementById('p-author-socials')?.addEventListener('input', replaceDoubleSpace);

    // REPLACED: Only store the PAT now
    document.getElementById('login-form').addEventListener('submit', (e) => {
      e.preventDefault();
      localStorage.setItem('gh_pat', document.getElementById('gh-pat').value.trim());
      window.location.reload();
    });

    // REPLACED: Only remove the PAT now
    document.getElementById('logout-btn').addEventListener('click', () => {
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
    let editShard = null;
    
    document.getElementById('product-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('submit-btn');
      btn.innerHTML = `Saving to Shards...`;
      
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
        let metaDB = await fetchFile(META_FILE);
        let targetShard = editShard;

        if (!targetShard) {
           const shardCounts = {};
           metaDB.forEach(m => { shardCounts[m.shard] = (shardCounts[m.shard] || 0) + 1; });
           
           const shardNums = Object.keys(shardCounts).map(s => parseInt(s.replace('shard-', '').replace('.json', ''))).filter(n => !isNaN(n));
           let maxShard = shardNums.length > 0 ? Math.max(...shardNums) : 1;
           
           if ((shardCounts[`shard-${maxShard}.json`] || 0) >= 10) {
               maxShard += 1;
           }
           targetShard = `shard-${maxShard}.json`;
        }

        const shardPath = `${DB_DIR}/${targetShard}`;
        let shardData = await fetchFile(shardPath) || [];
        const pIndex = shardData.findIndex(p => p.id === product.id);
        if (pIndex > -1) shardData[pIndex] = product;
        else shardData.push(product);
        await saveFile(shardPath, shardData);

        const metaObj = {
            id: product.id,
            slug: product.name.toLowerCase().replace(/\s+/g, '-'),
            name: product.name,
            category: product.category,
            price: product.price,
            score: product.score,
            image: product.images[0] || '',
            hotDeal: product.hotDeal,
            description: product.metaDescription || product.description,
            specs: product.specs,
            shard: targetShard
        };

        const mIndex = metaDB.findIndex(m => m.id === product.id);
        if (mIndex > -1) metaDB[mIndex] = metaObj;
        else metaDB.push(metaObj);
        
        await saveFile(META_FILE, metaDB);
        
        showToast("Review published successfully!");
        document.getElementById('product-form').reset();
        editId = null; editShard = null;
        document.getElementById('form-title').innerText = "Post New Review";
        renderAdminList();
      } catch (err) { 
        console.error(err);
        showToast("Error saving to GitHub."); 
      }
      btn.innerHTML = `Publish Post`;
    });

    async function renderAdminList() {
      const list = document.getElementById('admin-products-list');
      const metaDB = await fetchFile(META_FILE);
      list.innerHTML = '';
      
      if (!metaDB || metaDB.length === 0) {
        list.innerHTML = `<div class="p-8 text-center text-outline">No posts found in database.</div>`;
        return;
      }

      [...metaDB].reverse().forEach(p => {
        const div = document.createElement('div');
        div.className = "flex items-center justify-between p-4 bg-surface-container-lowest rounded-xl border border-white/5";
        div.innerHTML = `
          <div class="flex items-center gap-4">
            <img src="${p.image || 'logo.png'}" class="w-12 h-12 object-cover rounded bg-surface-container">
            <div>
              <div class="font-bold text-sm">${p.name} <span class="text-primary text-xs ml-2">Score: ${p.score}/10</span></div>
              <div class="text-xs text-outline">File: ${p.shard}</div>
            </div>
          </div>
          <div class="flex gap-2">
            <button class="edit-btn px-3 py-1 bg-surface-variant hover:bg-surface-container-high rounded text-xs font-bold transition-all">Edit</button>
            <button class="delete-btn px-3 py-1 bg-red-900/30 hover:bg-red-900/60 text-red-400 rounded text-xs font-bold transition-all">Delete</button>
          </div>
        `;
        
        div.querySelector('.edit-btn').onclick = async () => {
          showToast(`Fetching ${p.shard} details...`);
          const shardData = await fetchFile(`${DB_DIR}/${p.shard}`);
          const fullProduct = shardData.find(x => x.id === p.id);
          
          if(!fullProduct) { showToast("Data not found in shard."); return; }

          editId = p.id;
          editShard = p.shard;
          document.getElementById('form-title').innerText = "Edit Review: " + fullProduct.name;
          document.getElementById('p-name').value = fullProduct.name;
          document.getElementById('p-category').value = fullProduct.category || '';
          document.getElementById('p-price').value = fullProduct.price || '';
          document.getElementById('p-score').value = fullProduct.score || '';
          document.getElementById('p-pros').value = (fullProduct.pros || []).join('\n');
          document.getElementById('p-cons').value = (fullProduct.cons || []).join('\n');
          document.getElementById('p-verdict').value = fullProduct.verdict || '';
          document.getElementById('p-desc').value = fullProduct.description || '';
          document.getElementById('p-meta-desc').value = fullProduct.metaDescription || '';
          document.getElementById('p-detailed-desc').value = fullProduct.detailedDescription || '';
          document.getElementById('p-specs').value = fullProduct.specs || '';
          document.getElementById('p-subscores').value = fullProduct.subScores || '';
          document.getElementById('p-images').value = fullProduct.images?.[0] || '';
          document.getElementById('p-merchants').value = (fullProduct.merchants || []).join('\n');
          document.getElementById('p-author-name').value = fullProduct.authorName || '';
          document.getElementById('p-author-image').value = fullProduct.authorImage || '';
          document.getElementById('p-author-socials').value = (fullProduct.authorSocials || []).join('\n');
          
          document.getElementById('p-hot').checked = fullProduct.hotDeal || false;
          document.getElementById('tab-add').click();
          window.scrollTo(0,0);
        };
        
        div.querySelector('.delete-btn').onclick = async () => {
          if (confirm(`Delete '${p.name}' from ${p.shard} forever?`)) {
            const shardPath = `${DB_DIR}/${p.shard}`;
            let shardData = await fetchFile(shardPath);
            shardData = shardData.filter(x => x.id !== p.id);
            await saveFile(shardPath, shardData);

            const newMeta = metaDB.filter(x => x.id !== p.id);
            await saveFile(META_FILE, newMeta);
            
            showToast("Review deleted completely.");
            renderAdminList();
          }
        };
        list.appendChild(div);
      });
    }

    document.getElementById('sync-catalog-btn').addEventListener('click', async () => {
      renderShimmer('admin-products-list', 5, 'list');
      await fetchFile(META_FILE, true);
      renderAdminList();
      showToast("Database Synchronized");
    });
  }

  // 2. HOME PAGE (INDEX)
  if (document.getElementById('interest-products')) {
    renderShimmer('interest-products', 8, 'card');
    const metaDB = await fetchFile(META_FILE);
    const container = document.getElementById('interest-products');
    container.innerHTML = '';
    
    if (!metaDB || !metaDB.length) container.innerHTML = `<div class="col-span-full py-12 text-center text-outline">No reviews yet. Admin needs to publish some.</div>`;
    else shuffle(metaDB).slice(0, 8).forEach(p => container.appendChild(createProductCard(p)));
  }

  // 3. CATALOG PAGE (PRODUCTS)
  if (document.getElementById('products-grid')) {
    renderShimmer('products-grid', 12, 'card');
    
    const container = document.getElementById('products-grid');
    const searchInput = document.getElementById('search-input');
    const minPriceInput = document.getElementById('filter-price-min');
    const maxPriceInput = document.getElementById('filter-price-max');
    const layoutSelect = document.getElementById('filter-layout');
    const connSelect = document.getElementById('filter-connectivity');

    const metaDB = await fetchFile(META_FILE) || [];
    
    const layouts = new Set();
    const connectivities = new Set();
    
    metaDB.forEach(p => {
      const specs = parseDataList(p.specs);
      if (specs['Layout']) layouts.add(specs['Layout']);
      if (specs['Connectivity']) {
        specs['Connectivity'].split(/[\/,]/).map(s => s.trim()).filter(Boolean).forEach(c => connectivities.add(c));
      }
    });

    if (layoutSelect) {
      layouts.forEach(l => {
        const opt = document.createElement('option');
        opt.value = l; opt.textContent = l;
        layoutSelect.appendChild(opt);
      });
    }
    
    if (connSelect) {
      connectivities.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c; opt.textContent = c;
        connSelect.appendChild(opt);
      });
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get('search') && searchInput) searchInput.value = params.get('search');

    function renderGrid() {
      let result = [...metaDB].reverse();
      
      if (searchInput && searchInput.value) {
        const q = searchInput.value.toLowerCase();
        result = result.filter(p => p.name.toLowerCase().includes(q));
      }
      
      const categoryParam = params.get('category');
      if (categoryParam) {
          result = result.filter(p => p.category && p.category.toLowerCase() === categoryParam.toLowerCase());
      }

      if (minPriceInput && maxPriceInput && layoutSelect && connSelect) {
        const minPrice = parseFloat(minPriceInput.value);
        const maxPrice = parseFloat(maxPriceInput.value);
        const selectedLayout = layoutSelect.value;
        const selectedConn = connSelect.value;
        
        result = result.filter(p => {
          const specs = parseDataList(p.specs);
          let pPrice = null;
          if (p.price) {
            const priceStr = p.price.replace(/,/g, ''); 
            const match = priceStr.match(/\d+(\.\d+)?/);
            if (match) pPrice = parseFloat(match[0]);
          }
          
          let passMin = isNaN(minPrice) || (pPrice !== null && pPrice >= minPrice);
          let passMax = isNaN(maxPrice) || (pPrice !== null && pPrice <= maxPrice);
          let passLayout = !selectedLayout || (specs['Layout'] === selectedLayout);
          let passConn = !selectedConn || (specs['Connectivity'] && specs['Connectivity'].includes(selectedConn));
          
          return passMin && passMax && passLayout && passConn;
        });
      }

      container.innerHTML = '';
      if (!result.length) {
        container.innerHTML = `<div class="col-span-full text-center py-12 text-outline bg-surface-container-low rounded-xl border border-white/5 shadow-inner">No reviews found matching your criteria.</div>`;
      } else {
        result.forEach(p => container.appendChild(createProductCard(p)));
      }
    }
    
    if (searchInput) searchInput.addEventListener('input', renderGrid);
    if (minPriceInput) minPriceInput.addEventListener('input', renderGrid);
    if (maxPriceInput) maxPriceInput.addEventListener('input', renderGrid);
    if (layoutSelect) layoutSelect.addEventListener('change', renderGrid);
    if (connSelect) connSelect.addEventListener('change', renderGrid);

    renderGrid();
  }

  // 4. SINGLE PRODUCT PAGE
  if (document.getElementById('product-name')) {
    const urlParams = new URLSearchParams(window.location.search);
    const slug = urlParams.get('slug');
    if (!slug) return;

    const metaDB = await fetchFile(META_FILE);
    const targetMeta = metaDB.find(m => (m.slug || m.name.toLowerCase().replace(/\s+/g, '-')) === slug);

    if (!targetMeta) {
      document.getElementById('product-name').textContent = "Review Not Found";
      return;
    }

    const shardData = await fetchFile(`${DB_DIR}/${targetMeta.shard}`);
    const product = shardData.find(p => p.id === targetMeta.id);

    if (!product) {
       document.getElementById('product-name').textContent = "Shard Data Error";
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

    const similarContainer = document.getElementById('similar-grid');
    let pPriceVal = parseFloat((product.price || "").replace(/[^0-9.]/g, '')) || 0;
    
    let similar = metaDB.filter(p => {
      if (p.id === product.id) return false;
      let otherPrice = parseFloat((p.price || "").replace(/[^0-9.]/g, '')) || 0;
      let priceDiff = Math.abs(otherPrice - pPriceVal);
      return p.category === product.category && priceDiff <= 500;
    });

    if (similar.length < 4) {
      const others = metaDB.filter(p => p.id !== product.id && !similar.includes(p));
      similar = [...similar, ...others];
    }
    
    similar = similar.slice(0, 4);

    if(similar.length > 0) {
      similar.forEach(p => similarContainer.appendChild(createProductCard(p, true)));
    } else {
      similarContainer.innerHTML = '<span class="text-outline col-span-full">No other reviews yet.</span>';
    }
  }
});
