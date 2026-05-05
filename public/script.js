// ==================== QTPOSTER PRO - SCRIPT CLEANED & FIXED ====================
// Fixed: Removed duplicate code, fixed create article handler, organized functions

let selectedFiles = new Set();

// ==================== THÔNG BÁO ĐẸP (TOAST) ====================
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.style.cssText = `position:fixed;bottom:30px;right:30px;z-index:9999;padding:16px 24px;border-radius:16px;color:white;font-weight:600;font-size:14.5px;box-shadow:0 10px 30px rgba(0,0,0,0.2);display:flex;align-items:center;gap:12px;animation:slideIn 0.4s ease forwards;`;
    
    if (type === 'success') {
        toast.style.background = 'linear-gradient(90deg,#16a34a,#22c55e)';
        toast.innerHTML = `<i class="fas fa-check-circle" style="font-size:20px;"></i> ${message}`;
    } else if (type === 'error') {
        toast.style.background = 'linear-gradient(90deg,#dc2626,#ef4444)';
        toast.innerHTML = `<i class="fas fa-exclamation-circle" style="font-size:20px;"></i> ${message}`;
    } else if (type === 'loading') {
        toast.style.background = 'linear-gradient(90deg,#14b8a6,#22d3ee)';
        toast.innerHTML = `<i class="fas fa-spinner fa-spin" style="font-size:20px;"></i> ${message}`;
    }
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.animation = 'slideOut 0.4s ease forwards'; setTimeout(() => toast.remove(), 400); }, 2800);
}

