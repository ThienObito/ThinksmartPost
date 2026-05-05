const axios = require('axios');
require('dotenv').config();

const WP_URL = process.env.WP_URL || 'https://thinksmart.vn';

console.log('🚀 BẮT ĐẦU TEST FULL HỆ THỐNG\n');

async function testAll() {
    let passed = 0;
    let failed = 0;

    // 1. Test chuyên mục WordPress
    console.log('1. Test lấy chuyên mục từ WordPress...');
    try {
        const res = await axios.get(`${WP_URL}/wp-json/wp/v2/categories?per_page=10`, { timeout: 5000 });
        console.log(`   ✅ Thành công! Tìm thấy ${res.data.length} chuyên mục`);
        passed++;
    } catch (e) {
        console.log('   ❌ Lỗi:', e.message);
        failed++;
    }

    // 2. Test tạo bài viết (với timeout 30 giây)
    console.log('\n2. Test tạo bài viết bằng DeepSeek...');
    try {
        const res = await axios.post('http://localhost:3001/api/create-article', {
            topics: ['Test tự động - In 3D linh kiện ô tô'],
            category: 'giai-phap',
            style: 'Professional'
        }, { timeout: 30000 }); // Timeout 30 giây
        
        if (res.data.success) {
            console.log('   ✅ Tạo bài viết thành công!');
            passed++;
        } else {
            console.log('   ❌ Lỗi:', res.data.message || 'Không rõ');
            failed++;
        }
    } catch (e) {
        if (e.code === 'ECONNREFUSED') {
            console.log('   ❌ Lỗi: Server chưa chạy! Hãy chạy `npm run dev` trước');
        } else {
            console.log('   ❌ Lỗi:', e.message);
        }
        failed++;
    }

    // 3. Test bài viết WordPress
    console.log('\n3. Test lấy bài viết từ WordPress...');
    try {
        const res = await axios.get(`${WP_URL}/wp-json/wp/v2/posts?per_page=5`, { timeout: 5000 });
        console.log(`   ✅ Thành công! Tìm thấy ${res.data.length} bài viết`);
        passed++;
    } catch (e) {
        console.log('   ❌ Lỗi:', e.message);
        failed++;
    }

    console.log('\n====================');
    console.log(`✅ Test thành công: ${passed}`);
    console.log(`❌ Test thất bại: ${failed}`);
    console.log('====================\n');
}

testAll();