// ==================== HIỂN THỊ SECTION ====================
function showSection(section) {
    document.querySelectorAll('.section').forEach(s => {
        s.style.display = 'none';
        s.style.opacity = '0';
    });

    // ==================== CONFIRM MODAL ĐẸP (thay alert/confirm xấu) ====================
function showConfirm(message, onConfirm, onCancel = null) {
    // Xóa modal cũ nếu có
    const oldModal = document.getElementById('customConfirmModal');
    if (oldModal) oldModal.remove();

    const modal = document.createElement('div');
    modal.id = 'customConfirmModal';
    modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.75); display:flex; align-items:center; justify-content:center; z-index:99999; padding:20px;';
    
    modal.innerHTML = `
        <div style="background:#0f172a; border-radius:24px; max-width:420px; width:100%; box-shadow:0 25px 50px -12px rgb(0 0 0 / 0.4); border:1px solid #334155;">
            <div style="padding:28px 28px 20px;">
                <div style="display:flex; align-items:center; gap:12px; margin-bottom:16px;">
                    <i class="fas fa-question-circle" style="font-size:32px; color:#14b8a6;"></i>
                    <h3 style="font-size:20px; font-weight:700; color:white; margin:0;">Xác nhận</h3>
                </div>
                <p style="color:#cbd5e1; font-size:15.5px; line-height:1.5; margin:0 0 24px;">${message}</p>
            </div>
            
            <div style="display:flex; border-top:1px solid #334155; padding:16px 28px; gap:12px; border-radius:0 0 24px 24px;">
                <button id="confirmCancel" style="flex:1; padding:12px 20px; background:#334155; color:#e2e8f0; border:none; border-radius:9999px; font-weight:600; font-size:15px; cursor:pointer; transition:all 0.2s;">
                    Hủy
                </button>
                <button id="confirmOk" style="flex:1; padding:12px 20px; background:linear-gradient(90deg,#14b8a6,#0f766e); color:white; border:none; border-radius:9999px; font-weight:600; font-size:15px; cursor:pointer; box-shadow:0 4px 15px rgba(20,184,166,0.3); transition:all 0.2s;">
                    Xác nhận
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    const btnOk = modal.querySelector('#confirmOk');
    const btnCancel = modal.querySelector('#confirmCancel');
    
    btnOk.onclick = () => {
        modal.remove();
        if (onConfirm) onConfirm();
    };
    
    btnCancel.onclick = () => {
        modal.remove();
        if (onCancel) onCancel();
    };
    
    // Đóng khi click nền
    modal.onclick = (e) => {
        if (e.target === modal) {
            modal.remove();
            if (onCancel) onCancel();
        }
    };
}
    
    document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
    
    const target = document.getElementById('section-' + section);
    if (target) {
        target.style.display = 'block';
        setTimeout(() => {
            target.style.opacity = '1';
        }, 10);
    }
    
    const menu = document.getElementById('menu-' + section);
    if (menu) menu.classList.add('active');
    
    if (section === 1) loadArticles();
    if (section === 0) loadWPCategories();
    if (section === 4) loadWPPosts();
}

// ==================== TÙY CHỈNH 2 PROMPT ====================
function saveCustomPrompts() {
    const articlePrompt = document.getElementById('customPrompt').value.trim();
    const imagePrompt = document.getElementById('customImagePrompt').value.trim();
    
    if (articlePrompt) localStorage.setItem('customAIPrompt', articlePrompt);
    if (imagePrompt) localStorage.setItem('customImagePrompt', imagePrompt);
    
    showToast('✅ Đã lưu cả 2 prompt thành công!', 'success');
}

function resetCustomPrompts() {
    if (confirm('Khôi phục cả 2 prompt mặc định?')) {
        localStorage.removeItem('customAIPrompt');
        localStorage.removeItem('customImagePrompt');
        document.getElementById('customPrompt').value = '';
        document.getElementById('customImagePrompt').value = '';
        showToast('Đã khôi phục prompt mặc định!', 'success');
    }
}

function loadCustomPrompts() {
    const articlePrompt = localStorage.getItem('customAIPrompt');
    const imagePrompt = localStorage.getItem('customImagePrompt');
    
    if (articlePrompt) document.getElementById('customPrompt').value = articlePrompt;
    if (imagePrompt) document.getElementById('customImagePrompt').value = imagePrompt;
}

// Override showSection to load prompts for tab 2 (Tùy chỉnh AI)
const originalShowSection = showSection;
showSection = function(section) {
    originalShowSection(section);
    if (section === 2) {
        loadCustomPrompts();
    }
};

// ==================== TẠO BÀI VIẾT (CODE ĐÃ SỬA - QUAN TRỌNG) ====================
document.getElementById('createForm').addEventListener('submit', async function(e) {
    e.preventDefault();                    // ← DÒNG NÀY RẤT QUAN TRỌNG, KHÔNG ĐƯỢC XÓA
    
    const topic = document.getElementById('topic').value.trim();
    const quantity = parseInt(document.getElementById('quantity').value) || 1;
    const category = document.getElementById('category').value;
    const imageCount = parseInt(document.getElementById('imageCount').value) || 0;

    if (!topic) {
        alert('Vui lòng nhập chủ đề!');
        return;
    }

    // Hiển thị progress bar
    const progressContainer = document.getElementById('progressContainer');
    const progressBar = document.getElementById('progressBar');
    const statusText = document.getElementById('statusText');

    if (progressContainer) progressContainer.style.display = 'block';
    if (progressBar) progressBar.style.width = '20%';
    if (statusText) statusText.textContent = `Đang tạo ${quantity} bài viết...`;

    try {
        const res = await fetch('/api/create-article', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                topics: Array(quantity).fill(topic),
                category: category,
                imageCount: imageCount
            })
        });

        const data = await res.json();

        if (data.success) {
            const successCount = data.results.filter(r => r.success).length;

            if (progressBar) progressBar.style.width = '100%';
            if (statusText) statusText.textContent = `✅ Đã tạo ${successCount}/${quantity} bài viết!`;

            setTimeout(() => {
                if (progressContainer) progressContainer.style.display = 'none';
                if (progressBar) progressBar.style.width = '0%';
                document.getElementById('createForm').reset();

                alert(`✅ Hoàn thành!\n\nĐã tạo thành công ${successCount}/${quantity} bài viết.`);

                // Chuyển sang tab Quản lý bài viết
                showSection(1);
                loadArticles();
            }, 800);
        } else {
            alert('❌ Lỗi khi tạo bài viết: ' + (data.message || ''));
            if (progressContainer) progressContainer.style.display = 'none';
        }
    } catch (err) {
        console.error(err);
        alert('❌ Lỗi kết nối server!');
        if (progressContainer) progressContainer.style.display = 'none';
    }
});

// ==================== TỰ ĐỘNG CẬP NHẬT CHUYÊN MỤC ======================
async function loadWPCategories() {
    try {
        const res = await fetch('/api/wp-categories');
        const categories = await res.json();
        
        const select = document.getElementById('category');
        if (!select) return;
        
        select.innerHTML = '';
        
        categories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat.slug;
            option.textContent = cat.name;
            select.appendChild(option);
        });
        
        console.log('✅ Đã cập nhật danh sách chuyên mục từ WordPress');
    } catch (e) {
        console.error('Lỗi tải chuyên mục:', e);
    }
}

// ==================== LOAD DANH SÁCH BÀI VIẾT ====================
async function loadArticles() {
    const container = document.getElementById('articleList');
    if (!container) return;
    
    container.innerHTML = `
        <div style="text-align: center; padding: 40px 20px; color: #64748b;">
            <i class="fas fa-spinner fa-spin" style="font-size: 32px; margin-bottom: 16px;"></i>
            <p>Đang tải danh sách bài viết...</p>
        </div>
    `;
    
    try {
        const res = await fetch('/api/articles');
        
        if (!res.ok) {
            throw new Error(`Server trả về lỗi: ${res.status}`);
        }
        
        const articles = await res.json();
        
        container.innerHTML = '';
        
        if (!articles || articles.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 60px 20px; color: #64748b;">
                    <i class="fas fa-newspaper" style="font-size: 48px; margin-bottom: 20px; opacity: 0.4;"></i>
                    <h3 style="font-size: 18px; margin-bottom: 8px; color: #334155;">Chưa có bài viết nào</h3>
                    <p style="font-size: 14px;">Hãy tạo bài viết đầu tiên của bạn!</p>
                    <button onclick="showSection(0)" class="btn-save" style="margin-top: 16px; width: auto; padding: 10px 24px; font-size: 14px;">
                        <i class="fas fa-plus"></i> Tạo bài viết mới
                    </button>
                </div>
            `;
            return;
        }
        
        articles.forEach(article => {
            const card = document.createElement('div');
            card.className = 'sop-card';
            card.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                    <span class="tag" style="background: #e0f2fe; color: #0369a1;">${article.category_slug || 'Chưa phân loại'}</span>
                    <span style="font-size: 11px; color: #94a3b8;">#${article.file ? article.file.split('_')[0] : 'N/A'}</span>
                </div>
                
                <h3 class="card-title" style="font-size: 17px; line-height: 1.4; margin-bottom: 10px; color: #0f172a;">${article.title || 'Không có tiêu đề'}</h3>
                
                <div class="steps-content" style="margin-bottom: 14px; font-size: 13px; color: #64748b;">
                    ${article.summary ? article.summary.substring(0, 140) + '...' : 'Không có mô tả'}
                </div>
                
                <div class="card-grid" style="margin-bottom: 12px;">
                    <div class="info-box box-success">
                        <strong style="color: #16a34a;">🎯 Success</strong><br>
                        <span style="font-size: 11.5px;">Bài viết đã tạo thành công</span>
                    </div>
                    <div class="info-box box-warning">
                        <strong style="color: #dc2626;">⚠️ Warning</strong><br>
                        <span style="font-size: 11.5px;">Kiểm tra nội dung trước khi đăng</span>
                    </div>
                </div>
                
                <div class="actions">
                    <a href="#" onclick="previewArticle('${article.file}'); return false;" class="btn-edit" style="color: #0284c8;">
                        <i class="fas fa-eye"></i> Xem
                    </a>
                    <a href="#" onclick="deleteArticle('${article.file}'); return false;" class="btn-delete">
                        <i class="fas fa-trash"></i> Xóa
                    </a>
                    <a href="#" onclick="postToWordPress('${article.file}'); return false;" style="color: #14b8a6; font-weight: 600; text-decoration: none; font-size: 12px;">
                        <i class="fas fa-upload"></i> Đăng WP
                    </a>
                </div>
            `;
            container.appendChild(card);
        });
        
    } catch (e) {
        console.error('Lỗi tải danh sách:', e);
        container.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: #dc2626;">
                <i class="fas fa-exclamation-triangle" style="font-size: 36px; margin-bottom: 16px;"></i>
                <h3 style="font-size: 16px; margin-bottom: 8px;">Không thể tải danh sách bài viết</h3>
                <p style="font-size: 13px; color: #64748b;">${e.message}</p>
                <button onclick="loadArticles()" class="btn-save" style="margin-top: 16px; width: auto; padding: 8px 20px; font-size: 13px; background: #ef4444;">
                    <i class="fas fa-redo"></i> Thử lại
                </button>
            </div>
        `;
    }
}

// ==================== XEM TRƯỚC BÀI VIẾT ====================
// ==================== XEM TRƯỚC BÀI VIẾT ====================
async function previewArticle(filename) {
    try {
        const res = await fetch('/api/articles');
        const articles = await res.json();
        const article = articles.find(a => a.file === filename);
        
        if (!article) return showToast('Không tìm thấy bài viết!', 'error');
        
        const modal = document.createElement('div');
        modal.className = 'fixed';   // ← DÒNG QUAN TRỌNG (đã thêm)
        modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.7); display:flex; align-items:center; justify-content:center; z-index:9999; padding:20px;';
        
        modal.innerHTML = `
            <div style="background:white; border-radius:24px; max-width:900px; width:100%; max-height:90vh; overflow:auto; padding:30px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                    <h3 style="font-size:22px; font-weight:700;">${article.title}</h3>
                    <button onclick="this.closest('.fixed').remove()" style="background:#f1f5f9; border:none; width:40px; height:40px; border-radius:50%; cursor:pointer; font-size:20px;">×</button>
                </div>
                
                <div style="background:#f8fafc; padding:20px; border-radius:16px; margin-bottom:20px;">
                    ${article.content || '<p>Không có nội dung</p>'}
                </div>
                
                <div style="text-align:right;">
                    <button onclick="postToWordPress('${filename}'); this.closest('.fixed').remove();" class="btn-save" style="width:auto; padding:10px 24px; font-size:14px;">
                        <i class="fas fa-upload"></i> Đăng lên WordPress
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    } catch (e) {
        showToast('❌ Lỗi khi xem trước!', 'error');
    }
}

// ==================== XÓA BÀI VIẾT ====================
async function deleteArticle(filename) {
    if (!confirm('Bạn có chắc muốn xóa bài viết này?\nBài viết cũng sẽ bị xóa trên WordPress (nếu đã đăng).')) return;
    
    showToast('Đang xóa bài viết...', 'loading');
    
    try {
        await fetch('/api/post-all', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                files: [filename],
                deleteFromWP: true 
            })
        });
        
        await fetch(`/api/articles/${filename}`, { method: 'DELETE' });
        
        showToast('✅ Đã xóa bài viết thành công!', 'success');
        loadArticles();
    } catch (e) {
        showToast('❌ Lỗi khi xóa bài viết!', 'error');
    }
}

// ==================== ĐĂNG LÊN WORDPRESS ====================
async function postToWordPress(filename) {
    if (!confirm('Đăng bài viết này lên WordPress?')) return;
    
    try {
        const res = await fetch('/api/post-all', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ files: [filename] })
        });
        
        const result = await res.json();
        
        if (result.success) {
            alert('✅ Đăng thành công lên WordPress!');
            loadArticles();
        } else {
            alert('❌ Lỗi khi đăng lên WordPress!\n' + (result.message || ''));
        }
    } catch (e) {
        alert('❌ Lỗi kết nối khi đăng bài!');
    }
}

// ==================== LƯU API ====================
function saveAPIKeys() {
    const keys = {
        deepseek: document.getElementById('deepseekKey').value.trim(),
        pexels: document.getElementById('pexelsKey').value.trim(),
        wpDomain: document.getElementById('wpDomain').value.trim(),
        wpPassword: document.getElementById('wpPassword').value.trim()
    };
    
    localStorage.setItem('apiKeys', JSON.stringify(keys));
    showToast('✅ Đã lưu API Keys thành công!', 'success');
}

// ==================== QUẢN LÝ BÀI VIẾT WORDPRESS ====================
async function loadWPPosts() {
    const container = document.getElementById('wpPostsList');
    if (!container) return;

    container.innerHTML = `
        <div style="text-align:center; padding:40px 20px; color:#64748b;">
            <i class="fas fa-spinner fa-spin" style="font-size:32px; margin-bottom:16px;"></i>
            <p>Đang tải bài viết từ WordPress...</p>
        </div>
    `;

    try {
        const res = await fetch('/api/wp-posts');
        if (!res.ok) throw new Error(`Lỗi server: ${res.status}`);
        
        const posts = await res.json();
        container.innerHTML = '';

        if (!posts || posts.length === 0) {
            container.innerHTML = `
                <div style="text-align:center; padding:60px 20px; color:#64748b;">
                    <i class="fas fa-newspaper" style="font-size:48px; margin-bottom:20px; opacity:0.3;"></i>
                    <h3 style="font-size:18px; margin-bottom:8px;">Chưa có bài viết nào trên WordPress</h3>
                    <p style="font-size:14px;">Hãy tạo bài viết đầu tiên!</p>
                </div>
            `;
            return;
        }

        posts.forEach(post => {
            const div = document.createElement('div');
            div.className = 'flex items-center gap-4 border border-slate-200 rounded-2xl p-6 mb-4 hover:bg-slate-50';
            
            div.innerHTML = `
                <input type="checkbox" class="wp-checkbox" data-id="${post.id}" style="width: 22px; height: 22px; cursor: pointer; flex-shrink: 0;">
                
                <div style="flex: 1; min-width: 0;">
                    <h3 style="font-weight: 600; font-size: 17px; line-height: 1.35; margin-bottom: 6px;">${post.title.rendered}</h3>
                    <div style="font-size: 13.5px; color: #64748b;">Ngày đăng: ${new Date(post.date).toLocaleDateString('vi-VN')}</div>
                </div>
                
                <div style="display: flex; gap: 10px; flex-shrink: 0; align-items: center;">
                    <!-- NÚT XEM MỚI -->
                    <a href="${post.link}" target="_blank" 
                       style="background: #e0f2fe; color: #0369a1; text-decoration: none; padding: 9px 18px; border-radius: 10px; font-size: 14px; font-weight: 500; display: inline-flex; align-items: center; gap: 6px;">
                        <i class="fas fa-external-link-alt"></i> Xem
                    </a>
                    
                    <button onclick="editWPPost(${post.id})" 
                            style="background: #dbeafe; color: #1e40af; border: none; padding: 9px 20px; border-radius: 10px; font-size: 14px; cursor: pointer;">
                        Sửa
                    </button>
                    
                    <button onclick="deleteWPPost(${post.id})" 
                            style="background: #fee2e2; color: #b91c1c; border: none; padding: 9px 20px; border-radius: 10px; font-size: 14px; cursor: pointer;">
                        Xóa
                    </button>
                </div>
            `;
            
            container.appendChild(div);
        });
    } catch (e) {
        container.innerHTML = `
            <div style="text-align:center; padding:40px 20px; color:#dc2626;">
                <i class="fas fa-exclamation-triangle" style="font-size:36px; margin-bottom:16px;"></i>
                <h3 style="font-size:16px;">Không thể tải bài viết từ WordPress</h3>
                <p style="font-size:13px; color:#64748b;">${e.message}</p>
            </div>
        `;
    }
}

// ==================== WORDPRESS - CHỌN TẤT CẢ & XÓA ĐÃ CHỌN ====================
// ==================== CHỌN TẤT CẢ - WORDPRESS ====================
function toggleSelectAllWP() {
    const selectAll = document.getElementById('selectAllWP');
    const checkboxes = document.querySelectorAll('.wp-checkbox');
    
    checkboxes.forEach(checkbox => {
        checkbox.checked = selectAll.checked;
    });
}

async function bulkDeleteWPPosts() {
    const checkedBoxes = document.querySelectorAll('.wp-checkbox:checked');
    if (checkedBoxes.length === 0) {
        showToast('Vui lòng chọn ít nhất 1 bài viết!', 'error');
        return;
    }
    showConfirm(
        `Bạn có chắc muốn xóa ${checkedBoxes.length} bài viết đã chọn?`,
        async () => {
            let successCount = 0;
            for (let box of checkedBoxes) {
                const postId = box.dataset.id;
                try {
                    await fetch(`/api/wp-posts/${postId}`, { method: 'DELETE' });
                    successCount++;
                } catch (e) {
                    console.error('Lỗi xóa bài:', postId);
                }
            }
            showToast(`✅ Đã xóa thành công ${successCount}/${checkedBoxes.length} bài viết!`, 'success');
            loadWPPosts();
        }
    );
}

async function bulkDeleteWPPosts() {
    const checkedBoxes = document.querySelectorAll('.wp-checkbox:checked');
    
    if (checkedBoxes.length === 0) {
        showToast('Vui lòng chọn ít nhất 1 bài viết!', 'error');
        return;
    }
    
    showConfirm(
        `Bạn có chắc muốn xóa ${checkedBoxes.length} bài viết đã chọn?`,
        async () => {
            let successCount = 0;
            
            for (let box of checkedBoxes) {
                const postId = box.dataset.id;
                try {
                    const res = await fetch(`/api/wp-posts/${postId}`, { method: 'DELETE' });
                    if (res.ok) {
                        successCount++;
                    } else {
                        console.error('Xóa thất bại ID:', postId);
                    }
                } catch (e) {
                    console.error('Lỗi kết nối khi xóa ID:', postId);
                }
            }
            
            if (successCount > 0) {
                showToast(`✅ Đã xóa thành công ${successCount}/${checkedBoxes.length} bài viết!`, 'success');
            } else {
                showToast('❌ Không xóa được bài viết nào. Vui lòng thử lại!', 'error');
            }
            
            loadWPPosts();
        }
    );
}

async function bulkDeleteWPPosts() {
    const checkedBoxes = document.querySelectorAll('.wp-checkbox:checked');
    if (checkedBoxes.length === 0) {
        alert('Vui lòng chọn ít nhất 1 bài viết!');
        return;
    }
    
    if (!confirm(`Bạn có chắc muốn xóa ${checkedBoxes.length} bài viết đã chọn?`)) return;

    let successCount = 0;
    for (let box of checkedBoxes) {
        const postId = box.dataset.id;
        try {
            await fetch(`/api/wp-posts/${postId}`, { method: 'DELETE' });
            successCount++;
        } catch (e) {}
    }
    
    alert(`✅ Đã xóa thành công ${successCount}/${checkedBoxes.length} bài viết!`);
    loadWPPosts();
}

function editWPPost(postId) {
    // Tạo modal chỉnh sửa đẹp
        const modal = document.createElement('div');
    modal.className = 'fixed';   // ← THÊM DÒNG NÀY
    modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.75); display:flex; align-items:center; justify-content:center; z-index:99999; padding:20px;';
    
    modal.innerHTML = `
        <div style="background:white; border-radius:24px; width:100%; max-width:900px; max-height:90vh; overflow:auto; box-shadow:0 25px 50px -12px rgb(0 0 0 / 0.4);">
            <div style="padding:24px 28px; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
                <h3 style="font-size:22px; font-weight:700; color:#0f172a; margin:0;">Chỉnh sửa bài viết</h3>
                <button onclick="this.closest('.fixed').remove()" style="background:#f1f5f9; border:none; width:36px; height:36px; border-radius:50%; font-size:20px; cursor:pointer;">×</button>
            </div>
            
            <div style="padding:28px;">
                <div style="margin-bottom:20px;">
                    <label style="display:block; font-weight:600; color:#334155; margin-bottom:8px;">Tiêu đề bài viết</label>
                    <input id="editTitle" type="text" style="width:100%; padding:14px 18px; border:2px solid #e2e8f0; border-radius:14px; font-size:16px;" placeholder="Nhập tiêu đề...">
                </div>
                
                <div>
                    <label style="display:block; font-weight:600; color:#334155; margin-bottom:8px;">Nội dung bài viết</label>
                    <textarea id="editContent" rows="18" style="width:100%; padding:18px; border:2px solid #e2e8f0; border-radius:14px; font-size:15px; line-height:1.6; resize:vertical;" placeholder="Nhập nội dung..."></textarea>
                </div>
            </div>
            
            <div style="padding:20px 28px; border-top:1px solid #e2e8f0; display:flex; gap:12px; justify-content:flex-end;">
                <button onclick="this.closest('.fixed').remove()" style="padding:12px 28px; background:#f1f5f9; color:#475569; border:none; border-radius:9999px; font-weight:600;">Hủy</button>
                <button id="saveEditBtn" style="padding:12px 28px; background:linear-gradient(90deg,#14b8a6,#0f766e); color:white; border:none; border-radius:9999px; font-weight:600;">Lưu thay đổi</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    const titleInput = modal.querySelector('#editTitle');
    const contentInput = modal.querySelector('#editContent');
    const saveBtn = modal.querySelector('#saveEditBtn');
    
    // Load dữ liệu bài viết hiện tại từ WordPress
    fetch(`/api/wp-posts`)
        .then(res => res.json())
        .then(posts => {
            const post = posts.find(p => p.id == postId);
            if (post) {
                titleInput.value = post.title.rendered || '';
                contentInput.value = post.content.rendered || '';
            }
        })
        .catch(err => {
            showToast('Không thể tải dữ liệu bài viết!', 'error');
        });
    
    // Xử lý khi bấm nút Lưu
    saveBtn.onclick = async () => {
        const newTitle = titleInput.value.trim();
        const newContent = contentInput.value.trim();
        
        if (!newTitle) {
            showToast('Tiêu đề không được để trống!', 'error');
            return;
        }
        
        saveBtn.innerHTML = 'Đang lưu...';
        saveBtn.disabled = true;
        
        try {
            const res = await fetch(`/api/wp-posts/${postId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: newTitle,
                    content: newContent
                })
            });
            
            const result = await res.json();
            
            if (result.success) {
                modal.remove();
                showToast('✅ Đã lưu thay đổi thành công!', 'success');
                loadWPPosts(); // Tải lại danh sách
            } else {
                showToast('❌ Lỗi khi lưu: ' + (result.message || ''), 'error');
                saveBtn.innerHTML = 'Lưu thay đổi';
                saveBtn.disabled = false;
            }
        } catch (e) {
            showToast('❌ Lỗi kết nối khi lưu bài viết!', 'error');
            saveBtn.innerHTML = 'Lưu thay đổi';
            saveBtn.disabled = false;
        }
    };
}

function createNewWPPost() {
    showSection(0);
}

function createNewWPPost() {
    showSection(0);
}

// ==================== GỢI Ý CHỦ ĐỀ BÀI VIẾT (ĐÃ SỬA) ====================
async function suggestTopics() {
    const category = document.getElementById('category')?.value || 'giai-phap';
    
    const modal = document.getElementById('suggestModal');
    const resultsDiv = document.getElementById('suggestResults');
    
    if (!modal || !resultsDiv) {
        alert('Modal gợi ý không tìm thấy!');
        return;
    }
    
    modal.classList.remove('hidden');
   // === PHẦN LOADING (thay đoạn cũ) ===
    resultsDiv.innerHTML = `
    <div class="flex flex-col items-center justify-center py-10 text-center">
        <i class="fas fa-spinner fa-spin text-teal-400 text-4xl mb-4"></i>
        <div class="text-lg font-medium text-white mb-1">AI đang phân tích và gợi ý chủ đề tối ưu...</div>
        <div class="text-sm text-slate-400">Vui lòng chờ trong giây lát</div>
    </div>
`;
    
    try {
        const res = await fetch('/api/suggest-topics', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category })
        });
        
        const data = await res.json();
        
        if (data.success && data.suggestions) {
            resultsDiv.innerHTML = '';
            
            // === THAY ĐOẠN NÀY ===
data.suggestions.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-2xl p-5 cursor-pointer transition text-white';
    div.innerHTML = `
        <div class="flex justify-between items-start">
            <div class="flex-1">
                <div class="font-semibold text-lg mb-2 text-white">${item.topic}</div>
                <div class="text-sm text-slate-300 mb-3">${item.reason}</div>
                <div class="flex items-center gap-2">
                    <span class="px-3 py-1 bg-teal-500/20 text-teal-400 text-xs rounded-full">${item.type}</span>
                    <span class="text-xs text-slate-400">Độ tối ưu: ${item.score}/10</span>
                </div>
            </div>
        </div>
    `;
                
                                div.onclick = () => {
                    document.getElementById('topic').value = item.topic;
                    closeSuggestModal();
                    
                    // Sử dụng modal confirm đẹp thay vì confirm cũ
                    setTimeout(() => {
                        showConfirm(
                            'Bạn có muốn tạo bài viết với chủ đề này ngay không?',
                            () => {
                                // Người dùng bấm Xác nhận
                                document.getElementById('createForm').dispatchEvent(new Event('submit'));
                            }
                        );
                    }, 300);
                };
                
                resultsDiv.appendChild(div);
                
                resultsDiv.appendChild(div);
            });
        }
    } catch (e) {
       resultsDiv.innerHTML = `<div class="text-red-400 py-8 text-center">Lỗi khi gợi ý chủ đề. Vui lòng thử lại.</div>`;
    }
}

function closeSuggestModal() {
    const modal = document.getElementById('suggestModal');
    if (modal) modal.classList.add('hidden');
}

// ==================== KHỞI ĐỘNG ====================
window.onload = function() {
    showSection(0); // Mặc định mở tab Tạo bài viết
    
    // Load API keys từ localStorage
    const saved = localStorage.getItem('apiKeys');
    if (saved) {
        const keys = JSON.parse(saved);
        if (document.getElementById('deepseekKey')) document.getElementById('deepseekKey').value = keys.deepseek || '';
        if (document.getElementById('pexelsKey')) document.getElementById('pexelsKey').value = keys.pexels || '';
        if (document.getElementById('wpDomain')) document.getElementById('wpDomain').value = keys.wpDomain || 'https://thinksmart.vn';
        if (document.getElementById(' wpPassword')) document.getElementById('wpPassword').value = keys.wpPassword || '';
    }
    
    // Load categories
    loadWPCategories();
    
    console.log('✅ QTPoster Pro initialized successfully!');
};